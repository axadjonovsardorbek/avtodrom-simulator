// Accounts in the simulator: the login (Google or Telegram), the user's chip in the menu and the
// leaderboard. Shown only when the build has a server (src/net/api.js).
import { apiOn, config, getUser, loginWith, logout, leaderboard, loadScript, telegramBotLogin } from "../net/api.js";
import { ELEMENTS } from "../world/tracks.js";

export const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const initials = n => esc((String(n || "?").trim().split(/\s+/).map(w => w[0]).join("").slice(0, 2) || "?").toUpperCase());
export const avatar = (u, cls = "av") => u && u.photo && /^https:\/\//.test(u.photo)
  ? `<img class="${cls}" src="${esc(u.photo)}" alt="" referrerpolicy="no-referrer">` : `<span class="${cls}">${initials(u && u.name)}</span>`;

// the login buttons into `el`; onDone(user) after a login
const TG_ICON = `<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M21.9 4.3 18.8 19c-.2 1-.8 1.3-1.7.8l-4.6-3.4-2.2 2.1c-.3.3-.5.5-1 .5l.3-4.7 8.6-7.8c.4-.3-.1-.5-.6-.2L6.9 13l-4.5-1.4c-1-.3-1-1 .2-1.5L20.6 3c.8-.3 1.6.2 1.3 1.3Z"/></svg>`;

export async function renderLogin(el, onDone) {
  el.innerHTML = `<p class="login-wait">Yuklanmoqda…</p>`;
  const cfg = await config();
  if (!cfg) { el.innerHTML = `<p class="login-err">Server bilan aloqa yo'q. Keyinroq urinib ko'ring.</p>`; return; }
  el.innerHTML = `<div class="login-btns">
      ${cfg.googleClientId ? `<div class="g-btn" id="gBtn"></div>` : ""}
      ${cfg.telegramBot ? `<button type="button" class="tg-login" id="tgBtn">${TG_ICON}Telegram orqali kirish</button>` : ""}
      ${cfg.devLogin ? `<form class="dev-login" id="devLogin"><input name="n" placeholder="Ism (sinov uchun)" maxlength="60" required><button class="btn">Kirish</button></form>` : ""}
      ${!cfg.googleClientId && !cfg.telegramBot && !cfg.devLogin ? `<p class="login-err">Kirish hali sozlanmagan.</p>` : ""}
    </div><p class="login-err" id="loginErr" hidden></p>`;
  const err = el.querySelector("#loginErr");
  const done = p => p.then(u => onDone && onDone(u)).catch(e => { if (e.quiet) return; err.hidden = false; err.textContent = e.status === 403 ? "Bu hisob bloklangan." : "Kirib bo'lmadi: " + e.message; });
  if (cfg.googleClientId) {
    loadScript("https://accounts.google.com/gsi/client").then(() => {
      const g = window.google && window.google.accounts && window.google.accounts.id;
      if (!g) return;
      g.initialize({ client_id: cfg.googleClientId, callback: r => done(loginWith("google", { credential: r.credential })) });
      const b = el.querySelector("#gBtn"); if (b) g.renderButton(b, { theme: "filled_black", size: "large", shape: "pill", text: "signin_with", locale: "uz", width: 260 });
    }).catch(() => {});
  }
  // Telegram: the bot confirms the login (the user sends their own number there); this page waits for it
  if (cfg.telegramBot) {
    const b = el.querySelector("#tgBtn");
    b.onclick = () => {
      const tab = window.open("", "_blank");             // opened right away: a window opened after an await is blocked
      b.disabled = true; err.hidden = true;
      const wait = document.createElement("div"); wait.className = "tg-wait"; b.after(wait);
      const reset = () => { b.disabled = false; wait.remove(); };
      done(telegramBotLogin((link, stop) => {
        if (tab) tab.location.href = link;
        wait.innerHTML = `<p>Telegram'da botga <b>Start</b> bosing va <b>raqamingizni yuboring</b>. Shundan keyin bu sahifa o'zi kiradi.</p>
          <p><a href="${esc(link)}" target="_blank" rel="noopener">Telegram ochilmadimi? Shu yerni bosing</a> · <button type="button" class="linkish">Bekor qilish</button></p>`;
        wait.querySelector("button").onclick = () => { stop(); reset(); };
      }).then(u => { reset(); if (!u) throw Object.assign(new Error("bekor qilindi"), { quiet: true }); return u; }, e => { if (tab && !tab.closed && tab.location.href === "about:blank") tab.close(); reset(); throw e; }));
    };
  }
  const dev = el.querySelector("#devLogin");
  if (dev) dev.onsubmit = e => { e.preventDefault(); done(loginWith("dev", { name: dev.n.value })); };
}

// a panel in the result overlay (the same one the analysis uses)
function panel(res, html) {
  res.innerHTML = `<div class="panel result">${html}</div>`;
  res.hidden = false;
  res.querySelectorAll('[data-a="close"]').forEach(b => b.onclick = () => { res.hidden = true; });
  return res.firstElementChild;
}

export function openLogin(res, onDone) {
  const p = panel(res, `<span class="eyebrow">Hisob</span><h1>Kirish</h1>
    <p class="lead">Natijalaringiz saqlanadi, boshqa qurilmada ham ko'rinadi va reytingda qatnashasiz.</p>
    <div id="loginBox"></div><div class="acts"><button class="btn" data-a="close">Yopish</button></div>`);
  renderLogin(p.querySelector("#loginBox"), u => { res.hidden = true; onDone && onDone(u); });
}

// the user's chip at the top of the menu's side panel
export function renderAccount(el, { res, onChange }) {
  if (!apiOn) { el.hidden = true; return; }
  el.hidden = false;
  const u = getUser();
  if (!u) {
    el.innerHTML = `<button class="acct-login" id="acctLogin"><span class="av">?</span><span><b>Kirish</b><small>Google yoki Telegram orqali</small></span><i>›</i></button>`;
    el.querySelector("#acctLogin").onclick = () => openLogin(res, onChange);
    return;
  }
  el.innerHTML = `<div class="acct-me">${avatar(u)}<span><b>${esc(u.name || u.username || "Foydalanuvchi")}</b><small>${u.username ? "@" + esc(u.username) : esc(u.email || "")}</small></span>
    <button class="btn small" id="acctOut">Chiqish</button></div>`;
  el.querySelector("#acctOut").onclick = () => { logout(); onChange && onChange(null); };
}

const KEYS = [["exam", "Imtihon"], ["training", "Trening"], ...ELEMENTS.map(e => ["practice:" + e.id, e.name])];
export const keyName = k => (KEYS.find(x => x[0] === k) || [k, k])[1];
const mmss = t => `${Math.floor(t / 60)}:${String(t % 60).padStart(2, "0")}`;

export function showLeaderboard(res, key = "exam") {
  const p = panel(res, `<span class="eyebrow">Reyting</span><h1>Eng yaxshi natijalar</h1>
    <div class="seg lb-keys">${KEYS.slice(0, 2).map(([k, t]) => `<button data-k="${k}" class="${k === key ? "on" : ""}">${t}</button>`).join("")}</div>
    <div class="lb-body"><p class="lead">Yuklanmoqda…</p></div>
    <p class="note">Har bir foydalanuvchining o'tgan urinishlaridan eng kam jarima balli (teng bo'lsa, tezrog'i).</p>
    <div class="acts"><button class="btn primary" data-a="close">Yopish</button></div>`);
  p.querySelectorAll("[data-k]").forEach(b => b.onclick = () => showLeaderboard(res, b.dataset.k));
  const body = p.querySelector(".lb-body");
  leaderboard(key).then(items => {
    if (!items.length) { body.innerHTML = `<p class="lead">Hali hech kim o'tmagan. Birinchi bo'ling!</p>`; return; }
    body.innerHTML = `<div class="tblwrap"><table class="lb"><thead><tr><th>#</th><th>Foydalanuvchi</th><th>Ball</th><th>Vaqt</th><th>O'tgan</th></tr></thead><tbody>
      ${items.map(r => `<tr class="${r.me ? "me" : ""}"><td class="num">${r.rank}</td><td class="who">${avatar(r, "av sm")}<span>${esc(r.name || r.username || "—")}${r.me ? " <em>(siz)</em>" : ""}</span></td><td class="num">${r.total}</td><td class="num">${mmss(r.t)}</td><td class="num">${r.passes}×</td></tr>`).join("")}
      </tbody></table></div>`;
  }).catch(e => { body.innerHTML = `<p class="login-err">${esc(e.message)}</p>`; });
}
