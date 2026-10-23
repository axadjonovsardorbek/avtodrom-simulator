// Avtodrom simulator server: accounts (Google, Telegram), attempt history, the leaderboard and the
// admin panel's API (users, results, advertising, cars). Configured by environment variables, see
// README.md and .env.example.
package main

import (
	"context"
	"encoding/json"
	"errors"
	"log"
	"net"
	"net/http"
	"os"
	"os/signal"
	"path/filepath"
	"strings"
	"sync"
	"sync/atomic"
	"syscall"
	"time"
	_ "time/tzdata" // Asia/Tashkent without the system's zone files
)

type Config struct {
	Addr, DatabaseURL, GoogleClientID, TelegramToken, TelegramBot, UploadDir, StaticDir, PublicURL string
	InpayURL, InpayMerchant, InpayToken                                                            string   // payments (shop.go)
	AdminLogin, AdminPassword                                                                      string   // tests only: the first admin (otherwise admin / 1234, changed at first login)
	Origins                                                                                        []string // allowed CORS origins; "*" any
	DevLogin, TrustProxy                                                                           bool
}

func env(k, dflt string) string {
	if v := strings.TrimSpace(os.Getenv(k)); v != "" {
		return v
	}
	return dflt
}

func loadConfig() Config {
	c := Config{
		Addr: env("ADDR", ":8080"), DatabaseURL: env("DATABASE_URL", ""),
		GoogleClientID: env("GOOGLE_CLIENT_ID", ""), TelegramToken: env("TELEGRAM_BOT_TOKEN", ""), TelegramBot: strings.TrimPrefix(env("TELEGRAM_BOT_NAME", ""), "@"),
		UploadDir: env("UPLOAD_DIR", "uploads"), StaticDir: env("STATIC_DIR", ""), PublicURL: strings.TrimRight(env("PUBLIC_URL", ""), "/"),
		DevLogin: env("DEV_LOGIN", "") == "1", TrustProxy: env("TRUST_PROXY", "") == "1",
		InpayURL: strings.TrimRight(env("INPAY_URL", inpayDefaultURL), "/"), InpayMerchant: env("INPAY_MERCHANT_ID", ""), InpayToken: env("INPAY_MERCHANT_TOKEN", ""),
	}
	for _, o := range strings.Split(env("CORS_ORIGINS", "*"), ",") {
		if o = strings.TrimRight(strings.TrimSpace(o), "/"); o != "" {
			c.Origins = append(c.Origins, o)
		}
	}
	return c
}

type App struct {
	cfg     Config
	db      *DB
	tz      *time.Location
	limiter *limiter
	tg      *tgLogins
	tgOut   func(chat int64, text string) // tests: catches what the bot would send
	inpay   *inpayClient
	ig      atomic.Pointer[Integrations] // keys of Google, Telegram, inPAY: kept in Postgres, set in the admin panel
}

func main() {
	cfg := loadConfig()
	if cfg.DatabaseURL == "" {
		log.Fatal("DATABASE_URL is not set")
	}
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()
	db, err := openDB(ctx, cfg.DatabaseURL)
	if err != nil {
		log.Fatalf("database: %v", err)
	}
	defer db.Close()
	if err := os.MkdirAll(filepath.Join(cfg.UploadDir, "ads"), 0o755); err != nil {
		log.Fatalf("upload dir: %v", err)
	}
	if cfg.DevLogin {
		log.Print("WARNING: DEV_LOGIN=1: anyone can log in by name (local testing only)")
	}
	app := newApp(cfg, db)
	go app.runTelegramBot(ctx)
	srv := &http.Server{Addr: cfg.Addr, Handler: app.routes(), ReadHeaderTimeout: 10 * time.Second, IdleTimeout: 120 * time.Second}
	go func() {
		<-ctx.Done()
		sh, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cancel()
		srv.Shutdown(sh)
	}()
	log.Printf("listening on %s", cfg.Addr)
	if err := srv.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
		log.Fatal(err)
	}
}

func newApp(cfg Config, db *DB) *App {
	tz, err := time.LoadLocation("Asia/Tashkent")
	if err != nil {
		tz = time.FixedZone("UZT", 5*3600)
	}
	a := &App{cfg: cfg, db: db, tz: tz, limiter: newLimiter(40, time.Minute), tg: newTgLogins(), inpay: newInpay(cfg)}
	a.loadIntegrations(context.Background())
	a.bootstrapAdmin(context.Background())
	return a
}

func (a *App) routes() http.Handler {
	mux := http.NewServeMux()
	// public
	mux.HandleFunc("GET /api/config", a.handleConfig)
	mux.HandleFunc("POST /api/auth/google", a.limited(a.handleGoogle))
	mux.HandleFunc("POST /api/auth/telegram", a.limited(a.handleTelegram))
	mux.HandleFunc("POST /api/auth/telegram-webapp", a.limited(a.handleTelegramWebApp))
	mux.HandleFunc("POST /api/auth/tg-start", a.limited(a.handleTgStart))
	mux.HandleFunc("POST /api/auth/tg-poll", a.handleTgPoll) // every 2 s while the bot is open; the nonce is unguessable
	mux.HandleFunc("POST /api/auth/dev", a.limited(a.handleDevLogin))
	mux.HandleFunc("GET /api/me", a.authed(a.handleMe))
	mux.HandleFunc("POST /api/logout", a.handleLogout)
	mux.HandleFunc("GET /api/me/attempts", a.authed(a.handleMyAttempts))
	mux.HandleFunc("POST /api/attempts", a.limited(a.authed(a.handlePostAttempts)))
	mux.HandleFunc("POST /api/track", a.limited(a.handleTrack))
	mux.HandleFunc("GET /api/leaderboard", a.handleLeaderboard)
	// admin
	mux.HandleFunc("GET /api/admin/stats", a.admin(a.handleStats))
	mux.HandleFunc("GET /api/admin/users", a.admin(a.handleUsers))
	mux.HandleFunc("GET /api/admin/users/{id}", a.admin(a.handleUser))
	mux.HandleFunc("PATCH /api/admin/users/{id}", a.logged(a.handlePatchUser))
	mux.HandleFunc("DELETE /api/admin/users/{id}", a.logged(a.handleDeleteUser))
	mux.HandleFunc("GET /api/shop", a.handleShop)
	mux.HandleFunc("POST /api/shop/quote", a.limited(a.authed(a.handleQuote)))
	mux.HandleFunc("POST /api/shop/buy", a.limited(a.authed(a.handleBuy)))
	mux.HandleFunc("GET /api/shop/orders/{id}", a.authed(a.handleOrder))
	mux.HandleFunc("POST /api/shop/inpay", a.handleInpayWebhook) // inPAY: checked against inPAY's own record, not trusted
	mux.HandleFunc("GET /api/admin/shop", a.admin(a.handleGetShop))
	mux.HandleFunc("PUT /api/admin/shop", a.logged(a.handlePutShop))
	mux.HandleFunc("GET /api/admin/promos", a.admin(a.handleGetPromos))
	mux.HandleFunc("POST /api/admin/promos", a.logged(a.handlePutPromo))
	mux.HandleFunc("DELETE /api/admin/promos/{code}", a.logged(a.handleDeletePromo))
	mux.HandleFunc("GET /api/admin/orders", a.admin(a.handleOrders))
	mux.HandleFunc("POST /api/admin/users/{id}/grant", a.logged(a.handleGrant))
	mux.HandleFunc("DELETE /api/admin/users/{id}/grant/{item}", a.logged(a.handleRevoke))
	mux.HandleFunc("GET /api/admin/attempts", a.admin(a.handleAttempts))
	mux.HandleFunc("GET /api/admin/analytics", a.admin(a.handleAnalytics))
	mux.HandleFunc("GET /api/admin/ads", a.admin(a.handleGetAds))
	mux.HandleFunc("PUT /api/admin/ads", a.logged(a.handlePutAds))
	mux.HandleFunc("POST /api/admin/ads", a.logged(a.handleUploadAd))
	mux.HandleFunc("DELETE /api/admin/ads/{id}", a.logged(a.handleDeleteAd))
	mux.HandleFunc("GET /api/admin/cars", a.admin(a.handleGetCars))
	mux.HandleFunc("PUT /api/admin/cars", a.logged(a.handlePutCars))
	mux.HandleFunc("POST /api/admin/login", a.limited(a.handleAdminLogin))
	mux.HandleFunc("POST /api/admin/logout", a.handleAdminLogout)
	mux.HandleFunc("GET /api/admin/me", a.admin(a.handleAdminMe))
	mux.HandleFunc("GET /api/admin/admins", a.admin(a.handleAdmins))
	mux.HandleFunc("POST /api/admin/admins", a.logged(a.handleAddAdmin))
	mux.HandleFunc("DELETE /api/admin/admins/{id}", a.logged(a.handleDeleteAdmin))
	mux.HandleFunc("PUT /api/admin/password", a.logged(a.handleAdminPassword))
	mux.HandleFunc("GET /api/admin/audit", a.admin(a.handleAudit))
	mux.HandleFunc("GET /api/admin/integrations", a.admin(a.handleGetIntegrations))
	mux.HandleFunc("PUT /api/admin/integrations", a.logged(a.handlePutIntegrations))
	mux.HandleFunc("GET /api/admin/site", a.admin(a.handleGetSite))
	mux.HandleFunc("PUT /api/admin/site", a.logged(a.handlePutSite))
	mux.HandleFunc("GET /api/admin/revenue", a.admin(a.handleRevenue))
	mux.HandleFunc("GET /api/admin/order-list", a.admin(a.handleOrderList))
	mux.HandleFunc("GET /api/admin/export/{what}", a.admin(a.handleExport))
	mux.HandleFunc("/api/", func(w http.ResponseWriter, r *http.Request) { fail(w, 404, "not found") })
	// uploaded advertising (http.FileServer answers Range requests: videos stream and seek)
	mux.Handle("GET /uploads/", http.StripPrefix("/uploads/", noList(http.FileServer(http.Dir(a.cfg.UploadDir)))))
	// the simulator itself, when this server hosts it too
	if a.cfg.StaticDir != "" {
		mux.Handle("/", http.FileServer(http.Dir(a.cfg.StaticDir))) // no method: "GET /" would clash with "/api/"
	}
	return a.recoverer(a.cors(mux))
}

// ---- middleware and helpers

func (a *App) cors(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if o := r.Header.Get("Origin"); o != "" && a.originAllowed(o) {
			w.Header().Set("Access-Control-Allow-Origin", o)
			w.Header().Set("Vary", "Origin")
			w.Header().Set("Access-Control-Allow-Headers", "Authorization, Content-Type, X-File-Name")
			w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS")
			w.Header().Set("Access-Control-Max-Age", "86400")
		}
		if r.Method == "OPTIONS" {
			w.WriteHeader(204)
			return
		}
		next.ServeHTTP(w, r)
	})
}

func (a *App) originAllowed(o string) bool {
	for _, x := range a.cfg.Origins {
		if x == "*" || strings.EqualFold(x, o) {
			return true
		}
	}
	return false
}

func (a *App) recoverer(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		defer func() {
			if e := recover(); e != nil {
				log.Printf("panic %s %s: %v", r.Method, r.URL.Path, e)
				fail(w, 500, "server error")
			}
		}()
		next.ServeHTTP(w, r)
	})
}

// the upload folder is not listed
func noList(h http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "" || strings.HasSuffix(r.URL.Path, "/") {
			http.NotFound(w, r)
			return
		}
		w.Header().Set("Cache-Control", "public, max-age=31536000, immutable") // every upload gets a new name
		w.Header().Set("X-Content-Type-Options", "nosniff")
		h.ServeHTTP(w, r)
	})
}

func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.Header().Set("Cache-Control", "no-store")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(v)
}

func fail(w http.ResponseWriter, status int, msg string) {
	writeJSON(w, status, map[string]string{"error": msg})
}

func serverError(w http.ResponseWriter, r *http.Request, err error) {
	log.Printf("%s %s: %v", r.Method, r.URL.Path, err)
	fail(w, 500, "server error")
}

// readJSON decodes a small JSON body (64 KB at most)
func readJSON(w http.ResponseWriter, r *http.Request, v any) bool {
	dec := json.NewDecoder(http.MaxBytesReader(w, r.Body, 64<<10))
	dec.UseNumber()
	if err := dec.Decode(v); err != nil {
		fail(w, 400, "bad request body")
		return false
	}
	return true
}

func (a *App) clientIP(r *http.Request) string {
	if a.cfg.TrustProxy {
		if f := r.Header.Get("X-Forwarded-For"); f != "" {
			return strings.TrimSpace(strings.Split(f, ",")[0])
		}
		if x := r.Header.Get("X-Real-IP"); x != "" {
			return x
		}
	}
	host, _, err := net.SplitHostPort(r.RemoteAddr)
	if err != nil {
		return r.RemoteAddr
	}
	return host
}

// the address this server is reached at, for links to uploaded files
func (a *App) publicURL(r *http.Request) string {
	if a.cfg.PublicURL != "" {
		return a.cfg.PublicURL
	}
	scheme := "http"
	if r.TLS != nil || (a.cfg.TrustProxy && r.Header.Get("X-Forwarded-Proto") == "https") {
		scheme = "https"
	}
	return scheme + "://" + r.Host
}

// limiter: at most n requests per window from one address (logins, attempts)
type limiter struct {
	mu     sync.Mutex
	n      int
	window time.Duration
	hits   map[string][]time.Time
}

func newLimiter(n int, window time.Duration) *limiter {
	return &limiter{n: n, window: window, hits: map[string][]time.Time{}}
}

func (l *limiter) allow(key string, now time.Time) bool {
	l.mu.Lock()
	defer l.mu.Unlock()
	h := l.hits[key]
	k := 0
	for _, t := range h {
		if now.Sub(t) < l.window {
			h[k] = t
			k++
		}
	}
	h = h[:k]
	if len(l.hits) > 50000 { // a flood of addresses: start over rather than grow
		l.hits = map[string][]time.Time{}
	}
	if len(h) >= l.n {
		l.hits[key] = h
		return false
	}
	l.hits[key] = append(h, now)
	return true
}

func (a *App) limited(h http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if !a.limiter.allow(a.clientIP(r)+r.URL.Path, time.Now()) {
			fail(w, 429, "too many requests")
			return
		}
		h(w, r)
	}
}
