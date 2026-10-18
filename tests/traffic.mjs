// Junction traffic: cars exist, obey the lights, keep a gap, leave the blocked arm empty
import { buildFull } from "../src/world/tracks.js";
const ok = (c, m) => { if (!c) { console.error("FAIL", m); process.exit(1); } console.log("ok  ", m); };
const W = buildFull({ length: 4.4, rOh: 0.9, k: 1 }), T = W.traffic;
ok(T && T.cars.length > 0, "junction is busy at the start (" + T.cars.length + " cars)");
let redRun = 0, minGap = 99, maxCars = 0, blockedSpawn = 0;
T.setBlock(90, 0, 1e6);               // the learner will use the north arm (heading 90): arm position -90
T.setBlock(-90, 0, 1e6);
for (let t = 0; t < 400; t += 0.05) {
  T.step(0.05, t);
  maxCars = Math.max(maxCars, T.cars.length);
  for (const arm of T.lanes) {
    const stopS = arm.stopS;
    const [st] = W.lightState(arm.axis, t);
    arm.cars.forEach((c, i) => {
      if (c.prev !== undefined && c.prev <= stopS + 0.4 && c.s > stopS + 0.4 && st === "red") { redRun++; if (redRun < 4) console.log("  crossed on red at t=" + t.toFixed(1), "v=" + c.v.toFixed(1), "go=" + c.go, "state", W.lightState(arm.axis, t)); }
      c.prev = c.s;
      if (i > 0) minGap = Math.min(minGap, arm.cars[i - 1].s - 4.3 - c.s);
    });
    if (arm.blockBy.includes(-90) && t > 15 && arm.cars.length) blockedSpawn++;
  }
}
ok(redRun === 0, "cars stop on red (violations: " + redRun + ")");
ok(minGap > 0.2, "no car drives into the one ahead (min gap " + minGap.toFixed(2) + " m)");
ok(maxCars <= 20, "traffic stays moderate (" + maxCars + " cars at most)");
ok(blockedSpawn === 0, "the blocked arm stays empty");
