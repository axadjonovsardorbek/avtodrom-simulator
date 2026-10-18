// Headless checks for the simulation core (no browser needed): node tests/run.js
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
for (const f of ["physics.mjs", "world.mjs", "rules.mjs", "history.mjs", "tutorial.mjs", "replay.mjs", "achievements.mjs", "daily.mjs"]) {
  console.log(`\n== ${f}`);
  execFileSync(process.execPath, [join(here, f)], { stdio: "inherit" });
}
