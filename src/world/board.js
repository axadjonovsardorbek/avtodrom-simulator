// The exam ground drawn from the plan of the B/C ground (the board of the Tashkent centre): the whole area is
// asphalt, the green islands and the pale exercise pads are cut into it (src/world/boardData.js, traced from the
// plan by tools/trace-board.mjs), with the plan's markings on top: zebras, start box, parking diamonds, hatching,
// lane lines.
import { FRAME, ISLANDS, PADS, PAD, px } from "./boardData.js";

const P = (x, y) => px(x, y);
const closed = poly => [...poly, poly[0]];

// bars of a zebra crossing inside the plan rectangle (x0,y0)-(x1,y1); `dir` "v": vertical bars (the way runs up-down), "h": horizontal
function zebra(W, x0, y0, x1, y1, dir) {
  const n = Math.round((dir === "v" ? x1 - x0 : y1 - y0) / 9.6), span = (dir === "v" ? x1 - x0 : y1 - y0) / n;
  for (let i = 0; i < n; i++) {
    const a = (dir === "v" ? x0 : y0) + i * span + span * 0.12, b = a + span * 0.6;
    W.addPaint(dir === "v" ? [P(a, y0), P(b, y0), P(b, y1), P(a, y1)] : [P(x0, a), P(x1, a), P(x1, b), P(x0, b)]);
  }
}
// diagonal white hatching of a polygon of the plan
function hatch(W, poly, step = 14) {
  const xs = poly.map(p => p[0]), ys = poly.map(p => p[1]), x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
  for (let c = x0 - (y1 - y0); c < x1; c += step) {          // lines x - y = c - y0 ... running down-right
    const hits = [];
    for (let i = 0; i < poly.length; i++) {
      const [ax, ay] = poly[i], [bx, by] = poly[(i + 1) % poly.length];
      const da = (ax - ay) - (c - y0), db = (bx - by) - (c - y0);
      if ((da < 0) === (db < 0)) continue;
      const t = da / (da - db); hits.push([ax + (bx - ax) * t, ay + (by - ay) * t]);
    }
    hits.sort((p, q) => p[0] - q[0]);
    for (let i = 0; i + 1 < hits.length; i += 2) W.addLine([P(...hits[i]), P(...hits[i + 1])], "paint", { width: 0.22 });
  }
}
// a lane arrow lying on the asphalt: centre (x, y) of the plan, pointing along `deg` (0 east, 90 south)
function arrow(W, x, y, deg, len = 56) {
  const a = deg * Math.PI / 180, c = Math.cos(a), s = Math.sin(a), k = len / 56;
  const shape = [[-28, -3], [8, -3], [8, -11], [28, 0], [8, 11], [8, 3], [-28, 3]].map(([u, v]) => P(x + (u * c - v * s) * k, y + (u * s + v * c) * k));
  W.addPaint(shape);
}
// a rounded rectangle of the plan (px), as metres
const rrect = (x0, y0, x1, y1, r) => [...arc(x1 - r, y0 + r, r, -Math.PI / 2, 0, 6), ...arc(x1 - r, y1 - r, r, 0, Math.PI / 2, 6), ...arc(x0 + r, y1 - r, r, Math.PI / 2, Math.PI, 6), ...arc(x0 + r, y0 + r, r, Math.PI, Math.PI * 1.5, 6)].map(p => P(...p));
const polyline = pts => pts.map(p => P(...p));
const arc = (cx, cy, r, a0, a1, n = 14) => Array.from({ length: n + 1 }, (_, i) => { const a = a0 + (a1 - a0) * i / n; return [cx + r * Math.cos(a), cy + r * Math.sin(a)]; });

export function addBoard(W) {
  W.board = { frame: FRAME, islands: ISLANDS, pads: PADS };
  // the islands cannot be driven over: a row of low kerb posts along the edge of every island and round the whole plan
  // (solids with the 4th field 1: they stop the car but are not a crash; touching the line is the penalty)
  const posts = [], along = (poly, r, step = 0.45) => { for (let i = 0; i < poly.length; i++) { const a = poly[i], b = poly[(i + 1) % poly.length], L = Math.hypot(b[0] - a[0], b[1] - a[1]), n = Math.max(1, Math.ceil(L / step)); for (let k = 0; k < n; k++) posts.push([a[0] + (b[0] - a[0]) * k / n, a[1] + (b[1] - a[1]) * k / n, r, 1]); } };
  for (const isl of ISLANDS) along(isl.grass, 0.25);
  along(FRAME.map(([x, y]) => [x + Math.sign(x) * 0.6, y + Math.sign(y) * 0.6]), 0.3);
  W.baseSolids = posts; W.solids = posts.slice(); W.solidGrid = null;
  // the kerbs and the frame are the lines a car must not touch
  for (const isl of ISLANDS) W.addLine(closed(isl.kerb), "edge", { width: 0.2, hidden: true });
  W.addLine(closed(FRAME), "edge", { width: 0.3 });
  // the lane line that runs round every island, a little way out from its kerb
  for (const isl of ISLANDS) for (const l of isl.lanes || []) W.addLine(l, "paint", { width: 0.14 });
  // the inner loop roads of the quarters, outlined as on the plan
  for (const [x0, y0, x1, y1, r] of [[100, 598, 668, 1062, 45], [712, 598, 1318, 1080, 50]]) W.addLine(closed(rrect(x0, y0, x1, y1, r)), "paint", { width: 0.16 });
  // pads: a white outline (the exercise code turns the ones that matter into control lines)
  for (const p of PADS) W.addLine(closed(p), "paint", { width: 0.16 });
  W.board.pad = name => PADS[PAD[name]];

  // zebras of the junction and of the top road
  zebra(W, 657, 498, 724, 545, "v"); zebra(W, 662, 646, 728, 690, "v");
  zebra(W, 612, 556, 655, 610, "h"); zebra(W, 732, 558, 780, 610, "h");
  zebra(W, 696, 42, 737, 122, "h");
  // the start box and the line at its end
  W.addLine(polyline([[745, 35], [915, 35], [915, 125], [745, 125], [745, 35]]), "paint", { width: 0.25 });
  W.addLine(polyline([[915, 28], [915, 125]]), "paint", { width: 0.3 });
  // the parking area: its outline (a stadium) and the diamonds
  W.addLine(polyline([[745, 108], [1215, 108], ...arc(1215, 197, 89, -Math.PI / 2, Math.PI / 2), [735, 286]]), "paint", { width: 0.2 });
  for (let k = 0; k < 11; k++) { const cx = 760 + 45 * k; W.addLine(polyline([[cx - 40, 170], [cx, 130], [cx + 40, 170], [cx, 210], [cx - 40, 170]]), "paint", { width: 0.14 }); }
  // the north-east road: its outline, the line at its end, the dashed middle
  W.addLine(polyline([[735, 286], [1232, 286], [1232, 365]]), "paint", { width: 0.2 });
  W.addLine(polyline([[705, 400], [705, 335], ...arc(740, 335, 35, Math.PI, Math.PI * 1.5, 8).slice(0, -1), [735, 286]]), "paint", { width: 0.2 });
  W.addLine(polyline([[790, 330], [1215, 330]]), "paint", { width: 0.14, dash: [2.2, 2.2] });
  // the east road (two ways): its outline and the dashed middle
  W.addLine(polyline([[790, 500], [790, 592], [1235, 598]]), "paint", { width: 0.2 });
  W.addLine(polyline([[810, 545], [1335, 545]]), "paint", { width: 0.14, dash: [2.2, 2.2] });
  // top road: the lane line, and the west road's dashed middle
  W.addLine(polyline([[150, 96], [690, 96]]), "paint", { width: 0.16 });
  W.addLine(polyline([[88, 150], [88, 450]]), "paint", { width: 0.14, dash: [2.2, 2.2] });
  W.addLine(polyline([[445, 45], [445, 135]]), "paint", { width: 0.3 });
  // hatching (no entry)
  hatch(W, [[68, 498], [130, 522], [166, 548], [160, 578], [68, 580]]);
  hatch(W, [[1337, 365], [1385, 365], [1385, 495], [1337, 495]]);
  hatch(W, [[662, 1085], [714, 1030], [714, 1085]], 12);
  // lane arrows (the way each lane runs, as on the plan)
  for (const [x, y, d] of [[850, 55, 180], [850, 100, 180], [1085, 48, 180], [1085, 95, 180], [770, 310, 0], [1060, 305, 0], [1055, 350, 0], [1040, 575, 180], [1160, 575, 180], [1310, 575, 180], [1030, 527, 180], [1150, 527, 180], [1310, 527, 180],
    [100, 340, 90], [78, 470, 90], [250, 1090, 0], [640, 1095, 0], [975, 1105, 0], [1350, 690, -90], [1318, 965, 90], [700, 740, -90], [680, 440, 90], [575, 212, 0], [580, 352, 0], [155, 92, 180], [155, 130, 180]]) arrow(W, x, y, d);
  // road signs as on the video: a give-way sign over a blue arrow on the tip of every island, P signs at the corners of the
  // pads, paired blue lane signs along the north fence, "no stopping" at the start
  const sign = (x, y, th, kind, extra = {}) => W.signs.push({ x, y, th, kind, ...extra });
  ISLANDS.forEach((isl, k) => {
    const g = isl.grass, cx = g.reduce((a, p) => a + p[0], 0) / g.length, cy = g.reduce((a, p) => a + p[1], 0) / g.length;
    if (g.length < 8) return;
    let best = g[0], d = 0; for (const p of g) { const e = Math.hypot(p[0] - cx, p[1] - cy); if (e > d) { d = e; best = p; } }
    const x = best[0] + (cx - best[0]) * 0.07, y = best[1] + (cy - best[1]) * 0.07, th = Math.atan2(best[1] - cy, best[0] - cx) + Math.PI;
    sign(x, y, th, "yield", { big: true }); sign(x, y, th, ["right", "left", "ahead"][k % 3], { h: 1.45 });
  });
  for (const p of PADS) { const a = p[0], b = p[1]; sign((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, Math.atan2(b[1] - a[1], b[0] - a[0]) + Math.PI / 2, "park"); }
  for (const x of [-48, -22, 4, 30]) { const [X, Y] = [x, -52.5]; sign(X, Y, Math.PI / 2, "ahead", { big: true }); sign(X + 1.2, Y, Math.PI / 2, "aheadRight", { big: true }); }
  { const [x, y] = P(930, 20); sign(x, y, Math.PI, "noStop", { big: true }); }
  W.texts.push({ ...(([x, y]) => ({ x, y }))(P(928, 75)), th: -Math.PI / 2, text: "START", size: 3.6 });
}

// which edges of a pad are open to the asphalt (no grass beside them): the exercise outline leaves them out
export function padOpen(poly) {
  const grass = ISLANDS.map(i => i.grass);
  const near = (x, y) => grass.some(g => { for (let i = 0; i < g.length; i++) { const a = g[i], b = g[(i + 1) % g.length], dx = b[0] - a[0], dy = b[1] - a[1], L = dx * dx + dy * dy || 1, t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (y - a[1]) * dy) / L)); if (Math.hypot(a[0] + dx * t - x, a[1] + dy * t - y) < 0.7) return true; } return false; });
  return (x, y) => !near(x, y);
}
