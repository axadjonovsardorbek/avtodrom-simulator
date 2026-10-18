// Drives the full route with a simple autopilot (pure pursuit along waypoints, automatic gearbox) to check that every exercise
// can be reached and finished in order. The reversing exercises (garage, parking) are not driven: the car is put into the box.
//
//   node tools/drive-test.mjs
import { buildFull } from "../src/world/tracks.js";
import { PADS, px } from "../src/world/boardData.js";
import { Session } from "../src/sim/session.js";
import { SPEC } from "../src/sim/vehicle.js";

const car = { length: 4.479, rOh: 0.9, width: 1.8, k: 1 };
const W = buildFull(car), S = new Session(W, { mode: "training", transmission: "auto" });
const C = S.car, DT = 1 / 60;
const log = [];
S.on(e => { if (e.type === "penalty") log.push(`${(S.clock).toFixed(0)}s ${e.code}`); });
const chaikin = (p, n = 2) => { for (let k = 0; k < n; k++) { const q = [p[0]]; for (let i = 0; i < p.length - 1; i++) { const a = p[i], b = p[i + 1]; q.push([0.75 * a[0] + 0.25 * b[0], 0.75 * a[1] + 0.25 * b[1]], [0.25 * a[0] + 0.75 * b[0], 0.25 * a[1] + 0.75 * b[1]]); } q.push(p[p.length - 1]); p = q; } return p; };

// the way through a pad: the cheapest path that keeps away from its walls
function padPath(poly, from, to, cell = 0.25) {
  const xs = poly.map(p => p[0]), ys = poly.map(p => p[1]), x0 = Math.min(...xs) - 4, y0 = Math.min(...ys) - 4, x1 = Math.max(...xs) + 4, y1 = Math.max(...ys) + 4;
  const nx = Math.ceil((x1 - x0) / cell), ny = Math.ceil((y1 - y0) / cell), inside = (x, y) => { let c = false; for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) if ((poly[i][1] > y) !== (poly[j][1] > y) && x < (poly[j][0] - poly[i][0]) * (y - poly[i][1]) / (poly[j][1] - poly[i][1]) + poly[i][0]) c = !c; return c; };
  const free = new Uint8Array(nx * ny); for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) free[j * nx + i] = inside(x0 + (i + 0.5) * cell, y0 + (j + 0.5) * cell) ? 1 : 0;
  // distance to the nearest wall (brushfire)
  const d = new Float32Array(nx * ny).fill(1e9), q = []; for (let k = 0; k < nx * ny; k++) if (!free[k]) { d[k] = 0; q.push(k); }
  for (let h = 0; h < q.length; h++) { const k = q[h], i = k % nx, j = (k / nx) | 0; for (const [a, b] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const ii = i + a, jj = j + b; if (ii < 0 || jj < 0 || ii >= nx || jj >= ny) continue; const kk = jj * nx + ii; if (d[kk] > d[k] + 1) { d[kk] = d[k] + 1; q.push(kk); } } }
  const idx = ([x, y]) => Math.max(0, Math.min(ny - 1, Math.floor((y - y0) / cell))) * nx + Math.max(0, Math.min(nx - 1, Math.floor((x - x0) / cell)));
  const cost = new Float32Array(nx * ny).fill(1e12), prev = new Int32Array(nx * ny).fill(-1), pq = [[0, idx(from)]]; cost[idx(from)] = 0;
  const goal = idx(to);
  while (pq.length) { pq.sort((a, b) => a[0] - b[0]); const [c, k] = pq.shift(); if (c > cost[k]) continue; if (k === goal) break; const i = k % nx, j = (k / nx) | 0;
    for (const [a, b] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]) { const ii = i + a, jj = j + b; if (ii < 0 || jj < 0 || ii >= nx || jj >= ny) continue; const kk = jj * nx + ii; if (!free[kk] && kk !== goal) continue; const w = (a && b ? 1.41 : 1) * (1 + 14 / (1 + d[kk] * cell * 2)); if (c + w < cost[kk]) { cost[kk] = c + w; prev[kk] = k; pq.push([cost[kk], kk]); } } }
  const path = []; for (let k = goal; k >= 0; k = prev[k]) { path.push([x0 + ((k % nx) + 0.5) * cell, y0 + (((k / nx) | 0) + 0.5) * cell]); if (k === idx(from)) break; }
  path.reverse(); return path.filter((_, i) => i % 6 === 0);
}

function run(path, speed, { stopAt = null, tmax = 240 } = {}) {
  if (stopAt === 'alarm') S.W.alarm = false;
  path = chaikin(path, 3);
  let i0 = 0, t = 0;
  while (t < tmax && S.state === "running") {
    // nearest point ahead of the car, then a look-ahead point
    let best = 1e9; for (let i = Math.max(0, i0 - 2); i < Math.min(path.length, i0 + 40); i++) { const dd = Math.hypot(path[i][0] - C.x, path[i][1] - C.y); if (dd < best) { best = dd; i0 = i; } }
    if (stopAt === 'alarm' && S.W.alarm && C.v < 0.05) return 'alarm';
    const end = path[path.length - 1], dEnd = Math.hypot(end[0] - C.x, end[1] - C.y);
    if (i0 >= path.length - 2 && dEnd < 2.5) return true;
    const ld = 3.2 + C.v * 0.5; let j = i0; while (j < path.length - 1 && Math.hypot(path[j][0] - C.x, path[j][1] - C.y) < ld) j++;
    const tx = path[j][0], ty = path[j][1], al = Math.atan2(ty - C.y, tx - C.x) - C.th, a = Math.atan2(Math.sin(al), Math.cos(al));
    const delta = Math.atan2(2 * SPEC.wb * Math.sin(a), Math.max(2, Math.hypot(tx - C.x, ty - C.y)));
    C.sw = Math.max(-SPEC.wheelLock, Math.min(SPEC.wheelLock, delta / SPEC.maxSteer * SPEC.wheelLock * 1.0));
    const vt = (S.W.alarm && stopAt === "alarm") ? 0 : speed * (Math.abs(delta) > 0.25 ? 0.6 : 1);
    if (C.v < vt - 0.1) { C.throttle = Math.min(1, (vt - C.v) * 0.7); C.brake = 0; } else { C.throttle = 0; C.brake = C.v > vt + 0.2 ? Math.min(1, (C.v - vt) * 0.6) : 0; }
    S.step(DT); t += DT;
  }
  return false;
}
const progress = tag => console.log(`${tag}: task ${S.taskIdx}/${W.tasks.length}${S.active ? " (active " + S.active.task.id + " stage " + S.active.stage + ")" : ""}, car ${C.x.toFixed(0)},${C.y.toFixed(0)}, penalties ${S.total}`);
const P = (...pts) => pts.map(([x, y]) => px(x, y));
const M = pts => pts;

// get ready: belt, engine, gear D, handbrake off, left signal, wait for the start signal
C.belt = true; C.startEngine(); for (let k = 0; k < 300; k++) S.step(DT); C.brake = 1; C.shift("D"); C.handbrake = false; C.sig = -1;
for (let k = 0; k < 60 * 4; k++) S.step(DT);
C.brake = 0;
const steps = [];
const go = (name, path, speed = 4.2, opt) => { const ok = run(path, speed, opt); progress(name + (ok ? "" : " [TIMEOUT]")); };
const put = (x, y, th) => { Object.assign(C, { x, y, th, v: 0 }); C.brake = 1; };

const Y0 = -53.25;                                   // the top lane
go("top road, crossing, overpass", [[26.8, Y0], [-30, Y0], [-48, Y0], [-56, Y0], [-61, -51], [-63.2, -46], [-63.7, -40], [-63.7, -27], [-62, -22], [-57, -19.65], [-49.5, -19.65]], 5);
go("through the zigzag", [[-49.5, -19.65], ...padPath(PADS[0], [-47, -19.65], [-33, -39]), [-29, -39], [-20, -39], [-8, -38.3], [-4.5, -36.5], [-2.2, -32.5], [-1.75, -29]], 3.2);
go("junction from the north", [[-1.75, -29], [-1.75, -10], [-1.75, 10], [-1.9, 20], [-2.5, 25]], 4.5);
// the snake: the right strand from the bottom to the top, then the left one from the top to the bottom
go("to the snake", [[-2.5, 25], [-6, 31], [-10, 31], [-12.3, 29.7]], 3);
go("snake right strand", padPath(PADS[7], [-12.5, 28.7], [-27.6, 8.8]), 2.6);
go("along the band", [[-27.6, 8.8], [-30, 4.5], [-45, 3.8], [-51.5, 6.5], [-51.5, 10.3]], 3);
go("snake left strand", padPath(PADS[8], [-51.5, 10.3], [-28.5, 34.5]), 2.6);
const Ln = -61.7;
go("to the west road", [[-28.5, 34.5], [-27, 43], [-34, 49.5], [-50, 50.5], [-58.5, 49], [Ln, 44], [Ln, 30], [Ln, 18], [Ln, 8.5], [-56.5, 3.5], [-50, 1.9], [-30, 1.75]], 4.2);
go("junction from the west", [[-30, 1.75], [0, 1.75], [30, 1.75], [40, -0.5], [52, -1], [64, -1]], 4.5, { stopAt: "alarm" });
if (S.active && S.active.task.id === "avariya") { for (let k = 0; k < 60 * 6; k++) { C.brake = 1; C.throttle = 0; if (S.W.alarm) C.hazard = true; S.step(DT); } C.brake = 0; C.hazard = false; C.sig = 0; go("after the alarm", [[C.x, C.y], [58, -1], [64, 2]], 4); }
progress("after the emergency stop");
// the garage: the road south, the bottom road west, in at the south end of the T pad; then the car is put into the box and out again
C.sig = 1;
go("to the garage", [[64, 2], [64.5, 20], [63, 40], [58, 48.5], [40, 49.5], [20, 49.5], [14.3, 46], [14.3, 36]], 3.8);
C.sig = -1; put(8.5, 28.6, 0); for (let k = 0; k < 60 * 3; k++) S.step(DT); progress("in the box");
C.brake = 0; C.sig = 1; put(14.3, 44, Math.PI / 2); for (let k = 0; k < 60 * 2; k++) S.step(DT); progress("out of the garage");
// the parking bays on the east road: put the car into the bay, then drive on
C.sig = 1; C.brake = 0;
go("to the bays", [[14.3, 44], [20, 49], [45, 49.5], [60, 47], [64, 35], [64.5, 18], [62, 6], [56, -7.75], [48, -7.75]], 3.8);
put(41.6, -11.25, Math.PI); for (let k = 0; k < 60 * 3; k++) S.step(DT); progress("in the bay");
C.brake = 0; C.sig = -1; put(40, -7.75, Math.PI);
go("to the junction from the east", [[40, -7.75], [30, -3], [22, -1.75], [8, -1.75], [2, -4], [1.75, -9], [1.75, -19.7], [6.75, -24.7]], 3.6);
go("speed lane", [[6.75, -24.7], [30, -24.7], [52, -24.7]], 4.5);
for (let k = 0; k < 60 * 4; k++) { C.brake = 1; C.throttle = 0; S.step(DT); } C.brake = 0;
progress("after the speed lane");
go("round the plaza to the north arm", [[52.4, -24.7], [58, -29], [52, -36], [30, -36], [10, -34.5], [0, -32.5], [-1.75, -29]], 4);
go("junction from the north (left turn)", [[-1.75, -29], [-1.75, -14], [-1.2, -5], [3, -0.5], [10, 1.75], [30, 1.75], [50, 1.75], [64, 1.75]], 4);
progress("end");
console.log("state", S.state, "total", S.total, "passed", S.state === "done");
console.log("penalties:", log.join(", "));
