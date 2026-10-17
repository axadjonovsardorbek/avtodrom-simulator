// Turtle-style road builder: drive a pen along straights, arcs and sharp
// corners; every style change closes a road segment and hands it to the world.
import { DEG, toWorld } from "../sim/geom.js";

export const LANE = 3.5;

export class Turtle {
  constructor(world, x, y, thDeg, style) {
    this.W = world;
    this.x = x; this.y = y; this.th = thDeg * DEG;
    this.s = 0;
    this.style = { width: LANE, kind: "edge", ...style };
    this.prev = null;
    this.begin();
  }

  get pose() { return { x: this.x, y: this.y, th: this.th }; }

  begin() {
    this.seg = { pts: [[this.x, this.y]], sArr: [this.s], width: this.style.width, kind: this.style.kind,
      surface: this.style.surface || "asphalt", gapsL: [], gapsR: [], noEdges: !!this.style.noEdges };
  }
  flush() {
    if (this.seg.pts.length > 1) { this.W.addRoadSegment(this.seg, this.prev); this.prev = this.seg; }
    this.begin();
  }
  setStyle(style) { this.flush(); this.style = { width: LANE, kind: "edge", ...style }; this.begin(); return this; }
  end() { this.flush(); return this.pose; }

  push() { this.seg.pts.push([this.x, this.y]); this.seg.sArr.push(this.s); this.W.routePts.push([this.x, this.y]); }

  fwd(L, step = 1) {
    if (L <= 1e-6) return this;
    const n = Math.max(1, Math.ceil(L / step)), c = Math.cos(this.th), sn = Math.sin(this.th);
    for (let i = 0; i < n; i++) { this.x += c * L / n; this.y += sn * L / n; this.s += L / n; this.push(); }
    return this;
  }
  // deg > 0 turns right (clockwise on the map), deg < 0 turns left.
  arc(R, deg) {
    const a = deg * DEG, sg = Math.sign(a);
    const cx = this.x - Math.sin(this.th) * R * sg, cy = this.y + Math.cos(this.th) * R * sg;
    const n = Math.max(2, Math.ceil(Math.abs(a) * R / 0.5));
    for (let i = 1; i <= n; i++) {
      this.th += a / n;
      this.x = cx + Math.sin(this.th) * R * sg; this.y = cy - Math.cos(this.th) * R * sg;
      this.s += Math.abs(a) * R / n; this.push();
    }
    return this;
  }
  corner(deg) { this.th += deg * DEG; return this; }
  fwdTo(axis, value) {
    const d = axis === "x" ? Math.cos(this.th) : Math.sin(this.th);
    const cur = axis === "x" ? this.x : this.y;
    const L = (value - cur) / d;
    if (!(L > -1e-6)) throw new Error(`fwdTo ${axis}=${value}: negative length ${L.toFixed(2)} at (${this.x.toFixed(1)}, ${this.y.toFixed(1)})`);
    return this.fwd(L);
  }
  // Serpentine with zero net lateral offset and zero end slopes.
  wiggle(L, A, step = 0.4) {
    const p0 = this.pose, n = Math.ceil(L / step);
    let prev = [this.x, this.y];
    for (let i = 1; i <= n; i++) {
      const t = i / n, off = A * Math.sin(4 * Math.PI * t) * Math.sin(Math.PI * t) ** 2;
      const [x, y] = toWorld(p0, t * L, off);
      this.s += Math.hypot(x - prev[0], y - prev[1]); prev = [x, y];
      this.x = x; this.y = y; this.push();
    }
    this.th = p0.th;
    return this;
  }
  // Gap in the right/left edge, relative to the current position.
  gapR(a, b) { this.seg.gapsR.push([this.s + a, this.s + b]); return this; }
  gapL(a, b) { this.seg.gapsL.push([this.s + a, this.s + b]); return this; }
}
