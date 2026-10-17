// The people (instructor, driver, singing boy) from Mixamo FBX downloads.
//
//   node tools/prepare-people.mjs ~/Downloads
//
// Blender (tools/people_blender.py) merges each person's FBX files into one GLB with all
// their animations; this script then shrinks the textures (WebP, max 1024 px) and compresses
// the meshes. Characters and animations: Mixamo (Adobe), used under the Mixamo terms.
import { execFileSync } from "node:child_process";
import { mkdtempSync, statSync } from "node:fs";
import { join, dirname } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import { dedup, prune, resample, meshopt, textureCompress } from "@gltf-transform/functions";
import { MeshoptEncoder } from "meshoptimizer";
import sharp from "sharp";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SRC = process.argv[2];
if (!SRC) { console.error("usage: node tools/prepare-people.mjs <folder with the Mixamo .fbx files>"); process.exit(1); }
const BLENDER = process.env.BLENDER || "/Applications/Blender.app/Contents/MacOS/Blender";
const PEOPLE = {
  instructor: { files: ["Sitting Talking.fbx:talk", "Sitting Angry.fbx:angry", "Cheering While Sitting.fbx:cheer"], drop: "Cigar", tex: 1024 },
  driver: { files: ["Driving.fbx:drive"], tex: 1024 },
  kid: { files: ["Walking Left Turn.fbx:walk"], tex: 1024 }
};

await MeshoptEncoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ "meshopt.encoder": MeshoptEncoder });
const tmp = mkdtempSync(join(tmpdir(), "people-"));
for (const [name, p] of Object.entries(PEOPLE)) {
  const raw = join(tmp, name + ".glb");
  const args = ["-b", "--python", join(ROOT, "tools/people_blender.py"), "--", raw, name, ...p.files.map(f => join(SRC, f))];
  if (p.drop) args.push("--drop", p.drop);
  execFileSync(BLENDER, args, { stdio: "ignore" });
  const doc = await io.read(raw);
  await doc.transform(dedup(), resample(), prune(),
    textureCompress({ encoder: sharp, targetFormat: "webp", resize: [p.tex, p.tex], quality: 82 }),
    meshopt({ encoder: MeshoptEncoder, level: "medium" }));
  const out = join(ROOT, "public/models/people", name + ".glb");
  await io.write(out, doc);
  console.log(`${name}: ${(statSync(out).size / 1024 / 1024).toFixed(1)} MB`);
}
