package main

// Login endpoints and sessions: the browser sends its token as "Authorization: Bearer <token>".

import (
	"context"
	"encoding/json"
	"net/http"
	"strings"
	"time"
)

const sessionTTL = 60 * 24 * time.Hour

type ctxKey struct{}

func userFrom(r *http.Request) *User { u, _ := r.Context().Value(ctxKey{}).(*User); return u }

func bearer(r *http.Request) string {
	h := r.Header.Get("Authorization")
	if len(h) > 7 && strings.EqualFold(h[:7], "bearer ") {
		return strings.TrimSpace(h[7:])
	}
	return ""
}

// sessionUser: the user behind the request's token (nil if none or expired)
func (a *App) sessionUser(ctx context.Context, r *http.Request) (*User, error) {
	tok := bearer(r)
	if tok == "" {
		return nil, nil
	}
	return scanUser(a.db.QueryRow(ctx, `SELECT `+prefixed("u.", userCols)+` FROM sessions s JOIN users u ON u.id = s.user_id
		WHERE s.hash = $1 AND s.expires > $2`, tokenHash(tok), time.Now().UnixMilli()))
}

func prefixed(p, cols string) string {
	parts := strings.Split(cols, ", ")
	for i := range parts {
		parts[i] = p + parts[i]
	}
	return strings.Join(parts, ", ")
}

func (a *App) authed(h http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		u, err := a.sessionUser(r.Context(), r)
		if err != nil {
			serverError(w, r, err)
			return
		}
		if u == nil {
			fail(w, 401, "login required")
			return
		}
		if u.Blocked {
			fail(w, 403, "blocked")
			return
		}
		now := time.Now().UnixMilli()
		if now-u.Seen > 5*60*1000 {
			a.db.Exec(r.Context(), "UPDATE users SET seen = $1 WHERE id = $2", now, u.ID)
			u.Seen = now
		}
		h(w, r.WithContext(context.WithValue(r.Context(), ctxKey{}, u)))
	}
}

// login: the user is found or created, and a new session begins (players only: admins have their own login, admins.go)
func (a *App) login(w http.ResponseWriter, r *http.Request, id *Identity) {
	ctx, now := r.Context(), time.Now().UnixMilli()
	u, err := scanUser(a.db.QueryRow(ctx, `INSERT INTO users (provider, pid, name, username, email, photo, created, seen, admin, phone)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $7, $8, $9)
		ON CONFLICT (provider, pid) DO UPDATE SET name = excluded.name, username = excluded.username,
			email = CASE WHEN excluded.email <> '' THEN excluded.email ELSE users.email END,
			photo = CASE WHEN excluded.photo <> '' THEN excluded.photo ELSE users.photo END, seen = excluded.seen,
			phone = CASE WHEN excluded.phone <> '' THEN excluded.phone ELSE users.phone END
		RETURNING `+userCols, id.Provider, id.PID, trim(id.Name, 100), trim(id.Username, 64), trim(id.Email, 200), trim(id.Photo, 500), now, false, trim(id.Phone, 20)))
	if err != nil {
		serverError(w, r, err)
		return
	}
	if u.Blocked {
		fail(w, 403, "blocked")
		return
	}
	tok := newToken()
	if _, err := a.db.Exec(ctx, "INSERT INTO sessions (hash, user_id, created, expires) VALUES ($1, $2, $3, $4)", tokenHash(tok), u.ID, now, now+sessionTTL.Milliseconds()); err != nil {
		serverError(w, r, err)
		return
	}
	a.db.Exec(ctx, "DELETE FROM sessions WHERE expires < $1", now)
	writeJSON(w, 200, map[string]any{"token": tok, "user": a.withOwns(r, u)})
}

func trim(s string, n int) string {
	s = strings.TrimSpace(s)
	if len(s) > n {
		return s[:n]
	}
	return s
}

func (a *App) handleGoogle(w http.ResponseWriter, r *http.Request) {
	var body struct{ Credential string }
	if !readJSON(w, r, &body) {
		return
	}
	id, err := checkGoogle(r.Context(), body.Credential, a.cfg.GoogleClientID)
	if err != nil {
		serverError(w, r, err)
		return
	}
	if id == nil {
		fail(w, 401, "google login failed")
		return
	}
	a.login(w, r, id)
}

func (a *App) handleTelegram(w http.ResponseWriter, r *http.Request) {
	var raw map[string]any
	if !readJSON(w, r, &raw) {
		return
	}
	data := map[string]string{}
	for k, v := range raw {
		switch x := v.(type) {
		case string:
			data[k] = x
		case json.Number:
			data[k] = x.String()
		}
	}
	id := checkTelegramWidget(data, a.cfg.TelegramToken, time.Now())
	if id == nil {
		fail(w, 401, "telegram login failed")
		return
	}
	a.login(w, r, id)
}

func (a *App) handleTelegramWebApp(w http.ResponseWriter, r *http.Request) {
	var body struct {
		InitData string `json:"initData"`
	}
	if !readJSON(w, r, &body) {
		return
	}
	id := checkTelegramWebApp(body.InitData, a.cfg.TelegramToken, time.Now())
	if id == nil {
		fail(w, 401, "telegram login failed")
		return
	}
	a.login(w, r, id)
}

// local testing without Google or Telegram: log in by name (only with DEV_LOGIN=1)
func (a *App) handleDevLogin(w http.ResponseWriter, r *http.Request) {
	if !a.cfg.DevLogin {
		fail(w, 404, "not found")
		return
	}
	var body struct{ Name string }
	if !readJSON(w, r, &body) || strings.TrimSpace(body.Name) == "" {
		if strings.TrimSpace(body.Name) == "" {
			fail(w, 400, "name required")
		}
		return
	}
	n := trim(body.Name, 60)
	a.login(w, r, &Identity{Provider: "dev", PID: strings.ToLower(n), Name: n})
}

func (a *App) handleMe(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, 200, map[string]any{"user": a.withOwns(r, userFrom(r))})
}

func (a *App) handleLogout(w http.ResponseWriter, r *http.Request) {
	if tok := bearer(r); tok != "" {
		a.db.Exec(r.Context(), "DELETE FROM sessions WHERE hash = $1", tokenHash(tok))
	}
	writeJSON(w, 200, map[string]bool{"ok": true})
}
