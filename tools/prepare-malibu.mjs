// Turns the downloaded Sketchfab Malibu into the simulator's car file.
//
//   node tools/prepare-malibu.mjs ~/Downloads/2019_chevrolet_malibu_ls_sedan.glb
//
// Source: "2019 Chevrolet Malibu LS Sedan" by Ddiaz Design, CC BY-NC-SA 4.0,
// https://sketchfab.com/3d-models/2019-chevrolet-malibu-ls-sedan-c689df3e4b6a4df1b0b409309d00a728
// Changes: re-oriented and placed on the rear axle, wheels and steering wheel cut out
// and rigged, lamp materials renamed for the simulator, indicators added, mesh
// simplified, textures resized to WebP, compressed. The result is shared under the
// same licence (CC BY-NC-SA 4.0).
//
// Works on the glTF directly (gltf-transform) so the model's textures survive.
import { writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import * as THREE from "three";
import { NodeIO, getBounds } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import { dedup, weld, simplifyPrimitive, prune, meshopt, textureCompress } from "@gltf-transform/functions";
import { MeshoptSimplifier, MeshoptEncoder } from "meshoptimizer";
import sharp from "sharp";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SRC = process.argv[2];
if (!SRC) { console.error("usage: node tools/prepare-malibu.mjs <2019_chevrolet_malibu_ls_sedan.glb>"); process.exit(1); }
const REAL_LENGTH = 4.923;   // Chevrolet Malibu (2016+), meters

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
// in the source the car points along +z and its left side is +x
const W = Object.fromEntries(["FR", "FL", "RR", "RL"].map(k => [k, byName("Wheel_" + k)]));
const wc = Object.fromEntries(Object.entries(W).map(([k, n]) => [k, centre(n)]));
const wb = box(W.FR), wheelRadius = (wb.max.y - wb.min.y) / 2;
const full = getBounds(scene);
const scale = REAL_LENGTH / (full.max[2] - full.min[2]);
const rearZ = (wc.RR.z + wc.RL.z) / 2, midX = (wc.FL.x + wc.FR.x) / 2, groundY = wb.min.y;
const C = new THREE.Matrix4().makeScale(scale, scale, scale)
  .premultiply(new THREE.Matrix4().makeRotationY(Math.PI / 2))
  .multiply(new THREE.Matrix4().makeTranslation(-midX, -groundY, -rearZ));

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
const sw0 = toCar(new THREE.Vector3(0.37, 0.9, 0.66));
let axis = new THREE.Vector3(-0.96, 0.28, 0).normalize();              // towards the driver
const meshNodes = root.listNodes().filter(n => n.getMesh() && /^Int_main|^dash/.test(nodeTag(n)));
function nodeTag(n) { let p = n, s = ""; while (p && p.propertyType === "Node") { s = p.getName() + "/" + s; p = p.listParents().find(q => q.propertyType === "Node"); } return s.split("/").reverse().find(x => /^Int_|^dash/.test(x)) || ""; }
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

/* ---------- materials the simulator drives ---------- */
const mats = Object.fromEntries(root.listMaterials().map(m => [m.getName(), m]));
if (mats.CarPaint1) mats.CarPaint1.setName("paint");
const headDrl = doc.createMaterial("lamp_head_drl").setBaseColorFactor([0.9, 0.93, 1, 1]).setEmissiveFactor([1, 0.97, 0.92]).setRoughnessFactor(0.2);
const tail = doc.createMaterial("lamp_tail").setBaseColorFactor([0.55, 0.02, 0.02, 1]).setEmissiveFactor([0.85, 0.06, 0.04]).setRoughnessFactor(0.25);
const amber = side => doc.createMaterial("lamp_ind_" + side).setBaseColorFactor([1, 0.55, 0.05, 1]).setEmissiveFactor([1, 0.55, 0.05]);
const under = (n, re) => { let p = n; while (p && p.propertyType === "Node") { if (re.test(p.getName())) return true; p = p.listParents().find(q => q.propertyType === "Node"); } return false; };
for (const n of root.listNodes()) {
  if (!n.getMesh()) continue;
  const c = centre(n);
  // light guides: the front ones are the daytime running lights, the rear ones the tail lamps
  if (under(n, /^LightsMain/)) for (const p of n.getMesh().listPrimitives()) p.setMaterial(c.z > 0 ? headDrl : tail);
  if (under(n, /taillights_chromered/)) for (const p of n.getMesh().listPrimitives()) p.setMaterial(tail);
}

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
const lampBounds = re => { const b = new THREE.Box3(); for (const n of root.listNodes()) if (n.getMesh() && under(n, re)) { const bb = box(n); b.union(new THREE.Box3(bb.min, bb.max)); } return b; };   // bounds are already in the car frame
const hb = lampBounds(/headlights_chrome\.001$/), tb = lampBounds(/^Ext_Malibu_LS_taillights_chromered\.001$/);
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
const credit = "2019 Chevrolet Malibu LS Sedan by Ddiaz Design (sketchfab.com/ddiaz-design), CC BY-NC-SA 4.0, modified";
car.setExtras({ dims: info, fullInterior: true, credit });
root.getAsset().extras = { credit, source: "https://sketchfab.com/3d-models/2019-chevrolet-malibu-ls-sedan-c689df3e4b6a4df1b0b409309d00a728", license: "CC-BY-NC-SA-4.0" };

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
await doc.transform(weld());
const wheelNodes = new Set();
for (const k of Object.keys(W)) byName("wheel_spin_" + k).traverse(n => wheelNodes.add(n));
for (const n of root.listNodes()) {
  if (!n.getMesh() || wheelNodes.has(n)) continue;
  for (const prim of n.getMesh().listPrimitives()) simplifyPrimitive(prim, { simplifier: MeshoptSimplifier, ratio: 0.35, error: 0.0008 });
}
await doc.transform(
  prune(), dedup(),
  textureCompress({ encoder: sharp, targetFormat: "webp", resize: [1024, 1024], quality: 82 }),
  meshopt({ encoder: MeshoptEncoder, level: "medium" })
);
const out = join(ROOT, "public/models/malibu.glb");
await io.write(out, doc);
writeFileSync(join(ROOT, "src/cars/malibu-dims.json"), JSON.stringify(info, null, 1) + "\n");
const { statSync } = await import("node:fs");
console.log(`wrote ${out} (${(statSync(out).size / 1024 / 1024).toFixed(1)} MB)`);
