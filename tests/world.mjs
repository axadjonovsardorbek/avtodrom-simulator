import { buildFull, buildPractice, ELEMENTS } from "../src/world/tracks.js";
import { Session } from "../src/sim/session.js";
import { polyTouchesSeg } from "../src/sim/geom.js";
const W = buildFull();
console.log("full: roads", W.roads.length, "lines", W.lines.length, "collide segs", W.collide.length, "tasks", W.tasks.map(t => t.short).join(", "));
console.log("bounds", W.bounds);
// ghost car along the route centre: which normal-road samples touch edge lines?
const pts = W.routePts; let hits = 0, where = [];
for (let i = 1; i < pts.length; i++) {
  const [x, y] = pts[i], [px, py] = pts[i - 1];
  if (Math.hypot(x - px, y - py) < 1e-6) continue;
  const th = Math.atan2(y - py, x - px);
  // place car with its centre (rear axle + 1.3) on the sample
  const car = { x: x - Math.cos(th) * 1.3, y: y - Math.sin(th) * 1.3, th };
  const c = Math.cos(th), n = Math.sin(th);
  const P = [[3.55, -0.87], [3.55, 0.87], [-0.9, 0.87], [-0.9, -0.87]].map(([a, b]) => [car.x + c * a - n * b, car.y + n * a + c * b]);
  for (const sg of W.segmentsNear(x - 5, y - 5, x + 5, y + 5)) if (W.lines[sg.li].kind === "edge" && polyTouchesSeg(P, sg.a, sg.b)) { hits++; where.push(`(${x.toFixed(1)},${y.toFixed(1)})`); break; }
}
console.log("ghost edge hits", hits, where.slice(0, 30).join(" "));
for (const e of ELEMENTS) { const w = buildPractice(e.id); const s = new Session(w, { mode: "practice" }); for (let i = 0; i < 100; i++) s.step(1 / 120); console.log("practice", e.id.padEnd(18), "lines", w.lines.length, "state", s.state, s.guidance().title); }
