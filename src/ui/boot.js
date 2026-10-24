// Boot screen (index.html #boot): progress while the first car model loads, a friendly
// message when the device cannot run the simulator, and the offline cache registration.
const el = () => document.getElementById("boot");
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

// the intro's sound, made on the spot (no file to wait for): a soft whoosh as the mark comes in, two notes as the
// name rises; the "Boshlash" tap gets a short rising chord. Browsers let a page sound only after a tap or a key
// (some allow it at once on sites a person visits often): it plays at once when allowed, otherwise on the first
// tap or key while the boot screen is up. Silent when the player turned the sound off.
const muted = (() => { try { return !!JSON.parse(localStorage.getItem("avtodrom.settings") || "{}").muted; } catch (_) { return false; } })();
let ac = null, introPlayed = false;
function tone(f, at, len, vol, out) {
  for (const [type, mul, v] of [["sine", 1, 1], ["triangle", 2, 0.25]]) {
    const o = ac.createOscillator(), g = ac.createGain();
    o.type = type; o.frequency.value = f * mul;
    g.gain.setValueAtTime(0, at); g.gain.linearRampToValueAtTime(vol * v, at + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, at + len);
    o.connect(g).connect(out); o.start(at); o.stop(at + len + 0.05);
  }
}
function whoosh(at, len, from, to, vol, out) {
  const n = Math.ceil(ac.sampleRate * len), b = ac.createBuffer(1, n, ac.sampleRate), d = b.getChannelData(0);
  for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
  const src = ac.createBufferSource(), bp = ac.createBiquadFilter(), g = ac.createGain();
  src.buffer = b; bp.type = "bandpass"; bp.Q.value = 1.2;
  bp.frequency.setValueAtTime(from, at); bp.frequency.exponentialRampToValueAtTime(to, at + len);
  g.gain.setValueAtTime(0, at); g.gain.linearRampToValueAtTime(vol, at + len * 0.45); g.gain.linearRampToValueAtTime(0, at + len);
  src.connect(bp).connect(g).connect(out); src.start(at);
}
function play(kind) {
  const t = ac.currentTime + 0.03, out = ac.createGain();
  out.gain.value = 0.55; out.connect(ac.destination);
  if (kind === "intro") {
    // in step with the screen when it plays from the start, all at once when it waited for a tap
    const late = Math.min(0.9, Math.max(0, 0.9 - (performance.now() - t0) / 1000));
    whoosh(t, 0.8, 250, 2600, 0.22, out);
    tone(659.25, t + late, 1.4, 0.16, out); tone(987.77, t + late + 0.22, 1.8, 0.14, out);
  } else {
    whoosh(t, 0.5, 400, 3200, 0.18, out);
    [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => tone(f, t + i * 0.07, 0.9, 0.12, out));
  }
}
function sound(kind) {
  if (muted) return;
  try {
    ac = ac || new (window.AudioContext || window.webkitAudioContext)();
    if (ac.state === "running") play(kind); else ac.resume().then(() => play(kind)).catch(() => {});
  } catch (_) {}
}
function intro() { if (introPlayed || muted) return; introPlayed = true; sound("intro"); }
try {
  ac = muted ? null : new (window.AudioContext || window.webkitAudioContext)();
  if (ac && ac.state === "running") intro();
} catch (_) {}
// (not on the "Boshlash" tap itself: that one has its own sound)
for (const ev of ["pointerdown", "keydown"]) addEventListener(ev, e => { if (e.target.id !== "bootGo" && el() && !el().classList.contains("done")) intro(); }, { capture: true });

// phones: full screen and turned on its side, as a game opens (the browser allows both only on a tap)
export function landscape() {
  const d = document.documentElement;
  try { const p = (d.requestFullscreen || d.webkitRequestFullscreen || (() => null)).call(d, { navigationUI: "hide" }); if (p && p.catch) p.catch(() => {}); } catch (_) {}
  try { const o = screen.orientation; if (o && o.lock) o.lock("landscape").catch(() => {}); } catch (_) {}
}
const touch = matchMedia("(pointer: coarse)").matches;

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
    const hide = () => { b.classList.add("done"); setTimeout(() => { b.remove(); if (ac) setTimeout(() => ac.close().catch(() => {}), 2500); }, 650); };
    const wait = Math.max(0, 2200 - (performance.now() - t0));
    setTimeout(() => {
      if (!touch) return hide();
      b.classList.add("ready");
      const go = b.querySelector("#bootGo"); go.hidden = false;
      go.onclick = () => { introPlayed = true; sound("start"); landscape(); hide(); };
    }, wait);
  },
  fail(text) {
    const b = el(); if (!b) return;
    finished = true; clearInterval(tipTimer);
    b.classList.add("err"); b.classList.remove("done");
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
