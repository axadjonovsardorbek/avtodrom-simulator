// The downloaded "Daewoo Matiz full interior" GLB holds two copies of the car side by side:
// one with the bonnet and tailgate open (x < 1) and a closed one (x > 1). This keeps the closed
// one and writes it next to the download, ready for tools/prepare-car.mjs tools/cars/matiz.json.
//
//   node tools/split-matiz.mjs ~/Downloads/daewoo-matiz-full-interior/source/daewoo_matiz_full_interior.glb
import { NodeIO, getBounds } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import { dirname, join } from "node:path";

const src = (process.argv[2] || "").replace(/^~/, process.env.HOME);
if (!src) { console.error("usage: node tools/split-matiz.mjs <daewoo_matiz_full_interior.glb>"); process.exit(1); }
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const d = await io.read(src);
let dropped = 0;
for (const n of d.getRoot().listNodes()) {
  if (!n.getMesh()) continue;
  const b = getBounds(n);
  if ((b.min[0] + b.max[0]) / 2 < 1.0) { n.dispose(); dropped++; }
}
const out = join(dirname(src), "..", "matiz-closed.glb");
await io.write(out, d);
console.log(`dropped ${dropped} parts of the open copy, wrote ${out}`);
