// Traces the plan of the B/C exam ground (a photo of the board of the Tashkent centre) into polygons:
// the green islands (with their kerbs) and the pale exercise pads, straightened with a perspective fit of the
// outer frame and scaled to metres. Writes src/world/boardData.js.
//
//   node tools/trace-board.mjs <plan.png>          (the plan cropped to the map, 1400 x 1180 px)
import sharp from "sharp";
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const SRC = process.argv[2];
if (!SRC) { console.error("usage: node tools/trace-board.mjs <plan.png>"); process.exit(1); }
const { data, info } = await sharp(SRC).raw().toBuffer({ resolveWithObject: true });
const W = info.width, H = info.height, C = info.channels;
const R = (x, y) => data[(y * W + x) * C], G = (x, y) => data[(y * W + x) * C + 1], B = (x, y) => data[(y * W + x) * C + 2];
const inFrame = (x, y) => x > 60 && x < 1380 && y > 40 && y < 1105;
const mk = f => { const m = new Uint8Array(W * H); for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) m[y * W + x] = f(x, y) ? 1 : 0; return m; };
const erode = (m, r) => { const o = new Uint8Array(W * H); for (let y = r; y < H - r; y++) for (let x = r; x < W - r; x++) { let ok = 1; for (let dy = -r; dy <= r && ok; dy++) for (let dx = -r; dx <= r; dx++) if (!m[(y + dy) * W + x + dx]) { ok = 0; break; } o[y * W + x] = ok; } return o; };
const dilate = (m, r) => { const o = new Uint8Array(W * H); for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (m[y * W + x]) for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) { const yy = y + dy, xx = x + dx; if (yy >= 0 && yy < H && xx >= 0 && xx < W) o[yy * W + xx] = 1; } return o; };
const open = (m, r) => dilate(erode(m, r), r), close = (m, r) => erode(dilate(m, r), r);
let green = mk((x, y) => inFrame(x, y) && R(x, y) < 58 && G(x, y) - B(x, y) > 11 && G(x, y) > 68);
let pad = mk((x, y) => inFrame(x, y) && R(x, y) > 120 && G(x, y) > 150 && B(x, y) > 150);
pad = close(open(pad, 5), 2); green = close(open(green, 2), 3);

// soften a mask (box blur twice, threshold) so that the outlines do not carry the photo's pixel noise
function soften(m, r) {
  const f = new Float32Array(W * H), t = new Float32Array(W * H);
  for (let i = 0; i < W * H; i++) f[i] = m[i];
  for (let pass = 0; pass < 2; pass++) {
    for (let y = 0; y < H; y++) { let acc = 0; for (let x = -r; x <= r; x++) acc += f[y * W + Math.max(0, x)]; for (let x = 0; x < W; x++) { t[y * W + x] = acc / (2 * r + 1); acc += f[y * W + Math.min(W - 1, x + r + 1)] - f[y * W + Math.max(0, x - r)]; } }
    for (let x = 0; x < W; x++) { let acc = 0; for (let y = -r; y <= r; y++) acc += t[Math.max(0, y) * W + x]; for (let y = 0; y < H; y++) { f[y * W + x] = acc / (2 * r + 1); acc += t[Math.min(H - 1, y + r + 1) * W + x] - t[Math.max(0, y - r) * W + x]; } }
  }
  const o = new Uint8Array(W * H); for (let i = 0; i < W * H; i++) o[i] = f[i] > 0.5 ? 1 : 0; return o;
}
// A polygon made of straight, nearly axis-aligned edges (the pads): snap the edges to the axes and keep the corners sharp
function snapAxes(poly, tol = 0.3) {
  const n = poly.length, P = poly.map(p => p.slice());
  for (let pass = 0; pass < 2; pass++) for (let i = 0; i < n; i++) {
    const a = P[i], b = P[(i + 1) % n], dx = b[0] - a[0], dy = b[1] - a[1];
    if (Math.abs(dy) < Math.abs(dx) * tol) { const y = (a[1] + b[1]) / 2; a[1] = b[1] = y; }
    else if (Math.abs(dx) < Math.abs(dy) * tol) { const x = (a[0] + b[0]) / 2; a[0] = b[0] = x; }
  }
  return P.filter((p, i) => { const q = P[(i + n - 1) % n]; return Math.hypot(p[0] - q[0], p[1] - q[1]) > 1.5; });
}
const chaikin = (p, n = 2) => { for (let k = 0; k < n; k++) { const q = []; for (let i = 0; i < p.length; i++) { const a = p[i], b = p[(i + 1) % p.length]; q.push([0.75 * a[0] + 0.25 * b[0], 0.75 * a[1] + 0.25 * b[1]], [0.25 * a[0] + 0.75 * b[0], 0.25 * a[1] + 0.75 * b[1]]); } p = q; } return p; };

function labels(m) { const lab = new Int32Array(W * H); let n = 0; const areas = [0]; for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { if (!m[y * W + x] || lab[y * W + x]) continue; n++; let cnt = 0; const st = [[x, y]]; lab[y * W + x] = n; while (st.length) { const [cx, cy] = st.pop(); cnt++; for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const nx = cx + dx, ny = cy + dy; if (nx >= 0 && nx < W && ny >= 0 && ny < H && m[ny * W + nx] && !lab[ny * W + nx]) { lab[ny * W + nx] = n; st.push([nx, ny]); } } } areas.push(cnt); } return { lab, n, areas }; }
function outline(inside) { // the outer boundary loop of a mask (region on the left of each edge)
  const next = new Map(), key = (x, y) => x + "," + y, add = (x0, y0, x1, y1) => { const k = key(x0, y0); if (!next.has(k)) next.set(k, []); next.get(k).push([x1, y1]); };
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { if (!inside(x, y)) continue; if (!inside(x, y - 1)) add(x, y, x + 1, y); if (!inside(x + 1, y)) add(x + 1, y, x + 1, y + 1); if (!inside(x, y + 1)) add(x + 1, y + 1, x, y + 1); if (!inside(x - 1, y)) add(x, y + 1, x, y); }
  const loops = [];
  while (next.size) { const [k0] = next.keys(); let [x, y] = k0.split(",").map(Number); const ring = [[x, y]]; let dir = null;
    for (;;) { const k = key(x, y), l = next.get(k); if (!l) break; let e = l[0]; if (l.length > 1 && dir) e = l.find(c => (c[0] - x) * dir[1] - (c[1] - y) * dir[0] > 0) || l[0]; l.splice(l.indexOf(e), 1); if (!l.length) next.delete(k); dir = [e[0] - x, e[1] - y]; x = e[0]; y = e[1]; if (key(x, y) === k0) break; ring.push([x, y]); }
    if (ring.length > 8) loops.push(ring); }
  const area = r => { let a = 0; for (let i = 0; i < r.length; i++) { const [x0, y0] = r[i], [x1, y1] = r[(i + 1) % r.length]; a += x0 * y1 - x1 * y0; } return Math.abs(a / 2); };
  return loops.sort((a, b) => area(b) - area(a))[0];
}
function rdp(p, eps) { if (p.length < 3) return p; const [x0, y0] = p[0], [x1, y1] = p[p.length - 1]; let md = 0, mi = 0; const dx = x1 - x0, dy = y1 - y0, L = Math.hypot(dx, dy) || 1; for (let i = 1; i < p.length - 1; i++) { const d = Math.abs(dy * p[i][0] - dx * p[i][1] + x1 * y0 - y1 * x0) / L; if (d > md) { md = d; mi = i; } } if (md > eps) { const a = rdp(p.slice(0, mi + 1), eps), b = rdp(p.slice(mi), eps); return a.slice(0, -1).concat(b); } return [p[0], p[p.length - 1]]; }
const simp = (r, eps) => { let bi = 0, md = 0; for (let i = 1; i < r.length; i++) { const d = Math.hypot(r[i][0] - r[0][0], r[i][1] - r[0][1]); if (d > md) { md = d; bi = i; } } const a = rdp(r.slice(0, bi + 1), eps), b = rdp(r.slice(bi).concat([r[0]]), eps); return a.slice(0, -1).concat(b.slice(0, -1)); };

// perspective fit: the corners of the board's outer frame (photo px) -> a metric rectangle
const CORNERS = [[47, 53], [1388, 18], [1388, 1138], [64, 1102]], RECT = { w: 134, h: 110 };
const target = [[0, 0], [RECT.w, 0], [RECT.w, RECT.h], [0, RECT.h]];
function homography(src, dst) { // 8 unknowns, gaussian elimination
  const A = [], b = [];
  for (let i = 0; i < 4; i++) { const [x, y] = src[i], [u, v] = dst[i]; A.push([x, y, 1, 0, 0, 0, -u * x, -u * y]); b.push(u); A.push([0, 0, 0, x, y, 1, -v * x, -v * y]); b.push(v); }
  for (let i = 0; i < 8; i++) { let p = i; for (let r = i + 1; r < 8; r++) if (Math.abs(A[r][i]) > Math.abs(A[p][i])) p = r; [A[i], A[p]] = [A[p], A[i]]; [b[i], b[p]] = [b[p], b[i]]; for (let r = i + 1; r < 8; r++) { const f = A[r][i] / A[i][i]; for (let c = i; c < 8; c++) A[r][c] -= f * A[i][c]; b[r] -= f * b[i]; } }
  const h = new Array(8); for (let i = 7; i >= 0; i--) { let s = b[i]; for (let c = i + 1; c < 8; c++) s -= A[i][c] * h[c]; h[i] = s / A[i][i]; } return h;
}
const h = homography(CORNERS, target);
const tf = ([x, y]) => { const d = h[6] * x + h[7] * y + 1; return [(h[0] * x + h[1] * y + h[2]) / d, (h[3] * x + h[4] * y + h[5]) / d]; };
const CENTER = tf([692, 595]);                                   // the middle of the junction becomes the origin
const m1 = p => { const [u, v] = tf(p); return [+(u - CENTER[0]).toFixed(2), +(v - CENTER[1]).toFixed(2)]; };

const out = { islands: [], pads: [] };
{ const { lab, n, areas } = labels(green);
  for (let id = 1; id <= n; id++) { if (areas[id] < 2500) continue;
    const own = (x, y) => x >= 0 && x < W && y >= 0 && y < H && lab[y * W + x] === id;
    const mask = new Uint8Array(W * H); for (let i = 0; i < W * H; i++) mask[i] = lab[i] === id ? 1 : 0;
    const soft = soften(mask, 5), wide = soften(dilate(soft, 5), 4);
    const grass = chaikin(simp(outline((x, y) => x >= 0 && x < W && y >= 0 && y < H && soft[y * W + x]), 3.2), 2);
    const kerb = chaikin(simp(outline((x, y) => x >= 0 && x < W && y >= 0 && y < H && wide[y * W + x]), 3.2), 2);
    out.islands.push({ grass: grass.map(m1), kerb: kerb.map(m1) }); } }
{ const { lab, n, areas } = labels(pad);
  for (let id = 1; id <= n; id++) { if (areas[id] < 900) continue; const own = new Uint8Array(W * H); for (let i = 0; i < W * H; i++) own[i] = lab[i] === id ? 1 : 0; const sm = soften(own, 1); let poly = simp(outline((x, y) => x >= 0 && x < W && y >= 0 && y < H && sm[y * W + x]), 3.0); if (poly.length <= 24) poly = snapAxes(poly); out.pads.push(poly.map(m1)); } }

const js = `// Generated by tools/trace-board.mjs from the plan of the B/C exam ground: do not edit by hand.
// Metres, x east, y south, origin in the middle of the junction. \`px\` converts a point of the plan photo (1400 x 1180 px).
export const FRAME = ${JSON.stringify(CORNERS.map(m1))};
export const H = ${JSON.stringify(h)}, ORIGIN = ${JSON.stringify(CENTER)};
export function px(x, y) { const d = H[6] * x + H[7] * y + 1; return [+((H[0] * x + H[1] * y + H[2]) / d - ORIGIN[0]).toFixed(2), +((H[3] * x + H[4] * y + H[5]) / d - ORIGIN[1]).toFixed(2)]; }
export const ISLANDS = ${JSON.stringify(out.islands)};
export const PADS = ${JSON.stringify(out.pads)};
`;
writeFileSync(join(dirname(fileURLToPath(import.meta.url)), "../src/world/boardData.js"), js);
console.log("islands", out.islands.length, "pads", out.pads.length, "frame", JSON.stringify(CORNERS.map(m1)), "origin", CENTER.map(v => +v.toFixed(1)));
