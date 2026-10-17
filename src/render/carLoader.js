// Loads a car .glb and rigs its moving parts. Hosts that cannot serve .glb get
// the same bytes base64-wrapped in "<name>.glb.json" (see tools/pack-models.mjs).
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/examples/jsm/libs/meshopt_decoder.module.js";
import { rigCar } from "./carModel.js";

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
  root.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  return rigCar(root);
}
