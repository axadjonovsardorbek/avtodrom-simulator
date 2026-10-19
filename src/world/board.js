// The exam ground drawn from the plan of the B/C ground (the board of the Tashkent centre): the whole area is
// asphalt, the green islands and the pale exercise pads are cut into it (src/world/boardData.js, traced from the
// plan by tools/trace-board.mjs), with the plan's markings on top: zebras, start box, parking diamonds, hatching,
// lane lines.
import { FRAME, ISLANDS, PADS, PAD, px } from "./boardData.js";
import { straighten, insetPoly, PAD_INSET, squareCorners, removeSteps, simplifyClosed, axisShare, squareEdges, removeSlivers, splitPinches, smoothClosed, snapToPads } from "./straighten.js";

// the kerbs of the plan are traced by hand: their long straight runs are made exactly straight, and the little steps of
// the tracing (jogs under 1.3 m between two parallel runs) are taken out, so the lanes have clean walls as on the
// aerial photo; the grass is the kerb 0.4 m in
for (const isl of ISLANDS.slice()) {
  straighten(isl.kerb, { strictOnly: true, tol: 1.3 });
  if (axisShare(isl.kerb) > 0.6) {                      // a block of straight walls (not a snake): smooth out the tracing
    simplifyClosed(isl.kerb, 0.5); straighten(isl.kerb, { strictOnly: true, tol: 1.3, ang: 0.12, minLen: 0.8 }); squareEdges(isl.kerb); squareEdges(isl.kerb);
  }
  else { simplifyClosed(isl.kerb, 0.25); smoothClosed(isl.kerb, 2); isl.smooth = true; }   // the snakes: one smooth curve, as on the plan
  if (!isl.smooth) { squareCorners(isl.kerb); removeSteps(isl.kerb); removeSlivers(isl.kerb); }
  snapToPads(isl.kerb, [PADS[PAD.snakeR], PADS[PAD.snakeL]]);            // the walls of the snakes follow their pale lanes
  // drop repeated points and the spikes the straightening can leave (an edge that turns straight back on the one before)
  const k = isl.kerb;
  for (let again = true; again;) {
    again = false;
    for (let i = 0; i < k.length && k.length > 3; i++) {
      const p = k[(i + k.length - 1) % k.length], c = k[i], q = k[(i + 1) % k.length];
      const ax = c[0] - p[0], ay = c[1] - p[1], bx = q[0] - c[0], by = q[1] - c[1], la = Math.hypot(ax, ay), lb = Math.hypot(bx, by);
      if (la < 0.05 || lb < 0.05 || (ax * bx + ay * by) / (la * lb) < -0.3) { k.splice(i, 1); again = true; break; }
    }
  }
  // the west wall of the 90-degree corridor runs straight down to its mouth (the tracing stepped it out half way)
  for (const q of isl.kerb) if (Math.abs(q[0] + 37.22) < 0.3 && Math.abs(q[1] + 21.71) < 0.3) q[0] = -34.64;
  for (let i = 0; i < isl.kerb.length; i++) { const q = isl.kerb[i], r = isl.kerb[(i + 1) % isl.kerb.length];
    if (Math.abs(q[0] + 34.64) < 0.01 && Math.abs(q[1] + 21.71) < 0.3 && Math.abs(r[0] + 37.22) < 0.3 && Math.abs(r[1] + 12.19) < 0.3) { isl.kerb.splice(i + 1, 0, [-34.64, -12.19]); break; } }
  for (let i = isl.kerb.length - 1; i > 0; i--) if (Math.hypot(isl.kerb[i][0] - isl.kerb[i - 1][0], isl.kerb[i][1] - isl.kerb[i - 1][1]) < 0.05) isl.kerb.splice(i, 1);
  // the thin island under the 90-degree corridor is only about 2 m deep west of the corridor's mouth (as on the plan)
  { const k = isl.kerb, i = k.findIndex(q => Math.abs(q[0] + 55.36) < 0.3 && Math.abs(q[1] + 16.55) < 0.3);
    if (i >= 0 && Math.abs(k[i - 1][0] + 56.27) < 0.3) k.splice(i - 1, 2, [-56.1, -13.1], [-55.4, -14.0], [-48.36, -14.0], [-48.36, -16.55]); }
  { const parts = splitPinches(isl.kerb);                 // two blocks that touch along a wall become two islands
    isl.kerb = parts[0]; for (const q of parts.slice(1)) ISLANDS.push({ kerb: q, grass: q, lanes: [] }); }
  isl.grass = isl.kerb;                                // the kerb is drawn as a 0.4 m band just inside this outline
}
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
// lines fanning out from `apex` to points spread between `a` and `b` (the gore where a road branches off), outlined
function fan(W, apex, a, b, n) {
  W.addLine(polyline([apex, a]), "paint", { width: 0.16 }); W.addLine(polyline([apex, b]), "paint", { width: 0.16 });
  for (let i = 1; i < n; i++) { const t = i / n, mid = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]; W.addLine(polyline([[apex[0] + (mid[0] - apex[0]) * 0.15, apex[1] + (mid[1] - apex[1]) * 0.15], mid]), "paint", { width: 0.16 }); }
  W.addLine(polyline([a, b]), "paint", { width: 0.16 });
}
// a lane arrow lying on the asphalt (the 1.18 markings of the video): centre (x, y) of the plan, pointing along `deg`
// (0 east, 90 south). kind: "S" straight, "R"/"L" a turn (the shaft bends round to the right/left), "SR"/"SL" straight
// with a turn branching off it, "LR" both turns. In arrow units: u forward, v to the driver's right; 56 units long.
const AW = 2.6, AH = 7.5, AHL = 13;
function ribbonArrow(c) {                          // centre line -> outline with a head at its end
  const n = c.length, L = [], R = [];
  for (let i = 0; i < n; i++) {
    const a = c[Math.max(0, i - 1)], b = c[Math.min(n - 1, i + 1)], dx = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dx, dy) || 1, nx = -dy / l, ny = dx / l;
    L.push([c[i][0] + nx * AW, c[i][1] + ny * AW]); R.push([c[i][0] - nx * AW, c[i][1] - ny * AW]);
  }
  const e = c[n - 1], p = c[n - 2], dx = e[0] - p[0], dy = e[1] - p[1], l = Math.hypot(dx, dy) || 1, tx = dx / l, ty = dy / l, nx = -ty, ny = tx;
  return [...L, [e[0] + nx * AH, e[1] + ny * AH], [e[0] + tx * AHL, e[1] + ty * AHL], [e[0] - nx * AH, e[1] - ny * AH], ...R.reverse()];
}
const bend = (u0, sg, r = 11, ext = 3) => {        // from (u0, 0) round a quarter circle to the side sg (+1 right)
  const pts = []; for (let i = 0; i <= 8; i++) { const a = Math.PI / 2 * i / 8; pts.push([u0 + r * Math.sin(a), sg * (r - r * Math.cos(a))]); }
  pts.push([u0 + r, sg * (r + ext)]); return pts;
};
const ARROW = {
  S: [ribbonArrow([[-28, 0], [15, 0]])],
  R: [ribbonArrow([[-28, 0], ...bend(-8, 1)])],
  L: [ribbonArrow([[-28, 0], ...bend(-8, -1)])],
  SR: [ribbonArrow([[-28, 0], [15, 0]]), ribbonArrow(bend(-16, 1, 10, 2))],
  SL: [ribbonArrow([[-28, 0], [15, 0]]), ribbonArrow(bend(-16, -1, 10, 2))],
  LR: [ribbonArrow([[-28, 0], ...bend(-8, 1)]), ribbonArrow([[-28, 0], ...bend(-8, -1)])]
};
// the arrow is slid along its lane (up to 8 m back or forward, a little sideways) until it touches no kerb, no line
// and no other marking
function arrow(W, x, y, deg, len = 56, kind = "S") {
  const a = deg * Math.PI / 180, c = Math.cos(a), s = Math.sin(a), k = len / 56;
  const make = (du, dv) => ARROW[kind].map(shape => shape.map(([u, v]) => P(x + ((u + du) * c - (v + dv) * s) * k, y + ((u + du) * s + (v + dv) * c) * k)));
  const segD = (p, q, r) => { const dx = r[0] - q[0], dy = r[1] - q[1], L = dx * dx + dy * dy || 1, t = Math.max(0, Math.min(1, ((p[0] - q[0]) * dx + (p[1] - q[1]) * dy) / L)); return Math.hypot(q[0] + dx * t - p[0], q[1] + dy * t - p[1]); };
  const inPoly = (g, px_, py_) => { let r = false; for (let i = 0, j = g.length - 1; i < g.length; j = i++) if ((g[i][1] > py_) !== (g[j][1] > py_) && px_ < (g[j][0] - g[i][0]) * (py_ - g[i][1]) / (g[j][1] - g[i][1]) + g[i][0]) r = !r; return r; };
  const clash = shapes => shapes.some(sh => sh.some(q =>
    ISLANDS.some(({ kerb: g }) => inPoly(g, q[0], q[1]) || g.some((u, i) => segD(q, u, g[(i + 1) % g.length]) < 0.5)) ||
    W.lines.some(ln => !ln.hidden && ln.pts.some((u, i) => i + 1 < ln.pts.length && segD(q, u, ln.pts[i + 1]) < 0.25)) ||
    W.paint.some(pt => pt.poly.length <= 5 && inPoly(pt.poly, q[0], q[1]))));
  let best = make(0, 0);
  search: for (let r = 0; r <= 80; r += 5) for (const du of r ? [-r, r] : [0]) for (const dv of [0, -4, 4, -8, 8]) { const sh = make(du, dv); if (!clash(sh)) { best = sh; break search; } }
  for (const sh of best) W.addPaint(sh);
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
  for (const isl of ISLANDS) along(isl.kerb, 0.2);
  along(FRAME.map(([x, y]) => [x + Math.sign(x) * 0.6, y + Math.sign(y) * 0.6]), 0.3);
  W.baseSolids = posts; W.solids = posts.slice(); W.solidGrid = null;
  // the kerbs and the frame are the lines a car must not touch
  for (const isl of ISLANDS) W.addLine(closed(isl.kerb), "edge", { width: 0.2, hidden: true });
  W.addLine(closed(FRAME), "edge", { width: 0.3 });
  // (the plan draws a second outline 0.6 m out from every kerb: that is the kerb itself, the video has no line there)
  // the yellow lines of the exercises (as on the video): painted 0.2 m out from the kerb wherever the kerb lines an
  // exercise lane: a narrow corridor (another kerb within 5.5 m across it) or a pad of the plan; a short dashed yellow
  // line across the mouth of each pad
  {
    W.board.yellow = [];
    const edgeDist = (g, x, y) => { let d = 1e9; for (let i = 0; i < g.length; i++) { const a = g[i], b = g[(i + 1) % g.length], dx = b[0] - a[0], dy = b[1] - a[1], L = dx * dx + dy * dy || 1, t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (y - a[1]) * dy) / L)); d = Math.min(d, Math.hypot(a[0] + dx * t - x, a[1] + dy * t - y)); } return d; };
    const inPoly = (g, x, y) => { let c = false; for (let i = 0, j = g.length - 1; i < g.length; j = i++) if ((g[i][1] > y) !== (g[j][1] > y) && x < (g[j][0] - g[i][0]) * (y - g[i][1]) / (g[j][1] - g[i][1]) + g[i][0]) c = !c; return c; };
    for (const isl of ISLANDS) {
      const k = isl.kerb, n = k.length; let ar = 0;
      for (let i = 0; i < n; i++) { const a = k[i], b = k[(i + 1) % n]; ar += a[0] * b[1] - b[0] * a[1]; }
      const pts = [];                                         // [x, y, yellow?] along the kerb, 0.2 m out
      for (let i = 0; i < n; i++) {
        const a = k[i], b = k[(i + 1) % n], dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy); if (L < 1e-6) continue;
        const ox = dy / L * Math.sign(ar), oy = -dx / L * Math.sign(ar), m = Math.max(1, Math.round(L / 0.5));
        for (let j = 0; j < m; j++) {
          const t = j / m, x = a[0] + dx * t, y = a[1] + dy * t;
          let narrow = false; for (let r = 1; r <= 5.5; r += 0.25) if (onIsland(x + ox * r, y + oy * r)) { narrow = true; break; }
          const qx = x + ox * 0.6, qy = y + oy * 0.6, pad = PADS.some(g => inPoly(g, qx, qy));
          if (!pad && !PADS.some(g => inPoly(g, qx, qy) || edgeDist(g, qx, qy) < 3)) { pts.push([x + ox * 0.2, y + oy * 0.2, false]); continue; }
          pts.push([x + ox * 0.2, y + oy * 0.2, (narrow || pad) && !onIsland(x + ox * 0.3, y + oy * 0.3)]);
        }
      }
      let start = pts.findIndex(q => !q[2]); if (start < 0) start = 0;
      let run = [];
      const flush = () => { let L = 0; for (let i = 1; i < run.length; i++) L += Math.hypot(run[i][0] - run[i - 1][0], run[i][1] - run[i - 1][1]); if (L > 1.5) { W.addLine(run, "paint", { width: 0.16, color: "yellow" }); W.board.yellow.push(run); } run = []; };
      for (let j = 1; j <= pts.length; j++) { const q = pts[(start + j) % pts.length]; if (q[2]) run.push([q[0], q[1]]); else flush(); }
      flush();
    }
    for (const p of PADS) {
      const ins = insetPoly(p, PAD_INSET), n = p.length; let ar = 0;
      for (let i = 0; i < n; i++) { const a = p[i], b = p[(i + 1) % n]; ar += a[0] * b[1] - b[0] * a[1]; }
      const isOpen = p.map((a, i) => { const b = p[(i + 1) % n], dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy) || 1, ox = dy / L * Math.sign(ar), oy = -dx / L * Math.sign(ar);
        return [0.25, 0.5, 0.75].filter(t => !onIsland(a[0] + dx * t + ox, a[1] + dy * t + oy)).length >= 2; });
      for (let i = 0; i < n; i++) { const a = p[i], b = p[(i + 1) % n], L = Math.hypot(b[0] - a[0], b[1] - a[1]);
        if (isOpen[i] && !isOpen[(i + n - 1) % n] && !isOpen[(i + 1) % n] && L > 2 && L < 8) W.addLine([ins[i], ins[(i + 1) % n]], "paint", { width: 0.15, color: "yellow", dash: [0.9, 0.7] }); }
    }
  }
  W.board.pad = name => PADS[PAD[name]];

  // zebras of the junction and of the top road
  zebra(W, 657, 498, 724, 545, "v"); zebra(W, 662, 646, 728, 690, "v");
  zebra(W, 612, 556, 655, 610, "h"); zebra(W, 732, 558, 780, 610, "h");
  zebra(W, 696 + D, 42, 737 + D, 122, "h");
  // the start box and the line at its end
  W.addLine(polyline([[745 + D, 35], [915 + D, 35], [915 + D, 125], [745 + D, 125], [745 + D, 35]]), "paint", { width: 0.25 });
  W.addLine(polyline([[915 + D, 35], [915 + D, 125]]), "paint", { width: 0.3 });
  // the angled parking bays south of the start road (0:35 of the video): parallel slanted lines and the line at their ends
  W.addLine(polyline([[760, 210], [1190, 210]]), "paint", { width: 0.16 });
  for (let k = 0; k < 10; k++) { const cx = 770 + 44 * k; W.addLine(polyline([[cx, 210], [cx + 38, 150]]), "paint", { width: 0.14 }); }
  // the north-east road: its outline, the line at its end, the dashed middle
  W.addLine(polyline([[790, 330], [1215, 330]]), "paint", { width: 0.14, dash: [2.2, 2.2] });
  // the east road (two ways): its outline and the dashed middle
  W.addLine(polyline([[810, 545], [1335, 545]]), "paint", { width: 0.14, dash: [2.2, 2.2] });
  // the middle lines of the four arms of the junction (as on the video): solid for the last 15 m before the zebra, dashed further out
  for (const [a, b, c] of [[[612, 594], [462, 594], [160, 594]], [[780, 590], [930, 590], [1290, 590]], [[695, 498], [420, 420], [695, 340]], [[695, 690], [695, 1030], [695, 1031]]]) {
    const B = b[1] === 420 ? [695, 420] : b;
    W.addLine(polyline([a, B]), "paint", { width: 0.15 });
    W.addLine(polyline([B, c]), "paint", { width: 0.14, dash: [1.0, 1.4] });
  }
  // top road: the lane line, and the west road's dashed middle
  W.addLine(polyline([[690, 96], [150, 96], ...arc(150, 158, 62, -Math.PI / 2, -Math.PI, 10).slice(1)]), "paint", { width: 0.16 });   // the lane line bends round the corner into the west road
  W.addLine(polyline([[88, 158], [88, 500]]), "paint", { width: 0.14, dash: [1.0, 1.4] });
  W.addLine(polyline([[445, 45], [445, 135]]), "paint", { width: 0.3 });
  // hatching (no entry)
  hatch(W, [[68, 498], [130, 522], [166, 548], [160, 578], [68, 580]]);
  hatch(W, [[1337, 365], [1385, 365], [1385, 495], [1337, 495]]);
  fan(W, [714, 1085], [662, 1085], [714, 1030], 9);                // the gore where the south arm leaves the bottom road: a fan of lines (3:49)
  // lane arrows (the way each lane runs, as on the plan)
  // the arrows of the plan, lane by lane (deg: the way the lane runs; 0 east, 90 south)
  for (const [x, y, d, kind, len] of [
    [850 + D, 59, 180], [850 + D, 102, 180], [1230, 47, 180], [1230, 92, 180],                     // start box and the road behind it
    [215, 66, 180], [215, 112, 180],                                                   // top road, turning south at the west end
    [104, 385, 90, "L", 46], [70, 478, 90, "L", 46],   // at the 90-degree turn: B (by the island) left, C/D straight or left                                                    // west road
    [565, 212, 0, "R"], [570, 355, 0, "R"], [672, 440, 90], [150, 582, 180, "L"],               // north-west quarter
    [770, 312, 0, "SR"], [1050, 305, 0], [1050, 345, 0], [717, 400, -90, "R"],                     // north-east road
    [995, 520, 180, "SR"], [1165, 520, 180, "SR"], [1315, 520, 180, "SR"], [980, 572, 180], [1165, 572, 180], [1315, 572, 180], [820, 567, 180, "L"],
    [570, 615, 0], [210, 665, -90, "R"], [452, 640, -90, "R"], [90, 1040, 90, "L"], [255, 1090, 0], [475, 1055, 180, "L"], [625, 1052, 180, "SR"], [675, 960, 90, "R"], [645, 1095, 0],
    [835, 605, 0, "SR"], [1135, 602, 0, "SR"], [1255, 635, 0, "R"], [1355, 670, -90, "L"], [1348, 935, 90, "R", 48], [710, 725, -90, "L"],
    [770, 1042, 180, "L"], [935, 1072, 180, "SR"], [1160, 1077, 180, "SR"], [975, 1107, 0], [1250, 1115, 0, "L"]
  ]) arrow(W, x, y, d, len || 56, kind);
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
    } else {                                                                     // on open asphalt: to the nearest edge of the ground
      const dx = fx - Math.abs(x), dy = fy - Math.abs(y);
      if (dy < dx) { y = Math.sign(y) * (fy + 1.4); th = -Math.sign(y) * Math.PI / 2; } else { x = Math.sign(x) * (fx + 1.4); th = x > 0 ? Math.PI : 0; }
    }
    kinds.forEach((k, i) => sign(x + Math.cos(th + Math.PI / 2) * 0.75 * (i - (kinds.length - 1) / 2) * (extra.stack ? 0 : 1), y + Math.sin(th + Math.PI / 2) * 0.75 * (i - (kinds.length - 1) / 2) * (extra.stack ? 0 : 1), th, k,
      { h: extra.stack ? 2.55 - i * 0.95 : undefined, plates: extra.plates && (!extra.stack || i === kinds.length - 1) ? extra.plates : undefined }));
  };
  const Y = (x, y, arrow = "right") => place(x, y, ["yield", arrow], { stack: true });
  const PK = (x, y) => place(x, y, ["park"], { plates: ["car", "truck"] });
  // north fence (the top road), west and east fence
  place(390, 22, ["noStop"]); place(428, 20, ["limit20"]); place(595, 22, ["zebra"]); place(680, 20, ["zebra"]); place(760 + D, 20, ["limit20"], { plates: ["startPlate"] }); place(700 + D, 20, ["stop", "zebra"], { stack: true });
  place(33, 328, ["ahead", "aheadRight"], { plates: ["truck"] }); place(43, 460, ["right"]); place(47, 762, ["yield"]); place(55, 1035, ["left"]); place(1305, 1162, ["noStop"]); place(1390, 520, ["ahead", "aheadRight"], { plates: ["car"] });
  // north-west quarter (the zigzags)
  place(572, 260, ["right"]); place(600, 288, ["noEntry"]); Y(590, 390); place(155, 455, ["noEntry"]); place(185, 538, ["left"]); place(615, 505, ["zebra"]);
  place(330, 500, ["bend"]); place(420, 365, ["bend"]); place(160, 470, ["bend"]);
  // north-east quarter (the parking pockets)
  place(760, 400, ["zebra"]); place(742, 430, ["left"]); place(765, 492, ["zebra"]); PK(970, 482); PK(1137, 482); PK(1312, 482); PK(780, 405);
  // south-west quarter (the snakes)
  place(372, 650, ["noEntry"]); Y(250, 680); Y(465, 670); place(607, 670, ["zebra"]); place(455, 930, ["bend"]); PK(450, 967); place(590, 930, ["bend"]); PK(610, 990);
  // south-east quarter (the garages)
  place(845, 652, ["zebra"]); place(765, 680, ["zebra"]); PK(887, 740); Y(977, 685); PK(1122, 647); PK(1145, 735); Y(1220, 697); place(1267, 680, ["left"]);
  Y(797, 975); place(752, 992, ["left"]); PK(872, 985); Y(1062, 990); PK(1142, 990);
  // the paired lane signs along the north fence, as on the video
  for (const x of [-48, -22]) { sign(x, -57.6, Math.PI / 2, "ahead", { plates: ["truck"] }); sign(x + 0.9, -57.6, Math.PI / 2, "aheadRight", { plates: ["car"] }); }
  W.texts.push({ ...(([x, y]) => ({ x, y }))(P(900 + D, 80)), th: Math.PI, text: "START", size: 2.0 });
}

// which edges of a pad are open to the asphalt (no grass beside them): the exercise outline leaves them out
// is (x, y) on an island (inside its kerb)?
function onIsland(x, y) {
  return ISLANDS.some(({ kerb: g }) => { let c = false; for (let i = 0, j = g.length - 1; i < g.length; j = i++) if ((g[i][1] > y) !== (g[j][1] > y) && x < (g[j][0] - g[i][0]) * (y - g[i][1]) / (g[j][1] - g[i][1]) + g[i][0]) c = !c; return c; });
}
// is (x, y) on the edge of an island's kerb (within 1 m of its outline)?
function nearKerb(x, y) {
  for (const isl of ISLANDS) for (const g of [isl.kerb, isl.grass]) for (let i = 0; i < g.length; i++) {
    const a = g[i], b = g[(i + 1) % g.length], dx = b[0] - a[0], dy = b[1] - a[1], L = dx * dx + dy * dy || 1, t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (y - a[1]) * dy) / L));
    if (Math.hypot(a[0] + dx * t - x, a[1] + dy * t - y) < 1.0) return true;
  }
  return false;
}
export function padOpen(poly) {
  const grass = ISLANDS.map(i => i.grass);
  const near = (x, y) => grass.some(g => { for (let i = 0; i < g.length; i++) { const a = g[i], b = g[(i + 1) % g.length], dx = b[0] - a[0], dy = b[1] - a[1], L = dx * dx + dy * dy || 1, t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (y - a[1]) * dy) / L)); if (Math.hypot(a[0] + dx * t - x, a[1] + dy * t - y) < 0.7) return true; } return false; });
  return (x, y) => !near(x, y);
}
