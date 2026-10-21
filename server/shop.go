package main

// Paid items: some cars and the 18+ instructor. What a user owns is kept in purchases; the payment
// itself (Inpay) comes later and will add rows the same way the admin does here.

import (
	"net/http"
	"regexp"
	"time"
)

var itemRe = regexp.MustCompile(`^(instructor:rude|car:[a-z0-9-]{1,40})$`)

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
		t := now + int64(body.Days)*24*3600*1000
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
