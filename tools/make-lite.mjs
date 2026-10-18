// Lighter copies of the car models (written next to the full ones):
//   -lite  for the traffic at the junction: far fewer triangles, small textures
//   -mid   for the player's own car on phones and on the "light" quality setting: a third of the triangles, 1024 px textures
//
//   node tools/make-lite.mjs [lite|mid] [car ids...]       (default: lite, all cars)
import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import { simplifyPrimitive, prune, dedup, weld, meshopt, textureCompress } from "@gltf-transform/functions";
import { MeshoptSimplifier, MeshoptEncoder, MeshoptDecoder } from "meshoptimizer";
import sharp from "sharp";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { statSync } from "node:fs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const KIND = ["lite", "mid"].includes(process.argv[2]) ? process.argv[2] : "lite";
const args = process.argv.slice(["lite", "mid"].includes(process.argv[2]) ? 3 : 2);
const ids = args.length ? args : ["cobalt", "malibu-premier", "malibu-2019", "monza", "matiz", "damas"];
const SET = { lite: { ratio: 0.45, error: 0.0006, tex: 512, q: 78 }, mid: { ratio: 0.6, error: 0.0004, tex: 1024, q: 82 } }[KIND];
await MeshoptSimplifier.ready; await MeshoptEncoder.ready; await MeshoptDecoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ "meshopt.encoder": MeshoptEncoder, "meshopt.decoder": MeshoptDecoder });
for (const id of ids) {
  const doc = await io.read(join(ROOT, `public/models/${id}.glb`));
  await doc.transform(weld({ tolerance: 0 }));
  let before = 0, after = 0;
  for (const mesh of doc.getRoot().listMeshes()) for (const prim of mesh.listPrimitives()) {
    const idx = prim.getIndices(); if (!idx) continue; before += idx.getCount() / 3;
    simplifyPrimitive(prim, { simplifier: MeshoptSimplifier, ratio: SET.ratio, error: SET.error, lockBorder: true });
    const i2 = prim.getIndices(); if (!i2 || i2.getCount() === 0) { prim.dispose(); continue; } after += i2.getCount() / 3;
  }
  await doc.transform(dedup(), prune(), textureCompress({ encoder: sharp, targetFormat: "webp", resize: [SET.tex, SET.tex], quality: SET.q }), meshopt({ encoder: MeshoptEncoder, level: "medium" }));
  const out = join(ROOT, `public/models/${id}-${KIND}.glb`);
  await io.write(out, doc);
  console.log(id, Math.round(before / 1000) + "k ->", Math.round(after / 1000) + "k triangles,", (statSync(out).size / 1024).toFixed(0) + " KB");
}
