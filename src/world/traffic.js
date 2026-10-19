// Other road users at the signalised intersection. Every car follows its own lane (a polyline along the roads of the
// ground: it never leaves the asphalt), stops at the stop line before the zebra on red and yellow, keeps a gap to the
// car ahead and leaves where the learner cannot see it (a car that reaches the end of its lane in sight waits there).
// People cross the zebras of the junction while the road they cross has red. The lane the learner is about to use
// is left empty so nobody queues in his way.
import { toWorld } from "../sim/geom.js";
import { LANE } from "./path.js";

const LEN = 4.3, WID = 1.8, VMAX = 9, ACC = 2.6, DEC = 5.5, GAP = 6, WALK = 1.3;
// the models that can drive about: [{ id, len, wid, rOh }]; set by the app (src/main.js), the boxes are used when empty
let FLEET = [];
export const setTrafficFleet = f => { FLEET = f || []; };
const COLORS = [0xc9ced4, 0x2f3b52, 0x8c1f1f, 0x1f5c3a, 0xd9d3c0, 0x25272b, 0x9a6a2f, 0x56708f];

// a lane: world points, their running lengths, the stop line (s) and the signal it obeys
function lane(pts, stopAt, axis, blockBy, next) {
  const cum = [0];
  for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  let stopS = 0, best = Infinity;                                   // the stop line: the point of the lane nearest to stopAt
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i], dx = b[0] - a[0], dy = b[1] - a[1], L = dx * dx + dy * dy || 1;
    const t = Math.max(0, Math.min(1, ((stopAt[0] - a[0]) * dx + (stopAt[1] - a[1]) * dy) / L));
    const d = Math.hypot(a[0] + dx * t - stopAt[0], a[1] + dy * t - stopAt[1]);
    if (d < best) { best = d; stopS = cum[i - 1] + t * (cum[i] - cum[i - 1]); }
  }
  return { pts, cum, len: cum[cum.length - 1], stopS, axis, blockBy, next, cars: [] };
}

export class Traffic {
  // lanes: [{ pts, stop, axis, blockBy: [deg...] }] (world metres); without them, four straight arms of length A through
  // the centre (the practice junction). peds: [{ a, b, axis }] zebras where people cross (axis: the road they cross)
  constructor(W, A, seed = 7, lanes = null, peds = []) {
    this.W = W; this.A = A; this.cars = []; this.t = -1e9; this.block = null; this.id = 0;
    this.seed = seed;
    if (!lanes) lanes = [-90, 0, 90, 180].map(deg => {
      const th = deg * Math.PI / 180, inc = { x: Math.cos(th) * A, y: Math.sin(th) * A, th: th + Math.PI };
      return { pts: [toWorld(inc, 0, LANE / 2), toWorld(inc, 2 * A, LANE / 2)], stop: toWorld(inc, A - 10.6, LANE / 2), axis: Math.abs(Math.sin(th)) > 0.5 ? "NS" : "EW", blockBy: [deg] };
    });
    this.lanes = lanes.map((l, i) => lane(l.pts, l.stop, l.axis, l.blockBy, 2 + i * 3));
    // people at the zebras: each waits on one side and crosses when the road has red, then waits on the other side
    this.walkers = peds.map((z, i) => {
      const p = { x: z.a[0], y: z.a[1], th: 0, visible: true, l: 0, walking: false, phase: 0 };
      W.peds.push(p);
      return { z, p, from: i % 2 ? z.b : z.a, to: i % 2 ? z.a : z.b, t: 0, wait: 1 + i * 1.7 };
    });
    this.walkers.forEach(w => this.placeWalker(w));
  }
  rand() { this.seed = (this.seed * 1664525 + 1013904223) >>> 0; return this.seed / 4294967296; }

  // deg: the side the learner comes in from on his next signal task (nobody spawns in his lane), or null
  setBlock(deg, px, py, th = 0) {
    this.viewer = { x: px, y: py, th };
    if (deg === this.block) return;
    this.block = deg;
    // cars already waiting in that lane vanish unless the learner is close enough to see them
    for (const ln of this.lanes) if (ln.blockBy.includes(deg)) for (const c of ln.cars.slice()) {
      const p = this.worldPose(c);
      if (!this.seen(p.x, p.y, 70) && c.s < ln.stopS) this.drop(c);
    }
  }
  drop(c) { const ln = c.lane; ln.cars.splice(ln.cars.indexOf(c), 1); this.cars.splice(this.cars.indexOf(c), 1); c.gone = true; }

  // can the learner see this spot (in front of him and not too far)? Cars only appear and vanish where he cannot
  seen(x, y, range = 55) {
    const v = this.viewer; if (!v) return false;
    const dx = x - v.x, dy = y - v.y, d = Math.hypot(dx, dy);
    return d < range && (d < 12 || dx * Math.cos(v.th) + dy * Math.sin(v.th) > -0.3 * d);
  }

  // a point of a lane at running length s, heading along it (smoothed over 1.5 m so the bends are round)
  pose(ln, s) {
    const at = s => {
      s = Math.max(-20, Math.min(ln.len + 20, s));
      let i = 1; while (i < ln.cum.length - 1 && ln.cum[i] < s) i++;
      const a = ln.pts[i - 1], b = ln.pts[i], t = (s - ln.cum[i - 1]) / ((ln.cum[i] - ln.cum[i - 1]) || 1);
      return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
    };
    const [x, y] = at(s), p = at(s - 1.5), q = at(s + 1.5);
    return { x, y, th: Math.atan2(q[1] - p[1], q[0] - p[0]) };
  }

  step(dt, clock) {
    for (const ln of this.lanes) {
      const [st] = this.W.lightState(ln.axis, clock);
      const blocked = ln.blockBy.includes(this.block);
      // spawn
      ln.next -= dt;
      const last = ln.cars[ln.cars.length - 1], p0 = this.pose(ln, 0.5);
      if (ln.next <= 0 && !blocked && (!last || last.s - last.len > 9) && !(this.t > -1e8 && this.seen(p0.x, p0.y, 60))) {
        const f = FLEET.length ? FLEET[Math.floor(this.rand() * FLEET.length)] : null;
        const c = { id: this.id++, lane: ln, s: 0.5, v: VMAX * 0.8, color: COLORS[Math.floor(this.rand() * COLORS.length)], hit: false, vmax: VMAX * (0.82 + this.rand() * 0.22), a: 0, model: f ? f.id : null, len: f ? f.len : LEN, wid: f ? f.wid : WID, rOh: f ? f.rOh : 0.9 };
        ln.cars.push(c); this.cars.push(c); ln.next = 6 + this.rand() * 9;
      } else if (ln.next <= 0) ln.next = 2;
      // drive
      ln.cars.forEach((c, i) => {
        const ahead = ln.cars[i - 1];
        let want = c.vmax || VMAX;
        const dLine = ln.stopS - c.s;
        // decided once when the light turns: too close to stop comfortably = carries on through
        if (c.ls !== st) { c.ls = st; if (st === "green") c.go = false; else if (st === "yellow") c.go = dLine <= c.v * c.v / (2 * DEC) + 1.5 && dLine > -0.2; }
        if (st !== "green" && dLine > -0.2 && !c.go) want = Math.min(want, Math.max(0, Math.sqrt(2 * DEC * Math.max(0, dLine - 0.3))));
        if (ahead) { const gap = ahead.s - ahead.len - c.s - GAP * 0.4; want = Math.min(want, Math.max(0, Math.sqrt(2 * DEC * Math.max(0, gap)))); if (gap < 0.2) want = 0; }
        want = Math.min(want, Math.sqrt(2 * DEC * Math.max(0, ln.len - c.s)));
        const v = this.viewer;                                       // the learner's car in the lane ahead: stays behind it
        if (v) { const q = this.pose(ln, c.s), dx = v.x - q.x, dy = v.y - q.y, s = dx * Math.cos(q.th) + dy * Math.sin(q.th), l = -dx * Math.sin(q.th) + dy * Math.cos(q.th);
          if (s > -1 && s < 14 && Math.abs(l) < 2) want = Math.min(want, Math.sqrt(2 * DEC * Math.max(0, s - 3.2))); }        // the end of the lane: it waits there while seen
        const v0 = c.v;
        c.v += Math.max(-DEC * dt, Math.min(ACC * dt, want - c.v));
        c.v = Math.max(0, c.v);
        c.a += ((c.v - v0) / dt - c.a) * Math.min(1, dt * 4);        // smoothed acceleration: body pitch and brake lights
        c.s += c.v * dt;
      });
      // gone: past the junction and out of sight
      while (ln.cars.length && ln.cars[0].s > ln.stopS + 25 && !this.seen(this.worldPose(ln.cars[0]).x, this.worldPose(ln.cars[0]).y, 60)) this.drop(ln.cars[0]);
    }
    for (const w of this.walkers) this.walk(w, dt, clock);
    for (const w of this.strollers || []) this.stroll(w, dt);
    this.t = clock;
  }

  // People round the ground who never come onto it: the ones waiting by the start and at the exam centre stand,
  // others walk to and fro along a path. list: [{ pts: [[x, y], ...] (one point: stands there), th }]
  addStrollers(list, ground = 0) {
    this.strollers = (this.strollers || []).concat(list.map((s, i) => {
      const p = { x: s.pts[0][0], y: s.pts[0][1], th: s.th ?? 0, visible: true, l: 0, walking: false, phase: 0, ambient: true, ground };
      this.W.peds.push(p);
      const cum = [0]; for (let k = 1; k < s.pts.length; k++) cum.push(cum[k - 1] + Math.hypot(s.pts[k][0] - s.pts[k - 1][0], s.pts[k][1] - s.pts[k - 1][1]));
      return { pts: s.pts, cum, p, at: 0, dir: 1, wait: 1 + i * 1.9, speed: 1.05 + (i % 3) * 0.12 };
    }));
  }
  stroll(w, dt) {
    const p = w.p, L = w.cum[w.cum.length - 1];
    if (!L) return;
    if (!p.walking) { w.wait -= dt; if (w.wait <= 0) p.walking = true; else return; }
    w.at += w.dir * w.speed * dt; p.l += w.speed * dt; p.phase += dt;
    if (w.at >= L || w.at <= 0) { w.at = Math.max(0, Math.min(L, w.at)); w.dir = -w.dir; p.walking = false; w.wait = 2 + this.rand() * 6; }
    let k = 1; while (k < w.cum.length - 1 && w.cum[k] < w.at) k++;
    const a = w.pts[k - 1], b = w.pts[k], t = (w.at - w.cum[k - 1]) / ((w.cum[k] - w.cum[k - 1]) || 1);
    p.x = a[0] + (b[0] - a[0]) * t; p.y = a[1] + (b[1] - a[1]) * t;
    if (p.walking) p.th = Math.atan2(b[1] - a[1], b[0] - a[0]) + (w.dir < 0 ? Math.PI : 0);
  }

  // a person at a zebra: crosses only with at least 7 s of red left for the road, stops for a car in the way
  walk(w, dt, clock) {
    const [st, left] = this.W.lightState(w.z.axis, clock), p = w.p;
    if (!p.walking) {
      w.wait -= dt;
      if (w.wait <= 0 && st === "red" && left > 7) { p.walking = true; w.t = 0; }
      this.placeWalker(w); return;
    }
    const L = Math.hypot(w.to[0] - w.from[0], w.to[1] - w.from[1]), nt = Math.min(1, w.t + WALK * dt / L);
    const nx = w.from[0] + (w.to[0] - w.from[0]) * nt, ny = w.from[1] + (w.to[1] - w.from[1]) * nt, v = this.viewer;
    const inWay = (v && Math.hypot(nx - v.x, ny - v.y) < 2.6) || this.cars.some(c => { const q = this.worldPose(c); return Math.hypot(nx - q.x, ny - q.y) < c.len / 2 + 0.6; });
    if (!inWay) { w.t = nt; p.l += WALK * dt; p.phase += dt; }
    if (w.t >= 1) { p.walking = false; const f = w.from; w.from = w.to; w.to = f; w.t = 0; w.wait = 3 + this.rand() * 8; }
    this.placeWalker(w);
  }
  placeWalker(w) {
    const p = w.p; p.x = w.from[0] + (w.to[0] - w.from[0]) * w.t; p.y = w.from[1] + (w.to[1] - w.from[1]) * w.t;
    p.th = Math.atan2(w.to[1] - w.from[1], w.to[0] - w.from[0]);
  }

  // run the traffic from `from` to `to` (seconds) so the junction is already busy at the start
  warm(from, to, dt = 0.1) { for (let t = from; t < to; t += dt) this.step(dt, t); }

  worldPose(c) { return this.pose(c.lane, c.s - c.len / 2 - 0.3); }
  // where a model's origin (rear axle) goes
  axlePose(c) { return this.pose(c.lane, c.s - c.len + c.rOh); }

  // does the learner's car (corner points P) touch this car?
  touches(c, P) {
    const p = this.worldPose(c), cs = Math.cos(p.th), sn = Math.sin(p.th);
    return P.some(([x, y]) => { const dx = x - p.x, dy = y - p.y, s = dx * cs + dy * sn, l = -dx * sn + dy * cs; return Math.abs(s) < c.len / 2 + 0.1 && Math.abs(l) < c.wid / 2 + 0.1; });
  }
}
export const TRAFFIC_CAR = { LEN, WID };
