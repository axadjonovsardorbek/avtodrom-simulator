package main

// PostgreSQL storage: users, their login sessions, exam and practice attempts, and the settings the
// admin panel changes (advertising, cars switched off). The tables are created on start if missing.

import (
	"context"
	"encoding/json"
	"errors"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

const schema = `
CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  provider TEXT NOT NULL,                -- "google", "telegram" or "dev"
  pid TEXT NOT NULL,                     -- the id at that provider
  name TEXT NOT NULL DEFAULT '',
  username TEXT NOT NULL DEFAULT '',
  email TEXT NOT NULL DEFAULT '',
  photo TEXT NOT NULL DEFAULT '',
  created BIGINT NOT NULL,               -- ms
  seen BIGINT NOT NULL,
  blocked BOOLEAN NOT NULL DEFAULT FALSE,
  admin BOOLEAN NOT NULL DEFAULT FALSE,
  UNIQUE (provider, pid)
);
CREATE TABLE IF NOT EXISTS sessions (
  hash TEXT PRIMARY KEY,                 -- sha256 of the token the browser holds
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created BIGINT NOT NULL,
  expires BIGINT NOT NULL
);
CREATE TABLE IF NOT EXISTS attempts (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  at BIGINT NOT NULL,                    -- when it ended (ms, the browser's clock)
  key TEXT NOT NULL,                     -- "exam", "training" or "practice:<element>"
  passed BOOLEAN NOT NULL,
  total INTEGER NOT NULL,                -- penalty points
  t INTEGER NOT NULL,                    -- seconds
  car TEXT NOT NULL DEFAULT '',
  mistakes JSONB NOT NULL DEFAULT '{}',  -- { code: { n, text, pts, count, tasks } }
  received BIGINT NOT NULL,
  UNIQUE (user_id, at)
);
CREATE INDEX IF NOT EXISTS attempts_user ON attempts (user_id, at);
CREATE INDEX IF NOT EXISTS attempts_key ON attempts (key, passed, total, t);
CREATE INDEX IF NOT EXISTS attempts_at ON attempts (at);
ALTER TABLE users ADD COLUMN IF NOT EXISTS phone TEXT NOT NULL DEFAULT '';  -- from the Telegram bot login
CREATE TABLE IF NOT EXISTS settings (k TEXT PRIMARY KEY, v JSONB NOT NULL);
-- what is played, per day (Tashkent), device and car: runs started and seconds driven; logged in or not
CREATE TABLE IF NOT EXISTS plays (
  day DATE NOT NULL,
  device TEXT NOT NULL,                  -- a random id the browser keeps
  car TEXT NOT NULL,
  user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  runs INTEGER NOT NULL DEFAULT 0,
  secs INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (day, device, car)
);
-- how often and how long each advert was in sight, per day, car, place and device
CREATE TABLE IF NOT EXISTS ad_views (
  day DATE NOT NULL,
  ad TEXT NOT NULL,
  car TEXT NOT NULL,
  place TEXT NOT NULL,
  device TEXT NOT NULL,
  views INTEGER NOT NULL DEFAULT 0,
  secs INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (day, ad, car, place, device)
);
`

type DB struct{ *pgxpool.Pool }

func openDB(ctx context.Context, url string) (*DB, error) {
	pool, err := pgxpool.New(ctx, url)
	if err != nil {
		return nil, err
	}
	if _, err := pool.Exec(ctx, schema); err != nil {
		pool.Close()
		return nil, err
	}
	return &DB{pool}, nil
}

// getSetting decodes a stored setting into v; false when it was never set
func (db *DB) getSetting(ctx context.Context, k string, v any) (bool, error) {
	var raw []byte
	err := db.QueryRow(ctx, "SELECT v FROM settings WHERE k = $1", k).Scan(&raw)
	if errors.Is(err, pgx.ErrNoRows) {
		return false, nil
	}
	if err != nil {
		return false, err
	}
	return true, json.Unmarshal(raw, v)
}

func (db *DB) setSetting(ctx context.Context, k string, v any) error {
	raw, err := json.Marshal(v)
	if err != nil {
		return err
	}
	_, err = db.Exec(ctx, "INSERT INTO settings (k, v) VALUES ($1, $2) ON CONFLICT (k) DO UPDATE SET v = excluded.v", k, raw)
	return err
}

type User struct {
	ID       int    `json:"id"`
	Provider string `json:"provider"`
	Name     string `json:"name"`
	Username string `json:"username"`
	Email    string `json:"email"`
	Photo    string `json:"photo"`
	Created  int64  `json:"created"`
	Seen     int64  `json:"seen"`
	Blocked  bool   `json:"blocked"`
	Admin    bool   `json:"admin"`
	Phone    string `json:"phone"`
}

const userCols = "id, provider, name, username, email, photo, created, seen, blocked, admin, phone"

func scanUser(row pgx.Row) (*User, error) {
	u := &User{}
	err := row.Scan(&u.ID, &u.Provider, &u.Name, &u.Username, &u.Email, &u.Photo, &u.Created, &u.Seen, &u.Blocked, &u.Admin, &u.Phone)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, nil
	}
	return u, err
}
