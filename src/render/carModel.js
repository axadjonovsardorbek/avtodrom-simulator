// Procedural Chevrolet Cobalt (the usual exam car), white, with a learner sign.
// Local frame: origin at the rear axle on the ground, +x forward, +z right, +y up.
import * as THREE from "three";
import { SPEC } from "../sim/vehicle.js";
import { signTexture } from "./textures.js";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import { buildBodyGeometries, seamGeometry, tyreGeometry, sidePatch, facePatch, faceX, belt, roof, sideZ, halfWidth, DIM } from "./cobaltBody.js";

const HW = SPEC.width / 2;

/* ---------- canvas textures ---------- */
function canvasTex(w, h, draw) {
  const c = document.createElement("canvas"); c.width = w; c.height = h;
  draw(c.getContext("2d"), w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return t;
}

function bowtie(g, cx, cy, s) {
  // simplified gold bow-tie emblem
  g.save(); g.translate(cx, cy); g.scale(s, s);
  g.beginPath();
  g.moveTo(-1, -0.25); g.lineTo(-0.28, -0.25); g.lineTo(-0.2, -0.45); g.lineTo(0.28, -0.45); g.lineTo(0.2, -0.25);
  g.lineTo(1, -0.25); g.lineTo(0.88, 0.25); g.lineTo(0.2, 0.25); g.lineTo(0.28, 0.45); g.lineTo(-0.2, 0.45); g.lineTo(-0.28, 0.25); g.lineTo(-0.88, 0.25); g.closePath();
  g.fillStyle = "#c9c9c9"; g.fill();
  g.scale(0.82, 0.7); g.fillStyle = "#d9a52b"; g.fill();
  g.restore();
}

const plateTex = () => canvasTex(520, 112, (g, w, h) => {
  g.fillStyle = "#fbfbf8"; g.fillRect(0, 0, w, h);
  g.strokeStyle = "#111"; g.lineWidth = 6; g.strokeRect(3, 3, w - 6, h - 6);
  g.fillStyle = "#111"; g.font = "bold 70px Arial, sans-serif"; g.textBaseline = "middle";
  g.fillText("01", 18, h / 2 + 4);
  g.fillRect(110, 10, 4, h - 20);
  g.fillText("A 777 AA", 128, h / 2 + 4);
  // flag + UZ
  const fx = 452; g.fillStyle = "#1eb5e6"; g.fillRect(fx, 18, 52, 14); g.fillStyle = "#fff"; g.fillRect(fx, 32, 52, 12); g.fillStyle = "#1eb53a"; g.fillRect(fx, 44, 52, 14);
  g.fillStyle = "#c8261e"; g.fillRect(fx, 31, 52, 2); g.fillRect(fx, 43, 52, 2);
  g.fillStyle = "#111"; g.font = "bold 30px Arial, sans-serif"; g.fillText("UZ", fx + 6, 82);
});

const emblemTex = () => canvasTex(128, 64, (g) => { g.clearRect(0, 0, 128, 64); bowtie(g, 64, 32, 52); });

const slatTex = () => canvasTex(256, 96, (g, w, h) => {
  g.fillStyle = "#08090a"; g.fillRect(0, 0, w, h);
  for (let i = 0; i < 3; i++) { const y = 14 + i * 28; g.fillStyle = "#24272b"; g.fillRect(0, y, w, 12); g.fillStyle = "#3a3e43"; g.fillRect(0, y, w, 3); }
});
const badgeTex = () => canvasTex(256, 48, (g, w, h) => {
  g.clearRect(0, 0, w, h); g.fillStyle = "#d8dbde"; g.font = "bold 36px Arial, sans-serif"; g.textAlign = "center"; g.textBaseline = "middle";
  g.fillText("COBALT", w / 2, h / 2 + 2);
});

const grilleTex = () => canvasTex(256, 64, (g, w, h) => {
  g.fillStyle = "#0d0e10"; g.fillRect(0, 0, w, h);
  g.strokeStyle = "#2a2d31"; g.lineWidth = 2;
  for (let y = 4; y < h; y += 10) for (let x = (y / 10) % 2 ? 6 : 0; x < w; x += 12) { g.beginPath(); g.moveTo(x, y + 4); g.lineTo(x + 6, y); g.lineTo(x + 12, y + 4); g.stroke(); }
});

/* ---------- in-car instrument cluster ---------- */
function clusterCanvas() {
  const c = document.createElement("canvas"); c.width = 512; c.height = 192;
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
  const g = c.getContext("2d");
  const draw = (car, now) => {
    g.fillStyle = "#050607"; g.fillRect(0, 0, 512, 192);
    const dial = (cx, max, step, val, redFrom, label) => {
      const cy = 100, R = 86, a0 = Math.PI * 0.75, a1 = Math.PI * 2.25;
      g.strokeStyle = "#3a3d42"; g.lineWidth = 4; g.beginPath(); g.arc(cx, cy, R + 4, 0, Math.PI * 2); g.stroke();
      g.fillStyle = "#e9edf2"; g.font = "bold 15px Arial"; g.textAlign = "center"; g.textBaseline = "middle";
      for (let v = 0; v <= max + 1e-6; v += step / 2) {
        const a = a0 + (a1 - a0) * v / max, major = Math.abs(v / step - Math.round(v / step)) < 1e-6;
        g.strokeStyle = redFrom != null && v >= redFrom ? "#ff3b2f" : "#e9edf2"; g.lineWidth = major ? 3 : 1.5;
        g.beginPath(); g.moveTo(cx + Math.cos(a) * (R - 2), cy + Math.sin(a) * (R - 2)); g.lineTo(cx + Math.cos(a) * (R - (major ? 14 : 8)), cy + Math.sin(a) * (R - (major ? 14 : 8))); g.stroke();
        if (major) g.fillText(String(v), cx + Math.cos(a) * (R - 28), cy + Math.sin(a) * (R - 28));
      }
      g.fillStyle = "#8a9099"; g.font = "11px Arial"; g.fillText(label, cx, cy + 40);
      const na = a0 + (a1 - a0) * Math.min(val, max) / max;
      g.strokeStyle = "#ff2a1a"; g.lineWidth = 4; g.lineCap = "round";
      g.beginPath(); g.moveTo(cx - Math.cos(na) * 12, cy - Math.sin(na) * 12); g.lineTo(cx + Math.cos(na) * (R - 12), cy + Math.sin(na) * (R - 12)); g.stroke();
      g.fillStyle = "#1b1d20"; g.beginPath(); g.arc(cx, cy, 10, 0, 7); g.fill();
    };
    dial(118, 7, 1, car.rpm / 1000, 6, "x1000 r/min");
    dial(394, 220, 20, car.kmh, null, "km/h");
    // small centre display: gear and odometer
    g.fillStyle = "#0d1a2c"; g.fillRect(222, 70, 68, 62);
    g.fillStyle = "#cfe4ff"; g.textAlign = "center"; g.font = "bold 30px Arial";
    g.fillText(car.transmission === "manual" ? String(car.gear) : car.gear, 256, 96);
    g.font = "11px Arial"; g.fillText(`${(car.odo / 1000).toFixed(1)} km`, 256, 122);
    // telltales
    const blink = Math.floor(now / 380) % 2 === 0;
    g.font = "bold 26px Arial"; g.textAlign = "center";
    g.fillStyle = (car.sig === -1 || car.hazard) && blink ? "#2bff6a" : "#1a2a1e"; g.fillText("◀", 40, 24);
    g.fillStyle = (car.sig === 1 || car.hazard) && blink ? "#2bff6a" : "#1a2a1e"; g.fillText("▶", 472, 24);
    g.font = "bold 15px Arial";
    g.fillStyle = car.handbrake ? "#ff3b2f" : "#2a1614"; g.fillText("(P)", 300, 176);
    g.fillStyle = !car.belt ? "#ff3b2f" : "#2a1614"; g.fillText("BELT", 350, 176);
    g.fillStyle = !car.engineOn ? "#ffb81a" : "#2a2214"; g.fillText("ENG", 410, 176);
    tex.needsUpdate = true;
  };
  return { tex, draw };
}

export function buildCar() {
  const root = new THREE.Group(); root.name = "car";
  const body = new THREE.Group(); body.name = "body";
  root.add(body);

  const paint = new THREE.MeshPhysicalMaterial({ color: 0xf4f5f3, roughness: 0.26, metalness: 0.1, clearcoat: 1, clearcoatRoughness: 0.1 });
  const black = new THREE.MeshStandardMaterial({ color: 0x131416, roughness: 0.45 });
  const plastic = new THREE.MeshStandardMaterial({ color: 0x1b1d20, roughness: 0.85 });
  const glass = new THREE.MeshPhysicalMaterial({ color: 0x0f151c, roughness: 0.03, metalness: 0.3, transparent: true, opacity: 0.82, side: THREE.DoubleSide, depthWrite: false, clearcoat: 1 });
  const chrome = new THREE.MeshStandardMaterial({ color: 0xe3e6e9, roughness: 0.1, metalness: 1 });
  const lampMat = (color, base = 0.12, extra = {}) => new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: base, roughness: 0.2, ...extra });
  const headMat = new THREE.MeshPhysicalMaterial({ name: "lamp_head", color: 0xaeb6bf, emissive: 0xfff3d6, emissiveIntensity: 0.05, roughness: 0.12, metalness: 0.9, clearcoat: 1 });
  const tailMat = lampMat(0xa5100a, 0.12, { roughness: 0.12, name: "lamp_tail" });
  const add = (m, parent = body) => { m.castShadow = true; m.receiveShadow = true; parent.add(m); return m; };
  const box = (w, h, d, mat, x, y, z, parent = body) => { const m = add(new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat), parent); m.position.set(x, y, z); return m; };
  const rbox = (w, h, d, r, mat, x, y, z, parent = body) => { const m = add(new THREE.Mesh(new RoundedBoxGeometry(w, h, d, 3, r), mat), parent); m.position.set(x, y, z); return m; };
  const facing = (m, x, y, z, dir = 1) => { m.position.set(x, y, z); m.rotation.y = dir > 0 ? Math.PI / 2 : -Math.PI / 2; body.add(m); return m; };
  const R0 = DIM.rear;
  const st = t => { t = Math.min(1, Math.max(0, t)); return t * t * (3 - 2 * t); };

  /* ---------- shell ---------- */
  const geo = buildBodyGeometries();
  add(new THREE.Mesh(geo.lower, [paint, headMat, tailMat, plastic]));
  add(new THREE.Mesh(geo.green, [paint, paint, paint, black, glass]));
  add(new THREE.Mesh(geo.capFront, paint));
  add(new THREE.Mesh(geo.capRear, paint));
  // underbody and wheel-arch liners so the open shell never shows through
  box(4.2, 0.02, SPEC.width - 0.12, plastic, 1.23, 0.35, 0);
  for (const wc of [0, DIM.wb]) {
    const liner = new THREE.Mesh(new THREE.CylinderGeometry(DIM.archR + 0.01, DIM.archR + 0.01, SPEC.width - 0.06, 32, 1, true, Math.PI / 2 - 0.25, Math.PI + 0.5), new THREE.MeshStandardMaterial({ color: 0x0c0d0f, roughness: 1, side: THREE.DoubleSide }));
    liner.rotation.x = Math.PI / 2; liner.position.set(wc, 0.31, 0); body.add(liner);
  }

  const FX = (y, off = 0.006) => faceX(y, 1) + off, RX = (y, off = 0.006) => faceX(y, -1) - off;
  const onFace = (m, y, z, dir, off) => { m.position.set(dir > 0 ? FX(y, off) : RX(y, off), y, z); m.rotation.y = dir > 0 ? Math.PI / 2 : -Math.PI / 2; body.add(m); return m; };
  const rr = (s2, w, h, r) => { s2.moveTo(-w / 2 + r, -h / 2); s2.lineTo(w / 2 - r, -h / 2); s2.quadraticCurveTo(w / 2, -h / 2, w / 2, -h / 2 + r); s2.lineTo(w / 2, h / 2 - r); s2.quadraticCurveTo(w / 2, h / 2, w / 2 - r, h / 2); s2.lineTo(-w / 2 + r, h / 2); s2.quadraticCurveTo(-w / 2, h / 2, -w / 2, h / 2 - r); s2.lineTo(-w / 2, -h / 2 + r); s2.quadraticCurveTo(-w / 2, -h / 2, -w / 2 + r, -h / 2); };
  const emblem = new THREE.MeshStandardMaterial({ map: emblemTex(), transparent: true, roughness: 0.25, metalness: 0.6 });
  const plateMat = new THREE.MeshStandardMaterial({ map: plateTex(), roughness: 0.5 });

  /* ---------- front: slim chrome-topped upper grille, wide slatted lower grille ---------- */
  const meshTex = grilleTex(); meshTex.wrapS = THREE.RepeatWrapping; meshTex.repeat.set(2.5, 1);
  add(new THREE.Mesh(facePatch([[-0.38, 0.635], [0.38, 0.635], [0.4, 0.75], [-0.4, 0.75]], 1, 0.019), new THREE.MeshStandardMaterial({ map: meshTex, roughness: 0.6 })));
  add(new THREE.Mesh(facePatch([[-0.4, 0.75], [0.4, 0.75], [0.41, 0.775], [-0.41, 0.775]], 1, 0.021), chrome));
  const bar = box(0.02, 0.03, 0.8, chrome, FX(0.705, 0.008), 0.705, 0);                       // chrome bar through the grille
  onFace(new THREE.Mesh(new THREE.PlaneGeometry(0.22, 0.11), emblem), 0.705, 0, 1, 0.022);
  add(new THREE.Mesh(facePatch([[-0.5, 0.4], [0.5, 0.4], [0.46, 0.56], [-0.46, 0.56]], 1, 0.019), new THREE.MeshStandardMaterial({ map: slatTex(), roughness: 0.7 })));
  onFace(new THREE.Mesh(new THREE.PlaneGeometry(0.52, 0.112), plateMat), 0.47, 0, 1, 0.012);
  for (const sg of [-1, 1]) {                                                              // fog lamps in round recesses
    const fz = sg * 0.62, fy = 0.44, fx = FX(fy, -0.035);
    const rec = new THREE.Mesh(new THREE.CircleGeometry(0.07, 28), black); rec.position.set(fx + 0.004, fy, fz); rec.rotation.y = Math.PI / 2 - sg * 0.35; body.add(rec);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.048, 0.008, 8, 24), chrome); ring.position.set(fx + 0.012, fy, fz); ring.rotation.y = Math.PI / 2 - sg * 0.35; body.add(ring);
    const lens = new THREE.Mesh(new THREE.CircleGeometry(0.042, 24), lampMat(0xfff8e6, 0.05)); lens.position.set(fx + 0.011, fy, fz); lens.rotation.y = Math.PI / 2 - sg * 0.35; body.add(lens);
  }

  /* ---------- lamps ---------- */
  for (const sg of [-1, 1]) {
    const side = sg < 0 ? "L" : "R";
    // headlamp: big clear unit wrapping from beside the grille round onto the wing
    add(new THREE.Mesh(sidePatch(3.02, 3.4, () => 0.64, x => belt(x), sg), headMat));
    add(new THREE.Mesh(facePatch([[0.4, 0.62], [0.72, 0.62], [0.74, 0.79], [0.42, 0.76]].map(([z, y]) => [sg * z, y]), 1, 0.019), headMat));
    const refl = new THREE.Mesh(facePatch([[0.46, 0.665], [0.66, 0.665], [0.68, 0.75], [0.48, 0.74]].map(([z, y]) => [sg * z, y]), 1, 0.024), black); body.add(refl);
    for (const [z, r] of [[0.52, 0.034], [0.63, 0.028]]) {
      const y = 0.705, lens = new THREE.Mesh(new THREE.CircleGeometry(r, 24), lampMat(0xfff8e6, 0.1, { name: "lamp_head_lens" }));
      lens.position.set(FX(y, 0.012) - 0.12 * Math.max(0, z - 0.5) ** 2 / 0.05, y, sg * z); lens.rotation.y = Math.PI / 2 - sg * 0.3; body.add(lens);
    }
    const ind = box(0.03, 0.03, 0.1, lampMat(0xffa21a, 0.05), 3.2, 0.66, sg * (sideZ(3.2, 0.66) + 0.004)); ind.rotation.y = sg * 0.5;
    ind.name = "ind_" + side + "_front";
    // tail lamps: tall, wrapping the corner, clear reverse section at the bottom
    add(new THREE.Mesh(sidePatch(R0 + 0.01, -0.68, x => 0.84 + 0.12 * st((x + 0.8) / 0.12), x => belt(x), sg), tailMat));
    add(new THREE.Mesh(facePatch([[0.44, 0.86], [0.74, 0.86], [0.72, 1.12], [0.47, 1.08]].map(([z, y]) => [sg * z, y]), -1, 0.019), tailMat));
    const r = new THREE.Mesh(facePatch([[0.47, 0.82], [0.74, 0.82], [0.74, 0.86], [0.46, 0.86]].map(([z, y]) => [sg * z, y]), -1, 0.019), lampMat(0xf2f2f2, 0.02));
    r.name = "lamp_reverse_" + side; body.add(r);
    const ri = box(0.02, 0.04, 0.1, lampMat(0xffa21a, 0.05), -0.8, 0.98, sg * (sideZ(-0.8, 0.98) + 0.004));
    ri.name = "ind_" + side + "_rear";
    const refl2 = box(0.01, 0.025, 0.1, lampMat(0x8a0a06, 0.15), RX(0.52, 0.004), 0.52, sg * 0.62); refl2.rotation.y = 0;
  }

  /* ---------- rear ---------- */
  const gy = 0.94;
  box(0.012, 0.03, 0.82, chrome, RX(gy, 0.004), gy, 0);                                     // trunk garnish
  onFace(new THREE.Mesh(new THREE.PlaneGeometry(0.17, 0.085), emblem), 1.01, 0, -1, 0.012);
  onFace(new THREE.Mesh(new THREE.PlaneGeometry(0.2, 0.038), new THREE.MeshStandardMaterial({ map: badgeTex(), transparent: true, metalness: 0.8, roughness: 0.3 })), 0.89, -0.3, -1, 0.006);
  onFace(new THREE.Mesh(new THREE.PlaneGeometry(0.52, 0.112), plateMat), 0.66, 0, -1, 0.01);
  const ex = new THREE.Mesh(new THREE.CylinderGeometry(0.032, 0.032, 0.16, 14), chrome);
  ex.rotation.z = Math.PI / 2; ex.position.set(R0 + 0.06, 0.33, -0.45); add(ex);

  /* ---------- sides ---------- */
  const seamMat = new THREE.MeshBasicMaterial({ color: 0x3a3d42 });
  for (const sg of [-1, 1]) {
    for (const x of [2.42, 1.09, 0.2]) body.add(new THREE.Mesh(seamGeometry(x, sg, 0.4, belt(x) - 0.06), seamMat));
    for (const x of [1.62, 0.55]) {
      const y = belt(x) - 0.1;
      rbox(0.14, 0.03, 0.035, 0.012, paint, x, y, sg * (sideZ(x, y) + 0.012));
    }
    // black mirrors on a triangular base
    const mx = 2.36, my = belt(mx) + 0.08, mz = sg * (halfWidth(mx) * 0.93 + 0.09);
    const mir = new THREE.Mesh(new THREE.SphereGeometry(0.1, 20, 14), black);
    mir.scale.set(0.8, 0.68, 1.3); mir.position.set(mx, my, mz); add(mir);
    rbox(0.14, 0.05, 0.1, 0.02, black, mx + 0.03, my - 0.05, sg * (halfWidth(mx) * 0.93 + 0.02));
  }
  const ant = box(0.01, 0.3, 0.01, black, 0.3, roof(0.3) + 0.13, 0); ant.rotation.z = 0.55;
  const wiperParts = [[-0.3, 0.56], [0.24, 0.5]];
  for (const [z, len] of wiperParts) { const w = box(0.02, 0.012, len, black, 2.47, 1.05, z); w.rotation.y = 0.12; }

  // learner sign on the roof
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(0.4, 0.4), new THREE.MeshStandardMaterial({ map: signTexture("learner"), transparent: true, side: THREE.DoubleSide, roughness: 0.6 }));
  sign.position.set(1.15, roof(1.15) + 0.25, 0); sign.rotation.y = Math.PI / 2; body.add(sign);
  box(0.1, 0.05, 0.3, black, 1.15, roof(1.15) + 0.03, 0);

  /* ---------- wheels: rounded tyres, black 10-spoke alloys ---------- */
  const tireGeo = tyreGeometry();
  const dishGeo = new THREE.CylinderGeometry(0.2, 0.2, 0.15, 32); dishGeo.rotateX(Math.PI / 2);
  const lipGeo = new THREE.TorusGeometry(0.2, 0.008, 8, 40);
  const rimMat = new THREE.MeshStandardMaterial({ color: 0xc8ccd1, roughness: 0.22, metalness: 0.95 });
  const spokeGeo = new THREE.BoxGeometry(0.17, 0.022, 0.03); spokeGeo.translate(0.1, 0, 0);
  const hubGeo = new THREE.CylinderGeometry(0.045, 0.05, 0.05, 20); hubGeo.rotateX(Math.PI / 2);
  const tyreMat = new THREE.MeshStandardMaterial({ color: 0x17181a, roughness: 0.92 });
  for (const [x, isFront] of [[0, false], [SPEC.wb, true]]) for (const sg of [-1, 1]) {
    const tag = (isFront ? "F" : "R") + (sg < 0 ? "L" : "R");
    const pivot = new THREE.Group(); pivot.position.set(x, SPEC.wheelR, sg * (SPEC.track / 2 + 0.02));
    pivot.name = "wheel_pivot_" + tag;
    const w = new THREE.Group(); w.name = "wheel_spin_" + tag;
    add(new THREE.Mesh(tireGeo, tyreMat), w);
    w.add(new THREE.Mesh(dishGeo, new THREE.MeshStandardMaterial({ color: 0x2a2c30, roughness: 0.6, metalness: 0.4 })));
    const lip = new THREE.Mesh(lipGeo, rimMat); lip.position.z = sg * 0.075; w.add(lip);
    for (let k = 0; k < 5; k++) for (const o of [-0.13, 0.13]) { const sp = new THREE.Mesh(spokeGeo, rimMat); sp.rotation.z = k * Math.PI * 2 / 5 + o; sp.position.z = sg * 0.065; w.add(sp); }
    const hb = new THREE.Mesh(hubGeo, rimMat); hb.position.z = sg * 0.07; w.add(hb);
    pivot.add(w); root.add(pivot);
  }

  /* ---------- interior (seen from the driver's seat; exterior shell hidden) ---------- */
  const interior = new THREE.Group(); interior.name = "interior";
  const dashTop = new THREE.MeshStandardMaterial({ color: 0x2b2d30, roughness: 0.85 });
  const dashLow = new THREE.MeshStandardMaterial({ color: 0x3c3e42, roughness: 0.85 });
  const gloss = new THREE.MeshPhysicalMaterial({ color: 0x0e0f11, roughness: 0.15, clearcoat: 1 });
  const trimGrey = new THREE.MeshStandardMaterial({ color: 0x45484c, roughness: 0.9, side: THREE.DoubleSide });
  const lightTrim = new THREE.MeshStandardMaterial({ color: 0xb9b6ae, roughness: 0.95, side: THREE.DoubleSide });
  const seatDark = new THREE.MeshStandardMaterial({ color: 0x1f2124, roughness: 0.95 });
  const seatLight = new THREE.MeshStandardMaterial({ color: 0x8e9195, roughness: 1 });
  const pillarMat = new THREE.MeshStandardMaterial({ color: 0xa9a59c, roughness: 0.95 });
  const carpet = new THREE.MeshStandardMaterial({ color: 0x1a1b1d, roughness: 1 });
  const ib = (w, h, d, mat, x, y, z) => box(w, h, d, mat, x, y, z, interior);
  const irb = (w, h, d, r, mat, x, y, z) => rbox(w, h, d, r, mat, x, y, z, interior);
  const extrudeProfile = (pts, width, mat) => {
    const sh = new THREE.Shape(pts.map(([x, y]) => new THREE.Vector2(x, y)));
    const g = new THREE.ExtrudeGeometry(sh, { depth: width - 0.08, bevelEnabled: true, bevelThickness: 0.04, bevelSize: 0.02, bevelSegments: 4, curveSegments: 10 });
    g.translate(0, 0, -(width - 0.08) / 2);
    return add(new THREE.Mesh(g, mat), interior);
  };
  // dashboard: dark upper half with a rounded lip, light lower half
  extrudeProfile([[2.52, 0.86], [2.52, 1.035], [2.2, 1.03], [2.06, 1.0], [1.99, 0.95], [1.975, 0.86]], 1.6, dashTop);
  extrudeProfile([[1.975, 0.86], [1.99, 0.72], [2.06, 0.6], [2.25, 0.48], [2.5, 0.46], [2.52, 0.86]], 1.58, dashLow);
  // centre stack: gloss black panel, framed screen, vents, hazard switch, climate knobs
  irb(0.12, 0.38, 0.38, 0.03, gloss, 1.93, 0.76, 0);
  const scr = new THREE.Mesh(new THREE.PlaneGeometry(0.2, 0.115), new THREE.MeshStandardMaterial({ color: 0x0b1424, emissive: 0x16345e, emissiveIntensity: 0.55, roughness: 0.1 }));
  scr.position.set(1.868, 0.8, 0); scr.rotation.y = -Math.PI / 2; interior.add(scr);
  const ring = (w, h, x, y, z) => { const sh = new THREE.Shape(); rr(sh, w, h, 0.012); const hl = new THREE.Path(); rr(hl, w - 0.016, h - 0.016, 0.008); sh.holes.push(hl); const m = new THREE.Mesh(new THREE.ExtrudeGeometry(sh, { depth: 0.012, bevelEnabled: false }), chrome); m.position.set(x, y, z); m.rotation.y = -Math.PI / 2; interior.add(m); return m; };
  ring(0.22, 0.135, 1.875, 0.8, 0);
  for (const z of [-0.075, 0.075]) { ring(0.11, 0.055, 1.885, 0.93, z); const v = ib(0.01, 0.04, 0.095, plastic, 1.89, 0.93, z); v.rotation.x = 0; }
  const hazardBtn = new THREE.Mesh(new THREE.CircleGeometry(0.014, 3), new THREE.MeshStandardMaterial({ color: 0x550000, emissive: 0xff2010, emissiveIntensity: 0.1 }));
  hazardBtn.name = "hazard_button"; hazardBtn.position.set(1.884, 0.93, 0); hazardBtn.rotation.y = -Math.PI / 2; hazardBtn.rotation.z = Math.PI / 2; interior.add(hazardBtn);
  for (const z of [-0.08, 0, 0.08]) {
    const k = new THREE.Mesh(new THREE.CylinderGeometry(0.024, 0.026, 0.03, 24), dashTop); k.rotation.z = Math.PI / 2; k.position.set(1.86, 0.665, z); interior.add(k);
    const kr = new THREE.Mesh(new THREE.TorusGeometry(0.026, 0.004, 6, 24), chrome); kr.rotation.y = Math.PI / 2; kr.position.set(1.848, 0.665, z); interior.add(kr);
  }
  for (const sg of [-1, 1]) { ring(0.1, 0.07, 1.985, 0.93, sg * 0.66); ib(0.01, 0.055, 0.085, plastic, 1.99, 0.93, sg * 0.66); }
  // instrument binnacle and cluster
  const hood = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.17, 0.14, 24, 1, true, -Math.PI / 2, Math.PI), dashTop);
  hood.material = dashTop.clone(); hood.material.side = THREE.DoubleSide;
  hood.rotation.z = Math.PI / 2; hood.scale.set(1, 1, 0.45); hood.position.set(2.0, 0.93, -0.37); interior.add(hood);
  const cl = new THREE.Mesh(new THREE.PlaneGeometry(0.3, 0.112), new THREE.MeshBasicMaterial({ color: 0x050607 }));
  cl.name = "cluster_screen"; cl.position.set(1.97, 0.925, -0.37); cl.rotation.y = -Math.PI / 2; interior.add(cl);
  // bonnet seen through the windscreen
  const hoodM = ib(0.95, 0.04, SPEC.width - 0.34, paint, 2.98, 0.97, 0); hoodM.rotation.z = -0.15;
  for (const [z, len] of wiperParts) { const w = ib(0.02, 0.012, len, black, 2.47, 1.05, z); w.rotation.y = 0.12; }
  // pillars, headliner, doors
  for (const sg of [-1, 1]) {
    const pil = irb(0.84, 0.065, 0.06, 0.025, pillarMat, 2.18, 1.235, sg * (HW - 0.17)); pil.rotation.z = 2.58;
    irb(0.09, 0.44, 0.08, 0.03, lightTrim, 1.09, 1.27, sg * (HW - 0.14));
    irb(2.25, 0.07, 0.12, 0.025, dashTop, 1.3, 1.03, sg * (HW - 0.11));             // window sill
    irb(2.3, 0.66, 0.06, 0.03, trimGrey, 1.3, 0.69, sg * (HW - 0.07));              // door card down to the floor
    irb(0.85, 0.16, 0.035, 0.015, dashTop, 1.55, 0.86, sg * (HW - 0.105));           // dark insert
    irb(0.5, 0.06, 0.1, 0.025, seatDark, 1.42, 0.8, sg * (HW - 0.13));               // arm rest
    irb(0.09, 0.025, 0.02, 0.008, chrome, 1.88, 0.92, sg * (HW - 0.115));            // door handle
    const mh = new THREE.Mesh(new THREE.SphereGeometry(0.1, 18, 12), black); mh.scale.set(0.8, 0.68, 1.3);
    mh.position.set(2.36, belt(2.36) + 0.08, sg * (halfWidth(2.36) * 0.93 + 0.09)); interior.add(mh);
  }
  irb(0.14, 0.09, SPEC.width - 0.32, 0.03, lightTrim, 1.6, 1.46, 0);                  // header
  const headliner = new THREE.Mesh(new THREE.PlaneGeometry(1.2, SPEC.width - 0.3), lightTrim);
  headliner.rotation.x = Math.PI / 2; headliner.position.set(1.0, 1.49, 0); interior.add(headliner);
  irb(0.03, 0.075, 0.25, 0.012, plastic, 1.5, 1.4, 0);                                // rear-view mirror
  // floor, footwells and pedals
  ib(2.6, 0.03, SPEC.width - 0.14, carpet, 1.2, 0.36, 0);
  const fw = ib(0.5, 0.03, SPEC.width - 0.14, carpet, 2.28, 0.46, 0); fw.rotation.z = 0.55;
  for (const [z, w, h] of [[-0.52, 0.07, 0.09], [-0.37, 0.09, 0.07], [-0.22, 0.05, 0.11]]) {
    const pd = ib(0.02, h, w, plastic, 2.05, 0.5, z); pd.rotation.z = 0.35;
  }
  // console, gear lever, passenger seat
  irb(0.9, 0.14, 0.26, 0.04, dashLow, 1.32, 0.52, 0);
  const gr = new THREE.Mesh(new THREE.TorusGeometry(0.05, 0.008, 8, 24), chrome); gr.rotation.x = Math.PI / 2; gr.position.set(1.52, 0.6, 0); interior.add(gr);
  const lever = ib(0.022, 0.18, 0.022, chrome, 1.5, 0.68, 0); lever.rotation.z = 0.2;
  const knob = new THREE.Mesh(new THREE.SphereGeometry(0.036, 18, 14), new THREE.MeshStandardMaterial({ color: 0xb8bcc0, roughness: 0.3, metalness: 0.8 })); knob.position.set(1.48, 0.78, 0); interior.add(knob);
  irb(0.13, 0.6, 0.3, 0.05, seatLight, 0.76, 0.84, 0.37);
  for (const dz of [-0.2, 0.2]) irb(0.16, 0.64, 0.11, 0.045, seatDark, 0.78, 0.84, 0.37 + dz);
  irb(0.1, 0.2, 0.27, 0.06, seatDark, 0.72, 1.3, 0.37);
  // Chevrolet three-spoke steering wheel; the column leans back ~25 degrees
  const wheelG = new THREE.Group(); wheelG.name = "steering_wheel";
  wheelG.add(new THREE.Mesh(new THREE.TorusGeometry(0.19, 0.029, 14, 56), seatDark));
  for (const sx of [-1, 1]) {
    const pad = new THREE.Mesh(new RoundedBoxGeometry(0.1, 0.06, 0.03, 2, 0.012), seatDark); pad.position.set(sx * 0.115, 0.005, 0.005); wheelG.add(pad);
    for (const by of [-0.012, 0.012]) { const b = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.006, 12), chrome); b.rotation.x = Math.PI / 2; b.position.set(sx * 0.1, by, 0.022); wheelG.add(b); }
  }
  const silver = new THREE.MeshStandardMaterial({ color: 0x8c9096, roughness: 0.35, metalness: 0.8 });
  for (const sx of [-1, 1]) { const v = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.15, 0.022), silver); v.position.set(sx * 0.035, -0.11, 0); v.rotation.z = sx * 0.35; wheelG.add(v); }
  const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.085, 0.09, 0.07, 32), seatDark); hub.rotation.x = Math.PI / 2; hub.scale.set(1.15, 1, 0.9); wheelG.add(hub);
  const badge = new THREE.Mesh(new THREE.PlaneGeometry(0.075, 0.038), emblem); badge.position.z = 0.037; wheelG.add(badge);
  const tilt = new THREE.Group(); tilt.position.set(1.62, 0.89, -0.37); tilt.rotation.z = -0.45;
  const yaw = new THREE.Group(); yaw.rotation.y = -Math.PI / 2;
  yaw.add(wheelG); tilt.add(yaw); interior.add(tilt);
  const col = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.06, 0.32, 16), dashTop); col.position.set(1.8, 0.83, -0.37); col.rotation.z = Math.PI / 2 + 0.45; interior.add(col);
  root.add(interior);
  return rigCar(root);
}

// Finds the animated parts of a car model by name. Works for the generated
// model and for any .glb that follows the same naming:
//   body, interior, wheel_pivot_F*, wheel_spin_*, steering_wheel, cluster_screen,
//   hazard_button, ind_L*, ind_R*, lamp_reverse*, materials lamp_head*, lamp_tail
export function rigCar(root) {
  const find = re => { const out = []; root.traverse(o => { if (re.test(o.name)) out.push(o); }); return out; };
  const body = root.getObjectByName("body"), interior = root.getObjectByName("interior");
  const pivots = find(/^wheel_pivot_F/), spins = find(/^wheel_spin_/);
  const steering = root.getObjectByName("steering_wheel");
  const meshesOf = objs => objs.flatMap(o => { const m = []; o.traverse(c => { if (c.isMesh) m.push(c); }); return m; });
  const indL = meshesOf(find(/^ind_L/)), indR = meshesOf(find(/^ind_R/)), rev = meshesOf(find(/^lamp_reverse/));
  const hazard = meshesOf(find(/^hazard_button/));
  const head = new Set(), tail = new Set();
  root.traverse(o => {
    if (!o.isMesh) return;
    for (const m of [].concat(o.material)) {
      if (/^lamp_head/.test(m.name)) head.add(m);
      if (/^lamp_tail/.test(m.name)) tail.add(m);
    }
  });
  // separate materials per lamp so they can switch independently
  for (const m of [...indL, ...indR, ...rev, ...hazard]) m.material = m.material.clone();
  const cluster = clusterCanvas();
  const screen = root.getObjectByName("cluster_screen");
  if (screen) screen.traverse(o => { if (o.isMesh) o.material = new THREE.MeshBasicMaterial({ map: cluster.tex }); });

  const setCockpit = on => { if (interior) interior.visible = on; if (body) body.visible = !on; };
  setCockpit(false);
  const glow = (list, on, hi, lo = 0.06) => list.forEach(m => { m.material.emissiveIntensity = on ? hi : lo; });
  let lastCluster = 0;
  return {
    root, interior, setCockpit,
    update(car, now) {
      for (const p of pivots) p.rotation.y = -car.steer;
      for (const w of spins) w.rotation.z = -car.wheelSpin;
      if (steering) steering.rotation.z = -car.sw * Math.PI / 180;
      const blink = Math.floor(now / 380) % 2 === 0;
      glow(indL, (car.hazard || car.sig === -1) && blink, 3);
      glow(indR, (car.hazard || car.sig === 1) && blink, 3);
      glow(rev, car.gear === "R", 2);
      glow(hazard, car.hazard && blink, 3, 0.15);
      tail.forEach(mt => { mt.emissiveIntensity = car.brake > 0.05 ? 2.6 : car.engineOn ? 0.55 : 0.08; });
      head.forEach(mt => { mt.emissiveIntensity = car.engineOn ? (mt.name === "lamp_head" ? 0.25 : 1.6) : 0.05; });
      if (interior && interior.visible && now - lastCluster > 90) { cluster.draw(car, now); lastCluster = now; }
    }
  };
}
