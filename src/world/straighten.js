// The traced outlines of the board wobble by a few centimetres. Long edges that run (nearly) north-south or east-west on the
// plan are made exactly straight: all the vertices of such edges within one outline that lie within `tol` of each other on
// that axis share one coordinate (the mean), so the corners are right angles.
export function straighten(poly, opt = {}) {
  strict(poly, opt);
  if (opt.strictOnly) return poly;
  // a mostly rectilinear outline (the exercise pads, the blocks): its short wobbling steps are straightened too
  let all = 0, ax = 0;
  for (let i = 0; i < poly.length; i++) { const a = poly[i], b = poly[(i + 1) % poly.length], dx = Math.abs(b[0] - a[0]), dy = Math.abs(b[1] - a[1]), L = Math.hypot(dx, dy); all += L; if (Math.min(dx, dy) < 1e-6 + 0.02 * L) ax += L; }
  if (ax > 0.7 * all) { strict(poly, { tol: 0.5, ang: 0.3, minLen: 0.5 }); squareCorners(poly); }
  return poly;
}
function strict(poly, { tol = 0.4, ang = 0.07, minLen = 1.2 } = {}) {
  const n = poly.length, res = poly.map(p => p.slice());
  for (const axis of [0, 1]) {                      // 0: x (vertical edges), 1: y (horizontal edges)
    const o = 1 - axis, vals = [];
    for (let i = 0; i < n; i++) {
      const a = poly[i], b = poly[(i + 1) % n], da = Math.abs(b[axis] - a[axis]), db = Math.abs(b[o] - a[o]);
      if (db >= minLen && da <= ang * db) vals.push(i, (i + 1) % n);
    }
    const idx = [...new Set(vals)].sort((p, q) => poly[p][axis] - poly[q][axis]);
    for (let s = 0; s < idx.length;) {
      let e = s + 1; while (e < idx.length && poly[idx[e]][axis] - poly[idx[e - 1]][axis] < tol) e++;
      const m = idx.slice(s, e).reduce((t, k) => t + poly[k][axis], 0) / (e - s);
      for (let k = s; k < e; k++) res[idx[k]][axis] = +m.toFixed(2);
      s = e;
    }
  }
  for (let i = 0; i < n; i++) poly[i][0] = res[i][0], poly[i][1] = res[i][1];
  return poly;
}

// a short diagonal between a vertical and a horizontal edge is a worn corner: replace it by the right-angle corner
function squareCorners(poly) {
  const axisOf = (a, b) => Math.abs(b[0] - a[0]) < 1e-6 ? "v" : Math.abs(b[1] - a[1]) < 1e-6 ? "h" : null;
  for (let again = true, guard = 0; again && guard < 40; guard++) {
    again = false;
    for (let i = 0; i < poly.length && poly.length > 4; i++) {
      const n = poly.length, p0 = poly[(i + n - 1) % n], a = poly[i], b = poly[(i + 1) % n], q = poly[(i + 2) % n];
      if (Math.hypot(b[0] - a[0], b[1] - a[1]) > 1.2 || axisOf(a, b)) continue;
      const e1 = axisOf(p0, a), e2 = axisOf(b, q);
      if (!e1 || !e2 || e1 === e2) continue;
      const c = e1 === "v" ? [a[0], b[1]] : [b[0], a[1]];
      poly.splice(i, 2, c); again = true; break;
    }
  }
}

// the outline moved `d` metres inwards (each edge parallel to its own side; corners where the moved edges meet)
export function insetPoly(poly, d) {
  const n = poly.length; let area = 0;
  for (let i = 0; i < n; i++) { const a = poly[i], b = poly[(i + 1) % n]; area += a[0] * b[1] - b[0] * a[1]; }
  const sg = area > 0 ? 1 : -1;                     // inward normal of edge a->b is sg * (-dy, dx) / L
  const line = i => { const a = poly[i], b = poly[(i + 1) % n], dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy) || 1, nx = -dy / L * sg * d, ny = dx / L * sg * d; return [[a[0] + nx, a[1] + ny], [dx, dy]]; };
  return poly.map((p, i) => {
    const [p1, d1] = line((i + n - 1) % n), [p2, d2] = line(i), cr = d1[0] * d2[1] - d1[1] * d2[0];
    if (Math.abs(cr) < 1e-6 * Math.hypot(...d1) * Math.hypot(...d2)) return [p2[0], p2[1]];
    const t = ((p2[0] - p1[0]) * d2[1] - (p2[1] - p1[1]) * d2[0]) / cr;
    return [+(p1[0] + d1[0] * t).toFixed(3), +(p1[1] + d1[1] * t).toFixed(3)];
  });
}

// how far inside the kerb of a pad its yellow (control) line is painted
export const PAD_INSET = 0.2;
