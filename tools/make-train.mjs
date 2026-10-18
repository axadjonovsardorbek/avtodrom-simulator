// Packs the Blender export of the little steam locomotive (tools/convert-train.py) for the browser:
// about a sixth of the triangles, small webp textures, meshopt.
//
//   node tools/make-train.mjs <train-raw.glb>      -> public/models/train.glb
import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import { simplifyPrimitive, prune, dedup, weld, meshopt, textureCompress, getBounds } from "@gltf-transform/functions";
import { MeshoptSimplifier, MeshoptEncoder, MeshoptDecoder } from "meshoptimizer";
import sharp from "sharp";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { statSync } from "node:fs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
await MeshoptSimplifier.ready; await MeshoptEncoder.ready; await MeshoptDecoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ "meshopt.encoder": MeshoptEncoder, "meshopt.decoder": MeshoptDecoder });
const doc = await io.read(process.argv[2]);
await doc.transform(weld());
let before = 0, after = 0;
for (const mesh of doc.getRoot().listMeshes()) for (const prim of mesh.listPrimitives()) {
  const idx = prim.getIndices(); if (!idx) continue; before += idx.getCount() / 3;
  simplifyPrimitive(prim, { simplifier: MeshoptSimplifier, ratio: 0.18, error: 0.01, lockBorder: false });
  const i2 = prim.getIndices(); if (!i2 || i2.getCount() === 0) { prim.dispose(); continue; } after += i2.getCount() / 3;
}
await doc.transform(dedup(), prune(), textureCompress({ encoder: sharp, targetFormat: "webp", resize: [256, 256], quality: 75 }), meshopt({ encoder: MeshoptEncoder, level: "medium" }));
const out = join(ROOT, "public/models/train.glb");
await io.write(out, doc);
const b = getBounds(doc.getRoot().listScenes()[0]);
console.log(Math.round(before / 1000) + "k ->", Math.round(after / 1000) + "k triangles,", (statSync(out).size / 1024).toFixed(0) + " KB, bounds", b.min.map(v => +v.toFixed(1)), b.max.map(v => +v.toFixed(1)));
