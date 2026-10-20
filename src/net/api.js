// The simulator's server (server/): accounts, the attempt history, the leaderboard, the admin's
// settings. Its address comes from the build (VITE_API_URL; "/" when the server hosts the site
// itself); without one the simulator works as before, everything kept in the browser.
// localStorage "avtodrom.api" overrides it (testing against another server).

const store = {
  get(k) { try { return localStorage.getItem(k); } catch (_) { return null; } },
  set(k, v) { try { if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch (_) {} }
};
const RAW = (store.get("avtodrom.api") ?? import.meta.env.VITE_API_URL ?? "").trim();
export const apiOn = RAW !== "";
const BASE = RAW === "/" ? "" : RAW.replace(/\/+$/, "");
export const apiBase = BASE;

const TOKEN = "avtodrom.token", USER = "avtodrom.user", PENDING = "avtodrom.pending";
let token = store.get(TOKEN);
let user = (() => { try { return JSON.parse(store.get(USER) || "null"); } catch (_) { return null; } })();
const listeners = new Set();
export const getUser = () => (token ? user : null);
export const authHeader = () => (token ? { Authorization: "Bearer " + token } : {});
export function onUser(cb) { listeners.add(cb); return () => listeners.delete(cb); }
function setSession(t, u) {
  token = t; user = u;
  store.set(TOKEN, t); store.set(USER, u ? JSON.stringify(u) : null);
  for (const cb of listeners) try { cb(getUser()); } catch (e) { console.error(e); }
}

export class ApiError extends Error { constructor(status, msg) { super(msg); this.status = status; } }

// fetch JSON from the server; a body that is a Blob/File is sent as it is (uploads)
export async function api(path, { method = "GET", body, headers = {}, timeout = 15000 } = {}) {
  if (!apiOn) throw new ApiError(0, "no server");
  const h = { ...headers };
  if (token) h.Authorization = "Bearer " + token;
  let data = body;
  if (body !== undefined && !(body instanceof Blob)) { h["Content-Type"] = "application/json"; data = JSON.stringify(body); }
  const ctl = new AbortController(), timer = setTimeout(() => ctl.abort(), timeout);
  let res;
  try { res = await fetch(BASE + path, { method, headers: h, body: data, signal: ctl.signal }); }
  catch (e) { throw new ApiError(0, "Server bilan aloqa yo'q"); }
  finally { clearTimeout(timer); }
  const out = await res.json().catch(() => ({}));
  if (!res.ok) {
    if ((res.status === 401 || res.status === 403) && token && !path.startsWith("/api/auth/")) setSession(null, null);   // expired or blocked
    throw new ApiError(res.status, out.error || "Xatolik " + res.status);
  }
  return out;
}

// logins, advertising, the cars switched off; null when the server cannot be reached
let configP = null;
export function config() {
  if (!apiOn) return Promise.resolve(null);
  return configP || (configP = api("/api/config", { timeout: 5000 }).catch(() => { configP = null; return null; }));
}

export async function loginWith(provider, payload) {
  const out = await api("/api/auth/" + provider, { method: "POST", body: payload });
  setSession(out.token, out.user);
  return out.user;
}
export async function logout() {
  if (token) api("/api/logout", { method: "POST" }).catch(() => {});
  setSession(null, null);
}
// at start: is the saved login still good (and still an admin)?
export async function refreshMe() {
  if (!apiOn || !token) return null;
  try { const out = await api("/api/me"); setSession(token, out.user); return out.user; }
  catch (e) { return e.status ? null : getUser(); }          // no network: keep the saved one
}

// Inside a Telegram mini app the user is known already: log in with its init data
export async function telegramMiniAppLogin() {
  if (!apiOn || getUser() || !/tgWebAppData=/.test(location.hash + location.search)) return null;
  await loadScript("https://telegram.org/js/telegram-web-app.js");
  const tg = window.Telegram && window.Telegram.WebApp;
  if (!tg || !tg.initData) return null;
  tg.ready(); tg.expand && tg.expand();
  return loginWith("telegram-webapp", { initData: tg.initData }).catch(() => null);
}

const scripts = {};
export function loadScript(src) {
  return scripts[src] || (scripts[src] = new Promise((ok, bad) => {
    const s = document.createElement("script"); s.src = src; s.async = true; s.onload = ok; s.onerror = () => { delete scripts[src]; bad(new Error("script " + src)); };
    document.head.appendChild(s);
  }));
}

// attempts: queued in the browser and sent when logged in (what could not be sent goes with the next one)
const pending = () => { try { return JSON.parse(store.get(PENDING) || "[]"); } catch (_) { return []; } };
export function sendAttempt(rec) {
  if (!apiOn || !getUser()) return;
  const list = pending(); list.push(rec); store.set(PENDING, JSON.stringify(list.slice(-200)));
  flushAttempts();
}
let flushing = false;
export async function flushAttempts(extra = []) {
  if (!apiOn || !getUser() || flushing) return;
  const items = [...extra, ...pending()];
  if (!items.length) return;
  flushing = true;
  try { await api("/api/attempts", { method: "POST", body: { items } }); store.set(PENDING, null); }
  catch (_) { /* tried again with the next attempt */ }
  finally { flushing = false; }
}

export const myAttempts = () => api("/api/me/attempts").then(o => o.items || []);
export const leaderboard = key => api("/api/leaderboard?key=" + encodeURIComponent(key || "exam")).then(o => o.items || []);

// What is played, for the admin's analytics (no login needed): per car the runs started and the
// seconds driven, and what the adverts were seen for (render/screenAd.js), sent once a minute and
// when the page is hidden. A random id kept in the browser tells one device from another.
const DEVICE = "avtodrom.device";
function deviceId() {
  let d = store.get(DEVICE);
  if (!d || !/^[a-z0-9]{8,40}$/.test(d)) { d = Array.from(crypto.getRandomValues(new Uint8Array(12)), b => b.toString(16).padStart(2, "0")).join(""); store.set(DEVICE, d); }
  return d;
}
const plays = new Map();
const playOf = car => { let p = plays.get(car); if (!p) plays.set(car, p = { car, runs: 0, secs: 0 }); return p; };
export function countRun(car) { if (apiOn && car) playOf(car).runs++; }
export function countDrive(car, dt) { if (apiOn && car) playOf(car).secs += dt; }
let adViews = () => [];
export function trackAdsFrom(fn) { adViews = fn; }
export function flushTrack() {
  if (!apiOn) return;
  const list = [...plays.values()].filter(p => p.runs || p.secs >= 1).map(p => ({ car: p.car, runs: p.runs, secs: Math.round(p.secs) }));
  for (const p of list) plays.delete(p.car);
  const ads = adViews();
  if (!list.length && !ads.length) return;
  const body = JSON.stringify({ device: deviceId(), plays: list, ads });
  fetch(BASE + "/api/track", { method: "POST", keepalive: true, headers: { "Content-Type": "application/json", ...authHeader() }, body }).catch(() => {});
}
if (apiOn && typeof window !== "undefined") {
  setInterval(flushTrack, 60000);
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "hidden") flushTrack(); });
}
