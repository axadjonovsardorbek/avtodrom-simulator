// The admin panel (admin.html): the numbers at a glance, the analytics (cars, adverts, players),
// users, results, the leaderboard, the advertising on the cars (screen, rear window; per car) and
// the cars the simulator offers. Talks to the server (server/).
import "./admin.css";
import { apiOn, apiBase, leaderboard } from "../net/api.js";
import { api, authHeader, getAdmin, login, logout, refreshAdmin } from "./adminApi.js";
import { esc, avatar, keyName } from "../ui/account.js";
import { ELEMENTS } from "../world/tracks.js";
import { ALL_CARS } from "../cars/index.js";
import { NAME, logo } from "../ui/brand.js";

const root = document.getElementById("admin");
const $ = (s, el = root) => el.querySelector(s);
const icon = d => `<svg viewBox="0 0 24 24" aria-hidden="true">${d}</svg>`;
const KEYS = [["exam", "Imtihon"], ["training", "Trening"], ...ELEMENTS.map(e => ["practice:" + e.id, "Mashq: " + e.name])];
const pad = n => String(n).padStart(2, "0");
const when = ms => { if (!ms) return "—"; const d = new Date(ms); return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`; };
const mmss = t => `${Math.floor(t / 60)}:${pad(t % 60)}`;
const size = b => b > 1 << 20 ? (b / (1 << 20)).toFixed(1) + " MB" : Math.max(1, Math.round(b / 1024)) + " KB";
const provider = p => ({ google: "Google", telegram: "Telegram", dev: "Sinov" })[p] || p;
const pct = (a, b) => b ? Math.round(a / b * 100) + "%" : "—";
const PLACES = [["screen", "Ekran"], ["rear", "Orqa oyna"]];
const shortCar = id => { const c = ALL_CARS.find(c => c.id === id); return c ? c.name.replace(/^(Chevrolet|Daewoo) /, "") : id || "—"; };
// a duration in hours and minutes (or minutes and seconds when short)
const dur = s => s >= 3600 ? `${Math.floor(s / 3600)} soat ${Math.round(s % 3600 / 60)} daq` : s >= 60 ? `${Math.round(s / 60)} daq` : `${s} s`;
const num = n => Number(n || 0).toLocaleString("ru-RU");
// one colour per car, the same everywhere in the panel
const CAR_COLORS = ["#f2b632", "#2f6fd6", "#3ddc84", "#ff5a3c", "#b07cff", "#2ec4d6", "#e879b9", "#9aa2ac"];
const carColor = id => { const i = ALL_CARS.findIndex(c => c.id === id); return CAR_COLORS[i < 0 ? CAR_COLORS.length - 1 : i % CAR_COLORS.length]; };

function toast(msg, kind = "") {
  const t = document.createElement("div"); t.className = "toast " + kind; t.textContent = msg; document.body.appendChild(t);
  setTimeout(() => t.remove(), 3200);
}
const failed = e => toast(e.message || "Xatolik", "bad");

// ---- entry: the login gate, then the panel

async function start() {
  if (!apiOn) return gate(`<h1>Server ulanmagan</h1><p>Sayt serversiz yig'ilgan. Admin panel uchun VITE_API_URL bilan qayta yig'ing (server/README.md).</p>`);
  const me = await refreshAdmin();
  if (!me) {
    // admins have their own login and password (not a player's Google / Telegram account)
    gate(`<h1>Admin panel</h1><p>Admin login va parolingiz bilan kiring.</p>
      <form id="alog" class="alog"><input id="aL" autocomplete="username" placeholder="Login" required><input id="aP" type="password" autocomplete="current-password" placeholder="Parol" required><button class="btn primary">Kirish</button></form>`);
    $("#alog").onsubmit = async e => {
      e.preventDefault(); const btn = $("#alog button"); btn.disabled = true;
      try { await login($("#aL").value.trim(), $("#aP").value); start(); } catch (err) { failed(err); btn.disabled = false; }
    };
    $("#aL").focus();
    return;
  }
  if (me.mustChange) return firstPassword();
  shell();
  const tab = location.hash.slice(1);
  go(VIEWS[tab] ? tab : "home");
}

// the default admin (admin / 1234): a new password before anything else
function firstPassword() {
  gate(`<h1>Yangi parol</h1><p>Siz standart parol bilan kirdingiz. Davom etish uchun yangi parol qo'ying (kamida 8 belgi).</p>
    <form id="fp" class="alog"><input id="f1" type="password" autocomplete="new-password" placeholder="Yangi parol" required minlength="8">
      <input id="f2" type="password" autocomplete="new-password" placeholder="Yangi parolni takrorlang" required minlength="8">
      <button class="btn primary">Saqlash</button><button type="button" class="btn" id="fpOut">Chiqish</button></form>`);
  $("#fpOut").onclick = () => { logout(); start(); };
  $("#fp").onsubmit = async e => {
    e.preventDefault();
    if ($("#f1").value !== $("#f2").value) return toast("Parollar bir xil emas", "bad");
    try { await api("/api/admin/password", { method: "PUT", body: { old: "1234", new: $("#f1").value } }); toast("Parol o'zgartirildi", "good"); start(); } catch (err) { failed(err); }
  };
  $("#f1").focus();
}

function gate(html) {
  root.innerHTML = `<div class="gate"><div class="card">${logo("mark")}${html}<p><a href="./">← Simulyatorga qaytish</a></p></div></div>`;
}

const NAV = [
  ["home", "Umumiy", '<path d="M3 12 12 4l9 8"/><path d="M5 10v10h14V10"/>'],
  ["analytics", "Analitika", '<path d="M3 3v18h18"/><path d="m7 15 4-5 3 3 5-7"/>'],
  ["users", "Foydalanuvchilar", '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0"/><path d="M16 4.5a3.5 3.5 0 0 1 0 7M18 14a6 6 0 0 1 3.5 6"/>'],
  ["results", "Natijalar", '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>'],
  ["rating", "Reyting", '<path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0z"/><path d="M17 5h3v2a3 3 0 0 1-3 3M7 5H4v2a3 3 0 0 0 3 3"/>'],
  ["ads", "Reklama", '<rect x="3" y="5" width="18" height="12" rx="2"/><path d="M8 21h8M12 17v4"/>'],
  ["shop", "Do'kon", '<path d="M4 7h16l-1.5 11a2 2 0 0 1-2 1.8h-9a2 2 0 0 1-2-1.8z"/><path d="M9 10V6a3 3 0 0 1 6 0v4"/>'],
  ["payments", "To'lovlar", '<rect x="2.5" y="5" width="19" height="14" rx="2"/><path d="M2.5 10h19M6 15h4"/>'],
  ["site", "Sozlamalar", '<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M2 12h3M19 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1"/>'],
  ["audit", "Jurnal", '<path d="M6 3h9l4 4v14H6z"/><path d="M14 3v5h5M9 12h7M9 16h7"/>'],
  ["cars", "Mashinalar", '<path d="M5 17h14v-5l-2-5H7l-2 5z"/><circle cx="8" cy="17" r="2"/><circle cx="16" cy="17" r="2"/>']
];

function shell() {
  const u = getAdmin();
  root.innerHTML = `<div class="layout">
    <nav class="side">
      <div class="brand">${logo("mark")}<div><b>${NAME}</b><small>Admin panel</small></div></div>
      ${NAV.map(([id, t, d]) => `<button class="nav" data-go="${id}">${icon(d)}${t}</button>`).join("")}
      <div class="spacer"></div>
      <a class="back" href="./">← Simulyatorga qaytish</a>
    </nav>
    <main class="main">
      <div class="top"><h1 id="title"></h1><div class="me">${avatar({ name: u.name || u.login })}<b>${esc(u.name || u.login)}</b><button class="btn small" data-go="admins">Adminlar</button><button class="btn small" id="logout">Chiqish</button></div></div>
      <div id="view"></div>
    </main>
  </div>`;
  root.querySelectorAll("[data-go]").forEach(b => b.onclick = () => go(b.dataset.go));      // the side menu, and "Adminlar" by the name
  $("#logout").onclick = () => { logout(); start(); };
}

let current = "";
function go(id) {
  current = id;
  history.replaceState(null, "", "#" + id);
  root.querySelectorAll("[data-go]").forEach(b => b.classList.toggle("on", b.dataset.go === id));
  $("#title").textContent = (NAV.find(n => n[0] === id) || [0, "Adminlar"])[1];
  const v = $("#view"); v.innerHTML = `<p class="empty">Yuklanmoqda…</p>`;
  VIEWS[id](v).catch(e => { if (current === id) v.innerHTML = `<p class="empty">${esc(e.message)}</p>`; if (e.status === 401 || e.status === 403) start(); });
}

const VIEWS = { home, analytics, users, results, rating, ads, cars, shop, payments, site, audit, admins };

// ---- the numbers at a glance

async function home(v) {
  const [s, R] = await Promise.all([api("/api/admin/stats"), api("/api/admin/revenue?days=14").catch(() => null)]);
  const U = s.users, A = s.attempts, max = Math.max(1, ...s.days.map(d => Math.max(d.attempts, d.joined)));
  const mmax = s.mistakes.length ? s.mistakes[0].pts : 1;
  v.innerHTML = `
    <div class="cards">
      <div class="card"><small>Foydalanuvchilar</small><b>${U.total}</b><span><em>+${U.newToday}</em> bugun · <em>+${U.newWeek}</em> 7 kunda</span></div>
      <div class="card"><small>Faol foydalanuvchilar</small><b>${U.activeToday}</b><span>bugun · ${U.activeWeek} ta 7 kunda</span></div>
      <div class="card"><small>Urinishlar</small><b>${A.total}</b><span>${A.today} ta bugun</span></div>
      <div class="card"><small>Imtihondan o'tish</small><b>${pct(A.examsPassed, A.exams)}</b><span>${A.examsPassed} / ${A.exams} imtihon</span></div>
    </div>
    ${R ? `<div class="cards">
      <div class="card"><small>Tushum bugun</small><b>${som(R.today.sum)}</b><span>${R.today.count} ta xarid</span></div>
      <div class="card"><small>Tushum 7 kun</small><b>${som(R.week.sum)}</b><span>${R.week.count} ta xarid</span></div>
      <div class="card"><small>Tushum 30 kun</small><b>${som(R.month.sum)}</b><span>${R.month.count} ta xarid</span></div>
      <div class="card"><small>Xaridorlar</small><b>${R.buyers}</b><span>jami ${som(R.all.sum)}</span></div>
    </div>` : ""}
    <div class="box"><h2>So'nggi 14 kun</h2>
      <div class="chart">${s.days.map(d => `<div class="col" title="${d.day}: ${d.attempts} urinish, ${d.people} kishi, ${d.joined} yangi"><div class="bars"><div class="bar" style="height:${d.attempts / max * 100}%"></div><div class="bar b2" style="height:${d.joined / max * 100}%"></div></div><small>${d.day.slice(8)}</small></div>`).join("")}</div>
      <div class="legend"><span><i></i>Urinishlar</span><span><i class="b2"></i>Yangi foydalanuvchilar</span></div>
    </div>
    <div class="grid2">
      <div class="box"><h2>Mashqlar <small>30 kun</small></h2>
        ${s.keys.length ? `<div class="tblwrap"><table><thead><tr><th>Mashq</th><th class="num">Urinish</th><th class="num">O'tgan</th><th class="num">O'rtacha ball</th></tr></thead><tbody>
          ${s.keys.map(k => `<tr><td>${esc(keyName(k.key))}</td><td class="num">${k.tries}</td><td class="num">${pct(k.passes, k.tries)}</td><td class="num">${k.avg}</td></tr>`).join("")}</tbody></table></div>` : `<p class="empty">Hali urinish yo'q.</p>`}
      </div>
      <div class="box"><h2>Eng ko'p ball olgan xatolar <small>30 kun</small></h2>
        ${s.mistakes.length ? `<div class="tblwrap"><table><tbody>
          ${s.mistakes.map(m => `<tr><td>${esc(m.n)}. ${esc(m.text)}</td><td class="num">${m.count}×</td><td><div class="mbar"><i style="width:${m.pts / mmax * 100}%"></i><b>${m.pts}</b></div></td></tr>`).join("")}</tbody></table></div>` : `<p class="empty">Xato qayd etilmagan.</p>`}
      </div>
    </div>`;
}

// ---- analytics: the cars, the adverts, the players

async function analytics(v, days = 30) {
  const s = await api("/api/admin/analytics?days=" + days);
  const T = s.totals, cars = s.cars, maxSecs = Math.max(1, ...cars.map(c => c.secs));
  const dayMax = Math.max(1, ...s.daily.map(d => Object.values(d.cars).reduce((n, c) => n + c.runs, 0)));
  const seen = [...new Set(s.daily.flatMap(d => Object.keys(d.cars)))];
  const spreadMax = Math.max(1, ...s.spread.map(x => x.devices));
  const step = s.daily.length > 31 ? 7 : s.daily.length > 14 ? 3 : 1;
  v.innerHTML = `
    <div class="toolbar"><div class="seg" id="period">${[[7, "7 kun"], [30, "30 kun"], [90, "90 kun"]].map(([d, t]) => `<button type="button" data-d="${d}" class="${d === days ? "on" : ""}">${t}</button>`).join("")}</div>
      <span class="hint" style="margin:0">Kirmagan o'yinchilar ham hisoblanadi (har bir qurilma alohida).</span></div>
    <div class="cards">
      <div class="card"><small>O'yinchilar</small><b>${num(T.devices)}</b><span>qurilma · ${num(T.users)} tasi hisob bilan</span></div>
      <div class="card"><small>Haydash</small><b>${num(T.runs)}</b><span>marta boshlangan</span></div>
      <div class="card"><small>Haydash vaqti</small><b>${dur(T.secs)}</b><span>${T.devices ? "o'rtacha " + dur(Math.round(T.secs / T.devices)) + " bir o'yinchiga" : "—"}</span></div>
      <div class="card"><small>Reklama ko'rinishi</small><b>${num(T.adViews)}</b><span>${dur(T.adSecs)} ko'z oldida</span></div>
    </div>
    <div class="box"><h2>Mashinalar <small>${days} kun</small></h2>
      ${cars.length ? `<div class="tblwrap"><table><thead><tr><th>Mashina</th><th>Haydash vaqti</th><th class="num">Boshlangan</th><th class="num">O'yinchi</th><th class="num">Hisob bilan</th><th class="num">Urinish</th><th class="num">O'tgan</th><th class="num">O'rtacha ball</th><th class="num">Reklama</th></tr></thead><tbody>
        ${cars.map(c => `<tr><td><span class="dot" style="background:${carColor(c.car)}"></span>${esc(shortCar(c.car))}</td>
          <td><div class="sbar"><i style="width:${c.secs / maxSecs * 100}%;background:${carColor(c.car)}"></i><b>${dur(c.secs)}</b><em>${pct(c.secs, T.secs)}</em></div></td>
          <td class="num">${num(c.runs)}</td><td class="num">${num(c.devices)}</td><td class="num">${num(c.users)}</td>
          <td class="num">${num(c.tries)}</td><td class="num">${pct(c.passes, c.tries)}</td><td class="num">${c.tries ? c.avg : "—"}</td><td class="num">${c.adViews ? num(c.adViews) + " · " + dur(c.adSecs) : "—"}</td></tr>`).join("")}
        </tbody></table></div>` : `<p class="empty">Hali hech kim haydamagan.</p>`}
    </div>
    <div class="grid2">
      <div class="box"><h2>Kunlar bo'yicha <small>boshlangan haydashlar</small></h2>
        <div class="chart stack">${s.daily.map((d, i) => { const tot = Object.values(d.cars).reduce((n, c) => n + c.runs, 0);
          return `<div class="col" title="${d.day}: ${tot} ta${Object.entries(d.cars).map(([id, c]) => `\n${shortCar(id)}: ${c.runs}`).join("")}"><div class="bars"><div class="pile" style="height:${tot / dayMax * 100}%">${Object.entries(d.cars).sort().map(([id, c]) => `<i style="flex:${c.runs};background:${carColor(id)}"></i>`).join("")}</div></div><small>${i % step ? "" : d.day.slice(8)}</small></div>`; }).join("")}</div>
        <div class="legend">${seen.map(id => `<span><i style="background:${carColor(id)}"></i>${esc(shortCar(id))}</span>`).join("")}</div>
      </div>
      <div class="box"><h2>Nechta mashinada haydaydi</h2>
        ${s.spread.length ? `<div class="tblwrap"><table><tbody>${s.spread.map(x => `<tr><td>${x.cars} ta mashina</td><td><div class="sbar"><i style="width:${x.devices / spreadMax * 100}%"></i><b>${num(x.devices)} o'yinchi</b></div></td></tr>`).join("")}</tbody></table></div>` : `<p class="empty">Ma'lumot yo'q.</p>`}
      </div>
    </div>
    <div class="box"><h2>Reklamalar <small>${days} kun</small></h2>
      ${s.ads.length ? s.ads.map(a => `<div class="adstat">
        <div class="prev">${a.url ? (a.video ? `<video src="${esc(a.url)}" muted playsinline preload="metadata"></video>` : `<img src="${esc(a.url)}" alt="" loading="lazy">`) : `<small>o'chirilgan</small>`}</div>
        <div><b>${esc(a.name || a.id)}</b>${a.gone ? ` <span class="tag">o'chirilgan</span>` : ""}
          <div class="nums"><span><b>${num(a.views)}</b> marta ko'rindi</span><span><b>${dur(a.secs)}</b> ko'z oldida</span><span><b>${num(a.devices)}</b> o'yinchi</span></div>
          <div class="tblwrap"><table><thead><tr><th>Mashina</th><th>Joyi</th><th class="num">Ko'rindi</th><th class="num">Vaqt</th><th class="num">O'yinchi</th></tr></thead><tbody>
            ${a.split.map(x => `<tr><td><span class="dot" style="background:${carColor(x.car)}"></span>${esc(shortCar(x.car))}</td><td>${x.place === "rear" ? "Orqa oyna" : "Ekran"}</td><td class="num">${num(x.views)}</td><td class="num">${dur(x.secs)}</td><td class="num">${num(x.devices)}</td></tr>`).join("")}
          </tbody></table></div></div></div>`).join("") : `<p class="empty">Reklama hali ko'rsatilmagan.</p>`}
      <p class="hint" style="margin-top:10px">Ekran reklamasi haydovchi o'rindig'idan (kabina ko'rinishida), orqa oyna reklamasi tashqaridan qaralganda hisoblanadi. "Ko'rindi": reklama shu holatda necha marta chiqqani.</p>
    </div>
    <div class="box" style="padding:6px 8px"><h2 style="padding:10px 10px 0">Hisob bilan o'ynaganlar <small>kim qaysi mashinada</small></h2>
      ${s.players.length ? `<div class="tblwrap"><table><thead><tr><th>Foydalanuvchi</th><th>Mashinalar</th><th class="num">Boshlangan</th><th class="num">Vaqt</th></tr></thead><tbody>
        ${s.players.map(p => `<tr class="click" data-u="${p.id}"><td><div class="who">${avatar(p, "av sm")}<span><b>${esc(p.name || "—")}</b>${p.username ? `<small>@${esc(p.username)}</small>` : ""}</span></div></td>
          <td><div class="split">${p.cars.map(c => `<i style="flex:${Math.max(c.secs, 1)};background:${carColor(c.car)}" title="${esc(shortCar(c.car))}: ${c.runs} marta, ${dur(c.secs)}"></i>`).join("")}</div>
            <small class="muted">${p.cars.map(c => `${esc(shortCar(c.car))} ${dur(c.secs)}`).join(" · ")}</small></td>
          <td class="num">${num(p.runs)}</td><td class="num">${dur(p.secs)}</td></tr>`).join("")}
        </tbody></table></div>` : `<p class="empty">Hisob bilan hali hech kim haydamagan.</p>`}
    </div>`;
  v.querySelectorAll("[data-d]").forEach(b => b.onclick = () => analytics(v, +b.dataset.d).catch(failed));
  v.querySelectorAll("[data-u]").forEach(tr => tr.onclick = () => openUser(+tr.dataset.u, () => {}));
}

// ---- users

async function users(v, q = "", offset = 0, acc = []) {
  const out = await api(`/api/admin/users?q=${encodeURIComponent(q)}&offset=${offset}&limit=50`);
  const list = acc.concat(out.items);
  v.innerHTML = `
    <div class="toolbar"><input type="search" id="q" placeholder="Ism, @username, email yoki telefon" value="${esc(q)}"><span class="tag">${out.total} ta</span><button class="btn small" data-export="users">⬇ CSV</button></div>
    <div class="box" style="padding:6px 8px">
      ${list.length ? `<div class="tblwrap"><table><thead><tr><th>Foydalanuvchi</th><th>Kirish</th><th>Ro'yxatdan o'tgan</th><th>Oxirgi faollik</th><th class="num">Urinish</th><th class="num">Eng yaxshi imtihon</th><th></th></tr></thead><tbody>
        ${list.map(({ user: u, attempts, bestExam }) => `<tr class="click" data-u="${u.id}">
          <td><div class="who">${avatar(u, "av sm")}<span><b>${esc(u.name || "—")}</b><small>${u.username ? "@" + esc(u.username) : esc(u.email)}</small></span></div></td>
          <td>${provider(u.provider)}</td><td class="when">${when(u.created)}</td><td class="when">${when(u.seen)}</td>
          <td class="num">${attempts}</td><td class="num">${bestExam ?? "—"}</td>
          <td>${u.blocked ? `<span class="tag bad">Bloklangan</span>` : ""}</td></tr>`).join("")}
        </tbody></table></div>` : `<p class="empty">Hech kim topilmadi.</p>`}
    </div>
    ${list.length < out.total ? `<div class="more"><button class="btn" id="more">Yana ko'rsatish</button></div>` : ""}`;
  let t = 0;
  $("#q", v).oninput = e => { clearTimeout(t); t = setTimeout(() => users(v, e.target.value.trim()).then(() => { const i = $("#q", v); i.focus(); i.setSelectionRange(i.value.length, i.value.length); }).catch(failed), 300); };
  const more = $("#more", v); if (more) more.onclick = () => users(v, q, offset + 50, list).catch(failed);
  v.querySelectorAll("[data-u]").forEach(tr => tr.onclick = () => openUser(+tr.dataset.u, () => users(v, q).catch(failed)));
}

async function openUser(id, changed) {
  const { user: u, attempts, purchases = [] } = await api("/api/admin/users/" + id).catch(e => { failed(e); return {}; });
  if (!u) return;
  const bg = document.createElement("div"), d = document.createElement("aside");
  bg.className = "drawer-bg"; d.className = "drawer";
  const close = () => { bg.remove(); d.remove(); document.removeEventListener("keydown", esc_); };
  const esc_ = e => { if (e.key === "Escape") close(); };
  bg.onclick = close; document.addEventListener("keydown", esc_);
  const passed = attempts.filter(a => a.passed).length;
  d.innerHTML = `
    <div class="head">${avatar(u, "av lg")}<div><h2>${esc(u.name || "—")}</h2>${u.blocked ? `<span class="tag bad">Bloklangan</span> ` : ""}</div><button class="btn small x" data-a="close">Yopish</button></div>
    <dl>
      <dt>Kirish</dt><dd>${provider(u.provider)}</dd>
      ${u.username ? `<dt>Telegram</dt><dd>@${esc(u.username)}</dd>` : ""}
      ${u.email ? `<dt>Email</dt><dd>${esc(u.email)}</dd>` : ""}
      ${u.phone ? `<dt>Telefon</dt><dd><a href="tel:${esc(u.phone)}">${esc(u.phone)}</a></dd>` : ""}
      <dt>Ro'yxatdan o'tgan</dt><dd>${when(u.created)}</dd>
      <dt>Oxirgi faollik</dt><dd>${when(u.seen)}</dd>
      <dt>Urinishlar</dt><dd>${attempts.length} ta, ${passed} tasi o'tgan</dd>
    </dl>
    <div class="acts">
      <button class="btn" data-a="block">${u.blocked ? "Blokdan chiqarish" : "Bloklash"}</button>
      <button class="btn danger" data-a="delete">O'chirish</button>
    </div>
    <h3>Pullik narsalar</h3>
    ${(() => {
      // every paid item, with what this user has of it; given by hand here until the online payment is in
      const items = [["all", "Hammasi (tarif)"], ...ALL_CARS.map(c => ["car:" + c.id, c.name]), ["instructor:rude", "18+ instruktor"]];
      const now = Date.now(), have = new Map(purchases.map(p => [p.item, p]));
      return `<div class="tblwrap"><table><thead><tr><th>Narsa</th><th>Holati</th><th></th></tr></thead><tbody>${items.map(([item, name]) => {
        const p = have.get(item), on = p && (p.until == null || p.until > now);
        const state = !p ? "—" : on ? (p.until == null ? `<span class="tag ok">Doimiy</span>` : `<span class="tag ok">${when(p.until)} gacha</span>`) : `<span class="tag bad">Muddati tugagan</span>`;
        return `<tr><td>${esc(name)}</td><td>${state}${p ? ` <small>${esc(p.source)}</small>` : ""}</td><td class="acts">
          <select data-days="${item}"><option value="0">Doimiy</option><option value="7">7 kun</option><option value="30">30 kun</option><option value="90">90 kun</option></select>
          <button class="btn small" data-grant="${item}">Berish</button>${p ? `<button class="btn small danger" data-revoke="${item}">Olish</button>` : ""}</td></tr>`;
      }).join("")}</tbody></table></div>`;
    })()}
    <h3>Urinishlar</h3>
    ${attempts.length ? `<div class="tblwrap"><table><thead><tr><th>Vaqt</th><th>Mashq</th><th>Natija</th><th class="num">Ball</th><th class="num">Vaqt</th></tr></thead><tbody>
      ${attempts.map(a => `<tr><td class="when">${when(a.at)}</td><td>${esc(keyName(a.key))}</td><td>${a.passed ? `<span class="tag ok">O'tdi</span>` : `<span class="tag bad">O'tmadi</span>`}</td><td class="num">${a.total}</td><td class="num">${mmss(a.t)}</td></tr>`).join("")}
      </tbody></table></div>` : `<p class="empty">Urinish yo'q.</p>`}`;
  document.body.append(bg, d);
  d.querySelector('[data-a="close"]').onclick = close;
  const act = async (body, msg) => { try { await api("/api/admin/users/" + u.id, { method: "PATCH", body }); toast(msg, "good"); close(); changed(); openUser(u.id, changed); } catch (e) { failed(e); } };
  const b = d.querySelector('[data-a="block"]'); if (b) b.onclick = () => act({ blocked: !u.blocked }, u.blocked ? "Blokdan chiqarildi" : "Bloklandi");
  const reopen = msg => { toast(msg, "good"); close(); openUser(u.id, changed); };
  d.querySelectorAll("[data-grant]").forEach(b => b.onclick = async () => {
    const item = b.dataset.grant, days = +d.querySelector(`[data-days="${item}"]`).value;
    try { await api(`/api/admin/users/${u.id}/grant`, { method: "POST", body: { item, days } }); reopen("Berildi"); } catch (e) { failed(e); }
  });
  d.querySelectorAll("[data-revoke]").forEach(b => b.onclick = async () => {
    if (!confirm("Olib qo'yilsinmi?")) return;
    try { await api(`/api/admin/users/${u.id}/grant/${encodeURIComponent(b.dataset.revoke)}`, { method: "DELETE" }); reopen("Olib qo'yildi"); } catch (e) { failed(e); }
  });
  const del = d.querySelector('[data-a="delete"]');
  if (del) del.onclick = async () => {
    if (!confirm(`${u.name} va uning barcha natijalari butunlay o'chirilsinmi? Buni qaytarib bo'lmaydi.`)) return;
    try { await api("/api/admin/users/" + u.id, { method: "DELETE" }); toast("O'chirildi", "good"); close(); changed(); } catch (e) { failed(e); }
  };
}

// ---- results

async function results(v, key = "", offset = 0, acc = []) {
  const out = await api(`/api/admin/attempts?key=${encodeURIComponent(key)}&offset=${offset}&limit=50`);
  const list = acc.concat(out.items);
  const top = m => Object.values(m || {}).sort((a, b) => b.pts - a.pts).slice(0, 2).map(x => `${esc(x.n)}. ${esc(x.text)}`).join("; ");
  v.innerHTML = `
    <div class="toolbar"><select id="key"><option value="">Hammasi</option>${KEYS.map(([k, t]) => `<option value="${k}"${k === key ? " selected" : ""}>${esc(t)}</option>`).join("")}</select><span class="tag">${out.total} ta</span><button class="btn small" data-export="attempts">⬇ CSV</button></div>
    <div class="box" style="padding:6px 8px">
      ${list.length ? `<div class="tblwrap"><table><thead><tr><th>Vaqt</th><th>Foydalanuvchi</th><th>Mashq</th><th>Natija</th><th class="num">Ball</th><th class="num">Vaqt</th><th>Mashina</th><th>Asosiy xatolar</th></tr></thead><tbody>
        ${list.map(a => `<tr class="click" data-u="${a.user.id}"><td class="when">${when(a.at)}</td><td><div class="who">${avatar(a.user, "av sm")}<span>${esc(a.user.name || "—")}</span></div></td>
          <td>${esc(keyName(a.key))}</td><td>${a.passed ? `<span class="tag ok">O'tdi</span>` : `<span class="tag bad">O'tmadi</span>`}</td>
          <td class="num">${a.total}</td><td class="num">${mmss(a.t)}</td><td>${esc((ALL_CARS.find(c => c.id === a.car) || { name: a.car || "—" }).name.replace("Chevrolet ", ""))}</td><td>${top(a.mistakes)}</td></tr>`).join("")}
        </tbody></table></div>` : `<p class="empty">Natija yo'q.</p>`}
    </div>
    ${list.length < out.total ? `<div class="more"><button class="btn" id="more">Yana ko'rsatish</button></div>` : ""}`;
  $("#key", v).onchange = e => results(v, e.target.value).catch(failed);
  const more = $("#more", v); if (more) more.onclick = () => results(v, key, offset + 50, list).catch(failed);
  v.querySelectorAll("[data-u]").forEach(tr => tr.onclick = () => openUser(+tr.dataset.u, () => {}));
}

// ---- leaderboard

async function rating(v, key = "exam") {
  const items = await leaderboard(key);
  v.innerHTML = `
    <div class="toolbar"><select id="key">${KEYS.map(([k, t]) => `<option value="${k}"${k === key ? " selected" : ""}>${esc(t)}</option>`).join("")}</select></div>
    <div class="box" style="padding:6px 8px">
      ${items.length ? `<div class="tblwrap"><table><thead><tr><th class="num">#</th><th>Foydalanuvchi</th><th class="num">Ball</th><th class="num">Vaqt</th><th class="num">O'tgan</th><th>Qachon</th></tr></thead><tbody>
        ${items.map(r => `<tr><td class="num">${r.rank}</td><td><div class="who">${avatar(r, "av sm")}<span>${esc(r.name || "—")}${r.username ? `<small>@${esc(r.username)}</small>` : ""}</span></div></td><td class="num">${r.total}</td><td class="num">${mmss(r.t)}</td><td class="num">${r.passes}×</td><td class="when">${when(r.at)}</td></tr>`).join("")}
        </tbody></table></div>` : `<p class="empty">Hali hech kim o'tmagan.</p>`}
    </div>
    <p class="hint" style="color:var(--muted)">Har bir foydalanuvchining eng yaxshi o'tgan urinishi: kam ball, teng bo'lsa tezrog'i. Bloklanganlar ko'rinmaydi. O'yinchilar ham shu jadvalni ko'radi.</p>`;
  $("#key", v).onchange = e => rating(v, e.target.value).catch(failed);
}

// ---- advertising

async function ads(v) {
  let state = await api("/api/admin/ads"), dirty = false;
  const render = () => {
    const items = state.items;
    v.innerHTML = `
      <div class="box"><h2>Mashinalardagi reklama</h2>
        <p class="hint">Har bir reklama uchun joyini tanlang: <b>Ekran</b> (salondagi markaziy ekran) yoki <b>Orqa oyna</b> (tashqaridan ko'rinadi, ichkaridan oyna shaffof qoladi). Mashinalarni belgilasangiz, faqat o'shalarda chiqadi; hech biri belgilanmasa, hammasida. Bir joyda bir nechta reklama bo'lsa, navbat bilan ko'rsatiladi: rasm berilgan soniya turadi, video oxirigacha (ovozsiz) o'ynaydi. Ekranli mashinalar: Cobalt, Malibu 2 Premier. ${state.custom ? "Ro'yxat bo'sh bo'lsa, ekranlar o'z rasmini ko'rsatadi." : "Hozir saytning o'zidagi <code>ads/ads.json</code> ishlayapti; birinchi fayl yuklanishi bilan shu ro'yxat ishlay boshlaydi."}</p>
        <label class="drop" id="drop"><input type="file" id="file" accept="image/jpeg,image/png,image/webp,image/gif,video/mp4,video/webm,video/quicktime" multiple hidden>
          <b>Fayl tanlang</b> yoki shu yerga tashlang<br><small>JPG, PNG, WEBP, GIF yoki MP4, WEBM. 200 MB gacha. Ekran uchun 2:1 (1280×640), orqa oyna uchun 5:2 (1500×600) nisbat yaxshi.</small></label>
        <div class="progress" id="prog" hidden><i></i></div>
        ${items.length ? items.map((a, i) => `<div class="ad${a.on ? "" : " off"}" data-i="${i}">
          <div class="prev">${a.video ? `<video src="${esc(a.url)}" muted loop playsinline preload="metadata"></video>` : `<img src="${esc(a.url)}" alt="" loading="lazy">`}</div>
          <div class="meta"><b>${esc(a.name || "fayl")}</b><small>${a.video ? "Video" : "Rasm"} · ${size(a.size)}</small>
            <div class="seg" role="group" aria-label="Joyi">${PLACES.map(([p, t]) => `<button type="button" data-place="${p}" class="${(a.place || "screen") === p ? "on" : ""}">${t}</button>`).join("")}</div>
            <div class="chips" role="group" aria-label="Mashinalar"><button type="button" data-all class="${a.cars && a.cars.length ? "" : "on"}">Hammasi</button>${ALL_CARS.map(c => `<button type="button" data-car="${c.id}" class="${a.cars && a.cars.includes(c.id) ? "on" : ""}">${esc(shortCar(c.id))}</button>`).join("")}</div>
          </div>
          <div class="ctl">
            ${a.video ? `<small class="tag">oxirigacha</small>` : `<input class="field" type="number" min="2" max="600" value="${a.sec}" data-sec title="Necha soniya"> <small>soniya</small>`}
            <label class="sw" title="Ko'rsatish"><input type="checkbox" data-on${a.on ? " checked" : ""}><span></span></label>
            <button class="btn small" data-up${i === 0 ? " disabled" : ""} title="Yuqoriga">↑</button>
            <button class="btn small" data-down${i === items.length - 1 ? " disabled" : ""} title="Pastga">↓</button>
            <button class="btn small danger" data-del>O'chirish</button>
          </div></div>`).join("") : `<p class="empty">Reklama yo'q.</p>`}
        ${items.length ? `<div class="more"><span>${dirty ? "O'zgarishlar saqlanmagan" : ""}</span><button class="btn primary" id="save"${dirty ? "" : " disabled"}>Saqlash</button></div>` : ""}
      </div>`;
    const changed = () => { dirty = true; render(); };
    v.querySelectorAll(".ad").forEach(row => {
      const i = +row.dataset.i, a = items[i];
      const sec = row.querySelector("[data-sec]"); if (sec) sec.onchange = () => { a.sec = Math.max(2, Math.min(600, +sec.value || 8)); changed(); };
      row.querySelector("[data-on]").onchange = e => { a.on = e.target.checked; changed(); };
      row.querySelectorAll("[data-place]").forEach(b => b.onclick = () => { a.place = b.dataset.place; changed(); });
      row.querySelector("[data-all]").onclick = () => { a.cars = []; changed(); };
      row.querySelectorAll("[data-car]").forEach(b => b.onclick = () => {
        const set = new Set(a.cars || []); set.has(b.dataset.car) ? set.delete(b.dataset.car) : set.add(b.dataset.car);
        a.cars = ALL_CARS.map(c => c.id).filter(id => set.has(id)); if (a.cars.length === ALL_CARS.length) a.cars = []; changed();
      });
      row.querySelector("[data-up]").onclick = () => { items.splice(i - 1, 0, items.splice(i, 1)[0]); changed(); };
      row.querySelector("[data-down]").onclick = () => { items.splice(i + 1, 0, items.splice(i, 1)[0]); changed(); };
      row.querySelector("[data-del]").onclick = async () => {
        if (!confirm(`"${a.name}" o'chirilsinmi?`)) return;
        try { state = await api("/api/admin/ads/" + a.id, { method: "DELETE" }); toast("O'chirildi", "good"); render(); } catch (e) { failed(e); }
      };
      const vid = row.querySelector("video"); if (vid) { row.onmouseenter = () => vid.play().catch(() => {}); row.onmouseleave = () => vid.pause(); }
    });
    const save = $("#save", v);
    if (save) save.onclick = async () => {
      try { state = await api("/api/admin/ads", { method: "PUT", body: { items: items.map(a => ({ id: a.id, sec: a.sec, on: a.on, place: a.place || "screen", cars: a.cars || [] })) } }); dirty = false; toast("Saqlandi. O'yinchilar sahifani yangilaganda ko'rinadi.", "good"); render(); } catch (e) { failed(e); }
    };
    const drop = $("#drop", v), file = $("#file", v);
    file.onchange = () => upload([...file.files]);
    drop.ondragover = e => { e.preventDefault(); drop.classList.add("over"); };
    drop.ondragleave = () => drop.classList.remove("over");
    drop.ondrop = e => { e.preventDefault(); drop.classList.remove("over"); upload([...e.dataTransfer.files]); };
  };
  const upload = async files => {
    if (dirty && !confirm("Saqlanmagan o'zgarishlar yo'qoladi. Davom etilsinmi?")) return;
    for (const f of files) {
      const prog = $("#prog", v); prog.hidden = false;
      try { state = await sendFile(f, k => { prog.firstElementChild.style.width = Math.round(k * 100) + "%"; }); dirty = false; toast(`${f.name} yuklandi`, "good"); }
      catch (e) { failed(e); }
      render();
    }
  };
  render();
}

// an upload with its progress (fetch cannot report it)
function sendFile(file, onProgress) {
  return new Promise((ok, bad) => {
    const x = new XMLHttpRequest();
    x.open("POST", apiBase + "/api/admin/ads");
    for (const [k, val] of Object.entries(authHeader())) x.setRequestHeader(k, val);
    x.setRequestHeader("X-File-Name", encodeURIComponent(file.name));
    x.upload.onprogress = e => e.lengthComputable && onProgress(e.loaded / e.total);
    x.onload = () => { let out = {}; try { out = JSON.parse(x.responseText); } catch (_) {} if (x.status === 200) ok(out); else bad(new Error(out.error || "Yuklab bo'lmadi (" + x.status + ")")); };
    x.onerror = () => bad(new Error("Server bilan aloqa yo'q"));
    x.send(file);
  });
}

// ---- cars

async function cars(v) {
  let { disabled } = await api("/api/admin/cars");
  const render = () => {
    v.innerHTML = `<div class="box"><h2>Mashinalar</h2>
      <p class="hint">O'chirilgan mashina menyuda, garajda va yo'ldagi boshqa mashinalar orasida ko'rinmaydi. Kamida bittasi yoqilgan qoladi.</p>
      <div class="cars">${ALL_CARS.map(c => { const on = !disabled.includes(c.id); return `<label class="carrow${on ? "" : " off"}"><span><b>${esc(c.name)}</b><small>${esc(c.info || "")}</small></span>
        <span class="sw"><input type="checkbox" data-car="${c.id}"${on ? " checked" : ""}><span></span></span></label>`; }).join("")}</div></div>`;
    v.querySelectorAll("[data-car]").forEach(i => i.onchange = async () => {
      const next = i.checked ? disabled.filter(x => x !== i.dataset.car) : [...disabled, i.dataset.car];
      if (next.length >= ALL_CARS.length) { toast("Kamida bitta mashina yoqilgan bo'lishi kerak", "bad"); i.checked = true; return; }
      try { ({ disabled } = await api("/api/admin/cars", { method: "PUT", body: { disabled: next } })); toast(i.checked ? "Yoqildi" : "O'chirildi", "good"); } catch (e) { failed(e); }
      render();
    });
  };
  render();
}

// ---- shop: selling on/off, what is paid and its price, the tariffs, promo codes, payments
const som = n => (+n || 0).toLocaleString("ru-RU").replace(/,/g, " ") + " so'm";
const DAYS = [[0, "Doimiy"], [7, "7 kun"], [30, "30 kun"], [90, "90 kun"], [365, "1 yil"]];
const daySel = (d, attr) => `<select ${attr}>${DAYS.map(([v, t]) => `<option value="${v}"${v === d ? " selected" : ""}>${t}</option>`).join("")}</select>`;
async function shop(v) {
  let { shop: S, payments } = await api("/api/admin/shop");
  const items = [...ALL_CARS.map(c => ["car:" + c.id, c.name]), ["instructor:rude", "18+ instruktor"]];
  const prod = id => S.products.find(p => p.id === id);
  const [promos, orders] = await Promise.all([api("/api/admin/promos"), api("/api/admin/orders")]);
  const render = () => {
    const bundles = S.products.filter(p => p.items.includes("all"));
    v.innerHTML = `
    <div class="box"><h2>Do'kon</h2>
      <label class="carrow big"><span><b>To'lovlar yoqilgan</b><small>${S.enabled ? "Pullik deb belgilangan narsalar sotiladi" : "O'chiq: hamma narsa hammaga bepul"}</small></span>
        <span class="sw"><input type="checkbox" id="shopOn"${S.enabled ? " checked" : ""}><span></span></span></label>
      <p class="hint">${payments ? "✅ Inpay ulangan." : "⚠️ Inpay ulanmagan: serverning .env fayliga INPAY_MERCHANT_ID va INPAY_MERCHANT_TOKEN yozilishi kerak. Ungacha faqat bepul promokod va qo'lda berish ishlaydi."}</p></div>
    <div class="box"><h2>Narsalar va narxlar</h2>
      <p class="hint">Pullik bo'lmagan narsa hammaga bepul. Narx kamida 1 000 so'm; narxsiz narsa sotuvga chiqmaydi.</p>
      <div class="tblwrap"><table class="shop"><thead><tr><th>Narsa</th><th>Pullik</th><th>Narx, so'm</th><th>Muddat</th><th>Sotuvda</th></tr></thead><tbody>
      ${items.map(([it, name]) => { const p = prod(it) || { price: 0, days: 0, on: true }; return `<tr><td>${esc(name)}</td>
        <td><span class="sw"><input type="checkbox" data-paid="${it}"${S.paid.includes(it) ? " checked" : ""}><span></span></span></td>
        <td><input type="number" min="0" step="1000" data-price="${it}" value="${p.price || ""}" placeholder="—"></td>
        <td>${daySel(p.days, `data-days="${it}"`)}</td>
        <td><span class="sw"><input type="checkbox" data-on="${it}"${p.on ? " checked" : ""}><span></span></span></td></tr>`; }).join("")}
      </tbody></table></div></div>
    <div class="box"><h2>Tariflar</h2>
      <p class="hint">Tarif barcha pullik narsalarni bir to'lovda ochadi (keyin qo'shiladiganlarini ham).</p>
      <div class="tblwrap"><table class="shop"><thead><tr><th>Nomi</th><th>Narx, so'm</th><th>Muddat</th><th>Sotuvda</th><th></th></tr></thead><tbody>
      ${bundles.map(b => `<tr><td><input data-bname="${b.id}" value="${esc(b.name)}" maxlength="80"></td>
        <td><input type="number" min="0" step="1000" data-bprice="${b.id}" value="${b.price || ""}" placeholder="—"></td>
        <td>${daySel(b.days, `data-bdays="${b.id}"`)}</td>
        <td><span class="sw"><input type="checkbox" data-bon="${b.id}"${b.on ? " checked" : ""}><span></span></span></td>
        <td><button class="btn small danger" data-bdel="${b.id}">O'chirish</button></td></tr>`).join("")}
      </tbody></table></div>
      <div class="acts"><button class="btn" id="addTariff">+ Tarif qo'shish</button><button class="btn primary" id="shopSave">Saqlash</button></div></div>
    <div class="box"><h2>Promokodlar</h2>
      <div class="promoform">
        <input id="pCode" placeholder="KOD" maxlength="32">
        <select id="pKind"><option value="percent">Foiz (%)</option><option value="amount">Summa (so'm)</option><option value="free">Bepul</option></select>
        <input id="pValue" type="number" min="1" placeholder="Qiymat">
        <select id="pProd"><option value="">Hamma mahsulot</option>${S.products.map(p => `<option value="${p.id}">${esc(p.name)}</option>`).join("")}</select>
        <input id="pMax" type="number" min="0" placeholder="Necha marta (0 = cheksiz)">
        <input id="pUntil" type="date" title="Amal qilish muddati">
        <button class="btn primary" id="pAdd">Qo'shish</button>
      </div>
      ${promos.items.length ? `<div class="tblwrap"><table><thead><tr><th>Kod</th><th>Chegirma</th><th>Mahsulot</th><th class="num">Ishlatilgan</th><th>Muddat</th><th>Faol</th><th></th></tr></thead><tbody>
        ${promos.items.map(p => `<tr><td><b>${esc(p.code)}</b></td><td>${p.kind === "free" ? "Bepul" : p.kind === "percent" ? p.value + "%" : som(p.value)}</td>
          <td>${p.products.length ? p.products.map(id => esc((prod(id) || { name: id }).name)).join(", ") : "Hammasi"}</td>
          <td class="num">${p.used}${p.maxUses ? " / " + p.maxUses : ""}</td><td>${p.until ? when(p.until) : "—"}</td>
          <td><span class="sw"><input type="checkbox" data-pact="${esc(p.code)}"${p.active ? " checked" : ""}><span></span></span></td>
          <td><button class="btn small danger" data-pdel="${esc(p.code)}">O'chirish</button></td></tr>`).join("")}</tbody></table></div>` : `<p class="empty">Promokod yo'q.</p>`}
    </div>
    <div class="box"><h2>To'lovlar</h2>
      <div class="cards"><div class="card"><small>Tushum</small><b>${som(orders.paidTotal)}</b></div><div class="card"><small>To'langan xaridlar</small><b>${orders.paidCount}</b></div></div>
      ${orders.items.length ? `<div class="tblwrap"><table><thead><tr><th>#</th><th>Vaqt</th><th>Kim</th><th>Nima</th><th class="num">Summa</th><th>Promokod</th><th>Holat</th></tr></thead><tbody>
        ${orders.items.map(o => `<tr><td>${o.id}</td><td class="when">${when(o.created)}</td><td>${esc(o.userName)}</td><td>${esc(o.name)}</td><td class="num">${som(o.amount)}</td><td>${esc(o.promo || "—")}</td>
          <td><span class="tag ${o.status === "paid" ? "ok" : o.status === "pending" ? "" : "bad"}">${{ paid: "To'langan", pending: "Kutilmoqda", failed: "Xato", cancelled: "Bekor" }[o.status] || o.status}</span></td></tr>`).join("")}</tbody></table></div>` : `<p class="empty">Hali to'lov yo'q.</p>`}
    </div>`;
    const read = () => {
      // the form back into the settings: one product per item (its price, term, on sale), then the tariffs
      const paid = [...v.querySelectorAll("[data-paid]")].filter(i => i.checked).map(i => i.dataset.paid);
      const products = items.map(([it, name]) => ({ id: it, name, items: [it], price: +v.querySelector(`[data-price="${it}"]`).value || 0, days: +v.querySelector(`[data-days="${it}"]`).value, on: v.querySelector(`[data-on="${it}"]`).checked }));
      for (const b of bundles) products.push({ id: b.id, name: v.querySelector(`[data-bname="${b.id}"]`).value.trim() || "Hammasi", items: ["all"], price: +v.querySelector(`[data-bprice="${b.id}"]`).value || 0, days: +v.querySelector(`[data-bdays="${b.id}"]`).value, on: v.querySelector(`[data-bon="${b.id}"]`).checked });
      return { enabled: v.querySelector("#shopOn").checked, paid, products };
    };
    const save = async (next, msg) => { try { ({ shop: S, payments } = await api("/api/admin/shop", { method: "PUT", body: next })); toast(msg, "good"); render(); } catch (e) { failed(e); } };
    v.querySelector("#shopOn").onchange = e => { if (!e.target.checked && !confirm("To'lovlar o'chirilsinmi? Hamma narsa hammaga bepul bo'ladi.")) { e.target.checked = true; return; } save(read(), e.target.checked ? "To'lovlar yoqildi" : "To'lovlar o'chirildi: hammasi bepul"); };
    v.querySelector("#shopSave").onclick = () => save(read(), "Saqlandi");
    v.querySelector("#addTariff").onclick = () => { const r = read(); let n = 1; while (r.products.some(p => p.id === (n === 1 ? "all" : "all-" + n))) n++; r.products.push({ id: n === 1 ? "all" : "all-" + n, name: "Hammasi", items: ["all"], price: 0, days: 30, on: false }); S = r; render(); };
    v.querySelectorAll("[data-bdel]").forEach(b => b.onclick = () => { const r = read(); r.products = r.products.filter(p => p.id !== b.dataset.bdel); save(r, "Tarif o'chirildi"); });
    const promoSave = async body => { try { const out = await api("/api/admin/promos", { method: "POST", body }); promos.items = out.items; toast("Saqlandi", "good"); render(); } catch (e) { failed(e); } };
    v.querySelector("#pKind").onchange = e => { v.querySelector("#pValue").disabled = e.target.value === "free"; };
    v.querySelector("#pAdd").onclick = () => {
      const kind = v.querySelector("#pKind").value, until = v.querySelector("#pUntil").value, prodId = v.querySelector("#pProd").value;
      promoSave({ code: v.querySelector("#pCode").value.trim(), kind, value: kind === "free" ? 0 : +v.querySelector("#pValue").value, products: prodId ? [prodId] : [], maxUses: +v.querySelector("#pMax").value || 0, until: until ? new Date(until + "T23:59:59").getTime() : null, active: true });
    };
    v.querySelectorAll("[data-pact]").forEach(i => i.onchange = () => { const p = promos.items.find(x => x.code === i.dataset.pact); promoSave({ ...p, active: i.checked }); });
    v.querySelectorAll("[data-pdel]").forEach(b => b.onclick = async () => { if (!confirm(b.dataset.pdel + " o'chirilsinmi?")) return; try { promos.items = (await api("/api/admin/promos/" + encodeURIComponent(b.dataset.pdel), { method: "DELETE" })).items; render(); } catch (e) { failed(e); } });
  };
  render();
}

// ---- CSV downloads (the token goes in a header, so the file is fetched and handed to the browser)
async function download(what) {
  try {
    const r = await fetch(apiBase + "/api/admin/export/" + what, { headers: authHeader() });
    if (!r.ok) throw new Error("HTTP " + r.status);
    const url = URL.createObjectURL(await r.blob()), a = document.createElement("a");
    a.href = url; a.download = `${what}-${new Date().toISOString().slice(0, 10)}.csv`; document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  } catch (e) { failed(e); }
}
root.addEventListener("click", e => { const b = e.target.closest("[data-export]"); if (b) download(b.dataset.export); });

// ---- payments: the money by day, product and promo code; every order, filtered

const STATUS = { paid: ["To'langan", "ok"], pending: ["Kutilmoqda", ""], failed: ["Xato", "bad"], cancelled: ["Bekor", "bad"] };
async function payments(v, days = 30, status = "", q = "", offset = 0, acc = []) {
  const [R, out] = await Promise.all([api("/api/admin/revenue?days=" + days), api(`/api/admin/order-list?status=${status}&q=${encodeURIComponent(q)}&offset=${offset}`)]);
  const list = acc.concat(out.items), max = Math.max(1, ...R.daily.map(d => d.sum));
  const st = Object.fromEntries(R.status.map(x => [x.key, x])), started = R.status.reduce((n, x) => n + x.count, 0);
  v.innerHTML = `
    <div class="toolbar">${[7, 30, 90, 365].map(d => `<button class="btn small${d === days ? " primary" : ""}" data-days="${d}">${d === 365 ? "1 yil" : d + " kun"}</button>`).join("")}<button class="btn small" data-export="orders">⬇ CSV</button></div>
    <div class="cards">
      <div class="card"><small>Bugun</small><b>${som(R.today.sum)}</b><span>${R.today.count} ta xarid</span></div>
      <div class="card"><small>7 kun</small><b>${som(R.week.sum)}</b><span>${R.week.count} ta xarid</span></div>
      <div class="card"><small>30 kun</small><b>${som(R.month.sum)}</b><span>${R.month.count} ta xarid</span></div>
      <div class="card"><small>Jami</small><b>${som(R.all.sum)}</b><span>${R.all.count} ta · ${R.buyers} xaridor</span></div>
      <div class="card"><small>O'rtacha chek</small><b>${som(R.all.count ? Math.round(R.all.sum / R.all.count) : 0)}</b><span>hamma vaqt</span></div>
      <div class="card"><small>To'lovni tugatganlar</small><b>${pct((st.paid || {}).count || 0, started)}</b><span>${days} kunda boshlangan ${started} ta to'lovdan</span></div>
    </div>
    <div class="box"><h2>Kunlik tushum <small>${days} kun</small></h2>
      <div class="chart">${R.daily.map(d => `<div class="col" title="${d.day}: ${som(d.sum)}, ${d.count} ta"><div class="bars"><div class="bar" style="height:${d.sum / max * 100}%"></div></div><small>${days <= 31 ? d.day.slice(8) : ""}</small></div>`).join("")}</div></div>
    <div class="grid2">
      <div class="box"><h2>Mahsulotlar <small>${days} kun</small></h2>${R.products.length ? `<div class="tblwrap"><table><thead><tr><th>Mahsulot</th><th class="num">Soni</th><th class="num">Tushum</th></tr></thead><tbody>${R.products.map(p => `<tr><td>${esc(p.key)}</td><td class="num">${p.count}</td><td class="num">${som(p.sum)}</td></tr>`).join("")}</tbody></table></div>` : `<p class="empty">Sotuv yo'q.</p>`}</div>
      <div class="box"><h2>Promokodlar <small>${days} kun</small></h2>${R.promos.length ? `<div class="tblwrap"><table><thead><tr><th>Kod</th><th class="num">Ishlatilgan</th><th class="num">Berilgan chegirma</th></tr></thead><tbody>${R.promos.map(p => `<tr><td><b>${esc(p.key)}</b></td><td class="num">${p.count}</td><td class="num">${som(p.sum)}</td></tr>`).join("")}</tbody></table></div>` : `<p class="empty">Promokod bilan xarid yo'q.</p>`}</div>
    </div>
    <div class="toolbar"><input type="search" id="oq" placeholder="Ism, mahsulot, promokod yoki #" value="${esc(q)}">
      <select id="ost"><option value="">Hamma holat</option>${Object.entries(STATUS).map(([k, [t]]) => `<option value="${k}"${k === status ? " selected" : ""}>${t}</option>`).join("")}</select></div>
    <div class="box" style="padding:6px 8px">
      ${list.length ? `<div class="tblwrap"><table><thead><tr><th>#</th><th>Yaratilgan</th><th>To'langan</th><th>Kim</th><th>Nima</th><th class="num">Narx</th><th class="num">To'langan</th><th>Promokod</th><th>Holat</th></tr></thead><tbody>
        ${list.map(o => `<tr class="click" data-u="${o.user}"><td>${o.id}</td><td class="when">${when(o.created)}</td><td class="when">${when(o.paidAt)}</td><td>${esc(o.userName)}</td><td>${esc(o.name)}</td><td class="num">${som(o.price)}</td><td class="num">${som(o.amount)}</td><td>${esc(o.promo || "—")}</td>
          <td><span class="tag ${(STATUS[o.status] || [])[1] || ""}">${(STATUS[o.status] || [o.status])[0]}</span></td></tr>`).join("")}</tbody></table></div>
        ${out.items.length === 100 ? `<div class="acts"><button class="btn" id="more">Yana</button></div>` : ""}` : `<p class="empty">Buyurtma topilmadi.</p>`}
    </div>`;
  v.querySelectorAll("[data-days]").forEach(b => b.onclick = () => payments(v, +b.dataset.days, status, q).catch(failed));
  let t; v.querySelector("#oq").oninput = e => { clearTimeout(t); t = setTimeout(() => payments(v, days, status, e.target.value.trim()).then(() => { const i = v.querySelector("#oq"); i.focus(); i.setSelectionRange(i.value.length, i.value.length); }).catch(failed), 350); };
  v.querySelector("#ost").onchange = e => payments(v, days, e.target.value, q).catch(failed);
  v.querySelectorAll("[data-u]").forEach(r => r.onclick = () => openUser(+r.dataset.u));
  const more = v.querySelector("#more"); if (more) more.onclick = () => payments(v, days, status, q, offset + 100, list).catch(failed);
}

// ---- site switches: maintenance and the banner over the game's menu

async function site(v) {
  let { site: S } = await api("/api/admin/site");
  const day = ms => { if (!ms) return ""; const d = new Date(ms); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
  v.innerHTML = `
    <div id="integ"></div>
    <div class="box"><h2>Texnik ishlar</h2>
      <label class="carrow big"><span><b>Texnik ishlar rejimi</b><small>Yoqilsa, o'yinchilar menyu o'rniga shu xabarni ko'radi</small></span>
        <span class="sw"><input type="checkbox" id="mOn"${S.maintenance ? " checked" : ""}><span></span></span></label>
      <textarea id="mText" rows="3" maxlength="500" placeholder="Masalan: Yangilanish ketmoqda, 20:00 da qaytamiz">${esc(S.maintenanceText || "")}</textarea></div>
    <div class="box"><h2>E'lon (menyu ustida)</h2>
      <p class="hint">Bo'sh qoldirilsa, e'lon ko'rsatilmaydi.</p>
      <textarea id="bText" rows="2" maxlength="300" placeholder="Masalan: Yangi Kia K5 qo'shildi! Promokod: K5YANGI">${esc(S.banner || "")}</textarea>
      <div class="promoform">
        <select id="bKind">${[["info", "Ma'lumot"], ["promo", "Aksiya"], ["warn", "Ogohlantirish"]].map(([k, t]) => `<option value="${k}"${k === S.bannerKind ? " selected" : ""}>${t}</option>`).join("")}</select>
        <input id="bUntil" type="date" value="${day(S.bannerUntil)}" title="Qachongacha (bo'sh = o'chirguncha)">
      </div>
      <div class="banner-prev ${esc(S.bannerKind || "info")}" id="bPrev">${esc(S.banner || "Ko'rinishi shu yerda")}</div>
      <div class="acts"><button class="btn primary" id="siteSave">Saqlash</button></div></div>`;
  const prev = () => { const p = v.querySelector("#bPrev"); p.className = "banner-prev " + v.querySelector("#bKind").value; p.textContent = v.querySelector("#bText").value || "Ko'rinishi shu yerda"; };
  v.querySelector("#bText").oninput = prev; v.querySelector("#bKind").onchange = prev;
  const read = () => { const u = v.querySelector("#bUntil").value; return { maintenance: v.querySelector("#mOn").checked, maintenanceText: v.querySelector("#mText").value, banner: v.querySelector("#bText").value, bannerKind: v.querySelector("#bKind").value, bannerUntil: u ? new Date(u + "T23:59:59").getTime() : null }; };
  const save = async () => { try { ({ site: S } = await api("/api/admin/site", { method: "PUT", body: read() })); toast("Saqlandi", "good"); } catch (e) { failed(e); } };
  v.querySelector("#siteSave").onclick = save;
  v.querySelector("#mOn").onchange = e => { if (e.target.checked && !confirm("Texnik ishlar rejimi yoqilsinmi? O'yinchilar o'ynay olmaydi.")) { e.target.checked = false; return; } save(); };
  integrations(v.querySelector("#integ"));
}

// ---- the keys of Google sign-in, the Telegram bot and the inPAY kassa: kept in the database, in force at once.
// Secrets are never shown: only whether one is set and its last 4 characters; empty on saving = unchanged.
async function integrations(box) {
  let { integrations: G } = await api("/api/admin/integrations");
  const secret = (id, s, label) => `<label class="fld"><span>${label}</span><input id="${id}" type="password" autocomplete="off" placeholder="${s.set ? "saqlangan ••••" + esc(s.tail) + " (o'zgartirish uchun yangisini yozing)" : "kiritilmagan"}">
    ${s.set ? `<label class="chk"><input type="checkbox" data-clear="${id}"> o'chirish</label>` : ""}</label>`;
  const field = (id, val, label, ph = "") => `<label class="fld"><span>${label}</span><input id="${id}" autocomplete="off" value="${esc(val || "")}" placeholder="${ph}"></label>`;
  const draw = () => {
    box.innerHTML = `<div class="box"><h2>Integratsiyalar</h2>
      <p class="hint">Kalitlar bazada saqlanadi va saqlangan zahoti ishlaydi, serverni qayta ishga tushirish shart emas. Maxfiy kalitlar qayta ko'rsatilmaydi.</p>
      <h3>Google orqali kirish</h3>${field("gId", G.googleClientId, "Client ID", "xxxx.apps.googleusercontent.com")}
      <h3>Telegram bot</h3>${field("tBot", G.telegramBot, "Bot nomi", "rulda_bot")}${secret("tTok", G.telegramToken, "Bot token (BotFather)")}
      <h3>To'lovlar: inPAY ${G.payments ? `<span class="tag ok">ulangan</span>` : `<span class="tag">ulanmagan</span>`}</h3>
      ${field("iMer", G.inpayMerchant, "Merchant ID")}${secret("iTok", G.inpayToken, "Merchant token")}${field("iUrl", G.inpayUrl, "API manzili")}
      <div class="acts"><button class="btn primary" id="igSave">Saqlash</button></div></div>`;
    box.querySelector("#igSave").onclick = async () => {
      const val = id => box.querySelector("#" + id).value;
      const clear = [...box.querySelectorAll("[data-clear]:checked")].map(c => ({ tTok: "telegramToken", iTok: "inpayToken" })[c.dataset.clear]);
      try {
        ({ integrations: G } = await api("/api/admin/integrations", { method: "PUT", body: { googleClientId: val("gId"), telegramBot: val("tBot"), telegramToken: val("tTok"), inpayMerchant: val("iMer"), inpayToken: val("iTok"), inpayUrl: val("iUrl"), clear } }));
        toast("Integratsiyalar saqlandi", "good"); draw();
      } catch (e) { failed(e); }
    };
  };
  draw();
}

// ---- the log of what the admins changed

const ACTIONS = [[/PUT \/api\/admin\/shop/, "Do'kon sozlamalari"], [/POST \/api\/admin\/promos/, "Promokod saqlandi"], [/DELETE \/api\/admin\/promos/, "Promokod o'chirildi"],
  [/POST .*\/grant/, "Narsa berildi"], [/DELETE .*\/grant/, "Narsa qaytarib olindi"], [/PATCH \/api\/admin\/users/, "Foydalanuvchi o'zgardi"], [/DELETE \/api\/admin\/users/, "Foydalanuvchi o'chirildi"],
  [/PUT \/api\/admin\/ads/, "Reklama sozlamalari"], [/POST \/api\/admin\/ads/, "Reklama yuklandi"], [/DELETE \/api\/admin\/ads/, "Reklama o'chirildi"], [/PUT \/api\/admin\/cars/, "Mashinalar"], [/PUT \/api\/admin\/site/, "Sayt sozlamalari"], [/PUT \/api\/admin\/integrations/, "Integratsiyalar"], [/PUT \/api\/admin\/password/, "Parol o'zgartirildi"]];
async function audit(v, offset = 0, acc = []) {
  const out = await api("/api/admin/audit?offset=" + offset), list = acc.concat(out.items);
  const what = a => (ACTIONS.find(([re]) => re.test(a)) || [0, a])[1];
  v.innerHTML = `<div class="box" style="padding:6px 8px">
    ${list.length ? `<div class="tblwrap"><table><thead><tr><th>Vaqt</th><th>Admin</th><th>Nima qildi</th><th>Tafsilot</th></tr></thead><tbody>
      ${list.map(a => `<tr><td class="when">${when(a.at)}</td><td>${esc(a.admin || "—")}</td><td><b>${esc(what(a.action))}</b><small class="muted"> ${esc(a.action.split(" ")[1].replace("/api/admin/", ""))}</small></td><td><code class="detail">${esc(a.detail.slice(0, 220))}</code></td></tr>`).join("")}</tbody></table></div>
      ${out.items.length === 100 ? `<div class="acts"><button class="btn" id="more">Yana</button></div>` : ""}` : `<p class="empty">Hali hech narsa o'zgartirilmagan.</p>`}</div>`;
  const more = v.querySelector("#more"); if (more) more.onclick = () => audit(v, offset + 100, list).catch(failed);
}

// ---- the admins: their own logins (not players); add, remove, one's own password

async function admins(v) {
  const out = await api("/api/admin/admins"), me = getAdmin();
  v.innerHTML = `
    <div class="box"><h2>Adminlar</h2>
      <p class="hint">Adminlar o'yinchilardan alohida: admin panelga faqat shu login va parol bilan kiriladi. O'yindagi Google/Telegram hisobi admin huquqini bermaydi.</p>
      <div class="tblwrap"><table><thead><tr><th>Login</th><th>Ism</th><th>Qo'shilgan</th><th>Oxirgi kirish</th><th></th></tr></thead><tbody>
      ${out.items.map(a => `<tr><td><b>${esc(a.login)}</b></td><td>${esc(a.name || "—")}</td><td class="when">${when(a.created)}</td><td class="when">${when(a.lastLogin)}</td>
        <td>${a.id === me.id ? `<span class="tag">Siz</span>` : `<button class="btn small danger" data-adel="${a.id}" data-login="${esc(a.login)}">O'chirish</button>`}</td></tr>`).join("")}
      </tbody></table></div></div>
    <div class="grid2">
      <div class="box"><h2>Yangi admin</h2>
        <form id="addA" class="alog"><input id="nL" placeholder="Login (lotin harf, raqam)" required minlength="3" maxlength="32" autocomplete="off">
          <input id="nN" placeholder="Ism" maxlength="80"><input id="nP" type="password" placeholder="Parol (kamida 8 belgi)" required minlength="8" autocomplete="new-password">
          <button class="btn primary">Qo'shish</button></form></div>
      <div class="box"><h2>Mening parolim</h2>
        <form id="pwd" class="alog"><input id="oP" type="password" placeholder="Hozirgi parol" required autocomplete="current-password">
          <input id="wP" type="password" placeholder="Yangi parol (kamida 8 belgi)" required minlength="8" autocomplete="new-password">
          <button class="btn primary">O'zgartirish</button></form>
        <p class="hint">O'zgartirilganda boshqa qurilmalardagi kirishlaringiz yopiladi.</p></div>
    </div>`;
  v.querySelector("#addA").onsubmit = async e => {
    e.preventDefault();
    try { await api("/api/admin/admins", { method: "POST", body: { login: v.querySelector("#nL").value.trim(), name: v.querySelector("#nN").value.trim(), password: v.querySelector("#nP").value } }); toast("Admin qo'shildi", "good"); admins(v); } catch (err) { failed(err); }
  };
  v.querySelector("#pwd").onsubmit = async e => {
    e.preventDefault();
    try { await api("/api/admin/password", { method: "PUT", body: { old: v.querySelector("#oP").value, new: v.querySelector("#wP").value } }); toast("Parol o'zgartirildi", "good"); e.target.reset(); } catch (err) { failed(err); }
  };
  v.querySelectorAll("[data-adel]").forEach(b => b.onclick = async () => {
    if (!confirm(b.dataset.login + " adminlikdan o'chirilsinmi?")) return;
    try { await api("/api/admin/admins/" + b.dataset.adel, { method: "DELETE" }); admins(v); } catch (err) { failed(err); }
  });
}

start();
