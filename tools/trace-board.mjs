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
// outward offset of a closed polygon by d (px), mitred joints (clamped)
function offset(poly, d) {
  let a = 0; for (let i = 0; i < poly.length; i++) { const [x0, y0] = poly[i], [x1, y1] = poly[(i + 1) % poly.length]; a += x0 * y1 - x1 * y0; }
  const sgn = a > 0 ? 1 : -1, n = poly.length;
  const nrm = (p, q) => { const dx = q[0] - p[0], dy = q[1] - p[1], L = Math.hypot(dx, dy) || 1; return [sgn * dy / L, -sgn * dx / L]; };
  return poly.map((p, i) => { const n1 = nrm(poly[(i + n - 1) % n], p), n2 = nrm(p, poly[(i + 1) % n]); let mx = n1[0] + n2[0], my = n1[1] + n2[1]; const ml = Math.hypot(mx, my) || 1; mx /= ml; my /= ml; const c = Math.max(0.5, mx * n1[0] + my * n1[1]); return [p[0] + mx * d / c, p[1] + my * d / c]; });
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

/* ---- the islands, measured on the plan by hand (px of the photo): each block is the green and the pads on it,
   given as corners with a rounding radius; pads and the open ends of the exercises are cut out of it ---- */
const BLOCKS = [
  // north-west: the three islands of the 90-degree turns
  [[115, 145, 40], [625, 145, 14], [625, 177, 14], [250, 177, 0], [250, 372, 0], [115, 372, 45]],
  [[312, 245, 0], [615, 245, 40], [615, 335, 40], [350, 335, 0], [350, 380, 0], [325, 380, 0], [325, 475, 0], [150, 475, 18], [150, 437, 18], [312, 437, 0]],
  [[395, 380, 0], [650, 380, 35], [650, 551, 35], [190, 551, 10], [190, 531, 10], [395, 531, 0]],
  // north-east: the long island with the bays
  [[780, 372, 40], [957, 372, 0], [957, 362, 0], [1332, 362, 6], [1332, 497, 6], [790, 497, 0], [790, 540, 10], [760, 540, 15], [735, 510, 0], [735, 415, 45]],
  // south-west: the snake island (the bay between its lobes is left out)
  [[135, 655, 20], [150, 638, 0], [405, 632, 15], [420, 648, 0], [455, 648, 0], [640, 645, 25], [652, 660, 25], [652, 1005, 25], [638, 1018, 0], [595, 1018, 20], [580, 1003, 0], [580, 890, 0], [552, 866, 0], [462, 985, 10], [446, 988, 10], [440, 960, 0], [440, 935, 0], [400, 935, 0], [322, 1035, 15], [170, 1035, 40], [135, 1000, 30]],
  // south-east: the three garage islands
  [[732, 637, 40], [897, 637, 40], [897, 1010, 40], [732, 1010, 40]],
  [[965, 627, 35], [1135, 627, 35], [1135, 745, 0], [1135, 1046, 30], [872, 1046, 30], [872, 745, 0], [965, 745, 0]],
  [[1200, 665, 45], [1300, 665, 45], [1300, 1048, 45], [1135, 1048, 35], [1135, 733, 0], [1200, 733, 0]]
];
// asphalt cut into the blocks: the open ends of the snake and the garages, and the bays of the north-east island
const CUTS = [
  [[148, 626], [218, 626], [218, 700], [148, 700]], [[400, 628], [462, 628], [462, 682], [400, 682]],
  [[390, 915], [452, 915], [452, 955], [390, 955]], [[536, 846], [600, 846], [600, 918], [536, 918]],
  [[816, 970], [867, 970], [867, 1016], [816, 1016]], [[1080, 965], [1135, 965], [1135, 1050], [1080, 1050]],
  [[778, 366], [957, 366], [957, 430], [778, 430]],
  [[857, 465], [957, 465], [957, 502], [857, 502]], [[1027, 460], [1122, 460], [1122, 502], [1027, 502]], [[1200, 455], [1297, 455], [1297, 502], [1200, 502]]
];
const PADS_BY_HAND = [[[780, 375], [957, 375], [957, 430], [780, 430]], [[857, 465], [957, 465], [957, 497], [857, 497]], [[1027, 460], [1122, 460], [1122, 495], [1027, 495]], [[1200, 455], [1297, 455], [1297, 492], [1200, 492]]];

// a polygon with rounded corners: [x, y, r] -> points
function rounded(poly) {
  const pts = [], n = poly.length;
  for (let i = 0; i < n; i++) {
    const [x, y, r] = poly[i], p = poly[(i + n - 1) % n], q = poly[(i + 1) % n];
    if (!r) { pts.push([x, y]); continue; }
    const a = [p[0] - x, p[1] - y], b = [q[0] - x, q[1] - y], la = Math.hypot(...a), lb = Math.hypot(...b);
    const ua = [a[0] / la, a[1] / la], ub = [b[0] / lb, b[1] / lb], ang = Math.acos(Math.max(-1, Math.min(1, ua[0] * ub[0] + ua[1] * ub[1])));
    const t = Math.min(r / Math.tan(ang / 2), la / 2, lb / 2), rr = t * Math.tan(ang / 2);
    const s0 = [x + ua[0] * t, y + ua[1] * t], s1 = [x + ub[0] * t, y + ub[1] * t];
    const bis = [ua[0] + ub[0], ua[1] + ub[1]], bl = Math.hypot(...bis), cd = rr / Math.sin(ang / 2), c = [x + bis[0] / bl * cd, y + bis[1] / bl * cd];
    let a0 = Math.atan2(s0[1] - c[1], s0[0] - c[0]), a1 = Math.atan2(s1[1] - c[1], s1[0] - c[0]);
    let d = a1 - a0; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI;
    const k = Math.max(2, Math.ceil(Math.abs(d) / 0.2));
    for (let j = 0; j <= k; j++) { const aa = a0 + d * j / k; pts.push([c[0] + rr * Math.cos(aa), c[1] + rr * Math.sin(aa)]); }
  }
  return pts;
}

// the pads traced from the photo (the snake and the garages, the 90-degree zigzags), the north-east ones drawn by hand
const padPolys = [];
{ const { lab, n, areas } = labels(pad);
  for (let id = 1; id <= n; id++) { if (areas[id] < 900) continue;
    let sx = 0, sy = 0, c = 0; for (let i = 0; i < W * H; i++) if (lab[i] === id) { sx += i % W; sy += (i / W) | 0; c++; }
    if (sy / c < 560 && sx / c > 700) continue;                       // north-east: by hand
    const own = new Uint8Array(W * H); for (let i = 0; i < W * H; i++) own[i] = lab[i] === id ? 1 : 0; const sm = soften(own, 1);
    let poly = simp(outline((x, y) => x >= 0 && x < W && y >= 0 && y < H && sm[y * W + x]), 3.0);
    if (poly.length > 24) { const sm4 = soften(own, 5); poly = simp(chaikin(simp(outline((x, y) => x >= 0 && x < W && y >= 0 && y < H && sm4[y * W + x]), 2.5), 3), 0.6); }   // the snake: smooth curves
    else poly = snapAxes(poly);
    padPolys.push(poly); } }
padPolys.push(...PADS_BY_HAND);

// green = blocks - pads - cuts, rasterised and traced back into clean outlines
function inPoly(poly, [x, y]) { let c = false; for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) if ((poly[i][1] > y) !== (poly[j][1] > y) && x < (poly[j][0] - poly[i][0]) * (y - poly[i][1]) / (poly[j][1] - poly[i][1]) + poly[i][0]) c = !c; return c; }
const svgPoly = (p, fill) => `<polygon points="${p.map(q => q.map(v => v.toFixed(1)).join(",")).join(" ")}" fill="${fill}"/>`;
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}"><rect width="${W}" height="${H}" fill="black"/>` +
  BLOCKS.map(b => svgPoly(rounded(b), "white")).join("") + padPolys.map(p => svgPoly(p, "black")).join("") +
  padPolys.map(p => `<polygon points="${p.map(q => q.join(",")).join(" ")}" fill="none" stroke="black" stroke-width="3"/>`).join("") + CUTS.map(c => svgPoly(c, "black")).join("") + "</svg>";
const raw = await sharp(Buffer.from(svg)).greyscale().raw().toBuffer();
let gm = new Uint8Array(W * H); for (let i = 0; i < W * H; i++) gm[i] = raw[i] > 127 ? 1 : 0;
gm = open(gm, 2);                                              // no pinch points: every island outline is a simple loop
{ const { lab, n, areas } = labels(gm);
  for (let id = 1; id <= n; id++) { if (areas[id] < 300) continue;
    const grass = simp(outline((x, y) => x >= 0 && x < W && y >= 0 && y < H && lab[y * W + x] === id), 1.2).filter((q, i, a) => { const p = a[(i + a.length - 1) % a.length]; return Math.hypot(q[0] - p[0], q[1] - p[1]) > 0.5; });
    const kerb = offset(grass, 4), laneLoop = offset(grass, 10);
    // the white line round the island: not across the pads and the open ends
    const blocked = q => padPolys.some(p => inPoly(p, q)) || CUTS.some(c => inPoly(c, q));
    const lanes = []; let run = [];
    for (const q of laneLoop.concat([laneLoop[0]])) { if (blocked(q)) { if (run.length > 1) lanes.push(run); run = []; } else run.push(q); }
    if (run.length > 1) lanes.push(run);
    if (lanes.length > 1 && !blocked(laneLoop[0])) { const last = lanes[lanes.length - 1], f = lanes[0][0], e = last[last.length - 1]; if (Math.hypot(f[0] - e[0], f[1] - e[1]) < 15) { lanes.pop(); lanes[0] = last.concat(lanes[0]); } }
    for (const l of lanes) for (let i = 1; i < l.length; i++) if (Math.hypot(l[i][0] - l[i - 1][0], l[i][1] - l[i - 1][1]) > 40) console.warn("long lane segment", l[i - 1], l[i]);   // the loop started mid-run
    if (process.env.OVERLAY) (globalThis.ov = globalThis.ov || []).push(grass, kerb, ...lanes.map(l => l));
    out.islands.push({ grass: grass.map(m1), kerb: kerb.map(m1), lanes: lanes.map(l => l.map(m1)) }); } }
// the pads by name, from where they lie on the plan
const named = {};
padPolys.forEach((p, i) => {
  const cx = p.reduce((a, q) => a + q[0], 0) / p.length, cy = p.reduce((a, q) => a + q[1], 0) / p.length;
  const name = cy < 560 && cx < 300 ? "zigA" : cy < 560 && cx < 700 ? "zigB" : cy < 560 ? (cy < 450 ? "D1" : cx < 1000 ? "D2" : cx < 1160 ? "D3" : "D4")
    : cx < 380 ? "snakeL" : cx < 680 ? "snakeR" : cx < 900 ? "T1" : cx < 1065 ? "T2" : cx < 1145 ? "T3" : "T4";
  named[name] = i;
  out.pads.push(p.map(m1)); if (process.env.OVERLAY) (globalThis.ov = globalThis.ov || []).push(p);
});
console.log("pads", JSON.stringify(named));

const js = `// Generated by tools/trace-board.mjs from the plan of the B/C exam ground: do not edit by hand.
// Metres, x east, y south, origin in the middle of the junction. \`px\` converts a point of the plan photo (1400 x 1180 px).
export const FRAME = ${JSON.stringify(CORNERS.map(m1))};
export const H = ${JSON.stringify(h)}, ORIGIN = ${JSON.stringify(CENTER)};
export function px(x, y) { const d = H[6] * x + H[7] * y + 1; return [+((H[0] * x + H[1] * y + H[2]) / d - ORIGIN[0]).toFixed(2), +((H[3] * x + H[4] * y + H[5]) / d - ORIGIN[1]).toFixed(2)]; }
export const ISLANDS = ${JSON.stringify(out.islands)};
export const PADS = ${JSON.stringify(out.pads)};
export const PAD = ${JSON.stringify(named)};
`;
writeFileSync(join(dirname(fileURLToPath(import.meta.url)), "../src/world/boardData.js"), js);
if (process.env.OVERLAY) {
  let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">`;
  globalThis.ov.forEach((p, i) => { svg += `<polyline points="${p.map(q => q.join(",")).join(" ")}" fill="none" stroke="${["red", "yellow", "cyan"][i % 3]}" stroke-width="1.5"/>`; });
  svg += "</svg>"; await sharp(SRC).composite([{ input: Buffer.from(svg) }]).png().toFile(process.env.OVERLAY);
}
console.log("islands", out.islands.length, "pads", out.pads.length, "frame", JSON.stringify(CORNERS.map(m1)), "origin", CENTER.map(v => +v.toFixed(1)));
