// Loads a car .glb and rigs its moving parts. Hosts that cannot serve .glb get
// the same bytes base64-wrapped in "<name>.glb.json" (see tools/pack-models.mjs).
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/examples/jsm/libs/meshopt_decoder.module.js";
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { rigCar } from "./carModel.js";

function addShadowProxy(root) {
  const car = root.name === "car" ? root : root.getObjectByName("car") || root;
  const d = car.userData && car.userData.dims;
  if (!d) return;
  const mat = new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false });
  const box = (len, h, w, x, y) => { const m = new THREE.Mesh(new THREE.BoxGeometry(len, h, w), mat); m.position.set(x, y, 0); m.castShadow = true; m.name = "shadow_proxy"; m.renderOrder = -1; car.add(m); };
  const x0 = -d.rOh, x1 = d.wheelbase + d.fOh, w = Math.min(d.width, 1.9) - 0.08;
  box(x1 - x0, d.roofY * 0.45, w, (x0 + x1) / 2, d.roofY * 0.42);                    // body
  box((x1 - x0) * 0.5, d.roofY * 0.32, w - 0.16, (x0 + x1) / 2 - 0.1, d.roofY * 0.8);  // cabin
}

// read a response body, reporting the share received so far (0..1) when the size is known
async function readAll(r, onProgress) {
  const total = +r.headers.get("content-length") || 0;
  if (!onProgress || !total || !r.body) return r.arrayBuffer();
  const reader = r.body.getReader(), parts = []; let got = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    parts.push(value); got += value.length; onProgress(Math.min(1, got / total));
  }
  const out = new Uint8Array(got); let o = 0;
  for (const p of parts) { out.set(p, o); o += p.length; }
  return out.buffer;
}

async function fetchModel(url, onProgress) {
  try {
    const r = await fetch(url);
    // some hosts answer unknown paths with an HTML page: only accept real glTF binaries
    if (r.ok) { const b = await readAll(r, onProgress); if (new TextDecoder().decode(new Uint8Array(b, 0, 4)) === "glTF") return b; }
  } catch (_) { /* fall through to the wrapped copy */ }
  const r = await fetch(url + ".json");
  if (!r.ok) throw new Error(`${url}: HTTP ${r.status}`);
  const { glb } = await r.json();
  const bin = atob(glb), bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes.buffer;
}

export async function loadCarModel(url, onProgress) {
  const data = await fetchModel(url, onProgress);
  const gltf = await new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).parseAsync(data, "");
  const root = gltf.scene;
  // the detailed model does not cast shadows itself (hundreds of thousands of triangles drawn
  // again into the shadow map); a few invisible boxes of the car's shape do it instead
  // and the body does not receive shadows: the proxy boxes inside it would mark the paint
  // with dark blotches wherever the body dips below their flat sides
  root.traverse(o => { if (o.isMesh) { o.castShadow = false; o.receiveShadow = false; } });
  addShadowProxy(root);
  return rigCar(root);
}

// a light copy of a car for the traffic: no rigging, nothing but the shape
export async function loadTrafficModel(url) {
  const data = await fetchModel(url);
  const gltf = await new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).parseAsync(data, "");
  const root = gltf.scene;
  mergeByMaterial(root);
  root.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = false; } });
  return root;
}

// A traffic car has no moving parts: its meshes (some 75 of them) are joined into one mesh per material, so the
// whole car costs a dozen draw calls, in the shadow pass too.
function mergeByMaterial(root) {
  root.updateMatrixWorld(true);
  const groups = new Map(), drop = [];
  root.traverse(o => {
    if (!o.isMesh || o.isSkinnedMesh || !o.geometry.attributes.position) return;
    const g = new THREE.BufferGeometry(), src = o.geometry, m = o.matrixWorld;
    for (const [name, size] of [["position", 3], ["normal", 3], ["uv", 2]]) {
      const a = src.attributes[name]; if (!a) continue;
      const f = new Float32Array(a.count * size);
      for (let i = 0; i < a.count; i++) for (let k = 0; k < size; k++) f[i * size + k] = [a.getX, a.getY, a.getZ][k].call(a, i);
      g.setAttribute(name, new THREE.BufferAttribute(f, size));
    }
    if (!g.attributes.normal) return;
    if (!g.attributes.uv) g.setAttribute("uv", new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
    g.setIndex(src.index ? Array.from(src.index.array) : Array.from({ length: g.attributes.position.count }, (_, i) => i));
    g.applyMatrix4(m);
    const mats = [].concat(o.material);
    if (mats.length !== 1) return;                       // multi-material meshes are left as they are
    const key = mats[0].uuid;
    if (!groups.has(key)) groups.set(key, { mat: mats[0], geos: [] });
    groups.get(key).geos.push(g); drop.push(o);
  });
  for (const o of drop) o.removeFromParent();           // the merged meshes hang off the root, their vertices are already in its frame
  for (const { mat, geos } of groups.values()) {
    const m = new THREE.Mesh(geos.length === 1 ? geos[0] : mergeGeometries(geos, false), mat);
    root.add(m);
  }
}
