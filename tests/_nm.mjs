import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import { MeshoptDecoder } from "meshoptimizer";
await MeshoptDecoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ "meshopt.decoder": MeshoptDecoder });
for (const f of process.argv.slice(2)) {
  const d = await io.read(f), names = d.getRoot().listNodes().map(n => n.getName()), mats = d.getRoot().listMaterials().map(m => m.getName());
  const re = /door|dver|porta|puerta|hood|trunk|boot|bonnet|tailgate|капот|дверь|двер|багаж|багажная/i;
  console.log(f.split("/").pop(), "nodes", names.length, "door-ish:", names.filter(n => re.test(n)).slice(0, 14).join(" | "), "|| mats:", mats.filter(n => re.test(n)).slice(0, 8).join(" | "));
}
