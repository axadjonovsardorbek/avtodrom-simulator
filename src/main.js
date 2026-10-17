import "./style.css";
import { buildFull, buildPractice, ELEMENTS } from "./world/tracks.js";
import { Session, START_SIGNAL_AT } from "./sim/session.js";
import { toLocal } from "./sim/geom.js";
import { PASS_LIMIT } from "./sim/penalties.js";
import { View } from "./render/view.js";
import { CarAudio } from "./render/audio.js";
import { Controls } from "./ui/input.js";
import { Hud } from "./ui/hud.js";
import { carById } from "./cars/index.js";
import { loadCarModel } from "./render/carLoader.js";
import { dressCobalt, addPaint } from "./render/carDress.js";
import { addPlates, DEFAULT_PLATE } from "./render/plates.js";
import PHRASES from "./audio/phrases.json";
import { Instructor, lineIds } from "./instructor/instructor.js";
import { buildInstructor } from "./render/instructorFigure.js";
import { KidShow } from "./render/singerKid.js";
import { buildDriver } from "./render/driverFigure.js";

const coarse = matchMedia("(pointer: coarse)").matches;
const settings = { transmission: "manual", quality: coarse ? "low" : "high", mouseSteer: false, muted: false, voice: true, car: "cobalt", instructor: "angry", color: "white", plate: DEFAULT_PLATE };
try { Object.assign(settings, JSON.parse(localStorage.getItem("avtodrom.settings") || "{}")); } catch (_) {}
// the old "Ovoz" button muted on first press; start everyone unmuted once
if (!settings.v2) { settings.muted = false; settings.v2 = true; }
const saveSettings = () => { try { localStorage.setItem("avtodrom.settings", JSON.stringify(settings)); } catch (_) {} };

let session = null, mode = null, elementId = null, paused = true, ended = false;
const app = document.getElementById("app");
const hud = new Hud(app, { settings, start, resume, action: onAction, resultAction, useCar, showroom: openShowroom,
  setPlate: t => { settings.plate = t; if (view.carView.setPlate) view.carView.setPlate(t); saveSettings(); },
  setColor: id => { settings.color = id; if (view.carView.setPaint) view.carView.setPaint(id); saveSettings(); } });
const view = new View(hud.canvas);
const audio = new CarAudio();
const instructor = new Instructor(audio);
instructor.mood = settings.instructor;
const instructorFig = buildInstructor();
view.setInstructor(instructorFig.root);
view.setInstructorVisible(instructor.on);
const kidShow = new KidShow(view.scene, audio);
view.setDriver(buildDriver());
const controls = new Controls(hud.canvas, onAction);
controls.bindTouch(document.getElementById("touchpad"));
controls.mouseSteer = settings.mouseSteer;
document.getElementById("mouseBtn").classList.toggle("on", settings.mouseSteer);
const muteBtn = document.getElementById("muteBtn");
const showMute = () => { muteBtn.textContent = settings.muted ? "Ovoz o'chiq" : "Ovoz yoniq"; muteBtn.classList.toggle("off", settings.muted); };
showMute();
// browsers only allow sound after a user gesture: (re)start audio on any interaction
for (const ev of ["pointerdown", "keydown", "touchstart"]) addEventListener(ev, () => { audio.start(); audio.setMuted(settings.muted); audio.resume(); }, { capture: true });
if (coarse) app.classList.add("touch");

const TITLES = { exam: "To'liq avtodrom · Imtihon", training: "To'liq avtodrom · Trening" };

function start(m, el) {
  if (inShowroom) { inShowroom = false; hud.showShowroom(false); }
  audio.start(); audio.setMuted(settings.muted); audio.voiceOn = settings.voice;
  saveSettings();
  mode = m; elementId = el || null; ended = false;
  const W = m === "practice" ? buildPractice(el, carDims()) : buildFull(carDims());
  session = new Session(W, { mode: m, transmission: settings.transmission, spec: carById(settings.car).spec });
  view.setWorld(W, settings.quality);
  view.setMode(settings.camera || "cockpit");
  hud.reset(session, m === "practice" ? ELEMENTS.find(e => e.id === el).name : TITLES[m]);
  session.on(handleEvent);
  hud.hideMenu();
  paused = false;
  bump.reset(); countdown = -1;
  audio.chime();
  audio.preload(Object.keys(PHRASES.phrases).concat(["clips/fayzulla", "clips/balandku"]));
  balandFor = null;
  instructor.mood = settings.instructor; instructor.reset();
  kidShow.reset(session, m === "training");
  view.setInstructorVisible(instructor.on);
  if (instructor.on) audio.preload(lineIds(instructor.mood));
  if (m === "practice") audio.prompt("task_" + el, ELEMENTS.find(e => e.id === el).name);
  else audio.prompt("wait_start", "Start ishorasini kuting");
}

// 360-degree showroom: the car parked, camera driven by mouse/touch
let inShowroom = false;
function openShowroom() {
  audio.start(); audio.setMuted(settings.muted);
  const W = buildPractice("tezlashish", carDims());
  session = new Session(W, { mode: "practice", transmission: settings.transmission, spec: carById(settings.car).spec });
  view.setWorld(W, settings.quality);
  view.orbit = { az: 2.5, el: 0.2, dist: 7.5 }; view.drag = { yaw: 0, pitch: 0 };
  view.setMode("orbit");
  hud.reset(session, "Chevrolet Cobalt");
  hud.hideMenu();
  inShowroom = true; paused = true; ended = false;
  kidShow.reset(null);
  hud.showShowroom(true, showroomAction);
}
function showroomAction(a) {
  const car = session.car;
  if (a === "orbit") view.setMode("orbit");
  else if (a === "cockpit") { view.drag = { yaw: 0, pitch: 0 }; view.setMode("cockpit"); }
  else if (a === "lights") { const on = !car.engineOn; car.engineOn = on; car.rpm = on ? 850 : 0; car.hazard = on; car.brake = on ? 1 : 0; }
  else if (a === "exit") { inShowroom = false; hud.showShowroom(false); hud.showMenu({ canResume: false }); }
}

function resume() { if (session && !ended) { hud.hideMenu(); paused = false; } }

// the user's own recordings for particular moments (public/audio/uz/clips/*.mp3)
const CLIP_FOR = { stopFar: "clips/fayzulla" };      // stopped more than 1 m short of the stop line
let balandFor = null, fayzullaFor = null;   // tasks the "balandku" / "fayzulla" clips were played for
function clipsBeforeElements() {
  const task = session.currentTask;
  if (!task || task.id !== "estakada" || balandFor === task) return;
  const [s] = toLocal(task.pose, session.car.x, session.car.y);
  // just before the ramp starts (10 m into the element), while driving towards it
  if (s > 1 && s < 8 && session.car.v > 0.3) { balandFor = task; audio.prompt("clips/balandku", null, true); }
}

function handleEvent(ev) {
  instructor.onEvent(ev);
  switch (ev.type) {
    case "penalty": hud.toast(`+${ev.pts} · ${ev.text}`, "bad"); hud.addLog(ev); audio.penalty();
      if (ev.code === "stopFar" && fayzullaFor === session.currentTask) { /* already played when the car stopped */ }
      else if (CLIP_FOR[ev.code]) audio.prompt(CLIP_FOR[ev.code], null, true);
      else if (!instructor.on) audio.prompt("pen_" + ev.code, `Xato. ${ev.pts} ball`);
      break;
    case "stopFarNow": fayzullaFor = session.currentTask; hud.toast("To'xtash chizig'idan 1 m dan uzoqda to'xtadingiz", "bad"); audio.prompt("clips/fayzulla", null, true); break;
    case "limit": hud.toast(`Jarima ${PASS_LIMIT} balldan oshdi${session.strict ? ": imtihon to'xtatildi" : ""}`, "bad"); audio.prompt("limit"); break;
    case "task": hud.toast(`Mashq: ${ev.task.name}`); if (mode !== "practice") audio.prompt("task_" + ev.task.id, ev.task.name); break;
    case "taskDone": if (ev.ok) { hud.toast(`${ev.task.short}: bajarildi`, "good"); audio.chime(); audio.prompt("done"); } break;
    case "stage": hud.toast("Bosqich bajarildi", "good"); audio.chime(); audio.prompt("stage"); break;
    case "alarm": hud.toast("TO'XTANG!", "bad"); audio.prompt("stop", "To'xtang!", true); break;
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
      audio.prompt(mode === "practice" ? (ev.passed ? "practice_pass" : "practice_fail") : (ev.passed ? "exam_pass" : "exam_fail"), null, true);
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
  if (a === "mute") { settings.muted = !settings.muted; audio.setMuted(settings.muted); showMute(); saveSettings(); if (!settings.muted) audio.chime(); return; }
  if (a === "mouse") { settings.mouseSteer = controls.mouseSteer = !controls.mouseSteer; document.getElementById("mouseBtn").classList.toggle("on", settings.mouseSteer); hud.toast(settings.mouseSteer ? "Rul sichqoncha bilan: kursorni chapga-o'ngga suring" : "Rul klaviatura bilan"); saveSettings(); return; }
  if (a === "camera") { const order = ["cockpit", "chase", "orbit", "top"]; settings.camera = order[(order.indexOf(view.mode) + 1) % 4]; view.setMode(settings.camera); saveSettings(); return; }
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

function carDims() { const d = carById(settings.car).dims; return { length: d.length, rOh: d.rOh }; }
// car model: generated Cobalt right away, then the .glb file once it has loaded
let carModelId = null;
function useCar(id) {
  const car = carById(id);
  if (carModelId === car.id) return;
  carModelId = car.id;
  const slow = setTimeout(() => hud.toast(`${car.name} yuklanmoqda…`), 600);
  loadCarModel(car.model).then(cv => {
    clearTimeout(slow);
    if (carModelId !== car.id) return;                  // another car was picked meanwhile
    if (car.id === "cobalt") dressCobalt(cv); else addPaint(cv);
    // the Cobalt file has no plates of its own: put them on the plate holders
    addPlates(cv, settings.plate, car.id === "cobalt" ? [{ pos: [3.582, 0.45, 0], back: false }, { pos: [-0.882, 0.545, 0], back: true }] : undefined);
    if (cv.setPaint) cv.setPaint(settings.color);
    view.setCarModel(cv, car);
  }).catch(e => { clearTimeout(slow); hud.toast(`${car.name} yuklanmadi`, "bad"); console.warn("car model not loaded, using the built-in one:", e.message); });
}
useCar(settings.car);

// a preview of the autodrome behind the menu
session = new Session(buildFull(carDims()), { mode: "training", transmission: settings.transmission, spec: carById(settings.car).spec });
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

// drag to look around (cockpit) or orbit the car (360); wheel / pinch to zoom
{
  const cv = hud.canvas, pts = new Map();
  let pinch = 0;
  cv.addEventListener("pointerdown", e => {
    if (controls.mouseSteer && view.mode === "cockpit" && !inShowroom) return;
    pts.set(e.pointerId, [e.clientX, e.clientY]);
    try { cv.setPointerCapture(e.pointerId); } catch (_) {}
  });
  cv.addEventListener("pointermove", e => {
    const p = pts.get(e.pointerId); if (!p) return;
    const dx = e.clientX - p[0], dy = e.clientY - p[1];
    pts.set(e.pointerId, [e.clientX, e.clientY]);
    if (pts.size === 2) {
      const [a, b] = [...pts.values()], d = Math.hypot(a[0] - b[0], a[1] - b[1]);
      if (pinch) view.orbit.dist = Math.min(18, Math.max(3, view.orbit.dist * pinch / d));
      pinch = d; return;
    }
    if (view.mode === "orbit") {
      view.orbit.az -= dx * 0.008;
      view.orbit.el = Math.min(1.35, Math.max(-0.05, view.orbit.el + dy * 0.006));
    } else if (view.mode === "cockpit") {
      view.drag.yaw = Math.min(Math.PI, Math.max(-Math.PI, view.drag.yaw + dx * 0.005));
      view.drag.pitch = Math.min(0.6, Math.max(-0.7, view.drag.pitch - dy * 0.004));
    }
  });
  const up = e => { pts.delete(e.pointerId); if (pts.size < 2) pinch = 0; };
  cv.addEventListener("pointerup", up); cv.addEventListener("pointercancel", up);
  cv.addEventListener("wheel", e => {
    if (view.mode !== "orbit") return;
    e.preventDefault();
    view.orbit.dist = Math.min(18, Math.max(3, view.orbit.dist * (e.deltaY > 0 ? 1.1 : 0.9)));
  }, { passive: false });
  cv.addEventListener("dblclick", () => { view.drag = { yaw: 0, pitch: 0 }; });
  view.isDragging = () => pts.size > 0;
}

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
    // while driving, the head turns back to the road when you let go
    if (!inShowroom && !view.isDragging() && view.mode === "cockpit") {
      const k = Math.min(1, dt * 2.5);
      view.drag.yaw -= view.drag.yaw * k; view.drag.pitch -= view.drag.pitch * k;
    }
    if (!paused && session.state === "running") instructor.update(session, dt, START_SIGNAL_AT);
    else if (ended) instructor.t += dt;
    instructorFig.update(dt, instructor.pose());
    if (!paused) kidShow.update(dt); else kidShow.stopSong(0.2);
    if (!paused && session.state === "running") clipsBeforeElements();
    view.update(session, dt, now);
    view.render();
    if (now - lastHud > 60) { hud.update(session, view, now); lastHud = now; }
    audio.update(session.car, { alarm: session.W.alarm && !paused }, now);
    if (!paused && session.state === "running") {
      bump.check(session);
      if (session.full && !session.started) {
        const n = session.clock < START_SIGNAL_AT ? Math.ceil(START_SIGNAL_AT - session.clock) : 0;
        if (n !== countdown) { countdown = n; audio.countdown(n === 0); if (n === 0) audio.prompt("start", "Start", true); }
      }
    }
  }
  requestAnimationFrame(frame);
if (import.meta.env.DEV) {
  window.__sim = { view, audio, fig: instructorFig, instructor, kidShow, get session() { return session; } };
  import("three").then(T => { window.__sim.THREE = T; });
  // used by tools/export-car.mjs: generated Cobalt -> binary glTF (base64)
  window.__exportCar = async () => {
    const [{ GLTFExporter }, { buildCar }] = await Promise.all([import("three/examples/jsm/exporters/GLTFExporter.js"), import("./render/carModel.js")]);
    const root = buildCar().root;
    root.getObjectByName("interior").visible = true; root.getObjectByName("body").visible = true;
    const ab = await new GLTFExporter().parseAsync(root, { binary: true, onlyVisible: false });
    const bytes = new Uint8Array(ab); let bin = "";
    for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    return btoa(bin);
  };
}
}
requestAnimationFrame(frame);
