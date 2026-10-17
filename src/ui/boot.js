// Boot screen (index.html #boot): progress while the first car model loads, a friendly
// message when the device cannot run the simulator, and the offline cache registration.
const el = () => document.getElementById("boot");
let finished = false;

export const boot = {
  isDone: () => finished,
  step(text, f) {
    const b = el(); if (!b || finished) return;
    b.querySelector("#bootText").textContent = text;
    b.querySelector("#bootBar").style.width = Math.round(Math.max(0.05, Math.min(1, f)) * 100) + "%";
  },
  done() {
    if (finished) return; finished = true;
    const b = el(); if (!b) return;
    b.classList.add("done"); setTimeout(() => b.remove(), 500);
  },
  fail(text) {
    const b = el(); if (!b) return;
    finished = true;
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
