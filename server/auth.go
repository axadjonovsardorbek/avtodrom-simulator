package main

// Logins: Google (the ID token of the "Sign in with Google" button), Telegram (the Login Widget on
// the site, or the init data of a Telegram mini app). After a login the browser gets a random token
// of its own; only its sha256 is stored.

import (
	"context"
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"net/http"
	"net/url"
	"sort"
	"strconv"
	"strings"
	"time"
)

// Identity is who a provider says the person is
type Identity struct {
	Provider, PID, Name, Username, Email, Photo string
}

const maxAuthAge = 24 * time.Hour

func hmacHex(key, msg []byte) string {
	m := hmac.New(sha256.New, key)
	m.Write(msg)
	return hex.EncodeToString(m.Sum(nil))
}

func sameHex(a, b string) bool {
	x, err1 := hex.DecodeString(a)
	y, err2 := hex.DecodeString(b)
	return err1 == nil && err2 == nil && len(x) > 0 && hmac.Equal(x, y)
}

func freshAuth(authDate string, now time.Time) bool {
	t, err := strconv.ParseInt(authDate, 10, 64)
	return err == nil && now.Sub(time.Unix(t, 0)) < maxAuthAge
}

// checkTelegramWidget: https://core.telegram.org/widgets/login#checking-authorization
func checkTelegramWidget(data map[string]string, botToken string, now time.Time) *Identity {
	if botToken == "" || data["hash"] == "" || data["id"] == "" {
		return nil
	}
	keys := make([]string, 0, len(data))
	for k := range data {
		if k != "hash" {
			keys = append(keys, k)
		}
	}
	sort.Strings(keys)
	lines := make([]string, len(keys))
	for i, k := range keys {
		lines[i] = k + "=" + data[k]
	}
	secret := sha256.Sum256([]byte(botToken))
	if !sameHex(hmacHex(secret[:], []byte(strings.Join(lines, "\n"))), data["hash"]) || !freshAuth(data["auth_date"], now) {
		return nil
	}
	return &Identity{Provider: "telegram", PID: data["id"], Name: strings.TrimSpace(data["first_name"] + " " + data["last_name"]), Username: data["username"], Photo: data["photo_url"]}
}

// checkTelegramWebApp: https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app
func checkTelegramWebApp(initData, botToken string, now time.Time) *Identity {
	if botToken == "" {
		return nil
	}
	p, err := url.ParseQuery(initData)
	if err != nil {
		return nil
	}
	hash := p.Get("hash")
	if hash == "" {
		return nil
	}
	lines := []string{}
	for k := range p {
		if k != "hash" {
			lines = append(lines, k+"="+p.Get(k))
		}
	}
	sort.Strings(lines)
	m := hmac.New(sha256.New, []byte("WebAppData"))
	m.Write([]byte(botToken))
	if !sameHex(hmacHex(m.Sum(nil), []byte(strings.Join(lines, "\n"))), hash) || !freshAuth(p.Get("auth_date"), now) {
		return nil
	}
	var u struct {
		ID        int64  `json:"id"`
		FirstName string `json:"first_name"`
		LastName  string `json:"last_name"`
		Username  string `json:"username"`
		PhotoURL  string `json:"photo_url"`
	}
	if json.Unmarshal([]byte(p.Get("user")), &u) != nil || u.ID == 0 {
		return nil
	}
	return &Identity{Provider: "telegram", PID: strconv.FormatInt(u.ID, 10), Name: strings.TrimSpace(u.FirstName + " " + u.LastName), Username: u.Username, Photo: u.PhotoURL}
}

// checkGoogle: the ID token is checked by Google itself (tokeninfo), then its audience must be our client
func checkGoogle(ctx context.Context, credential, clientID string) (*Identity, error) {
	if clientID == "" || credential == "" || len(credential) > 4096 {
		return nil, nil
	}
	ctx, cancel := context.WithTimeout(ctx, 8*time.Second)
	defer cancel()
	req, _ := http.NewRequestWithContext(ctx, "GET", "https://oauth2.googleapis.com/tokeninfo?id_token="+url.QueryEscape(credential), nil)
	res, err := http.DefaultClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("google tokeninfo: %w", err)
	}
	defer res.Body.Close()
	if res.StatusCode != 200 {
		return nil, nil
	}
	var t struct {
		Aud, Iss, Sub, Email, Name, Picture string
		EmailVerified                       string `json:"email_verified"`
		Exp                                 string `json:"exp"`
	}
	if err := json.NewDecoder(res.Body).Decode(&t); err != nil {
		return nil, err
	}
	exp, _ := strconv.ParseInt(t.Exp, 10, 64)
	if t.Aud != clientID || (t.Iss != "accounts.google.com" && t.Iss != "https://accounts.google.com") || t.Sub == "" || time.Unix(exp, 0).Before(time.Now()) {
		return nil, nil
	}
	email := ""
	if t.EmailVerified == "true" {
		email = t.Email
	}
	name := t.Name
	if name == "" {
		name = email
	}
	return &Identity{Provider: "google", PID: t.Sub, Name: name, Email: email, Photo: t.Picture}, nil
}

func newToken() string {
	b := make([]byte, 32)
	if _, err := rand.Read(b); err != nil {
		panic(err)
	}
	return hex.EncodeToString(b)
}

func tokenHash(token string) string {
	h := sha256.Sum256([]byte(token))
	return hex.EncodeToString(h[:])
}
