import "./style.css";
import { boot } from "./ui/boot.js";
import { buildFull, buildPractice, ELEMENTS } from "./world/tracks.js";
import { Session, START_SIGNAL_AT } from "./sim/session.js";
import { toLocal } from "./sim/geom.js";
import { PASS_LIMIT } from "./sim/penalties.js";
import { View } from "./render/view.js";
import { CarAudio } from "./render/audio.js";
import { Controls } from "./ui/input.js";
import { Hud } from "./ui/hud.js";
import { carById } from "./cars/index.js";
import { loadCarModel, loadTrafficModel, setTextureRenderer } from "./render/carLoader.js";
import { dressCobalt, addPaint } from "./render/carDress.js";
import { addScreenAd, setAdSource, watchAds, takeAdViews } from "./render/screenAd.js";
import { gripFor } from "./render/atmosphere.js";
import { carLocked, moodLocked, carItem, loadShop, orderStatus } from "./net/shop.js";
import { loader } from "./ui/brand.js";
import { apiOn, onUser, updateUser, config, refreshMe, telegramMiniAppLogin, sendAttempt, flushAttempts, myAttempts, countRun, countDrive, trackAdsFrom } from "./net/api.js";
trackAdsFrom(takeAdViews);
import { addPlates, DEFAULT_PLATE } from "./render/plates.js";
import PHRASES from "./audio/phrases.json";
import { Instructor, lineIds } from "./instructor/instructor.js";
import { buildInstructor } from "./render/instructorFigure.js";
import { KidShow } from "./render/singerKid.js";
import { Garage, warmUp } from "./render/garage.js";
import { CARS, setDisabledCars } from "./cars/index.js";
import { recordAttempt, keyFor, mergeHistory } from "./sim/history.js";
import { Tutorial } from "./ui/tutorial.js";
import { Recorder } from "./sim/replay.js";
import { setTrafficFleet } from "./world/traffic.js";
import { unlock } from "./sim/achievements.js";
import { loadHistory } from "./sim/history.js";
import { dailyTask } from "./sim/daily.js";
import { buildDriver } from "./render/driverFigure.js";
import { loadPeople, realInstructor, realDriver, realKid, realPedestrian, realWalker, realDriverWalker } from "./render/people.js";

const coarse = matchMedia("(pointer: coarse)").matches;
const settings = { transmission: "manual", quality: coarse ? "mid" : "high", traffic: "real", mouseSteer: false, muted: false, voice: true, car: "cobalt", instructor: "angry", color: "original", plate: DEFAULT_PLATE, size: "real" };
let qualityChosen = false;          // the player (or an earlier visit) has a quality setting; else it is picked for the device below
try { const saved = JSON.parse(localStorage.getItem("avtodrom.settings") || "{}"); qualityChosen = !!saved.quality; Object.assign(settings, saved); if (!saved.color2) { settings.color = "original"; settings.color2 = true; } } catch (_) {}
if (!settings.v2) { settings.v2 = true; if (settings.traffic === "simple") settings.traffic = "real"; }     // phones were given the box cars before
// the old "Ovoz" button muted on first press; start everyone unmuted once
// phones used to start on "light"; the new balanced tier keeps shadows and the colour grade at a moderate cost
if (!settings.q2) { if (coarse && settings.quality === "low") settings.quality = "mid"; settings.q2 = true; }
if (!settings.v2) { settings.muted = false; settings.v2 = true; }
if (settings.car === "malibu") settings.car = "malibu-premier";       // the Malibu XL was removed
const saveSettings = () => { try { localStorage.setItem("avtodrom.settings", JSON.stringify(settings)); } catch (_) {} };

let session = null, mode = null, elementId = null, paused = true, ended = false;
const app = document.getElementById("app");
// the server's settings (when the build has one): the admin's advertising list, before any car's screen asks for it
setAdSource(apiOn ? config().then(c => (c && c.ads) || null) : null);
const hud = new Hud(app, { settings, account: u => onAccount(u), atmosphere: () => applyAtmosphere(), protocolBack: () => lastResult && hud.showResult(...lastResult), start, resume, action: onAction, resultAction, useCar: selectCar, showroom: openShowroom, save: () => saveSettings(), garage: () => openGarage(),
  setPlate: t => { settings.plate = t; if (view.carView.setPlate) view.carView.setPlate(t); saveSettings(); },
  setColor: id => { settings.color = id; if (view.carView.setPaint) view.carView.setPaint(id); saveSettings(); } });
const view = new View(hud.canvas);
setTextureRenderer(view.renderer);
if (!qualityChosen) { settings.quality = pickQuality(view.renderer); saveSettings(); }
// weather and time of day (settings): the picture, and how well the tyres hold
function applyAtmosphere() {
  view.setAtmosphere(settings.weather || "clear", settings.time || "day");
  if (session) session.car.grip = gripFor(settings.weather);
}
applyAtmosphere();
const audio = new CarAudio();
// the sound system made while the loading screen shows: creating it opens the audio device, which holds the page
// for up to a second (measured in Chrome on a Mac); made on the first click instead, that click froze the game.
// Made before any click it stays paused, and the first click only resumes it.
setTimeout(() => { try { audio.start(); audio.setMuted(settings.muted); } catch (e) { console.warn("audio", e); } }, 0);
const instructor = new Instructor(audio);
instructor.mood = settings.instructor;
let instructorFig = buildInstructor();
view.setInstructor(instructorFig.root);
view.setInstructorVisible(instructor.on);
const kidShow = new KidShow(view.scene, audio);
view.setDriver(buildDriver());
// the realistic people replace the hand-built stand-ins once their files have loaded
loadPeople().then(P => {
  const old = instructorFig.root;
  instructorFig = realInstructor(P.instructor);
  if (old.parent) old.parent.remove(old);
  view.setInstructor(instructorFig.root); view.setInstructorVisible(instructor.on);
  const oldD = view.driver && view.driver.root; if (oldD && oldD.parent) oldD.parent.remove(oldD);
  view.setDriver(realDriver(P.driver));
  kidShow.setKid(realKid(P.kid));
  // the people round the ground: grown-ups (the instructor's and the learner's figures, in other clothes) and the young one
  view.setPedestrianMaker((i, p) => p && p.ambient && i % 3 === 1 ? realWalker(P.instructor, P.kid) : p && p.ambient && i % 3 === 2 ? realDriverWalker(P.driver, P.kid) : realPedestrian(P.kid, i));
  view.setWalker(realWalker(P.instructor, P.kid));
  view.setDriverWalker(realDriverWalker(P.driver, P.kid));
  if (import.meta.env.DEV) window.__sim.fig = instructorFig;
}).catch(e => console.warn("people not loaded, keeping the simple figures:", e.message));
const controls = new Controls(hud.canvas, onAction);
controls.bindTouch(document.getElementById("touchpad"));
controls.mouseSteer = settings.mouseSteer;
document.getElementById("mouseBtn").classList.toggle("on", settings.mouseSteer);
const muteBtn = document.getElementById("muteBtn");
const showMute = () => { muteBtn.textContent = settings.muted ? "Ovoz o'chiq" : "Ovoz yoniq"; muteBtn.classList.toggle("off", settings.muted); };
showMute();
// browsers only allow sound after a user gesture: (re)start audio on any interaction
view.onDoor = () => audio.thump(0.9);          // the door closes as he sits down
for (const ev of ["pointerdown", "keydown", "touchstart"]) addEventListener(ev, () => { view.skipBoarding(); audio.start(); audio.setMuted(settings.muted); audio.resume(); }, { capture: true });
// phones and tablets get the on-screen controls (?mobile forces them for testing)
const touchUi = coarse || (navigator.maxTouchPoints > 0 && Math.min(innerWidth, innerHeight) < 900) || /[?&]mobile/.test(location.search);
if (touchUi) app.classList.add("touch");
// phones are played sideways only: held upright, the whole interface is turned a quarter (from the first frame);
// where the browser can lock the screen to landscape it is asked to on the first touch, and the turn then goes away
function applyRot() { app.classList.toggle("rot", touchUi && innerHeight > innerWidth); }
addEventListener("resize", applyRot); addEventListener("orientationchange", applyRot); applyRot();
if (touchUi) addEventListener("pointerdown", () => goFullscreen(), { once: true, capture: true });
// a quarter-turned interface cannot be scrolled by the browser the usual way: drag the panel under the finger
document.addEventListener("touchstart", e => { scrollState = rotated() && e.touches.length === 1 ? { x: e.touches[0].clientX, y: e.touches[0].clientY } : null; }, { passive: true });
let scrollState = null;
document.addEventListener("touchmove", e => {
  if (!scrollState) return;
  let el = e.target; while (el && el !== document.body && !(el.scrollHeight > el.clientHeight + 2 && /(auto|scroll)/.test(getComputedStyle(el).overflowY))) el = el.parentElement;
  if (!el || el === document.body) return;
  const t = e.touches[0]; el.scrollTop += t.clientX - scrollState.x;
  scrollState = { x: t.clientX, y: t.clientY }; e.preventDefault();
}, { passive: false });
function goFullscreen() {
  const el = document.documentElement;
  const req = el.requestFullscreen || el.webkitRequestFullscreen;
  if (!req || document.fullscreenElement || document.webkitFullscreenElement) return;
  Promise.resolve(req.call(el, { navigationUI: "hide" })).then(() => screen.orientation && screen.orientation.lock && screen.orientation.lock("landscape").catch(() => {})).catch(() => {});
}

const TITLES = { exam: "To'liq avtodrom · Imtihon", training: "To'liq avtodrom · Trening", learn: "Qadamma-qadam o'quv" };
let greeted = false, bumpT = 0, tutorial = null, replay = null, lastResult = null;
const rec = new Recorder();

// Building the ground (roads, buildings, trees, signs) and making its shaders ready takes seconds on a slow phone;
// the screen stayed black meanwhile. A "getting ready" card shows first, the work starts once it is on screen, and
// the picture is drawn only when the ground's shaders and textures are ready.
let preparing = false;
function prepCard(on) {
  let c = document.getElementById("prep");
  if (!c) { c = document.createElement("div"); c.id = "prep"; app.appendChild(c); }
  if (on) c.innerHTML = loader(typeof on === "string" ? on : "Tayyorlanmoqda");
  c.classList.toggle("on", !!on);
}
function start(m, el) {
  if (preparing) return;
  preparing = true; prepCard(true); hud.hideMenu();
  requestAnimationFrame(() => requestAnimationFrame(() => {
    try { startNow(m, el); } catch (e) { preparing = false; prepCard(false); throw e; }
    const done = () => { preparing = false; prepCard(false); };
    Promise.all([warmUp(view.renderer, view.scene, view.cam, view.scene), view.warmHud()]).then(done, done);       // the whole scene (ground, people, cabin) and the mirrors
  }));
}
function startNow(m, el) {
  if (inShowroom) { inShowroom = false; hud.showShowroom(false); }
  audio.start(); audio.setMuted(settings.muted); audio.voiceOn = settings.voice;
  saveSettings();
  stopCarVoice(0.3); view.cancelExit();
  mode = m; elementId = el || null; ended = false;
  if (touchUi) goFullscreen();
  app.classList.toggle("auto", settings.transmission === "auto");
  // other cars: none, plain boxes, or light copies of the real models (the models load in the background)
  const trafficMode = settings.traffic || "simple";
  setTrafficFleet(trafficMode === "real" ? CARS.map(c => ({ id: c.id, len: c.dims.length, wid: Math.min(1.8, c.dims.width), rOh: c.dims.rOh })) : []);
  if (trafficMode === "real") loadTrafficModels();
  loadTrain();
  const W = m === "practice" ? buildPractice(el, carDims()) : buildFull(carDims(m === "exam"));
  if (trafficMode === "off") W.traffic = null;
  view.setTrafficMode(trafficMode);
  rec.reset(); replay = null; hud.hideReplay(); view.setReplayMarkers([]);
  tutorial = m === "learn" ? new Tutorial(settings.transmission) : null;
  if (!tutorial) hud.showTutor(null);
  session = new Session(W, { mode: m === "learn" ? "training" : m, transmission: settings.transmission, spec: carById(settings.car).spec }); session.car.grip = gripFor(settings.weather);
  countRun(settings.car);
  view.setZonesVisible(m !== "exam");            // the 1 m stop zones are a training aid only
  view.setWorld(W, settings.quality);
  view.setMode(settings.camera || "cockpit");
  useCar(settings.car);                            // the model variant follows the quality setting
  if (m !== "practice" && settings.boarding !== false) { view.drag = { yaw: 0, pitch: 0 }; view.startBoarding(); }
  // the first time he sits down, the driver says hello (once per visit)
  if (m !== "practice" && !greeted && settings.voice !== false && !settings.muted) { greeted = true; carVoice = audio.carClip("salom.mp3", 0, 0); }
  hud.reset(session, m === "practice" ? ELEMENTS.find(e => e.id === el).name : TITLES[m]);
  session.on(handleEvent);
  hud.hideMenu();
  paused = false;
  bump.reset(); countdown = -1;
  audio.chime();
  audio.preload(Object.keys(PHRASES.phrases).concat(["clips/fayzulla", "clips/balandku"]));
  balandFor = null;
  if (moodLocked(settings.instructor)) settings.instructor = "angry";
  instructor.mood = settings.instructor; instructor.reset();
  kidShow.reset(session, m === "training");
  view.setInstructorVisible(instructor.on);
  if (instructor.on) audio.preload(lineIds(instructor.mood));
  if (m === "practice") audio.prompt("task_" + el, ELEMENTS.find(e => e.id === el).name);
  else audio.prompt("wait_start", "Start ishorasini kuting");
}

// 360-degree showroom: the car parked, camera driven by mouse/touch
let inShowroom = false;

/* ---------- garage: all cars on lit bays, pick one ---------- */
let garage = null, garageComposer = null, inGarage = false, garageDrag = null;
function openGarage() {
  if (!garage) {
    garage = new Garage(CARS, view.renderer);
    // the garage's own shaders and textures (floor, walls, signs, lights) made ready before its first frame:
    // drawn at once, the first frame waited for every one of them to link
    garage.ready = false;
    const ready = () => { garage.ready = true; if (inGarage) prepCard(false); };
    warmUp(view.renderer, garage.scene, garage.cam, garage.scene).then(ready, ready);
    // the bays get the light -mid copies, one car at a time, the one in front first and then outwards, with a
    // pause between them so the picture does not stall while they decode; the car in front is then swapped
    // for the full model (garageSharpen): nine full models at once stalled the garage for seconds
    garage.mids = [];
    const at = Math.max(0, CARS.findIndex(c => c.id === carById(settings.car).id));
    const order = CARS.map((_, i) => i).sort((a, b) => Math.abs(a - at) - Math.abs(b - at));
    order.reduce((p, i) => p.then(() => prepareCar(CARS[i], undefined, "-mid").then(cv => { garage.mids[i] = cv; if (!garage.full || garage.full.i !== i) garage.setModel(i, cv); if (i === garage.index) garageSharpen(); }).catch(() => {})).then(() => new Promise(r => setTimeout(r, 250))), Promise.resolve());
  }
  garage.index = Math.max(0, CARS.findIndex(c => c.id === carById(settings.car).id));
  garage.camX = garage.index * 7.5;
  garage.resize(view.w, view.h);
  garageComposer = view.composerFor(garage.scene, garage.cam);
  hud.hideMenu(); inGarage = true; paused = true;
  if (!garage.ready) prepCard("Garaj ochilmoqda");
  app.classList.add("garage-open");
  hud.showGarage(true, garageAction, CARS[garage.index], settings.color);
  garageSharpen();
}
// The car in front of the camera at full quality ("Yuqori" only): loaded once the player has stopped on it for
// a moment, then shown in place of its light copy; the one before goes back to its light copy and is freed.
function garageSharpen() {
  clearTimeout(garageSharpen.t);
  if (!garage || modelVariant() !== "") return;
  const i = garage.index;
  garageSharpen.t = setTimeout(() => {
    if (!inGarage || garage.index !== i || (garage.full && garage.full.i === i) || !garage.mids[i]) return;
    const old = garage.full; garage.full = { i, cv: null };
    if (old) { if (old.cv) { garage.setModel(old.i, garage.mids[old.i]); freeModel(old.cv); } }
    prepareCar(CARS[i]).then(cv => {
      if (!garage.full || garage.full.i !== i) { freeModel(cv); return; }
      garage.full.cv = cv; garage.setModel(i, cv);
    }).catch(() => { if (garage.full && garage.full.i === i) garage.full = null; });
  }, 600);
}
// phones: the garage's nine cars are let go when the player leaves it (built again on the next visit); kept, they
// held the phone's memory through the whole drive
function freeGarage() {
  clearTimeout(garageSharpen.t);
  const keep = carModelCache.get(carById(settings.car).id + modelVariant());
  const all = new Set([...garage.bays.map(b => b.cv), ...garage.mids, garage.full && garage.full.cv].filter(Boolean));
  for (const cv of all) if (cv !== keep) freeModel(cv);
  garage = null; garageComposer = null;
}
function freeModel(cv) {
  cv.root.traverse(o => {
    if (o.geometry) o.geometry.dispose();
    for (const m of o.material ? [].concat(o.material) : []) { for (const k in m) if (m[k] && m[k].isTexture) m[k].dispose(); m.dispose(); }
  });
}
function garageAction(a, v) {
  if (a === "prev" || a === "next") {
    garage.index = (garage.index + (a === "next" ? 1 : CARS.length - 1)) % CARS.length; garageDrag = null;
    playCarVoice(CARS[garage.index].id);
    hud.showGarage(true, garageAction, CARS[garage.index], settings.color);
    garageSharpen();
  } else if (a === "color") {
    settings.color = v; saveSettings();
    for (const cv of [...garage.bays.map(b => b.cv), ...garage.mids]) if (cv && cv.setPaint) cv.setPaint(v);
    if (view.carView.setPaint) view.carView.setPaint(v);
    hud.showGarage(true, garageAction, CARS[garage.index], v);
  } else if (a === "buy") {
    hud.showBuy(carItem(CARS[garage.index]), CARS[garage.index].name);
  } else if (a === "pick" || a === "back") {
    // the picked car's light copy is already loaded and on the GPU: on a phone (which drives that copy) it goes straight to the road
    if (a === "pick" && modelVariant() === "-mid" && garage.mids[garage.index]) { const cv = garage.mids[garage.index]; cv.root.removeFromParent(); garage.bays[garage.index].cv = null; carModelCache.set(CARS[garage.index].id + "-mid", cv); }
    if (a === "pick") { settings.car = CARS[garage.index].id; saveSettings(); selectCar(settings.car); hud.toast(`${CARS[garage.index].name} tanlandi`, "good"); }
    inGarage = false; app.classList.remove("garage-open");
    hud.showGarage(false); hud.showMenu({ canResume: false });
    if (touchUi) freeGarage();
  }
}
function openShowroom() {
  audio.start(); audio.setMuted(settings.muted);
  const W = buildPractice("tezlashish", carDims());
  session = new Session(W, { mode: "practice", transmission: settings.transmission, spec: carById(settings.car).spec }); session.car.grip = gripFor(settings.weather);
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
    case "penalty": rec.mark(session, ev); hud.toast(`+${ev.pts} · ${ev.text}`, "bad"); hud.addLog(ev); audio.penalty();
      if (ev.code === "stopFar" && fayzullaFor === session.currentTask) { /* already played when the car stopped */ }
      else if (CLIP_FOR[ev.code]) audio.prompt(CLIP_FOR[ev.code], null, true);
      else if (!instructor.on) audio.prompt("pen_" + ev.code, `Xato. ${ev.pts} ball`);
      break;
    case "stopFarNow": fayzullaFor = session.currentTask; hud.toast("To'xtash chizig'idan 1 m dan uzoqda to'xtadingiz", "bad"); audio.prompt("clips/fayzulla", null, true); break;
    case "limit": hud.toast(`Jarima ${PASS_LIMIT} balldan oshdi${session.strict ? ": imtihon to'xtatildi" : ""}`, "bad"); audio.prompt("limit"); break;
    case "task": hud.toast(`Mashq: ${ev.task.name}`); if (mode !== "practice") audio.prompt("task_" + ev.task.id, ev.task.name); break;
    case "taskDone": if (ev.ok) { hud.toast(`${ev.task.short}: bajarildi`, "good"); audio.chime(); audio.prompt("done"); } break;
    case "stage": hud.toast("Bosqich bajarildi", "good"); audio.chime(); audio.prompt("stage"); break;
    case "bump": if (!bumpT || performance.now() - bumpT > 400) { bumpT = performance.now(); audio.thump(0.5 + ev.strength); view.bump(ev.strength); if (ev.strength > 0.25) hud.toast("To'qnashuv!", "bad"); } break;
    case "alarm": hud.toast("TO'XTANG!", "bad"); audio.prompt("stop", "To'xtang!", true); break;
    case "car":
      if (ev.kind === "stall") { hud.toast("Dvigatel o'chib qoldi", "bad"); audio.stall(); }
      else if (ev.kind === "engineStart") audio.catchFire();
      else if (ev.kind === "engineStop") audio.engineOff();
      else if (ev.kind === "shift") audio.shift();
      else if (ev.kind === "grind") { audio.grind(); hud.toast(ev.text); }
      else if (ev.text) hud.toast(ev.text);
      break;
    case "end":
      ended = true;
      // the run is over (failed, stopped or finished): the engine is switched off and stops sounding
      if (session.car.engineOn) { session.car.stopEngine(); audio.engineOff(); }
      session.car.rpm = 0; session.car.throttle = 0;
      audio.prompt(mode === "practice" ? (ev.passed ? "practice_pass" : "practice_fail") : (ev.passed ? "exam_pass" : "exam_fail"), null, true);
      const showResult = () => {
        paused = true;
        const s = session, passed = ev.passed;
        const acts = mode === "practice"
          ? [["Qaytadan", "retry", !passed], ...(nextElement() ? [["Keyingi mashq", "next", passed]] : []), ["Menyu", "menu"]]
          : [["Qayta topshirish", "retry", true], ["Menyu", "menu"]];
        rec.next = 0; rec.sample(s);
        if (mode !== "practice") acts.splice(acts.length - 1, 0, ["Bayonnoma", "protocol"]);
        if (mode === "exam" && passed) acts.splice(acts.length - 1, 0, ["Sertifikat", "certificate"]);
        const hist = recordAttempt(s, { passed, key: keyFor(mode, elementId) });
        sendAttempt({ ...hist.rec, car: settings.car });
        { const all = loadHistory(), dt = dailyTask(new Date(), ELEMENTS); if (dt.progress(all) >= dt.goal && dt.progress(all.slice(0, -1)) < dt.goal) hist.daily = dt.text; }
        hist.fresh = unlock(loadHistory(), hist.rec, { elements: ELEMENTS.map(e => e.id) });
        if (rec.duration > 1) acts.splice(acts.length - 1, 0, ["Takroriy ko'rish", "replay"]);
        lastResult = [s, ev, acts, hist];
        hud.showResult(...lastResult);
      };
      // the car with real doors: the doors open and the people get out first
      // (the car rolls to a stop first: see the frame loop)
      const whenStill = (f, ms) => setTimeout(function wait() { if (Math.abs(session.car.v) > 0.01) setTimeout(wait, 150); else f(); }, ms);
      if (view.canExit() && mode !== "practice") whenStill(() => { if (ended) view.startExit(showResult); }, 900);
      else whenStill(showResult, 1200);
      break;
  }
}

let cranking = null, engineStarts = 0;
// while cranking the rev counter shows the starter turning the engine over
function crank(now) {
  if (!cranking) return;
  const c = cranking.car;
  if (c !== session.car) { cranking = null; return; }
  if (now < cranking.until) { c.rpm = 180 + Math.random() * 90; return; }
  cranking = null;
  c.startEngine();
}

function nextElement() {
  const i = ELEMENTS.findIndex(e => e.id === elementId);
  return i >= 0 && i < ELEMENTS.length - 1 ? ELEMENTS[i + 1].id : null;
}

function startReplay() {
  document.getElementById("result").hidden = true;
  replay = { t: 0, playing: true, speed: 1, prevMode: view.mode };
  view.setMode("top"); view.setReplayMarkers(rec.marks);
  hud.showReplay(rec, {
    toggle: () => { replay.playing = !replay.playing; if (replay.playing && replay.t >= rec.duration - 0.05) replay.t = 0; },
    seek: t => { replay.t = t; },
    speed: () => (replay.speed = replay.speed === 1 ? 2 : replay.speed === 2 ? 4 : 1),
    exit: () => { hud.hideReplay(); view.setReplayMarkers([]); view.setMode(replay.prevMode === "top" ? (settings.camera || "cockpit") : replay.prevMode); replay = null; hud.showResult(...lastResult); }
  });
}

function resultAction(id) {
  if (id === "replay") return startReplay();
  if (id === "certificate") { const [s, , , h] = lastResult, car = carById(settings.car); return hud.showCertificate(s, h.stars, { date: new Date(), car: car.name, plate: settings.plate || DEFAULT_PLATE }); }
  if (id === "protocol") {
    const [s, ev] = lastResult, car = carById(settings.car);
    return hud.showProtocol(s, ev.passed, { date: new Date(), modeLabel: mode === "exam" ? "Amaliy imtihon (to'liq avtodrom)" : "Trening (to'liq avtodrom)", car: car.name, plate: settings.plate || DEFAULT_PLATE });
  }
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
  if (a === "fullscreen") return goFullscreen();
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
    case "engine":
      if (car.engineOn) { car.stopEngine(); break; }
      if (cranking) break;
      if (!car.canStart()) { car.startEngine(); break; }        // shows why it cannot start
      // turn the key: the starter cranks for a moment (longer when cold the first time), then it fires
      cranking = { until: performance.now() + (engineStarts++ ? 700 : 1100), car };
      audio.starter((cranking.until - performance.now()) / 1000);
      break;
    case "g1": case "g2": case "g3": case "g4": case "g5":
      if (car.transmission === "manual") car.shift(+a[1]); else if (a === "g1") car.shift("D");
      break;
    case "gR": car.shift("R"); break;
    case "gN": car.shift("N"); break;
    case "gD": if (car.transmission === "auto") car.shift("D"); break;
    case "gP": if (car.transmission === "auto") car.shift("P"); break;
    case "gToggle":            // touch: one button; manual R <-> N, automatic R <-> D
      if (car.transmission === "manual") car.shift(car.gear === "R" ? "N" : "R");
      else car.shift(car.gear === "R" ? "D" : car.gear === "D" ? "R" : "D");
      break;
    case "gUp": case "gDown": {
      const seq = car.transmission === "manual" ? MANUAL : AUTO;
      const i = seq.indexOf(car.gear) + (a === "gUp" ? 1 : -1);
      if (i >= 0 && i < seq.length) car.shift(seq[i]);
      break;
    }
  }
}

// training size of the tight elements: wide for beginners, real size in the exam
const SIZES = { wide: 1.5, mid: 1.25, real: 1 };
function carDims(exam) { const d = carById(settings.car).dims; return { length: d.length, rOh: d.rOh, k: exam ? 1 : SIZES[settings.size] || 1 }; }
// car model: generated Cobalt right away, then the .glb file once it has loaded
let carModelId = null;
const carModelCache = new Map();          // car id + variant -> a model loaded elsewhere (the garage), used once
// load a car model and dress it (paint, plates, Cobalt facelift parts)
// the full model on "Yuqori"; "O'rta" (where phones start) and "Yengil" get the -mid copy
// (tools/make-lite.mjs mid): about a third fewer triangles, the textures at 1024 px, which fit a phone's memory
const modelVariant = () => settings.quality === "high" ? "" : "-mid";
function prepareCar(car, onProgress, variant = modelVariant()) {
  return loadCarModel(car.model.replace(/\.glb$/, variant + ".glb"), onProgress).then(cv => {
    if (car.id === "cobalt") dressCobalt(cv); else addPaint(cv);
    addScreenAd(cv, car.screen, car.id);
    // the Cobalt file has no plates of its own: put them on the plate holders; the other models have the plate
    // drawn in their paint ("MALIBU", "Passat"): ours covers it, at the height measured on each car (plateY: front, rear)
    const d = car.dims, py = car.plateY;
    addPlates(cv, settings.plate, car.id === "cobalt" ? [{ pos: [3.582, 0.45, 0], back: false }, { pos: [-0.882, 0.47, 0], back: true }]
      : py ? [{ pos: [d.wheelbase + d.fOh, py[0], 0], back: false }, { pos: [-d.rOh, py[1], 0], back: true }] : undefined);
    if (cv.setPaint) cv.setPaint(settings.color);
    return cv;
  });
}

// the locomotive that crosses at the railway crossing, loaded once
let trainLoading = null;
function loadTrain() {
  if (!trainLoading) trainLoading = loadTrafficModel("models/train.glb").then(m => warmUp(view.renderer, m, view.cam, view.scene).then(() => m)).then(m => view.setTrainModel(m)).catch(e => console.warn("train model", e.message));
  return trainLoading;
}

// light models for the traffic, loaded once when they are first needed
let trafficLoading = null;
function loadTrafficModels() {
  if (trafficLoading) return trafficLoading;
  const map = {};
  trafficLoading = CARS.reduce((p, c) => p.then(() => new Promise(r => setTimeout(r, 1500))).then(() => loadTrafficModel(c.model.replace(/\.glb$/, "-lite.glb")).then(m => warmUp(view.renderer, m, view.cam, view.scene).then(() => m)).then(m => { map[c.id] = m; view.setTrafficModels({ ...map }); }).catch(e => console.warn("traffic model", c.id, e.message))), Promise.resolve());
  return trafficLoading;
}

// the car's own voice clip, played when the player picks it (menu or garage); not at load
let carVoice = null;
function stopCarVoice(fade = 0.4) { if (carVoice) { carVoice.stop(fade); carVoice = null; } }
function playCarVoice(id) {
  stopCarVoice();
  const v = carById(id).voice;
  if (v && settings.voice !== false && !settings.muted) carVoice = audio.carClip(v.url, v.from, v.dur, e => hud.toast("Mashina ovozi chalinmadi: " + ((e && (e.name || e.message)) || "xato"), "bad"));
}
function selectCar(id) { useCar(id); playCarVoice(id); }
function useCar(id) {
  let car = carById(id);
  if (carLocked(car)) car = CARS.find(c => !carLocked(c)) || CARS[0];       // a paid car only for its owner
  const key = car.id + modelVariant();
  if (carModelId === key) return;
  carModelId = key;
  const first = !boot.isDone();
  const slow = first ? 0 : setTimeout(() => hud.toast(`${car.name} yuklanmoqda…`), 600);
  if (first) boot.step(`${car.name} yuklanmoqda…`, 0.15);
  const ready = carModelCache.get(key); carModelCache.delete(key);
  if (ready) { ready.root.position.set(0, 0, 0); ready.root.traverse(o => { if (o.isMesh) o.castShadow = o.name === "shadow_proxy"; }); }   // on the road its proxy casts the shadow, as at load
  (ready ? Promise.resolve(ready) : prepareCar(car, first ? f => boot.step(`${car.name} yuklanmoqda… ${Math.round(f * 100)}%`, 0.15 + f * 0.8) : undefined)).then(cv => warmUp(view.renderer, cv.root, view.cam, view.scene).then(() => cv)).then(cv => {
    clearTimeout(slow);
    if (carModelId !== key) return;                  // another car was picked meanwhile
    audio.setProfile(car.sound);
    view.setCarModel(cv, car);
    boot.done();
  }).catch(e => { clearTimeout(slow); boot.done(); hud.toast(`${car.name} yuklanmadi`, "bad"); console.warn("car model not loaded, using the built-in one:", e.message); });
}
useCar(settings.car);

// a preview of the autodrome behind the menu
session = new Session(buildFull(carDims()), { mode: "training", transmission: settings.transmission, spec: carById(settings.car).spec }); session.car.grip = gripFor(settings.weather);
view.setWorld(session.W, settings.quality);
// behind the menu the car turns slowly on the start pad
view.setMode("orbit"); view.orbit = { az: 2.3, el: 0.12, dist: 9 };
hud.reset(session, "Simulyator");
hud.showMenu({ canResume: false });

// the server (when the build has one): the cars the admin switched off leave the lists (the picked one
// gives way to the first left); the saved login is checked, or a Telegram mini app logs in by itself
if (apiOn) {
  config().then(c => {
    if (!c) return;
    setDisabledCars(c.disabledCars);
    const picked = settings.car === "malibu" ? "malibu-premier" : settings.car;
    if (!CARS.some(x => x.id === picked)) { settings.car = CARS[0].id; saveSettings(); useCar(settings.car); }
    hud.refreshMenu();
  });
  Promise.all([refreshMe(), loadShop()]).then(([u]) => { if (u) syncHistory(); keepToOwned(); hud.refreshMenu(); afterPayment(); });
  telegramMiniAppLogin().then(u => { if (u) onAccount(u); });
}
// logged in or out: the menu shows it; a login sends this browser's attempts and brings the others' back
// back from inPAY's payment page (/?order=<id>): the order is asked about until it is paid (inPAY's callback may
// come a little later), and what was bought opens
async function afterPayment() {
  const id = new URLSearchParams(location.search).get("order");
  if (!id) return;
  history.replaceState(null, "", location.pathname + location.hash);
  hud.toast("To'lov tekshirilmoqda…");
  for (let i = 0; i < 20; i++) {
    try {
      const o = await orderStatus(id);
      if (o.status === "paid") { updateUser(o.user); hud.toast(`${o.name}: to'lov qabul qilindi, ochildi!`, "good"); return; }
      if (o.status === "failed" || o.status === "cancelled") { hud.toast("To'lov amalga oshmadi", "bad"); return; }
    } catch (e) { if (e.status === 404 || e.status === 401) return; }
    await new Promise(r => setTimeout(r, 3000));
  }
  hud.toast("To'lov hali tasdiqlanmadi. Bir ozdan keyin sahifani yangilang.", "bad");
}
// what was picked but is not owned (logged out, or a purchase ran out) goes back to a free choice
function keepToOwned() {
  let changed = false;
  if (carLocked(carById(settings.car))) { settings.car = (CARS.find(c => !carLocked(c)) || CARS[0]).id; useCar(settings.car); changed = true; }
  if (moodLocked(settings.instructor)) { settings.instructor = "angry"; instructor.mood = "angry"; changed = true; }
  if (changed) saveSettings();
}
onUser(() => { keepToOwned(); hud.refreshMenu(); });
function onAccount(u) {
  hud.refreshMenu();
  if (u) { hud.toast(`Xush kelibsiz, ${u.name || u.username || ""}`, "good"); syncHistory(); }
}
function syncHistory() {
  flushAttempts(loadHistory())
    .then(() => myAttempts()).then(items => { if (mergeHistory(items)) hud.refreshMenu(); }).catch(() => {});
}

function resize() {
  view.resize(app.clientWidth, app.clientHeight);
  if (garage) { garage.resize(view.w, view.h); if (garageComposer) garageComposer.setSize(view.w, view.h); }
}
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

// the screen point in the interface's own coordinates (the interface is turned a quarter when the phone is upright)
const rotated = () => app.classList.contains("rot");
const ui = (e, cv) => { const r = cv.getBoundingClientRect(); return rotated() ? [e.clientY - r.top, r.right - e.clientX] : [e.clientX - r.left, e.clientY - r.top]; };

// drag to look around (cockpit) or orbit the car (360); wheel / pinch to zoom
{
  const cv = hud.canvas, pts = new Map();
  let pinch = 0;
  const mir = new Map();       // pointer id -> the mirror being adjusted
  cv.addEventListener("pointerdown", e => {
    const u = ui(e, cv), m = !inShowroom && !inGarage && view.mirrorAt(u[0], u[1]);
    if (m) { mir.set(e.pointerId, m); try { cv.setPointerCapture(e.pointerId); } catch (_) {} pts.set(e.pointerId, u); return; }
    if (controls.mouseSteer && view.mode === "cockpit" && !inShowroom) return;
    pts.set(e.pointerId, u);
    try { cv.setPointerCapture(e.pointerId); } catch (_) {}
  });
  cv.addEventListener("pointermove", e => {
    const p = pts.get(e.pointerId); if (!p) return;
    const u = ui(e, cv), dx = u[0] - p[0], dy = u[1] - p[1];
    pts.set(e.pointerId, u);
    const am = mir.get(e.pointerId); if (am) { view.adjustMirror(am, dx, dy); return; }
    if (inGarage) { const b = garage.bays[garage.index]; garageDrag = (garageDrag ?? b.turn.rotation.y) + dx * 0.008; return; }
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
  const up = e => { if (mir.delete(e.pointerId)) view.saveMirrors(); pts.delete(e.pointerId); if (pts.size < 2) pinch = 0; };
  cv.addEventListener("pointerup", up); cv.addEventListener("pointercancel", up);
  cv.addEventListener("wheel", e => {
    if (view.mode !== "orbit") return;
    e.preventDefault();
    view.orbit.dist = Math.min(18, Math.max(3, view.orbit.dist * (e.deltaY > 0 ? 1.1 : 0.9)));
  }, { passive: false });
  cv.addEventListener("dblclick", e => {
    const u = ui(e, cv), m = view.mirrorAt(u[0], u[1]);
    if (m) view.resetMirror(m); else view.drag = { yaw: 0, pitch: 0 };
  });
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
// the car is drawn between its last two physics steps (the steps do not fall on the frames: 3, 4 or 5 of
// them per frame would make it judder); the true state is put back before the HUD and the rules read it
const POSE = ["x", "y", "th", "h", "pitch", "groundRoll", "bodyPitch", "bodyRoll", "steer", "wheelSpin"];
let prevPose = null, prevCar = null;
const truePose = {};
// frame rate: "max" draws every screen refresh; on a 120/144 Hz screen "60" draws every other one (a phone
// stays cool), "30" every second or fourth. The refresh interval is measured from the frames themselves
let lastRaw = performance.now(), vsync = 1000 / 60, lastDraw = 0;
// behind the menu only the car turns slowly: 30 frames a second are enough there
const frameCap = () => {
  const fps = settings.fps || (coarse ? "60" : "max"), cap = fps === "30" ? 1000 / 30 : fps === "60" ? 1000 / 60 : 0;
  return hud.menuOpen && !inGarage ? Math.max(cap, 1000 / 30) : cap;
};
function frameGap() { const want = frameCap(); return want && want > vsync * 1.5 ? want - vsync / 2 : 0; }
function frame(now) {
  const raw = now - lastRaw; lastRaw = now;
  if (raw > 2 && raw < 50) vsync += (raw - vsync) * 0.05;
  if (now - lastDraw < frameGap()) { requestAnimationFrame(frame); return; }
  lastDraw = now;
  const dt = Math.max(0, Math.min(0.1, (now - last) / 1000)); last = now;   // the first frame can be stamped before `last`
  if (preparing) { requestAnimationFrame(frame); return; }
  if (inGarage) {
    garage.update(dt, garageDrag);
    if (garage.ready) { if (garageComposer) garageComposer.render(); else garage.render(view.renderer); }
    requestAnimationFrame(frame); return;
  }
  if (session) {
    if (replay) {
      if (replay.playing) { replay.t += dt * replay.speed; if (replay.t >= rec.duration) { replay.t = rec.duration; replay.playing = false; } }
      const p = rec.at(replay.t); if (p) { Object.assign(session.car, p); session.car.engineOn = false; }
      hud.updateReplay(replay.t, replay.playing, rec);
    }
    if (!paused && session.state === "running") {
      controls.apply(session.car, dt);
      acc += dt;
      let n = 0;
      const c = session.car;
      if (prevCar !== c) { prevCar = c; prevPose = {}; for (const k of POSE) prevPose[k] = c[k] || 0; }
      if (view.boarding) acc = 0;                  // the clock (and the start signal) waits until both are in their seats
      while (acc >= H && n < 60) { for (const k of POSE) prevPose[k] = c[k] || 0; session.step(H); acc -= H; n++; }
      rec.sample(session);
      countDrive(settings.car, dt);
    } else { acc = 0; prevCar = null; }
    // what the adverts on this car were seen for: the screen from the driver's seat, the rear window from outside
    if (!replay) watchAds(view.carView, settings.car, dt, { screen: view.mode === "cockpit", rear: view.mode !== "cockpit" });
    // after the end (past the finish line) the car does not freeze: it rolls on, engine off, and comes to rest
    if (ended && !replay && !paused && session.car.v) {
      const c = session.car, v = Math.sign(c.v) * Math.max(0, Math.abs(c.v) - 3 * dt);
      c.x += Math.cos(c.th) * v * dt; c.y += Math.sin(c.th) * v * dt; c.v = v;
    }
    view.look = controls.look;
    app.classList.toggle("cockpit", view.mode === "cockpit");
    app.classList.toggle("playing", !paused && !inShowroom && !ended);
    if (touchUi) hud.touchState(session.car);
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
    if (hud.menuOpen && !mode && !inShowroom && view.mode === "orbit") {
      view.orbit.az += dt * 0.12;
      // keep the car in the gap between the two menu panels
      const a = document.querySelector(".menu-main"), b = document.querySelector(".menu-side");
      if (a && b && innerWidth > 1100) { const l = a.getBoundingClientRect().right, r = b.getBoundingClientRect().left; view.viewShift = (l + r) / 2 - innerWidth / 2; }
      else view.viewShift = 0;
    } else view.viewShift = 0;
    crank(now);
    const lerp = prevCar === session.car && !replay;
    if (lerp) {
      const c = session.car, a = Math.min(1, acc / H);
      for (const k of POSE) {
        truePose[k] = c[k] || 0;
        let d = truePose[k] - prevPose[k];
        if (k === "th") d = Math.atan2(Math.sin(d), Math.cos(d));
        c[k] = truePose[k] - d * (1 - a);
      }
    }
    view.update(session, dt, now);
    view.adapt(dt * 1000, frameCap());
    view.render();
    if (lerp) Object.assign(session.car, truePose);
    if (now - lastHud > 60) { hud.update(session, view, now); lastHud = now; if (tutorial) hud.showTutor(tutorial.tick(session.car, now)); }
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

// First visit: a quality setting for the device (the player can change it in the settings). Weak phones (older
// Mali, Adreno 5xx and below, PowerVR, little memory) start on "Yengil", other phones and laptops with
// integrated Intel graphics on "O'rta", the rest on "Yuqori".
function pickQuality(renderer) {
  let gpu = "";
  try { const gl = renderer.getContext(), ext = gl.getExtension("WEBGL_debug_renderer_info"); gpu = ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER); } catch (_) {}
  const mem = navigator.deviceMemory || 8, cores = navigator.hardwareConcurrency || 8;
  const weak = /Mali-(4|T\d|G(31|51|52|57|68)\b)|Adreno\D*[2-5]\d\d\b|PowerVR|SwiftShader|llvmpipe|Intel.*HD Graphics [2-5]\d\d\b/i.test(gpu);
  if (weak || mem <= 3 || cores <= 4 && coarse) return "low";
  if (coarse || /Intel/i.test(gpu) && !/Arc/i.test(gpu)) return "mid";
  return "high";
}
