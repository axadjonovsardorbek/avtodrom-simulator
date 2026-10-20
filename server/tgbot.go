package main

// Telegram login through the bot itself (works on any address, localhost too: the Login Widget
// needs a domain set with @BotFather /setdomain). The site asks for a login (POST /api/auth/tg-start)
// and opens t.me/<bot>?start=<nonce>; in the bot the user presses Start and sends their own phone
// number with the button; the site, asking every two seconds (POST /api/auth/tg-poll), then gets
// its login. The nonce is known only to the browser that asked, the Telegram account comes from
// Telegram itself (the message's sender), and a contact card is taken only when it is the sender's own.

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"regexp"
	"strconv"
	"strings"
	"sync"
	"time"
)

const tgLoginTTL = 5 * time.Minute

type tgPending struct {
	created time.Time
	id      *Identity // set once confirmed in the bot
}

type tgLogins struct {
	mu      sync.Mutex
	pending map[string]*tgPending
	chats   map[int64]string // chat -> the nonce waiting for that chat's phone number
}

func newTgLogins() *tgLogins {
	return &tgLogins{pending: map[string]*tgPending{}, chats: map[int64]string{}}
}

func (l *tgLogins) sweep(now time.Time) {
	for k, p := range l.pending {
		if now.Sub(p.created) > tgLoginTTL {
			delete(l.pending, k)
		}
	}
	for c, k := range l.chats {
		if l.pending[k] == nil {
			delete(l.chats, c)
		}
	}
}

var nonceRe = regexp.MustCompile(`^[a-f0-9]{32}$`)

// POST /api/auth/tg-start: { nonce, link }
func (a *App) handleTgStart(w http.ResponseWriter, r *http.Request) {
	if a.cfg.TelegramToken == "" || a.cfg.TelegramBot == "" {
		fail(w, 404, "telegram login is off")
		return
	}
	nonce := newToken()[:32]
	l := a.tg
	l.mu.Lock()
	l.sweep(time.Now())
	if len(l.pending) > 5000 {
		l.mu.Unlock()
		fail(w, 503, "busy")
		return
	}
	l.pending[nonce] = &tgPending{created: time.Now()}
	l.mu.Unlock()
	writeJSON(w, 200, map[string]any{"nonce": nonce, "link": "https://t.me/" + a.cfg.TelegramBot + "?start=" + nonce, "ttl": int(tgLoginTTL.Seconds())})
}

// POST /api/auth/tg-poll { nonce }: 202 while waiting, the login once confirmed, 410 when expired
func (a *App) handleTgPoll(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Nonce string `json:"nonce"`
	}
	if !readJSON(w, r, &body) {
		return
	}
	l := a.tg
	l.mu.Lock()
	p := l.pending[body.Nonce]
	if p == nil || time.Since(p.created) > tgLoginTTL {
		delete(l.pending, body.Nonce)
		l.mu.Unlock()
		fail(w, 410, "expired")
		return
	}
	id := p.id
	if id != nil {
		delete(l.pending, body.Nonce)
	}
	l.mu.Unlock()
	if id == nil {
		writeJSON(w, 202, map[string]bool{"wait": true})
		return
	}
	a.login(w, r, id)
}

// ---- the bot: long polling of getUpdates (no webhook, so no public address is needed)

type tgUser struct {
	ID        int64  `json:"id"`
	FirstName string `json:"first_name"`
	LastName  string `json:"last_name"`
	Username  string `json:"username"`
	IsBot     bool   `json:"is_bot"`
}
type tgUpdate struct {
	UpdateID int64 `json:"update_id"`
	Message  *struct {
		From *tgUser `json:"from"`
		Chat struct {
			ID   int64  `json:"id"`
			Type string `json:"type"`
		} `json:"chat"`
		Text    string `json:"text"`
		Contact *struct {
			PhoneNumber string `json:"phone_number"`
			UserID      int64  `json:"user_id"`
		} `json:"contact"`
	} `json:"message"`
}

func (a *App) tgCall(ctx context.Context, method string, params any, out any) error {
	raw, _ := json.Marshal(params)
	req, err := http.NewRequestWithContext(ctx, "POST", "https://api.telegram.org/bot"+a.cfg.TelegramToken+"/"+method, bytes.NewReader(raw))
	if err != nil {
		return err
	}
	req.Header.Set("Content-Type", "application/json")
	res, err := (&http.Client{Timeout: 70 * time.Second}).Do(req)
	if err != nil {
		return fmt.Errorf("telegram %s: request failed", method) // the URL holds the token: never log err itself
	}
	defer res.Body.Close()
	var env struct {
		OK          bool            `json:"ok"`
		Result      json.RawMessage `json:"result"`
		Description string          `json:"description"`
	}
	if err := json.NewDecoder(res.Body).Decode(&env); err != nil {
		return fmt.Errorf("telegram %s: bad reply", method)
	}
	if !env.OK {
		return fmt.Errorf("telegram %s: %s", method, env.Description)
	}
	if out != nil {
		return json.Unmarshal(env.Result, out)
	}
	return nil
}

func (a *App) tgSend(ctx context.Context, chat int64, text string, markup any) {
	if a.tgOut != nil {
		a.tgOut(chat, text)
		return
	}
	p := map[string]any{"chat_id": chat, "text": text, "parse_mode": "HTML"}
	if markup != nil {
		p["reply_markup"] = markup
	}
	if err := a.tgCall(ctx, "sendMessage", p, nil); err != nil {
		log.Print(err)
	}
}

// runTelegramBot answers the bot's messages until ctx ends
func (a *App) runTelegramBot(ctx context.Context) {
	if a.cfg.TelegramToken == "" {
		return
	}
	// a webhook set earlier would stop getUpdates
	_ = a.tgCall(ctx, "deleteWebhook", map[string]any{}, nil)
	log.Print("telegram bot: polling")
	var offset int64
	for ctx.Err() == nil {
		var ups []tgUpdate
		if err := a.tgCall(ctx, "getUpdates", map[string]any{"offset": offset, "timeout": 50, "allowed_updates": []string{"message"}}, &ups); err != nil {
			if ctx.Err() == nil {
				log.Print(err)
				select {
				case <-ctx.Done():
				case <-time.After(5 * time.Second):
				}
			}
			continue
		}
		for _, u := range ups {
			offset = u.UpdateID + 1
			a.tgHandle(ctx, u)
		}
	}
}

var askPhone = map[string]any{
	"keyboard":          [][]map[string]any{{{"text": "📲 Raqamni yuborish", "request_contact": true}}},
	"resize_keyboard":   true,
	"one_time_keyboard": true,
}
var noKeyboard = map[string]any{"remove_keyboard": true}

func (a *App) tgHandle(ctx context.Context, u tgUpdate) {
	m := u.Message
	if m == nil || m.From == nil || m.From.IsBot || m.Chat.Type != "private" {
		return
	}
	chat, l := m.Chat.ID, a.tg
	switch {
	case strings.HasPrefix(m.Text, "/start"):
		nonce := strings.TrimSpace(strings.TrimPrefix(m.Text, "/start"))
		l.mu.Lock()
		p := l.pending[nonce]
		ok := nonceRe.MatchString(nonce) && p != nil && p.id == nil && time.Since(p.created) <= tgLoginTTL
		if ok {
			l.chats[chat] = nonce
		}
		l.mu.Unlock()
		if !ok {
			a.tgSend(ctx, chat, "👋 Salom! Bu <b>Avtodrom simulyatori</b> boti.\n\nKirish uchun saytda <b>«Telegram orqali kirish»</b> tugmasini bosing: shu yerga qaytasiz va raqamingizni yuborasiz.", noKeyboard)
			return
		}
		a.tgSend(ctx, chat, "🔐 Avtodrom simulyatoriga kirish.\n\nTasdiqlash uchun pastdagi tugma bilan <b>o'z raqamingizni</b> yuboring.", askPhone)
	case m.Contact != nil:
		// only the sender's own number: a contact card of someone else carries their user_id, not the sender's
		if m.Contact.UserID != m.From.ID {
			a.tgSend(ctx, chat, "❌ Faqat o'zingizning raqamingizni pastdagi tugma bilan yuboring.", askPhone)
			return
		}
		l.mu.Lock()
		nonce := l.chats[chat]
		p := l.pending[nonce]
		ok := p != nil && p.id == nil && time.Since(p.created) <= tgLoginTTL
		if ok {
			phone := m.Contact.PhoneNumber
			if !strings.HasPrefix(phone, "+") {
				phone = "+" + phone
			}
			p.id = &Identity{Provider: "telegram", PID: strconv.FormatInt(m.From.ID, 10),
				Name: strings.TrimSpace(m.From.FirstName + " " + m.From.LastName), Username: m.From.Username, Phone: phone}
		}
		delete(l.chats, chat)
		l.mu.Unlock()
		if !ok {
			a.tgSend(ctx, chat, "⌛ Kirish so'rovi topilmadi yoki muddati o'tdi. Saytda «Telegram orqali kirish»ni qayta bosing.", noKeyboard)
			return
		}
		a.tgSend(ctx, chat, "✅ Tasdiqlandi! Saytga qayting: siz kirdingiz.\n\nAgar bu so'rovni siz yubormagan bo'lsangiz, e'tibor bermang.", noKeyboard)
	default:
		a.tgSend(ctx, chat, "Kirish uchun saytda <b>«Telegram orqali kirish»</b> tugmasini bosing.", nil)
	}
}
