// Loads a car .glb and rigs its moving parts. Hosts that cannot serve .glb get
// the same bytes base64-wrapped in "<name>.glb.json" (see tools/pack-models.mjs).
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { rigCar } from "./carModel.js";

async function fetchModel(url) {
  try {
    const r = await fetch(url);
    if (r.ok) return await r.arrayBuffer();
  } catch (_) { /* fall through to the wrapped copy */ }
  const r = await fetch(url + ".json");
  if (!r.ok) throw new Error(`${url}: HTTP ${r.status}`);
  const { glb } = await r.json();
  const bin = atob(glb), bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes.buffer;
}

export async function loadCarModel(url) {
  const data = await fetchModel(url);
  const gltf = await new GLTFLoader().parseAsync(data, "");
  const root = gltf.scene;
  root.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  return rigCar(root);
}
