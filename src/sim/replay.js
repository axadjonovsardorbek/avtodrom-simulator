// Records the run (car pose 10 times a second plus where each penalty happened) so it can be
// watched again from above, with the mistakes marked.

const EVERY = 0.1;                                   // seconds between samples
const FIELDS = ["x", "y", "th", "h", "pitch", "steer", "sw", "wheelSpin", "v", "sig", "brake"];

export class Recorder {
  constructor() { this.reset(); }
  reset() { this.samples = []; this.marks = []; this.next = 0; }
  sample(s) {
    if (s.clock < this.next) return;
    this.next = s.clock + EVERY;
    const c = s.car; this.samples.push([s.clock, ...FIELDS.map(f => c[f] || 0)]);
  }
  mark(s, ev) { this.marks.push({ t: s.clock, x: s.car.x, y: s.car.y, h: s.car.h || 0, pts: ev.pts, n: ev.n, text: ev.text }); }
  get duration() { return this.samples.length ? this.samples[this.samples.length - 1][0] : 0; }

  // pose at time t (interpolated); angles and steering are blended, the rest copied
  at(t) {
    const S = this.samples; if (!S.length) return null;
    if (t <= S[0][0]) return this.pose(S[0], S[0], 0);
    if (t >= S[S.length - 1][0]) return this.pose(S[S.length - 1], S[S.length - 1], 0);
    let lo = 0, hi = S.length - 1;
    while (hi - lo > 1) { const m = (lo + hi) >> 1; if (S[m][0] <= t) lo = m; else hi = m; }
    return this.pose(S[lo], S[hi], (t - S[lo][0]) / (S[hi][0] - S[lo][0] || 1));
  }
  pose(a, b, u) {
    const o = {};
    FIELDS.forEach((f, i) => {
      const x = a[i + 1], y = b[i + 1];
      o[f] = f === "sig" || f === "brake" ? x : f === "th" ? x + Math.atan2(Math.sin(y - x), Math.cos(y - x)) * u : x + (y - x) * u;
    });
    return o;
  }
}
