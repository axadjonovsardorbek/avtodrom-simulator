import { buildPractice } from "../src/world/tracks.js";
import { SPEC } from "../src/sim/vehicle.js";
import { polyTouchesSeg, toLocal } from "../src/sim/geom.js";
const corners = c => { const co = Math.cos(c.th), n = Math.sin(c.th), p = (a, b) => [c.x + co * a - n * b, c.y + n * a + co * b]; return [p(3.55, -0.87), p(3.55, 0.87), p(-0.9, 0.87), p(-0.9, -0.87)]; };
const hit = (W, c) => { const P = corners(c); const xs = P.map(p => p[0]), ys = P.map(p => p[1]); return W.segmentsNear(Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)).some(sg => polyTouchesSeg(P, sg.a, sg.b)); };
const move = (W, c, dist, steer) => { const ds = 0.05 * Math.sign(dist); for (let d = 0; d < Math.abs(dist); d += 0.05) { c.th += ds / SPEC.wb * Math.tan(steer * SPEC.maxSteer); c.x += ds * Math.cos(c.th); c.y += ds * Math.sin(c.th); if (hit(W, c)) return false; } return true; };
// parallel parking: lane centre x=0 heading north; element pose at y=-4 (road starts y=10, approach 14)
{
  const W = buildPractice("parkovka"); const pose = W.tasks[0].pose; let sols = [];
  for (let l0 = -2.5; l0 <= 0.5; l0 += 0.5) for (let sStop = 16; sStop <= 24; sStop += 0.5) for (let a1 = 20; a1 <= 60; a1 += 5) {
    const [x, y] = [pose.x - Math.sin(pose.th) * l0 + Math.cos(pose.th) * sStop, pose.y + Math.cos(pose.th) * l0 + Math.sin(pose.th) * sStop];
    const c = { x, y, th: pose.th };       // rear axle at s=sStop
    if (hit(W, c)) continue;
    let ok = true, tr = 0;
    while (ok && Math.abs(c.th - pose.th) < a1 * Math.PI / 180 && tr < 15) { ok = move(W, c, -0.1, 1); tr += 0.1; }
    if (!ok) continue; tr = 0;
    while (ok && Math.abs(c.th - pose.th) > 0.01 && tr < 15) { ok = move(W, c, -0.1, -1); tr += 0.1; }
    if (!ok) continue;
    const PL = corners(c).map(([px, py]) => toLocal(pose, px, py));
    if (PL.every(([s, l]) => s >= 9 && s <= 15.5 && l >= 1.75 && l <= 4.25)) sols.push([l0, sStop, a1, toLocal(pose, c.x, c.y)[0].toFixed(2)]);
  }
  console.log("parallel solutions", sols.length, JSON.stringify(sols.slice(0, 6)));
}
