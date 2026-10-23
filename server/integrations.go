package main

// The keys of the services the site talks to (Google sign-in, the Telegram bot, the inPAY kassa) are kept in
// Postgres and changed in the admin panel (Sozlamalar), not in the server's .env. They take effect at once.
// The secrets are never sent back to the panel whole: it sees only whether one is set and its last 4 characters;
// a secret left empty on saving keeps the one stored.
// On the first start, if nothing is stored yet, values still found in the environment are copied in once.

import (
	"context"
	"log"
	"net/http"
	"strings"
)

type Integrations struct {
	GoogleClientID string `json:"googleClientId"`
	TelegramToken  string `json:"telegramToken"` // secret
	TelegramBot    string `json:"telegramBot"`   // without @
	InpayURL       string `json:"inpayUrl"`
	InpayMerchant  string `json:"inpayMerchant"`
	InpayToken     string `json:"inpayToken"` // secret
}

const inpayDefaultURL = "https://inpay.uz/api/v1"

func (g *Integrations) clean() {
	g.GoogleClientID = strings.TrimSpace(g.GoogleClientID)
	g.TelegramToken = strings.TrimSpace(g.TelegramToken)
	g.TelegramBot = strings.TrimPrefix(strings.TrimSpace(g.TelegramBot), "@")
	g.InpayURL = strings.TrimRight(strings.TrimSpace(g.InpayURL), "/")
	if g.InpayURL == "" {
		g.InpayURL = inpayDefaultURL
	}
	g.InpayMerchant = strings.TrimSpace(g.InpayMerchant)
	g.InpayToken = strings.TrimSpace(g.InpayToken)
}

func (a *App) useIntegrations(g Integrations) {
	g.clean()
	a.ig.Store(&g)
	a.inpay.set(g.InpayURL, g.InpayMerchant, g.InpayToken)
}

// loadIntegrations: from Postgres; the first time, from the environment (then stored)
func (a *App) loadIntegrations(ctx context.Context) {
	seed := Integrations{GoogleClientID: a.cfg.GoogleClientID, TelegramToken: a.cfg.TelegramToken, TelegramBot: a.cfg.TelegramBot,
		InpayURL: a.cfg.InpayURL, InpayMerchant: a.cfg.InpayMerchant, InpayToken: a.cfg.InpayToken}
	if a.db == nil {
		a.useIntegrations(seed)
		return
	}
	var g Integrations
	found, err := a.db.getSetting(ctx, "integrations", &g)
	if err != nil {
		log.Printf("integrations: %v", err)
	}
	if !found {
		g = seed
		g.clean()
		if err := a.db.setSetting(ctx, "integrations", g); err == nil && (g.GoogleClientID != "" || g.TelegramToken != "" || g.InpayMerchant != "") {
			log.Print("integrations: copied from the environment into the database; they can now be removed from .env")
		}
	}
	a.useIntegrations(g)
}

func tail(s string) string {
	if len(s) <= 4 {
		return ""
	}
	return s[len(s)-4:]
}

func (a *App) integrationsOut() map[string]any {
	g := a.ig.Load()
	return map[string]any{
		"googleClientId": g.GoogleClientID, "telegramBot": g.TelegramBot, "inpayUrl": g.InpayURL, "inpayMerchant": g.InpayMerchant,
		"telegramToken": map[string]any{"set": g.TelegramToken != "", "tail": tail(g.TelegramToken)},
		"inpayToken":    map[string]any{"set": g.InpayToken != "", "tail": tail(g.InpayToken)},
		"payments":      a.inpay.on(),
	}
}

// GET /api/admin/integrations
func (a *App) handleGetIntegrations(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, 200, map[string]any{"integrations": a.integrationsOut()})
}

// PUT /api/admin/integrations { googleClientId, telegramBot, telegramToken?, inpayUrl, inpayMerchant, inpayToken?, clear?: [names] }
func (a *App) handlePutIntegrations(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Integrations
		Clear []string `json:"clear"` // secrets to remove: "telegramToken", "inpayToken"
	}
	if !readJSON(w, r, &body) {
		return
	}
	g, old := body.Integrations, a.ig.Load()
	if strings.TrimSpace(g.TelegramToken) == "" {
		g.TelegramToken = old.TelegramToken
	}
	if strings.TrimSpace(g.InpayToken) == "" {
		g.InpayToken = old.InpayToken
	}
	for _, c := range body.Clear {
		switch c {
		case "telegramToken":
			g.TelegramToken = ""
		case "inpayToken":
			g.InpayToken = ""
		}
	}
	g.clean()
	if len(g.GoogleClientID) > 200 || len(g.TelegramToken) > 100 || len(g.TelegramBot) > 64 || len(g.InpayURL) > 200 || len(g.InpayMerchant) > 100 || len(g.InpayToken) > 300 {
		fail(w, 400, "qiymat juda uzun")
		return
	}
	if !strings.HasPrefix(g.InpayURL, "https://") && !strings.HasPrefix(g.InpayURL, "http://") {
		fail(w, 400, "inPAY manzili http(s):// bilan boshlansin")
		return
	}
	if err := a.db.setSetting(r.Context(), "integrations", g); err != nil {
		serverError(w, r, err)
		return
	}
	a.useIntegrations(g)
	writeJSON(w, 200, map[string]any{"integrations": a.integrationsOut()})
}
