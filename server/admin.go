package main

// The admin panel's API: numbers at a glance, users (block, make admin, delete), results,
// advertising (upload, order, switch on and off) and the cars the simulator offers.

import (
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"regexp"
	"strconv"
	"strings"
	"time"
)

func intParam(r *http.Request, k string, dflt, lo, hi int) int {
	v, err := strconv.Atoi(r.URL.Query().Get(k))
	if err != nil {
		return dflt
	}
	if v < lo {
		return lo
	}
	if v > hi {
		return hi
	}
	return v
}

// GET /api/admin/stats
func (a *App) handleStats(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	now := time.Now().In(a.tz)
	day := time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, a.tz)
	today, week, month := day.UnixMilli(), day.AddDate(0, 0, -6).UnixMilli(), day.AddDate(0, 0, -29).UnixMilli()
	out := map[string]any{}
	var users, newToday, newWeek, activeToday, activeWeek, blocked int
	if err := a.db.QueryRow(ctx, `SELECT count(*), count(*) FILTER (WHERE created >= $1), count(*) FILTER (WHERE created >= $2),
		count(*) FILTER (WHERE seen >= $1), count(*) FILTER (WHERE seen >= $2), count(*) FILTER (WHERE blocked) FROM users`, today, week).
		Scan(&users, &newToday, &newWeek, &activeToday, &activeWeek, &blocked); err != nil {
		serverError(w, r, err)
		return
	}
	out["users"] = map[string]int{"total": users, "newToday": newToday, "newWeek": newWeek, "activeToday": activeToday, "activeWeek": activeWeek, "blocked": blocked}
	var attempts, attemptsToday, exams, examsPassed int
	if err := a.db.QueryRow(ctx, `SELECT count(*), count(*) FILTER (WHERE at >= $1), count(*) FILTER (WHERE key = 'exam'),
		count(*) FILTER (WHERE key = 'exam' AND passed) FROM attempts`, today).Scan(&attempts, &attemptsToday, &exams, &examsPassed); err != nil {
		serverError(w, r, err)
		return
	}
	out["attempts"] = map[string]int{"total": attempts, "today": attemptsToday, "exams": exams, "examsPassed": examsPassed}

	// the last 14 days: attempts, the users who made them, new users
	days := []map[string]any{}
	for i := 13; i >= 0; i-- {
		d0 := day.AddDate(0, 0, -i)
		d1 := d0.AddDate(0, 0, 1)
		var n, people, joined int
		if err := a.db.QueryRow(ctx, `SELECT (SELECT count(*) FROM attempts WHERE at >= $1 AND at < $2),
			(SELECT count(DISTINCT user_id) FROM attempts WHERE at >= $1 AND at < $2),
			(SELECT count(*) FROM users WHERE created >= $1 AND created < $2)`, d0.UnixMilli(), d1.UnixMilli()).Scan(&n, &people, &joined); err != nil {
			serverError(w, r, err)
			return
		}
		days = append(days, map[string]any{"day": d0.Format("2006-01-02"), "attempts": n, "people": people, "joined": joined})
	}
	out["days"] = days

	// the exercises: tries, passes, average points (30 days)
	rows, err := a.db.Query(ctx, `SELECT key, count(*), count(*) FILTER (WHERE passed), coalesce(round(avg(total)), 0)::int FROM attempts
		WHERE at >= $1 GROUP BY key ORDER BY count(*) DESC`, month)
	if err != nil {
		serverError(w, r, err)
		return
	}
	keys := []map[string]any{}
	for rows.Next() {
		var key string
		var n, passes, avg int
		if err := rows.Scan(&key, &n, &passes, &avg); err != nil {
			rows.Close()
			serverError(w, r, err)
			return
		}
		keys = append(keys, map[string]any{"key": key, "tries": n, "passes": passes, "avg": avg})
	}
	rows.Close()
	out["keys"] = keys

	// the mistakes that cost the most points (30 days)
	rows, err = a.db.Query(ctx, `SELECT m.key, max(m.value->>'n'), max(m.value->>'text'), sum((m.value->>'pts')::int), sum((m.value->>'count')::int), count(*)
		FROM attempts a, jsonb_each(a.mistakes) m WHERE a.at >= $1 GROUP BY m.key ORDER BY 4 DESC LIMIT 12`, month)
	if err != nil {
		serverError(w, r, err)
		return
	}
	mistakes := []map[string]any{}
	for rows.Next() {
		var code string
		var n, text *string
		var pts, count, attemptsWith int
		if err := rows.Scan(&code, &n, &text, &pts, &count, &attemptsWith); err != nil {
			rows.Close()
			serverError(w, r, err)
			return
		}
		mistakes = append(mistakes, map[string]any{"code": code, "n": deref(n), "text": deref(text), "pts": pts, "count": count, "attempts": attemptsWith})
	}
	rows.Close()
	out["mistakes"] = mistakes
	writeJSON(w, 200, out)
}

func deref(s *string) string {
	if s == nil {
		return ""
	}
	return *s
}

// GET /api/admin/users?q=&offset=&limit=
func (a *App) handleUsers(w http.ResponseWriter, r *http.Request) {
	q := strings.TrimSpace(r.URL.Query().Get("q"))
	limit, offset := intParam(r, "limit", 50, 1, 200), intParam(r, "offset", 0, 0, 1<<30)
	like := "%" + strings.NewReplacer("%", `\%`, "_", `\_`).Replace(q) + "%"
	rows, err := a.db.Query(r.Context(), `SELECT `+prefixed("u.", userCols)+`,
		(SELECT count(*) FROM attempts x WHERE x.user_id = u.id),
		(SELECT min(total) FROM attempts x WHERE x.user_id = u.id AND x.key = 'exam' AND x.passed),
		count(*) OVER ()
		FROM users u WHERE $1 = '' OR u.name ILIKE $2 OR u.username ILIKE $2 OR u.email ILIKE $2 OR u.phone ILIKE $2 OR u.pid = $1
		ORDER BY u.seen DESC LIMIT $3 OFFSET $4`, q, like, limit, offset)
	if err != nil {
		serverError(w, r, err)
		return
	}
	defer rows.Close()
	list, total := []map[string]any{}, 0
	for rows.Next() {
		u := &User{}
		var n int
		var best *int
		if err := rows.Scan(&u.ID, &u.Provider, &u.Name, &u.Username, &u.Email, &u.Photo, &u.Created, &u.Seen, &u.Blocked, &u.Admin, &u.Phone, &n, &best, &total); err != nil {
			serverError(w, r, err)
			return
		}
		list = append(list, map[string]any{"user": u, "attempts": n, "bestExam": best})
	}
	if err := rows.Err(); err != nil {
		serverError(w, r, err)
		return
	}
	writeJSON(w, 200, map[string]any{"items": list, "total": total})
}

func (a *App) pathUser(w http.ResponseWriter, r *http.Request) *User {
	id, err := strconv.Atoi(r.PathValue("id"))
	if err != nil {
		fail(w, 400, "bad id")
		return nil
	}
	u, err := scanUser(a.db.QueryRow(r.Context(), "SELECT "+userCols+" FROM users WHERE id = $1", id))
	if err != nil {
		serverError(w, r, err)
		return nil
	}
	if u == nil {
		fail(w, 404, "no such user")
	}
	return u
}

// GET /api/admin/users/{id}: the user and their attempts
func (a *App) handleUser(w http.ResponseWriter, r *http.Request) {
	u := a.pathUser(w, r)
	if u == nil {
		return
	}
	list, err := a.userAttempts(r, u.ID, 300)
	if err != nil {
		serverError(w, r, err)
		return
	}
	bought, err := a.purchasesOf(r, u.ID)
	if err != nil {
		serverError(w, r, err)
		return
	}
	writeJSON(w, 200, map[string]any{"user": a.withOwns(r, u), "attempts": list, "purchases": bought})
}

// PATCH /api/admin/users/{id}: { blocked?, admin? }
func (a *App) handlePatchUser(w http.ResponseWriter, r *http.Request) {
	u := a.pathUser(w, r)
	if u == nil {
		return
	}
	var body struct{ Blocked *bool }
	if !readJSON(w, r, &body) {
		return
	}
	if body.Blocked != nil {
		u.Blocked = *body.Blocked
	}
	if _, err := a.db.Exec(r.Context(), "UPDATE users SET blocked = $1 WHERE id = $2", u.Blocked, u.ID); err != nil {
		serverError(w, r, err)
		return
	}
	if u.Blocked { // logged out everywhere
		a.db.Exec(r.Context(), "DELETE FROM sessions WHERE user_id = $1", u.ID)
	}
	writeJSON(w, 200, map[string]any{"user": u})
}

// DELETE /api/admin/users/{id}: the user, their sessions and attempts
func (a *App) handleDeleteUser(w http.ResponseWriter, r *http.Request) {
	u := a.pathUser(w, r)
	if u == nil {
		return
	}
	if _, err := a.db.Exec(r.Context(), "DELETE FROM users WHERE id = $1", u.ID); err != nil {
		serverError(w, r, err)
		return
	}
	writeJSON(w, 200, map[string]bool{"ok": true})
}

// GET /api/admin/attempts?key=&offset=&limit=: the latest results of everyone
func (a *App) handleAttempts(w http.ResponseWriter, r *http.Request) {
	key := r.URL.Query().Get("key")
	if key != "" && !keyRe.MatchString(key) {
		fail(w, 400, "bad key")
		return
	}
	limit, offset := intParam(r, "limit", 50, 1, 200), intParam(r, "offset", 0, 0, 1<<30)
	rows, err := a.db.Query(r.Context(), `SELECT a.at, a.key, a.passed, a.total, a.t, a.car, a.mistakes, u.id, u.name, u.username, u.photo, count(*) OVER ()
		FROM attempts a JOIN users u ON u.id = a.user_id WHERE $1 = '' OR a.key = $1
		ORDER BY a.at DESC LIMIT $2 OFFSET $3`, key, limit, offset)
	if err != nil {
		serverError(w, r, err)
		return
	}
	defer rows.Close()
	list, total := []map[string]any{}, 0
	for rows.Next() {
		var at int64
		var k, car, name, username, photo string
		var passed bool
		var pts, t, uid int
		var mistakes json.RawMessage
		if err := rows.Scan(&at, &k, &passed, &pts, &t, &car, &mistakes, &uid, &name, &username, &photo, &total); err != nil {
			serverError(w, r, err)
			return
		}
		list = append(list, map[string]any{"at": at, "key": k, "passed": passed, "total": pts, "t": t, "car": car, "mistakes": mistakes,
			"user": map[string]any{"id": uid, "name": name, "username": username, "photo": photo}})
	}
	if err := rows.Err(); err != nil {
		serverError(w, r, err)
		return
	}
	writeJSON(w, 200, map[string]any{"items": list, "total": total})
}

// ---- advertising

func (a *App) ads(r *http.Request) ([]Ad, error) {
	ads := []Ad{}
	_, err := a.db.getSetting(r.Context(), "ads", &ads)
	return ads, err
}

func (a *App) adsOut(r *http.Request, ads []Ad) map[string]any {
	base := a.publicURL(r)
	items := []map[string]any{}
	for _, ad := range ads {
		items = append(items, map[string]any{"id": ad.ID, "name": ad.Name, "sec": ad.Sec, "on": ad.On, "size": ad.Size, "url": base + "/uploads/ads/" + ad.File, "video": isVideo(ad.File), "place": placeOf(ad.Place), "cars": cleanCars(ad.Cars)})
	}
	var set []Ad
	isSet, _ := a.db.getSetting(r.Context(), "ads", &set)
	return map[string]any{"items": items, "custom": isSet}
}

func (a *App) handleGetAds(w http.ResponseWriter, r *http.Request) {
	ads, err := a.ads(r)
	if err != nil {
		serverError(w, r, err)
		return
	}
	writeJSON(w, 200, a.adsOut(r, ads))
}

// PUT /api/admin/ads: { items: [{ id, sec, on, place, cars }] } in the order they are shown
func (a *App) handlePutAds(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Items []struct {
			ID    string   `json:"id"`
			Sec   int      `json:"sec"`
			On    bool     `json:"on"`
			Place string   `json:"place"`
			Cars  []string `json:"cars"`
		}
	}
	if !readJSON(w, r, &body) {
		return
	}
	ads, err := a.ads(r)
	if err != nil {
		serverError(w, r, err)
		return
	}
	byID := map[string]Ad{}
	for _, ad := range ads {
		byID[ad.ID] = ad
	}
	out := []Ad{}
	for _, it := range body.Items {
		ad, ok := byID[it.ID]
		if !ok {
			continue
		}
		delete(byID, it.ID)
		ad.Sec = min(max(it.Sec, 2), 600)
		ad.On = it.On
		ad.Place = placeOf(it.Place)
		ad.Cars = cleanCars(it.Cars)
		out = append(out, ad)
	}
	for _, ad := range ads { // anything the list left out stays, at the end
		if _, left := byID[ad.ID]; left {
			out = append(out, ad)
		}
	}
	if err := a.db.setSetting(r.Context(), "ads", out); err != nil {
		serverError(w, r, err)
		return
	}
	writeJSON(w, 200, a.adsOut(r, out))
}

var adExt = map[string]bool{".jpg": true, ".jpeg": true, ".png": true, ".webp": true, ".gif": true, ".mp4": true, ".webm": true, ".mov": true, ".m4v": true}

func isVideo(file string) bool {
	switch strings.ToLower(filepath.Ext(file)) {
	case ".mp4", ".webm", ".mov", ".m4v":
		return true
	}
	return false
}

const maxAdBytes = 200 << 20

var safeName = regexp.MustCompile(`[^\p{L}\p{N}._ -]+`)

// POST /api/admin/ads (the file itself as the body, its name in X-File-Name): a new ad, switched on, last
func (a *App) handleUploadAd(w http.ResponseWriter, r *http.Request) {
	name := r.Header.Get("X-File-Name")
	if n, err := url.PathUnescape(name); err == nil {
		name = n
	}
	ext := strings.ToLower(filepath.Ext(name))
	if !adExt[ext] {
		fail(w, 400, "only pictures (jpg, png, webp, gif) and videos (mp4, webm, mov)")
		return
	}
	id := newToken()[:16]
	file := id + ext
	dst := filepath.Join(a.cfg.UploadDir, "ads", file)
	f, err := os.Create(dst)
	if err != nil {
		serverError(w, r, err)
		return
	}
	n, err := io.Copy(f, http.MaxBytesReader(w, r.Body, maxAdBytes))
	f.Close()
	if err != nil || n == 0 {
		os.Remove(dst)
		var tooBig *http.MaxBytesError
		if errors.As(err, &tooBig) {
			fail(w, 413, "the file is larger than 200 MB")
		} else {
			fail(w, 400, "upload failed")
		}
		return
	}
	ads, err := a.ads(r)
	if err != nil {
		os.Remove(dst)
		serverError(w, r, err)
		return
	}
	ads = append(ads, Ad{ID: id, File: file, Name: trim(safeName.ReplaceAllString(name, ""), 120), Sec: 8, On: true, Size: n})
	if err := a.db.setSetting(r.Context(), "ads", ads); err != nil {
		os.Remove(dst)
		serverError(w, r, err)
		return
	}
	writeJSON(w, 200, a.adsOut(r, ads))
}

func (a *App) handleDeleteAd(w http.ResponseWriter, r *http.Request) {
	ads, err := a.ads(r)
	if err != nil {
		serverError(w, r, err)
		return
	}
	out := []Ad{}
	for _, ad := range ads {
		if ad.ID == r.PathValue("id") {
			os.Remove(filepath.Join(a.cfg.UploadDir, "ads", ad.File))
			continue
		}
		out = append(out, ad)
	}
	if err := a.db.setSetting(r.Context(), "ads", out); err != nil {
		serverError(w, r, err)
		return
	}
	writeJSON(w, 200, a.adsOut(r, out))
}

// ---- cars

var carIDRe = regexp.MustCompile(`^[a-z0-9-]{1,40}$`)

func (a *App) handleGetCars(w http.ResponseWriter, r *http.Request) {
	var c CarSettings
	if _, err := a.db.getSetting(r.Context(), "cars", &c); err != nil {
		serverError(w, r, err)
		return
	}
	if c.Disabled == nil {
		c.Disabled = []string{}
	}
	writeJSON(w, 200, c)
}

// PUT /api/admin/cars: { disabled: [car ids] } (the simulator keeps at least one car whatever this says)
func (a *App) handlePutCars(w http.ResponseWriter, r *http.Request) {
	var c CarSettings
	if !readJSON(w, r, &c) {
		return
	}
	out := []string{}
	for _, id := range c.Disabled {
		if carIDRe.MatchString(id) {
			out = append(out, id)
		}
	}
	c.Disabled = out
	if err := a.db.setSetting(r.Context(), "cars", c); err != nil {
		serverError(w, r, err)
		return
	}
	writeJSON(w, 200, c)
}
