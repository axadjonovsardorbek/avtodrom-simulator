// Car textures to KTX2 (UASTC, zstd), written over the models in public/models:
//   node tools/ktx2.mjs [car ids...]            (default: every car, full and -mid copies)
//
// A PNG or WebP texture is unpacked by the browser into raw pixels, sent to the GPU whole and its
// mipmaps built there: for a 2048 px texture that is 16 MB and a visible stall per texture. A UASTC
// texture goes to the GPU still compressed (BC7 / ASTC / ETC2, whichever the device has), with its
// mipmaps made here, at a quarter of the memory or less, and looks the same (UASTC is near lossless).
// Needs the `ktx` tool of KTX-Software 4.x on the PATH (or in KTX_BIN).
import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS, KHRTextureBasisu } from "@gltf-transform/extensions";
import { MeshoptDecoder, MeshoptEncoder } from "meshoptimizer";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync, readFileSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const KTX = process.env.KTX_BIN || "ktx";
const ids = process.argv.slice(2).length ? process.argv.slice(2) : ["cobalt", "malibu-premier", "malibu-2019", "monza", "matiz", "damas", "kia-k5", "passat-2022", "passat-pro"];
await MeshoptDecoder.ready; await MeshoptEncoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ "meshopt.decoder": MeshoptDecoder, "meshopt.encoder": MeshoptEncoder });
const tmp = mkdtempSync(join(tmpdir(), "ktx2-"));

for (const id of ids) for (const suffix of ["", "-mid"]) {
  const file = join(ROOT, `public/models/${id}${suffix}.glb`);
  const doc = await io.read(file), root = doc.getRoot();
  // colour textures are sRGB, the rest (normals, roughness/metal, occlusion) are data
  const srgb = new Set();
  for (const m of root.listMaterials()) for (const t of [m.getBaseColorTexture(), m.getEmissiveTexture()]) if (t) srgb.add(t);
  let done = 0, before = 0, after = 0;
  for (const tex of root.listTextures()) {
    if (tex.getMimeType() === "image/ktx2") continue;
    const img = tex.getImage(); before += img.byteLength;
    const png = join(tmp, "in.png"), out = join(tmp, "out.ktx2");
    // through sharp: the source may be WebP or JPEG; the ktx tool reads PNG
    const info = await sharp(img).ensureAlpha().png().toFile(png);
    // the full copies: UASTC (near lossless), its rate-distortion pass trading a hair of detail for a much smaller file;
    // the -mid copies (phones): colour in ETC1S, a fraction of the download, the data maps in UASTC (ETC1S smears normals)
    const small = suffix === "-mid" && srgb.has(tex);
    const enc = small ? ["--encode", "basis-lz", "--clevel", "2", "--qlevel", "200"]
      : ["--encode", "uastc", "--uastc-quality", "2", "--uastc-rdo", "--uastc-rdo-l", suffix ? "3" : "1.5", "--zstd", "18"];
    const args = ["create", "--format", srgb.has(tex) ? "R8G8B8A8_SRGB" : "R8G8B8A8_UNORM", "--assign-tf", srgb.has(tex) ? "srgb" : "linear", ...enc, "--generate-mipmap", png, out];
    if (info.width % 4 || info.height % 4) {      // block compressed formats work in 4x4 blocks
      await sharp(img).resize(Math.ceil(info.width / 4) * 4, Math.ceil(info.height / 4) * 4, { fit: "fill" }).ensureAlpha().png().toFile(png);
    }
    execFileSync(KTX, args, { stdio: ["ignore", "ignore", "inherit"] });
    const k = readFileSync(out); after += k.byteLength;
    tex.setImage(new Uint8Array(k)).setMimeType("image/ktx2");
    if (tex.getURI()) tex.setURI(tex.getURI().replace(/\.\w+$/, ".ktx2"));
    done++;
  }
  if (done) doc.createExtension(KHRTextureBasisu).setRequired(true);
  await io.write(file, doc);
  console.log(`${id}${suffix}: ${done} textures, ${(before / 1048576).toFixed(1)} -> ${(after / 1048576).toFixed(1)} MB, file ${(statSync(file).size / 1048576).toFixed(1)} MB`);
}
rmSync(tmp, { recursive: true, force: true });
