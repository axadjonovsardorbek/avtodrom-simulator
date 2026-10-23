package main

// More for the admin panel: a log of what the admins changed, the site switches (maintenance, a banner
// over the menu), the money (per day, product and promo code) and CSV downloads of the tables.

import (
	"bytes"
	"context"
	"encoding/csv"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strconv"
	"strings"
	"time"
)

const schemaExt = `
CREATE TABLE IF NOT EXISTS audit (
  id SERIAL PRIMARY KEY,
  at BIGINT NOT NULL,
  admin_id INTEGER,
  admin_name TEXT NOT NULL DEFAULT '',
  action TEXT NOT NULL,                  -- "PUT /api/admin/shop"
  detail TEXT NOT NULL DEFAULT ''        -- the request body, cut short
);
CREATE INDEX IF NOT EXISTS audit_at ON audit (at);
`

func (db *DB) migrateExt(ctx context.Context) error {
	if _, err := db.Exec(ctx, schemaExt); err != nil {
		return err
	}
	_, err := db.Exec(ctx, schemaAdmins)
	return err
}

// ---- the log

type statusWriter struct {
	http.ResponseWriter
	status int
}

func (s *statusWriter) WriteHeader(c int) { s.status = c; s.ResponseWriter.WriteHeader(c) }

// logged: an admin handler whose successful calls are written to the log (with the body, not for uploads)
func (a *App) logged(h http.HandlerFunc) http.HandlerFunc {
	return a.admin(func(w http.ResponseWriter, r *http.Request) {
		var body []byte
		if !strings.HasPrefix(r.Header.Get("Content-Type"), "multipart/") && r.Body != nil {
			body, _ = io.ReadAll(io.LimitReader(r.Body, 1<<20))
			r.Body = io.NopCloser(bytes.NewReader(body))
		}
		sw := &statusWriter{ResponseWriter: w, status: 200}
		h(sw, r)
		if sw.status >= 400 {
			return
		}
		detail := redact(body)
		if detail == "" && r.MultipartForm != nil {
			detail = "(fayl yuklandi)"
		}
		if len(detail) > 2000 {
			detail = detail[:2000] + "…"
		}
		me := adminFrom(r)
		var id *int
		name := ""
		if me != nil {
			id, name = &me.ID, me.Name
			if name == "" {
				name = me.Login
			}
		}
		a.db.Exec(context.Background(), "INSERT INTO audit (at, admin_id, admin_name, action, detail) VALUES ($1, $2, $3, $4, $5)",
			time.Now().UnixMilli(), id, name, r.Method+" "+r.URL.Path, detail)
	})
}

// GET /api/admin/audit?offset=
func (a *App) handleAudit(w http.ResponseWriter, r *http.Request) {
	off, _ := strconv.Atoi(r.URL.Query().Get("offset"))
	rows, err := a.db.Query(r.Context(), "SELECT id, at, COALESCE(admin_id, 0), admin_name, action, detail FROM audit ORDER BY id DESC LIMIT 100 OFFSET $1", max(0, off))
	if err != nil {
		serverError(w, r, err)
		return
	}
	defer rows.Close()
	list := []map[string]any{}
	for rows.Next() {
		var id, aid int
		var at int64
		var name, action, detail string
		if err := rows.Scan(&id, &at, &aid, &name, &action, &detail); err != nil {
			serverError(w, r, err)
			return
		}
		list = append(list, map[string]any{"id": id, "at": at, "adminId": aid, "admin": name, "action": action, "detail": detail})
	}
	writeJSON(w, 200, map[string]any{"items": list})
}

// ---- site switches

type SiteSettings struct {
	Maintenance     bool   `json:"maintenance"`     // the game shows a notice instead of the menu (admins still play)
	MaintenanceText string `json:"maintenanceText"` //
	Banner          string `json:"banner"`          // a line over the menu; empty = none
	BannerKind      string `json:"bannerKind"`      // info, warn, promo
	BannerUntil     *int64 `json:"bannerUntil"`     // ms; nil = until removed
}

func (a *App) site(ctx context.Context) (SiteSettings, error) {
	var s SiteSettings
	_, err := a.db.getSetting(ctx, "site", &s)
	return s, err
}

func (a *App) handleGetSite(w http.ResponseWriter, r *http.Request) {
	s, err := a.site(r.Context())
	if err != nil {
		serverError(w, r, err)
		return
	}
	writeJSON(w, 200, map[string]any{"site": s})
}

func (a *App) handlePutSite(w http.ResponseWriter, r *http.Request) {
	var s SiteSettings
	if !readJSON(w, r, &s) {
		return
	}
	s.Banner = strings.TrimSpace(s.Banner)
	s.MaintenanceText = strings.TrimSpace(s.MaintenanceText)
	if len([]rune(s.Banner)) > 300 || len([]rune(s.MaintenanceText)) > 500 {
		fail(w, 400, "text too long")
		return
	}
	if s.BannerKind != "warn" && s.BannerKind != "promo" {
		s.BannerKind = "info"
	}
	if err := a.db.setSetting(r.Context(), "site", s); err != nil {
		serverError(w, r, err)
		return
	}
	writeJSON(w, 200, map[string]any{"site": s})
}

// what the game is told (in /api/config): the banner only while it is in force
func (s SiteSettings) public(now int64) map[string]any {
	out := map[string]any{"maintenance": s.Maintenance, "maintenanceText": s.MaintenanceText}
	if s.Banner != "" && (s.BannerUntil == nil || *s.BannerUntil > now) {
		out["banner"] = s.Banner
		out["bannerKind"] = s.BannerKind
	}
	return out
}

// ---- money

// GET /api/admin/revenue?days=30: paid totals (today, 7 and 30 days, all), per day, per product and promo code,
// the orders by status, the average purchase and how many started payments were finished
func (a *App) handleRevenue(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	days, _ := strconv.Atoi(r.URL.Query().Get("days"))
	if days < 1 || days > 365 {
		days = 30
	}
	loc := tashkent()
	now := time.Now().In(loc)
	midnight := time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, loc)
	since := midnight.AddDate(0, 0, -(days - 1)).UnixMilli()
	sum := func(from int64) (n, c int) {
		a.db.QueryRow(ctx, "SELECT COALESCE(SUM(amount), 0), COUNT(*) FROM orders WHERE status = 'paid' AND paid_at >= $1", from).Scan(&n, &c)
		return
	}
	tN, tC := sum(midnight.UnixMilli())
	wN, wC := sum(midnight.AddDate(0, 0, -6).UnixMilli())
	mN, mC := sum(midnight.AddDate(0, 0, -29).UnixMilli())
	aN, aC := sum(0)
	buyers := 0
	a.db.QueryRow(ctx, "SELECT COUNT(DISTINCT user_id) FROM orders WHERE status = 'paid'").Scan(&buyers)

	daily := make([]map[string]any, days)
	for i := range daily {
		daily[i] = map[string]any{"day": midnight.AddDate(0, 0, -(days - 1 - i)).Format("2006-01-02"), "sum": 0, "count": 0}
	}
	rows, err := a.db.Query(ctx, "SELECT paid_at, amount FROM orders WHERE status = 'paid' AND paid_at >= $1", since)
	if err != nil {
		serverError(w, r, err)
		return
	}
	for rows.Next() {
		var at int64
		var amount int
		if rows.Scan(&at, &amount) != nil {
			continue
		}
		i := int(time.UnixMilli(at).In(loc).Sub(midnight.AddDate(0, 0, -(days-1))).Hours() / 24)
		if i >= 0 && i < days {
			daily[i]["sum"] = daily[i]["sum"].(int) + amount
			daily[i]["count"] = daily[i]["count"].(int) + 1
		}
	}
	rows.Close()

	group := func(q string) []map[string]any {
		out := []map[string]any{}
		rs, err := a.db.Query(ctx, q, since)
		if err != nil {
			return out
		}
		defer rs.Close()
		for rs.Next() {
			var k string
			var n, c int
			if rs.Scan(&k, &n, &c) == nil {
				out = append(out, map[string]any{"key": k, "sum": n, "count": c})
			}
		}
		return out
	}
	products := group("SELECT name, SUM(amount), COUNT(*) FROM orders WHERE status = 'paid' AND paid_at >= $1 GROUP BY name ORDER BY 2 DESC")
	promos := group("SELECT promo, SUM(price - amount), COUNT(*) FROM orders WHERE status = 'paid' AND promo <> '' AND paid_at >= $1 GROUP BY promo ORDER BY 3 DESC")
	status := group("SELECT status, COALESCE(SUM(amount), 0), COUNT(*) FROM orders WHERE created >= $1 GROUP BY status")

	writeJSON(w, 200, map[string]any{
		"today": map[string]int{"sum": tN, "count": tC}, "week": map[string]int{"sum": wN, "count": wC},
		"month": map[string]int{"sum": mN, "count": mC}, "all": map[string]int{"sum": aN, "count": aC},
		"buyers": buyers, "daily": daily, "products": products, "promos": promos, "status": status,
	})
}

func tashkent() *time.Location {
	if l, err := time.LoadLocation("Asia/Tashkent"); err == nil {
		return l
	}
	return time.FixedZone("UZT", 5*3600)
}

// GET /api/admin/orders2?status=&q=&offset=: the orders, filtered and in pages
func (a *App) handleOrderList(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query()
	off, _ := strconv.Atoi(q.Get("offset"))
	args := []any{}
	where := []string{"TRUE"}
	if st := q.Get("status"); st != "" {
		args = append(args, st)
		where = append(where, fmt.Sprintf("o.status = $%d", len(args)))
	}
	if s := strings.TrimSpace(q.Get("q")); s != "" {
		args = append(args, "%"+strings.ToLower(s)+"%")
		where = append(where, fmt.Sprintf("(LOWER(u.name) LIKE $%[1]d OR LOWER(o.promo) LIKE $%[1]d OR LOWER(o.name) LIKE $%[1]d OR o.id::text LIKE $%[1]d)", len(args)))
	}
	args = append(args, max(0, off))
	rows, err := a.db.Query(r.Context(), `SELECT o.id, o.user_id, u.name, o.product, o.name, o.amount, o.price, o.promo, o.status, o.created, o.paid_at
		FROM orders o JOIN users u ON u.id = o.user_id WHERE `+strings.Join(where, " AND ")+fmt.Sprintf(" ORDER BY o.id DESC LIMIT 100 OFFSET $%d", len(args)), args...)
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
	writeJSON(w, 200, map[string]any{"items": list})
}

// ---- downloads

// GET /api/admin/export/{what}: users, attempts or orders as CSV (opens in Excel: BOM, ";" separated)
func (a *App) handleExport(w http.ResponseWriter, r *http.Request) {
	queries := map[string]string{
		"users":    "SELECT id, provider, name, username, email, phone, to_char(to_timestamp(created/1000) AT TIME ZONE 'Asia/Tashkent', 'YYYY-MM-DD HH24:MI'), to_char(to_timestamp(seen/1000) AT TIME ZONE 'Asia/Tashkent', 'YYYY-MM-DD HH24:MI'), blocked FROM users ORDER BY id",
		"attempts": "SELECT a.id, a.user_id, u.name, a.key, a.passed, a.total, a.t, a.car, to_char(to_timestamp(a.at/1000) AT TIME ZONE 'Asia/Tashkent', 'YYYY-MM-DD HH24:MI') FROM attempts a JOIN users u ON u.id = a.user_id ORDER BY a.id",
		"orders":   "SELECT o.id, o.user_id, u.name, o.name, o.price, o.amount, o.promo, o.status, to_char(to_timestamp(o.created/1000) AT TIME ZONE 'Asia/Tashkent', 'YYYY-MM-DD HH24:MI'), COALESCE(to_char(to_timestamp(o.paid_at/1000) AT TIME ZONE 'Asia/Tashkent', 'YYYY-MM-DD HH24:MI'), '') FROM orders o JOIN users u ON u.id = o.user_id ORDER BY o.id",
	}
	heads := map[string][]string{
		"users":    {"ID", "Kirish", "Ism", "Username", "Email", "Telefon", "Ro'yxatdan o'tgan", "Oxirgi kirish", "Bloklangan"},
		"attempts": {"ID", "Foydalanuvchi ID", "Ism", "Mashq", "O'tdi", "Ball", "Vaqt, s", "Mashina", "Sana"},
		"orders":   {"ID", "Foydalanuvchi ID", "Ism", "Mahsulot", "Narx", "To'langan", "Promokod", "Holat", "Yaratilgan", "To'langan vaqti"},
	}
	what := r.PathValue("what")
	q, ok := queries[what]
	if !ok {
		fail(w, 404, "not found")
		return
	}
	rows, err := a.db.Query(r.Context(), q)
	if err != nil {
		serverError(w, r, err)
		return
	}
	defer rows.Close()
	w.Header().Set("Content-Type", "text/csv; charset=utf-8")
	w.Header().Set("Content-Disposition", fmt.Sprintf(`attachment; filename="%s-%s.csv"`, what, time.Now().Format("2006-01-02")))
	w.Write([]byte("\xef\xbb\xbf"))
	c := csv.NewWriter(w)
	c.Comma = ';'
	c.Write(heads[what])
	for rows.Next() {
		vals, err := rows.Values()
		if err != nil {
			break
		}
		rec := make([]string, len(vals))
		for i, v := range vals {
			switch x := v.(type) {
			case nil:
			case bool:
				rec[i] = map[bool]string{true: "ha", false: "yo'q"}[x]
			default:
				rec[i] = fmt.Sprint(x)
			}
		}
		c.Write(rec)
	}
	c.Flush()
}

// redact: passwords and secret keys never go into the log
func redact(body []byte) string {
	var m map[string]any
	if json.Unmarshal(body, &m) != nil {
		return string(body)
	}
	for k, v := range m {
		l := strings.ToLower(k)
		if s, ok := v.(string); ok && s != "" && (strings.Contains(l, "pass") || strings.Contains(l, "token") || strings.Contains(l, "secret") || l == "old" || l == "new") {
			m[k] = "***"
		}
	}
	out, _ := json.Marshal(m)
	return string(out)
}
