// Other road users at the signalised intersection: cars drive straight through on their own
// arm, stop at the stop line on red and yellow, keep a gap to the car ahead. The arm the
// learner is about to use is left empty so nobody queues in his way.
import { toWorld } from "../sim/geom.js";
import { LANE } from "./path.js";

const LEN = 4.3, WID = 1.8, VMAX = 9, ACC = 2.6, DEC = 5.5, GAP = 6;
// the models that can drive about: [{ id, len, wid, rOh }]; set by the app (src/main.js), the boxes are used when empty
let FLEET = [];
export const setTrafficFleet = f => { FLEET = f || []; };
const COLORS = [0xc9ced4, 0x2f3b52, 0x8c1f1f, 0x1f5c3a, 0xd9d3c0, 0x25272b, 0x9a6a2f, 0x56708f];

export class Traffic {
  // arms: [{ deg, A }] — incoming lanes of the junction; A = arm length, stop line 10 m before the centre
  constructor(W, A, seed = 7) {
    this.W = W; this.A = A; this.cars = []; this.t = -1e9; this.block = null; this.id = 0;
    this.seed = seed;
    this.arms = [-90, 0, 90, 180].map((deg, i) => {
      const th = deg * Math.PI / 180, inc = { x: Math.cos(th) * A, y: Math.sin(th) * A, th: th + Math.PI };
      return { deg, inc, axis: Math.abs(Math.sin(th)) > 0.5 ? "NS" : "EW", next: 2 + i * 3, cars: [] };
    });
  }
  rand() { this.seed = (this.seed * 1664525 + 1013904223) >>> 0; return this.seed / 4294967296; }

  // deg of the arm the learner uses now (nobody spawns there), or null
  setBlock(deg, px, py) {
    if (deg === this.block) return;
    this.block = deg;
    // cars already waiting on that arm vanish unless the learner is close enough to see it
    const arm = this.arms.find(a => a.deg === deg);
    if (!arm) return;
    for (const c of arm.cars.slice()) {
      const p = this.worldPose(c);
      if (Math.hypot(p.x - px, p.y - py) > 35 && c.s < this.A - 10) { arm.cars.splice(arm.cars.indexOf(c), 1); this.cars.splice(this.cars.indexOf(c), 1); c.gone = true; }
    }
  }

  pose(arm, s) { const [x, y] = toWorld(arm.inc, s, LANE / 2); return { x, y, th: arm.inc.th }; }

  step(dt, clock) {
    const A = this.A, stopS = A - 10 - LEN * 0 - 0.6;     // front bumper stops here
    for (const arm of this.arms) {
      const [st] = this.W.lightState(arm.axis, clock);
      // spawn
      arm.next -= dt;
      const last = arm.cars[arm.cars.length - 1];
      if (arm.next <= 0 && arm.deg !== this.block && (!last || last.s - last.len > 9)) {
        const f = FLEET.length ? FLEET[Math.floor(this.rand() * FLEET.length)] : null;
        const c = { id: this.id++, arm, s: 0.5, v: VMAX * 0.8, color: COLORS[Math.floor(this.rand() * COLORS.length)], hit: false, model: f ? f.id : null, len: f ? f.len : LEN, wid: f ? f.wid : WID, rOh: f ? f.rOh : 0.9 };
        arm.cars.push(c); this.cars.push(c); arm.next = 6 + this.rand() * 9;
      } else if (arm.next <= 0) arm.next = 2;
      // drive
      arm.cars.forEach((c, i) => {
        const ahead = arm.cars[i - 1];
        let want = VMAX;
        // red / yellow: stop before the line, unless already too close to stop comfortably
        const dLine = stopS - c.s;
        // decided once when the light turns: too close to stop comfortably = carries on through
        if (c.ls !== st) { c.ls = st; if (st === "green") c.go = false; else if (st === "yellow") c.go = dLine <= c.v * c.v / (2 * DEC) + 1.5 && dLine > -0.2; }
        if (st !== "green" && dLine > -0.2 && !c.go) want = Math.min(want, Math.max(0, Math.sqrt(2 * DEC * Math.max(0, dLine - 0.3))));
        if (ahead) { const gap = ahead.s - ahead.len - c.s - GAP * 0.4; want = Math.min(want, Math.max(0, Math.sqrt(2 * DEC * Math.max(0, gap)) )); if (gap < 0.2) want = 0; }
        c.v += Math.max(-DEC * dt, Math.min(ACC * dt, want - c.v));
        c.v = Math.max(0, c.v);
        c.s += c.v * dt;
      });
      // gone
      while (arm.cars.length && arm.cars[0].s - arm.cars[0].len > 2 * A + 4) { const g = arm.cars.shift(); this.cars.splice(this.cars.indexOf(g), 1); g.gone = true; }
    }
    this.t = clock;
  }

  // run the traffic from `from` to `to` (seconds) so the junction is already busy at the start
  warm(from, to, dt = 0.1) { for (let t = from; t < to; t += dt) this.step(dt, t); }

  worldPose(c) { return this.pose(c.arm, c.s - c.len / 2 - 0.3); }
  // where a model's origin (rear axle) goes
  axlePose(c) { return this.pose(c.arm, c.s - c.len + c.rOh); }   // centre of the car

  // does the learner's car (corner points P) touch this car?
  touches(c, P) {
    const p = this.worldPose(c), cs = Math.cos(p.th), sn = Math.sin(p.th);
    return P.some(([x, y]) => { const dx = x - p.x, dy = y - p.y, s = dx * cs + dy * sn, l = -dx * sn + dy * cs; return Math.abs(s) < c.len / 2 + 0.1 && Math.abs(l) < c.wid / 2 + 0.1; });
  }
}
export const TRAFFIC_CAR = { LEN, WID };
