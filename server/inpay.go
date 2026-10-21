package main

// inPAY (https://inpay.uz/api/): a Bearer token from the merchant id and token (kept for a day), a payment made
// with POST /create/ (the buyer is sent to its pay_url), its state read with GET /transactions/?order_id=.
// inPAY's callback carries no signature, so it is never believed by itself: every order is settled only on what
// GET /transactions/ answers. The answers are read loosely (a field may sit at the top or under "data", and a
// number may come as a string), as the documentation shows them only by example.

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"sync"
	"time"
)

type inpayClient struct {
	base, merchant, secret string
	http                   *http.Client
	mu                     sync.Mutex
	token                  string
	expires                time.Time
}

func newInpay(cfg Config) *inpayClient {
	return &inpayClient{base: cfg.InpayURL, merchant: cfg.InpayMerchant, secret: cfg.InpayToken, http: &http.Client{Timeout: 20 * time.Second}}
}

func (c *inpayClient) on() bool { return c != nil && c.merchant != "" && c.secret != "" }

// find a field by name at the top of a reply or one level down ("data", "result", ...)
func field(m map[string]any, names ...string) any {
	for _, n := range names {
		if v, ok := m[n]; ok && v != nil {
			return v
		}
	}
	for _, v := range m {
		if sub, ok := v.(map[string]any); ok {
			for _, n := range names {
				if x, ok := sub[n]; ok && x != nil {
					return x
				}
			}
		}
	}
	return nil
}
func str(v any) string {
	switch x := v.(type) {
	case string:
		return x
	case float64:
		return strconv.FormatFloat(x, 'f', -1, 64)
	case json.Number:
		return x.String()
	}
	return ""
}

func (c *inpayClient) do(ctx context.Context, method, path string, q url.Values, body any, auth bool) (map[string]any, error) {
	u := c.base + path
	if q != nil {
		u += "?" + q.Encode()
	}
	var rd *bytes.Reader
	if body != nil {
		raw, _ := json.Marshal(body)
		rd = bytes.NewReader(raw)
	} else {
		rd = bytes.NewReader(nil)
	}
	req, err := http.NewRequestWithContext(ctx, method, u, rd)
	if err != nil {
		return nil, err
	}
	if body != nil {
		req.Header.Set("Content-Type", "application/json")
	}
	if auth {
		tok, err := c.bearer(ctx)
		if err != nil {
			return nil, err
		}
		req.Header.Set("Authorization", "Bearer "+tok)
	}
	res, err := c.http.Do(req)
	if err != nil {
		return nil, fmt.Errorf("inpay %s: request failed", path) // the URL may carry the merchant token: never log err
	}
	defer res.Body.Close()
	out := map[string]any{}
	if err := json.NewDecoder(res.Body).Decode(&out); err != nil {
		return nil, fmt.Errorf("inpay %s: bad reply (%d)", path, res.StatusCode)
	}
	if res.StatusCode == 401 && auth { // the token ran out early: get a new one next time
		c.mu.Lock()
		c.token = ""
		c.mu.Unlock()
	}
	if res.StatusCode >= 300 || field(out, "success") == false {
		return out, fmt.Errorf("inpay %s: %d %s %s", path, res.StatusCode, str(field(out, "error_code")), str(field(out, "message")))
	}
	return out, nil
}

// the Bearer token, fetched again a little before its day is over
func (c *inpayClient) bearer(ctx context.Context) (string, error) {
	c.mu.Lock()
	if c.token != "" && time.Now().Before(c.expires) {
		t := c.token
		c.mu.Unlock()
		return t, nil
	}
	c.mu.Unlock()
	out, err := c.do(ctx, "GET", "/authorization/", url.Values{"merchant_id": {c.merchant}, "merchant_token": {c.secret}}, nil, false)
	if err != nil {
		return "", err
	}
	tok := str(field(out, "token", "access_token", "bearer"))
	if tok == "" {
		return "", errors.New("inpay: no token in the reply")
	}
	c.mu.Lock()
	c.token, c.expires = tok, time.Now().Add(23*time.Hour)
	c.mu.Unlock()
	return tok, nil
}

type inpayPayment struct{ OrderID, PayURL string }

func (c *inpayClient) create(ctx context.Context, amount int, desc, callback, back, ip string) (*inpayPayment, error) {
	tok, err := c.bearer(ctx)
	if err != nil {
		return nil, err
	}
	body := map[string]any{"merchant_id": c.merchant, "token": tok, "amount": amount, "description": desc, "callback_url": callback, "return_url": back}
	if ip != "" {
		body["client_ip"] = ip
	}
	out, err := c.do(ctx, "POST", "/create/", nil, body, true)
	if err != nil {
		return nil, err
	}
	p := &inpayPayment{OrderID: str(field(out, "order_id")), PayURL: str(field(out, "pay_url"))}
	if p.OrderID == "" || !strings.HasPrefix(p.PayURL, "https://") {
		return nil, errors.New("inpay: no order id or pay url in the reply")
	}
	return p, nil
}

// the state inPAY itself keeps: status (pending, success, failed, cancelled) and the amount in so'm
func (c *inpayClient) status(ctx context.Context, orderID string) (string, float64, error) {
	out, err := c.do(ctx, "GET", "/transactions/", url.Values{"order_id": {orderID}}, nil, true)
	if err != nil {
		return "", 0, err
	}
	// a list of transactions, or one
	rec := out
	if list, ok := field(out, "transactions", "data", "items").([]any); ok && len(list) > 0 {
		if m, ok := list[0].(map[string]any); ok {
			rec = m
		}
	}
	amount, _ := strconv.ParseFloat(str(field(rec, "amount")), 64)
	return strings.ToLower(str(field(rec, "status"))), amount, nil
}
