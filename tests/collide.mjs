// Solid objects: the car cannot drive through a post, loses its speed, and reversing into one works too
import { Vehicle } from "../src/sim/vehicle.js";
import { buildSolidGrid, collideCar } from "../src/sim/collide.js";
const ok = (c, m) => { if (!c) { console.error("FAIL", m); process.exit(1); } console.log("ok  ", m); };
const solids = [[10, 0, 0.2]], grid = buildSolidGrid(solids);
const run = (v0, th, x0) => {
  const car = new Vehicle({ x: x0, y: 0, th }, "auto"); car.v = v0; car.engineOn = true; car.handbrake = false;
  let hit = null, maxPen = 0;
  for (let i = 0; i < 1200; i++) { car.v = v0 > 0 ? Math.max(car.v, v0 * 0.7) : Math.min(car.v, v0 * 0.7); car.x += Math.cos(car.th) * car.v / 240; car.y += Math.sin(car.th) * car.v / 240; const h = collideCar(car, solids, grid); if (h) hit = hit || h; }
  return { car, hit };
};
let r = run(8, 0, 0);
ok(r.hit && r.hit.speed > 5, "head-on hit at 8 m/s is detected (closing speed " + (r.hit && r.hit.speed.toFixed(1)) + ")");
ok(r.car.x + r.car.front < 10.3, "the front stays out of the post (front at " + (r.car.x + r.car.front).toFixed(2) + " m)");
r = run(-3, 0, 14);
ok(r.hit && r.car.x + r.car.rear > 9.7, "reversing into it is stopped too (rear at " + (r.car.x + r.car.rear).toFixed(2) + " m)");
r = run(5, 0, 0); const r2 = run(5, 0, 0);
const miss = (() => { const car = new Vehicle({ x: 0, y: 3, th: 0 }, "auto"); let h = null; for (let i = 0; i < 600; i++) { car.x += 5 / 240; h = h || collideCar(car, solids, grid); } return h; })();
ok(miss === null, "driving past 3 m to the side does not touch it");
