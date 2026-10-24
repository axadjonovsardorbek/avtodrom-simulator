// Boot screen (index.html #boot): progress while the first car model loads, a friendly
// message when the device cannot run the simulator, and the offline cache registration.
const el = () => document.getElementById("boot");
const touch = matchMedia("(pointer: coarse)").matches;
let finished = false;
const t0 = performance.now();

// a tip under the bar while it loads
const TIPS = [
  "Imtihonda 100 balldan oshsa, imtihon to'xtatiladi.",
  "To'xtash chizig'i oldida 1 metr ichida to'xtang.",
  "Burilishdan oldin burilish chirog'ini yoqishni unutmang.",
  "Ko'zgularni salon ko'rinishida sichqoncha yoki barmoq bilan sozlang.",
  "Temir yo'l kesishmasida to'xtab, ikki tomonga qarang.",
  "Qiyalikda qo'l tormozi bilan joyidan qo'zg'aling.",
  "Trening rejimida xato qilsangiz ham davom etasiz."
];
let tipN = Math.floor(Math.random() * TIPS.length);
const tip = () => { const t = document.getElementById("bootTip"); if (!t || finished) return; t.style.opacity = 0; setTimeout(() => { t.textContent = TIPS[tipN++ % TIPS.length]; t.style.opacity = 1; }, 350); };
tip(); const tipTimer = setInterval(tip, 3800);

// the intro's sound (public/audio/intro.m4a: a soft whoosh as the mark comes in, two notes as the name rises) and a
// short rising chord as the boot screen gives way (start.m4a). Browsers play sound only after a tap, unless the site
// is allowed to (Safari's "allow auto-play", Chrome for often visited sites): there the intro starts at once; elsewhere
// the screen waits still (.wait) with a "Boshlash" button, and the intro starts with its sound on the first tap or key.
// Silent, and without the wait, when the player turned the sound off.
const muted = (() => { try { return !!JSON.parse(localStorage.getItem("avtodrom.settings") || "{}").muted; } catch (_) { return false; } })();
const clip = name => { const a = new Audio(`audio/${name}.m4a`); a.preload = "auto"; a.volume = 0.6; return a; };
const introClip = muted ? null : clip("intro"), startClip = muted ? null : clip("start");
let started = 0, onStart = null;
function start() {
  if (started) return; started = performance.now();
  const b = el(); if (b) { b.classList.remove("wait"); b.querySelector("#bootGo").hidden = true; }
  if (onStart) onStart();
}
function askTap() {
  const b = el(); if (!b || started) return;
  const go = b.querySelector("#bootGo"); go.hidden = false; go.focus();
  const tap = e => {
    if (started) return;
    removeEventListener("pointerdown", tap, true); removeEventListener("keydown", tap, true);
    if (introClip) { introClip.currentTime = 0; introClip.play().catch(() => {}); }
    if (touch) landscape();
    start();
  };
  addEventListener("pointerdown", tap, true); addEventListener("keydown", tap, true);
}
if (muted) start();
else { const p = introClip.play(); if (p && p.then) p.then(start, askTap); else start(); }

// phones: full screen and turned on its side, as a game opens (the browser allows both only on a tap)
export function landscape() {
  const d = document.documentElement;
  try { const p = (d.requestFullscreen || d.webkitRequestFullscreen || (() => null)).call(d, { navigationUI: "hide" }); if (p && p.catch) p.catch(() => {}); } catch (_) {}
  try { const o = screen.orientation; if (o && o.lock) o.lock("landscape").catch(() => {}); } catch (_) {}
}

export const boot = {
  isDone: () => finished,
  step(text, f) {
    const b = el(); if (!b || finished) return;
    b.querySelector("#bootText").textContent = text;
    b.querySelector("#bootBar").style.width = Math.round(Math.max(0.05, Math.min(1, f)) * 100) + "%";
  },
  // ready: the boot screen goes once the intro has played to its end (about two seconds after it started)
  done() {
    if (finished) return; finished = true; clearInterval(tipTimer);
    const b = el(); if (!b) return;
    b.querySelector("#bootBar").style.width = "100%";
    const hide = () => { if (startClip) startClip.play().catch(() => {}); b.classList.add("done"); setTimeout(() => b.remove(), 650); };
    const go = () => setTimeout(hide, Math.max(0, 2200 - (performance.now() - started)));
    if (started) go(); else onStart = go;
  },
  fail(text) {
    const b = el(); if (!b) return;
    finished = true; clearInterval(tipTimer);
    b.classList.add("err"); b.classList.remove("done", "wait"); b.querySelector("#bootGo").hidden = true;
    b.querySelector("#bootText").textContent = text;
  }
};

// WebGL is required; without it there is nothing to show
function hasWebGL() {
  try { const c = document.createElement("canvas"); return !!(c.getContext("webgl2") || c.getContext("webgl")); } catch (_) { return false; }
}
if (!hasWebGL()) boot.fail("Brauzeringiz 3D grafikani (WebGL) qo'llamaydi. Chrome, Safari yoki Edge'ning yangi versiyasida oching.");

// an error before the first frame leaves the boot screen with an explanation instead of a blank page
addEventListener("error", e => { if (!finished) boot.fail("Yuklashda xato yuz berdi. Sahifani yangilang. (" + (e.message || "noma'lum xato") + ")"); });
addEventListener("unhandledrejection", e => { if (!finished) boot.fail("Yuklashda xato yuz berdi. Internetni tekshirib, sahifani yangilang."); });

// offline cache (production only)
if (!import.meta.env.DEV && "serviceWorker" in navigator) addEventListener("load", () => navigator.serviceWorker.register("sw.js").catch(() => {}));
