package main

// The shop. Items are what may be locked: "car:<id>", "instructor:rude", and "all" (everything, the tariff).
// The admin decides, in one place (setting "shop"): whether selling is on at all (off: everything is free),
// which items are paid, and the products on sale, each a set of items for a price and a time (days, 0 = for
// good): one product per item, and bundles such as "all". Promo codes take a share, a sum or the whole price off.
// What a user owns is kept in purchases, filled by a paid order or by the admin.

import (
	"context"
	"errors"
	"log"
	"net/http"
	"regexp"
	"slices"
	"strconv"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
)

var itemRe = regexp.MustCompile(`^(all|instructor:rude|car:[a-z0-9-]{1,40})$`)
var productRe = regexp.MustCompile(`^[a-z0-9:_-]{1,48}$`)
var promoRe = regexp.MustCompile(`^[A-Z0-9_-]{3,32}$`)

const minAmount = 1000 // inPAY takes no less (so'm)

type Product struct {
	ID    string   `json:"id"`
	Name  string   `json:"name"`
	Items []string `json:"items"`
	Price int      `json:"price"` // so'm
	Days  int      `json:"days"`  // 0: for good
	On    bool     `json:"on"`
}

type ShopSettings struct {
	Enabled  bool      `json:"enabled"`
	Paid     []string  `json:"paid"`
	Products []Product `json:"products"`
}

// before the admin has saved anything: selling on, the five newer cars and the 18+ instructor paid, nothing
// priced yet (a product without a price is not offered)
func defaultShop() ShopSettings {
	paid := []string{"car:malibu-premier", "car:malibu-2019", "car:kia-k5", "car:passat-2022", "car:passat-pro", "instructor:rude"}
	s := ShopSettings{Enabled: true, Paid: paid}
	for _, it := range paid {
		s.Products = append(s.Products, Product{ID: it, Name: it, Items: []string{it}, On: true})
	}
	s.Products = append(s.Products, Product{ID: "all", Name: "Hammasi", Items: []string{"all"}, Days: 30})
	return s
}

func (a *App) shop(ctx context.Context) (ShopSettings, error) {
	s := defaultShop()
	set, err := a.db.getSetting(ctx, "shop", &s)
	if err == nil && !set {
		s = defaultShop()
	}
	return s, err
}

func (s ShopSettings) product(id string) *Product {
	for i := range s.Products {
		if s.Products[i].ID == id && s.Products[i].On && s.Products[i].Price >= minAmount {
			return &s.Products[i]
		}
	}
	return nil
}

// ---- what a user owns

// withOwns fills u.Owns with the items in force now
func (a *App) withOwns(r *http.Request, u *User) *User {
	if u == nil {
		return u
	}
	u.Owns = []string{}
	rows, err := a.db.Query(r.Context(), "SELECT item FROM purchases WHERE user_id = $1 AND (until IS NULL OR until > $2) ORDER BY item", u.ID, time.Now().UnixMilli())
	if err != nil {
		return u
	}
	defer rows.Close()
	for rows.Next() {
		var it string
		if rows.Scan(&it) == nil {
			u.Owns = append(u.Owns, it)
		}
	}
	return u
}

type Purchase struct {
	Item    string `json:"item"`
	Until   *int64 `json:"until"`
	Source  string `json:"source"`
	Created int64  `json:"created"`
}

func (a *App) purchasesOf(r *http.Request, id int) ([]Purchase, error) {
	rows, err := a.db.Query(r.Context(), "SELECT item, until, source, created FROM purchases WHERE user_id = $1 ORDER BY created DESC", id)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []Purchase{}
	for rows.Next() {
		var p Purchase
		if err := rows.Scan(&p.Item, &p.Until, &p.Source, &p.Created); err != nil {
			return nil, err
		}
		out = append(out, p)
	}
	return out, rows.Err()
}

// grant gives items for days (0: for good). Time bought again is added to what is left; for good stays for good.
func grant(ctx context.Context, tx pgx.Tx, user int, items []string, days int, source string) error {
	now := time.Now().UnixMilli()
	for _, it := range items {
		var cur *int64
		found := true
		if err := tx.QueryRow(ctx, "SELECT until FROM purchases WHERE user_id = $1 AND item = $2 FOR UPDATE", user, it).Scan(&cur); errors.Is(err, pgx.ErrNoRows) {
			found = false
		} else if err != nil {
			return err
		}
		var until *int64
		if days > 0 && !(found && cur == nil) {
			base := now
			if found && *cur > now {
				base = *cur
			}
			t := base + int64(days)*86400000
			until = &t
		}
		if _, err := tx.Exec(ctx, `INSERT INTO purchases (user_id, item, until, source, created) VALUES ($1, $2, $3, $4, $5)
			ON CONFLICT (user_id, item) DO UPDATE SET until = excluded.until, source = excluded.source, created = excluded.created`, user, it, until, source, now); err != nil {
			return err
		}
	}
	return nil
}

// ---- prices and promo codes

type Promo struct {
	Code     string   `json:"code"`
	Kind     string   `json:"kind"` // percent, amount, free
	Value    int      `json:"value"`
	Products []string `json:"products"`
	MaxUses  int      `json:"maxUses"`
	Used     int      `json:"used"`
	Until    *int64   `json:"until"`
	Active   bool     `json:"active"`
	Created  int64    `json:"created"`
}

const promoCols = "code, kind, value, products, max_uses, used, until, active, created"

func scanPromo(row pgx.Row) (*Promo, error) {
	p := &Promo{}
	err := row.Scan(&p.Code, &p.Kind, &p.Value, &p.Products, &p.MaxUses, &p.Used, &p.Until, &p.Active, &p.Created)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, nil
	}
	return p, err
}

type quote struct {
	Product  *Product `json:"product"`
	Price    int      `json:"price"`
	Discount int      `json:"discount"`
	Total    int      `json:"total"`
	Promo    string   `json:"promo"`
}

var errPromo = errors.New("promo")

// price works out what the user pays for a product with a promo code; a code that does not apply is an error
// with the reason (in Uzbek, shown to the buyer)
func (a *App) price(ctx context.Context, s ShopSettings, user int, productID, code string) (*quote, string, error) {
	p := s.product(productID)
	if p == nil {
		return nil, "Bu mahsulot sotuvda yo'q", errPromo
	}
	q := &quote{Product: p, Price: p.Price, Total: p.Price}
	code = strings.ToUpper(strings.TrimSpace(code))
	if code == "" {
		return q, "", nil
	}
	pr, err := scanPromo(a.db.QueryRow(ctx, "SELECT "+promoCols+" FROM promos WHERE code = $1", code))
	if err != nil {
		return nil, "", err
	}
	now := time.Now().UnixMilli()
	switch {
	case pr == nil || !pr.Active:
		return nil, "Bunday promokod yo'q", errPromo
	case pr.Until != nil && *pr.Until < now:
		return nil, "Promokod muddati tugagan", errPromo
	case pr.MaxUses > 0 && pr.Used >= pr.MaxUses:
		return nil, "Promokod tugagan", errPromo
	case len(pr.Products) > 0 && !slices.Contains(pr.Products, p.ID):
		return nil, "Promokod bu mahsulotga tegishli emas", errPromo
	}
	var used bool
	if err := a.db.QueryRow(ctx, "SELECT EXISTS (SELECT 1 FROM promo_uses WHERE code = $1 AND user_id = $2)", code, user).Scan(&used); err != nil {
		return nil, "", err
	}
	if used {
		return nil, "Bu promokoddan foydalangansiz", errPromo
	}
	switch pr.Kind {
	case "percent":
		q.Discount = p.Price * min(100, max(0, pr.Value)) / 100
	case "amount":
		q.Discount = min(p.Price, max(0, pr.Value))
	case "free":
		q.Discount = p.Price
	}
	q.Total = p.Price - q.Discount
	if q.Total > 0 && q.Total < minAmount { // inPAY's least
		q.Total, q.Discount = minAmount, p.Price-minAmount
	}
	q.Promo = code
	return q, "", nil
}

// ---- public

// GET /api/shop: whether selling is on, the paid items, the products on sale, whether payment works yet
func (a *App) handleShop(w http.ResponseWriter, r *http.Request) {
	s, err := a.shop(r.Context())
	if err != nil {
		serverError(w, r, err)
		return
	}
	on := []Product{}
	for _, p := range s.Products {
		if p.On && p.Price >= minAmount {
			on = append(on, p)
		}
	}
	paid := s.Paid
	if !s.Enabled || paid == nil {
		paid = []string{}
	}
	writeJSON(w, 200, map[string]any{"enabled": s.Enabled, "paid": paid, "products": on, "payments": a.inpay.on()})
}

// POST /api/shop/quote { product, promo }
func (a *App) handleQuote(w http.ResponseWriter, r *http.Request) {
	var body struct{ Product, Promo string }
	if !readJSON(w, r, &body) {
		return
	}
	s, err := a.shop(r.Context())
	if err != nil {
		serverError(w, r, err)
		return
	}
	q, why, err := a.price(r.Context(), s, userFrom(r).ID, body.Product, body.Promo)
	if errors.Is(err, errPromo) {
		fail(w, 400, why)
		return
	} else if err != nil {
		serverError(w, r, err)
		return
	}
	writeJSON(w, 200, q)
}

// POST /api/shop/buy { product, promo }: free with the code: given at once ({ done }); else an order and inPAY's
// payment page ({ order, payUrl })
func (a *App) handleBuy(w http.ResponseWriter, r *http.Request) {
	ctx, u := r.Context(), userFrom(r)
	var body struct{ Product, Promo string }
	if !readJSON(w, r, &body) {
		return
	}
	s, err := a.shop(ctx)
	if err != nil {
		serverError(w, r, err)
		return
	}
	if !s.Enabled {
		fail(w, 400, "Hozir hamma narsa bepul")
		return
	}
	q, why, err := a.price(ctx, s, u.ID, body.Product, body.Promo)
	if errors.Is(err, errPromo) {
		fail(w, 400, why)
		return
	} else if err != nil {
		serverError(w, r, err)
		return
	}
	if q.Total > 0 && !a.inpay.on() {
		fail(w, 503, "Onlayn to'lov hali ulanmagan")
		return
	}
	var id int
	err = a.db.QueryRow(ctx, `INSERT INTO orders (user_id, product, name, items, days, price, amount, promo, status, created)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'pending', $9) RETURNING id`,
		u.ID, q.Product.ID, q.Product.Name, q.Product.Items, q.Product.Days, q.Price, q.Total, q.Promo, time.Now().UnixMilli()).Scan(&id)
	if err != nil {
		serverError(w, r, err)
		return
	}
	if q.Total == 0 {
		if _, err := a.fulfil(ctx, id); err != nil {
			serverError(w, r, err)
			return
		}
		writeJSON(w, 200, map[string]any{"done": true, "order": id, "user": a.withOwns(r, u)})
		return
	}
	base := a.publicURL(r)
	pay, err := a.inpay.create(ctx, q.Total, "Avtodrom simulyatori: "+q.Product.Name, base+"/api/shop/inpay", base+"/?order="+strconv.Itoa(id), a.clientIP(r))
	if err != nil {
		log.Print(err)
		a.db.Exec(ctx, "UPDATE orders SET status = 'failed' WHERE id = $1", id)
		fail(w, 502, "To'lov tizimi javob bermadi, keyinroq urinib ko'ring")
		return
	}
	a.db.Exec(ctx, "UPDATE orders SET inpay_order = $1, pay_url = $2 WHERE id = $3", pay.OrderID, pay.PayURL, id)
	writeJSON(w, 200, map[string]any{"order": id, "payUrl": pay.PayURL})
}

// fulfil marks an order paid and gives its items, once (a second call does nothing); the promo code is spent here
func (a *App) fulfil(ctx context.Context, id int) (bool, error) {
	tx, err := a.db.Begin(ctx)
	if err != nil {
		return false, err
	}
	defer tx.Rollback(ctx)
	var user, days int
	var items []string
	var promo string
	err = tx.QueryRow(ctx, "UPDATE orders SET status = 'paid', paid_at = $2 WHERE id = $1 AND status <> 'paid' RETURNING user_id, items, days, promo", id, time.Now().UnixMilli()).Scan(&user, &items, &days, &promo)
	if errors.Is(err, pgx.ErrNoRows) {
		return false, nil
	} else if err != nil {
		return false, err
	}
	if err := grant(ctx, tx, user, items, days, "order:"+strconv.Itoa(id)); err != nil {
		return false, err
	}
	if promo != "" {
		tag, err := tx.Exec(ctx, "INSERT INTO promo_uses (code, user_id, at) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING", promo, user, time.Now().UnixMilli())
		if err != nil {
			return false, err
		}
		if tag.RowsAffected() > 0 {
			tx.Exec(ctx, "UPDATE promos SET used = used + 1 WHERE code = $1", promo)
		}
	}
	return true, tx.Commit(ctx)
}

// settle asks inPAY about an order still pending and acts on its answer: paid in full, or failed / cancelled
func (a *App) settle(ctx context.Context, id int, inpayOrder string, amount int) (string, error) {
	st, paid, err := a.inpay.status(ctx, inpayOrder)
	if err != nil {
		return "", err
	}
	switch st {
	case "success", "paid", "completed":
		if paid+0.5 < float64(amount) {
			log.Printf("order %d: inPAY says %v paid, %d asked", id, paid, amount)
			return "pending", nil
		}
		if _, err := a.fulfil(ctx, id); err != nil {
			return "", err
		}
		return "paid", nil
	case "failed", "cancelled", "canceled":
		a.db.Exec(ctx, "UPDATE orders SET status = $2 WHERE id = $1 AND status = 'pending'", id, strings.Replace(st, "canceled", "cancelled", 1))
		return st, nil
	}
	return "pending", nil
}

// POST /api/shop/inpay: inPAY's callback. Its body is not signed: only its order id is read, and the order is
// settled on what inPAY's own record says. Always 200 (inPAY repeats otherwise); an unknown order is ignored.
func (a *App) handleInpayWebhook(w http.ResponseWriter, r *http.Request) {
	var body map[string]any
	if !readJSON(w, r, &body) {
		return
	}
	oid := str(field(body, "order_id"))
	var id, amount int
	var status string
	err := a.db.QueryRow(r.Context(), "SELECT id, amount, status FROM orders WHERE inpay_order = $1", oid).Scan(&id, &amount, &status)
	if err == nil && status == "pending" {
		if _, err := a.settle(r.Context(), id, oid, amount); err != nil {
			log.Print(err)
		}
	}
	writeJSON(w, 200, map[string]bool{"ok": true})
}

// GET /api/shop/orders/{id}: the buyer's own order, settled with inPAY if it is still pending (the return page asks)
func (a *App) handleOrder(w http.ResponseWriter, r *http.Request) {
	u := userFrom(r)
	id, _ := strconv.Atoi(r.PathValue("id"))
	var status, name string
	var amount int
	var inpayOrder *string
	err := a.db.QueryRow(r.Context(), "SELECT status, name, amount, inpay_order FROM orders WHERE id = $1 AND user_id = $2", id, u.ID).Scan(&status, &name, &amount, &inpayOrder)
	if errors.Is(err, pgx.ErrNoRows) {
		fail(w, 404, "not found")
		return
	} else if err != nil {
		serverError(w, r, err)
		return
	}
	if status == "pending" && inpayOrder != nil && a.inpay.on() {
		if st, err := a.settle(r.Context(), id, *inpayOrder, amount); err == nil {
			status = st
		} else {
			log.Print(err)
		}
	}
	writeJSON(w, 200, map[string]any{"status": status, "name": name, "amount": amount, "user": a.withOwns(r, u)})
}

// ---- admin

func (a *App) handleGetShop(w http.ResponseWriter, r *http.Request) {
	s, err := a.shop(r.Context())
	if err != nil {
		serverError(w, r, err)
		return
	}
	writeJSON(w, 200, map[string]any{"shop": s, "payments": a.inpay.on()})
}

func (a *App) handlePutShop(w http.ResponseWriter, r *http.Request) {
	var s ShopSettings
	if !readJSON(w, r, &s) {
		return
	}
	paid := []string{}
	for _, it := range s.Paid {
		if itemRe.MatchString(it) && it != "all" && !slices.Contains(paid, it) {
			paid = append(paid, it)
		}
	}
	s.Paid = paid
	seen := map[string]bool{}
	out := []Product{}
	for _, p := range s.Products {
		p.Name = trim(p.Name, 80)
		if !productRe.MatchString(p.ID) || seen[p.ID] || p.Name == "" || p.Price < 0 || p.Price > 100_000_000 || p.Days < 0 || p.Days > 3660 || len(p.Items) == 0 {
			fail(w, 400, "bad product "+p.ID)
			return
		}
		for _, it := range p.Items {
			if !itemRe.MatchString(it) {
				fail(w, 400, "bad item "+it)
				return
			}
		}
		if p.Price > 0 && p.Price < minAmount {
			fail(w, 400, "narx kamida 1000 so'm")
			return
		}
		seen[p.ID] = true
		out = append(out, p)
	}
	s.Products = out
	if err := a.db.setSetting(r.Context(), "shop", s); err != nil {
		serverError(w, r, err)
		return
	}
	writeJSON(w, 200, map[string]any{"shop": s, "payments": a.inpay.on()})
}

func (a *App) handleGetPromos(w http.ResponseWriter, r *http.Request) {
	rows, err := a.db.Query(r.Context(), "SELECT "+promoCols+" FROM promos ORDER BY created DESC")
	if err != nil {
		serverError(w, r, err)
		return
	}
	defer rows.Close()
	list := []*Promo{}
	for rows.Next() {
		p, err := scanPromo(rows)
		if err != nil {
			serverError(w, r, err)
			return
		}
		list = append(list, p)
	}
	writeJSON(w, 200, map[string]any{"items": list})
}

// POST /api/admin/promos: makes or changes a code (its use count stays)
func (a *App) handlePutPromo(w http.ResponseWriter, r *http.Request) {
	var p Promo
	if !readJSON(w, r, &p) {
		return
	}
	p.Code = strings.ToUpper(strings.TrimSpace(p.Code))
	if !promoRe.MatchString(p.Code) || (p.Kind != "percent" && p.Kind != "amount" && p.Kind != "free") ||
		(p.Kind == "percent" && (p.Value < 1 || p.Value > 100)) || (p.Kind == "amount" && (p.Value < 1 || p.Value > 100_000_000)) || p.MaxUses < 0 {
		fail(w, 400, "bad promo")
		return
	}
	if p.Products == nil {
		p.Products = []string{}
	}
	for _, id := range p.Products {
		if !productRe.MatchString(id) {
			fail(w, 400, "bad product "+id)
			return
		}
	}
	_, err := a.db.Exec(r.Context(), `INSERT INTO promos (code, kind, value, products, max_uses, until, active, created) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
		ON CONFLICT (code) DO UPDATE SET kind = excluded.kind, value = excluded.value, products = excluded.products, max_uses = excluded.max_uses, until = excluded.until, active = excluded.active`,
		p.Code, p.Kind, p.Value, p.Products, p.MaxUses, p.Until, p.Active, time.Now().UnixMilli())
	if err != nil {
		serverError(w, r, err)
		return
	}
	a.handleGetPromos(w, r)
}

func (a *App) handleDeletePromo(w http.ResponseWriter, r *http.Request) {
	if _, err := a.db.Exec(r.Context(), "DELETE FROM promos WHERE code = $1", strings.ToUpper(r.PathValue("code"))); err != nil {
		serverError(w, r, err)
		return
	}
	a.handleGetPromos(w, r)
}

// GET /api/admin/orders: the latest 300, with the buyer, and the money taken
func (a *App) handleOrders(w http.ResponseWriter, r *http.Request) {
	rows, err := a.db.Query(r.Context(), `SELECT o.id, o.user_id, u.name, o.product, o.name, o.amount, o.price, o.promo, o.status, o.created, o.paid_at
		FROM orders o JOIN users u ON u.id = o.user_id ORDER BY o.id DESC LIMIT 300`)
	if err != nil {
		serverError(w, r, err)
		return
	}
	defer rows.Close()
	list := []map[string]any{}
	for rows.Next() {
		var id, uid, amount, price int
		var uname, product, name, promo, status string
		var created int64
		var paidAt *int64
		if err := rows.Scan(&id, &uid, &uname, &product, &name, &amount, &price, &promo, &status, &created, &paidAt); err != nil {
			serverError(w, r, err)
			return
		}
		list = append(list, map[string]any{"id": id, "user": uid, "userName": uname, "product": product, "name": name, "amount": amount, "price": price, "promo": promo, "status": status, "created": created, "paidAt": paidAt})
	}
	var total, count int
	a.db.QueryRow(r.Context(), "SELECT COALESCE(SUM(amount), 0), COUNT(*) FROM orders WHERE status = 'paid'").Scan(&total, &count)
	writeJSON(w, 200, map[string]any{"items": list, "paidTotal": total, "paidCount": count})
}

// ---- admin: give and take back by hand

// POST /api/admin/users/{id}/grant { item, days }: days 0 or missing = for good; granting again replaces the end
func (a *App) handleGrant(w http.ResponseWriter, r *http.Request) {
	u := a.pathUser(w, r)
	if u == nil {
		return
	}
	var body struct {
		Item string `json:"item"`
		Days int    `json:"days"`
	}
	if !readJSON(w, r, &body) {
		return
	}
	if !itemRe.MatchString(body.Item) || body.Days < 0 || body.Days > 3660 {
		fail(w, 400, "bad item or days")
		return
	}
	now := time.Now().UnixMilli()
	var until *int64
	if body.Days > 0 {
		t := now + int64(body.Days)*86400000
		until = &t
	}
	if _, err := a.db.Exec(r.Context(), `INSERT INTO purchases (user_id, item, until, source, created) VALUES ($1, $2, $3, 'admin', $4)
		ON CONFLICT (user_id, item) DO UPDATE SET until = excluded.until, source = excluded.source, created = excluded.created`, u.ID, body.Item, until, now); err != nil {
		serverError(w, r, err)
		return
	}
	a.writeUserPurchases(w, r, u)
}

// DELETE /api/admin/users/{id}/grant/{item}
func (a *App) handleRevoke(w http.ResponseWriter, r *http.Request) {
	u := a.pathUser(w, r)
	if u == nil {
		return
	}
	item := r.PathValue("item")
	if !itemRe.MatchString(item) {
		fail(w, 400, "bad item")
		return
	}
	if _, err := a.db.Exec(r.Context(), "DELETE FROM purchases WHERE user_id = $1 AND item = $2", u.ID, item); err != nil {
		serverError(w, r, err)
		return
	}
	a.writeUserPurchases(w, r, u)
}

func (a *App) writeUserPurchases(w http.ResponseWriter, r *http.Request, u *User) {
	list, err := a.purchasesOf(r, u.ID)
	if err != nil {
		serverError(w, r, err)
		return
	}
	writeJSON(w, 200, map[string]any{"user": a.withOwns(r, u), "purchases": list})
}
