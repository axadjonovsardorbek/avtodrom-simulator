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
export function squareCorners(poly) {
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

// a short step (under `max` m) between two parallel runs going the same way: the shorter run is moved over onto the
// longer one's line, so the wall is one straight line
export function removeSteps(poly, max = 0.9) {
  const ax = (a, b) => Math.abs(b[0] - a[0]) < 1e-6 ? 0 : Math.abs(b[1] - a[1]) < 1e-6 ? 1 : -1;   // 0: runs along y (x fixed), 1: along x
  for (let again = true, guard = 0; again && guard < 200; guard++) {
    again = false;
    const n = poly.length;
    for (let i = 0; i < n; i++) {
      const p = poly[(i + n - 1) % n], c = poly[i], q = poly[(i + 1) % n], r = poly[(i + 2) % n];
      const e = ax(c, q), e1 = ax(p, c), e2 = ax(q, r);
      if (e < 0 || e1 < 0 || e1 !== e2 || e1 === e || Math.hypot(q[0] - c[0], q[1] - c[1]) > max) continue;
      const k = 1 - e1, d1 = Math.sign(c[k] - p[k]), d2 = Math.sign(r[k] - q[k]);   // the runs' direction along their axis
      if (d1 !== d2) continue;                                                         // a notch, not a step
      const L1 = Math.hypot(c[0] - p[0], c[1] - p[1]), L2 = Math.hypot(r[0] - q[0], r[1] - q[1]);
      if (L1 >= L2) { q[e1] = c[e1]; r[e1] = c[e1]; } else { c[e1] = q[e1]; p[e1] = q[e1]; }
      poly.splice(L1 >= L2 ? (i + 1) % n : i, 1); again = true; break;
    }
  }
  return poly;
}

// Douglas-Peucker on a closed outline: points within `eps` of the line through their neighbours are dropped
export function simplifyClosed(poly, eps) {
  const n = poly.length; if (n < 5) return poly;
  let a = 0, far = 0; for (let i = 1; i < n; i++) { const d = Math.hypot(poly[i][0] - poly[0][0], poly[i][1] - poly[0][1]); if (d > far) { far = d; a = i; } }
  const dp = pts => { if (pts.length < 3) return pts; const A = pts[0], B = pts[pts.length - 1], dx = B[0] - A[0], dy = B[1] - A[1], L = Math.hypot(dx, dy) || 1;
    let k = 0, dm = 0; for (let i = 1; i < pts.length - 1; i++) { const d = Math.abs((pts[i][0] - A[0]) * dy - (pts[i][1] - A[1]) * dx) / L; if (d > dm) { dm = d; k = i; } }
    return dm <= eps ? [A, B] : [...dp(pts.slice(0, k + 1)).slice(0, -1), ...dp(pts.slice(k))]; };
  const r1 = dp(poly.slice(0, a + 1)), r2 = dp([...poly.slice(a), poly[0]]);
  const out = [...r1.slice(0, -1), ...r2.slice(0, -1)];
  poly.length = 0; poly.push(...out); return poly;
}
// the share of the outline's length that runs exactly along x or y
export function axisShare(poly) {
  let all = 0, ax = 0; for (let i = 0; i < poly.length; i++) { const a = poly[i], b = poly[(i + 1) % poly.length], dx = Math.abs(b[0] - a[0]), dy = Math.abs(b[1] - a[1]), L = Math.hypot(dx, dy); all += L; if (Math.min(dx, dy) < 1e-6) ax += L; }
  return ax / (all || 1);
}

// a slightly slanted edge (under 0.2 rad) of a block of straight walls is turned square: the end whose other edge runs
// across it slides along that edge
export function squareEdges(poly) {
  const n = poly.length;
  for (let i = 0; i < n; i++) {
    const p = poly[(i + n - 1) % n], a = poly[i], c = poly[(i + 1) % n], q = poly[(i + 2) % n];
    const dx = Math.abs(c[0] - a[0]), dy = Math.abs(c[1] - a[1]), L = Math.hypot(dx, dy);
    if (L < 0.3 || Math.min(dx, dy) < 1e-6 || Math.min(dx, dy) / L > 0.2) continue;
    const k = dx > dy ? 1 : 0;                              // the coordinate that should be equal at both ends
    const across = (u, v) => Math.abs(v[k] - u[k]) > Math.abs(v[1 - k] - u[1 - k]);
    if (across(c, q)) c[k] = a[k]; else if (across(p, a)) a[k] = c[k]; else c[k] = a[k];
  }
  return poly;
}

// a thin finger of the outline (two antiparallel edges less than `w` apart joined by a short end) is cut off at its base
export function removeSlivers(poly, w = 0.7) {
  for (let again = true, guard = 0; again && guard < 100; guard++) {
    again = false;
    const n = poly.length; if (n < 6) break;
    for (let i = 0; i < n; i++) {
      const p = poly[(i + n - 1) % n], a = poly[i], b = poly[(i + 1) % n], q = poly[(i + 2) % n];
      const e = Math.hypot(b[0] - a[0], b[1] - a[1]); if (e > w) continue;
      const ux = a[0] - p[0], uy = a[1] - p[1], vx = q[0] - b[0], vy = q[1] - b[1], lu = Math.hypot(ux, uy), lv = Math.hypot(vx, vy);
      if (lu < 1e-6 || lv < 1e-6 || (ux * vx + uy * vy) / (lu * lv) > -0.95) continue;
      // cut at the shorter side's length along the longer one: a and b give way to one point at the base
      const c = lu <= lv ? [b[0] + vx * lu / lv, b[1] + vy * lu / lv] : [a[0] - ux * lv / lu, a[1] - uy * lv / lu];
      const out = poly.filter((_, k) => k !== i && k !== (i + 1) % n); out.splice(i < n - 1 ? i : 0, 0, c);
      poly.length = 0; poly.push(...out);
      again = true; break;
    }
  }
  return poly;
}

// an outline that runs along the same straight line twice, in opposite directions (two blocks of the tracing that
// touch along a wall), is split there into two outlines; returns the list of outlines
export function splitPinches(poly) {
  const area = q => { let a = 0; for (let i = 0; i < q.length; i++) { const u = q[i], v = q[(i + 1) % q.length]; a += u[0] * v[1] - v[0] * u[1]; } return a / 2; };
  const n = poly.length;
  for (let i = 0; i < n; i++) for (let j = i + 2; j < n; j++) {
    if (i === 0 && j === n - 1) continue;
    const a0 = poly[i], a1 = poly[i + 1], b0 = poly[j], b1 = poly[(j + 1) % n];
    for (const k of [0, 1]) {
      const o = 1 - k;                                         // edges along o (k fixed)
      if (Math.abs(a1[k] - a0[k]) > 0.02 || Math.abs(b1[k] - b0[k]) > 0.02 || Math.abs(a0[k] - b0[k]) > 0.05) continue;
      const da = a1[o] - a0[o], db = b1[o] - b0[o];
      if (da * db >= 0) continue;
      const lo = Math.max(Math.min(a0[o], a1[o]), Math.min(b0[o], b1[o])), hi = Math.min(Math.max(a0[o], a1[o]), Math.max(b0[o], b1[o]));
      if (hi - lo < 0.3) continue;
      const P1 = [...poly.slice(0, i + 1), ...poly.slice(j + 1)], P2 = poly.slice(i + 1, j + 1);
      if (Math.abs(area(P1)) < 1 || Math.abs(area(P2)) < 1 || Math.sign(area(P1)) !== Math.sign(area(poly)) || Math.sign(area(P2)) !== Math.sign(area(poly))) continue;
      return [...splitPinches(P1), ...splitPinches(P2)];
    }
  }
  return [poly];
}

// corner cutting (Chaikin) on a closed outline: `n` rounds round every corner into a smooth curve
export function smoothClosed(poly, n = 2) {
  let p = poly;
  for (let k = 0; k < n; k++) { const q = []; for (let i = 0; i < p.length; i++) { const a = p[i], b = p[(i + 1) % p.length]; q.push([0.75 * a[0] + 0.25 * b[0], 0.75 * a[1] + 0.25 * b[1]], [0.25 * a[0] + 0.75 * b[0], 0.25 * a[1] + 0.75 * b[1]]); } p = q; }
  poly.length = 0; poly.push(...p.map(([x, y]) => [+x.toFixed(3), +y.toFixed(3)])); return poly;
}

// the stretches of an island's outline that run along an exercise pad (within `tol`) are replaced by the pad's own
// edge, which was traced more carefully (the snakes: the kerb follows the pale lane exactly)
export function snapToPads(kerb, pads, tol = 1.6) {
  const near = (q, P) => { let best = { d: 1e9 }; for (let i = 0; i < P.length; i++) { const a = P[i], b = P[(i + 1) % P.length], dx = b[0] - a[0], dy = b[1] - a[1], L = dx * dx + dy * dy || 1, t = Math.max(0, Math.min(1, ((q[0] - a[0]) * dx + (q[1] - a[1]) * dy) / L)), d = Math.hypot(a[0] + dx * t - q[0], a[1] + dy * t - q[1]); if (d < best.d) best = { d, i, t }; } return best; };
  for (const P of pads) {
    const n = kerb.length, m = P.length, hit = kerb.map(q => near(q, P));
    if (!hit.some(h => h.d < tol)) continue;
    let start = hit.findIndex(h => h.d >= tol); if (start < 0) continue;
    const out = [];
    for (let k = 0; k < n;) {
      const i = (start + k) % n;
      if (hit[i].d >= tol) { out.push(kerb[i]); k++; continue; }
      let e = k; while (e + 1 < n && hit[(start + e + 1) % n].d < tol) e++;
      const h0 = hit[i], h1 = hit[(start + e) % n];
      if (e - k < 3) { for (let j = k; j <= e; j++) out.push(kerb[(start + j) % n]); k = e + 1; continue; }
      const pt = h => { const a = P[h.i], b = P[(h.i + 1) % m]; return [a[0] + (b[0] - a[0]) * h.t, a[1] + (b[1] - a[1]) * h.t]; };
      // the pad's edge from h0 to h1, the way round that is as long as the kerb run
      let runL = 0; for (let j = k; j < e; j++) { const a = kerb[(start + j) % n], b = kerb[(start + j + 1) % n]; runL += Math.hypot(b[0] - a[0], b[1] - a[1]); }
      const walk = dir => { const pts = [pt(h0)]; let j = dir > 0 ? (h0.i + 1) % m : h0.i, L = 0, guard = 0;
        while (guard++ < m && j !== (dir > 0 ? (h1.i + 1) % m : h1.i)) { pts.push(P[j]); j = (j + dir + m) % m; }
        pts.push(pt(h1)); for (let q = 1; q < pts.length; q++) L += Math.hypot(pts[q][0] - pts[q - 1][0], pts[q][1] - pts[q - 1][1]); return { pts, L }; };
      const f = walk(1), r = walk(-1), w = Math.abs(f.L - runL) < Math.abs(r.L - runL) ? f : r;
      out.push(...w.pts); k = e + 1;
    }
    kerb.length = 0; kerb.push(...out);
  }
  return kerb;
}

// rounds an outline the way a kerb is laid: pockets of road narrower than 2 rClose are filled, fingers of island
// thinner than 2 rOpen are cut off, every corner gets at least that radius. Done on a 0.1 m grid (closing then
// opening with a disc), the new outline is traced back from the grid.
export function morphSmooth(poly, rClose = 1.3, rOpen = 1.0, cell = 0.1) {
  const xs = poly.map(p => p[0]), ys = poly.map(p => p[1]), pad = rClose + 1;
  const x0 = Math.min(...xs) - pad, y0 = Math.min(...ys) - pad, nx = Math.ceil((Math.max(...xs) + pad - x0) / cell), ny = Math.ceil((Math.max(...ys) + pad - y0) / cell);
  let g = new Uint8Array(nx * ny);
  for (let j = 0; j < ny; j++) {                                  // scanline fill
    const y = y0 + (j + 0.5) * cell, cut = [];
    for (let i = 0, k = poly.length - 1; i < poly.length; k = i++) { const a = poly[i], b = poly[k]; if ((a[1] > y) !== (b[1] > y)) cut.push(a[0] + (y - a[1]) / (b[1] - a[1]) * (b[0] - a[0])); }
    cut.sort((a, b) => a - b);
    for (let c = 0; c + 1 < cut.length; c += 2) for (let i = Math.max(0, Math.ceil((cut[c] - x0) / cell - 0.5)); i < nx && x0 + (i + 0.5) * cell < cut[c + 1]; i++) g[j * nx + i] = 1;
  }
  // chamfer distance (in cells) from every cell to the nearest cell with value v
  const dist = v => { const d = new Float32Array(nx * ny); for (let k = 0; k < d.length; k++) d[k] = g[k] === v ? 0 : 1e9;
    const pass = (j0, j1, dj, i0, i1, di) => { for (let j = j0; j !== j1; j += dj) for (let i = i0; i !== i1; i += di) { const k = j * nx + i; let m = d[k];
      if (i - di >= 0 && i - di < nx) m = Math.min(m, d[k - di] + 1); if (j - dj >= 0 && j - dj < ny) { m = Math.min(m, d[k - dj * nx] + 1); if (i - di >= 0 && i - di < nx) m = Math.min(m, d[k - dj * nx - di] + 1.4142); if (i + di >= 0 && i + di < nx) m = Math.min(m, d[k - dj * nx + di] + 1.4142); } d[k] = m; } };
    pass(0, ny, 1, 0, nx, 1); pass(ny - 1, -1, -1, nx - 1, -1, -1); return d; };
  const grow = r => { const d = dist(1); g = g.map((_, k) => d[k] <= r / cell ? 1 : 0); };
  const shrink = r => { const d = dist(0); g = g.map((_, k) => d[k] > r / cell ? 1 : 0); };
  grow(rClose); shrink(rClose); shrink(rOpen); grow(rOpen);
  // trace the outline of the island (marching squares on cell corners), walking with the island on the left
  const at = (i, j) => i >= 0 && j >= 0 && i < nx && j < ny && g[j * nx + i] === 1;
  let si = -1, sj = -1;
  for (let k = 0; k < g.length && si < 0; k++) if (g[k] && !at((k % nx), ((k / nx) | 0) - 1)) { si = k % nx; sj = (k / nx) | 0; }
  if (si < 0) return poly;
  const out = []; let i = si, j = sj, dir = 0;                      // corner (i, j) = top-left of cell (i, j); dir 0: +x, 1: +y, 2: -x, 3: -y
  const DX = [1, 0, -1, 0], DY = [0, 1, 0, -1];
  for (let guard = 0; guard < 4 * nx * ny; guard++) {
    out.push([x0 + i * cell, y0 + j * cell]);
    i += DX[dir]; j += DY[dir];
    if (i === si && j === sj) break;
    // the two cells ahead of the corner, seen along dir: left (island side) and right
    const cellsAhead = d => { const L = [[i, j - 1], [i, j], [i - 1, j], [i - 1, j - 1]][d], R = [[i, j], [i - 1, j], [i - 1, j - 1], [i, j - 1]][d]; return [at(...L), at(...R)]; };
    for (const turn of [1, 0, 3]) { const d = (dir + turn) % 4, [l, r] = cellsAhead(d); if (r && !l) { dir = d; break; } }
  }
  const res = out.length > 8 ? out : poly;
  poly.length = 0; poly.push(...res);
  simplifyClosed(poly, 0.15); smoothClosed(poly, 2);
  return poly;
}
