// Drives the full route with a simple autopilot (pure pursuit along waypoints, automatic gearbox) to check that every exercise
// can be reached and finished in order. The reversing exercises (garage, parking) are not driven: the car is put into the box.
//
//   node tools/drive-test.mjs
import { buildFull } from "../src/world/tracks.js";
import { PADS, PAD, px } from "../src/world/boardData.js";
import { Session } from "../src/sim/session.js";
import { SPEC } from "../src/sim/vehicle.js";
import { LANE } from "../src/world/path.js";

const car = { length: 4.479, rOh: 0.9, width: 1.8, k: 1 };
const W = buildFull(car), S = new Session(W, { mode: "training", transmission: "auto" });
const C = S.car, DT = 1 / 60;
const log = [], assists = [];
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
    const ld = (speed < 3.5 ? 2.2 : 3.2) + C.v * 0.45; let j = i0; while (j < path.length - 1 && Math.hypot(path[j][0] - C.x, path[j][1] - C.y) < ld) j++;
    const tx = path[j][0], ty = path[j][1], al = Math.atan2(ty - C.y, tx - C.x) - C.th, a = Math.atan2(Math.sin(al), Math.cos(al));
    const delta = Math.atan2(2 * SPEC.wb * Math.sin(a), Math.max(2, Math.hypot(tx - C.x, ty - C.y)));
    C.sw = Math.max(-SPEC.wheelLock, Math.min(SPEC.wheelLock, delta / SPEC.maxSteer * SPEC.wheelLock * 1.0));
    const vt = (S.W.alarm && stopAt === "alarm") ? 0 : speed * (Math.abs(delta) > 0.25 ? 0.6 : 1);
    if (C.v < vt - 0.1) { C.throttle = Math.min(1, (vt - C.v) * 0.7); C.brake = 0; } else { C.throttle = 0; C.brake = C.v > vt + 0.2 ? Math.min(1, (C.v - vt) * 0.6) : 0; }
    S.step(DT); t += DT;
    // stuck against a kerb: note it and put the car back on the path a little further on
    run.stuck = C.throttle > 0.2 && Math.abs(C.v) < 0.05 ? (run.stuck || 0) + DT : 0;
    if (run.stuck > 2.5) { const k = Math.min(path.length - 2, i0 + 6), a = path[k], b = path[k + 1]; Object.assign(C, { x: a[0], y: a[1], th: Math.atan2(b[1] - a[1], b[0] - a[0]), v: 0 }); assists.push(`${S.clock.toFixed(0)}s at ${a.map(v => v.toFixed(1))}`); if (assists.length > 40) return false; run.stuck = 0; }
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

const Q = (...pts) => pts.map(([x, y]) => px(x, y));
const pad = (name, a, b) => padPath(PADS[PAD[name]], px(...a), px(...b));
go("1-3 top road, crossing, overpass", Q([962, 66], [700, 66], [400, 66], [180, 68], [120, 85], [86, 130], [78, 200], [78, 420], [90, 470], [130, 500], [250, 503], [318, 503]), 5);
go("4 the zigzag pad", [...pad("zigB", [330, 503], [424, 356]), ...Q([460, 356], [560, 356], [610, 362], [650, 395], [672, 440], [674, 480])], 3);
go("5 junction from the north, right", Q([674, 480], [674, 530], [660, 565], [620, 578], [520, 578], [470, 580], [445, 600], [430, 630], [428, 655]), 4);
go("6 the snake", [...pad("snakeR", [428, 662], [568, 888]), ...Q([555, 905], [530, 950], [522, 1000], [530, 1045], [580, 1078], [700, 1081])], 2.6);
go("bottom road east", Q([700, 1081], [1000, 1081], [1250, 1085], [1330, 1070], [1360, 1030], [1362, 1000]), 5);
go("10 emergency stop on the east loop", Q([1362, 1000], [1362, 800], [1362, 660]), 4.5, { stopAt: "alarm" });
if (S.active && S.active.task.id === "avariya") { for (let k = 0; k < 60 * 6; k++) { C.brake = 1; C.throttle = 0; if (S.W.alarm) C.hazard = true; S.step(DT); } C.brake = 0; C.hazard = false; go("after the alarm", [[C.x, C.y], ...Q([1362, 660])], 4); }
C.sig = -1;
go("to the garage", Q([1362, 660], [1355, 620], [1320, 600], [1250, 605], [1200, 610], [1180, 640], [1178, 700]), 3.5);
progress("at the garage");
{ const b = px(1228, 920); put(b[0], b[1], Math.atan2(...(() => { const p = px(1178, 920), q = px(1228, 920); return [p[1] - q[1], p[0] - q[0]]; })()) ); for (let k = 0; k < 60 * 3; k++) S.step(DT); progress("in the box"); }
C.brake = 0; C.sig = 1; { const a = px(1178, 700), b = px(1178, 600); put(a[0], a[1], Math.atan2(b[1] - a[1], b[0] - a[0])); } for (let k = 0; k < 60 * 2; k++) S.step(DT); progress("out of the garage");
C.sig = 0;
go("to the junction from the east", Q([1178, 700], [1176, 630], [1150, 590], [1100, 572], [900, 572], [790, 576], [700, 577], [500, 577], [200, 577], [130, 585], [95, 620], [80, 680], [78, 715]), 4.5);
go("8 railway crossing", Q([78, 715], [78, 900], [78, 1000], [90, 1060], [140, 1080], [189, 1081]), 4);
go("9 speed lane", Q([189, 1081], [400, 1081], [560, 1081]), 6);
for (let k = 0; k < 60 * 4; k++) { C.brake = 1; C.throttle = 0; S.step(DT); } C.brake = 0;
// the parking of the video: east along the bottom road, up the east side, west along the east road past the pocket
const d3 = PADS[PAD.D3], dBot = Math.max(...d3.map(q => q[1])), dX1 = Math.max(...d3.map(q => q[0])), laneY = dBot + LANE / 2 + 0.05;
go("to the east road", [...Q([560, 1081], [900, 1095], [1200, 1100], [1300, 1080], [1345, 1000], [1350, 800], [1350, 640], [1330, 560])], 4.5);
go("11 parking", [[dX1 + 14, laneY], [dX1 + 6, laneY], [dX1 - 10, laneY]], 3);
put(dX1 - 0.9 - 0.65, laneY - (LANE / 2 + 1.6), Math.PI);
for (let k = 0; k < 60 * 3; k++) S.step(DT); progress("in the parking box");
C.brake = 0; C.sig = -1;
go("junction from the east, right", [[dX1 - 4, laneY - 0.3], ...Q([1000, 540], [900, 568], [800, 572], [745, 565], [718, 530], [712, 470], [714, 380], [740, 320], [800, 312], [860, 312])], 4);
go("12 to the finish", Q([860, 312], [1000, 312], [1120, 312], [1240, 312]), 3.5);
progress("end");
console.log("state", S.state, "total", S.total);
console.log("penalties:", log.join(", "));
console.log("assists (stuck against a kerb):", assists.length ? assists.join("; ") : "none");
