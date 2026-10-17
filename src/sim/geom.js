// 2D geometry helpers. World plane: x to the east, y to the south (meters).
// Heading th: 0 = east, +PI/2 = south. Right-hand vector of heading = (-sin, cos).

export const DEG = Math.PI / 180;

export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const wrapAngle = a => Math.atan2(Math.sin(a), Math.cos(a));

export const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);

export function segX(a, b, c, d) {
  const d1 = cross(c, d, a), d2 = cross(c, d, b), d3 = cross(a, b, c), d4 = cross(a, b, d);
  return ((d1 > 0) !== (d2 > 0)) && ((d3 > 0) !== (d4 > 0));
}

// Convex polygon containment (any winding).
export function inPoly(P, q) {
  let s = 0;
  for (let i = 0; i < P.length; i++) {
    const v = cross(P[i], P[(i + 1) % P.length], q);
    if (v === 0) continue;
    if (!s) s = Math.sign(v); else if (Math.sign(v) !== s) return false;
  }
  return true;
}

export function segDist(p, a, b) {
  const dx = b[0] - a[0], dy = b[1] - a[1];
  const t = clamp(((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / (dx * dx + dy * dy || 1), 0, 1);
  return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy);
}

export function polyTouchesSeg(P, a, b) {
  if (inPoly(P, a) || inPoly(P, b)) return true;
  for (let i = 0; i < P.length; i++) if (segX(P[i], P[(i + 1) % P.length], a, b)) return true;
  return false;
}

export function polyNearPoint(P, q, r) {
  if (inPoly(P, q)) return true;
  for (let i = 0; i < P.length; i++) if (segDist(q, P[i], P[(i + 1) % P.length]) < r) return true;
  return false;
}

// Pose frame: s along heading, l to the right.
export function toWorld(p, s, l) {
  const c = Math.cos(p.th), n = Math.sin(p.th);
  return [p.x + c * s - n * l, p.y + n * s + c * l];
}
export function toLocal(p, x, y) {
  const dx = x - p.x, dy = y - p.y, c = Math.cos(p.th), n = Math.sin(p.th);
  return [dx * c + dy * n, -dx * n + dy * c];
}

export function polylineLength(pts) {
  let L = 0;
  for (let i = 1; i < pts.length; i++) L += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
  return L;
}

// Offset a polyline sideways by d (positive = right of travel), mitered joins.
export function offsetPolyline(pts, d) {
  const n = pts.length, out = [];
  for (let i = 0; i < n; i++) {
    const p = pts[i];
    const a = pts[Math.max(0, i - 1)], b = pts[Math.min(n - 1, i + 1)];
    let n1 = null, n2 = null;
    // zero-length neighbours (repeated points) give no direction
    if (i > 0) { const dx = p[0] - a[0], dy = p[1] - a[1], L = Math.hypot(dx, dy); if (L > 1e-9) n1 = [-dy / L, dx / L]; }
    if (i < n - 1) { const dx = b[0] - p[0], dy = b[1] - p[1], L = Math.hypot(dx, dy); if (L > 1e-9) n2 = [-dy / L, dx / L]; }
    if (!n1 && !n2) { out.push(out.length ? out[out.length - 1].slice() : p.slice()); continue; }
    let m = n1 && n2 ? [n1[0] + n2[0], n1[1] + n2[1]] : (n1 || n2);
    const ml = Math.hypot(m[0], m[1]) || 1; m = [m[0] / ml, m[1] / ml];
    const ref = n1 || n2;
    const cosH = Math.max(0.25, m[0] * ref[0] + m[1] * ref[1]);
    out.push([p[0] + m[0] * d / cosH, p[1] + m[1] * d / cosH]);
  }
  return out;
}

// Offsetting the inside of a sharp corner makes the line run past the corner and back
// (a small loop that sticks out into the road). Collapse each such loop onto the point
// where the line crosses itself; the vertex count stays the same so per-vertex data still lines up.
export function untangle(pts, window = 16) {
  const out = pts.map(p => p.slice());
  for (let i = 0; i < out.length - 3; i++) {
    for (let j = Math.min(out.length - 2, i + window); j > i + 1; j--) {
      const X = segPoint(out[i], out[i + 1], out[j], out[j + 1]);
      if (!X) continue;
      for (let k = i + 1; k <= j; k++) out[k] = X.slice();
      i = j; break;
    }
  }
  return out;
}
function segPoint(a, b, c, d) {
  const rx = b[0] - a[0], ry = b[1] - a[1], sx = d[0] - c[0], sy = d[1] - c[1];
  const den = rx * sy - ry * sx;
  if (Math.abs(den) < 1e-12) return null;
  const t = ((c[0] - a[0]) * sy - (c[1] - a[1]) * sx) / den, u = ((c[0] - a[0]) * ry - (c[1] - a[1]) * rx) / den;
  return t > 1e-9 && t < 1 - 1e-9 && u > 1e-9 && u < 1 - 1e-9 ? [a[0] + t * rx, a[1] + t * ry] : null;
}

// Cut a polyline (with per-vertex distance array) removing s-intervals.
export function cutPolyline(pts, sArr, gaps) {
  if (!gaps || !gaps.length) return [pts];
  const pieces = [];
  let cur = [];
  const inGap = s => gaps.some(([a, b]) => s > a && s < b);
  for (let i = 0; i < pts.length; i++) {
    const s = sArr[i];
    if (i > 0) {
      // split at gap boundaries that fall strictly inside this segment, in order
      const s0 = sArr[i - 1], ev = [];
      for (const [a, b] of gaps) {
        if (a > s0 && a < s) ev.push([a, 0]);
        if (b > s0 && b < s) ev.push([b, 1]);
      }
      ev.sort((u, v) => u[0] - v[0]);
      for (const [g, isEnd] of ev) {
        const t = (g - s0) / (s - s0);
        const q = [pts[i - 1][0] + (pts[i][0] - pts[i - 1][0]) * t, pts[i - 1][1] + (pts[i][1] - pts[i - 1][1]) * t];
        if (!isEnd) { cur.push(q); if (cur.length > 1) pieces.push(cur); cur = []; }
        else cur = [q];
      }
    }
    if (inGap(s)) { if (cur.length > 1) pieces.push(cur); cur = []; }
    else cur.push(pts[i]);
  }
  if (cur.length > 1) pieces.push(cur);
  return pieces;
}
