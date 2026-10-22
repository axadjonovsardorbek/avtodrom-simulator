package main

// Admins are not players: they have their own table, log in to the admin panel with a login and password
// (bcrypt), and hold their own sessions. A player account gives no admin rights, an admin login none in the game.
// The first admin comes from ADMIN_LOGIN / ADMIN_PASSWORD in the server's .env (made once, if missing).

import (
	"context"
	"log"
	"net/http"
	"regexp"
	"strconv"
	"strings"
	"time"

	"golang.org/x/crypto/bcrypt"
)

const schemaAdmins = `
CREATE TABLE IF NOT EXISTS admins (
  id SERIAL PRIMARY KEY,
  login TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL DEFAULT '',
  pass TEXT NOT NULL,                    -- bcrypt
  created BIGINT NOT NULL,
  last_login BIGINT
);
CREATE TABLE IF NOT EXISTS admin_sessions (
  hash TEXT PRIMARY KEY,                 -- sha256 of the token
  admin_id INTEGER NOT NULL REFERENCES admins(id) ON DELETE CASCADE,
  created BIGINT NOT NULL,
  expires BIGINT NOT NULL
);
UPDATE users SET admin = FALSE WHERE admin;  -- player accounts no longer carry admin rights
`

const adminTTL = 12 * time.Hour

type Admin struct {
	ID        int    `json:"id"`
	Login     string `json:"login"`
	Name      string `json:"name"`
	Created   int64  `json:"created"`
	LastLogin *int64 `json:"lastLogin"`
}

type adminKey struct{}

var dummyHash, _ = bcrypt.GenerateFromPassword([]byte("no such admin"), bcrypt.DefaultCost)

func adminFrom(r *http.Request) *Admin { a, _ := r.Context().Value(adminKey{}).(*Admin); return a }

var loginRe = regexp.MustCompile(`^[a-zA-Z0-9_.-]{3,32}$`)

// the first admin, from the environment
func (a *App) bootstrapAdmin(ctx context.Context) {
	login, pass := strings.TrimSpace(a.cfg.AdminLogin), a.cfg.AdminPassword
	if login == "" || pass == "" {
		return
	}
	if !loginRe.MatchString(login) || len(pass) < 8 {
		log.Printf("ADMIN_LOGIN / ADMIN_PASSWORD ignored: login 3-32 letters/digits, password at least 8 characters")
		return
	}
	h, err := bcrypt.GenerateFromPassword([]byte(pass), bcrypt.DefaultCost)
	if err != nil {
		return
	}
	tag, err := a.db.Exec(ctx, "INSERT INTO admins (login, name, pass, created) VALUES ($1, $1, $2, $3) ON CONFLICT (login) DO NOTHING", strings.ToLower(login), string(h), time.Now().UnixMilli())
	if err == nil && tag.RowsAffected() == 1 {
		log.Printf("admin %q created", login)
	}
}

// admin: the request must carry an admin session's token
func (a *App) admin(h http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tok := bearer(r)
		if tok == "" {
			fail(w, 401, "admin login required")
			return
		}
		var ad Admin
		err := a.db.QueryRow(r.Context(), `SELECT d.id, d.login, d.name, d.created, d.last_login FROM admin_sessions s JOIN admins d ON d.id = s.admin_id
			WHERE s.hash = $1 AND s.expires > $2`, tokenHash(tok), time.Now().UnixMilli()).Scan(&ad.ID, &ad.Login, &ad.Name, &ad.Created, &ad.LastLogin)
		if err != nil {
			fail(w, 401, "admin login required")
			return
		}
		h(w, r.WithContext(context.WithValue(r.Context(), adminKey{}, &ad)))
	}
}

// POST /api/admin/login { login, password }
func (a *App) handleAdminLogin(w http.ResponseWriter, r *http.Request) {
	var body struct{ Login, Password string }
	if !readJSON(w, r, &body) {
		return
	}
	ctx, now := r.Context(), time.Now().UnixMilli()
	var ad Admin
	var hash string
	err := a.db.QueryRow(ctx, "SELECT id, login, name, created, last_login, pass FROM admins WHERE login = $1", strings.ToLower(strings.TrimSpace(body.Login))).
		Scan(&ad.ID, &ad.Login, &ad.Name, &ad.Created, &ad.LastLogin, &hash)
	if err != nil {
		hash = string(dummyHash) // the same work for an unknown login
	}
	if bcrypt.CompareHashAndPassword([]byte(hash), []byte(body.Password)) != nil || err != nil {
		time.Sleep(400 * time.Millisecond)
		fail(w, 401, "login yoki parol noto'g'ri")
		return
	}
	tok := newToken()
	if _, err := a.db.Exec(ctx, "INSERT INTO admin_sessions (hash, admin_id, created, expires) VALUES ($1, $2, $3, $4)", tokenHash(tok), ad.ID, now, now+adminTTL.Milliseconds()); err != nil {
		serverError(w, r, err)
		return
	}
	a.db.Exec(ctx, "UPDATE admins SET last_login = $1 WHERE id = $2", now, ad.ID)
	a.db.Exec(ctx, "DELETE FROM admin_sessions WHERE expires < $1", now)
	writeJSON(w, 200, map[string]any{"token": tok, "admin": ad})
}

func (a *App) handleAdminLogout(w http.ResponseWriter, r *http.Request) {
	if tok := bearer(r); tok != "" {
		a.db.Exec(r.Context(), "DELETE FROM admin_sessions WHERE hash = $1", tokenHash(tok))
	}
	writeJSON(w, 200, map[string]any{"ok": true})
}

func (a *App) handleAdminMe(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, 200, map[string]any{"admin": adminFrom(r)})
}

// GET /api/admin/admins
func (a *App) handleAdmins(w http.ResponseWriter, r *http.Request) {
	rows, err := a.db.Query(r.Context(), "SELECT id, login, name, created, last_login FROM admins ORDER BY id")
	if err != nil {
		serverError(w, r, err)
		return
	}
	defer rows.Close()
	list := []Admin{}
	for rows.Next() {
		var ad Admin
		if err := rows.Scan(&ad.ID, &ad.Login, &ad.Name, &ad.Created, &ad.LastLogin); err != nil {
			serverError(w, r, err)
			return
		}
		list = append(list, ad)
	}
	writeJSON(w, 200, map[string]any{"items": list})
}

// POST /api/admin/admins { login, name, password }: a new admin
func (a *App) handleAddAdmin(w http.ResponseWriter, r *http.Request) {
	var body struct{ Login, Name, Password string }
	if !readJSON(w, r, &body) {
		return
	}
	login := strings.ToLower(strings.TrimSpace(body.Login))
	if !loginRe.MatchString(login) {
		fail(w, 400, "login: 3-32 ta harf, raqam yoki _ . -")
		return
	}
	if len(body.Password) < 8 {
		fail(w, 400, "parol kamida 8 belgi")
		return
	}
	h, err := bcrypt.GenerateFromPassword([]byte(body.Password), bcrypt.DefaultCost)
	if err != nil {
		serverError(w, r, err)
		return
	}
	tag, err := a.db.Exec(r.Context(), "INSERT INTO admins (login, name, pass, created) VALUES ($1, $2, $3, $4) ON CONFLICT (login) DO NOTHING", login, trim(body.Name, 80), string(h), time.Now().UnixMilli())
	if err != nil {
		serverError(w, r, err)
		return
	}
	if tag.RowsAffected() == 0 {
		fail(w, 409, "bu login band")
		return
	}
	a.handleAdmins(w, r)
}

// DELETE /api/admin/admins/{id}: not oneself, and never the last one
func (a *App) handleDeleteAdmin(w http.ResponseWriter, r *http.Request) {
	id, _ := strconv.Atoi(r.PathValue("id"))
	if id == adminFrom(r).ID {
		fail(w, 400, "o'zingizni o'chira olmaysiz")
		return
	}
	if _, err := a.db.Exec(r.Context(), "DELETE FROM admins WHERE id = $1 AND (SELECT COUNT(*) FROM admins) > 1", id); err != nil {
		serverError(w, r, err)
		return
	}
	a.handleAdmins(w, r)
}

// PUT /api/admin/password { old, new }: one's own password; the other sessions end
func (a *App) handleAdminPassword(w http.ResponseWriter, r *http.Request) {
	var body struct{ Old, New string }
	if !readJSON(w, r, &body) {
		return
	}
	me := adminFrom(r)
	var hash string
	a.db.QueryRow(r.Context(), "SELECT pass FROM admins WHERE id = $1", me.ID).Scan(&hash)
	if bcrypt.CompareHashAndPassword([]byte(hash), []byte(body.Old)) != nil {
		fail(w, 400, "eski parol noto'g'ri")
		return
	}
	if len(body.New) < 8 {
		fail(w, 400, "yangi parol kamida 8 belgi")
		return
	}
	h, err := bcrypt.GenerateFromPassword([]byte(body.New), bcrypt.DefaultCost)
	if err != nil {
		serverError(w, r, err)
		return
	}
	a.db.Exec(r.Context(), "UPDATE admins SET pass = $1 WHERE id = $2", string(h), me.ID)
	a.db.Exec(r.Context(), "DELETE FROM admin_sessions WHERE admin_id = $1 AND hash <> $2", me.ID, tokenHash(bearer(r)))
	writeJSON(w, 200, map[string]any{"ok": true})
}
