// Procedural canvas textures (no external image files).
import * as THREE from "three";

function canvas(w, h = w) {
  const c = document.createElement("canvas");
  c.width = w; c.height = h;
  return [c, c.getContext("2d")];
}

function rng(seed) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}

function noiseTex(base, specks, seed, size = 512) {
  const [c, g] = canvas(size);
  g.fillStyle = base; g.fillRect(0, 0, size, size);
  const r = rng(seed);
  for (const [color, count, maxR] of specks) {
    g.fillStyle = color;
    for (let i = 0; i < count; i++) {
      const s = r() * maxR + 0.4;
      g.fillRect(r() * size, r() * size, s, s);
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

export const asphaltTexture = () => noiseTex("#575c63", [["rgba(0,0,0,0.18)", 9000, 2.2], ["rgba(255,255,255,0.06)", 7000, 1.6], ["rgba(120,110,95,0.10)", 2500, 2.5]], 7);
export const grassTexture = () => noiseTex("#4b6a33", [["rgba(30,50,15,0.35)", 12000, 3], ["rgba(140,170,80,0.18)", 9000, 2.2], ["rgba(110,95,60,0.12)", 1500, 3]], 11);
// leaves of a shrub: dark gaps and lit leaf tips (tinted per bush)
export const bushTexture = () => noiseTex("#4a7a3a", [["rgba(10,30,8,0.55)", 5000, 2.4], ["rgba(150,200,90,0.35)", 4000, 1.8], ["rgba(20,45,15,0.4)", 3000, 3.2]], 3, 256);
export const concreteTexture = () => noiseTex("#9b9a94", [["rgba(0,0,0,0.12)", 6000, 2], ["rgba(255,255,255,0.10)", 4000, 1.5]], 5, 256);

export function signTexture(kind) {
  const [c, g] = canvas(256);
  g.clearRect(0, 0, 256, 256);
  const tri = (fill, stroke) => {
    g.beginPath(); g.moveTo(128, 18); g.lineTo(240, 222); g.lineTo(16, 222); g.closePath();
    g.fillStyle = fill; g.fill(); g.lineWidth = 18; g.strokeStyle = stroke; g.lineJoin = "round"; g.stroke();
  };
  g.textAlign = "center"; g.textBaseline = "middle";
  if (kind === "zebra") {
    g.fillStyle = "#1f5fbf"; g.fillRect(8, 8, 240, 240);
    g.fillStyle = "#fff"; g.beginPath(); g.moveTo(128, 34); g.lineTo(226, 214); g.lineTo(30, 214); g.closePath(); g.fill();
    g.fillStyle = "#111";
    g.beginPath(); g.arc(128, 98, 14, 0, 7); g.fill();
    g.lineWidth = 12; g.lineCap = "round"; g.strokeStyle = "#111";
    g.beginPath(); g.moveTo(128, 116); g.lineTo(120, 156); g.lineTo(100, 190); g.moveTo(120, 156); g.lineTo(146, 190); g.moveTo(124, 126); g.lineTo(100, 146); g.moveTo(126, 126); g.lineTo(152, 140); g.stroke();
    g.fillStyle = "#111"; for (let i = 0; i < 4; i++) g.fillRect(70 + i * 30, 196, 18, 10);
  } else if (kind === "stop") {
    g.beginPath();
    for (let i = 0; i < 8; i++) { const a = Math.PI / 8 + i * Math.PI / 4; g.lineTo(128 + Math.cos(a) * 118, 128 + Math.sin(a) * 118); }
    g.closePath(); g.fillStyle = "#c8261e"; g.fill(); g.lineWidth = 10; g.strokeStyle = "#fff"; g.stroke();
    g.fillStyle = "#fff"; g.font = "bold 78px Arial, sans-serif"; g.fillText("STOP", 128, 132);
  } else if (kind === "rail") {
    g.translate(128, 128); g.rotate(Math.PI / 4);
    for (const r of [0, Math.PI / 2]) { g.save(); g.rotate(r); g.fillStyle = "#c8261e"; g.fillRect(-120, -26, 240, 52); g.fillStyle = "#fff"; g.fillRect(-108, -14, 216, 28); g.restore(); }
  } else if (kind === "hill") {
    tri("#fff", "#c8261e");
    g.fillStyle = "#111"; g.beginPath(); g.moveTo(60, 196); g.lineTo(196, 196); g.lineTo(196, 110); g.closePath(); g.fill();
    g.font = "bold 46px Arial, sans-serif"; g.fillText("16%", 112, 150);
  } else if (kind === "limit40") {
    g.beginPath(); g.arc(128, 128, 118, 0, 7); g.fillStyle = "#c8261e"; g.fill();
    g.beginPath(); g.arc(128, 128, 88, 0, 7); g.fillStyle = "#fff"; g.fill();
    g.fillStyle = "#111"; g.font = "bold 100px Arial, sans-serif"; g.fillText("40", 128, 134);
  } else if (kind === "yield" || kind === "yieldRight" || kind === "yieldAhead") {
    g.beginPath(); g.moveTo(20, 20); g.lineTo(236, 20); g.lineTo(128, 190); g.closePath(); g.fillStyle = "#fff"; g.fill(); g.lineWidth = 20; g.strokeStyle = "#c8261e"; g.lineJoin = "round"; g.stroke();
  } else if (kind === "park") {
    g.fillStyle = "#1f5fbf"; g.fillRect(8, 8, 240, 240); g.fillStyle = "#fff"; g.font = "bold 190px Arial, sans-serif"; g.fillText("P", 128, 138);
  } else if (kind === "ahead" || kind === "aheadRight" || kind === "right" || kind === "left") {
    g.beginPath(); g.arc(128, 128, 120, 0, 7); g.fillStyle = "#1f5fbf"; g.fill();
    g.strokeStyle = "#fff"; g.fillStyle = "#fff"; g.lineWidth = 20; g.lineCap = "butt";
    const head = (x, y, a) => { g.save(); g.translate(x, y); g.rotate(a); g.beginPath(); g.moveTo(0, -30); g.lineTo(-30, 8); g.lineTo(30, 8); g.closePath(); g.fill(); g.restore(); };
    if (kind === "ahead") { g.beginPath(); g.moveTo(128, 205); g.lineTo(128, 70); g.stroke(); head(128, 56, 0); }
    else if (kind === "aheadRight") { g.beginPath(); g.moveTo(110, 205); g.lineTo(110, 70); g.moveTo(110, 130); g.lineTo(170, 130); g.stroke(); head(110, 56, 0); head(182, 130, Math.PI / 2); }
    else { const d = kind === "right" ? 1 : -1; g.beginPath(); g.moveTo(128 - 60 * d, 128); g.lineTo(128 + 40 * d, 128); g.stroke(); head(128 + 60 * d, 128, d * Math.PI / 2); }
  } else if (kind === "noStop") {
    g.beginPath(); g.arc(128, 128, 120, 0, 7); g.fillStyle = "#c8261e"; g.fill(); g.beginPath(); g.arc(128, 128, 96, 0, 7); g.fillStyle = "#1f5fbf"; g.fill();
    g.strokeStyle = "#c8261e"; g.lineWidth = 24; g.beginPath(); g.moveTo(66, 66); g.lineTo(190, 190); g.moveTo(190, 66); g.lineTo(66, 190); g.stroke();
  } else if (kind === "learner") {
    tri("#fff", "#c8261e");
    g.fillStyle = "#111"; g.font = "bold 120px Arial, sans-serif"; g.fillText("У", 128, 156);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

export function textTexture(text, color = "#f2f0e9", w = 512, h = 160) {
  const [c, g] = canvas(w, h);
  g.fillStyle = color; g.textAlign = "center"; g.textBaseline = "middle";
  g.font = `bold ${Math.floor(h * 0.8)}px "Arial Narrow", Arial, sans-serif`;
  g.fillText(text, w / 2, h / 2 + 4);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

export function facadeTexture() {
  const [c, g] = canvas(512, 256);
  g.fillStyle = "#d9d4c8"; g.fillRect(0, 0, 512, 256);
  for (let r = 0; r < 3; r++) for (let i = 0; i < 10; i++) {
    g.fillStyle = "#2c3b4a"; g.fillRect(18 + i * 50, 28 + r * 76, 34, 44);
    g.fillStyle = "rgba(255,255,255,0.18)"; g.fillRect(18 + i * 50, 28 + r * 76, 34, 8);
  }
  g.fillStyle = "#1f6fb5"; g.fillRect(0, 0, 512, 14);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
