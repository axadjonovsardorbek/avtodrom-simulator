// Uzbek registration plates (520 x 112 mm): region code in its own box, the number in a
// DIN-style condensed face, the flag and "UZ" on the right, two screws, a black plastic
// holder behind. The characters are embossed (bump map). Each plate is laid flush on the
// bumper: rays find the surface and its slope. The text ("01 A 070 BJ") is set in the menu.
import * as THREE from "three";
import { castRays } from "./fastRay.js";

export const DEFAULT_PLATE = "01 A 070 BJ";
const FONT = "'Barlow Condensed', 'Arial Narrow', sans-serif";
const PW = 0.52, PH = 0.112;                 // plate size, m
const CW = 2048, CH = Math.round(CW * PH / PW);
const MM = CW / 520;                         // canvas px per mm

function split(text) {
  const [region = "01", ...rest] = String(text || DEFAULT_PLATE).trim().toUpperCase().split(/\s+/);
  return [region.slice(0, 2), rest.join(" ") || "A 070 BJ"];
}

// fit text into a box: the face is condensed horizontally if it would not fit
function fitText(g, s, cx, cy, maxW, h, weight) {
  g.font = `${weight} ${h}px ${FONT}`;
  const w = g.measureText(s).width, k = Math.min(1, maxW / w);
  g.save(); g.translate(cx, cy); g.scale(k, 1); g.fillText(s, 0, 0); g.restore();
}

// paint the plate; `relief` draws the bump map instead (raised = light)
function drawPlate(g, text, relief) {
  const [region, number] = split(text);
  const ink = relief ? "#fff" : "#151515", ground = relief ? "#5a5a5a" : "#f7f7f2";
  g.clearRect(0, 0, CW, CH);
  const r = 5 * MM, m = 1.2 * MM;
  g.fillStyle = ground; g.beginPath(); g.roundRect(m, m, CW - 2 * m, CH - 2 * m, r); g.fill();
  if (!relief) {                                       // faint retro-reflective sheen
    const sh = g.createLinearGradient(0, 0, CW, CH);
    sh.addColorStop(0, "rgba(255,255,255,0)"); sh.addColorStop(.45, "rgba(255,255,255,.35)"); sh.addColorStop(.55, "rgba(230,236,240,.2)"); sh.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = sh; g.fill();
  }
  // pressed border and the region divider
  g.strokeStyle = ink; g.lineWidth = 2.2 * MM;
  g.beginPath(); g.roundRect(3 * MM, 3 * MM, CW - 6 * MM, CH - 6 * MM, 4 * MM); g.stroke();
  const div = 98 * MM;
  g.lineWidth = 2 * MM; g.beginPath(); g.moveTo(div, 3 * MM); g.lineTo(div, CH - 3 * MM); g.stroke();
  // characters: region and number in the same face
  g.fillStyle = ink; g.textAlign = "center"; g.textBaseline = "alphabetic";
  // bold, filling the plate height like the real ones
  const base = CH / 2 + 35 * MM, hgt = 100 * MM;
  fitText(g, region, (8 * MM + div) / 2 + 4 * MM, base, 76 * MM, hgt, 700);
  fitText(g, number.replace(/ /g, "\u2009"), div + 174 * MM, base, 330 * MM, hgt, 700);
  // flag (blue / red / white / red / green) with crescent, and "UZ"
  const fx = 452 * MM, fy = 14 * MM, fw = 44 * MM, s = 8 * MM, rl = 1 * MM;
  if (!relief) {
    g.fillStyle = "#0099b5"; g.fillRect(fx, fy, fw, s);
    g.fillStyle = "#ce1126"; g.fillRect(fx, fy + s, fw, rl);
    g.fillStyle = "#ffffff"; g.fillRect(fx, fy + s + rl, fw, s);
    g.fillStyle = "#ce1126"; g.fillRect(fx, fy + 2 * s + rl, fw, rl);
    g.fillStyle = "#1eb53a"; g.fillRect(fx, fy + 2 * s + 2 * rl, fw, s);
    g.fillStyle = "#fff"; g.beginPath(); g.arc(fx + 6 * MM, fy + s / 2, 3 * MM, 0, Math.PI * 2); g.fill();
    g.fillStyle = "#0099b5"; g.beginPath(); g.arc(fx + 7.3 * MM, fy + s / 2, 2.7 * MM, 0, Math.PI * 2); g.fill();
    g.strokeStyle = "rgba(0,0,0,.35)"; g.lineWidth = .5 * MM; g.strokeRect(fx, fy, fw, 3 * s + 2 * rl);
  }
  g.fillStyle = relief ? ink : "#0f8fb0";
  fitText(g, "UZ", fx + fw / 2, CH - 16 * MM, fw, 46 * MM, 700);
  // screw heads
  for (const x of [9 * MM, CW - 9 * MM]) {
    const gr = g.createRadialGradient(x - MM, CH / 2 - MM, 0, x, CH / 2, 3.4 * MM);
    gr.addColorStop(0, relief ? "#fff" : "#e8eaec"); gr.addColorStop(1, relief ? "#999" : "#7d8186");
    g.fillStyle = gr; g.beginPath(); g.arc(x, CH / 2, 3.4 * MM, 0, Math.PI * 2); g.fill();
  }
}

export function plateMaterial(text) {
  const mk = () => { const c = document.createElement("canvas"); c.width = CW; c.height = CH; return c; };
  const c = mk(), b = mk();
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 8;
  const bump = new THREE.CanvasTexture(b); bump.anisotropy = 8;
  const mat = new THREE.MeshPhysicalMaterial({ map: tex, bumpMap: bump, bumpScale: 1.6, roughness: 0.35, metalness: 0.05, clearcoat: 0.5, clearcoatRoughness: 0.2, alphaTest: 0.5 });
  mat.userData.setText = t => {
    mat.userData.text = t;
    drawPlate(c.getContext("2d"), t, false); drawPlate(b.getContext("2d"), t, true);
    tex.needsUpdate = bump.needsUpdate = true;
  };
  mat.userData.setText(text);
  // redraw once the plate font has arrived
  if (document.fonts && document.fonts.load) document.fonts.load(`600 100px ${FONT}`).then(() => mat.userData.setText(mat.userData.text)).catch(() => {});
  return mat;
}

const holderMat = new THREE.MeshStandardMaterial({ color: 0x111214, roughness: 0.55 });
// plate + holder, facing +x of its own group
export function makePlate(mat) {
  const g = new THREE.Group(); g.name = "plate";
  const face = new THREE.Mesh(new THREE.PlaneGeometry(PW, PH), mat);
  face.rotation.y = Math.PI / 2; face.position.x = 0.008; face.name = "plate";
  // thin backing only: the plate is screwed straight to the body, no thick frame
  const holder = new THREE.Mesh(new THREE.BoxGeometry(0.006, PH + 0.004, PW + 0.004), holderMat);
  holder.position.x = 0.003; holder.name = "plate";
  g.add(holder, face);
  return g;
}

// Lay a plate flush on the body around the approximate point `pos` (car frame).
function settle(car, meshes, pos, back) {
  const dir = new THREE.Vector3(back ? 1 : -1, 0, 0);
  const toCar = new THREE.Matrix4().copy(car.matrixWorld).invert(), wdir = dir.clone().transformDirection(car.matrixWorld);
  const pts = [], normals = [];
  const rays = [[0, 0], [0.035, -0.2], [0.035, 0.2], [-0.035, -0.2], [-0.035, 0.2]].map(([dy, dz]) => ({ origin: new THREE.Vector3(pos[0] - dir.x * 1.2, pos[1] + dy, pos[2] + dz).applyMatrix4(car.matrixWorld), dir: wdir }));
  for (const h of castRays(meshes, rays)) {
    if (!h || h.point.distanceTo(rays[0].origin) > 2.4) continue;
    pts.push(h.point.clone().applyMatrix4(toCar));
    normals.push(h.normal.clone().transformDirection(toCar));
  }
  if (!pts.length) return { p: new THREE.Vector3(...pos), n: new THREE.Vector3(back ? -1 : 1, 0, 0) };
  // the outermost hit is the bumper face (grille bars and recesses sit behind it)
  const out = back ? Math.min(...pts.map(p => p.x)) : Math.max(...pts.map(p => p.x));
  const p = new THREE.Vector3(out, pos[1], pos[2]);
  // slope: average of the normals that face outwards, kept within ~20 degrees of upright
  const n = normals.filter(v => v.x * (back ? -1 : 1) > 0.5).reduce((s, v) => s.add(v), new THREE.Vector3());
  if (n.lengthSq() < 1e-6) n.set(back ? -1 : 1, 0, 0);
  n.z = 0; n.normalize();
  const maxTilt = 0.35;
  if (Math.abs(n.y) > Math.sin(maxTilt)) { n.y = Math.sign(n.y) * Math.sin(maxTilt); n.x = Math.sign(n.x) * Math.cos(maxTilt); }
  return { p, n };
}

// Adds plates to a loaded car. `spots` = [{ pos, back }] in the car frame; when omitted the
// model's own plate meshes (mesh or material names containing "plate") are hidden and replaced in place.
export function addPlates(cv, text, spots) {
  const root = cv.root, car = root.name === "car" ? root : root.getObjectByName("car") || root;
  const mat = plateMaterial(text || DEFAULT_PLATE);
  root.updateMatrixWorld(true);
  const inv = car.matrixWorld.clone().invert();
  if (!spots) {
    spots = [];
    root.traverse(o => {
      if (!o.isMesh || o.name === "plate" || !(/(?<!tem)plate/i.test(o.name) || [].concat(o.material).some(m => /(?<!tem)plate/i.test(m.name)))) return;
      // one mesh may hold both plates: split its vertices into a front and a rear cluster
      const m = inv.clone().multiply(o.matrixWorld), pos = o.geometry.attributes.position, v = new THREE.Vector3();
      const front = new THREE.Box3(), rear = new THREE.Box3();
      for (let i = 0; i < pos.count; i++) { v.fromBufferAttribute(pos, i).applyMatrix4(m); (v.x > 1.4 ? front : rear).expandByPoint(v); }
      o.visible = false;
      for (const [b, back] of [[front, false], [rear, true]]) {
        if (b.isEmpty()) continue;
        const c = b.getCenter(new THREE.Vector3());
        spots.push({ pos: [c.x, c.y, c.z], back });
      }
    });
  }
  // no plate meshes in the model: put them on the bumpers by the car's dimensions (settle() finds the surface)
  if (!spots.length) {
    const d = car.userData.dims;
    if (d) spots = [{ pos: [d.wheelbase + d.fOh - 0.05, 0.5, 0], back: false }, { pos: [-d.rOh + 0.05, 0.5, 0], back: true }];
  }
  // the body surface the plates sit on (no glass, no wheels)
  const meshes = [];
  root.traverse(o => {
    if (!o.isMesh || o.name === "plate" || o.name === "shadow_proxy" || /glass/i.test([].concat(o.material)[0]?.name || "")) return;
    for (let p = o.parent; p; p = p.parent) if (/^wheel_/.test(p.name)) return;
    meshes.push(o);
  });
  for (const s of spots) {
    const { p, n } = settle(car, meshes, s.pos, s.back);
    const plate = makePlate(mat);
    // face along n: turn round for the rear plate, then tilt with the bumper (stays upright, never upside down)
    plate.rotation.set(0, n.x < 0 ? Math.PI : 0, Math.asin(THREE.MathUtils.clamp(n.y, -1, 1)), "YZX");
    plate.position.copy(p).addScaledVector(n, 0.001);
    car.add(plate);
  }
  cv.setPlate = t => mat.userData.setText(t || DEFAULT_PLATE);
}
