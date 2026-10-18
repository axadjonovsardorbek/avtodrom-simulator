// The exam ground drawn from the plan of the B/C ground (the board of the Tashkent centre): the whole area is
// asphalt, the green islands and the pale exercise pads are cut into it (src/world/boardData.js, traced from the
// plan by tools/trace-board.mjs), with the plan's markings on top: zebras, start box, parking diamonds, hatching,
// lane lines.
import { FRAME, ISLANDS, PADS, PAD, px } from "./boardData.js";
import { straighten, insetPoly, PAD_INSET } from "./straighten.js";

for (const isl of ISLANDS) { straighten(isl.grass, { strictOnly: true, tol: 0.7 }); straighten(isl.kerb, { strictOnly: true, tol: 0.7 }); }
for (const p of PADS) straighten(p);

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
// a lane arrow lying on the asphalt: centre (x, y) of the plan, pointing along `deg` (0 east, 90 south); kind: "S" straight,
// "R"/"L" turn right/left, "SR"/"SL" straight or turn (v > 0 is the driver's right)
const ARROW = {
  S: [[[-28, -3], [8, -3], [8, -11], [28, 0], [8, 11], [8, 3], [-28, 3]]],
  R: [[[-28, -3], [3, -3], [3, 12], [11, 12], [0, 24], [-11, 12], [-3, 12], [-3, 3], [-28, 3]]],
  SR: [[[-28, -3], [8, -3], [8, -11], [28, 0], [8, 11], [8, 3], [-28, 3]], [[-14, 2], [-8, 2], [-8, 13], [-2, 13], [-11, 23], [-20, 13], [-14, 13]]]
};
ARROW.L = ARROW.R.map(p => p.map(([u, v]) => [u, -v]).reverse());
ARROW.SL = ARROW.SR.map(p => p.map(([u, v]) => [u, -v]).reverse());
function arrow(W, x, y, deg, len = 56, kind = "S") {
  const a = deg * Math.PI / 180, c = Math.cos(a), s = Math.sin(a), k = len / 56;
  for (const shape of ARROW[kind]) W.addPaint(shape.map(([u, v]) => P(x + (u * c - v * s) * k, y + (u * s + v * c) * k)));
}
// a rounded rectangle of the plan (px), as metres
const rrect = (x0, y0, x1, y1, r) => [...arc(x1 - r, y0 + r, r, -Math.PI / 2, 0, 6), ...arc(x1 - r, y1 - r, r, 0, Math.PI / 2, 6), ...arc(x0 + r, y1 - r, r, Math.PI / 2, Math.PI, 6), ...arc(x0 + r, y0 + r, r, Math.PI, Math.PI * 1.5, 6)].map(p => P(...p));
const polyline = pts => pts.map(p => P(...p));
const arc = (cx, cy, r, a0, a1, n = 14) => Array.from({ length: n + 1 }, (_, i) => { const a = a0 + (a1 - a0) * i / n; return [cx + r * Math.cos(a), cy + r * Math.sin(a)]; });

const D = 150;                                       // the start box and the crossing: px east of where the plan has them
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
  // pads: a solid yellow line just inside the kerb, a dashed yellow line across the open mouth (as on the video)
  for (const p of PADS) {
    const ins = insetPoly(p, PAD_INSET), open = padOpen(p);
    let run = [];
    const flush = () => { if (run.length > 1) W.addLine(run, "paint", { width: 0.18, color: "yellow" }); run = []; };
    for (let i = 0; i < p.length; i++) {
      const a = p[i], b = p[(i + 1) % p.length];
      if (open((a[0] + b[0]) / 2, (a[1] + b[1]) / 2)) { flush(); W.addLine([ins[i], ins[(i + 1) % p.length]], "paint", { width: 0.15, color: "yellow", dash: [1.0, 0.8] }); continue; }
      if (!run.length) run.push(ins[i]);
      run.push(ins[(i + 1) % p.length]);
    }
    flush();
  }
  { const q = 4; W.addLine(closed([[-q, -q], [q, -q], [q, q], [-q, q]]), "paint", { width: 0.25, color: "yellow" }); W.addLine([[-q, -q], [q, q]], "paint", { width: 0.2, color: "yellow" }); W.addLine([[q, -q], [-q, q]], "paint", { width: 0.2, color: "yellow" }); }
  W.board.pad = name => PADS[PAD[name]];

  // zebras of the junction and of the top road
  zebra(W, 657, 498, 724, 545, "v"); zebra(W, 662, 646, 728, 690, "v");
  zebra(W, 612, 556, 655, 610, "h"); zebra(W, 732, 558, 780, 610, "h");
  zebra(W, 696 + D, 42, 737 + D, 122, "h");
  // the start box and the line at its end
  W.addLine(polyline([[745 + D, 35], [915 + D, 35], [915 + D, 125], [745 + D, 125], [745 + D, 35]]), "paint", { width: 0.25 });
  W.addLine(polyline([[915 + D, 35], [915 + D, 125]]), "paint", { width: 0.3 });
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
  for (const [x, y, d, kind] of [[850 + D, 55, 180], [850 + D, 100, 180], [1250, 48, 180], [1250, 95, 180], [770, 310, 0], [1060, 305, 0], [1055, 350, 0], [1040, 575, 180, "SR"], [1160, 575, 180], [1310, 575, 180], [1030, 527, 180, "SL"], [1150, 527, 180], [1310, 527, 180],
    [100, 340, 90], [78, 470, 90], [250, 1090, 0], [640, 1095, 0, "SL"], [975, 1105, 0], [1350, 690, -90], [1318, 965, 90, "R"], [700, 740, -90, "SR"], [680, 440, 90, "SR"], [575, 212, 0], [580, 352, 0], [155, 92, 180, "L"], [155, 130, 180, "L"]]) arrow(W, x, y, d, 56, kind);
  // road signs where the plan has them (px of the plan): each stands on the island next to that spot, 0.6 m in from the
  // kerb, its face turned to the road; a spot outside the frame faces into the ground
  const sign = (x, y, th, kind, extra = {}) => W.signs.push({ x, y, th, kind, ...extra });
  const near = (x, y) => { let best = null;
    for (const isl of ISLANDS) { const g = isl.grass; for (let i = 0; i < g.length; i++) { const a = g[i], b = g[(i + 1) % g.length], dx = b[0] - a[0], dy = b[1] - a[1], L = dx * dx + dy * dy || 1, t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (y - a[1]) * dy) / L)), qx = a[0] + dx * t, qy = a[1] + dy * t, d = Math.hypot(qx - x, qy - y);
      if (!best || d < best.d) best = { d, q: [qx, qy], g }; } }
    return best; };
  const inPoly = (g, x, y) => { let c = false; for (let i = 0, j = g.length - 1; i < g.length; j = i++) if ((g[i][1] > y) !== (g[j][1] > y) && x < (g[j][0] - g[i][0]) * (y - g[i][1]) / (g[j][1] - g[i][1]) + g[i][0]) c = !c; return c; };
  const place = (px_, py_, kinds, extra = {}) => {
    let [x, y] = P(px_, py_), th;
    const n = near(x, y), [fx, fy] = FRAME.reduce(([a, b], q) => [Math.min(a, Math.abs(q[0])), Math.min(b, Math.abs(q[1]))], [1e9, 1e9]);
    const outside = Math.abs(x) > fx - 0.5 || Math.abs(y) > fy - 0.5;
    if (outside) { x = Math.sign(x) * Math.min(Math.abs(x), fx + 1.4) || x; y = Math.sign(y) * Math.min(Math.abs(y), fy + 1.4) || y; th = Math.atan2(-y, -x); if (Math.abs(y) > fy) th = Math.sign(-y) * Math.PI / 2; else if (Math.abs(x) > fx) th = x > 0 ? Math.PI : 0; }
    else if (n && n.d < 6) {
      const inside = inPoly(n.g, x, y), ux = (n.q[0] - x) / (n.d || 1), uy = (n.q[1] - y) / (n.d || 1);
      th = inside ? Math.atan2(uy, ux) : Math.atan2(-uy, -ux);                    // towards the road
      const ox = Math.cos(th), oy = Math.sin(th); x = n.q[0] - ox * 0.6; y = n.q[1] - oy * 0.6;
    } else th = 0;
    kinds.forEach((k, i) => sign(x + Math.cos(th + Math.PI / 2) * 0.75 * (i - (kinds.length - 1) / 2) * (extra.stack ? 0 : 1), y + Math.sin(th + Math.PI / 2) * 0.75 * (i - (kinds.length - 1) / 2) * (extra.stack ? 0 : 1), th, k,
      { h: extra.stack ? 2.55 - i * 0.95 : undefined, plates: extra.plates && (!extra.stack || i === kinds.length - 1) ? extra.plates : undefined }));
  };
  const Y = (x, y, arrow = "right") => place(x, y, ["yield", arrow], { stack: true });
  const PK = (x, y) => place(x, y, ["park"], { plates: ["car", "truck"] });
  // north fence (the top road), west and east fence
  place(390, 22, ["noStop"]); place(428, 20, ["limit20"]); place(595, 22, ["zebra"]); place(680, 20, ["zebra"]); place(748 + D, 20, ["limit20", "noStop"]);
  place(33, 328, ["ahead", "aheadRight"], { plates: ["truck"] }); place(43, 460, ["right"]); place(47, 762, ["yield"]); place(55, 1035, ["left"]); place(1305, 1162, ["noStop"]); place(1390, 520, ["ahead", "aheadRight"], { plates: ["car"] });
  // north-west quarter (the zigzags)
  place(572, 260, ["right"]); place(600, 288, ["noEntry"]); Y(590, 390); place(155, 455, ["noEntry"]); place(185, 538, ["left"]); place(615, 505, ["zebra"]);
  // north-east quarter (the parking pockets)
  place(760, 400, ["zebra"]); place(742, 430, ["left"]); place(765, 492, ["zebra"]); PK(970, 482); PK(1137, 482); PK(1312, 482); PK(780, 405);
  // south-west quarter (the snakes)
  place(372, 650, ["noEntry"]); Y(250, 680); Y(465, 670); place(607, 670, ["zebra"]); place(455, 930, ["bend"]); PK(450, 967); place(590, 930, ["bend"]); PK(610, 990);
  // south-east quarter (the garages)
  place(845, 652, ["zebra"]); place(765, 680, ["zebra"]); PK(887, 740); Y(977, 685); PK(1122, 647); PK(1145, 735); Y(1220, 697); place(1267, 680, ["left"]);
  Y(797, 975); place(752, 992, ["left"]); PK(872, 985); Y(1062, 990); PK(1142, 990);
  // the paired lane signs along the north fence, as on the video
  for (const x of [-48, -22]) { sign(x, -57.6, Math.PI / 2, "ahead", { plates: ["truck"] }); sign(x + 0.9, -57.6, Math.PI / 2, "aheadRight", { plates: ["car"] }); }
  W.texts.push({ ...(([x, y]) => ({ x, y }))(P(945 + D, 80)), th: -Math.PI / 2, text: "START", size: 3.6 });
}

// which edges of a pad are open to the asphalt (no grass beside them): the exercise outline leaves them out
export function padOpen(poly) {
  const grass = ISLANDS.map(i => i.grass);
  const near = (x, y) => grass.some(g => { for (let i = 0; i < g.length; i++) { const a = g[i], b = g[(i + 1) % g.length], dx = b[0] - a[0], dy = b[1] - a[1], L = dx * dx + dy * dy || 1, t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (y - a[1]) * dy) / L)); if (Math.hypot(a[0] + dx * t - x, a[1] + dy * t - y) < 0.7) return true; } return false; });
  return (x, y) => !near(x, y);
}
