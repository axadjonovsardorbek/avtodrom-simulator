package main

import (
	"bytes"
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"net/url"
	"os"
	"sort"
	"strconv"
	"strings"
	"testing"
	"time"
)

const bot = "123456:TEST-token"

func signWidget(data map[string]string) {
	keys := []string{}
	for k := range data {
		keys = append(keys, k)
	}
	sort.Strings(keys)
	lines := []string{}
	for _, k := range keys {
		lines = append(lines, k+"="+data[k])
	}
	s := sha256.Sum256([]byte(bot))
	data["hash"] = hmacHex(s[:], []byte(strings.Join(lines, "\n")))
}

func TestTelegramWidget(t *testing.T) {
	now := time.Now()
	d := map[string]string{"id": "42", "first_name": "Ali", "username": "ali", "auth_date": strconv.FormatInt(now.Unix(), 10)}
	signWidget(d)
	if id := checkTelegramWidget(d, bot, now); id == nil || id.PID != "42" || id.Name != "Ali" {
		t.Fatalf("a good login was refused: %+v", id)
	}
	d["first_name"] = "Vali"
	if checkTelegramWidget(d, bot, now) != nil {
		t.Fatal("changed data was accepted")
	}
	d["first_name"] = "Ali"
	if checkTelegramWidget(d, "999:other", now) != nil {
		t.Fatal("another bot's login was accepted")
	}
	if checkTelegramWidget(d, bot, now.Add(25*time.Hour)) != nil {
		t.Fatal("a day-old login was accepted")
	}
}

func TestTelegramWebApp(t *testing.T) {
	now := time.Now()
	p := url.Values{"user": {`{"id":7,"first_name":"Gul","username":"gul"}`}, "auth_date": {strconv.FormatInt(now.Unix(), 10)}, "query_id": {"AAA"}}
	lines := []string{}
	for k := range p {
		lines = append(lines, k+"="+p.Get(k))
	}
	sort.Strings(lines)
	m := hmac.New(sha256.New, []byte("WebAppData"))
	m.Write([]byte(bot))
	p.Set("hash", hmacHex(m.Sum(nil), []byte(strings.Join(lines, "\n"))))
	if id := checkTelegramWebApp(p.Encode(), bot, now); id == nil || id.PID != "7" {
		t.Fatalf("a good mini app login was refused: %+v", id)
	}
	p.Set("auth_date", strconv.FormatInt(now.Unix()-5, 10))
	if checkTelegramWebApp(p.Encode(), bot, now) != nil {
		t.Fatal("changed data was accepted")
	}
}

func TestLimiter(t *testing.T) {
	l, now := newLimiter(3, time.Minute), time.Now()
	for i := 0; i < 3; i++ {
		if !l.allow("a", now) {
			t.Fatal("refused too early")
		}
	}
	if l.allow("a", now) || !l.allow("b", now) || !l.allow("a", now.Add(61*time.Second)) {
		t.Fatal("wrong limits")
	}
}

// The API against a real database: TEST_DATABASE_URL=postgres://... go test ./...
func TestAPI(t *testing.T) {
	dbURL := os.Getenv("TEST_DATABASE_URL")
	if dbURL == "" {
		t.Skip("TEST_DATABASE_URL is not set")
	}
	ctx := context.Background()
	db, err := openDB(ctx, dbURL)
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	db.Exec(ctx, "TRUNCATE users, sessions, attempts, settings, plays, ad_views, purchases, promos, promo_uses, orders, admins, admin_sessions RESTART IDENTITY CASCADE")
	cfg := Config{DevLogin: true, UploadDir: t.TempDir(), AdminLogin: "boss", AdminPassword: "secret123", Origins: []string{"https://site.example"}, TelegramToken: bot}
	os.MkdirAll(cfg.UploadDir+"/ads", 0o755)
	srv := httptest.NewServer(newApp(cfg, db).routes())
	defer srv.Close()

	call := func(method, path, token string, body any, want int) map[string]any {
		t.Helper()
		var rd *bytes.Reader
		if b, ok := body.([]byte); ok {
			rd = bytes.NewReader(b)
		} else {
			raw, _ := json.Marshal(body)
			rd = bytes.NewReader(raw)
		}
		req, _ := http.NewRequest(method, srv.URL+path, rd)
		if token != "" {
			req.Header.Set("Authorization", "Bearer "+token)
		}
		if b, ok := body.([]byte); ok && b != nil {
			req.Header.Set("X-File-Name", "reklama.jpg")
		}
		res, err := http.DefaultClient.Do(req)
		if err != nil {
			t.Fatal(err)
		}
		defer res.Body.Close()
		out := map[string]any{}
		json.NewDecoder(res.Body).Decode(&out)
		if res.StatusCode != want {
			t.Fatalf("%s %s: status %d, want %d (%v)", method, path, res.StatusCode, want, out)
		}
		return out
	}
	login := func(name string) (string, map[string]any) {
		out := call("POST", "/api/auth/dev", "", map[string]string{"name": name}, 200)
		return out["token"].(string), out["user"].(map[string]any)
	}

	boss, bu := login("Boss")
	adm := call("POST", "/api/admin/login", "", map[string]string{"login": "Boss", "password": "secret123"}, 200)["token"].(string)
	ali, au := login("Ali")
	// a player account is never an admin, and its token opens nothing in the admin panel; an admin's token is no player's
	if bu["admin"] != false || au["admin"] != false {
		t.Fatalf("admin flags: %v %v", bu["admin"], au["admin"])
	}
	call("GET", "/api/me", "", nil, 401)
	call("GET", "/api/admin/stats", ali, nil, 401)
	call("GET", "/api/admin/stats", boss, nil, 401)
	call("GET", "/api/me", adm, nil, 401)
	call("POST", "/api/admin/login", "", map[string]string{"login": "boss", "password": "wrong-pass"}, 401)
	call("POST", "/api/admin/login", "", map[string]string{"login": "nobody", "password": "secret123"}, 401)
	if me := call("GET", "/api/admin/me", adm, nil, 200)["admin"].(map[string]any); me["login"] != "boss" {
		t.Fatalf("admin me: %v", me)
	}
	// admins: add one, a busy login and a short password refused, not oneself deleted; a password change
	call("POST", "/api/admin/admins", adm, map[string]string{"login": "vali", "name": "Vali", "password": "parol1234"}, 200)
	call("POST", "/api/admin/admins", adm, map[string]string{"login": "vali", "password": "parol1234"}, 409)
	call("POST", "/api/admin/admins", adm, map[string]string{"login": "x1", "password": "short"}, 400)
	vali := call("POST", "/api/admin/login", "", map[string]string{"login": "Vali", "password": "parol1234"}, 200)["token"].(string)
	me := call("GET", "/api/admin/me", vali, nil, 200)["admin"].(map[string]any)
	call("DELETE", "/api/admin/admins/"+strconv.Itoa(int(me["id"].(float64))), vali, nil, 400)
	call("PUT", "/api/admin/password", vali, map[string]string{"old": "bad", "new": "yangiparol"}, 400)
	call("PUT", "/api/admin/password", vali, map[string]string{"old": "parol1234", "new": "yangiparol"}, 200)
	call("POST", "/api/admin/login", "", map[string]string{"login": "vali", "password": "yangiparol"}, 200)
	call("DELETE", "/api/admin/admins/"+strconv.Itoa(int(me["id"].(float64))), adm, nil, 200)
	call("POST", "/api/admin/login", "", map[string]string{"login": "vali", "password": "yangiparol"}, 401)
	call("POST", "/api/admin/logout", vali, nil, 200)

	// paid items: none at first; the admin grants (for good or for some days) and takes back; others cannot
	owns := func(tok string) []any {
		return call("GET", "/api/me", tok, nil, 200)["user"].(map[string]any)["owns"].([]any)
	}
	if len(owns(ali)) != 0 {
		t.Fatal("owns at first")
	}
	aid := strconv.Itoa(int(au["id"].(float64)))
	call("POST", "/api/admin/users/"+aid+"/grant", ali, map[string]any{"item": "car:kia-k5"}, 401)
	call("POST", "/api/admin/users/"+aid+"/grant", adm, map[string]any{"item": "car:../x"}, 400)
	call("POST", "/api/admin/users/"+aid+"/grant", adm, map[string]any{"item": "car:kia-k5"}, 200)
	gr := call("POST", "/api/admin/users/"+aid+"/grant", adm, map[string]any{"item": "instructor:rude", "days": 7}, 200)
	if ps := gr["purchases"].([]any); len(ps) != 2 {
		t.Fatalf("purchases: %v", ps)
	}
	if o := owns(ali); len(o) != 2 || o[0] != "car:kia-k5" || o[1] != "instructor:rude" {
		t.Fatalf("owns: %v", o)
	}
	db.Exec(ctx, "UPDATE purchases SET until = 1 WHERE item = 'instructor:rude'") // ran out
	if o := owns(ali); len(o) != 1 {
		t.Fatalf("owns after the end: %v", o)
	}
	call("DELETE", "/api/admin/users/"+aid+"/grant/car:kia-k5", adm, nil, 200)
	if len(owns(ali)) != 0 {
		t.Fatal("owns after revoke")
	}

	// a Telegram login creates a user too
	d := map[string]string{"id": "555", "first_name": "Tg", "auth_date": strconv.FormatInt(time.Now().Unix(), 10)}
	signWidget(d)
	call("POST", "/api/auth/telegram", "", d, 200)
	d["first_name"] = "Fake"
	call("POST", "/api/auth/telegram", "", d, 401)

	// attempts: one, a batch (the same one again is not doubled), a bad one is skipped
	now := time.Now().UnixMilli()
	call("POST", "/api/attempts", ali, map[string]any{"at": now - 5000, "key": "exam", "passed": true, "total": 15, "t": 600, "car": "cobalt", "mistakes": map[string]any{"5": map[string]any{"n": "5", "text": "Signal", "pts": 5, "count": 3}}}, 200)
	out := call("POST", "/api/attempts", ali, map[string]any{"items": []map[string]any{
		{"at": now - 5000, "key": "exam", "passed": true, "total": 15, "t": 600},
		{"at": now - 3000, "key": "exam", "passed": true, "total": 5, "t": 700},
		{"at": now - 1000, "key": "drop table", "passed": true, "total": 0, "t": 1},
	}}, 200)
	if out["saved"].(float64) != 1 {
		t.Fatalf("saved %v, want 1", out["saved"])
	}
	call("POST", "/api/attempts", boss, map[string]any{"at": now, "key": "exam", "passed": true, "total": 0, "t": 900}, 200)
	mine := call("GET", "/api/me/attempts", ali, nil, 200)
	if len(mine["items"].([]any)) != 2 {
		t.Fatalf("my attempts: %v", mine)
	}

	// leaderboard: Boss (0 points) first, Ali with his best (5)
	lb := call("GET", "/api/leaderboard?key=exam", ali, nil, 200)["items"].([]any)
	if len(lb) != 2 || lb[0].(map[string]any)["name"] != "Boss" || lb[1].(map[string]any)["total"].(float64) != 5 || lb[1].(map[string]any)["me"] != true {
		t.Fatalf("leaderboard: %v", lb)
	}

	// admin: stats, users, blocking
	st := call("GET", "/api/admin/stats", adm, nil, 200)
	if st["users"].(map[string]any)["total"].(float64) != 3 || st["attempts"].(map[string]any)["total"].(float64) != 3 {
		t.Fatalf("stats: %v", st)
	}
	if ms := st["mistakes"].([]any); len(ms) != 1 || ms[0].(map[string]any)["pts"].(float64) != 5 {
		t.Fatalf("mistakes: %v", st["mistakes"])
	}
	us := call("GET", "/api/admin/users?q=ali", adm, nil, 200)
	if us["total"].(float64) != 1 {
		t.Fatalf("user search: %v", us)
	}
	aliID := strconv.Itoa(int(au["id"].(float64)))
	call("PATCH", "/api/admin/users/"+aliID, adm, map[string]bool{"blocked": true}, 200)
	call("GET", "/api/me", ali, nil, 401) // logged out
	call("POST", "/api/auth/dev", "", map[string]string{"name": "Ali"}, 403)
	if lb := call("GET", "/api/leaderboard", "", nil, 200)["items"].([]any); len(lb) != 1 {
		t.Fatalf("a blocked user stays on the leaderboard: %v", lb)
	}
	call("DELETE", "/api/admin/users/"+aliID, adm, nil, 200)
	call("GET", "/api/admin/users/"+aliID, adm, nil, 404)

	// advertising: before any upload the site's own list is used; then the uploaded one
	if _, has := call("GET", "/api/config", "", nil, 200)["ads"]; has {
		t.Fatal("ads before any were set")
	}
	call("POST", "/api/admin/ads", adm, []byte{}, 400) // empty
	ads := call("POST", "/api/admin/ads", adm, []byte("\xff\xd8\xff picture"), 200)["items"].([]any)
	id := ads[0].(map[string]any)["id"].(string)
	cfgOut := call("GET", "/api/config", "", nil, 200)
	if items := cfgOut["ads"].([]any); len(items) != 1 || !strings.Contains(items[0].(map[string]any)["src"].(string), "/uploads/ads/") {
		t.Fatalf("config ads: %v", cfgOut["ads"])
	}
	res, _ := http.Get(ads[0].(map[string]any)["url"].(string))
	if res.StatusCode != 200 {
		t.Fatalf("uploaded file: %d", res.StatusCode)
	}
	res.Body.Close()
	// on the rear window of the Cobalt only
	call("PUT", "/api/admin/ads", adm, map[string]any{"items": []map[string]any{{"id": id, "sec": 9, "on": true, "place": "rear", "cars": []string{"cobalt", "cobalt", "BAD!"}}}}, 200)
	if it := call("GET", "/api/config", "", nil, 200)["ads"].([]any)[0].(map[string]any); it["place"] != "rear" || len(it["cars"].([]any)) != 1 || it["id"] != id {
		t.Fatalf("ad place and cars: %v", it)
	}
	// what is played and seen: twice from one device (added up), once from another, logged in
	track := func(token, device string, runs, secs int) {
		call("POST", "/api/track", token, map[string]any{"device": device, "plays": []map[string]any{{"car": "cobalt", "runs": runs, "secs": secs}, {"car": "matiz", "runs": 1, "secs": 30}},
			"ads": []map[string]any{{"id": id, "car": "cobalt", "place": "rear", "views": 2, "secs": 40}}}, 204)
	}
	track("", "dev0000aaaa", 1, 100)
	track("", "dev0000aaaa", 0, 50)
	track(boss, "dev0000bbbb", 2, 200)
	call("POST", "/api/track", "", map[string]any{"device": "x"}, 400)
	an := call("GET", "/api/admin/analytics?days=7", adm, nil, 200)
	if tt := an["totals"].(map[string]any); tt["devices"].(float64) != 2 || tt["runs"].(float64) != 6 || tt["secs"].(float64) != 440 || tt["adViews"].(float64) != 6 {
		t.Fatalf("analytics totals: %v", tt)
	}
	if c := an["cars"].([]any)[0].(map[string]any); c["car"] != "cobalt" || c["secs"].(float64) != 350 || c["devices"].(float64) != 2 || c["users"].(float64) != 1 {
		t.Fatalf("analytics cars: %v", an["cars"])
	}
	if ad := an["ads"].([]any)[0].(map[string]any); ad["secs"].(float64) != 120 || ad["devices"].(float64) != 2 {
		t.Fatalf("analytics ads: %v", an["ads"])
	}
	if ps := an["players"].([]any); len(ps) != 1 || ps[0].(map[string]any)["name"] != "Boss" || len(ps[0].(map[string]any)["cars"].([]any)) != 2 {
		t.Fatalf("analytics players: %v", an["players"])
	}
	call("GET", "/api/admin/analytics", "", nil, 401)
	call("PUT", "/api/admin/ads", adm, map[string]any{"items": []map[string]any{{"id": id, "sec": 12, "on": false}}}, 200)
	if items := call("GET", "/api/config", "", nil, 200)["ads"].([]any); len(items) != 0 {
		t.Fatalf("a switched-off ad is shown: %v", items)
	}
	call("DELETE", "/api/admin/ads/"+id, adm, nil, 200)

	// cars
	call("PUT", "/api/admin/cars", adm, map[string]any{"disabled": []string{"damas", "bad id!"}}, 200)
	if dc := call("GET", "/api/config", "", nil, 200)["disabledCars"].([]any); len(dc) != 1 || dc[0] != "damas" {
		t.Fatalf("disabled cars: %v", dc)
	}

	// CORS: the site's origin is answered, another is not
	req, _ := http.NewRequest("OPTIONS", srv.URL+"/api/me", nil)
	req.Header.Set("Origin", "https://site.example")
	res, _ = http.DefaultClient.Do(req)
	if res.Header.Get("Access-Control-Allow-Origin") != "https://site.example" {
		t.Fatal("CORS for the site")
	}
	req.Header.Set("Origin", "https://evil.example")
	res, _ = http.DefaultClient.Do(req)
	if res.Header.Get("Access-Control-Allow-Origin") != "" {
		t.Fatal("CORS for another site")
	}
}

// the bot login: start, the user's own number confirms it (someone else's does not), the poll logs in once
func TestTelegramBotLogin(t *testing.T) {
	a := newApp(Config{TelegramToken: "x", TelegramBot: "testbot"}, nil)
	var said []string
	a.tgOut = func(_ int64, text string) { said = append(said, text) }
	rec := httptest.NewRecorder()
	a.handleTgStart(rec, httptest.NewRequest("POST", "/api/auth/tg-start", nil))
	var st struct{ Nonce, Link string }
	json.NewDecoder(rec.Body).Decode(&st)
	if !nonceRe.MatchString(st.Nonce) || st.Link != "https://t.me/testbot?start="+st.Nonce {
		t.Fatalf("start: %+v", st)
	}
	poll := func() int {
		rec := httptest.NewRecorder()
		a.handleTgPoll(rec, httptest.NewRequest("POST", "/api/auth/tg-poll", strings.NewReader(`{"nonce":"`+st.Nonce+`"}`)))
		return rec.Code
	}
	if c := poll(); c != 202 {
		t.Fatalf("poll before: %d", c)
	}
	msg := func(text string, contactOf int64) tgUpdate {
		var u tgUpdate
		raw := `{"message":{"from":{"id":42,"first_name":"Ali"},"chat":{"id":42,"type":"private"},"text":` + strconv.Quote(text)
		if contactOf != 0 {
			raw += `,"contact":{"phone_number":"998901234567","user_id":` + strconv.FormatInt(contactOf, 10) + `}`
		}
		json.Unmarshal([]byte(raw+`}}`), &u)
		return u
	}
	ctx := context.Background()
	a.tgHandle(ctx, msg("/start "+st.Nonce, 0))
	a.tgHandle(ctx, msg("", 7)) // someone else's card
	if c := poll(); c != 202 {
		t.Fatalf("someone else's number confirmed it: %d", c)
	}
	a.tgHandle(ctx, msg("", 42))
	p := a.tg.pending[st.Nonce]
	if p == nil || p.id == nil || p.id.PID != "42" || p.id.Phone != "+998901234567" || p.id.Name != "Ali" {
		t.Fatalf("confirmed identity: %+v", p)
	}
	if len(said) != 3 || !strings.Contains(said[1], "o'zingizning") || !strings.Contains(said[2], "Tasdiqlandi") {
		t.Fatalf("bot said: %q", said)
	}
	// a start with an unknown nonce only greets
	a.tgHandle(ctx, msg("/start deadbeef", 0))
	if !strings.Contains(said[3], "Salom") {
		t.Fatalf("unknown start: %q", said[3])
	}
	// /help explains the steps
	a.tgHandle(ctx, msg("/help", 0))
	if !strings.Contains(said[4], "Raqamni yuborish") {
		t.Fatalf("help: %q", said[4])
	}
}

// the shop: prices and the switch set by the admin, promo codes, a payment through a stand-in for inPAY whose
// callback is not believed until inPAY's own record says paid, a free code, the bundle
func TestShop(t *testing.T) {
	dbURL := os.Getenv("TEST_DATABASE_URL")
	if dbURL == "" {
		t.Skip("TEST_DATABASE_URL not set")
	}
	ctx := context.Background()
	db, err := openDB(ctx, dbURL)
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	db.Exec(ctx, "TRUNCATE users, sessions, attempts, settings, plays, ad_views, purchases, promos, promo_uses, orders, admins, admin_sessions RESTART IDENTITY CASCADE")

	// inPAY stand-in
	var payState = map[string]string{}
	var created []map[string]any
	fake := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		switch {
		case r.URL.Path == "/authorization/":
			if r.URL.Query().Get("merchant_token") != "secret" {
				w.WriteHeader(401)
				w.Write([]byte(`{"success":false}`))
				return
			}
			w.Write([]byte(`{"success":true,"token":"tok123"}`))
		case r.URL.Path == "/create/":
			if r.Header.Get("Authorization") != "Bearer tok123" {
				w.WriteHeader(401)
				return
			}
			var b map[string]any
			json.NewDecoder(r.Body).Decode(&b)
			created = append(created, b)
			id := strconv.Itoa(1000 + len(created))
			payState[id] = "pending"
			w.Write([]byte(`{"success":true,"order_id":` + id + `,"pay_url":"https://inpay.uz/pay/` + id + `"}`))
		case r.URL.Path == "/transactions/":
			id := r.URL.Query().Get("order_id")
			amt := "0"
			for i, b := range created {
				if strconv.Itoa(1001+i) == id {
					amt = strconv.FormatFloat(b["amount"].(float64), 'f', 2, 64)
				}
			}
			w.Write([]byte(`{"success":true,"data":{"order_id":"` + id + `","status":"` + payState[id] + `","amount":"` + amt + `"}}`))
		default:
			w.WriteHeader(404)
		}
	}))
	defer fake.Close()

	cfg := Config{DevLogin: true, UploadDir: t.TempDir(), AdminLogin: "boss", AdminPassword: "secret123", InpayURL: fake.URL, InpayMerchant: "m1", InpayToken: "secret", PublicURL: "https://site.example"}
	srv := httptest.NewServer(newApp(cfg, db).routes())
	defer srv.Close()
	call := func(method, path, token string, body any, want int) map[string]any {
		t.Helper()
		raw, _ := json.Marshal(body)
		req, _ := http.NewRequest(method, srv.URL+path, bytes.NewReader(raw))
		if token != "" {
			req.Header.Set("Authorization", "Bearer "+token)
		}
		res, err := http.DefaultClient.Do(req)
		if err != nil {
			t.Fatal(err)
		}
		defer res.Body.Close()
		out := map[string]any{}
		json.NewDecoder(res.Body).Decode(&out)
		if res.StatusCode != want {
			t.Fatalf("%s %s: status %d, want %d (%v)", method, path, res.StatusCode, want, out)
		}
		return out
	}
	login := func(name string) string {
		return call("POST", "/api/auth/dev", "", map[string]string{"name": name}, 200)["token"].(string)
	}
	ali := login("Ali")
	adm := call("POST", "/api/admin/login", "", map[string]string{"login": "Boss", "password": "secret123"}, 200)["token"].(string)
	owns := func() []any { return call("GET", "/api/me", ali, nil, 200)["user"].(map[string]any)["owns"].([]any) }

	// at first: selling on, six paid items, nothing priced so nothing offered
	sh := call("GET", "/api/shop", "", nil, 200)
	if sh["enabled"] != true || len(sh["paid"].([]any)) != 6 || len(sh["products"].([]any)) != 0 || sh["payments"] != true {
		t.Fatalf("default shop: %v", sh)
	}
	// the admin prices the K5 (for good) and the bundle (30 days)
	shop := map[string]any{"enabled": true, "paid": []string{"car:kia-k5", "instructor:rude"}, "products": []map[string]any{
		{"id": "car:kia-k5", "name": "Kia K5", "items": []string{"car:kia-k5"}, "price": 20000, "days": 0, "on": true},
		{"id": "all", "name": "Hammasi", "items": []string{"all"}, "price": 50000, "days": 30, "on": true},
	}}
	call("PUT", "/api/admin/shop", ali, shop, 401)
	call("PUT", "/api/admin/shop", adm, map[string]any{"enabled": true, "products": []map[string]any{{"id": "x", "name": "X", "items": []string{"car:x"}, "price": 500, "on": true}}}, 400)
	call("PUT", "/api/admin/shop", adm, shop, 200)
	if n := len(call("GET", "/api/shop", "", nil, 200)["products"].([]any)); n != 2 {
		t.Fatalf("products on sale: %d", n)
	}

	// promo codes: 25% on the K5 only, limited to one use; a free one
	call("POST", "/api/admin/promos", adm, map[string]any{"code": "k25", "kind": "percent", "value": 25, "products": []string{"car:kia-k5"}, "maxUses": 1, "active": true}, 200)
	call("POST", "/api/admin/promos", adm, map[string]any{"code": "GIFT", "kind": "free", "active": true}, 200)
	call("POST", "/api/admin/promos", adm, map[string]any{"code": "BAD", "kind": "percent", "value": 150, "active": true}, 400)
	q := call("POST", "/api/shop/quote", ali, map[string]any{"product": "car:kia-k5", "promo": "k25"}, 200)
	if q["total"].(float64) != 15000 || q["discount"].(float64) != 5000 {
		t.Fatalf("quote: %v", q)
	}
	call("POST", "/api/shop/quote", ali, map[string]any{"product": "all", "promo": "K25"}, 400)  // not for this product
	call("POST", "/api/shop/quote", ali, map[string]any{"product": "all", "promo": "NOPE"}, 400) // no such code

	// buying: an order and inPAY's page for 15 000
	b := call("POST", "/api/shop/buy", ali, map[string]any{"product": "car:kia-k5", "promo": "K25"}, 200)
	if b["payUrl"] != "https://inpay.uz/pay/1001" || created[0]["amount"].(float64) != 15000 || created[0]["callback_url"] != "https://site.example/api/shop/inpay" {
		t.Fatalf("buy: %v %v", b, created)
	}
	order := strconv.Itoa(int(b["order"].(float64)))
	// a forged callback saying "success" while inPAY's record is still pending: nothing is given
	call("POST", "/api/shop/inpay", "", map[string]any{"order_id": "1001", "status": "success", "amount": "15000.00"}, 200)
	if len(owns()) != 0 {
		t.Fatal("given on a forged callback")
	}
	if st := call("GET", "/api/shop/orders/"+order, ali, nil, 200)["status"]; st != "pending" {
		t.Fatalf("order: %v", st)
	}
	// paid at inPAY: the callback (twice) settles it once
	payState["1001"] = "success"
	call("POST", "/api/shop/inpay", "", map[string]any{"order_id": 1001}, 200)
	call("POST", "/api/shop/inpay", "", map[string]any{"order_id": 1001}, 200)
	if o := owns(); len(o) != 1 || o[0] != "car:kia-k5" {
		t.Fatalf("owns after paying: %v", o)
	}
	if st := call("GET", "/api/shop/orders/"+order, ali, nil, 200)["status"]; st != "paid" {
		t.Fatalf("order: %v", st)
	}
	// the code was for one use only, and Ali has used it
	call("POST", "/api/shop/quote", ali, map[string]any{"product": "car:kia-k5", "promo": "K25"}, 400)

	// someone else's order is not shown
	vali := login("Vali")
	call("GET", "/api/shop/orders/"+order, vali, nil, 404)

	// the bundle with the free code: given at once, for 30 days, as "all"
	d := call("POST", "/api/shop/buy", vali, map[string]any{"product": "all", "promo": "GIFT"}, 200)
	if d["done"] != true || d["user"].(map[string]any)["owns"].([]any)[0] != "all" {
		t.Fatalf("free bundle: %v", d)
	}
	var until int64
	db.QueryRow(ctx, "SELECT until FROM purchases WHERE item = 'all'").Scan(&until)
	if days := (until - time.Now().UnixMilli()) / 86400000; days < 29 || days > 30 {
		t.Fatalf("bundle days: %d", days)
	}

	// the admin's orders list and the money
	or := call("GET", "/api/admin/orders", adm, nil, 200)
	if or["paidTotal"].(float64) != 15000 || or["paidCount"].(float64) != 2 {
		t.Fatalf("orders: %v %v", or["paidTotal"], or["paidCount"])
	}

	// selling off: nothing is paid, nothing can be bought
	shop["enabled"] = false
	call("PUT", "/api/admin/shop", adm, shop, 200)
	if sh := call("GET", "/api/shop", "", nil, 200); len(sh["paid"].([]any)) != 0 {
		t.Fatalf("off: %v", sh)
	}
	call("POST", "/api/shop/buy", ali, map[string]any{"product": "all"}, 400)
}

// the site switches, the log of admin changes, the money summary, the order list and the CSV downloads
func TestAdminExtras(t *testing.T) {
	dbURL := os.Getenv("TEST_DATABASE_URL")
	if dbURL == "" {
		t.Skip("TEST_DATABASE_URL not set")
	}
	ctx := context.Background()
	db, err := openDB(ctx, dbURL)
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	db.Exec(ctx, "TRUNCATE users, sessions, attempts, settings, plays, ad_views, purchases, promos, promo_uses, orders, audit, admins, admin_sessions RESTART IDENTITY CASCADE")
	cfg := Config{DevLogin: true, UploadDir: t.TempDir(), AdminLogin: "boss", AdminPassword: "secret123"}
	srv := httptest.NewServer(newApp(cfg, db).routes())
	defer srv.Close()
	call := func(method, path, token string, body any, want int) map[string]any {
		t.Helper()
		raw, _ := json.Marshal(body)
		req, _ := http.NewRequest(method, srv.URL+path, bytes.NewReader(raw))
		if token != "" {
			req.Header.Set("Authorization", "Bearer "+token)
		}
		res, err := http.DefaultClient.Do(req)
		if err != nil {
			t.Fatal(err)
		}
		defer res.Body.Close()
		out := map[string]any{}
		json.NewDecoder(res.Body).Decode(&out)
		if res.StatusCode != want {
			t.Fatalf("%s %s: status %d, want %d (%v)", method, path, res.StatusCode, want, out)
		}
		return out
	}
	login := func(name string) string {
		return call("POST", "/api/auth/dev", "", map[string]string{"name": name}, 200)["token"].(string)
	}
	ali := login("Ali")
	adm := call("POST", "/api/admin/login", "", map[string]string{"login": "Boss", "password": "secret123"}, 200)["token"].(string)

	// maintenance and a banner; the game sees them in /api/config, an expired banner is not shown
	call("PUT", "/api/admin/site", ali, map[string]any{"maintenance": true}, 401)
	call("PUT", "/api/admin/site", adm, map[string]any{"maintenance": true, "maintenanceText": "Tez orada", "banner": "Yangi K5", "bannerKind": "promo"}, 200)
	site := call("GET", "/api/config", "", nil, 200)["site"].(map[string]any)
	if site["maintenance"] != true || site["banner"] != "Yangi K5" || site["bannerKind"] != "promo" {
		t.Fatalf("site: %v", site)
	}
	call("PUT", "/api/admin/site", adm, map[string]any{"banner": "Eski", "bannerUntil": 1000}, 200)
	if _, ok := call("GET", "/api/config", "", nil, 200)["site"].(map[string]any)["banner"]; ok {
		t.Fatal("expired banner shown")
	}

	// the log: both changes, newest first, a refused one not at all
	items := call("GET", "/api/admin/audit", adm, nil, 200)["items"].([]any)
	if len(items) != 2 || items[0].(map[string]any)["action"] != "PUT /api/admin/site" || items[0].(map[string]any)["admin"] != "boss" {
		t.Fatalf("audit: %v", items)
	}
	call("GET", "/api/admin/audit", ali, nil, 401)

	// money: a paid and a pending order
	now := time.Now().UnixMilli()
	db.Exec(ctx, "INSERT INTO orders (user_id, product, name, items, days, price, amount, promo, status, created, paid_at) VALUES (1, 'all', 'Hammasi', '{all}', 30, 50000, 40000, 'X20', 'paid', $1, $1), (1, 'car:kia-k5', 'Kia K5', '{car:kia-k5}', 0, 20000, 20000, '', 'pending', $1, NULL)", now)
	rev := call("GET", "/api/admin/revenue?days=7", adm, nil, 200)
	if rev["today"].(map[string]any)["sum"].(float64) != 40000 || rev["buyers"].(float64) != 1 || len(rev["daily"].([]any)) != 7 || rev["promos"].([]any)[0].(map[string]any)["sum"].(float64) != 10000 {
		t.Fatalf("revenue: %v", rev)
	}
	if n := len(call("GET", "/api/admin/order-list?status=pending", adm, nil, 200)["items"].([]any)); n != 1 {
		t.Fatalf("pending orders: %d", n)
	}
	if n := len(call("GET", "/api/admin/order-list?q=hamma", adm, nil, 200)["items"].([]any)); n != 1 {
		t.Fatalf("search: %d", n)
	}

	// CSV: a header row and the one player (admins are not players)
	req, _ := http.NewRequest("GET", srv.URL+"/api/admin/export/users", nil)
	req.Header.Set("Authorization", "Bearer "+adm)
	res, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	body, _ := io.ReadAll(res.Body)
	res.Body.Close()
	if res.StatusCode != 200 || !strings.HasPrefix(res.Header.Get("Content-Type"), "text/csv") || strings.Count(string(body), "\n") != 2 {
		t.Fatalf("csv: %d %q", res.StatusCode, body)
	}
	call("GET", "/api/admin/export/nope", adm, nil, 404)
}

// the default admin (admin / 1234) must change the password first; the keys set in the panel take effect at once
func TestDefaultAdminAndIntegrations(t *testing.T) {
	dbURL := os.Getenv("TEST_DATABASE_URL")
	if dbURL == "" {
		t.Skip("TEST_DATABASE_URL is not set")
	}
	ctx := context.Background()
	db, err := openDB(ctx, dbURL)
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	db.Exec(ctx, "TRUNCATE users, sessions, attempts, settings, plays, ad_views, purchases, promos, promo_uses, orders, audit, admins, admin_sessions RESTART IDENTITY CASCADE")
	srv := httptest.NewServer(newApp(Config{UploadDir: t.TempDir(), GoogleClientID: "env-id"}, db).routes())
	defer srv.Close()
	call := func(method, path, token string, body any, want int) map[string]any {
		t.Helper()
		raw, _ := json.Marshal(body)
		req, _ := http.NewRequest(method, srv.URL+path, bytes.NewReader(raw))
		if token != "" {
			req.Header.Set("Authorization", "Bearer "+token)
		}
		res, err := http.DefaultClient.Do(req)
		if err != nil {
			t.Fatal(err)
		}
		defer res.Body.Close()
		out := map[string]any{}
		json.NewDecoder(res.Body).Decode(&out)
		if res.StatusCode != want {
			t.Fatalf("%s %s: status %d, want %d (%v)", method, path, res.StatusCode, want, out)
		}
		return out
	}
	out := call("POST", "/api/admin/login", "", map[string]string{"login": "admin", "password": "1234"}, 200)
	adm := out["token"].(string)
	if out["admin"].(map[string]any)["mustChange"] != true {
		t.Fatal("the default admin is not asked to change the password")
	}
	call("GET", "/api/admin/stats", adm, nil, 403)
	call("PUT", "/api/admin/password", adm, map[string]string{"old": "1234", "new": "short"}, 400)
	call("PUT", "/api/admin/password", adm, map[string]string{"old": "1234", "new": "yangi-parol"}, 200)
	call("GET", "/api/admin/stats", adm, nil, 200)
	call("POST", "/api/admin/login", "", map[string]string{"login": "admin", "password": "1234"}, 401)

	// copied once from the environment, then changed in the panel; secrets come back only as their tail
	if g := call("GET", "/api/admin/integrations", adm, nil, 200)["integrations"].(map[string]any); g["googleClientId"] != "env-id" || g["payments"] != false {
		t.Fatalf("integrations: %v", g)
	}
	g := call("PUT", "/api/admin/integrations", adm, map[string]any{"googleClientId": "new-id", "telegramBot": "@rulda_bot", "telegramToken": "123:abcdWXYZ", "inpayMerchant": "m1", "inpayToken": "tok-secret"}, 200)["integrations"].(map[string]any)
	if g["telegramBot"] != "rulda_bot" || g["telegramToken"].(map[string]any)["tail"] != "WXYZ" || g["payments"] != true || g["inpayUrl"] != inpayDefaultURL {
		t.Fatalf("saved: %v", g)
	}
	if c := call("GET", "/api/config", "", nil, 200); c["googleClientId"] != "new-id" || c["telegramBot"] != "rulda_bot" {
		t.Fatalf("config: %v", c)
	}
	// an empty secret keeps the stored one; clear removes it
	g = call("PUT", "/api/admin/integrations", adm, map[string]any{"googleClientId": "new-id", "inpayMerchant": "m1", "clear": []string{"telegramToken"}}, 200)["integrations"].(map[string]any)
	if g["telegramToken"].(map[string]any)["set"] != false || g["payments"] != true {
		t.Fatalf("kept / cleared: %v", g)
	}
	if items := call("GET", "/api/admin/audit", adm, nil, 200)["items"].([]any); strings.Contains(fmt.Sprint(items), "tok-secret") || strings.Contains(fmt.Sprint(items), "yangi-parol") {
		t.Fatal("a secret went into the log")
	}
}
