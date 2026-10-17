// After `vite build`: write dist/models/<name>.glb.json (base64) next to each .glb,
// for hosts that only serve web file types.
import { readdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const dir = join(dirname(fileURLToPath(import.meta.url)), "../dist/models");
if (existsSync(dir)) for (const f of readdirSync(dir).filter(f => f.endsWith(".glb"))) {
  const b = readFileSync(join(dir, f));
  writeFileSync(join(dir, f + ".json"), JSON.stringify({ glb: b.toString("base64") }));
  console.log(`packed ${f} -> ${f}.json`);
}
