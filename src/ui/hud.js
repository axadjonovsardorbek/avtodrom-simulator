// DOM overlay: instrument cluster, task card, score, toasts, minimap,
// penalty log, start light, menus and the result protocol.
import { PASS_LIMIT } from "../sim/penalties.js";
import { ELEMENTS } from "../world/tracks.js";
import { CARS } from "../cars/index.js";

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
        <div class="brand"><span class="mark">A</span><div><b>Avtodrom</b><small id="modeLabel">Simulyator</small></div></div>
        <div class="tb-btns">
          <button class="tb" data-a="camera" title="Kamera (C)"><span id="camLabel">Kabina</span></button>
          <button class="tb" data-a="map" title="Xarita (M)">Xarita</button>
          <button class="tb" data-a="log" title="Xatolar">Xatolar <i id="logCount">0</i></button>
          <button class="tb" data-a="mouse" id="mouseBtn" title="Rulni sichqoncha bilan boshqarish">Sichqoncha-rul</button>
          <button class="tb" data-a="mute" id="muteBtn" title="Ovoz (L)">Ovoz</button>
          <button class="tb" data-a="help" title="Boshqaruv">?</button>
          <button class="tb primary" data-a="pause" title="Menyu (Esc)">Menyu</button>
        </div>
      </header>
      <section class="task" id="task"><span class="eyebrow" id="taskTitle"></span><p id="taskText"></p><p class="hint" id="taskHint"></p></section>
      <section class="score"><div><small>Jarima</small><b id="pts">0</b><em>/ ${PASS_LIMIT}</em></div><div><small>Vaqt</small><b id="time">0:00</b></div><div><small>Mashq</small><b id="prog">–</b></div></section>
      <canvas class="minimap" id="minimap" width="260" height="260"></canvas>
      <div class="startlight" id="startlight" hidden><span></span><b>START</b></div>
      <div class="toasts" id="toasts" aria-live="polite"></div>
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
        <div class="grp"><button data-hold="left">◀</button><button data-hold="right">▶</button></div>
        <div class="grid">
          <button data-act="sigL">◁</button><button data-act="engine">Dvig.</button><button data-act="sigR">▷</button>
          <button data-act="gDown">−Uz</button><button data-act="hand">P</button><button data-act="gUp">+Uz</button>
          <button data-act="belt">Kamar</button><button data-act="hazard">△</button><button data-act="camera">Kam.</button>
        </div>
        <div class="grp"><button data-hold="clutch" class="cl">Ilash.</button><button data-hold="brake" class="br">Tormoz</button><button data-hold="gas" class="gs">Gaz</button></div>
      </section>
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
  showMenu(state) {
    const m = $("#menu", this.root);
    const els = ELEMENTS.map((e, i) => `<button class="elbtn" data-el="${e.id}"><i>${e.mapNo}</i><span>${e.name}</span></button>`).join("");
    m.innerHTML = `
      <div class="panel menu">
        <span class="eyebrow">Toshkent imtihon markazi · B toifa</span>
        <h1>Avtodrom simulyatori</h1>
        <p class="lead">Amaliy imtihonni to'liq avtodromda yoki alohida mashqlarda takrorlang. Jarima ballari rasmiy jadval bo'yicha hisoblanadi.</p>
        <div class="opts">
          <label>Mashina
            <select id="optCar">${CARS.map(c => `<option value="${c.id}">${c.name}</option>`).join("")}</select></label>
          <label>Uzatmalar qutisi
            <select id="optTrans"><option value="manual">Mexanik (ilashish bilan)</option><option value="auto">Avtomat</option></select></label>
          <label>Grafika
            <select id="optQuality"><option value="high">Yuqori</option><option value="low">Yengil (telefon)</option></select></label>
          <label>Ovozli ko'rsatmalar
            <select id="optVoice"><option value="on">Yoqilgan</option><option value="off">O'chirilgan</option></select></label>
        </div>
        <button class="showbtn" id="showroomBtn"><b>Mashinani 360° ko'rish</b><small>Tashqi ko'rinish va salon: sichqoncha yoki barmoq bilan aylantiring</small></button>
        <h2>To'liq avtodrom</h2>
        <div class="modes">
          <button class="big primary" data-mode="exam"><b>Imtihon</b><small>13 mashq ketma-ket. ${PASS_LIMIT} balldan oshsa, imtihon to'xtatiladi.</small></button>
          <button class="big" data-mode="training"><b>Trening</b><small>Xuddi shu marshrut, xato qilsangiz ham davom etasiz.</small></button>
        </div>
        <h2>Alohida mashq <small>(raqam: xaritadagi element)</small></h2>
        <div class="els">${els}</div>
        ${state && state.canResume ? `<button class="btn" id="resume">Davom ettirish</button>` : ""}
        <p class="credit">${CARS.map(c => c.credit ? `<a href="${c.creditUrl}" target="_blank" rel="noopener">${c.credit}</a>` : "").join("<br>")}</p>
      </div>`;
    m.hidden = false;
    $("#optCar", m).value = this.h.settings.car || CARS[0].id;
    $("#optCar", m).onchange = e => { this.h.settings.car = e.target.value; this.h.useCar && this.h.useCar(e.target.value); };
    $("#optTrans", m).value = this.h.settings.transmission;
    $("#optQuality", m).value = this.h.settings.quality;
    $("#optTrans", m).onchange = e => this.h.settings.transmission = e.target.value;
    $("#optQuality", m).onchange = e => this.h.settings.quality = e.target.value;
    $("#optVoice", m).value = this.h.settings.voice === false ? "off" : "on";
    $("#optVoice", m).onchange = e => this.h.settings.voice = e.target.value === "on";
    m.querySelectorAll("[data-mode]").forEach(b => b.onclick = () => this.h.start(b.dataset.mode));
    m.querySelectorAll("[data-el]").forEach(b => b.onclick = () => this.h.start("practice", b.dataset.el));
    const r = $("#resume", m); if (r) r.onclick = () => this.h.resume();
    $("#showroomBtn", m).onclick = () => this.h.showroom();
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
  hideMenu() { $("#menu", this.root).hidden = true; }

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
          <dt>Sichqoncha</dt><dd>Kabinada sudrab atrofga qarang (ikki marta bosish: oldinga). "360°" kamerada mashinani aylantiring, g'ildirakcha bilan yaqinlashtiring</dd>
          <dt><kbd>Esc</kbd></dt><dd>Menyu</dd>
        </dl>
        <p>Rul yoki gamepad ulansa: chap stik rul, RT gaz, LT tormoz, LB ilashish, A/B uzatma yuqori/past.</p>
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
    const c = this.mm, g = c.getContext("2d"), W = s.W;
    if (c.hidden) return;
    const size = c.width, b = W.bounds;
    const sc = Math.min(size / (b.maxX - b.minX), size / (b.maxY - b.minY));
    const ox = (size - (b.maxX - b.minX) * sc) / 2 - b.minX * sc, oy = (size - (b.maxY - b.minY) * sc) / 2 - b.minY * sc;
    if (!this.mmBase) {
      const base = document.createElement("canvas"); base.width = base.height = size;
      const bg = base.getContext("2d");
      bg.fillStyle = "rgba(20,24,20,0.85)"; bg.fillRect(0, 0, size, size);
      bg.strokeStyle = "#5b6066"; bg.lineCap = "round"; bg.lineJoin = "round";
      for (const rd of W.roads) {
        bg.lineWidth = Math.max(2, rd.width * sc);
        bg.beginPath(); rd.pts.forEach((p, i) => i ? bg.lineTo(p[0] * sc + ox, p[1] * sc + oy) : bg.moveTo(p[0] * sc + ox, p[1] * sc + oy)); bg.stroke();
      }
      bg.fillStyle = "#5b6066";
      for (const p of W.pads) { bg.beginPath(); p.poly.forEach((q, i) => i ? bg.lineTo(q[0] * sc + ox, q[1] * sc + oy) : bg.moveTo(q[0] * sc + ox, q[1] * sc + oy)); bg.fill(); }
      bg.fillStyle = "#e9ebee"; bg.font = "bold 11px Barlow, sans-serif"; bg.textAlign = "center"; bg.textBaseline = "middle";
      const seen = new Set();
      for (const t of W.tasks) { if (seen.has(t.mapNo + t.id.split("-")[0])) continue; seen.add(t.mapNo + t.id.split("-")[0]); const p = t.id.startsWith("chorraha") ? { x: 0, y: 0 } : t.pose; bg.fillText(String(t.mapNo), p.x * sc + ox + 9, p.y * sc + oy - 9); }
      this.mmBase = base;
    }
    g.clearRect(0, 0, size, size);
    g.drawImage(this.mmBase, 0, 0);
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
  toggleMinimap() { this.mm.hidden = !this.mm.hidden; }

  /* ---------- result ---------- */
  showResult(s, ev, handlers) {
    const res = $("#result", this.root);
    const passed = ev.ok && s.total <= PASS_LIMIT;
    const rows = s.log.map(e => `<tr><td>${e.n}</td><td>${e.text}</td><td>${e.task || ""}</td><td class="num">${fmt(e.t)}</td><td class="num">+${e.pts}</td></tr>`).join("");
    const title = s.mode === "practice" ? (passed ? (s.total ? "Bajarildi, xatolar bilan" : "Toza bajarildi") : "Bajarilmadi")
      : passed ? "Imtihondan o'tdingiz" : "Imtihondan o'tolmadingiz";
    res.innerHTML = `
      <div class="panel result">
        <span class="eyebrow">${s.mode === "practice" ? "Mashq natijasi" : s.mode === "exam" ? "Imtihon protokoli" : "Trening natijasi"}</span>
        <h1 class="${passed ? "ok" : "bad"}">${title}</h1>
        <div class="sum"><div><small>Jarima</small><b>${s.total}</b><em>/ ${PASS_LIMIT}</em></div><div><small>Vaqt</small><b>${fmt(s.t)}</b></div><div><small>Bajarilgan mashqlar</small><b>${s.done.filter(d => d.ok).length}/${s.W.tasks.length}</b></div></div>
        ${rows ? `<div class="tblwrap"><table><thead><tr><th>№</th><th>Xato</th><th>Mashq</th><th>Vaqt</th><th>Ball</th></tr></thead><tbody>${rows}</tbody></table></div>` : `<p class="lead">Birorta ham xato qayd etilmadi.</p>`}
        <div class="acts">${handlers.map(([label, id, primary]) => `<button class="btn${primary ? " primary" : ""}" data-r="${id}">${label}</button>`).join("")}</div>
      </div>`;
    res.hidden = false;
    res.querySelectorAll("[data-r]").forEach(b => b.onclick = () => this.h.resultAction(b.dataset.r));
  }
}
