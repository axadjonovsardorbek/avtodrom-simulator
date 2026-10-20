package main

// What is played and what the adverts were seen for: the simulator reports it (POST /api/track,
// no login needed, a random device id tells devices apart) and the admin panel reads it back by car,
// by advert and by player (GET /api/admin/analytics).

import (
	"net/http"
	"regexp"
	"sort"
	"strconv"
	"time"
)

var deviceRe = regexp.MustCompile(`^[a-z0-9]{8,40}$`)

// POST /api/track: { device, plays: [{ car, runs, secs }], ads: [{ id, car, place, views, secs }] }
func (a *App) handleTrack(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Device string `json:"device"`
		Plays  []struct {
			Car  string `json:"car"`
			Runs int    `json:"runs"`
			Secs int    `json:"secs"`
		} `json:"plays"`
		Ads []struct {
			ID    string `json:"id"`
			Car   string `json:"car"`
			Place string `json:"place"`
			Views int    `json:"views"`
			Secs  int    `json:"secs"`
		} `json:"ads"`
	}
	if !readJSON(w, r, &body) {
		return
	}
	if !deviceRe.MatchString(body.Device) || len(body.Plays) > 50 || len(body.Ads) > 200 {
		fail(w, 400, "bad report")
		return
	}
	ctx := r.Context()
	var uid *int
	if u, err := a.sessionUser(ctx, r); err == nil && u != nil && !u.Blocked {
		uid = &u.ID
	}
	day := time.Now().In(a.tz).Format("2006-01-02")
	// one report covers about a minute: anything far beyond that is not a real one
	for _, p := range body.Plays {
		if !carRe.MatchString(p.Car) || p.Runs < 0 || p.Secs < 0 || (p.Runs == 0 && p.Secs == 0) {
			continue
		}
		if _, err := a.db.Exec(ctx, `INSERT INTO plays (day, device, car, user_id, runs, secs) VALUES ($1, $2, $3, $4, $5, $6)
			ON CONFLICT (day, device, car) DO UPDATE SET runs = plays.runs + excluded.runs, secs = plays.secs + excluded.secs,
			user_id = coalesce(excluded.user_id, plays.user_id)`,
			day, body.Device, p.Car, uid, min(p.Runs, 30), min(p.Secs, 3600)); err != nil {
			serverError(w, r, err)
			return
		}
	}
	for _, v := range body.Ads {
		if !carRe.MatchString(v.Car) || !carRe.MatchString(v.ID) || v.Views < 0 || v.Secs <= 0 {
			continue
		}
		if _, err := a.db.Exec(ctx, `INSERT INTO ad_views (day, ad, car, place, device, views, secs) VALUES ($1, $2, $3, $4, $5, $6, $7)
			ON CONFLICT (day, ad, car, place, device) DO UPDATE SET views = ad_views.views + excluded.views, secs = ad_views.secs + excluded.secs`,
			day, v.ID, v.Car, placeOf(v.Place), body.Device, min(v.Views, 300), min(v.Secs, 3600)); err != nil {
			serverError(w, r, err)
			return
		}
	}
	w.WriteHeader(http.StatusNoContent)
}

// GET /api/admin/analytics?days=30: the cars (runs, time, devices, players, results, advert time),
// the runs per day and car, the adverts (by car and place) and the logged-in players by car
func (a *App) handleAnalytics(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	days, _ := strconv.Atoi(r.URL.Query().Get("days"))
	if days < 1 || days > 366 {
		days = 30
	}
	now := time.Now().In(a.tz)
	d0 := time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, a.tz).AddDate(0, 0, -(days - 1))
	from, fromMs := d0.Format("2006-01-02"), d0.UnixMilli()
	out := map[string]any{"days": days, "from": from}
	bad := func(err error) bool {
		if err != nil {
			serverError(w, r, err)
			return true
		}
		return false
	}

	var devices, users, runs, secs, views, viewSecs int64
	if bad(a.db.QueryRow(ctx, `SELECT count(DISTINCT device), count(DISTINCT user_id), coalesce(sum(runs), 0), coalesce(sum(secs), 0) FROM plays WHERE day >= $1`, from).
		Scan(&devices, &users, &runs, &secs)) {
		return
	}
	if bad(a.db.QueryRow(ctx, `SELECT coalesce(sum(views), 0), coalesce(sum(secs), 0) FROM ad_views WHERE day >= $1`, from).Scan(&views, &viewSecs)) {
		return
	}
	out["totals"] = map[string]int64{"devices": devices, "users": users, "runs": runs, "secs": secs, "adViews": views, "adSecs": viewSecs}

	// by car
	rows, err := a.db.Query(ctx, `
		WITH p AS (SELECT car, sum(runs) AS runs, sum(secs) AS secs, count(DISTINCT device) AS devices, count(DISTINCT user_id) AS users FROM plays WHERE day >= $1 GROUP BY car),
		t AS (SELECT car, count(*) AS tries, count(*) FILTER (WHERE passed) AS passes, coalesce(round(avg(total)), 0)::bigint AS avg FROM attempts WHERE at >= $2 AND car <> '' GROUP BY car),
		v AS (SELECT car, sum(views) AS views, sum(secs) AS secs FROM ad_views WHERE day >= $1 GROUP BY car),
		c AS (SELECT car FROM p UNION SELECT car FROM t UNION SELECT car FROM v)
		SELECT c.car, coalesce(p.runs, 0), coalesce(p.secs, 0), coalesce(p.devices, 0), coalesce(p.users, 0),
			coalesce(t.tries, 0), coalesce(t.passes, 0), coalesce(t.avg, 0), coalesce(v.views, 0), coalesce(v.secs, 0)
		FROM c LEFT JOIN p USING (car) LEFT JOIN t USING (car) LEFT JOIN v USING (car) ORDER BY 3 DESC, 2 DESC`, from, fromMs)
	if bad(err) {
		return
	}
	cars := []map[string]any{}
	for rows.Next() {
		var car string
		var runs, secs, devices, users, tries, passes, avg, views, vsecs int64
		if err := rows.Scan(&car, &runs, &secs, &devices, &users, &tries, &passes, &avg, &views, &vsecs); bad(err) {
			rows.Close()
			return
		}
		cars = append(cars, map[string]any{"car": car, "runs": runs, "secs": secs, "devices": devices, "users": users, "tries": tries, "passes": passes, "avg": avg, "adViews": views, "adSecs": vsecs})
	}
	rows.Close()
	out["cars"] = cars

	// runs and time per day and car
	rows, err = a.db.Query(ctx, `SELECT to_char(day, 'YYYY-MM-DD'), car, sum(runs), sum(secs) FROM plays WHERE day >= $1 GROUP BY day, car ORDER BY day`, from)
	if bad(err) {
		return
	}
	byDay := map[string]map[string][2]int64{}
	for rows.Next() {
		var day, car string
		var runs, secs int64
		if err := rows.Scan(&day, &car, &runs, &secs); bad(err) {
			rows.Close()
			return
		}
		if byDay[day] == nil {
			byDay[day] = map[string][2]int64{}
		}
		byDay[day][car] = [2]int64{runs, secs}
	}
	rows.Close()
	daily := []map[string]any{}
	for d := d0; !d.After(now); d = d.AddDate(0, 0, 1) {
		k := d.Format("2006-01-02")
		cs := map[string]any{}
		for car, v := range byDay[k] {
			cs[car] = map[string]int64{"runs": v[0], "secs": v[1]}
		}
		daily = append(daily, map[string]any{"day": k, "cars": cs})
	}
	out["daily"] = daily

	// how many cars each device has driven
	rows, err = a.db.Query(ctx, `SELECT n, count(*) FROM (SELECT device, count(DISTINCT car) AS n FROM plays WHERE day >= $1 AND runs + secs > 0 GROUP BY device) x GROUP BY n ORDER BY n`, from)
	if bad(err) {
		return
	}
	spread := []map[string]int64{}
	for rows.Next() {
		var n, count int64
		if err := rows.Scan(&n, &count); bad(err) {
			rows.Close()
			return
		}
		spread = append(spread, map[string]int64{"cars": n, "devices": count})
	}
	rows.Close()
	out["spread"] = spread

	// the adverts: in all, and by car and place
	ads, err := a.ads(r)
	if bad(err) {
		return
	}
	names := map[string]Ad{}
	for _, ad := range ads {
		names[ad.ID] = ad
	}
	rows, err = a.db.Query(ctx, `SELECT ad, car, place, sum(views), sum(secs), count(DISTINCT device) FROM ad_views WHERE day >= $1 GROUP BY ad, car, place ORDER BY 5 DESC`, from)
	if bad(err) {
		return
	}
	type adRow struct {
		ID, Name, URL        string
		Video, Gone          bool
		Views, Secs, Devices int64
		Split                []map[string]any
	}
	byAd := map[string]*adRow{}
	order := []*adRow{}
	base := a.publicURL(r)
	for rows.Next() {
		var id, car, place string
		var views, secs, devs int64
		if err := rows.Scan(&id, &car, &place, &views, &secs, &devs); bad(err) {
			rows.Close()
			return
		}
		x := byAd[id]
		if x == nil {
			ad, ok := names[id]
			x = &adRow{ID: id, Name: ad.Name, Gone: !ok, Video: isVideo(ad.File)}
			if ok {
				x.URL = base + "/uploads/ads/" + ad.File
			}
			byAd[id] = x
			order = append(order, x)
		}
		x.Views += views
		x.Secs += secs
		x.Split = append(x.Split, map[string]any{"car": car, "place": place, "views": views, "secs": secs, "devices": devs})
	}
	rows.Close()
	rows, err = a.db.Query(ctx, `SELECT ad, count(DISTINCT device) FROM ad_views WHERE day >= $1 GROUP BY ad`, from)
	if bad(err) {
		return
	}
	for rows.Next() {
		var id string
		var n int64
		if err := rows.Scan(&id, &n); bad(err) {
			rows.Close()
			return
		}
		if x := byAd[id]; x != nil {
			x.Devices = n
		}
	}
	rows.Close()
	sort.SliceStable(order, func(i, j int) bool { return order[i].Secs > order[j].Secs })
	adsOut := []map[string]any{}
	for _, x := range order {
		adsOut = append(adsOut, map[string]any{"id": x.ID, "name": x.Name, "url": x.URL, "video": x.Video, "gone": x.Gone, "views": x.Views, "secs": x.Secs, "devices": x.Devices, "split": x.Split})
	}
	out["ads"] = adsOut

	// the logged-in players: which cars, how many runs, how long
	rows, err = a.db.Query(ctx, `SELECT p.user_id, u.name, u.username, u.photo, p.car, sum(p.runs), sum(p.secs)
		FROM plays p JOIN users u ON u.id = p.user_id WHERE p.day >= $1 GROUP BY p.user_id, u.name, u.username, u.photo, p.car`, from)
	if bad(err) {
		return
	}
	type player struct {
		ID                    int
		Name, Username, Photo string
		Runs, Secs            int64
		Cars                  []map[string]any
	}
	byUser := map[int]*player{}
	for rows.Next() {
		var id int
		var name, username, photo, car string
		var runs, secs int64
		if err := rows.Scan(&id, &name, &username, &photo, &car, &runs, &secs); bad(err) {
			rows.Close()
			return
		}
		p := byUser[id]
		if p == nil {
			p = &player{ID: id, Name: name, Username: username, Photo: photo}
			byUser[id] = p
		}
		p.Runs += runs
		p.Secs += secs
		p.Cars = append(p.Cars, map[string]any{"car": car, "runs": runs, "secs": secs})
	}
	rows.Close()
	ps := make([]*player, 0, len(byUser))
	for _, p := range byUser {
		sort.Slice(p.Cars, func(i, j int) bool { return p.Cars[i]["secs"].(int64) > p.Cars[j]["secs"].(int64) })
		ps = append(ps, p)
	}
	sort.Slice(ps, func(i, j int) bool { return ps[i].Secs > ps[j].Secs })
	if len(ps) > 100 {
		ps = ps[:100]
	}
	players := []map[string]any{}
	for _, p := range ps {
		players = append(players, map[string]any{"id": p.ID, "name": p.Name, "username": p.Username, "photo": p.Photo, "runs": p.Runs, "secs": p.Secs, "cars": p.Cars})
	}
	out["players"] = players
	writeJSON(w, 200, out)
}
