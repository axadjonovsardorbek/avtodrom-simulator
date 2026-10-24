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

// the intro's sound (public/audio/intro.m4a: a soft whoosh as the mark comes in, two notes as the name rises), a
// shimmer each time the light sweeps across the name, and a short rising chord as the boot screen gives way
// (start.m4a). The intro plays at once where the browser allows sound before a tap (Safari's "allow auto-play",
// Chrome for often visited sites); elsewhere on the first tap or key while the boot screen is up. Silent when the
// player turned the sound off.
const muted = (() => { try { return !!JSON.parse(localStorage.getItem("avtodrom.settings") || "{}").muted; } catch (_) { return false; } })();
const clip = name => { const a = new Audio(`audio/${name}.m4a`); a.preload = "auto"; a.volume = 0.6; return a; };
const introClip = muted ? null : clip("intro"), startClip = muted ? null : clip("start"), shimmerClip = muted ? null : clip("shimmer");
let introPlayed = muted, hidden = false;
function intro() {
  if (introPlayed) return;
  const p = introClip.play();
  if (p && p.then) p.then(() => { introPlayed = true; }, () => {}); else introPlayed = true;
}
intro();
for (const ev of ["pointerdown", "keydown"]) addEventListener(ev, e => { if (e.target.id !== "bootGo" && !hidden) intro(); }, { capture: true });
if (shimmerClip) {
  shimmerClip.volume = 0.35;
  const name = document.querySelector("#boot .boot-name");
  const ring = e => { if (e.animationName !== "sweep" || hidden) return; shimmerClip.currentTime = 0; shimmerClip.play().catch(() => {}); };
  if (name) { name.addEventListener("animationstart", ring); name.addEventListener("animationiteration", ring); }
}

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
  // ready: the intro plays to its end (about two seconds); on a phone a "Boshlash" button waits for the tap that
  // may turn the screen on its side and fill it
  done() {
    if (finished) return; finished = true; clearInterval(tipTimer);
    const b = el(); if (!b) return;
    b.querySelector("#bootBar").style.width = "100%";
    const hide = () => { hidden = true; if (startClip) startClip.play().catch(() => {}); b.classList.add("done"); setTimeout(() => b.remove(), 650); };
    setTimeout(() => {
      if (!touch) return hide();
      b.classList.add("ready");
      const go = b.querySelector("#bootGo"); go.hidden = false;
      go.onclick = () => { if (introClip) introClip.pause(); landscape(); hide(); };
    }, Math.max(0, 2200 - (performance.now() - t0)));
  },
  fail(text) {
    const b = el(); if (!b) return;
    finished = true; clearInterval(tipTimer);
    b.classList.add("err"); b.classList.remove("done"); b.querySelector("#bootGo").hidden = true;
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
