// Generic version of the car preparation: any car model (glTF/GLB, converted from FBX with
// Blender if needed) -> the simulator's car file, driven by a small config file.
//
//   node tools/prepare-car.mjs tools/cars/<id>.json
//
// Config: { id, src, length, tyre (material regex), forward ("+z" | "-z" | "+x" | "-x"),
//           paint, head, tail (material names), credit, source, license }
// Changes made to every model: re-oriented and scaled to the real length, placed on the rear
// axle, wheels grouped and rigged, steering wheel cut out of the dashboard and rigged, lamp
// materials named for the simulator, indicators added, mesh simplified (not the paint or the
// wheels), textures resized to WebP, compressed.
import { writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import * as THREE from "three";
import { NodeIO, getBounds } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import { dedup, weld, simplifyPrimitive, prune, meshopt, textureCompress } from "@gltf-transform/functions";
import { MeshoptSimplifier, MeshoptEncoder } from "meshoptimizer";
import sharp from "sharp";

import { readFileSync } from "node:fs";
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
if (!process.argv[2]) { console.error("usage: node tools/prepare-car.mjs tools/cars/<id>.json"); process.exit(1); }
const CFG = JSON.parse(readFileSync(process.argv[2], "utf8"));
const SRC = CFG.src.replace(/^~/, process.env.HOME);
const REAL_LENGTH = CFG.length;

await MeshoptSimplifier.ready; await MeshoptEncoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ "meshopt.encoder": MeshoptEncoder });
const doc = await io.read(SRC);
const root = doc.getRoot(), scene = root.listScenes()[0];
const byName = name => root.listNodes().find(n => n.getName() === name);
const M4 = a => new THREE.Matrix4().fromArray(a);
const box = n => { const b = getBounds(n); return { min: new THREE.Vector3(...b.min), max: new THREE.Vector3(...b.max) }; };
const centre = n => { const b = box(n); return b.min.clone().add(b.max).multiplyScalar(0.5); };
await doc.transform(dedup());

/* ---------- placement: rear axle centre on the ground at the origin, +x forward, +z right ---------- */
// source direction of travel and the rotation that turns it to +x
const FWD = { "+z": new THREE.Vector3(0, 0, 1), "-z": new THREE.Vector3(0, 0, -1), "+x": new THREE.Vector3(1, 0, 0), "-x": new THREE.Vector3(-1, 0, 0) }[CFG.forward || "+z"];
const ROT = new THREE.Matrix4().makeRotationY(Math.atan2(-FWD.z, FWD.x) * -1);   // maps FWD to +x
const RIGHT = new THREE.Vector3(0, 0, 1).applyMatrix4(new THREE.Matrix4().copy(ROT).invert());   // source direction that ends up as +z (right)
// some models keep all four wheels in one mesh per material: split those by quadrant
{
  const wre = new RegExp(CFG.wheelParts || "tyre|tire|rim", "i"), sb = getBounds(scene);
  const cx = (sb.min[0] + sb.max[0]) / 2, cz = (sb.min[2] + sb.max[2]) / 2;
  let split = 0;
  const only = CFG.wheelNodes ? new Set(CFG.wheelNodes) : null;       // explicit node names when materials are shared with the body
  for (const n of [...root.listNodes()]) {
    if (!n.getMesh() || (only ? !only.has(n.getName()) : !n.getMesh().listPrimitives().some(p => wre.test(p.getMaterial()?.getName() || "")))) continue;
    const b = getBounds(n), h = b.max[1] - b.min[1];
    if (b.max[0] - b.min[0] < 2.2 * h && b.max[2] - b.min[2] < 2.2 * h) continue;      // already one wheel
    const m = new THREE.Matrix4().fromArray(n.getWorldMatrix());
    const quads = [[], [], [], []].map(() => new Map());
    for (const prim of n.getMesh().listPrimitives()) {
      const pos = prim.getAttribute("POSITION"), idx = prim.getIndices(), cnt = idx ? idx.getCount() : pos.getCount(), t = [], v = new THREE.Vector3();
      const lists = [[], [], [], []];
      for (let i = 0; i < cnt; i += 3) {
        const tri = [0, 1, 2].map(k => idx ? idx.getScalar(i + k) : i + k);
        v.set(0, 0, 0); for (const k of tri) v.add(new THREE.Vector3().fromArray(pos.getElement(k, t)).applyMatrix4(m));
        v.divideScalar(3);
        lists[(v.x > cx ? 1 : 0) + (v.z > cz ? 2 : 0)].push(...tri);
      }
      lists.forEach((l, q) => { if (l.length) quads[q].set(prim, l); });
    }
    const parent = n.listParents().find(p => p.propertyType === "Node" || p.propertyType === "Scene");
    quads.forEach((mp, q) => {
      if (!mp.size) return;
      const mesh = doc.createMesh(n.getName() + "_q" + q);
      for (const [prim, l] of mp) mesh.addPrimitive(subPrimitive(prim, l));
      const nn = doc.createNode(n.getName() + "_q" + q).setMesh(mesh).setMatrix(n.getMatrix()); parent.addChild(nn);
    });
    n.dispose(); split++;
  }
  if (split) console.log("split combined wheel meshes:", split);
}
// the wheels: every tyre, plus every part whose centre lies inside the tyre's box
const tyreRe = new RegExp(CFG.tyre || "tyre|tire", "i");
const tyres = root.listNodes().filter(n => n.getMesh() && n.getMesh().listPrimitives().some(p => tyreRe.test(p.getMaterial()?.getName() || "")));
const tyreBoxes = tyres.map(t => box(t)).map(b => ({ b, c: b.min.clone().add(b.max).multiplyScalar(0.5) }));
// a tyre may be split over several nodes: merge boxes that overlap
const merged = [];
for (const t of tyreBoxes) { const m = merged.find(m => m.c.distanceTo(t.c) < (m.b.max.y - m.b.min.y) * 0.5); if (m) { m.b.min.min(t.b.min); m.b.max.max(t.b.max); m.c = m.b.min.clone().add(m.b.max).multiplyScalar(0.5); } else merged.push({ b: { min: t.b.min.clone(), max: t.b.max.clone() }, c: t.c.clone() }); }
if (merged.length !== 4) { console.error("expected 4 tyres, found", merged.length); process.exit(1); }
const midF = merged.reduce((s, m) => s + m.c.dot(FWD), 0) / 4, midS = merged.reduce((s, m) => s + m.c.dot(RIGHT), 0) / 4;
const scnRoot = scene.listChildren()[0];
const W = {};
const worldOf = n => new THREE.Matrix4().fromArray(n.getWorldMatrix());
for (const m of merged) {
  const tag = (m.c.dot(FWD) > midF ? "F" : "R") + (m.c.dot(RIGHT) > midS ? "R" : "L");
  const group = doc.createNode("Wheel_" + tag); scene.addChild(group);
  const pad = (m.b.max.y - m.b.min.y) * 0.05;
  for (const n of root.listNodes()) {
    if (!n.getMesh()) continue;
    const nb = box(n), nc = nb.min.clone().add(nb.max).multiplyScalar(0.5), sz = nb.max.clone().sub(nb.min);
    const inside = ["x", "y", "z"].every(a => nc[a] > m.b.min[a] - pad && nc[a] < m.b.max[a] + pad);
    if (inside && sz.y <= (m.b.max.y - m.b.min.y) * 1.05) {
      const w = worldOf(n); for (const p of n.listParents()) if (p.propertyType === "Node" || p.propertyType === "Scene") p.removeChild(n);
      group.addChild(n); n.setMatrix(w.toArray());
    }
  }
  W[tag] = group;
}
console.log("wheels:", Object.entries(W).map(([k, g]) => k + ":" + g.listChildren().length).join(" "));
const wc = Object.fromEntries(Object.entries(W).map(([k, n]) => [k, centre(n)]));
const wb = box(W.FR), wheelRadius = (wb.max.y - wb.min.y) / 2;
const full = getBounds(scene);
const fullLen = Math.abs(FWD.x) ? full.max[0] - full.min[0] : full.max[2] - full.min[2];
const scale = REAL_LENGTH / fullLen;
const rearC = wc.RR.clone().add(wc.RL).multiplyScalar(0.5), frontC = wc.FR.clone().add(wc.FL).multiplyScalar(0.5);
const origin = new THREE.Vector3().addScaledVector(FWD, rearC.dot(FWD)).addScaledVector(RIGHT, (rearC.dot(RIGHT) + frontC.dot(RIGHT)) / 2);
origin.y = wb.min.y;
const C = new THREE.Matrix4().makeScale(scale, scale, scale)
  .premultiply(ROT)
  .multiply(new THREE.Matrix4().makeTranslation(-origin.x, -origin.y, -origin.z));

const car = doc.createNode("car"), body = doc.createNode("body"), model = doc.createNode("model");
model.setMatrix(C.toArray());
for (const n of scene.listChildren()) { scene.removeChild(n); model.addChild(n); }
body.addChild(model); car.addChild(body); scene.addChild(car);
const world = n => M4(n.getWorldMatrix());
// move a node under a new parent without moving it in the world
function reparent(node, parent) {
  const w = world(node);
  for (const p of node.listParents()) if (p.propertyType === "Node" || p.propertyType === "Scene") p.removeChild(node);
  parent.addChild(node);
  node.setMatrix(world(parent).invert().multiply(w).toArray());
}
const toCar = v => v.clone().applyMatrix4(C);

/* ---------- wheels: pivot (steer about y) > spin (about z = axle) ---------- */
const piv = {};
for (const [k, n] of Object.entries(W)) {
  const c = toCar(wc[k]);
  const pivot = doc.createNode("wheel_pivot_" + k).setTranslation([c.x, c.y, c.z]);
  const spin = doc.createNode("wheel_spin_" + k);
  pivot.addChild(spin); car.addChild(pivot);
  reparent(n, spin);
  piv[k] = c;
}

/* ---------- steering wheel: cut its triangles out of the dashboard meshes ---------- */
// rough position from a raycast survey of the source; refined below
const wbCar = toCar(frontC).x - toCar(rearC).x;
const sw0 = new THREE.Vector3(CFG.steer ? CFG.steer[0] : wbCar * 0.71, CFG.steer ? CFG.steer[1] : 0.9, CFG.steer ? CFG.steer[2] : -0.38);
let axis = new THREE.Vector3(-0.96, 0.28, 0).normalize();              // towards the driver
const inWheels = new Set(); for (const g of Object.values(W)) g.traverse(n => inWheels.add(n));
const meshNodes = root.listNodes().filter(n => n.getMesh() && !inWheels.has(n));
function triCentroids(n, prim, fn) {
  const m = world(n), pos = prim.getAttribute("POSITION"), idx = prim.getIndices();
  const count = idx ? idx.getCount() : pos.getCount();
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), t = [];
  for (let i = 0; i < count; i += 3) {
    const ia = idx ? idx.getScalar(i) : i, ib = idx ? idx.getScalar(i + 1) : i + 1, ic = idx ? idx.getScalar(i + 2) : i + 2;
    a.fromArray(pos.getElement(ia, t)).applyMatrix4(m); b.fromArray(pos.getElement(ib, t)).applyMatrix4(m); c.fromArray(pos.getElement(ic, t)).applyMatrix4(m);
    fn(i / 3, a.clone().add(b).add(c).divideScalar(3), [ia, ib, ic]);
  }
}
const inWheel = (p, centre, ax) => {
  const d = p.clone().sub(centre), along = d.dot(ax), r = d.addScaledVector(ax, -along).length();
  return r < 0.205 && along > -0.06 && along < 0.14;
};
// refine centre and axis with the rim points (least-spread direction)
for (let pass = 0; pass < 2; pass++) {
  const pts = [];
  for (const n of meshNodes) for (const prim of n.getMesh().listPrimitives())
    triCentroids(n, prim, (_, p) => { if (inWheel(p, sw0, axis)) { const d = p.clone().sub(sw0), along = d.dot(axis); if (d.addScaledVector(axis, -along).length() > 0.13) pts.push(p); } });
  const mean = pts.reduce((s, p) => s.add(p), new THREE.Vector3()).divideScalar(pts.length);
  const cov = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
  for (const p of pts) { const d = [p.x - mean.x, p.y - mean.y, p.z - mean.z]; for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) cov[i][j] += d[i] * d[j]; }
  const inv = new THREE.Matrix3().set(...cov.flat()).invert();
  let ax = axis.clone(); for (let k = 0; k < 50; k++) ax.applyMatrix3(inv).normalize();
  if (ax.x > 0) ax.negate();
  ax.z = 0; ax.normalize();                 // the column lies in the car's centre-line plane
  axis = ax; sw0.copy(mean);
  console.log(`steering rim pass ${pass}: ${pts.length} triangles, centre ${mean.toArray().map(v => v.toFixed(3))}, axis ${axis.toArray().map(v => v.toFixed(2))}`);
}
const steer = doc.createNode("steering_wheel").setTranslation(sw0.toArray());
steer.setRotation(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, -1), axis).toArray());
car.addChild(steer);
let cut = 0;
for (const n of meshNodes) {
  const prims = n.getMesh().listPrimitives();
  const parts = [];
  for (const prim of prims) {
    const keep = [], take = [];
    triCentroids(n, prim, (_, p, tri) => (inWheel(p, sw0, axis) ? take : keep).push(...tri));
    if (!take.length) continue;
    cut += take.length / 3;
    parts.push(subPrimitive(prim, take));
    setIndices(prim, keep);
  }
  if (!parts.length) continue;
  // the cut-out geometry gets its own node under the steering wheel, at the same place in the world
  const mesh = doc.createMesh(n.getName() + "_steer"); parts.forEach(p => mesh.addPrimitive(p));
  const part = doc.createNode(n.getName() + "_steer").setMesh(mesh);
  car.addChild(part); part.setMatrix(world(n).toArray()); reparent(part, steer);
}
console.log("steering wheel triangles:", cut);

/* ---------- doors: everything inside a door's box (outside z0) becomes its own node "door_<side>" ---------- */
// config: "doors": { "lf": { "x": [x0, x1], "y": [y0, y1], "z": z0 }, "rf": ... } in the car frame (+x forward, +z right);
// l = left (z < 0), r = right; the simulator hangs each of these on a hinge at its front edge (see rigCar)
for (const [side, bx] of Object.entries(CFG.doors || {})) {
  const sign = side[0] === "l" ? -1 : 1, holder = doc.createNode("door_" + side); car.addChild(holder);
  let moved = 0;
  for (const n of meshNodes) {
    const parts = [];
    for (const prim of n.getMesh().listPrimitives()) {
      const keep = [], take = [];
      triCentroids(n, prim, (_, p, tri) => ((p.x > bx.x[0] && p.x < bx.x[1] && p.y > bx.y[0] && p.y < bx.y[1] && sign * p.z > bx.z ? take : keep).push(...tri)));
      if (!take.length) continue;
      moved += take.length / 3; parts.push(subPrimitive(prim, take)); setIndices(prim, keep);
    }
    if (!parts.length) continue;
    const mesh = doc.createMesh(n.getName() + "_door_" + side); parts.forEach(q => mesh.addPrimitive(q));
    const part = doc.createNode(n.getName() + "_door_" + side).setMesh(mesh);
    car.addChild(part); part.setMatrix(world(n).toArray()); reparent(part, holder);
  }
  console.log(`door ${side}: ${moved} triangles`);
}
function setIndices(prim, list) {
  const acc = doc.createAccessor().setType("SCALAR").setArray(new Uint32Array(list)).setBuffer(root.listBuffers()[0]);
  prim.setIndices(acc);
}
function subPrimitive(prim, tris) {
  const remap = new Map(), order = [];
  for (const v of tris) if (!remap.has(v)) { remap.set(v, order.length); order.push(v); }
  const out = doc.createPrimitive().setMaterial(prim.getMaterial()).setMode(prim.getMode());
  for (const sem of prim.listSemantics()) {
    const src = prim.getAttribute(sem), size = src.getElementSize(), arr = new (src.getArray().constructor)(order.length * size), t = [];
    order.forEach((v, i) => arr.set(src.getElement(v, t), i * size));
    out.setAttribute(sem, doc.createAccessor().setType(src.getType()).setArray(arr).setNormalized(src.getNormalized()).setBuffer(root.listBuffers()[0]));
  }
  setIndices(out, tris.map(v => remap.get(v)));
  return out;
}

/* ---------- material fixes from the config (models exported for other renderers) ---------- */
// "fix": [[regex, { color: "#rrggbb", metal, rough, keepTex }], ...] applied in order;
// "clearEmissive": true zeroes the emissive colours some exporters fill with ID colours
for (const m of root.listMaterials()) {
  const n = m.getName();
  if (CFG.clearEmissive && !/light|emiss|screen|scren|lp\d|^ip$/i.test(n)) m.setEmissiveFactor([0, 0, 0]);
  for (const [re, f] of CFG.fix || []) {
    if (!new RegExp(re, "i").test(n)) continue;
    if (f.color) { const c = new THREE.Color(f.color); m.setBaseColorFactor([c.r, c.g, c.b, m.getBaseColorFactor()[3]]); }
    if (f.metal !== undefined) m.setMetallicFactor(f.metal);
    if (f.rough !== undefined) m.setRoughnessFactor(f.rough);
    if (f.alpha !== undefined) { const bc = m.getBaseColorFactor(); m.setBaseColorFactor([bc[0], bc[1], bc[2], f.alpha]); m.setAlphaMode("BLEND"); }
    if (f.keepTex === false) m.setBaseColorTexture(null);
    break;
  }
}

/* ---------- materials the simulator drives ---------- */
for (const m of root.listMaterials()) {
  const n = m.getName();
  if (CFG.paint && new RegExp(CFG.paint, "i").test(n)) m.setName("paint");
  else if (CFG.head && new RegExp(CFG.head, "i").test(n)) m.setName("lamp_head_drl").setEmissiveFactor([1, 0.97, 0.92]);
  else if (CFG.tail && new RegExp(CFG.tail, "i").test(n)) m.setName("lamp_tail").setEmissiveFactor([0.9, 0.08, 0.05]);
}
const amber = side => doc.createMaterial("lamp_ind_" + side).setBaseColorFactor([1, 0.55, 0.05, 1]).setEmissiveFactor([1, 0.55, 0.05]);

/* ---------- indicators (amber) at the outer corners of the lamps ---------- */
function sphere(r, material, name, pos) {
  const P = [], N = [], I = [], seg = 10, rings = 6;
  for (let i = 0; i <= rings; i++) for (let j = 0; j <= seg; j++) {
    const th = i / rings * Math.PI, ph = j / seg * Math.PI * 2, n = [Math.sin(th) * Math.cos(ph), Math.cos(th), Math.sin(th) * Math.sin(ph)];
    N.push(...n); P.push(...n.map(v => v * r));
  }
  for (let i = 0; i < rings; i++) for (let j = 0; j < seg; j++) { const a = i * (seg + 1) + j, b = a + seg + 1; I.push(a, b, a + 1, b, b + 1, a + 1); }
  const buf = root.listBuffers()[0], acc = (t, a) => doc.createAccessor().setType(t).setArray(a).setBuffer(buf);
  const prim = doc.createPrimitive().setMaterial(material).setAttribute("POSITION", acc("VEC3", new Float32Array(P))).setAttribute("NORMAL", acc("VEC3", new Float32Array(N))).setIndices(acc("SCALAR", new Uint32Array(I)));
  const node = doc.createNode(name).setMesh(doc.createMesh(name).addPrimitive(prim)).setTranslation(pos);
  car.addChild(node);
}
// bounds are already in the car frame
// only lamp parts at the very front (head) or back (tail) count; the same material may be used inside
const cbL = getBounds(car);
const lampBounds = (name, front) => { const b = new THREE.Box3(); for (const n of root.listNodes()) if (n.getMesh() && n.getMesh().listPrimitives().some(p => p.getMaterial()?.getName() === name)) { const bb = box(n), cx = (bb.min.x + bb.max.x) / 2; if (front ? cx > cbL.max[0] - 0.8 : cx < cbL.min[0] + 0.6) b.union(new THREE.Box3(bb.min, bb.max)); } return b; };
let hb = lampBounds("lamp_head_drl", true), tb = lampBounds("lamp_tail", false);
const cbAll = getBounds(car);
if (hb.isEmpty()) hb = new THREE.Box3(new THREE.Vector3(cbAll.max[0] - 0.4, 0.6, -0.8), new THREE.Vector3(cbAll.max[0] - 0.1, 0.75, 0.8));
if (tb.isEmpty()) tb = new THREE.Box3(new THREE.Vector3(cbAll.min[0] + 0.05, 0.85, -0.75), new THREE.Vector3(cbAll.min[0] + 0.3, 0.95, 0.75));
console.log("lamps", hb.min.toArray().map(v => v.toFixed(2)), hb.max.toArray().map(v => v.toFixed(2)), tb.min.toArray().map(v => v.toFixed(2)), tb.max.toArray().map(v => v.toFixed(2)));
for (const [side, sg] of [["L", -1], ["R", 1]]) {
  sphere(0.03, amber(side), `ind_${side}_front`, [hb.max.x - 0.1, (hb.min.y + hb.max.y) / 2, sg * (Math.max(Math.abs(hb.min.z), Math.abs(hb.max.z)) - 0.06)]);
  sphere(0.03, amber(side), `ind_${side}_rear`, [tb.min.x + 0.05, (tb.min.y + tb.max.y) / 2, sg * (Math.max(Math.abs(tb.min.z), Math.abs(tb.max.z)) - 0.08)]);
}

/* ---------- dimensions for the physics, camera and learner sign ---------- */
const cb = getBounds(car);
const info = {
  length: +(cb.max[0] - cb.min[0]).toFixed(3), width: +(cb.max[2] - cb.min[2]).toFixed(3), height: +(cb.max[1] - cb.min[1]).toFixed(3),
  wheelbase: +(piv.FR.x - piv.RR.x).toFixed(3), track: +Math.abs(piv.FR.z - piv.FL.z).toFixed(3),
  wheelR: +(wheelRadius * scale).toFixed(3), rOh: +(-cb.min[0]).toFixed(3), fOh: +(cb.max[0] - piv.FR.x).toFixed(3),
  steeringWheel: sw0.toArray().map(v => +v.toFixed(3)), roofY: +cb.max[1].toFixed(3)
};
console.log("dimensions:", JSON.stringify(info));
const credit = CFG.credit || CFG.id;
car.setExtras({ dims: info, fullInterior: true, credit });
root.getAsset().extras = { credit, source: CFG.source || "", license: CFG.license || "" };

/* ---------- simplify (not the wheels), shrink textures, compress ---------- */
// the export carries white vertex colours on every mesh: drop them where they are all white
let dropped = 0;
for (const mesh of root.listMeshes()) for (const prim of mesh.listPrimitives()) {
  const col = prim.getAttribute("COLOR_0"); if (!col) continue;
  const a = col.getArray(), max = col.getNormalized() ? (a instanceof Uint8Array ? 255 : 65535) : 1;
  let white = true; for (let i = 0; i < a.length && white; i++) if (a[i] < 0.98 * max) white = false;
  if (white) { prim.setAttribute("COLOR_0", null); dropped++; }
}
console.log("white vertex colours dropped on", dropped, "primitives");
// exact weld only: a tolerance merges vertices across the panel creases and smears their
// normals into dark scratch-like lines on the paint
await doc.transform(weld({ tolerance: 0 }));
const wheelNodes = new Set();
for (const k of Object.keys(W)) byName("wheel_spin_" + k).traverse(n => wheelNodes.add(n));
for (const n of root.listNodes()) {
  if (!n.getMesh() || wheelNodes.has(n)) continue;
  // the painted body is kept as modelled; the rest is simplified with its borders locked
  for (const prim of n.getMesh().listPrimitives()) if (prim.getMaterial()?.getName() !== "paint") simplifyPrimitive(prim, { simplifier: MeshoptSimplifier, ratio: 0.85, error: 0.0005, lockBorder: true });
}
await doc.transform(
  prune(), dedup(),
  textureCompress({ encoder: sharp, targetFormat: "webp", resize: [2048, 2048], quality: 88 }),
  meshopt({ encoder: MeshoptEncoder, level: "high" })
);
const out = join(ROOT, `public/models/${CFG.id}.glb`);
await io.write(out, doc);
writeFileSync(join(ROOT, `src/cars/${CFG.id}-dims.json`), JSON.stringify(info, null, 1) + "\n");
const { statSync } = await import("node:fs");
console.log(`wrote ${out} (${(statSync(out).size / 1024 / 1024).toFixed(1)} MB)`);
