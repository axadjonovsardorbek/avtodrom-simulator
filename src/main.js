import "./style.css";
import { buildFull, buildPractice, ELEMENTS } from "./world/tracks.js";
import { Session, START_SIGNAL_AT } from "./sim/session.js";
import { toLocal } from "./sim/geom.js";
import { PASS_LIMIT } from "./sim/penalties.js";
import { View } from "./render/view.js";
import { CarAudio } from "./render/audio.js";
import { Controls } from "./ui/input.js";
import { Hud } from "./ui/hud.js";

const coarse = matchMedia("(pointer: coarse)").matches;
const settings = { transmission: "manual", quality: coarse ? "low" : "high", mouseSteer: false, muted: false, voice: true };
try { Object.assign(settings, JSON.parse(localStorage.getItem("avtodrom.settings") || "{}")); } catch (_) {}
const saveSettings = () => { try { localStorage.setItem("avtodrom.settings", JSON.stringify(settings)); } catch (_) {} };

let session = null, mode = null, elementId = null, paused = true, ended = false;
const app = document.getElementById("app");
const hud = new Hud(app, { settings, start, resume, action: onAction, resultAction });
const view = new View(hud.canvas);
const audio = new CarAudio();
const controls = new Controls(hud.canvas, onAction);
controls.bindTouch(document.getElementById("touchpad"));
controls.mouseSteer = settings.mouseSteer;
document.getElementById("mouseBtn").classList.toggle("on", settings.mouseSteer);
document.getElementById("muteBtn").classList.toggle("on", settings.muted);
if (coarse) app.classList.add("touch");

const TITLES = { exam: "To'liq avtodrom · Imtihon", training: "To'liq avtodrom · Trening" };

function start(m, el) {
  audio.start(); audio.setMuted(settings.muted); audio.voiceOn = settings.voice;
  saveSettings();
  mode = m; elementId = el || null; ended = false;
  const W = m === "practice" ? buildPractice(el) : buildFull();
  session = new Session(W, { mode: m, transmission: settings.transmission });
  view.setWorld(W, settings.quality);
  view.setMode(settings.camera || "cockpit");
  hud.reset(session, m === "practice" ? ELEMENTS.find(e => e.id === el).name : TITLES[m]);
  session.on(handleEvent);
  hud.hideMenu();
  paused = false;
  bump.reset(); countdown = -1;
  if (m === "practice") audio.say(`Mashq: ${ELEMENTS.find(e => e.id === el).name}`);
  else audio.say("Start ishorasini kuting");
}

function resume() { if (session && !ended) { hud.hideMenu(); paused = false; } }

function handleEvent(ev) {
  switch (ev.type) {
    case "penalty": hud.toast(`+${ev.pts} · ${ev.text}`, "bad"); hud.addLog(ev); audio.penalty(); audio.say(`Xato. ${ev.pts} ball`); break;
    case "limit": hud.toast(`Jarima ${PASS_LIMIT} balldan oshdi${session.strict ? ": imtihon to'xtatildi" : ""}`, "bad"); break;
    case "task": hud.toast(`Mashq: ${ev.task.name}`); if (mode !== "practice") audio.say(ev.task.name); break;
    case "taskDone": if (ev.ok) { hud.toast(`${ev.task.short}: bajarildi`, "good"); audio.chime(); } break;
    case "stage": hud.toast("Bosqich bajarildi", "good"); audio.chime(); break;
    case "alarm": hud.toast("TO'XTANG!", "bad"); audio.say("To'xtang!", true); break;
    case "car":
      if (ev.kind === "stall") { hud.toast("Dvigatel o'chib qoldi", "bad"); audio.stall(); }
      else if (ev.kind === "engineStart") audio.starter();
      else if (ev.kind === "engineStop") audio.engineOff();
      else if (ev.kind === "shift") audio.shift();
      else if (ev.kind === "grind") { audio.grind(); hud.toast(ev.text); }
      else if (ev.text) hud.toast(ev.text);
      break;
    case "end":
      ended = true;
      audio.say(mode === "practice" ? (ev.passed ? "Mashq bajarildi" : "Mashq bajarilmadi") : (ev.passed ? "Imtihondan o'tdingiz" : "Imtihondan o'tolmadingiz"), true);
      setTimeout(() => {
        paused = true;
        const s = session, passed = ev.passed;
        const acts = mode === "practice"
          ? [["Qaytadan", "retry", !passed], ...(nextElement() ? [["Keyingi mashq", "next", passed]] : []), ["Menyu", "menu"]]
          : [["Qayta topshirish", "retry", true], ["Menyu", "menu"]];
        hud.showResult(s, ev, acts);
      }, 1200);
      break;
  }
}

function nextElement() {
  const i = ELEMENTS.findIndex(e => e.id === elementId);
  return i >= 0 && i < ELEMENTS.length - 1 ? ELEMENTS[i + 1].id : null;
}

function resultAction(id) {
  if (id === "retry") start(mode, elementId);
  else if (id === "next") start("practice", nextElement());
  else { document.getElementById("result").hidden = true; hud.showMenu({ canResume: false }); }
}

const MANUAL = ["R", "N", 1, 2, 3, 4, 5], AUTO = ["P", "R", "N", "D"];
function onAction(a) {
  if (a === "help") return hud.toggleHelp();
  if (a === "padConnected") return hud.toast("Rul / gamepad ulandi");
  if (a === "mute") { settings.muted = !settings.muted; audio.setMuted(settings.muted); document.getElementById("muteBtn").classList.toggle("on", settings.muted); saveSettings(); return; }
  if (a === "mouse") { settings.mouseSteer = controls.mouseSteer = !controls.mouseSteer; document.getElementById("mouseBtn").classList.toggle("on", settings.mouseSteer); hud.toast(settings.mouseSteer ? "Rul sichqoncha bilan: kursorni chapga-o'ngga suring" : "Rul klaviatura bilan"); saveSettings(); return; }
  if (a === "camera") { const order = ["cockpit", "chase", "top"]; settings.camera = order[(order.indexOf(view.mode) + 1) % 3]; view.setMode(settings.camera); saveSettings(); return; }
  if (a === "map") return hud.toggleMinimap();
  if (a === "log") return hud.toggleLog();
  if (a === "pause") {
    if (!session) return;
    if (!document.getElementById("menu").hidden) return resume();
    paused = true; hud.showMenu({ canResume: !ended }); return;
  }
  if (!session || paused || ended) return;
  const car = session.car;
  switch (a) {
    case "sigL": car.sig = car.sig === -1 ? 0 : -1; break;
    case "sigR": car.sig = car.sig === 1 ? 0 : 1; break;
    case "hazard": car.hazard = !car.hazard; audio.click(true); break;
    case "belt": car.belt = !car.belt; audio.belt(car.belt); hud.toast(car.belt ? "Kamar taqildi" : "Kamar yechildi"); break;
    case "hand": car.handbrake = !car.handbrake; audio.handbrake(car.handbrake); break;
    case "engine": car.engineOn ? car.stopEngine() : car.startEngine(); break;
    case "g1": case "g2": case "g3": case "g4": case "g5":
      if (car.transmission === "manual") car.shift(+a[1]); else if (a === "g1") car.shift("D");
      break;
    case "gR": car.shift("R"); break;
    case "gN": car.shift("N"); break;
    case "gD": if (car.transmission === "auto") car.shift("D"); break;
    case "gP": if (car.transmission === "auto") car.shift("P"); break;
    case "gUp": case "gDown": {
      const seq = car.transmission === "manual" ? MANUAL : AUTO;
      const i = seq.indexOf(car.gear) + (a === "gUp" ? 1 : -1);
      if (i >= 0 && i < seq.length) car.shift(seq[i]);
      break;
    }
  }
}

// a preview of the autodrome behind the menu
session = new Session(buildFull(), { mode: "training", transmission: settings.transmission });
view.setWorld(session.W, settings.quality);
view.setMode("chase");
hud.reset(session, "Simulyator");
hud.showMenu({ canResume: false });

function resize() { view.resize(app.clientWidth, app.clientHeight); }
new ResizeObserver(resize).observe(app);
resize();

// bumps: rails under the wheels, pitch changes on the ramp
const bump = {
  prev: null, pitch: 0,
  reset() { this.prev = null; },
  check(s) {
    const c = s.car, W = s.W;
    if (Math.abs(c.pitch - this.pitch) > 0.012 && Math.abs(c.v) > 0.5) audio.thump(Math.min(1, Math.abs(c.pitch - this.pitch) * 30));
    this.pitch = c.pitch;
    const axles = [[c.x, c.y], [c.x + Math.cos(c.th) * 2.62, c.y + Math.sin(c.th) * 2.62]];
    const now = W.rails.flatMap(r => axles.flatMap(([x, y]) => { const s0 = toLocal(r.pose, x, y)[0]; return [Math.sign(s0 - r.s), Math.sign(s0 - r.s - 1.52)]; }));
    if (this.prev && now.some((v, i) => v !== this.prev[i])) audio.thump(0.7);
    this.prev = now;
  }
};
let countdown = -1;

// deep links: #imtihon, #trening, #mashq-<element id>
{
  const h = location.hash.slice(1);
  if (h === "imtihon") start("exam");
  else if (h === "trening") start("training");
  else if (h.startsWith("mashq-") && ELEMENTS.some(e => e.id === h.slice(6))) start("practice", h.slice(6));
}


let last = performance.now(), acc = 0, lastHud = 0;
const H = 1 / 240;
function frame(now) {
  const dt = Math.min(0.1, (now - last) / 1000); last = now;
  if (session) {
    if (!paused && session.state === "running") {
      controls.apply(session.car, dt);
      acc += dt;
      let n = 0;
      while (acc >= H && n < 60) { session.step(H); acc -= H; n++; }
    } else acc = 0;
    view.look = controls.look;
    app.classList.toggle("cockpit", view.mode === "cockpit");
    view.update(session, dt, now);
    view.render();
    if (now - lastHud > 60) { hud.update(session, view, now); lastHud = now; }
    audio.update(session.car, { alarm: session.W.alarm && !paused }, now);
    if (!paused && session.state === "running") {
      bump.check(session);
      if (session.full && !session.started) {
        const n = session.clock < START_SIGNAL_AT ? Math.ceil(START_SIGNAL_AT - session.clock) : 0;
        if (n !== countdown) { countdown = n; audio.countdown(n === 0); if (n === 0) audio.say("Start", true); }
      }
    }
  }
  requestAnimationFrame(frame);
if (import.meta.env.DEV) window.__sim = { view, audio, get session() { return session; } };
}
requestAnimationFrame(frame);
