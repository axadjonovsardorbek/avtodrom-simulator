import { NodeIO, getBounds } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import { MeshoptDecoder } from "meshoptimizer";
await MeshoptDecoder.ready;
const d = await new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ "meshopt.decoder": MeshoptDecoder }).read(process.argv[2]);
const re = new RegExp(process.argv[3], "i");
const kids = n => n.listChildren().length;
for (const n of d.getRoot().listNodes()) if (re.test(n.getName()) && (kids(n) > 0 || n.getMesh())) { const b = getBounds(n); const par = n.listParents().map(p => p.getName || p.propertyType).join(">"); console.log(n.getName().padEnd(44), n.getMesh() ? "mesh" : "node", "kids", kids(n), "c", [0, 1, 2].map(i => +((b.min[i] + b.max[i]) / 2).toFixed(2)).join(","), "s", [0, 1, 2].map(i => +(b.max[i] - b.min[i]).toFixed(2)).join(","), "t", n.getTranslation().map(v => +v.toFixed(2)).join(",")); }
