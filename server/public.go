package main

// What the simulator asks for: its settings (logins, advertising, cars), the attempts of the
// logged-in user and the leaderboard.

import (
	"encoding/json"
	"net/http"
	"regexp"
	"time"
)

type Ad struct {
	ID   string `json:"id"`
	File string `json:"file"` // in UPLOAD_DIR/ads
	Name string `json:"name"` // the file's name when it was uploaded
	Sec  int    `json:"sec"`  // a picture's time on the screen
	On   bool   `json:"on"`
	Size int64  `json:"size"`
}

type CarSettings struct {
	Disabled []string `json:"disabled"`
}

func (a *App) handleConfig(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	out := map[string]any{"googleClientId": a.cfg.GoogleClientID, "telegramBot": a.cfg.TelegramBot, "devLogin": a.cfg.DevLogin}
	var ads []Ad
	set, err := a.db.getSetting(ctx, "ads", &ads)
	if err != nil {
		serverError(w, r, err)
		return
	}
	if set { // once the admin has a list (even an empty one), it is the list; before that the site's own ads.json
		items := []map[string]any{}
		base := a.publicURL(r)
		for _, ad := range ads {
			if ad.On {
				items = append(items, map[string]any{"src": base + "/uploads/ads/" + ad.File, "sec": ad.Sec})
			}
		}
		out["ads"] = items
	}
	var cars CarSettings
	if _, err := a.db.getSetting(ctx, "cars", &cars); err != nil {
		serverError(w, r, err)
		return
	}
	if cars.Disabled == nil {
		cars.Disabled = []string{}
	}
	out["disabledCars"] = cars.Disabled
	writeJSON(w, 200, out)
}

type Attempt struct {
	At       int64           `json:"at"`
	Key      string          `json:"key"`
	Passed   bool            `json:"passed"`
	Total    int             `json:"total"`
	T        int             `json:"t"`
	Car      string          `json:"car"`
	Mistakes json.RawMessage `json:"mistakes"`
}

var keyRe = regexp.MustCompile(`^(exam|training|practice:[a-z0-9-]{1,40})$`)

func (x *Attempt) valid(now time.Time) bool {
	ms := now.UnixMilli()
	return keyRe.MatchString(x.Key) && x.Total >= 0 && x.Total <= 100000 && x.T >= 0 && x.T <= 86400 &&
		x.At > ms-400*24*3600*1000 && x.At < ms+24*3600*1000 && len(x.Car) <= 40 && len(x.Mistakes) <= 16<<10
}

// POST /api/attempts: one attempt, or { items: [...] } (the ones saved while offline)
func (a *App) handlePostAttempts(w http.ResponseWriter, r *http.Request) {
	var raw json.RawMessage
	if !readJSON(w, r, &raw) {
		return
	}
	var batch struct{ Items []Attempt }
	if json.Unmarshal(raw, &batch) != nil || batch.Items == nil {
		var one Attempt
		if json.Unmarshal(raw, &one) != nil {
			fail(w, 400, "bad attempt")
			return
		}
		batch.Items = []Attempt{one}
	}
	if len(batch.Items) > 200 {
		batch.Items = batch.Items[len(batch.Items)-200:]
	}
	u, now, saved := userFrom(r), time.Now(), 0
	for _, x := range batch.Items {
		if !x.valid(now) {
			continue
		}
		m := x.Mistakes
		if len(m) == 0 || !json.Valid(m) || m[0] != '{' {
			m = json.RawMessage("{}")
		}
		tag, err := a.db.Exec(r.Context(), `INSERT INTO attempts (user_id, at, key, passed, total, t, car, mistakes, received)
			VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) ON CONFLICT (user_id, at) DO NOTHING`,
			u.ID, x.At, x.Key, x.Passed, x.Total, x.T, x.Car, []byte(m), now.UnixMilli())
		if err != nil {
			serverError(w, r, err)
			return
		}
		saved += int(tag.RowsAffected())
	}
	writeJSON(w, 200, map[string]int{"saved": saved})
}

func (a *App) userAttempts(r *http.Request, userID, limit int) ([]map[string]any, error) {
	rows, err := a.db.Query(r.Context(), `SELECT at, key, passed, total, t, car, mistakes FROM attempts WHERE user_id = $1 ORDER BY at DESC LIMIT $2`, userID, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []map[string]any{}
	for rows.Next() {
		var at int64
		var key, car string
		var passed bool
		var total, t int
		var mistakes json.RawMessage
		if err := rows.Scan(&at, &key, &passed, &total, &t, &car, &mistakes); err != nil {
			return nil, err
		}
		out = append(out, map[string]any{"at": at, "key": key, "passed": passed, "total": total, "t": t, "car": car, "mistakes": mistakes})
	}
	return out, rows.Err()
}

// the user's own history (merged into the browser's on another device)
func (a *App) handleMyAttempts(w http.ResponseWriter, r *http.Request) {
	list, err := a.userAttempts(r, userFrom(r).ID, 500)
	if err != nil {
		serverError(w, r, err)
		return
	}
	writeJSON(w, 200, map[string]any{"items": list})
}

// GET /api/leaderboard?key=exam: each user's best passed attempt (fewest points, then fastest), the
// first 50, and the asking user's own place when they are further down
func (a *App) handleLeaderboard(w http.ResponseWriter, r *http.Request) {
	key := r.URL.Query().Get("key")
	if key == "" {
		key = "exam"
	}
	if !keyRe.MatchString(key) {
		fail(w, 400, "bad key")
		return
	}
	me := 0
	if u, err := a.sessionUser(r.Context(), r); err == nil && u != nil {
		me = u.ID
	}
	rows, err := a.db.Query(r.Context(), `
		WITH best AS (
			SELECT DISTINCT ON (a.user_id) a.user_id, a.total, a.t, a.at, a.car
			FROM attempts a JOIN users u ON u.id = a.user_id
			WHERE a.key = $1 AND a.passed AND NOT u.blocked
			ORDER BY a.user_id, a.total, a.t, a.at
		), ranked AS (SELECT b.*, RANK() OVER (ORDER BY total, t) AS rank FROM best b)
		SELECT r.rank, r.user_id, u.name, u.username, u.photo, r.total, r.t, r.at, r.car,
			(SELECT count(*) FROM attempts x WHERE x.user_id = r.user_id AND x.key = $1 AND x.passed) AS passes
		FROM ranked r JOIN users u ON u.id = r.user_id
		WHERE r.rank <= 50 OR r.user_id = $2
		ORDER BY r.rank, r.at LIMIT 60`, key, me)
	if err != nil {
		serverError(w, r, err)
		return
	}
	defer rows.Close()
	list := []map[string]any{}
	for rows.Next() {
		var rank, uid, total, t int
		var at, passes int64
		var name, username, photo, car string
		if err := rows.Scan(&rank, &uid, &name, &username, &photo, &total, &t, &at, &car, &passes); err != nil {
			serverError(w, r, err)
			return
		}
		list = append(list, map[string]any{"rank": rank, "name": name, "username": username, "photo": photo, "total": total, "t": t, "at": at, "car": car, "passes": passes, "me": uid == me})
	}
	if err := rows.Err(); err != nil {
		serverError(w, r, err)
		return
	}
	writeJSON(w, 200, map[string]any{"key": key, "items": list})
}
