// Light copies of the car models for the traffic at the junction: far fewer triangles, small textures.
//
//   node tools/make-lite.mjs            (all cars)   |   node tools/make-lite.mjs matiz damas
import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import { simplifyPrimitive, prune, dedup, weld, meshopt, textureCompress } from "@gltf-transform/functions";
import { MeshoptSimplifier, MeshoptEncoder, MeshoptDecoder } from "meshoptimizer";
import sharp from "sharp";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { statSync } from "node:fs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const ids = process.argv.slice(2).length ? process.argv.slice(2) : ["cobalt", "malibu-premier", "malibu-2019", "monza", "matiz", "damas"];
await MeshoptSimplifier.ready; await MeshoptEncoder.ready; await MeshoptDecoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ "meshopt.encoder": MeshoptEncoder, "meshopt.decoder": MeshoptDecoder });
for (const id of ids) {
  const doc = await io.read(join(ROOT, `public/models/${id}.glb`));
  await doc.transform(weld());
  let before = 0, after = 0;
  for (const mesh of doc.getRoot().listMeshes()) for (const prim of mesh.listPrimitives()) {
    const idx = prim.getIndices(); if (!idx) continue; before += idx.getCount() / 3;
    simplifyPrimitive(prim, { simplifier: MeshoptSimplifier, ratio: 0.08, error: 0.02, lockBorder: false });
    const i2 = prim.getIndices(); if (!i2 || i2.getCount() === 0) { prim.dispose(); continue; } after += i2.getCount() / 3;
  }
  await doc.transform(dedup(), prune(), textureCompress({ encoder: sharp, targetFormat: "webp", resize: [256, 256], quality: 70 }), meshopt({ encoder: MeshoptEncoder, level: "medium" }));
  const out = join(ROOT, `public/models/${id}-lite.glb`);
  await io.write(out, doc);
  console.log(id, Math.round(before / 1000) + "k ->", Math.round(after / 1000) + "k triangles,", (statSync(out).size / 1024).toFixed(0) + " KB");
}
