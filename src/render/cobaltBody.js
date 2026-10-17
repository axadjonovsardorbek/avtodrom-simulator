// Chevrolet Cobalt body built by lofting cross-sections along the car.
// Local frame: x forward from the rear axle, y up, z right. Dimensions in meters
// (Cobalt: 4.48 long, 1.735 wide, 1.51 tall, 2.62 wheelbase).
import * as THREE from "three";

export const DIM = { rear: -1.0, front: 3.456, hw: 0.861, wb: 2.62, wheelR: 0.317, archR: 0.39 };

// C1 cubic Hermite spline through [x, y] points
function spline(pts) {
  const n = pts.length;
  const m = pts.map((p, i) => i === 0 ? (pts[1][1] - p[1]) / (pts[1][0] - p[0])
    : i === n - 1 ? (p[1] - pts[n - 2][1]) / (p[0] - pts[n - 2][0])
    : (pts[i + 1][1] - pts[i - 1][1]) / (pts[i + 1][0] - pts[i - 1][0]));
  return x => {
    if (x <= pts[0][0]) return pts[0][1];
    if (x >= pts[n - 1][0]) return pts[n - 1][1];
    let i = 1; while (x > pts[i][0]) i++;
    const [x0, y0] = pts[i - 1], [x1, y1] = pts[i], h = x1 - x0, t = (x - x0) / h, t2 = t * t, t3 = t2 * t;
    return (2 * t3 - 3 * t2 + 1) * y0 + (t3 - 2 * t2 + t) * h * m[i - 1] + (-2 * t3 + 3 * t2) * y1 + (t3 - t2) * h * m[i];
  };
}
const smooth = t => { t = Math.min(1, Math.max(0, t)); return t * t * (3 - 2 * t); };

// Profiles traced from a background-free side photo of the Cobalt, scaled by the
// 2.62 m wheelbase and the 1.514 m height (rear overhang stretched to the real 1.0 m).
// Top of the lower body: rounded bumper nose, high trunk deck, rising beltline, bonnet, sloping front face.
export const belt = spline([[-1.0, 0.7], [-0.97, 0.9], [-0.93, 1.01], [-0.86, 1.13], [-0.79, 1.19], [-0.65, 1.203], [-0.5, 1.215],
  [-0.4, 1.225], [-0.15, 1.19], [0.15, 1.15], [0.45, 1.12], [1.0, 1.088], [1.5, 1.062], [2.0, 1.04], [2.45, 1.055], [2.8, 0.995],
  [3.1, 0.937], [3.3, 0.868], [3.36, 0.8], [3.4, 0.66], [3.42, 0.585], [3.445, 0.535], [3.456, 0.5]]);
// greenhouse top: long rear screen, roof, long raked windscreen (only between GH.x0 and GH.x1)
export const roof = spline([[-0.4, 1.225], [-0.2, 1.31], [0.0, 1.385], [0.2, 1.45], [0.35, 1.483], [0.6, 1.5], [1.0, 1.505],
  [1.3, 1.493], [1.5, 1.47], [1.7, 1.435], [1.9, 1.365], [2.1, 1.25], [2.3, 1.13], [2.45, 1.055]]);
export const GH = { x0: -0.4, x1: 2.45 };
const bottomBase = spline([[-1.0, 0.51], [-0.96, 0.44], [-0.93, 0.4], [-0.86, 0.36], [-0.72, 0.34], [-0.55, 0.32], [0.5, 0.29],
  [2.2, 0.29], [3.3, 0.25], [3.4, 0.27], [3.43, 0.31], [3.45, 0.4], [3.456, 0.47]]);
export function bottom(x) {
  let b = bottomBase(x);
  for (const wc of [0, DIM.wb]) {
    const dx = x - wc;
    if (Math.abs(dx) < DIM.archR) b = Math.max(b, 0.31 + Math.sqrt(DIM.archR * DIM.archR - dx * dx));
  }
  return b;
}
// plan view: rounded nose (narrow), boxier tail
export function plan(x) {
  if (x > 3.0) { const t = (x - 3.0) / (DIM.front - 3.0), p = 2.4; return 0.9 + 0.1 * Math.pow(Math.max(0, 1 - Math.pow(t, p)), 1 / p); }
  if (x < -0.7) { const t = (-0.7 - x) / (-0.7 - DIM.rear), p = 3; return 0.9 + 0.1 * Math.pow(Math.max(0, 1 - Math.pow(t, p)), 1 / p); }
  return 1;
}
// side bulge over the body height (0 = sill, 1 = shoulder)
// side bulge, with the shoulder crease (light catching ridge) that runs headlamp -> tail lamp
export const sideShape = yr => 0.955 + 0.045 * smooth(yr / 0.55) - 0.07 * smooth((yr - 0.86) / 0.14)
  + 0.012 * Math.exp(-(((yr - 0.55) / 0.04) ** 2)) - 0.006 * smooth((yr - 0.57) / 0.05);
export const halfWidth = x => DIM.hw * plan(x);
export function sideZ(x, y) {
  const b = bottom(x), t = belt(x) - topR(x);
  return halfWidth(x) * sideShape(Math.min(1, Math.max(0, (y - b) / Math.max(1e-3, t - b))));
}
// corner radius at the top of the side, smaller where the body gets thin at the ends
const topR = x => Math.min(0.045, Math.max(0.004, (belt(x) - bottom(x)) * 0.3));
// how far forward / back the body reaches at height y (front and rear faces are curved)
export function faceX(y, dir) {
  let lo = dir > 0 ? 2.9 : DIM.rear, hi = dir > 0 ? DIM.front : -0.5;
  const inside = x => y >= bottom(x) - 1e-4 && y <= belt(x) + 1e-4;
  for (let i = 0; i < 40; i++) {
    const mid = (lo + hi) / 2;
    if (dir > 0) { if (inside(mid)) lo = mid; else hi = mid; }
    else { if (inside(mid)) hi = mid; else lo = mid; }
  }
  return dir > 0 ? lo : hi;
}

/* ---------- sections ---------- */
function lowerSection(x) {
  const hw = halfWidth(x), bot = bottom(x), bel = belt(x), r = topR(x), yTop = bel - r;
  const pts = [];
  for (let i = 0; i <= 12; i++) { const yr = i / 12; pts.push([bot + (yTop - bot) * yr, hw * sideShape(yr)]); }
  const zs = hw * sideShape(1) - r;
  for (let k = 1; k <= 4; k++) { const a = k / 4 * Math.PI / 2; pts.push([yTop + r * Math.sin(a), zs + r * Math.cos(a)]); }
  for (let k = 1; k <= 6; k++) { const z = zs * (1 - k / 6); pts.push([bel + 0.022 * (1 - (z / zs) ** 2), z]); }
  return pts;   // right half, sill -> centre line, as [y, z]
}
function greenSection(x) {
  const bel = belt(x), gh = Math.max(0, roof(x) - bel);
  const gB = halfWidth(x) * sideShape(1) - 0.06, gT = gB - 0.15 * Math.min(1, gh / 0.42), r2 = Math.min(0.04, gh * 0.3);
  const pts = [];
  for (let k = 0; k <= 8; k++) { const t = k / 8; pts.push([bel + (gh - r2) * t, gB + (gT - gB) * Math.pow(t, 1.3)]); }
  for (let k = 1; k <= 3; k++) { const a = k / 3 * Math.PI / 2; pts.push([bel + gh - r2 + r2 * Math.sin(a), gT - r2 + r2 * Math.cos(a)]); }
  const zc = gT - r2;
  for (let k = 1; k <= 6; k++) { const z = zc * (1 - k / 6); pts.push([bel + gh + 0.02 * (1 - (z / zc) ** 2) * Math.min(1, gh / 0.3), z]); }
  return pts;
}
const fullSection = half => [...half.map(([y, z]) => [y, z]), ...half.slice(0, -1).reverse().map(([y, z]) => [y, -z])];

// Loft sections along x into one mesh; classify(cx, cy, cz, jHalf) -> material index.
function loft(xs, sectionFn, classify, nMat) {
  const pos = [], groups = Array.from({ length: nMat }, () => []);
  let cols = 0;
  for (const x of xs) {
    const sec = fullSection(sectionFn(x));
    cols = sec.length;
    for (const [y, z] of sec) pos.push(x, y, z);
  }
  const half = (cols + 1) / 2;
  for (let i = 0; i < xs.length - 1; i++) for (let j = 0; j < cols - 1; j++) {
    const a = i * cols + j, b = (i + 1) * cols + j, c = b + 1, d = a + 1;
    const cx = (pos[a * 3] + pos[c * 3]) / 2, cy = (pos[a * 3 + 1] + pos[c * 3 + 1]) / 2, cz = (pos[a * 3 + 2] + pos[c * 3 + 2]) / 2;
    const jHalf = j < half - 1 ? j : cols - 2 - j;
    groups[classify(cx, cy, cz, jHalf)].push(a, b, c, a, c, d);
  }
  return { pos, groups, cols };
}
function toGeometry(pos, groups) {
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  const idx = []; let start = 0;
  // empty groups would export as broken primitives, so only keep the used ones
  groups.forEach((gr, m) => { if (!gr.length) return; idx.push(...gr); g.addGroup(start, gr.length, m); start += gr.length; });
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}
// flat end cap from a section polygon at x, facing `dir` (+1 front, -1 rear)
function cap(x, dir) {
  const sec = fullSection(lowerSection(x));
  const contour = sec.map(([y, z]) => new THREE.Vector2(z, y));
  const tris = THREE.ShapeUtils.triangulateShape(contour, []);
  const pos = []; sec.forEach(([y, z]) => pos.push(x, y, z));
  const idx = [];
  for (const [a, b, c] of tris) {
    // keep the face normal pointing along dir
    const ax = sec[a], bx = sec[b], cx = sec[c];
    const nx = (bx[0] - ax[0]) * (cx[1] - ax[1]) - (bx[1] - ax[1]) * (cx[0] - ax[0]);   // (dy1*dz2 - dz1*dy2) = normal.x
    if (nx * dir > 0) idx.push(a, b, c); else idx.push(a, c, b);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx); g.computeVertexNormals();
  return g;
}

export const MAT = { paint: 0, head: 1, tail: 2, black: 3, glass: 4 };

export function buildBodyGeometries() {
  const xs = [];
  for (let x = DIM.rear; x < DIM.front - 1e-6; x += 0.025) xs.push(x);
  xs.push(DIM.front);
  const lower = loft(xs, lowerSection, (x, y, z) => {
    if ((x < -0.7 && y < 0.47) || (x > 3.28 && y < 0.4)) return MAT.black;
    return MAT.paint;
  }, 4);

  const gxs = [];
  for (let x = GH.x0; x < GH.x1 - 1e-6; x += 0.02) gxs.push(x);
  gxs.push(GH.x1);
  const green = loft(gxs, greenSection, (x, y, z, jh) => {
    const bel = belt(x), rf = roof(x);
    if (jh < 8) {
      const tall = rf - bel > 0.12;
      const inBand = y > bel + 0.03 && y < rf - 0.045 && tall;
      const inFrame = y > bel + 0.015 && y < rf - 0.03 && tall;                // black window surround
      if (inFrame && x > 1.03 && x < 1.13) return MAT.black;                 // B-pillar
      if (inFrame && x >= 2.12 && x < 2.34) return MAT.black;                // mirror sail
      const front = x >= 1.13 && x < 2.12, rear = x > 0.28 && x <= 1.03;
      if (inBand && (front || rear)) return MAT.glass;
      if (inFrame && (front || rear)) return MAT.black;
      return MAT.paint;
    }
    if (jh >= 12 && (x > 1.62 || x < 0.58)) return MAT.glass;                 // windscreen / rear screen
    return MAT.paint;
  }, 5);

  return {
    lower: toGeometry(lower.pos, lower.groups),
    green: toGeometry(green.pos, green.groups),
    capFront: cap(DIM.front, 1),
    capRear: cap(DIM.rear, -1)
  };
}

// thin dark line following the body side (door shut lines)
export function seamGeometry(x, sideSign, y0, y1) {
  const pos = [], w = 0.004;
  const n = 14;
  for (let i = 0; i <= n; i++) {
    const y = y0 + (y1 - y0) * i / n, z = sideSign * (sideZ(x, y) + 0.0025);
    pos.push(x - w, y, z, x + w, y, z);
  }
  const idx = [];
  for (let i = 0; i < n; i++) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx); g.computeVertexNormals();
  return g;
}

// rounded tyre by revolving its cross-section; axis along z
export function tyreGeometry(r = DIM.wheelR, inner = 0.205, hw = 0.0975, c = 0.04) {
  const pts = [new THREE.Vector2(inner, -hw), new THREE.Vector2(r - c, -hw)];
  for (let k = 1; k <= 6; k++) { const a = -Math.PI / 2 + k / 6 * Math.PI / 2; pts.push(new THREE.Vector2(r - c + c * Math.cos(a), -hw + c + c * Math.sin(a))); }
  for (let k = 0; k <= 6; k++) { const a = k / 6 * Math.PI / 2; pts.push(new THREE.Vector2(r - c + c * Math.cos(a), hw - c + c * Math.sin(a))); }
  pts.push(new THREE.Vector2(inner, hw));
  const g = new THREE.LatheGeometry(pts, 40);
  g.rotateX(Math.PI / 2);
  return g;
}

// Smooth lamp lens hugging the body side: x from x0 to x1, y between lo(x) and hi(x).
export function sidePatch(x0, x1, lo, hi, sideSign, nx = 28, ny = 8, off = 0.003) {
  const pos = [], idx = [];
  for (let i = 0; i <= nx; i++) {
    const x = x0 + (x1 - x0) * i / nx;
    const yl = lo(x), yh = Math.min(hi(x), belt(x) - 0.047);
    for (let j = 0; j <= ny; j++) {
      const y = yl + (yh - yl) * j / ny;
      pos.push(x, y, sideSign * (sideZ(x, y) + off));
    }
  }
  const c = ny + 1;
  for (let i = 0; i < nx; i++) for (let j = 0; j < ny; j++) {
    const a = i * c + j, b = (i + 1) * c + j;
    if (sideSign > 0) idx.push(a, b, b + 1, a, b + 1, a + 1); else idx.push(a, b + 1, b, a, a + 1, b + 1);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx); g.computeVertexNormals();
  return g;
}
// flat polygon on an end cap; pts as [z, y], facing dir (+1 front, -1 rear)
export function capPatch(x, pts, dir) {
  // the shape lies in the XY plane facing +Z; rotating about Y turns it to face +-X
  const sh = new THREE.Shape(pts.map(([z, y]) => new THREE.Vector2(dir > 0 ? -z : z, y)));
  const g = new THREE.ShapeGeometry(sh);
  g.rotateY(dir > 0 ? Math.PI / 2 : -Math.PI / 2);
  g.translate(x, 0, 0);
  g.computeVertexNormals();
  return g;
}

// Patch lying on the curved front (dir 1) or rear (dir -1) face; pts as [z, y].
export function facePatch(pts, dir, off = 0.004) {
  const sh = new THREE.Shape(pts.map(([z, y]) => new THREE.Vector2(z, y)));
  const g = new THREE.ShapeGeometry(sh, 8);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const z = p.getX(i), y = p.getY(i);
    // the face also curves back towards the corners of the car
    const back = 0.12 * Math.max(0, Math.abs(z) - 0.5) ** 2 / 0.05;
    p.setXYZ(i, faceX(y, dir) + dir * (off - back), y, z);
  }
  // make the faces point outwards
  const ix = g.index.array;
  if (dir > 0) for (let i = 0; i < ix.length; i += 3) { const t = ix[i + 1]; ix[i + 1] = ix[i + 2]; ix[i + 2] = t; }
  g.computeVertexNormals();
  return g;
}
