// The exam ground drawn from the plan of the B/C ground (the board of the Tashkent centre): the whole area is
// asphalt, the green islands and the pale exercise pads are cut into it (src/world/boardData.js, traced from the
// plan by tools/trace-board.mjs), with the plan's markings on top: zebras, start box, parking diamonds, hatching,
// lane lines.
import { FRAME, ISLANDS, PADS, px } from "./boardData.js";

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
const polyline = pts => pts.map(p => P(...p));
const arc = (cx, cy, r, a0, a1, n = 14) => Array.from({ length: n + 1 }, (_, i) => { const a = a0 + (a1 - a0) * i / n; return [cx + r * Math.cos(a), cy + r * Math.sin(a)]; });

export function addBoard(W) {
  W.board = { frame: FRAME, islands: ISLANDS, pads: PADS };
  // the kerbs and the frame are the lines a car must not touch
  for (const isl of ISLANDS) W.addLine(closed(isl.kerb), "edge", { width: 0.2 });
  W.addLine(closed(FRAME), "edge", { width: 0.3 });
  // pads: a white outline (the exercise code turns the ones that matter into control lines)
  for (const p of PADS) W.addLine(closed(p), "paint", { width: 0.16 });

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
  W.texts.push({ ...(([x, y]) => ({ x, y }))(P(928, 75)), th: -Math.PI / 2, text: "START", size: 3.6 });
}
