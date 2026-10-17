import { Vehicle, clutchEngage } from "../src/sim/vehicle.js";
const flat = () => 0;
function run(name, opts) {
  const v = new Vehicle({ x: 0, y: 0, th: 0 }, "manual");
  v.handbrake = false; v.clutch = 1; v.startEngine(); v.shift(1);
  const dt = 1 / 240; let t = 0, stalled = false;
  const hf = opts.hill ? (x) => Math.max(0, x) * 0.16 : flat;
  for (; t < opts.T; t += dt) {
    v.clutch = Math.max(0, 1 - t * opts.rate);
    v.throttle = opts.gas(t);
    if (opts.hill && t < 0.0001) {}
    v.step(dt, hf);
    if (v.events.some(e => e.type === "stall")) { stalled = true; break; }
  }
  console.log(name.padEnd(28), "stalled:", stalled, "t", t.toFixed(2), "v km/h", (v.v * 3.6).toFixed(1), "rpm", Math.round(v.rpm), "x", v.x.toFixed(2));
}
run("slow release no gas", { T: 4, rate: 0.6, gas: () => 0 });
run("very slow release no gas", { T: 5, rate: 0.35, gas: () => 0 });
run("dump clutch no gas", { T: 2, rate: 10, gas: () => 0 });
run("slow release + 30% gas", { T: 4, rate: 0.6, gas: () => 0.3 });
run("hill slow no gas", { T: 4, rate: 0.5, gas: () => 0, hill: true });
run("hill slow + 40% gas", { T: 4, rate: 0.5, gas: () => 0.4, hill: true });
// brake to stop in 1st without clutch -> stall
{
  const v = new Vehicle({ x: 0, y: 0, th: 0 }, "manual"); v.handbrake = false; v.clutch = 1; v.startEngine(); v.shift(1);
  let st = false; for (let t = 0; t < 6; t += 1 / 240) { v.clutch = t < 3 ? Math.max(0, 1 - t * 0.5) : 0; v.throttle = t < 3 ? 0.3 : 0; v.brake = t > 3 ? 1 : 0; v.step(1 / 240, flat); if (v.events.some(e => e.type === "stall")) { st = true; console.log("brake w/o clutch stalls at t", t.toFixed(2)); break; } }
  if (!st) console.log("brake w/o clutch: no stall (unexpected)");
}
// top speed 2nd gear
{
  const v = new Vehicle({ x: 0, y: 0, th: 0 }, "manual"); v.handbrake = false; v.clutch = 1; v.startEngine(); v.shift(1);
  for (let t = 0; t < 12; t += 1 / 240) { if (t > 4 && t < 4.5) { v.clutch = 1; v.throttle = 0; if (v.gear === 1) v.shift(2); } else { v.clutch = t < 4 ? Math.max(0, 1 - t * 0.6) : Math.max(0, v.clutch - 1 / 240 * 1.5); v.throttle = 0.6; } v.step(1 / 240, flat); }
  console.log("accel 2nd gear after 12s km/h", (v.v * 3.6).toFixed(1), "rpm", Math.round(v.rpm), v.events.map(e => e.type).join(","));
}
// automatic creep and accel
{
  const v = new Vehicle({ x: 0, y: 0, th: 0 }, "auto"); v.startEngine(); v.brake = 1; v.shift("D"); v.brake = 0; v.handbrake = false;
  for (let t = 0; t < 3; t += 1 / 240) v.step(1 / 240, flat);
  console.log("auto creep 3s km/h", (v.v * 3.6).toFixed(1));
  v.throttle = 1; for (let t = 0; t < 5; t += 1 / 240) v.step(1 / 240, flat);
  console.log("auto full 5s km/h", (v.v * 3.6).toFixed(1), "gear", v.autoGear);
}
// proper hill start: handbrake held until bite point, gas 45%
for (const hbT of [0.7, 0.9, 1.1]) {
  const v = new Vehicle({ x: 1, y: 0, th: 0 }, "manual"); v.clutch = 1; v.startEngine(); v.shift(1); v.handbrake = true;
  const hf = (x) => Math.max(0, x) * 0.16; let minX = 1, st = false;
  for (let t = 0; t < 5; t += 1 / 240) { v.clutch = Math.max(0, 1 - t * 0.5); v.throttle = 0.45; if (t > hbT) v.handbrake = false; v.step(1 / 240, hf); minX = Math.min(minX, v.x); if (v.events.some(e => e.type === "stall")) { st = true; break; } }
  console.log("hill start hb@" + hbT, "stall", st, "rollback m", (1 - minX).toFixed(2), "km/h", (v.v * 3.6).toFixed(1));
}
