// DOM overlay: instrument cluster, task card, score, toasts, minimap,
// penalty log, start light, menus and the result protocol.
import { PASS_LIMIT } from "../sim/penalties.js";
import { analyse, clearHistory } from "../sim/history.js";
import { drawProtocol } from "./protocol.js";
import { drawCertificate } from "./certificate.js";
import { dailyTask } from "../sim/daily.js";
import { loadHistory } from "../sim/history.js";
import { ACHIEVEMENTS, loadAchievements } from "../sim/achievements.js";
import { ELEMENTS } from "../world/tracks.js";
import { CARS } from "../cars/index.js";
import { apiOn, getUser, updateUser } from "../net/api.js";
import { NAME, TAGLINE, logo } from "./brand.js";
import { REGIONS, REGION_NAMES, formatNumber, plateParts } from "../render/plates.js";
import { carLocked, moodLocked, carItem, productsFor, shopInfo, quote, buy } from "../net/shop.js";
import { renderAccount, showLeaderboard } from "./account.js";

const $ = (sel, root = document) => root.querySelector(sel);
const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };
export const fmt = t => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, "0")}`;

function gauge(id, max, step, label, unit, red) {
  // 240° dial, 0 at -210°, max at +30°
  const A0 = -210, A1 = 30, R = 78;
  const ang = v => (A0 + (A1 - A0) * v / max) * Math.PI / 180;
  let ticks = "";
  for (let v = 0; v <= max + 1e-6; v += step / 2) {
    const a = ang(v), major = Math.abs(v / step - Math.round(v / step)) < 1e-6;
    const r0 = major ? R - 12 : R - 6;
    ticks += `<line x1="${Math.cos(a) * r0}" y1="${Math.sin(a) * r0}" x2="${Math.cos(a) * R}" y2="${Math.sin(a) * R}" class="${major ? "tk" : "tk2"}${red && v >= red ? " red" : ""}"/>`;
    if (major) ticks += `<text x="${Math.cos(a) * (R - 24)}" y="${Math.sin(a) * (R - 24) + 4}" class="tn">${v}</text>`;
  }
  return `<svg viewBox="-92 -92 184 150" class="gauge" id="${id}">
    <circle r="88" class="gface"/>${ticks}
    <text y="34" class="glabel">${label}</text><text y="48" class="gunit">${unit}</text>
    <g class="needle"><line x1="-10" y1="0" x2="${R - 6}" y2="0"/><circle r="6"/></g></svg>`;
}

export class Hud {
  constructor(root, handlers) {
    this.root = root;
    this.h = handlers;
    root.innerHTML = `
      <canvas id="gl"></canvas>
      <header class="topbar">
        <div class="brand">${logo("mark-logo")}<div><b>${NAME}</b><small id="modeLabel">Simulyator</small></div></div>
        <div class="tb-btns">
          <button class="tb" data-a="camera" title="Kamera (C)"><span id="camLabel">Kabina</span></button>
          <button class="tb" data-a="map" title="Xarita (M)">Xarita</button>
          <button class="tb" data-a="log" title="Xatolar">Xatolar <i id="logCount">0</i></button>
          <button class="tb" data-a="mouse" id="mouseBtn" title="Rulni sichqoncha bilan boshqarish">Sichqoncha-rul</button>
          <button class="tb" data-a="mute" id="muteBtn" title="Ovoz (L)">Ovoz</button>
          <button class="tb" data-a="help" title="Boshqaruv">?</button>
          <button class="tb fs" data-a="fullscreen" title="To'liq ekran">⛶</button>
          <button class="tb primary" data-a="pause" title="Menyu (Esc)">Menyu</button>
        </div>
      </header>
      <section class="tutor" id="tutor" hidden></section>
      <section class="task" id="task"><span class="eyebrow" id="taskTitle"></span><p id="taskText"></p><p class="hint" id="taskHint"></p></section>
      <section class="score"><div><small>Jarima</small><b id="pts">0</b><em>/ ${PASS_LIMIT}</em></div><div><small>Vaqt</small><b id="time">0:00</b></div><div><small>Mashq</small><b id="prog">–</b></div></section>
      <canvas class="minimap" id="minimap" width="520" height="520"></canvas>
      <div class="startlight" id="startlight" hidden><span></span><b>START</b></div>
      <div class="toasts" id="toasts" aria-live="polite"></div>
      <section class="replay" id="replay" hidden></section>
      <aside class="log" id="logPanel" hidden><h3>Xatolar protokoli</h3><ol id="log"></ol></aside>
      <section class="cluster">
        ${gauge("tach", 7, 1, "×1000", "ayl/daq", 6)}
        <div class="mid">
          <div class="lamps">
            <i id="lL" class="ar">◀</i><i id="lHaz">△</i><i id="lP">(P)</i><i id="lBelt">Kamar</i><i id="lEng">Dvig.</i><i id="lR" class="ar">▶</i>
          </div>
          <div class="gear" id="gear">N</div>
          <div class="kmh"><b id="kmh">0</b><small>km/soat</small></div>
          <div class="pedals"><span title="Ilashish"><i id="pC"></i></span><span title="Tormoz"><i id="pB"></i></span><span title="Gaz"><i id="pG"></i></span></div>
        </div>
        ${gauge("speedo", 80, 10, "km/soat", "", 0)}
      </section>
      <section class="touchpad" id="touchpad">
        <div class="tp-steer">
          <div class="wheelpad" id="wheelpad" aria-label="Rul: aylantiring"><div id="wheelSvg" class="wheelimg"><img src="icons/wheel.webp" alt="" draggable="false"><i class="wheelmark"></i></div></div>
        </div>
        <div class="tp-mid">
          <div class="row">
            <button class="rnd sig" data-act="sigL" id="tSigL" aria-label="Chap chiroq"><svg viewBox="0 0 24 24"><path d="M10 6 4 12l6 6v-4h10v-4H10z"/></svg></button>
            <button class="rnd haz" data-act="hazard" id="tHaz" aria-label="Avariya"><svg viewBox="0 0 24 24"><path d="M12 4 3 19h18z"/><path d="M12 9.5 7.6 17h8.8z"/></svg></button>
            <button class="rnd sig" data-act="sigR" id="tSigR" aria-label="O'ng chiroq"><svg viewBox="0 0 24 24"><path d="m14 6 6 6-6 6v-4H4v-4h10z"/></svg></button>
          </div>
          <div class="row small">
            <button class="pill" data-act="belt" id="tBelt">Kamar</button>
            <button class="pill" data-act="engine" id="tEng">Dvigatel</button>
            <button class="pill" data-act="hand" id="tHand">(P) Qo'l tormozi</button>
          </div>
        </div>
        <div class="tp-right">
          <div class="tspd"><b id="tSpd">0</b><small>km/soat</small></div>
          <div class="gearbox">
            <button class="rnd gearbtn manual-only" data-act="gUp" aria-label="Uzatma yuqori">+</button>
            <button class="rnd gearbtn" data-act="gToggle" id="tGear" aria-label="Uzatma">D</button>
            <button class="rnd gearbtn manual-only" data-act="gDown" aria-label="Uzatma past">−</button>
          </div>
          <button class="pedal cl manual-only" data-hold="clutch"><i></i><span>Ilashish</span></button>
          <button class="pedal br" data-hold="brake"><i></i><span>Tormoz</span></button>
          <button class="pedal gs" data-hold="gas"><i></i><span>Gaz</span></button>
        </div>
      </section>
      <div class="rotate" id="rotate"><svg viewBox="0 0 24 24"><rect x="7" y="2" width="10" height="20" rx="2"/><path d="M3 12a9 9 0 0 1 4-7.5M21 12a9 9 0 0 1-4 7.5"/></svg><b>Telefonni yotqizing</b><small>Simulyator gorizontal holatda o'ynaladi</small></div>
      <div class="overlay" id="menu"></div>
      <div class="overlay" id="result" hidden></div>
      <div class="overlay" id="help" hidden></div>`;
    root.querySelectorAll("[data-a]").forEach(b => b.addEventListener("click", () => { b.blur(); this.h.action(b.dataset.a); }));
    this.canvas = $("#gl", root);
    this.mm = $("#minimap", root);
    this.lastLog = 0;
    this.buildHelp();
  }

  /* ---------- menu ---------- */
  // the menu again as it is now (after a login, or the admin's car list arriving)
  refreshMenu() { if (this.menuOpen) this.showMenu(this.menuState); }

  showMenu(state) {
    const opening = !this.menuOpen;
    this.menuState = state;
    const m = $("#menu", this.root), S = this.h.settings;
    // the coming-in animation when the menu opens, not when it is drawn again (a login, prices arriving)
    if (opening) { m.classList.add("anim"); clearTimeout(this.animT); this.animT = setTimeout(() => m.classList.remove("anim"), 1200); }
    const icon = d => `<svg viewBox="0 0 24 24" aria-hidden="true">${d}</svg>`;
    const ICONS = {
      piyoda: '<path d="M4 20h16M6 20l2-8m4 8 0-8m6 8-2-8"/><circle cx="12" cy="5" r="1.6"/>',
      estakada: '<path d="M3 18h4l6-8h4l4 8"/><path d="M3 21h18"/>',
      burilish: '<path d="M5 20v-8h7V5h7"/><path d="m16 2 3 3-3 3"/>',
      chorraha: '<path d="M9 3v18M15 3v18M3 9h18M3 15h18"/>',
      ilon: '<path d="M5 21c0-4 7-3 7-7s-7-3-7-7 4-4 7-4"/>',
      boks: '<path d="M4 4h16v16H4z"/><path d="M10 20v-7h4v7"/>',
      temir: '<path d="M4 7h16M4 17h16M7 4v16M12 4v16M17 4v16"/>',
      tezlashish: '<path d="M4 18a8 8 0 1 1 16 0"/><path d="m12 18 4-6"/>',
      avariya: '<path d="M12 4 3 20h18z"/><path d="M12 10v4M12 17v.5"/>',
      parkovka: '<path d="M5 3h14v18H5z"/><path d="M9 17V7h4a3 3 0 0 1 0 6H9"/>'
    };
    const iconFor = id => icon(ICONS[id.split("-")[0]] || ICONS.chorraha);
    const els = ELEMENTS.map(e => `<button class="elbtn" data-el="${e.id}"><span class="ico">${iconFor(e.id)}</span><span class="nm">${e.name}</span><i>${e.mapNo}</i></button>`).join("");
    // segmented control: [value, label] pairs
    const seg = (id, opts) => `<div class="seg" id="${id}">${opts.map(([v, t]) => `<button data-v="${v}">${t}</button>`).join("")}</div>`;
    const COLORS = [["original", "conic-gradient(#d33, #f3f4f2, #1b2b63, #3a3d41, #d33)", "Asl rangi"], ["white", "#f3f4f2", "Oq"], ["blue", "#1b2b63", "To'q ko'k"], ["graphite", "#3a3d41", "Grafit"]];
    m.innerHTML = `
      <div class="menu-grid">
        <section class="panel menu-main">
          <div class="hero">${logo("hero-logo")}<div><h1 class="wordmark">${NAME}</h1><span class="eyebrow">${TAGLINE} · Avtodrom · B toifa</span></div></div>
          <p class="lead">Amaliy imtihonni to'liq avtodromda yoki alohida mashqlarda takrorlang. Jarima ballari rasmiy jadval bo'yicha.</p>
          ${state && state.canResume ? `<button class="resume" id="resume"><span>▶</span> Davom ettirish</button>` : ""}
          ${(() => { const d = dailyTask(new Date(), ELEMENTS), p = d.progress(loadHistory()), done = p >= d.goal; return `<div class="daily${done ? " done" : ""}"><span class="di">${done ? "✓" : "★"}</span><div><small>Kunlik vazifa</small><b>${d.text}</b><div class="dbar"><i style="width:${Math.round(p / d.goal * 100)}%"></i></div></div><em>${p}/${d.goal}</em></div>`; })()}
          <button class="learnbtn" data-mode="learn"><span class="ico">${icon('<path d="M4 6h16M4 12h10M4 18h6"/><path d="m16 15 2 2 4-4"/>')}</span><span><b>Qadamma-qadam o'quv</b><small>Kamar, dvigatel, uzatma, qo'l tormozi va yurib ketish: har bir qadam ko'rsatiladi</small></span></button>
          <div class="modes">
            <button class="mode exam" data-mode="exam">
              <span class="ico">${icon('<path d="M7 3h10v4l-5 4-5-4z"/><path d="M5 21h14M8 21l1-6h6l1 6"/>')}</span>
              <b>Imtihon</b><small>13 mashq ketma-ket, haqiqiy o'lchamda. ${PASS_LIMIT} balldan oshsa — to'xtatiladi.</small></button>
            <button class="mode train" data-mode="training">
              <span class="ico">${icon('<path d="M4 12a8 8 0 1 0 3-6.2"/><path d="M4 4v4h4"/>')}</span>
              <b>Trening</b><small>Xuddi shu marshrut, xato qilsangiz ham davom etasiz.</small></button>
            <div class="mode city" aria-disabled="true">
              <span class="ico">${icon('<path d="M3 21h18M5 21V8l5-3v16M10 21V3l9 4v14"/><path d="M13 9h3M13 13h3M13 17h3"/>')}</span>
              <b>Shahar</b><small>Toshkent ko'chalarida erkin haydash.</small><em class="soon">Tez orada</em></div>
          </div>
          <h2>Alohida mashq <small>raqam — xaritadagi element</small></h2>
          <div class="els">${els}</div>
          <p class="credit">${CARS.map(c => !c.credit ? "" : c.creditUrl ? `<a href="${c.creditUrl}" target="_blank" rel="noopener">${c.credit}</a>` : `<span>${c.credit}</span>`).join("<br>")}</p>
        </section>
        <aside class="panel menu-side">
          <div class="acct" id="acct" hidden></div>
          <h3>Mashina</h3>
          <div class="cars">${CARS.map(c => `<button class="carbtn${carLocked(c) ? " locked" : ""}" data-car="${c.id}">${carLocked(c) ? '<i class="lock" aria-label="Pullik">🔒</i>' : ""}<b>${c.name.replace("Chevrolet ", "")}</b><small>${c.info ? c.info.split(" · ")[0] : "Chevrolet"}</small></button>`).join("")}</div>
          <div class="row"><span class="lbl">Rangi</span><div class="swatches">${COLORS.map(([v, hex, t]) => `<button class="sw" data-color="${v}" title="${t}" style="--c:${hex}"></button>`).join("")}</div></div>
          <div class="row"><span class="lbl">Davlat raqami</span><span class="plate-in"><select id="optRegion" aria-label="Hudud kodi">${REGION_NAMES.map(([c, n]) => `<option value="${c}" title="${n}">${c}</option>`).join("")}</select><input id="optPlate" maxlength="8" spellcheck="false" autocomplete="off" placeholder="A070BJ" aria-label="Raqam: 6 ta harf va son"></span></div>
          ${(() => { const all = shopInfo().products.find(p => p.items.includes("all")); return all && apiOn && shopInfo().enabled && !(getUser() && ((getUser().owns || []).includes("all") || getUser().admin)) ? `<button class="garagebtn tariff" id="tariffBtn"><svg viewBox="0 0 24 24"><path d="m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1-5.4-2.9-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z"/></svg><span><b>${all.name}</b><small>Barcha mashinalar va 18+ · ${all.days ? all.days + " kun" : "doimiy"}</small></span><i>›</i></button>` : ""; })()}
          <button class="garagebtn" id="garageBtn"><svg viewBox="0 0 24 24"><path d="M3 21V9l9-5 9 5v12"/><path d="M7 21v-7h10v7M7 17h10"/></svg><span><b>Garaj</b><small>Mashinani ko'rib tanlang</small></span><i>›</i></button>
          <button class="ghost" id="statsBtn">${icon('<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>')} Natijalar va xatolar tahlili</button>
          ${apiOn ? `<button class="ghost" id="rankBtn">${icon('<path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0z"/><path d="M17 5h3v2a3 3 0 0 1-3 3M7 5H4v2a3 3 0 0 0 3 3"/>')} Reyting</button>` : ""}
          <button class="ghost" id="showroomBtn">${icon('<path d="M3 12a9 4 0 1 0 18 0 9 4 0 1 0-18 0"/><path d="m17 9 3 3-3 3"/>')} 360° ko'rish va salon</button>
          <h3>Haydash</h3>
          <span class="lbl">Uzatmalar qutisi</span>${seg("optTrans", [["manual", "Mexanik"], ["auto", "Avtomat"]])}
          <span class="lbl">Poligon (trening, mashq)</span>${seg("optSize", [["wide", "Keng"], ["mid", "O'rta"], ["real", "Haqiqiy"]])}
          <h3>Instruktor — Bobur aka</h3>
          ${seg("optInstr", [["angry", "Jahldor"], ["calm", "Yumshoq"], ["rude", moodLocked("rude") ? "18+ 🔒" : "18+"], ["off", "Yo'q"]])}
          <h3>Boshqa</h3>
          <div class="row2">
            <div><span class="lbl">Ovozli ko'rsatma</span>${seg("optVoice", [["on", "Ha"], ["off", "Yo'q"]])}</div>
            <div><span class="lbl">Boshqa mashinalar</span>${seg("optTraffic", [["off", "Yo'q"], ["simple", "Oddiy"], ["real", "Real"]])}</div>
            <div><span class="lbl">Grafika</span>${seg("optQuality", [["high", "Yuqori"], ["mid", "O'rta"], ["low", "Yengil"]])}</div>
            <div><span class="lbl">Kadr tezligi (FPS)</span>${seg("optFps", [["30", "30"], ["60", "60"], ["max", "Maks"]])}</div>
            <div class="full"><span class="lbl">Ob-havo</span>${seg("optWeather", [["clear", "Quyoshli"], ["cloudy", "Bulutli"], ["rain", "Yomg'ir"], ["fog", "Tuman"]])}</div>
            <div class="full"><span class="lbl">Vaqt</span>${seg("optTime", [["day", "Kunduz"], ["evening", "Kechqurun"]])}</div>
          </div>
        </aside>
      </div>`;
    m.hidden = false;
    const bindSeg = (id, value, set) => {
      const el = $("#" + id, m), mark = v => el.querySelectorAll("button").forEach(b => b.classList.toggle("on", b.dataset.v === v));
      mark(value);
      el.querySelectorAll("button").forEach(b => b.onclick = () => { mark(b.dataset.v); set(b.dataset.v); this.h.save && this.h.save(); });
    };
    bindSeg("optTrans", S.transmission, v => S.transmission = v);
    bindSeg("optSize", S.size || "real", v => S.size = v);
    // the 18+ instructor is bought: a tap on it while locked offers it and leaves the choice as it was
    bindSeg("optInstr", S.instructor || "angry", v => {
      if (!moodLocked(v)) { S.instructor = v; return; }
      $("#optInstr", m).querySelectorAll("button").forEach(b => b.classList.toggle("on", b.dataset.v === (S.instructor || "angry")));
      this.showBuy("instructor:rude", "18+ instruktor");
    });
    bindSeg("optVoice", S.voice === false ? "off" : "on", v => S.voice = v === "on");
    bindSeg("optQuality", S.quality, v => S.quality = v);
    bindSeg("optWeather", S.weather || "clear", v => { S.weather = v; this.h.atmosphere && this.h.atmosphere(); });
    bindSeg("optTime", S.time || "day", v => { S.time = v; this.h.atmosphere && this.h.atmosphere(); });
    bindSeg("optFps", S.fps || (matchMedia("(pointer: coarse)").matches ? "60" : "max"), v => S.fps = v);
    bindSeg("optTraffic", S.traffic || "simple", v => S.traffic = v);
    const markCar = () => m.querySelectorAll(".carbtn").forEach(b => b.classList.toggle("on", b.dataset.car === (S.car === "malibu" ? "malibu-premier" : S.car || CARS[0].id)));
    markCar();
    m.querySelectorAll(".carbtn").forEach(b => b.onclick = () => { const car = CARS.find(c => c.id === b.dataset.car); if (car && carLocked(car)) { this.showBuy(carItem(car), car.name); return; } S.car = b.dataset.car; markCar(); this.h.useCar && this.h.useCar(S.car); this.h.save && this.h.save(); });
    const markColor = () => m.querySelectorAll(".sw").forEach(b => b.classList.toggle("on", b.dataset.color === (S.color || "white")));
    markColor();
    m.querySelectorAll(".sw").forEach(b => b.onclick = () => { this.h.setColor && this.h.setColor(b.dataset.color); markColor(); });
    // the region from the list (01..95), the number typed: six letters and digits, spaced on the plate
    const [reg0, num0] = plateParts(S.plate || "01 A 070 BJ"), regEl = $("#optRegion", m), numEl = $("#optPlate", m);
    regEl.value = REGIONS.includes(reg0) ? reg0 : "01"; numEl.value = num0;
    const setPlate = () => {
      const raw = numEl.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6);
      if (numEl.value !== raw) numEl.value = raw;
      if (raw.length && this.h.setPlate) this.h.setPlate(regEl.value + " " + formatNumber(raw));
    };
    regEl.onchange = setPlate; numEl.oninput = setPlate;
    m.querySelectorAll("[data-mode]").forEach(b => b.onclick = () => this.h.start(b.dataset.mode));
    m.querySelectorAll("[data-el]").forEach(b => b.onclick = () => this.h.start("practice", b.dataset.el));
    const r = $("#resume", m); if (r) r.onclick = () => this.h.resume();
    $("#statsBtn", m).onclick = () => this.showStats();
    const rank = $("#rankBtn", m); if (rank) rank.onclick = () => showLeaderboard($("#result", this.root));
    renderAccount($("#acct", m), { res: $("#result", this.root), onChange: u => this.h.account && this.h.account(u) });
    $("#showroomBtn", m).onclick = () => this.h.showroom();
    $("#garageBtn", m).onclick = () => this.h.garage && this.h.garage();
    const tariff = $("#tariffBtn", m); if (tariff) tariff.onclick = () => this.showBuy("all", tariff.querySelector("b").textContent);
    this.menuOpen = true; this.root.classList.add("menu-open");
  }

  // garage bar: previous / next car, name, colours, pick / back
  showGarage(on, act, car, color) {
    let el = $("#garageBar", this.root);
    if (!on) { if (el) el.hidden = true; return; }
    if (!el) { el = document.createElement("div"); el.id = "garageBar"; el.className = "garage-bar"; this.root.appendChild(el); }
    el.hidden = false;
    const COLS = [["original", "conic-gradient(#d33, #f3f4f2, #1b2b63, #3a3d41, #d33)", "Asl rangi"], ["white", "#f3f4f2", "Oq"], ["blue", "#1b2b63", "To'q ko'k"], ["graphite", "#3a3d41", "Grafit"]];
    el.innerHTML = `
      <div class="g-title"><span class="eyebrow">Garaj</span><h2>${car.name}</h2><small>${car.info || ""}</small></div>
      <div class="g-row">
        <button class="g-arrow" data-g="prev" aria-label="Oldingi">‹</button>
        <div class="swatches">${COLS.map(([v, hex, t]) => `<button class="sw${v === color ? " on" : ""}" data-c="${v}" title="${t}" style="--c:${hex}"></button>`).join("")}</div>
        <button class="g-arrow" data-g="next" aria-label="Keyingi">›</button>
      </div>
      <div class="g-row"><button class="btn" data-g="back">Orqaga</button>${carLocked(car) ? '<button class="btn primary" data-g="buy">🔒 Sotib olish</button>' : '<button class="btn primary" data-g="pick">Shu mashinani tanlash</button>'}</div>
      <small class="g-hint">Sudrab aylantiring</small>`;
    el.querySelectorAll("[data-g]").forEach(b => b.onclick = () => act(b.dataset.g));
    el.querySelectorAll("[data-c]").forEach(b => b.onclick = () => act("color", b.dataset.c));
  }

  showShowroom(on, handlers) {
    let el = $("#showroom", this.root);
    if (!el) {
      el = document.createElement("div"); el.id = "showroom"; el.className = "showroom-bar";
      el.innerHTML = `<span class="eyebrow">Chevrolet Cobalt · 360°</span>
        <div class="acts"><button class="btn primary" data-s="orbit">Tashqi</button><button class="btn" data-s="cockpit">Salon</button>
        <button class="btn" data-s="lights">Chiroqlar</button><button class="btn" data-s="exit">Menyu</button></div>
        <small>Sudrab aylantiring · g'ildirakcha yoki ikki barmoq bilan yaqinlashtiring</small>`;
      this.root.appendChild(el);
      el.querySelectorAll("[data-s]").forEach(b => b.onclick = () => { b.blur(); handlers(b.dataset.s); el.querySelectorAll("[data-s]").forEach(x => x.classList.toggle("primary", x === b && b.dataset.s !== "lights" && b.dataset.s !== "exit")); });
    }
    el.hidden = !on;
    this.root.classList.toggle("showroom", on);
  }
  hideMenu() { $("#menu", this.root).hidden = true; this.menuOpen = false; this.root.classList.remove("menu-open"); }

  buildHelp() {
    $("#help", this.root).innerHTML = `
      <div class="panel help">
        <h2>Boshqaruv</h2>
        <dl>
          <dt><kbd>W</kbd>/<kbd>↑</kbd></dt><dd>Gaz (bosib turilsa asta oshadi)</dd>
          <dt><kbd>S</kbd>/<kbd>↓</kbd></dt><dd>Tormoz</dd>
          <dt><kbd>Shift</kbd></dt><dd>Ilashish pedali. Qo'yib yuborilganda asta qaytadi: ushlash nuqtasini sezing</dd>
          <dt><kbd>A</kbd> <kbd>D</kbd> / <kbd>←</kbd> <kbd>→</kbd></dt><dd>Rul (to'liq burilish 1,5 aylanish)</dd>
          <dt><kbd>1</kbd>–<kbd>5</kbd>, <kbd>R</kbd>, <kbd>N</kbd></dt><dd>Uzatmalar (mexanik). Avtomatda: <kbd>F</kbd> = D, <kbd>R</kbd>, <kbd>N</kbd>, <kbd>P</kbd></dd>
          <dt><kbd>I</kbd></dt><dd>Dvigatelni o't oldirish / o'chirish</dd>
          <dt><kbd>Space</kbd></dt><dd>Qo'l tormozi</dd>
          <dt><kbd>Q</kbd> <kbd>E</kbd></dt><dd>Chap / o'ng burilish chirog'i</dd>
          <dt><kbd>H</kbd></dt><dd>Avariya ishorasi</dd>
          <dt><kbd>K</kbd></dt><dd>Xavfsizlik kamari</dd>
          <dt><kbd>Z</kbd> <kbd>X</kbd></dt><dd>Chapga / o'ngga qarash</dd>
          <dt><kbd>C</kbd> <kbd>M</kbd> <kbd>L</kbd></dt><dd>Kamera, xarita, ovoz</dd>
          <dt>Ko'zgular</dt><dd>Kabinada ko'zgu ustida sudrang: burchagi o'zgaradi (ikki marta bosish: asl holatga). Sozlash saqlanadi</dd>
          <dt>Sichqoncha</dt><dd>Kabinada sudrab atrofga qarang (ikki marta bosish: oldinga). "360°" kamerada mashinani aylantiring, g'ildirakcha bilan yaqinlashtiring</dd>
          <dt><kbd>Esc</kbd></dt><dd>Menyu</dd>
        </dl>
        <p><b>Joystik (PS5 / Xbox):</b> chap stik — rul, o'ng stik — atrofga qarash, R2 (RT) — gaz, L2 (LT) — tormoz, L1 (LB) — ilashish, R1 (RB) — qo'l tormozi, ✕ (A) — uzatma yuqori, □ (X) — uzatma past, ○ (B) — dvigatel, △ (Y) — kamar, krestovina ← → — burilish chiroqlari, ↓ — avariya chiroqlari, ↑ — kamera, touchpad / R3 — xarita, Options — pauza, Create — ovoz.</p>
        <p class="muted">Joyidan jo'nash (mexanik): ilashishni bosing, 1-uzatma, qo'l tormozini tushiring, ozgina gaz bering va ilashishni sekin qo'yib yuboring. Qiyalikda qo'l tormozini ilashish ushlagan paytda tushiring.</p>
        <button class="btn primary" data-close>Tushunarli</button>
      </div>`;
    $("#help [data-close]", this.root).onclick = () => { $("#help", this.root).hidden = true; };
  }
  toggleHelp() { const h = $("#help", this.root); h.hidden = !h.hidden; }

  /* ---------- runtime ---------- */
  reset(session, title) {
    $("#modeLabel", this.root).textContent = title;
    $("#log", this.root).innerHTML = "";
    $("#logCount", this.root).textContent = "0";
    $("#result", this.root).hidden = true;
    this.mmBase = null;
    this.session = session;
  }

  // a paid item: the products that open it (its own, the bundle), a promo code, and the payment through inPAY
  showBuy(item, name) {
    let el = $("#buy", this.root);
    if (!el) { el = document.createElement("div"); el.id = "buy"; el.className = "buy-card"; this.root.appendChild(el); }
    const u = getUser(), list = productsFor(item), S = shopInfo();
    const som = n => n.toLocaleString("ru-RU").replace(/,/g, " ") + " so'm";
    const term = d => d ? `${d} kun` : "doimiy";
    const what = item === "all" ? "Barcha pullik mashinalar va 18+ instruktor bitta tarifda." : item.startsWith("car:") ? "Bu mashina pullik. Cobalt, Matiz, Damas va Monza bepul." : "18+ instruktor pullik. Jahldor va yumshoq instruktor bepul.";
    let pick = list[0] ? list[0].id : null;
    el.innerHTML = `<div class="buy-box" role="dialog" aria-label="${name}">
      <span class="eyebrow">Pullik</span><h2>🔒 ${name}</h2><p>${what}</p>
      ${!u ? `<p class="buy-note">Sotib olish uchun avval menyuda hisobingizga kiring (Google yoki Telegram).</p>`
        : !list.length ? `<p class="buy-note">Hozircha sotuvda yo'q.</p>`
        : `<div class="buy-list">${list.map(p => `<label class="buy-opt"><input type="radio" name="bp" value="${p.id}"${p.id === pick ? " checked" : ""}><span><b>${p.name}</b><small>${term(p.days)}</small></span><em data-price="${p.id}">${som(p.price)}</em></label>`).join("")}</div>
           <div class="buy-promo"><input id="buyPromo" placeholder="Promokod" maxlength="32" autocomplete="off"><button class="btn" data-b="promo">Qo'llash</button></div>
           <p class="buy-msg" id="buyMsg"></p>`}
      <div class="acts">${u && list.length ? `<button class="btn primary" data-b="pay"${S.payments ? "" : ""}>To'lash</button>` : ""}<button class="btn" data-b="close">Yopish</button></div></div>`;
    el.hidden = false;
    const close = () => { el.hidden = true; };
    el.querySelector('[data-b="close"]').onclick = close;
    el.onclick = e => { if (e.target === el) close(); };
    if (!u || !list.length) return;
    const msg = (t, bad) => { const m = $("#buyMsg", el); m.textContent = t; m.classList.toggle("bad", !!bad); };
    const promo = () => $("#buyPromo", el).value.trim();
    const payBtn = el.querySelector('[data-b="pay"]');
    const show = async () => {
      if (!promo()) { msg(""); payBtn.textContent = "To'lash"; return; }
      try { const q = await quote(pick, promo()); msg(`Chegirma ${som(q.discount)} · to'lanadi ${som(q.total)}`); payBtn.textContent = q.total ? `To'lash · ${som(q.total)}` : "Bepul olish"; }
      catch (e) { msg(e.message, true); payBtn.textContent = "To'lash"; }
    };
    el.querySelectorAll('input[name="bp"]').forEach(r => r.onchange = () => { pick = r.value; show(); });
    el.querySelector('[data-b="promo"]').onclick = show;
    payBtn.onclick = async () => {
      payBtn.disabled = true; msg("Kuting…");
      try {
        const out = await buy(pick, promo());
        if (out.done) { updateUser(out.user); msg(""); close(); this.toast("Ochildi!", "good"); return; }
        msg("To'lov sahifasiga o'tilmoqda…");
        location.href = out.payUrl;                          // inPAY; it sends the buyer back to /?order=<id>
      } catch (e) { msg(e.message, true); payBtn.disabled = false; }
    };
  }

  toast(msg, kind = "") {
    const box = $("#toasts", this.root);
    const d = el("div", "toast " + kind); d.textContent = msg;
    box.appendChild(d);
    while (box.children.length > 3) box.firstChild.remove();
    setTimeout(() => d.remove(), 3200);
  }

  addLog(e) {
    const li = el("li", "", `<span class="p">+${e.pts}</span><span class="m"></span><span class="t">${fmt(e.t)}</span>`);
    li.querySelector(".m").textContent = `${e.n}. ${e.text}${e.task ? " · " + e.task : ""}`;
    $("#log", this.root).appendChild(li);
    $("#logCount", this.root).textContent = String(this.session.log.length);
  }
  toggleLog() { const p = $("#logPanel", this.root); p.hidden = !p.hidden; }

  // touch buttons light up with the car's state
  touchState(car) {
    const r = this.root, set = (id, on) => { const e = r.querySelector("#" + id); if (e) e.classList.toggle("on", !!on); };
    const blink = Math.floor(performance.now() / 380) % 2 === 0;
    set("tSigL", (car.sig === -1 || car.hazard) && blink); set("tSigR", (car.sig === 1 || car.hazard) && blink);
    set("tHaz", car.hazard); set("tBelt", car.belt); set("tEng", car.engineOn); set("tHand", car.handbrake);
    const wh = r.querySelector("#wheelSvg"); if (wh) wh.style.transform = `rotate(${car.sw.toFixed(1)}deg)`;
    const g = r.querySelector("#tGear"); if (g && g.textContent !== String(car.gear)) g.textContent = car.gear;
    const sp = r.querySelector("#tSpd"), k = String(Math.round(car.kmh)); if (sp && sp.textContent !== k) sp.textContent = k;
  }

  update(s, view, now) {
    const car = s.car, r = this.root;
    const g = s.guidance();
    $("#taskTitle", r).textContent = g.title + (g.stage ? ` · bosqich ${g.stage}` : "");
    $("#taskText", r).textContent = g.text;
    const hint = g.hint || "";
    if ($("#taskHint", r).textContent !== hint) $("#taskHint", r).textContent = hint;

    $("#pts", r).textContent = s.total;
    $("#pts", r).parentElement.className = s.total > PASS_LIMIT ? "bad" : s.total > 0 ? "warn" : "";
    $("#time", r).textContent = fmt(s.t);
    $("#prog", r).textContent = s.W.tasks.length > 1 ? `${Math.min(s.taskIdx + (s.active ? 1 : 0), s.W.tasks.length)}/${s.W.tasks.length}` : (s.active ? "1/1" : "0/1");

    // start light
    const sl = $("#startlight", r);
    if (s.full && s.clock < 9 && !s.started) {
      sl.hidden = false;
      sl.className = "startlight " + (s.startSignal ? "go" : "wait");
      sl.querySelector("b").textContent = s.startSignal ? "START" : `${Math.ceil(3 - s.clock)}`;
    } else sl.hidden = true;

    // cluster
    const kmh = car.kmh;
    $("#kmh", r).textContent = kmh < 10 ? kmh.toFixed(1) : Math.round(kmh);
    const needle = (id, v, max) => { $(`#${id} .needle`, r).setAttribute("transform", `rotate(${-210 + 240 * Math.min(v, max * 1.02) / max})`); };
    needle("speedo", kmh, 80); needle("tach", car.rpm / 1000, 7);
    const gear = car.transmission === "manual" ? String(car.gear) : (car.gear === "D" ? "D" + car.autoGear : car.gear);
    $("#gear", r).textContent = gear;
    $("#gear", r).className = "gear" + (car.gear === "R" ? " rev" : "");
    const blink = Math.floor(now / 380) % 2 === 0;
    const lamp = (id, on, cls = "on") => { $(`#${id}`, r).className = (id === "lL" || id === "lR" ? "ar " : "") + (on ? cls : ""); };
    lamp("lL", (car.sig === -1 || car.hazard) && blink, "on green");
    lamp("lR", (car.sig === 1 || car.hazard) && blink, "on green");
    lamp("lHaz", car.hazard, "on red");
    lamp("lP", car.handbrake, "on red");
    lamp("lBelt", !car.belt, "on red");
    lamp("lEng", !car.engineOn, "on amber");
    $("#pC", r).style.height = car.clutch * 100 + "%";
    $("#pB", r).style.height = car.brake * 100 + "%";
    $("#pG", r).style.height = car.throttle * 100 + "%";
    $("#camLabel", r).textContent = { cockpit: "Kabina", chase: "Orqadan", orbit: "360°", top: "Yuqoridan" }[view.mode];

    this.drawMinimap(s);
  }

  drawMinimap(s) {
    const toFin = f => ({ x: f.pose.x + Math.cos(f.pose.th) * f.s, y: f.pose.y + Math.sin(f.pose.th) * f.s });
    const c = this.mm, g = c.getContext("2d"), W = s.W;
    if (c.hidden) return;
    const K = c.width / 260, size = 260, b = W.board ? (() => { const f = W.board.frame, xs = f.map(q => q[0]), ys = f.map(q => q[1]); return { minX: Math.min(...xs) - 2, maxX: Math.max(...xs) + 2, minY: Math.min(...ys) - 2, maxY: Math.max(...ys) + 2 }; })() : W.bounds;
    const sc = Math.min(size / (b.maxX - b.minX), size / (b.maxY - b.minY));
    const ox = (size - (b.maxX - b.minX) * sc) / 2 - b.minX * sc, oy = (size - (b.maxY - b.minY) * sc) / 2 - b.minY * sc;
    if (!this.mmBase) {
      const base = document.createElement("canvas"); base.width = base.height = c.width;      // drawn at twice the size: sharp on dense screens
      const bg = base.getContext("2d"); bg.scale(K, K);
      bg.fillStyle = "rgba(20,24,20,0.85)"; bg.fillRect(0, 0, size, size);
      bg.strokeStyle = "#5b6066"; bg.lineCap = "round"; bg.lineJoin = "round";
      if (W.board) {                              // the plan: asphalt, kerbed green islands, the exercise lanes outlined, numbered pins
        const path = (poly, close = true) => { bg.beginPath(); poly.forEach((q, i) => i ? bg.lineTo(q[0] * sc + ox, q[1] * sc + oy) : bg.moveTo(q[0] * sc + ox, q[1] * sc + oy)); if (close) bg.closePath(); };
        bg.fillStyle = "#454a50"; path(W.board.frame); bg.fill();
        bg.fillStyle = "#c9c8c2"; for (const isl of W.board.islands) { path(isl.kerb); bg.fill(); }
        bg.fillStyle = "#3b6a3c"; for (const isl of W.board.islands) { path(isl.grass); bg.fill(); }
        bg.fillStyle = "#4e545b"; for (const p of W.board.pads) { path(p); bg.fill(); }
        // the white paint of the plan: lane lines, outlines, zebras, arrows (the kerb foot lines are not drawn)
        bg.strokeStyle = "rgba(255,255,255,0.72)"; bg.lineWidth = 0.55;
        for (const ln of W.lines) { if (ln.hidden || ln.kind === "edge" && ln.pts.length > 40) continue; path(ln.pts, false); bg.stroke(); }
        bg.fillStyle = "rgba(255,255,255,0.8)"; for (const pt of W.paint) { path(pt.poly); bg.fill(); }
        // the numbers: a red disc at the middle of each exercise (the junction once, at its centre), pushed apart where they crowd
        const pins = [[1, W.startLine && W.startLine.pose, 0], [12, W.finishLine && toFin(W.finishLine), 0]], seen = new Set();
        for (const t of W.tasks) { if (seen.has(t.mapNo)) continue; seen.add(t.mapNo); pins.push([t.mapNo, t.id.startsWith("chorraha") ? { x: 0, y: 0 } : t.pose, t.id.startsWith("chorraha") || t.id.startsWith("ilon") || t.id.startsWith("burilish") || t.id.startsWith("boks") ? 0 : 6]); }
        const pts = pins.filter(q => q[1]).map(([n, p, ahead]) => ({ n, x: (p.x + Math.cos(p.th || 0) * ahead) * sc + ox, y: (p.y + Math.sin(p.th || 0) * ahead) * sc + oy }));
        const fx = W.board.frame.map(q => q[0] * sc + ox), fy = W.board.frame.map(q => q[1] * sc + oy);
        for (let it = 0; it < 30; it++) for (const a of pts) {
          for (const c of pts) { if (a === c) continue; const dx = a.x - c.x, dy = a.y - c.y, d = Math.hypot(dx, dy) || 1; if (d < 15) { a.x += dx / d * (15 - d) / 2; a.y += dy / d * (15 - d) / 2; } }
          a.x = Math.max(Math.min(...fx) + 7, Math.min(Math.max(...fx) - 7, a.x)); a.y = Math.max(Math.min(...fy) + 7, Math.min(Math.max(...fy) - 7, a.y));
        }
        bg.font = "bold 8.5px Barlow, sans-serif"; bg.textAlign = "center"; bg.textBaseline = "middle";
        for (const { n, x, y } of pts) {
          bg.fillStyle = "#c0392b"; bg.strokeStyle = "#fff"; bg.lineWidth = 1.1; bg.beginPath(); bg.arc(x, y, 6.2, 0, 7); bg.fill(); bg.stroke();
          bg.fillStyle = "#fff"; bg.fillText(String(n), x, y + 0.5); }
      } else {
        for (const rd of W.roads) {
          bg.lineWidth = Math.max(2, rd.width * sc);
          bg.beginPath(); rd.pts.forEach((p, i) => i ? bg.lineTo(p[0] * sc + ox, p[1] * sc + oy) : bg.moveTo(p[0] * sc + ox, p[1] * sc + oy)); bg.stroke();
        }
        bg.fillStyle = "#5b6066";
        for (const p of W.pads) { bg.beginPath(); p.poly.forEach((q, i) => i ? bg.lineTo(q[0] * sc + ox, q[1] * sc + oy) : bg.moveTo(q[0] * sc + ox, q[1] * sc + oy)); bg.fill(); }
        bg.fillStyle = "#e9ebee"; bg.font = "bold 11px Barlow, sans-serif"; bg.textAlign = "center"; bg.textBaseline = "middle";
        const seen = new Set();
        for (const t of W.tasks) { if (seen.has(t.mapNo + t.id.split("-")[0])) continue; seen.add(t.mapNo + t.id.split("-")[0]); const p = t.id.startsWith("chorraha") ? { x: 0, y: 0 } : t.pose; bg.fillText(String(t.mapNo), p.x * sc + ox + 9, p.y * sc + oy - 9); }
      }
      this.mmBase = base;
    }
    g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, c.width, c.height);
    g.drawImage(this.mmBase, 0, 0); g.setTransform(K, 0, 0, K, 0, 0);
    const nt = s.active ? s.active.task : W.tasks[s.taskIdx];
    if (nt) {
      const p = nt.pose;
      g.strokeStyle = "#f2b632"; g.lineWidth = 2;
      g.beginPath(); g.arc(p.x * sc + ox, p.y * sc + oy, 7, 0, 7); g.stroke();
    }
    const car = s.car, x = car.x * sc + ox, y = car.y * sc + oy;
    g.save(); g.translate(x, y); g.rotate(car.th);
    g.fillStyle = "#ff6a2b"; g.beginPath(); g.moveTo(7, 0); g.lineTo(-5, 4.5); g.lineTo(-5, -4.5); g.closePath(); g.fill();
    g.restore();
  }
  toggleMinimap() { if (this.root.classList.contains("touch")) { this.mm.hidden = false; this.root.classList.toggle("showmap"); } else this.mm.hidden = !this.mm.hidden; }

  /* ---------- protocol sheet and certificate ---------- */
  // info: { date, modeLabel, car, plate }
  showProtocol(s, passed, info) {
    this.showSheet({ eyebrow: "Imtihon bayonnomasi", file: "imtihon-bayonnomasi.png", landscape: false,
      build: name => drawProtocol({ ...info, name, time: s.t, total: s.total, passed, log: s.log }) });
  }
  showCertificate(s, stars, info) {
    this.showSheet({ eyebrow: "Sertifikat", file: "sertifikat.png", landscape: true,
      build: name => drawCertificate({ name, date: info.date, total: s.total, time: s.t, car: info.car, plate: info.plate, stars }) });
  }
  showSheet({ eyebrow, build, file, landscape }) {
    const res = $("#result", this.root), S = this.h.settings;
    res.innerHTML = `
      <div class="panel result proto">
        <span class="eyebrow">${eyebrow}</span>
        <label class="protoname"><span class="lbl">Nomzodning ismi</span><input id="protoName" maxlength="40" autocomplete="off" placeholder="Ism familiya"></label>
        <div class="protoimg" id="protoImg"></div>
        <div class="acts"><button class="btn primary" data-p="save">Rasm sifatida saqlash</button><button class="btn" data-p="print">Chop etish</button><button class="btn" data-p="back">Orqaga</button></div>
      </div>`;
    const img = $("#protoImg", res), name = $("#protoName", res);
    name.value = S.name || "";
    let canvas = null;
    const render = () => { canvas = build(S.name || ""); canvas.className = "protocanvas"; img.replaceChildren(canvas); };
    render();
    name.oninput = () => { S.name = name.value.trim(); this.h.save && this.h.save(); render(); };
    res.querySelector('[data-p="back"]').onclick = () => this.h.protocolBack && this.h.protocolBack();
    res.querySelector('[data-p="save"]').onclick = () => {
      const a = document.createElement("a"); a.download = file; a.href = canvas.toDataURL("image/png"); a.click();
    };
    res.querySelector('[data-p="print"]').onclick = () => {
      const w = window.open("", "_blank");
      if (!w) return;
      w.document.write(`<title>${eyebrow}</title><style>@page{size:A4${landscape ? " landscape" : ""};margin:0}body{margin:0}img{width:100%;display:block}</style><img src="${canvas.toDataURL("image/png")}">`);
      w.document.close(); w.onload = () => w.print();
    };
    res.hidden = false;
  }

  /* ---------- replay bar ---------- */
  // rec: Recorder; ctl: { toggle, seek(t), speed(), exit() }
  showReplay(rec, ctl) {
    const el = $("#replay", this.root), dur = Math.max(0.1, rec.duration);
    this.root.classList.add("replaying");
    const ticks = rec.marks.map((m, i) => `<button class="tick" data-i="${i}" style="left:${(m.t / dur * 100).toFixed(2)}%" title="${m.text}">+${m.pts}</button>`).join("");
    el.hidden = false;
    el.innerHTML = `<div class="rp-note" id="rpNote"></div>
      <div class="rp-row"><button class="btn" id="rpPlay">⏸</button><div class="rp-track"><input type="range" id="rpSeek" min="0" max="${dur.toFixed(2)}" step="0.05" value="0">${ticks}</div><span id="rpTime">0:00</span><button class="btn" id="rpSpeed">1×</button><button class="btn primary" id="rpExit">Yopish</button></div>`;
    const seek = $("#rpSeek", el);
    $("#rpPlay", el).onclick = () => ctl.toggle();
    $("#rpSpeed", el).onclick = e => { e.target.textContent = ctl.speed() + "×"; };
    $("#rpExit", el).onclick = () => ctl.exit();
    seek.oninput = () => ctl.seek(+seek.value);
    el.querySelectorAll(".tick").forEach(b => b.onclick = () => ctl.seek(Math.max(0, rec.marks[+b.dataset.i].t - 2)));
  }
  updateReplay(t, playing, rec) {
    const el = $("#replay", this.root); if (el.hidden) return;
    const seek = $("#rpSeek", el), pb = $("#rpPlay", el);
    if (document.activeElement !== seek) seek.value = t;
    pb.textContent = playing ? "⏸" : "▶";
    $("#rpTime", el).textContent = fmt(t);
    const m = rec.marks.find(m => t >= m.t - 0.2 && t < m.t + 3);
    $("#rpNote", el).textContent = m ? `+${m.pts} · ${m.n}. ${m.text}` : "";
    $("#rpNote", el).classList.toggle("on", !!m);
  }
  hideReplay() { $("#replay", this.root).hidden = true; this.root.classList.remove("replaying"); }

  /* ---------- step-by-step drill ---------- */
  showTutor(st) {
    const el = $("#tutor", this.root), r = this.root;
    this.root.classList.toggle("learn", !!st && !st.hide);
    if (!st || st.hide) { el.hidden = true; this.tutorKey = null; r.querySelectorAll(".hl").forEach(e => e.classList.remove("hl")); return; }
    const key = st.done ? "done" : st.step.id;
    if (key === this.tutorKey) return;          // rebuild only when the step changes
    this.tutorKey = key;
    r.querySelectorAll(".hl").forEach(e => e.classList.remove("hl"));
    el.hidden = false;
    if (st.done) {
      el.innerHTML = `<div class="dots">${"<i class='on'></i>".repeat(st.total)}</div><b class="tt">Tayyor! Mashina yo'lga chiqdi</b><p>Endi start chizig'idan o'ting, 10 m dan keyin chap chiroqni o'chiring va mashqlarni davom ettiring. Imtihonga tayyor bo'lsangiz, menyudan "Imtihon" ni tanlang.</p>`;
      return;
    }
    const s = st.step;
    el.innerHTML = `<div class="dots">${Array.from({ length: st.total }, (_, i) => `<i class="${i < st.n - 1 ? "on" : i === st.n - 1 ? "cur" : ""}"></i>`).join("")}</div>
      <span class="eyebrow">${st.n}/${st.total} · ${s.title}</span><b class="tt">${s.text}</b>
      <p class="why">${s.why}</p><div class="keyrow"><span class="desk">Klavisha: <kbd>${s.key}</kbd></span><span class="mob">Ekrandagi yonib turgan tugmani bosing</span></div>`;
    el.querySelectorAll(".desk").forEach(d => d.innerHTML = `Klavisha: <kbd>${s.key}</kbd>`);
    const t = r.querySelector(s.touch); if (t) t.classList.add("hl");
  }

  /* ---------- result ---------- */
  // per element: done or not, time and the points lost there
  taskReport(s) {
    const pts = {}; for (const e of s.log) pts[e.task] = (pts[e.task] || 0) + e.pts;
    const rows = s.W.tasks.map(t => {
      const d = s.done.find(x => x.task === t), p = pts[t.short] || 0;
      return `<tr><td>${t.short}</td><td class="${d ? (d.ok ? "okc" : "badc") : "mutedc"}">${d ? (d.ok ? "bajarildi" : "o'tkazib yuborildi") : "yetib bormadi"}</td><td class="num">${d ? fmt(d.t) : "–"}</td><td class="num">${p ? "+" + p : "0"}</td></tr>`;
    }).join("");
    return `<h3 class="sub">Mashqlar bo'yicha</h3><div class="tblwrap"><table><thead><tr><th>Mashq</th><th>Holat</th><th>Vaqt</th><th>Ball</th></tr></thead><tbody>${rows}</tbody></table></div>`;
  }
  histBlock(h) {
    const stars = [1, 2, 3].map(i => `<span class="${i <= h.stars ? "on" : ""}">★</span>`).join("");
    const d = h.prev ? h.rec.total - h.prev.total : null;
    const cmp = d === null ? "Birinchi urinish" : d < 0 ? `Oldingisidan ${-d} ball yaxshi` : d > 0 ? `Oldingisidan ${d} ball yomon` : "Oldingisi bilan teng";
    return `<div class="hist"><div class="stars">${stars}</div><div><b>${h.newBest ? "Yangi eng yaxshi natija!" : h.best !== null && h.best !== undefined && isFinite(h.best) ? `Eng yaxshi: ${h.best} ball` : "Hali o'tilmagan"}</b><small>${cmp} · ${h.attempts}-urinish</small></div></div>`;
  }

  showStats() {
    const res = $("#result", this.root), a = analyse();
    const nameOf = k => k === "exam" ? "Imtihon" : k === "training" ? "Trening" : (ELEMENTS.find(e => "practice:" + e.id === k) || { name: k }).name;
    const max = a.mistakes.length ? a.mistakes[0].pts : 1;
    const bars = a.mistakes.slice(0, 8).map(m => `<tr><td>${m.n}. ${m.text}${Object.keys(m.tasks).length ? `<small>${Object.entries(m.tasks).sort((x, y) => y[1] - x[1]).slice(0, 2).map(([t, c]) => `${t} (${c})`).join(", ")}</small>` : ""}</td><td class="num">${m.count}×</td><td class="bar"><i style="width:${Math.round(m.pts / max * 100)}%"></i><b>${m.pts}</b></td></tr>`).join("");
    const keys = a.keys.map(k => `<tr><td>${nameOf(k.key)}</td><td class="num">${k.tries}</td><td class="num">${k.passes}</td><td class="num">${k.best === null ? "-" : k.best}</td><td class="spark">${k.last.map(v => `<i class="${v > a.limit ? "bad" : ""}" style="height:${Math.max(3, Math.min(100, v / a.limit * 100))}%"></i>`).join("")}</td></tr>`).join("");
    res.innerHTML = `
      <div class="panel result">
        <span class="eyebrow">Natijalar va xatolar tahlili</span>
        <h1>${a.total ? `${a.total} urinish, ${a.passes} tasi o'tgan` : "Hali urinish yo'q"}</h1>
        ${a.total ? `<h3>Eng ko'p ball olib qo'ygan xatolar</h3>
        ${bars ? `<div class="tblwrap"><table class="mist"><tbody>${bars}</tbody></table></div>` : `<p class="lead">Birorta ham xato qayd etilmagan.</p>`}
        <h3>Mashqlar bo'yicha</h3>
        <div class="tblwrap"><table><thead><tr><th>Mashq</th><th>Urinish</th><th>O'tgan</th><th>Eng yaxshi</th><th>So'nggi natijalar</th></tr></thead><tbody>${keys}</tbody></table></div>` : `<p class="lead">Imtihon yoki mashq topshiring: har bir urinish shu yerda saqlanadi.</p>`}
        <h3>Yutuqlar</h3>
        <div class="achgrid">${ACHIEVEMENTS.map(a => { const on = loadAchievements()[a.id]; return `<div class="ach${on ? " on" : ""}"><span>${on ? "🏆" : "🔒"}</span><b>${a.name}</b><small>${a.text}</small></div>`; }).join("")}</div>
        <div class="acts"><button class="btn primary" data-s="close">Yopish</button>${a.total ? `<button class="btn" data-s="clear">Tarixni tozalash</button>` : ""}</div>
      </div>`;
    res.hidden = false;
    res.querySelector('[data-s="close"]').onclick = () => { res.hidden = true; };
    const c = res.querySelector('[data-s="clear"]'); if (c) c.onclick = () => { if (confirm("Barcha natijalar o'chirilsinmi?")) { clearHistory(); this.showStats(); } };
  }

  showResult(s, ev, handlers, hist) {
    const res = $("#result", this.root);
    const passed = ev.ok && s.total <= PASS_LIMIT;
    const rows = s.log.map(e => `<tr><td>${e.n}</td><td>${e.text}</td><td>${e.task || ""}</td><td class="num">${fmt(e.t)}</td><td class="num">+${e.pts}</td></tr>`).join("");
    const title = s.mode === "practice" ? (passed ? (s.total ? "Bajarildi, xatolar bilan" : "Toza bajarildi") : "Bajarilmadi")
      : passed ? "Imtihondan o'tdingiz" : "Imtihondan o'tolmadingiz";
    res.innerHTML = `
      <div class="panel result">
        <span class="eyebrow">${s.mode === "practice" ? "Mashq natijasi" : s.mode === "exam" ? "Imtihon protokoli" : "Trening natijasi"}</span>
        <h1 class="${passed ? "ok" : "bad"}">${title}</h1>
        ${hist ? this.histBlock(hist) : ""}
        ${hist && hist.daily ? `<div class="newach"><div><span>✓</span><b>Kunlik vazifa bajarildi!</b><small>${hist.daily}</small></div></div>` : ""}
        ${hist && hist.fresh && hist.fresh.length ? `<div class="newach">${hist.fresh.map(a => `<div><span>🏆</span><b>Yangi yutuq: ${a.name}</b><small>${a.text}</small></div>`).join("")}</div>` : ""}
        <div class="sum"><div><small>Jarima</small><b>${s.total}</b><em>/ ${PASS_LIMIT}</em></div><div><small>Vaqt</small><b>${fmt(s.t)}</b></div><div><small>Bajarilgan mashqlar</small><b>${s.done.filter(d => d.ok).length}/${s.W.tasks.length}</b></div></div>
        ${s.full ? this.taskReport(s) : ""}
        ${rows ? `<div class="tblwrap"><table><thead><tr><th>№</th><th>Xato</th><th>Mashq</th><th>Vaqt</th><th>Ball</th></tr></thead><tbody>${rows}</tbody></table></div>` : `<p class="lead">Birorta ham xato qayd etilmadi.</p>`}
        <div class="acts">${handlers.map(([label, id, primary]) => `<button class="btn${primary ? " primary" : ""}" data-r="${id}">${label}</button>`).join("")}</div>
      </div>`;
    res.hidden = false;
    res.querySelectorAll("[data-r]").forEach(b => b.onclick = () => this.h.resultAction(b.dataset.r));
  }
}
