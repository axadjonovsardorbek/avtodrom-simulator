// The admin panel (admin.html): the numbers at a glance, the analytics (cars, adverts, players),
// users, results, the leaderboard, the advertising on the cars (screen, rear window; per car) and
// the cars the simulator offers. Talks to the server (server/).
import "./admin.css";
import { apiOn, apiBase, api, getUser, logout, refreshMe, leaderboard, authHeader } from "../net/api.js";
import { renderLogin, esc, avatar, keyName } from "../ui/account.js";
import { ELEMENTS } from "../world/tracks.js";
import { ALL_CARS } from "../cars/index.js";

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
  const u = await refreshMe();
  if (!u) {
    gate(`<h1>Admin panel</h1><p>Kirish uchun admin hisobingiz bilan kiring.</p><div id="loginBox"></div>`);
    renderLogin($("#loginBox"), () => start());
    return;
  }
  if (!u.admin) {
    gate(`<h1>Ruxsat yo'q</h1><p>${esc(u.name)} hisobida admin huquqi yo'q. Admin qo'shish: serverdagi ADMINS ro'yxati yoki boshqa admin.</p><button class="btn" id="out">Boshqa hisob bilan kirish</button>`);
    $("#out").onclick = () => { logout(); start(); };
    return;
  }
  shell();
  const tab = location.hash.slice(1);
  go(VIEWS[tab] ? tab : "home");
}

function gate(html) {
  root.innerHTML = `<div class="gate"><div class="card"><span class="mark" style="margin:auto">A</span>${html}<p><a href="./">← Simulyatorga qaytish</a></p></div></div>`;
}

const NAV = [
  ["home", "Umumiy", '<path d="M3 12 12 4l9 8"/><path d="M5 10v10h14V10"/>'],
  ["analytics", "Analitika", '<path d="M3 3v18h18"/><path d="m7 15 4-5 3 3 5-7"/>'],
  ["users", "Foydalanuvchilar", '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0"/><path d="M16 4.5a3.5 3.5 0 0 1 0 7M18 14a6 6 0 0 1 3.5 6"/>'],
  ["results", "Natijalar", '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>'],
  ["rating", "Reyting", '<path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0z"/><path d="M17 5h3v2a3 3 0 0 1-3 3M7 5H4v2a3 3 0 0 0 3 3"/>'],
  ["ads", "Reklama", '<rect x="3" y="5" width="18" height="12" rx="2"/><path d="M8 21h8M12 17v4"/>'],
  ["cars", "Mashinalar", '<path d="M5 17h14v-5l-2-5H7l-2 5z"/><circle cx="8" cy="17" r="2"/><circle cx="16" cy="17" r="2"/>']
];

function shell() {
  const u = getUser();
  root.innerHTML = `<div class="layout">
    <nav class="side">
      <div class="brand"><span class="mark">A</span><div><b>Avtodrom</b><small>Admin panel</small></div></div>
      ${NAV.map(([id, t, d]) => `<button class="nav" data-go="${id}">${icon(d)}${t}</button>`).join("")}
      <div class="spacer"></div>
      <a class="back" href="./">← Simulyatorga qaytish</a>
    </nav>
    <main class="main">
      <div class="top"><h1 id="title"></h1><div class="me">${avatar(u)}<b>${esc(u.name)}</b><button class="btn small" id="logout">Chiqish</button></div></div>
      <div id="view"></div>
    </main>
  </div>`;
  root.querySelectorAll("[data-go]").forEach(b => b.onclick = () => go(b.dataset.go));
  $("#logout").onclick = () => { logout(); start(); };
}

let current = "";
function go(id) {
  current = id;
  history.replaceState(null, "", "#" + id);
  root.querySelectorAll("[data-go]").forEach(b => b.classList.toggle("on", b.dataset.go === id));
  $("#title").textContent = NAV.find(n => n[0] === id)[1];
  const v = $("#view"); v.innerHTML = `<p class="empty">Yuklanmoqda…</p>`;
  VIEWS[id](v).catch(e => { if (current === id) v.innerHTML = `<p class="empty">${esc(e.message)}</p>`; if (e.status === 401 || e.status === 403) start(); });
}

const VIEWS = { home, analytics, users, results, rating, ads, cars };

// ---- the numbers at a glance

async function home(v) {
  const s = await api("/api/admin/stats");
  const U = s.users, A = s.attempts, max = Math.max(1, ...s.days.map(d => Math.max(d.attempts, d.joined)));
  const mmax = s.mistakes.length ? s.mistakes[0].pts : 1;
  v.innerHTML = `
    <div class="cards">
      <div class="card"><small>Foydalanuvchilar</small><b>${U.total}</b><span><em>+${U.newToday}</em> bugun · <em>+${U.newWeek}</em> 7 kunda</span></div>
      <div class="card"><small>Faol foydalanuvchilar</small><b>${U.activeToday}</b><span>bugun · ${U.activeWeek} ta 7 kunda</span></div>
      <div class="card"><small>Urinishlar</small><b>${A.total}</b><span>${A.today} ta bugun</span></div>
      <div class="card"><small>Imtihondan o'tish</small><b>${pct(A.examsPassed, A.exams)}</b><span>${A.examsPassed} / ${A.exams} imtihon</span></div>
    </div>
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
    <div class="toolbar"><input type="search" id="q" placeholder="Ism, @username, email yoki telefon" value="${esc(q)}"><span class="tag">${out.total} ta</span></div>
    <div class="box" style="padding:6px 8px">
      ${list.length ? `<div class="tblwrap"><table><thead><tr><th>Foydalanuvchi</th><th>Kirish</th><th>Ro'yxatdan o'tgan</th><th>Oxirgi faollik</th><th class="num">Urinish</th><th class="num">Eng yaxshi imtihon</th><th></th></tr></thead><tbody>
        ${list.map(({ user: u, attempts, bestExam }) => `<tr class="click" data-u="${u.id}">
          <td><div class="who">${avatar(u, "av sm")}<span><b>${esc(u.name || "—")}</b><small>${u.username ? "@" + esc(u.username) : esc(u.email)}</small></span></div></td>
          <td>${provider(u.provider)}</td><td class="when">${when(u.created)}</td><td class="when">${when(u.seen)}</td>
          <td class="num">${attempts}</td><td class="num">${bestExam ?? "—"}</td>
          <td>${u.blocked ? `<span class="tag bad">Bloklangan</span>` : ""}${u.admin ? ` <span class="tag adm">Admin</span>` : ""}</td></tr>`).join("")}
        </tbody></table></div>` : `<p class="empty">Hech kim topilmadi.</p>`}
    </div>
    ${list.length < out.total ? `<div class="more"><button class="btn" id="more">Yana ko'rsatish</button></div>` : ""}`;
  let t = 0;
  $("#q", v).oninput = e => { clearTimeout(t); t = setTimeout(() => users(v, e.target.value.trim()).then(() => { const i = $("#q", v); i.focus(); i.setSelectionRange(i.value.length, i.value.length); }).catch(failed), 300); };
  const more = $("#more", v); if (more) more.onclick = () => users(v, q, offset + 50, list).catch(failed);
  v.querySelectorAll("[data-u]").forEach(tr => tr.onclick = () => openUser(+tr.dataset.u, () => users(v, q).catch(failed)));
}

async function openUser(id, changed) {
  const { user: u, attempts } = await api("/api/admin/users/" + id).catch(e => { failed(e); return {}; });
  if (!u) return;
  const me = getUser();
  const bg = document.createElement("div"), d = document.createElement("aside");
  bg.className = "drawer-bg"; d.className = "drawer";
  const close = () => { bg.remove(); d.remove(); document.removeEventListener("keydown", esc_); };
  const esc_ = e => { if (e.key === "Escape") close(); };
  bg.onclick = close; document.addEventListener("keydown", esc_);
  const passed = attempts.filter(a => a.passed).length;
  d.innerHTML = `
    <div class="head">${avatar(u, "av lg")}<div><h2>${esc(u.name || "—")}</h2>${u.blocked ? `<span class="tag bad">Bloklangan</span> ` : ""}${u.admin ? `<span class="tag adm">Admin</span>` : ""}</div><button class="btn small x" data-a="close">Yopish</button></div>
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
      ${u.id === me.id ? `<small class="tag">Bu siz</small>` : `
        <button class="btn" data-a="block">${u.blocked ? "Blokdan chiqarish" : "Bloklash"}</button>
        <button class="btn" data-a="admin">${u.admin ? "Admin huquqini olish" : "Admin qilish"}</button>
        <button class="btn danger" data-a="delete">O'chirish</button>`}
    </div>
    <h3>Urinishlar</h3>
    ${attempts.length ? `<div class="tblwrap"><table><thead><tr><th>Vaqt</th><th>Mashq</th><th>Natija</th><th class="num">Ball</th><th class="num">Vaqt</th></tr></thead><tbody>
      ${attempts.map(a => `<tr><td class="when">${when(a.at)}</td><td>${esc(keyName(a.key))}</td><td>${a.passed ? `<span class="tag ok">O'tdi</span>` : `<span class="tag bad">O'tmadi</span>`}</td><td class="num">${a.total}</td><td class="num">${mmss(a.t)}</td></tr>`).join("")}
      </tbody></table></div>` : `<p class="empty">Urinish yo'q.</p>`}`;
  document.body.append(bg, d);
  d.querySelector('[data-a="close"]').onclick = close;
  const act = async (body, msg) => { try { await api("/api/admin/users/" + u.id, { method: "PATCH", body }); toast(msg, "good"); close(); changed(); openUser(u.id, changed); } catch (e) { failed(e); } };
  const b = d.querySelector('[data-a="block"]'); if (b) b.onclick = () => act({ blocked: !u.blocked }, u.blocked ? "Blokdan chiqarildi" : "Bloklandi");
  const a = d.querySelector('[data-a="admin"]'); if (a) a.onclick = () => { if (u.admin || confirm(`${u.name} admin qilinsinmi? U hamma narsani boshqara oladi.`)) act({ admin: !u.admin }, u.admin ? "Admin huquqi olindi" : "Admin qilindi"); };
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
    <div class="toolbar"><select id="key"><option value="">Hammasi</option>${KEYS.map(([k, t]) => `<option value="${k}"${k === key ? " selected" : ""}>${esc(t)}</option>`).join("")}</select><span class="tag">${out.total} ta</span></div>
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

start();
