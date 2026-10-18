// Static description of a driving ground: road surfaces, painted lines,
// props, ramps and the ordered list of exam tasks. No rendering here.
import { offsetPolyline, cutPolyline, untangle, toLocal, toWorld } from "../sim/geom.js";

const CELL = 5;

export class World {
  constructor(name) {
    this.name = name;
    this.roads = [];      // { pts, width, surface }
    this.pads = [];       // { poly, surface }
    this.lines = [];      // { pts, kind: edge|ctrl|paint|center, dash, width, color }
    this.paint = [];      // filled polygons: { poly, color }
    this.texts = [];      // { x, y, th, text, size, color }
    this.cones = [];      // { x, y, hit }
    this.signs = [];      // { x, y, th, kind }
    this.lights = [];     // { x, y, th, axis }
    this.peds = [];       // { x, y, th, visible }
    this.rails = [];      // { a, b } world points across which rails run
    this.gantries = [];   // { x, y, th, width, lit }
    this.ramps = [];      // { pose, s0, s1, s2, s3, h, halfW }
    this.tasks = [];
    this.routePts = [];
    this.start = null;    // pose of the car
    this.startLine = null;  // { pose, s }
    this.finishLine = null; // { pose, s, halfW }
    this.lightOffset = Math.random() * 26;
    this.alarm = false;
    this.board = null;    // the plan of the exam ground: { frame, islands: [{ grass, kerb }], pads } (src/world/board.js)
    this.solids = [];     // [x, y, radius]: poles, trunks, fence posts, walls (filled by the mesh builder)
  }

  addLine(pts, kind = "edge", opts = {}) {
    const ln = { pts, kind, dash: opts.dash || null, width: opts.width || 0.15, color: opts.color || "white", hidden: !!opts.hidden, touch: false, lastT: -9, flash: -9 };
    this.lines.push(ln);
    return ln;
  }
  addPad(poly, surface = "asphalt") { this.pads.push({ poly, surface }); }
  addPaint(poly, color = "white") { this.paint.push({ poly, color }); }

  addRoadSegment(seg, prev) {
    if (seg.bare && seg.kind === "edge") return;         // the asphalt is the whole board; a bare lane is only a path for the exercises
    const hw = seg.width / 2;
    this.roads.push({ pts: seg.pts, width: seg.width, surface: seg.surface, shift: seg.wide ? -seg.width / 2 : 0 });
    if (!seg.noEdges) {
      for (const [d, gaps] of [[-hw, seg.gapsL], [hw, seg.gapsR]]) {
        const off = untangle(offsetPolyline(seg.pts, d));
        for (const piece of cutPolyline(off, seg.sArr, gaps)) this.addLine(piece, seg.kind);
      }
    }
    // step lines where the road width changes
    if (prev && !seg.noEdges && Math.abs(prev.width - seg.width) > 0.01) {
      const p = seg.pts[0], q = seg.pts[1];
      const th = Math.atan2(q[1] - p[1], q[0] - p[0]), pose = { x: p[0], y: p[1], th };
      const kind = prev.width > seg.width ? prev.kind : seg.kind;
      for (const sg of [-1, 1]) this.addLine([toWorld(pose, 0, sg * prev.width / 2), toWorld(pose, 0, sg * seg.width / 2)], kind);
    }
  }

  // true when a wheel would drop off the raised part of an overpass while the others are on it
  // (the overpass has kerbs and posts along its edges: the car is stopped there)
  offRampEdge(wheels) {
    for (const r of this.ramps) {
      let on = 0, off = 0;
      for (const [x, y] of wheels) {
        const [s, l] = toLocal(r.pose, x, y);
        if (s <= r.s0 + 1.5 || s >= r.s3 - 1.5) continue;           // the low ends are open
        if (Math.abs(l) <= r.halfW) on++; else if (Math.abs(l) < r.halfW + 3) off++;
      }
      if (on && off) return true;
    }
    return false;
  }

  heightAt(x, y) {
    for (const r of this.ramps) {
      const [s, l] = toLocal(r.pose, x, y);
      if (Math.abs(l) > r.halfW || s <= r.s0 || s >= r.s3) continue;
      if (s < r.s1) return r.h * (s - r.s0) / (r.s1 - r.s0);
      if (s <= r.s2) return r.h;
      return r.h * (r.s3 - s) / (r.s3 - r.s2);
    }
    return 0;
  }

  // Two-phase signal plan: NS green 10 s, yellow 2 s, all-red 1 s, then EW.
  lightState(axis, clock) {
    const t = (((clock + this.lightOffset) % 26) + 26) % 26;
    const ph = axis === "NS" ? t : (t + 13) % 26;
    if (ph < 10) return ["green", 10 - ph];
    if (ph < 12) return ["yellow", 12 - ph];
    return ["red", 26 - ph];
  }

  build() {
    this.grid = new Map();
    this.collide = [];
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    const grow = p => { minX = Math.min(minX, p[0]); minY = Math.min(minY, p[1]); maxX = Math.max(maxX, p[0]); maxY = Math.max(maxY, p[1]); };
    this.roads.forEach(r => r.pts.forEach(grow));
    this.pads.forEach(p => p.poly.forEach(grow));
    if (this.board) this.board.frame.forEach(grow);
    this.bounds = { minX: minX - 30, minY: minY - 30, maxX: maxX + 30, maxY: maxY + 30 };
    this.lines.forEach((ln, li) => {
      if (ln.kind !== "edge" && ln.kind !== "ctrl") return;
      for (let i = 0; i < ln.pts.length - 1; i++) {
        const a = ln.pts[i], b = ln.pts[i + 1];
        const sg = { a, b, li };
        const idx = this.collide.push(sg) - 1;
        const x0 = Math.floor(Math.min(a[0], b[0]) / CELL), x1 = Math.floor(Math.max(a[0], b[0]) / CELL);
        const y0 = Math.floor(Math.min(a[1], b[1]) / CELL), y1 = Math.floor(Math.max(a[1], b[1]) / CELL);
        for (let gx = x0; gx <= x1; gx++) for (let gy = y0; gy <= y1; gy++) {
          const k = gx + "," + gy;
          if (!this.grid.has(k)) this.grid.set(k, []);
          this.grid.get(k).push(idx);
        }
      }
    });
    return this;
  }

  segmentsNear(minX, minY, maxX, maxY) {
    const out = new Set();
    for (let gx = Math.floor(minX / CELL); gx <= Math.floor(maxX / CELL); gx++)
      for (let gy = Math.floor(minY / CELL); gy <= Math.floor(maxY / CELL); gy++) {
        const c = this.grid.get(gx + "," + gy);
        if (c) c.forEach(i => out.add(i));
      }
    return [...out].map(i => this.collide[i]);
  }
}
