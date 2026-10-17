// Turns the Chevrolet Malibu XL 2023 model into the simulator's car file.
//
//   node tools/prepare-malibu-xl.mjs ~/Downloads/chevrolet-malibu-xl-2023/source/Scene.glb
//
// The model is used with the permission the project owner obtained from its author
// (see CREDITS.md). Changes: re-oriented and scaled to the real car, placed on the rear
// axle, wheels and steering wheel rigged, lamp materials for the simulator, indicators
// added, textures resized to WebP, compressed.
import { writeFileSync, statSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import * as THREE from "three";
import { NodeIO, getBounds } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import { dedup, weld, prune, meshopt, textureCompress } from "@gltf-transform/functions";
import { MeshoptEncoder } from "meshoptimizer";
import sharp from "sharp";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SRC = process.argv[2];
if (!SRC) { console.error("usage: node tools/prepare-malibu-xl.mjs <Scene.glb>"); process.exit(1); }
const REAL_LENGTH = 4.933;   // Chevrolet Malibu XL, meters

await MeshoptEncoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ "meshopt.encoder": MeshoptEncoder });
const doc = await io.read(SRC);
const root = doc.getRoot(), scene = root.listScenes()[0], buf = root.listBuffers()[0];
const byName = name => root.listNodes().find(n => n.getName() === name);
const M4 = a => new THREE.Matrix4().fromArray(a);
const box = n => { const b = getBounds(n); return new THREE.Box3(new THREE.Vector3(...b.min), new THREE.Vector3(...b.max)); };
const world = n => M4(n.getWorldMatrix());
const parentOf = n => n.listParents().find(p => p.propertyType === "Node" || p.propertyType === "Scene");
function reparent(node, parent) {
  const w = world(node);
  parentOf(node).removeChild(node);
  parent.addChild(node);
  node.setMatrix(world(parent).invert().multiply(w).toArray());
}

/* ---------- placement: rear axle centre on the ground at the origin, +x forward, +z right ---------- */
// in the source the car points along +z and its left side is +x
const W = { FR: byName("Wheel_RF"), FL: byName("Wheel_LF"), RR: byName("Wheel_RB"), RL: byName("Wheel_LB") };
const wc = Object.fromEntries(Object.entries(W).map(([k, n]) => [k, box(n).getCenter(new THREE.Vector3())]));
const wb = box(W.FR), wheelRadius = (wb.max.y - wb.min.y) / 2;
const full = box(scene);
const scale = REAL_LENGTH / (full.max.z - full.min.z);
const rearZ = (wc.RR.z + wc.RL.z) / 2, midX = (wc.FL.x + wc.FR.x) / 2, groundY = wb.min.y;
const C = new THREE.Matrix4().makeRotationY(Math.PI / 2)
  .multiply(new THREE.Matrix4().makeScale(scale, scale, scale))
  .multiply(new THREE.Matrix4().makeTranslation(-midX, -groundY, -rearZ));
const toCar = v => v.clone().applyMatrix4(C);

const car = doc.createNode("car"), body = doc.createNode("body"), model = doc.createNode("model");
model.setMatrix(C.toArray());
for (const n of scene.listChildren()) { scene.removeChild(n); model.addChild(n); }
body.addChild(model); car.addChild(body); scene.addChild(car);

/* ---------- wheels: pivot (steer about y) > spin (about z = axle); the calipers only steer ---------- */
const piv = {};
for (const [k, n] of Object.entries(W)) {
  const c = toCar(wc[k]);
  const pivot = doc.createNode("wheel_pivot_" + k).setTranslation(c.toArray());
  const spin = doc.createNode("wheel_spin_" + k);
  pivot.addChild(spin); car.addChild(pivot);
  reparent(n, spin);
  for (const ch of n.listChildren()) if (/Caliper/.test(ch.getName())) reparent(ch, pivot);
  piv[k] = c;
}

/* ---------- steering wheel: pivot on the column axis (least-spread direction of the rim) ---------- */
const sw = byName("Body_SteeringWheel");
const pts = [];
sw.traverse(n => {
  if (!n.getMesh() || !/Leather/.test(n.getName())) return;
  const m = world(n);
  for (const prim of n.getMesh().listPrimitives()) {
    const pos = prim.getAttribute("POSITION"), t = [];
    for (let i = 0; i < pos.getCount(); i += 2) pts.push(new THREE.Vector3().fromArray(pos.getElement(i, t)).applyMatrix4(m));
  }
});
const mean = pts.reduce((s, p) => s.add(p), new THREE.Vector3()).divideScalar(pts.length);
const cov = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
for (const p of pts) { const d = [p.x - mean.x, p.y - mean.y, p.z - mean.z]; for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) cov[i][j] += d[i] * d[j]; }
const inv = new THREE.Matrix3().set(...cov.flat()).invert();
let axis = new THREE.Vector3(-1, 0.3, 0); for (let k = 0; k < 50; k++) axis.applyMatrix3(inv).normalize();
if (axis.x > 0) axis.negate();                                   // towards the driver
const steer = doc.createNode("steering_wheel").setTranslation(mean.toArray())
  .setRotation(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, -1), axis).toArray());
car.addChild(steer);
reparent(sw, steer);
console.log("steering wheel centre", mean.toArray().map(v => v.toFixed(3)), "axis", axis.toArray().map(v => v.toFixed(2)));

/* ---------- materials the simulator drives ---------- */
for (const m of root.listMaterials()) if (m.getName() === "Car_Paint") m.setName("paint");
// lamp graphics: the front half lights up white when the engine runs, the rear half red
function splitByX(node, test) {        // split a mesh's triangles by their car-frame x
  const m = world(node), keepA = [], keepB = [], out = [];
  for (const prim of node.getMesh().listPrimitives()) {
    const pos = prim.getAttribute("POSITION"), idx = prim.getIndices(), t = [], a = [], b = [];
    const v = new THREE.Vector3();
    for (let i = 0; i < idx.getCount(); i += 3) {
      const tri = [idx.getScalar(i), idx.getScalar(i + 1), idx.getScalar(i + 2)];
      v.set(0, 0, 0); for (const k of tri) v.add(new THREE.Vector3().fromArray(pos.getElement(k, t)).applyMatrix4(m));
      (test(v.divideScalar(3)) ? a : b).push(...tri);
    }
    out.push({ prim, a, b });
  }
  return out;
}
const headMat = src => src.clone().setName("lamp_head_img").setEmissiveTexture(src.getBaseColorTexture()).setEmissiveFactor([1, 0.97, 0.92]);
const tailMat = src => src.clone().setName("lamp_tail").setEmissiveTexture(src.getBaseColorTexture()).setEmissiveFactor([1, 0.12, 0.08]);
const setIdx = (prim, list) => prim.setIndices(doc.createAccessor().setType("SCALAR").setArray(new Uint32Array(list)).setBuffer(buf));
for (const name of ["Lamp_Image", "Trunk_Lamp_Image"]) {
  const n = byName(name);
  for (const { prim, a, b } of splitByX(n, p => p.x > 2)) {
    const src = prim.getMaterial();
    if (!b.length) { prim.setMaterial(headMat(src)); continue; }
    if (!a.length) { prim.setMaterial(tailMat(src)); continue; }
    const rear = prim.clone(); setIdx(rear, b); rear.setMaterial(tailMat(src));
    setIdx(prim, a); prim.setMaterial(headMat(src));
    n.getMesh().addPrimitive(rear);
  }
}

/* ---------- indicators (amber) at the outer corners of the lamps ---------- */
function sphere(r, material, name, pos) {
  const P = [], N = [], I = [], seg = 10, rings = 6;
  for (let i = 0; i <= rings; i++) for (let j = 0; j <= seg; j++) {
    const th = i / rings * Math.PI, ph = j / seg * Math.PI * 2, n = [Math.sin(th) * Math.cos(ph), Math.cos(th), Math.sin(th) * Math.sin(ph)];
    N.push(...n); P.push(...n.map(v => v * r));
  }
  for (let i = 0; i < rings; i++) for (let j = 0; j < seg; j++) { const a = i * (seg + 1) + j, b = a + seg + 1; I.push(a, b, a + 1, b, b + 1, a + 1); }
  const acc = (t, a) => doc.createAccessor().setType(t).setArray(a).setBuffer(buf);
  const prim = doc.createPrimitive().setMaterial(material).setAttribute("POSITION", acc("VEC3", new Float32Array(P))).setAttribute("NORMAL", acc("VEC3", new Float32Array(N))).setIndices(acc("SCALAR", new Uint32Array(I)));
  car.addChild(doc.createNode(name).setMesh(doc.createMesh(name).addPrimitive(prim)).setTranslation(pos));
}
const amber = side => doc.createMaterial("lamp_ind_" + side).setBaseColorFactor([1, 0.55, 0.05, 1]).setEmissiveFactor([1, 0.55, 0.05]);
const lamps = box(byName("Body_Lamp")), front = box(byName("Lamp_ChromePlastic")), tailB = box(byName("Trunk_Body_TailLamp"));
for (const [side, sg] of [["L", -1], ["R", 1]]) {
  sphere(0.028, amber(side), `ind_${side}_front`, [front.max.x - 0.12, (front.min.y + front.max.y) / 2, sg * (front.max.z - 0.07)]);
  sphere(0.028, amber(side), `ind_${side}_rear`, [lamps.min.x + 0.06, (tailB.min.y + tailB.max.y) / 2, sg * (lamps.max.z - 0.08)]);
}

/* ---------- dimensions for the physics, camera and learner sign ---------- */
const cb = box(car);
const info = {
  length: +(cb.max.x - cb.min.x).toFixed(3), width: +(cb.max.z - cb.min.z).toFixed(3), height: +(cb.max.y - cb.min.y).toFixed(3),
  wheelbase: +(piv.FR.x - piv.RR.x).toFixed(3), track: +Math.abs(piv.FR.z - piv.FL.z).toFixed(3),
  wheelR: +(wheelRadius * scale).toFixed(3), rOh: +(-cb.min.x).toFixed(3), fOh: +(cb.max.x - piv.FR.x).toFixed(3),
  steeringWheel: mean.toArray().map(v => +v.toFixed(3)), roofY: +cb.max.y.toFixed(3)
};
console.log("dimensions:", JSON.stringify(info));
const credit = "Chevrolet Malibu XL 2023 (Uzbek 3D), used with the author's permission, modified";
car.setExtras({ dims: info, fullInterior: true, credit });
root.getAsset().extras = { credit };

/* ---------- shrink textures, compress ---------- */
await doc.transform(
  weld(), prune(), dedup(),
  textureCompress({ encoder: sharp, targetFormat: "webp", resize: [1024, 1024], quality: 85 }),
  meshopt({ encoder: MeshoptEncoder, level: "medium" })
);
const out = join(ROOT, "public/models/malibu.glb");
await io.write(out, doc);
writeFileSync(join(ROOT, "src/cars/malibu-dims.json"), JSON.stringify(info, null, 1) + "\n");
console.log(`wrote ${out} (${(statSync(out).size / 1024 / 1024).toFixed(1)} MB)`);
