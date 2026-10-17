// Turns the downloaded Sketchfab model into the simulator's car file.
//
//   node tools/prepare-cobalt.mjs ~/Downloads/chevrolet_cobalt_ltz_2014.glb
//
// Source: "Chevrolet Cobalt LTZ 2014" by Q.SARDOR, CC BY 4.0,
// https://sketchfab.com/3d-models/chevrolet-cobalt-ltz-2014-f91cbef731444f939e263041400216ca
// Changes: duplicate wheels removed, rescaled and re-oriented, wheels and steering wheel
// rigged, materials adjusted, indicators and learner sign added, mesh simplified/compressed.
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { GLTFExporter } from "three/examples/jsm/exporters/GLTFExporter.js";
import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import { dedup, weld, simplify, prune, meshopt } from "@gltf-transform/functions";
import { MeshoptSimplifier, MeshoptEncoder } from "meshoptimizer";

// GLTFExporter (binary) needs FileReader, which Node does not have
globalThis.FileReader ??= class {
  readAsArrayBuffer(blob) { blob.arrayBuffer().then(r => { this.result = r; this.onloadend && this.onloadend(); this.onload && this.onload({ target: this }); }); }
  readAsDataURL(blob) { blob.arrayBuffer().then(r => { this.result = "data:" + (blob.type || "application/octet-stream") + ";base64," + Buffer.from(r).toString("base64"); this.onloadend && this.onloadend(); }); }
};

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SRC = process.argv[2];
if (!SRC) { console.error("usage: node tools/prepare-cobalt.mjs <chevrolet_cobalt_ltz_2014.glb>"); process.exit(1); }
const REAL_LENGTH = 4.479;   // Chevrolet Cobalt (2013+), meters

const buf = readFileSync(SRC);
const gltf = await new GLTFLoader().parseAsync(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength), "");
const src = gltf.scene;
src.updateMatrixWorld(true);
const box = o => new THREE.Box3().setFromObject(o);
const center = o => box(o).getCenter(new THREE.Vector3());

/* ---------- wheels: the file holds 16 copies; keep one per corner ---------- */
const wheelRoots = [];
src.traverse(o => { if (/^sentinel\d*$/.test(o.name) || o.name === "wheel_rf_dummy") wheelRoots.push(o); });
const wheels = wheelRoots.filter(o => /^(sentinel\d+|wheel_rf_dummy)$/.test(o.name) && box(o).getSize(new THREE.Vector3()).y < 1);
const corners = { FR: null, FL: null, RR: null, RL: null };
for (const w of wheels) {
  const c = center(w), tag = (c.z < 0 ? "F" : "R") + (c.x > 0 ? "R" : "L");
  // prefer the copy closest to the body (smallest |x|)
  if (!corners[tag] || Math.abs(c.x) < Math.abs(center(corners[tag]).x)) corners[tag] = w;
}
for (const w of wheels) if (!Object.values(corners).includes(w)) w.parent.remove(w);
src.updateMatrixWorld(true);
const wc = Object.fromEntries(Object.entries(corners).map(([k, w]) => [k, center(w)]));
const wheelRadius = box(corners.FR).getSize(new THREE.Vector3()).y / 2;

/* ---------- placement: rear axle centre on the ground at the origin, +x forward ---------- */
const full = box(src);
const scale = REAL_LENGTH / (full.max.z - full.min.z);
const rearZ = (wc.RR.z + wc.RL.z) / 2, groundY = wc.RR.y - wheelRadius;
const car = new THREE.Group(); car.name = "car";
const model = new THREE.Group(); model.name = "model";
// model frame: x right, y up, -z forward  ->  car frame: +x forward, +z right
model.rotation.y = -Math.PI / 2;
model.scale.setScalar(scale);
model.position.set(rearZ * scale, -groundY * scale, 0);
car.add(model);
while (src.children.length) model.add(src.children[0]);
car.updateMatrixWorld(true);

/* ---------- rig the wheels: pivot (steer about y) > orient > spin (about z = axle) ---------- */
for (const [tag, w] of Object.entries(corners)) {
  const c = w.getWorldPosition(new THREE.Vector3()).copy(box(w).getCenter(new THREE.Vector3()));
  const pivot = new THREE.Group(); pivot.name = "wheel_pivot_" + tag; pivot.position.copy(c);
  const spin = new THREE.Group(); spin.name = "wheel_spin_" + tag;
  pivot.add(spin); car.add(pivot); car.updateMatrixWorld(true);
  spin.attach(w);                                   // keeps the wheel where it is, now spinning about the axle
}

/* ---------- steering wheel: gather its parts, pivot on the column axis ---------- */
const steerParts = [];
car.traverse(o => { if (o.isMesh && /^steering_ok/.test(o.name)) steerParts.push(o); });
const pts = [];
for (const m of steerParts.filter(m => /steering_ok0/.test(m.name))) {
  const p = m.geometry.attributes.position, v = new THREE.Vector3();
  for (let i = 0; i < p.count; i += 3) pts.push(v.fromBufferAttribute(p, i).applyMatrix4(m.matrixWorld).clone());
}
const mean = pts.reduce((a, p) => a.add(p), new THREE.Vector3()).multiplyScalar(1 / pts.length);
// the column axis is the direction of least spread of the rim's vertices
const cov = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
for (const p of pts) { const d = [p.x - mean.x, p.y - mean.y, p.z - mean.z]; for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) cov[i][j] += d[i] * d[j]; }
let axis = new THREE.Vector3(1, 0, 0);
{ // inverse power iteration
  const M = new THREE.Matrix3().set(...cov.flat()); const inv = M.clone().invert();
  for (let k = 0; k < 50; k++) axis.applyMatrix3(inv).normalize();
  if (axis.x > 0) axis.negate();                      // point back towards the driver
}
const steer = new THREE.Group(); steer.name = "steering_wheel";
steer.position.copy(mean);
steer.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, -1), axis);   // local -z faces the driver, +z down the column
car.add(steer); car.updateMatrixWorld(true);
for (const m of steerParts) steer.attach(m);

/* ---------- materials ---------- */
const named = {};
car.traverse(o => { if (o.isMesh) for (const m of [].concat(o.material)) named[m.name] = m; });
const paint = new THREE.MeshPhysicalMaterial({ name: "paint", color: 0xf3f4f2, roughness: 0.28, metalness: 0.15, clearcoat: 1, clearcoatRoughness: 0.1 });
const glass = new THREE.MeshPhysicalMaterial({ name: "glass", color: 0x1c242d, roughness: 0.02, metalness: 0.1, transparent: true, opacity: 0.3, clearcoat: 1, side: THREE.DoubleSide, depthWrite: false });
const trim = new THREE.MeshStandardMaterial({ name: "trim", color: 0x232427, roughness: 0.75 });
const greyTrim = new THREE.MeshStandardMaterial({ name: "trim_grey", color: 0x6d7075, roughness: 0.8 });
const metal = new THREE.MeshStandardMaterial({ name: "metal", color: 0xb8bcc1, roughness: 0.3, metalness: 0.9 });
const head = new THREE.MeshStandardMaterial({ name: "lamp_head", color: 0xdfe4ea, emissive: 0xfff3d6, emissiveIntensity: 0.05, roughness: 0.15, metalness: 0.6 });
const tail = new THREE.MeshStandardMaterial({ name: "lamp_tail", color: 0xa5120b, emissive: 0xd01810, emissiveIntensity: 0.1, roughness: 0.2 });
const tyre = new THREE.MeshStandardMaterial({ name: "tyre", color: 0x18191b, roughness: 0.9 });
const swap = { Realistic_Car_Paint: paint, Car_windshield_glass: glass, "bump_front_ok.014": trim, "painel.1": greyTrim, "escape.008": metal,
  "steering_ok.0": trim, "bancos.4": greyTrim, left_front_light: head, right_front_light: head, left_rear_light: tail, "right_rear_light.001": tail,
  "roda.026": metal, "roda.043": tyre };
car.traverse(o => {
  if (!o.isMesh) return;
  o.material = Array.isArray(o.material) ? o.material.map(m => swap[m.name] || m) : (swap[o.material.name] || o.material);
  // the cabin dome light shares the tail-lamp material in the source file
  if (/^bancos_/.test(o.name) && o.material === tail) o.material = greyTrim;
});
console.log("materials kept as is:", Object.keys(named).filter(n => !swap[n]).join(", ") || "none");

/* ---------- groups the simulator looks for ---------- */
const body = new THREE.Group(); body.name = "body";
car.add(body); body.attach(model);
const interior = new THREE.Group(); interior.name = "interior"; car.add(interior);   // the real cabin lives inside the body
car.userData.fullInterior = true;

// indicators (amber) at the outer corners of the head and tail lamps
const amber = side => new THREE.MeshStandardMaterial({ name: "lamp_ind_" + side, color: 0xffa21a, emissive: 0xffa21a, emissiveIntensity: 0.05, roughness: 0.3 });
car.updateMatrixWorld(true);
const lampBox = mat => { const b = new THREE.Box3(); car.traverse(o => { if (o.isMesh && [].concat(o.material).includes(mat)) b.union(new THREE.Box3().setFromObject(o)); }); return b; };
const hb = lampBox(head), tb = lampBox(tail);
for (const [side, sg] of [["L", -1], ["R", 1]]) {
  const f = new THREE.Mesh(new THREE.SphereGeometry(0.035, 12, 8), amber(side)); f.name = `ind_${side}_front`;
  f.position.set(hb.max.x - 0.12, (hb.min.y + hb.max.y) / 2, sg * (Math.max(Math.abs(hb.min.z), Math.abs(hb.max.z)) - 0.05)); car.add(f);
  const r = new THREE.Mesh(new THREE.SphereGeometry(0.035, 12, 8), amber(side)); r.name = `ind_${side}_rear`;
  r.position.set(tb.min.x + 0.06, tb.min.y + 0.05, sg * (Math.max(Math.abs(tb.min.z), Math.abs(tb.max.z)) - 0.06)); car.add(r);
}

const dims = box(body), size = dims.getSize(new THREE.Vector3());
const piv = Object.fromEntries(Object.entries(corners).map(([k]) => [k, car.getObjectByName("wheel_pivot_" + k).position]));
const info = {
  length: +size.x.toFixed(3), width: +size.z.toFixed(3), height: +size.y.toFixed(3),
  wheelbase: +(piv.FR.x - piv.RR.x).toFixed(3), track: +(piv.FR.z - piv.FL.z).toFixed(3),
  wheelR: +(wheelRadius * scale).toFixed(3), rOh: +(-dims.min.x).toFixed(3), fOh: +(dims.max.x - piv.FR.x).toFixed(3),
  steeringWheel: steer.position.toArray().map(v => +v.toFixed(3)), roofY: +dims.max.y.toFixed(3)
};
console.log("dimensions:", JSON.stringify(info));
car.userData.dims = info;
car.userData.credit = "Chevrolet Cobalt LTZ 2014 by Q.SARDOR (sketchfab.com/qsardor57913), CC BY 4.0, modified";

/* ---------- export, then simplify + compress ---------- */
const raw = await new GLTFExporter().parseAsync(car, { binary: true, onlyVisible: false });
const tmp = join(ROOT, "public/models/.cobalt-raw.glb");
mkdirSync(dirname(tmp), { recursive: true });
writeFileSync(tmp, Buffer.from(raw));
await MeshoptSimplifier.ready; await MeshoptEncoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ "meshopt.encoder": MeshoptEncoder });
const doc = await io.read(tmp);
doc.getRoot().getAsset().extras = { credit: car.userData.credit, source: "https://sketchfab.com/3d-models/chevrolet-cobalt-ltz-2014-f91cbef731444f939e263041400216ca", license: "CC-BY-4.0" };
await doc.transform(dedup(), weld(), simplify({ simplifier: MeshoptSimplifier, ratio: 0.3, error: 0.0006 }), prune(), meshopt({ encoder: MeshoptEncoder, level: "medium" }));
const out = join(ROOT, "public/models/cobalt.glb");
await io.write(out, doc);
writeFileSync(join(ROOT, "src/cars/cobalt-dims.json"), JSON.stringify(info, null, 1) + "\n");
const { unlinkSync, statSync } = await import("node:fs");
unlinkSync(tmp);
console.log(`wrote ${out} (${(statSync(out).size / 1024 / 1024).toFixed(1)} MB)`);
