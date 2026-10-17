// Chevrolet Cobalt body built by lofting cross-sections along the car.
// Local frame: x forward from the rear axle, y up, z right. Dimensions in meters
// (Cobalt: 4.48 long, 1.735 wide, 1.51 tall, 2.62 wheelbase).
import * as THREE from "three";

export const DIM = { rear: -1.0, front: 3.46, hw: 0.8675, wb: 2.62, wheelR: 0.317, archR: 0.385 };

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

// top of the lower body: trunk deck, rising beltline, bonnet
export const belt = spline([[-1.0, 0.97], [-0.95, 1.03], [-0.75, 1.058], [-0.3, 1.068], [0.05, 1.075], [1.0, 1.055], [2.0, 1.02],
  [2.55, 0.995], [2.95, 0.95], [3.25, 0.9], [3.4, 0.865], [3.46, 0.8]]);
// greenhouse top: rear screen, roof, windscreen (only between 0.05 and 2.55)
export const roof = spline([[0.05, 1.075], [0.3, 1.25], [0.55, 1.385], [0.8, 1.468], [1.1, 1.505], [1.4, 1.512], [1.7, 1.492],
  [1.92, 1.445], [2.15, 1.31], [2.35, 1.165], [2.55, 0.995]]);
const bottomBase = spline([[-1.0, 0.46], [-0.85, 0.37], [-0.6, 0.35], [3.2, 0.33], [3.4, 0.36], [3.46, 0.42]]);
export function bottom(x) {
  let b = bottomBase(x);
  for (const wc of [0, DIM.wb]) {
    const dx = x - wc;
    if (Math.abs(dx) < DIM.archR) b = Math.max(b, 0.3 + Math.sqrt(DIM.archR * DIM.archR - dx * dx));
  }
  return b;
}
// plan view: rounded nose (narrow), boxier tail
export function plan(x) {
  if (x > 2.9) { const t = (x - 2.9) / (DIM.front - 2.9), p = 2.4; return 0.64 + 0.36 * Math.pow(Math.max(0, 1 - Math.pow(t, p)), 1 / p); }
  if (x < -0.5) { const t = (-0.5 - x) / (-0.5 - DIM.rear), p = 2.8; return 0.86 + 0.14 * Math.pow(Math.max(0, 1 - Math.pow(t, p)), 1 / p); }
  return 1;
}
// side bulge over the body height (0 = sill, 1 = shoulder)
export const sideShape = yr => 0.955 + 0.045 * smooth(yr / 0.55) - 0.07 * smooth((yr - 0.86) / 0.14);
export const halfWidth = x => DIM.hw * plan(x);
export function sideZ(x, y) {
  const b = bottom(x), t = belt(x) - 0.045;
  return halfWidth(x) * sideShape((y - b) / (t - b));
}

/* ---------- sections ---------- */
function lowerSection(x) {
  const hw = halfWidth(x), bot = bottom(x), bel = belt(x), r = 0.045, yTop = bel - r;
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
  groups.forEach((gr, m) => { idx.push(...gr); g.addGroup(start, gr.length, m); start += gr.length; });
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
  for (let x = 0.05; x < 2.55 - 1e-6; x += 0.02) gxs.push(x);
  gxs.push(2.55);
  const green = loft(gxs, greenSection, (x, y, z, jh) => {
    const bel = belt(x), rf = roof(x);
    if (jh < 8) {
      const inBand = y > bel + 0.035 && y < rf - 0.045 && rf - bel > 0.12;
      if (inBand && x > 1.03 && x < 1.13) return MAT.black;                  // B-pillar trim
      if (inBand && x >= 2.26 && x < 2.42) return MAT.black;                  // mirror sail triangle
      if (inBand && ((x >= 1.13 && x < 2.26) || (x > 0.34 && x <= 1.03))) return MAT.glass;
      return MAT.paint;
    }
    if (jh >= 12 && (x > 1.88 || x < 0.76)) return MAT.glass;                 // windscreen / rear screen
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
