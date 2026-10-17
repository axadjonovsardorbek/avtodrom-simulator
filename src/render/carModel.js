// Procedural Chevrolet Cobalt (the usual exam car), white, with a learner sign.
// Local frame: origin at the rear axle on the ground, +x forward, +z right, +y up.
import * as THREE from "three";
import { SPEC } from "../sim/vehicle.js";
import { signTexture } from "./textures.js";
import { buildBodyGeometries, seamGeometry, tyreGeometry, sidePatch, capPatch, belt, roof, sideZ, halfWidth, DIM } from "./cobaltBody.js";

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
    // tachometer
    const cx = 150, cy = 100, R = 84, a0 = Math.PI * 0.75, a1 = Math.PI * 2.25;
    g.strokeStyle = "#4fb6ff"; g.lineWidth = 3; g.beginPath(); g.arc(cx, cy, R, a0, a1); g.stroke();
    g.fillStyle = "#cfe8ff"; g.font = "bold 18px Arial"; g.textAlign = "center"; g.textBaseline = "middle";
    for (let i = 0; i <= 7; i++) {
      const a = a0 + (a1 - a0) * i / 7;
      g.strokeStyle = i >= 6 ? "#ff3b2f" : "#e8f4ff"; g.lineWidth = 3;
      g.beginPath(); g.moveTo(cx + Math.cos(a) * (R - 4), cy + Math.sin(a) * (R - 4)); g.lineTo(cx + Math.cos(a) * (R - 16), cy + Math.sin(a) * (R - 16)); g.stroke();
      g.fillText(String(i), cx + Math.cos(a) * (R - 32), cy + Math.sin(a) * (R - 32));
    }
    const na = a0 + (a1 - a0) * Math.min(car.rpm, 7000) / 7000;
    g.strokeStyle = "#ff2a1a"; g.lineWidth = 5; g.lineCap = "round";
    g.beginPath(); g.moveTo(cx - Math.cos(na) * 10, cy - Math.sin(na) * 10); g.lineTo(cx + Math.cos(na) * (R - 10), cy + Math.sin(na) * (R - 10)); g.stroke();
    g.fillStyle = "#222"; g.beginPath(); g.arc(cx, cy, 9, 0, 7); g.fill();
    // blue LCD: speed + gear
    const lx = 268, ly = 40;
    g.fillStyle = "#0b2a6e"; g.fillRect(lx, ly, 200, 112);
    g.fillStyle = "#9fd2ff"; g.textAlign = "right"; g.font = "bold 62px Arial";
    g.fillText(String(Math.round(car.kmh)), lx + 140, ly + 52);
    g.font = "bold 16px Arial"; g.fillText("km/h", lx + 192, ly + 66);
    g.textAlign = "left"; g.font = "bold 22px Arial";
    const gear = car.transmission === "manual" ? String(car.gear) : car.gear;
    g.fillText(gear, lx + 10, ly + 96);
    g.font = "14px Arial"; g.fillText(`${(car.odo / 1000).toFixed(1)} km`, lx + 110, ly + 98);
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
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);

  const paint = new THREE.MeshPhysicalMaterial({ color: 0xf4f5f3, roughness: 0.28, metalness: 0.15, clearcoat: 1, clearcoatRoughness: 0.12 });
  const black = new THREE.MeshStandardMaterial({ color: 0x15171a, roughness: 0.55 });
  const plastic = new THREE.MeshStandardMaterial({ color: 0x1d1f22, roughness: 0.85 });
  const glass = new THREE.MeshPhysicalMaterial({ color: 0x0f151c, roughness: 0.03, metalness: 0.3, transparent: true, opacity: 0.82, side: THREE.DoubleSide, depthWrite: false, clearcoat: 1 });
  const chrome = new THREE.MeshStandardMaterial({ color: 0xdfe3e6, roughness: 0.12, metalness: 1 });
  const add = (m, parent = body) => { m.castShadow = true; m.receiveShadow = true; parent.add(m); return m; };
  const box = (w, h, d, mat, x, y, z, parent = body) => { const m = add(new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat), parent); m.position.set(x, y, z); return m; };

  // lofted shell: lower body, greenhouse with its glass, flat end caps
  const lampMat = (color, base = 0.12, extra = {}) => new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: base, roughness: 0.2, ...extra });
  const headMat = new THREE.MeshPhysicalMaterial({ color: 0x2a2f36, emissive: 0xfff3d6, emissiveIntensity: 0.05, roughness: 0.08, metalness: 0.6, clearcoat: 1 });
  const tailMat = lampMat(0xb3120b, 0.12, { roughness: 0.15 });
  const geo = buildBodyGeometries();
  add(new THREE.Mesh(geo.lower, [paint, headMat, tailMat, plastic]));
  const gh = add(new THREE.Mesh(geo.green, [paint, paint, paint, black, glass]));
  gh.castShadow = true;
  add(new THREE.Mesh(geo.capFront, paint));
  add(new THREE.Mesh(geo.capRear, paint));
  // lamp lenses hugging the body: headlamps sweep back along the bonnet edge, tail lamps wrap the corners
  const st = t => { t = Math.min(1, Math.max(0, t)); return t * t * (3 - 2 * t); };
  const zF = y => sideZ(DIM.front, y) - 0.004, zR = y => sideZ(DIM.rear, y) - 0.004;
  for (const sg of [-1, 1]) {
    add(new THREE.Mesh(sidePatch(2.96, DIM.front - 0.003, x => belt(x) - 0.052 - 0.13 * st((x - 2.96) / 0.42), x => belt(x), sg), headMat));
    add(new THREE.Mesh(sidePatch(DIM.rear + 0.003, -0.74, x => 0.8 + 0.12 * st((x + 0.84) / 0.1), x => belt(x), sg), tailMat));
    add(new THREE.Mesh(capPatch(DIM.front + 0.002, [[0.27, 0.69], [zF(0.69), 0.69], [zF(0.752), 0.752], [0.3, 0.752]].map(([z, y]) => [sg * z, y]), 1), headMat));
    add(new THREE.Mesh(capPatch(DIM.rear - 0.002, [[0.47, 0.8], [zR(0.8), 0.8], [zR(0.92), 0.92], [0.47, 0.92]].map(([z, y]) => [sg * z, y]), -1), tailMat));
  }
  // wipers, exhaust, rear reflectors, upper grille slot
  const wiperParts = [[-0.3, 0.56], [0.24, 0.5]];
  for (const [z, len] of wiperParts) { const w = box(0.02, 0.012, len, black, 2.52, 1.03, z); w.rotation.y = 0.12; }
  const ex = new THREE.Mesh(new THREE.CylinderGeometry(0.032, 0.032, 0.16, 14), chrome);
  ex.rotation.z = Math.PI / 2; ex.position.set(DIM.rear + 0.02, 0.31, -0.45); add(ex);
  // underbody and wheel-arch liners so the open shell never shows through
  box(4.2, 0.02, SPEC.width - 0.12, plastic, 1.23, 0.35, 0);
  for (const wc of [0, DIM.wb]) {
    const liner = new THREE.Mesh(new THREE.CylinderGeometry(DIM.archR - 0.01, DIM.archR - 0.01, SPEC.width - 0.1, 24, 1, true, Math.PI / 2, Math.PI), new THREE.MeshStandardMaterial({ color: 0x0c0d0f, roughness: 1, side: THREE.DoubleSide }));
    liner.rotation.x = Math.PI / 2; liner.position.set(wc, 0.3, 0); body.add(liner);
  }
  // door shut lines, handles, mirrors
  const seamMat = new THREE.MeshBasicMaterial({ color: 0x3a3d42 });
  for (const sg of [-1, 1]) {
    for (const x of [2.42, 1.09, 0.2]) body.add(new THREE.Mesh(seamGeometry(x, sg, Math.max(0.42, 0.35), belt(x) - 0.06), seamMat));
    for (const x of [1.62, 0.55]) {
      const y = belt(x) - 0.11;
      box(0.13, 0.028, 0.03, paint, x, y, sg * (sideZ(x, y) + 0.01));
    }
    const mx = 2.43, my = belt(mx) + 0.075, mz = sg * (halfWidth(mx) * 0.93 + 0.08);
    const mir = new THREE.Mesh(new THREE.SphereGeometry(0.1, 18, 12), black);
    mir.scale.set(0.75, 0.62, 1.25); mir.position.set(mx, my, mz); add(mir);
    box(0.1, 0.03, 0.09, black, mx + 0.02, my - 0.04, sg * (halfWidth(mx) * 0.93 + 0.01));
  }

  // front fascia (flat cap at x = DIM.front)
  const F = DIM.front;
  const emblem = new THREE.MeshStandardMaterial({ map: emblemTex(), transparent: true, roughness: 0.3, metalness: 0.6 });
  const slot = new THREE.Mesh(new THREE.PlaneGeometry(0.56, 0.075), black); slot.position.set(F + 0.003, 0.735, 0); slot.rotation.y = Math.PI / 2; body.add(slot);
  box(0.02, 0.03, 0.56, chrome, F + 0.006, 0.735, 0);                               // upper grille bar
  const gtex = grilleTex();
  const lg = new THREE.Mesh(new THREE.PlaneGeometry(0.86, 0.2), new THREE.MeshStandardMaterial({ map: gtex, roughness: 0.7 }));
  lg.position.set(F + 0.004, 0.56, 0); lg.rotation.y = Math.PI / 2; body.add(lg);
  box(0.012, 0.012, 0.86, chrome, F + 0.006, 0.665, 0);
  const fe = new THREE.Mesh(new THREE.PlaneGeometry(0.17, 0.085), emblem); fe.position.set(F + 0.018, 0.735, 0); fe.rotation.y = Math.PI / 2; body.add(fe);
  const plateMat = new THREE.MeshStandardMaterial({ map: plateTex(), roughness: 0.5 });
  const fp = new THREE.Mesh(new THREE.PlaneGeometry(0.52, 0.112), plateMat); fp.position.set(F + 0.012, 0.5, 0); fp.rotation.y = Math.PI / 2; body.add(fp);

  // lamps (emissive, animated)
  const head = [headMat], tail = [tailMat], rev = [], indL = [], indR = [];
  for (const sg of [-1, 1]) {
    for (const z of [0.35, 0.44]) {                                               // projector lenses
      const lens = new THREE.Mesh(new THREE.CircleGeometry(0.026, 20), lampMat(0xfff8e6, 0.1));
      lens.position.set(F + 0.006, 0.72, sg * z); lens.rotation.y = Math.PI / 2; body.add(lens); head.push(lens.material);
    }
    box(0.01, 0.025, 0.09, lampMat(0x8a0a06, 0.15), DIM.rear - 0.004, 0.48, sg * 0.62);
    const ind = box(0.05, 0.035, 0.09, lampMat(0xffa21a, 0.05), F - 0.17, 0.725, sg * (halfWidth(F - 0.17) * 0.95 + 0.002)); ind.rotation.y = sg * 0.7;
    (sg < 0 ? indL : indR).push(ind);
    const fog = new THREE.Mesh(new THREE.TorusGeometry(0.05, 0.012, 8, 24), chrome); fog.position.set(F + 0.004, 0.47, sg * 0.5); fog.rotation.y = Math.PI / 2; body.add(fog);
    const r = new THREE.Mesh(new THREE.PlaneGeometry(0.08, 0.04), lampMat(0xffffff, 0.02)); r.position.set(DIM.rear - 0.007, 0.83, sg * 0.53); r.rotation.y = -Math.PI / 2; body.add(r); rev.push(r);
    const ri = box(0.03, 0.05, 0.12, lampMat(0xffa21a, 0.05), DIM.rear + 0.17, 0.83, sg * (halfWidth(DIM.rear + 0.17) * 0.96 + 0.003)); (sg < 0 ? indL : indR).push(ri);
  }
  const R0 = DIM.rear;
  box(0.012, 0.04, 0.7, chrome, R0 - 0.004, 0.93, 0);                             // trunk chrome strip
  const re = new THREE.Mesh(new THREE.PlaneGeometry(0.15, 0.075), emblem); re.position.set(R0 - 0.012, 0.93, 0); re.rotation.y = -Math.PI / 2; body.add(re);
  const rp = new THREE.Mesh(new THREE.PlaneGeometry(0.52, 0.112), plateMat); rp.position.set(R0 - 0.008, 0.66, 0); rp.rotation.y = -Math.PI / 2; body.add(rp);
  const ant = box(0.01, 0.3, 0.01, black, 0.42, roof(0.42) + 0.14, 0); ant.rotation.z = 0.55;

  // learner sign on the roof
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(0.4, 0.4), new THREE.MeshStandardMaterial({ map: signTexture("learner"), transparent: true, side: THREE.DoubleSide, roughness: 0.6 }));
  sign.position.set(1.3, roof(1.3) + 0.25, 0); sign.rotation.y = Math.PI / 2; body.add(sign);
  box(0.1, 0.05, 0.3, black, 1.3, roof(1.3) + 0.03, 0);

  // wheels: rounded tyres, black five double-spoke alloys
  const tireGeo = tyreGeometry();
  const rimGeo = new THREE.CylinderGeometry(0.205, 0.205, 0.16, 28); rimGeo.rotateX(Math.PI / 2);
  const rimMat = new THREE.MeshStandardMaterial({ color: 0x1f2124, roughness: 0.3, metalness: 0.8 });
  const spokeGeo = new THREE.BoxGeometry(0.19, 0.03, 0.05); spokeGeo.translate(0.1, 0, 0);
  const hubGeo = new THREE.CylinderGeometry(0.045, 0.045, 0.06, 16); hubGeo.rotateX(Math.PI / 2);
  const tyreMat = new THREE.MeshStandardMaterial({ color: 0x18191b, roughness: 0.92 });
  const wheels = [], pivots = [];
  for (const [x, isFront] of [[0, false], [SPEC.wb, true]]) for (const sg of [-1, 1]) {
    const pivot = new THREE.Group(); pivot.position.set(x, SPEC.wheelR, sg * (SPEC.track / 2 + 0.02));
    const w = new THREE.Group();
    add(new THREE.Mesh(tireGeo, tyreMat), w);
    w.add(new THREE.Mesh(rimGeo, new THREE.MeshStandardMaterial({ color: 0x0c0d0f, roughness: 0.6 })));
    for (let k = 0; k < 5; k++) for (const off of [-0.11, 0.11]) {
      const sp = new THREE.Mesh(spokeGeo, rimMat); sp.rotation.z = k * Math.PI * 2 / 5 + off; sp.position.z = sg * 0.06; w.add(sp);
    }
    const hb = new THREE.Mesh(hubGeo, rimMat); hb.position.z = sg * 0.07; w.add(hb);
    pivot.add(w); root.add(pivot);
    wheels.push(w); if (isFront) pivots.push(pivot);
  }

  /* ---------- interior (shown from the driver's seat; exterior shell hidden) ---------- */
  const interior = new THREE.Group();
  const dashTop = new THREE.MeshStandardMaterial({ color: 0x2b2d31, roughness: 0.9 });
  const dashLow = new THREE.MeshStandardMaterial({ color: 0xc8c3b9, roughness: 0.85 });
  const trimGrey = new THREE.MeshStandardMaterial({ color: 0xb8b3a9, roughness: 0.95, side: THREE.DoubleSide });
  const seatDark = new THREE.MeshStandardMaterial({ color: 0x26282c, roughness: 0.9 });
  const ib = (w, h, d, mat, x, y, z) => box(w, h, d, mat, x, y, z, interior);
  ib(0.62, 0.13, SPEC.width - 0.14, dashTop, 2.26, 0.925, 0);                  // upper dash
  ib(0.42, 0.3, SPEC.width - 0.14, dashLow, 2.12, 0.71, 0);                   // lower dash (light)
  ib(0.14, 0.34, 0.36, dashTop, 1.93, 0.72, 0);                               // centre stack
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(0.22, 0.12), new THREE.MeshStandardMaterial({ color: 0x0c1220, emissive: 0x13305a, emissiveIntensity: 0.6, roughness: 0.2 }));
  screen.position.set(1.858, 0.78, 0); screen.rotation.y = -Math.PI / 2; interior.add(screen);
  const hazardBtn = new THREE.Mesh(new THREE.CircleGeometry(0.014, 3), new THREE.MeshStandardMaterial({ color: 0x550000, emissive: 0xff2010, emissiveIntensity: 0.1 }));
  hazardBtn.position.set(1.858, 0.875, 0); hazardBtn.rotation.y = -Math.PI / 2; hazardBtn.rotation.z = Math.PI / 2; interior.add(hazardBtn);
  for (const z of [-0.07, 0.07]) {                                             // centre vents
    ib(0.02, 0.05, 0.11, chrome, 1.87, 0.92, z);
    ib(0.021, 0.035, 0.095, plastic, 1.871, 0.92, z);
  }
  for (const sg of [-1, 1]) {                                                  // side vents
    const v = new THREE.Mesh(new THREE.TorusGeometry(0.045, 0.008, 8, 20), chrome); v.position.set(1.96, 0.9, sg * 0.72); v.rotation.y = Math.PI / 2; interior.add(v);
  }
  for (const [z, len] of wiperParts) { const w = ib(0.02, 0.012, len, black, 2.52, 1.03, z); w.rotation.y = 0.12; }
  // instrument binnacle + cluster
  ib(0.2, 0.05, 0.4, dashTop, 1.98, 1.0, -0.37);
  const cluster = clusterCanvas();
  const cl = new THREE.Mesh(new THREE.PlaneGeometry(0.3, 0.112), new THREE.MeshBasicMaterial({ map: cluster.tex }));
  cl.position.set(1.925, 0.915, -0.37); cl.rotation.y = -Math.PI / 2; cl.rotation.x = 0; interior.add(cl);
  // hood seen through the windscreen
  const hoodM = ib(0.9, 0.04, SPEC.width - 0.3, paint, 3.0, 0.93, 0); hoodM.rotation.z = -0.13;
  // pillars, headliner, doors
  for (const sg of [-1, 1]) {
    const pil = ib(0.78, 0.08, 0.07, trimGrey, 2.235, 1.22, sg * (HW - 0.16)); pil.rotation.z = 2.526;
    ib(0.08, 0.42, 0.07, trimGrey, 1.09, 1.24, sg * (HW - 0.14));
    ib(2.2, 0.05, 0.12, dashTop, 1.3, 1.02, sg * (HW - 0.1));                   // window sill
    ib(2.2, 0.5, 0.04, trimGrey, 1.3, 0.75, sg * (HW - 0.06));                  // door card
    ib(0.5, 0.05, 0.08, seatDark, 1.45, 0.85, sg * (HW - 0.12));                // arm rest
    const mh = new THREE.Mesh(new THREE.SphereGeometry(0.1, 18, 12), black); mh.scale.set(0.75, 0.62, 1.25); mh.position.set(2.43, belt(2.43) + 0.075, sg * (halfWidth(2.43) * 0.93 + 0.08)); interior.add(mh);
  }
  ib(0.12, 0.08, SPEC.width - 0.3, trimGrey, 1.9, 1.43, 0);                     // header
  const headliner = new THREE.Mesh(new THREE.PlaneGeometry(1.15, SPEC.width - 0.3), trimGrey);
  headliner.rotation.x = Math.PI / 2; headliner.position.set(1.2, 1.47, 0); interior.add(headliner);
  ib(0.03, 0.08, 0.26, plastic, 1.72, 1.38, 0);                                // rear-view mirror
  // centre console, gear lever, passenger seat
  ib(0.85, 0.12, 0.26, dashLow, 1.3, 0.52, 0);
  const lever = ib(0.025, 0.2, 0.025, chrome, 1.52, 0.66, 0); lever.rotation.z = 0.25;
  const knob = new THREE.Mesh(new THREE.SphereGeometry(0.035, 16, 12), seatDark); knob.position.set(1.49, 0.77, 0); interior.add(knob);
  ib(0.14, 0.62, 0.5, seatDark, 0.75, 0.82, 0.37);
  ib(0.1, 0.62, 0.08, dashLow, 0.76, 0.82, 0.14);
  ib(0.1, 0.62, 0.08, dashLow, 0.76, 0.82, 0.6);
  ib(0.1, 0.18, 0.26, seatDark, 0.72, 1.3, 0.37);
  // Chevrolet-style steering wheel, column leaning back ~25 degrees
  const wheelG = new THREE.Group();
  wheelG.add(new THREE.Mesh(new THREE.TorusGeometry(0.188, 0.026, 12, 48), seatDark));
  for (const [a, len] of [[0, 0.17], [Math.PI, 0.17]]) {
    const sp = new THREE.Mesh(new THREE.BoxGeometry(len, 0.06, 0.03), seatDark);
    sp.position.set(Math.cos(a) * 0.1, -0.01, 0); wheelG.add(sp);
  }
  const lowSp = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.16, 0.03), new THREE.MeshStandardMaterial({ color: 0x4a4d52, roughness: 0.4, metalness: 0.6 }));
  lowSp.position.set(0, -0.1, 0); wheelG.add(lowSp);
  const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.075, 0.06, 24), seatDark); hub.rotation.x = Math.PI / 2; wheelG.add(hub);
  const badge = new THREE.Mesh(new THREE.PlaneGeometry(0.07, 0.035), emblem); badge.position.z = 0.032; wheelG.add(badge);
  const tilt = new THREE.Group(); tilt.position.set(1.62, 0.89, -0.37); tilt.rotation.z = -0.45;
  const yaw = new THREE.Group(); yaw.rotation.y = -Math.PI / 2;
  yaw.add(wheelG); tilt.add(yaw); interior.add(tilt);
  interior.visible = false;
  root.add(interior);

  const setCockpit = on => { interior.visible = on; body.visible = !on; };
  const setLamp = (m, on, hi = 2.2, lo = 0.06) => { m.material.emissiveIntensity = on ? hi : lo; };
  let lastCluster = 0;

  return {
    root, interior, setCockpit,
    update(car, now) {
      for (const p of pivots) p.rotation.y = -car.steer;
      for (const w of wheels) w.rotation.z = -car.wheelSpin;
      wheelG.rotation.z = -car.sw * Math.PI / 180;
      const blink = Math.floor(now / 380) % 2 === 0;
      const left = car.hazard || car.sig === -1, right = car.hazard || car.sig === 1;
      indL.forEach(m => setLamp(m, left && blink, 3));
      indR.forEach(m => setLamp(m, right && blink, 3));
      tail.forEach(mt => { mt.emissiveIntensity = car.brake > 0.05 ? 2.6 : car.engineOn ? 0.55 : 0.08; });
      rev.forEach(m => setLamp(m, car.gear === "R", 2));
      head.forEach(mt => { mt.emissiveIntensity = car.engineOn ? (mt === headMat ? 0.25 : 1.6) : 0.05; });
      setLamp(hazardBtn, car.hazard && blink, 3, 0.15);
      if (interior.visible && now - lastCluster > 90) { cluster.draw(car, now); lastCluster = now; }
    }
  };
}
