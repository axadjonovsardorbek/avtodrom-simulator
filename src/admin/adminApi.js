// The admin panel's own session: admins log in with a login and password (server/admins.go), apart from
// the players' Google / Telegram accounts. Its token is kept under its own key and sent only to /api/admin/*.
import { apiOn, apiBase, ApiError } from "../net/api.js";

const KEY = "rulda.admin.token", ME = "rulda.admin.me";
const store = { get: k => { try { return localStorage.getItem(k); } catch (_) { return null; } }, set: (k, v) => { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch (_) {} } };
let token = store.get(KEY);
let me = (() => { try { return JSON.parse(store.get(ME) || "null"); } catch (_) { return null; } })();
const setSession = (t, a) => { token = t; me = a; store.set(KEY, t); store.set(ME, a ? JSON.stringify(a) : null); };

export const getAdmin = () => (token ? me : null);
export const authHeader = () => (token ? { Authorization: "Bearer " + token } : {});

export async function api(path, { method = "GET", body, headers = {}, timeout = 20000 } = {}) {
  if (!apiOn) throw new ApiError(0, "no server");
  const h = { ...headers, ...authHeader() };
  let data = body;
  if (body !== undefined && !(body instanceof Blob)) { h["Content-Type"] = "application/json"; data = JSON.stringify(body); }
  const ctl = new AbortController(), timer = setTimeout(() => ctl.abort(), timeout);
  let res;
  try { res = await fetch(apiBase + path, { method, headers: h, body: data, signal: ctl.signal }); }
  catch (e) { throw new ApiError(0, "Server bilan aloqa yo'q"); }
  finally { clearTimeout(timer); }
  const out = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (res.status === 401 && token && path !== "/api/admin/login") setSession(null, null);   // the session ended
    throw new ApiError(res.status, out.error || "Xatolik " + res.status);
  }
  return out;
}

export async function login(loginName, password) {
  const out = await api("/api/admin/login", { method: "POST", body: { login: loginName, password } });
  setSession(out.token, out.admin);
  return out.admin;
}
export async function refreshAdmin() {
  if (!token) return null;
  try { const out = await api("/api/admin/me"); setSession(token, out.admin); return out.admin; } catch (e) { return e.status === 401 ? null : me; }
}
export function logout() { if (token) api("/api/admin/logout", { method: "POST" }).catch(() => {}); setSession(null, null); }
