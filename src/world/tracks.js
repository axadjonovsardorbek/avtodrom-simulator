// Track layouts: the full autodrome (one continuous exam route) and the
// small practice grounds for single elements.
import { World } from "./world.js";
import { Turtle, LANE } from "./path.js";
import { DEG, toWorld, toLocal } from "../sim/geom.js";
import { Traffic } from "./traffic.js";
import { addBoard, padOpen } from "./board.js";
import { PADS, PAD, px } from "./boardData.js";
import { piyoda, estakada, burilish, ilon, boks, parkovka, temir, tezlashish, avariya, chorraha, padExercise, boksPad } from "./elements.js";

const HL = LANE / 2;

export const ELEMENTS = [
  { id: "piyoda", mapNo: 2, name: "Piyodalar o'tish joyi" },
  { id: "estakada", mapNo: 3, name: "Estakada" },
  { id: "burilish", mapNo: 4, name: "90° burilishlar" },
  { id: "chorraha-straight", mapNo: 5, name: "Chorraha: to'g'riga" },
  { id: "ilon", mapNo: 6, name: "Ilon izi" },
  { id: "boks", mapNo: 7, name: "Boksga kirish" },
  { id: "chorraha-left", mapNo: 5, name: "Chorraha: chapga" },
  { id: "temir", mapNo: 8, name: "Temir yo'l kesishmasi" },
  { id: "tezlashish", mapNo: 9, name: "Tezlashish bo'lagi" },
  { id: "avariya", mapNo: 10, name: "Avariya holatda to'xtash" },
  { id: "parkovka", mapNo: 11, name: "Parallel parkovka" },
  { id: "chorraha-right", mapNo: 5, name: "Chorraha: o'ngga" }
];

const ARC = 8;

// 4-way signalised intersection centred at the origin, two-lane arms of length A.
export function buildIntersection(W, A, caps = false, bare = false, flow = {}) {
  const R = 6, C = HL * 2 + R;
  const arc = (cx, cy, a0, a1) => {
    const p = [];
    for (let i = 0; i <= 14; i++) { const a = a0 + (a1 - a0) * i / 14; p.push([cx + R * Math.cos(a), cy + R * Math.sin(a)]); }
    return p;
  };
  const fNE = arc(C, -C, Math.PI, Math.PI / 2), fSE = arc(C, C, Math.PI * 1.5, Math.PI);
  const fSW = arc(-C, C, 0, -Math.PI / 2), fNW = arc(-C, -C, Math.PI / 2, 0);
  if (!bare) { W.addPad([...fNE, ...fSE, ...fSW, ...fNW]); [fNE, fSE, fSW, fNW].forEach(f => W.addLine(f, "edge")); }

  for (const deg of [-90, 0, 90, 180]) {
    const th = deg * DEG, c = Math.cos(th), n = Math.sin(th);
    const keep = W.routePts.length;
    const T = new Turtle(W, c * C, n * C, deg, { width: LANE * 2, bare });
    T.fwd(A - C); T.end();
    W.routePts.length = keep;            // arm centre lines are not a driving path
    if (!bare) W.addLine([[c * 10, n * 10], [c * A, n * A]], "edge");             // solid centre line
    // stop line on the incoming lane (traffic heading back to the centre)
    const inc = { x: c * A, y: n * A, th: th + Math.PI };
    W.addPaint([toWorld(inc, A - 10.4, 0), toWorld(inc, A - 10, 0), toWorld(inc, A - 10, LANE), toWorld(inc, A - 10.4, LANE)]);
    // signal head on the right of the incoming lane
    const [lx, ly] = toWorld(inc, A - 10.7, LANE + 1.4);
    W.lights.push({ x: lx, y: ly, th: inc.th + Math.PI, axis: Math.abs(n) > 0.5 ? "NS" : "EW" });
    if (caps && !bare) W.addLine([toWorld({ x: c * A, y: n * A, th }, 0, -LANE), toWorld({ x: c * A, y: n * A, th }, 0, LANE)], "edge");
  }
  // other cars on the arms; the junction is already busy when the run starts
  W.traffic = new Traffic(W, A, 7, flow.lanes, flow.peds);
  W.traffic.warm(-45, 0);
}



// car: { length, rOh } of the car being driven (the parking box is sized to it)
//
// The B/C exam ground of the Tashkent centre, drawn from the plan on its board (src/world/board.js), the exercises where
// the board numbers them: start (1) at the top right heading west, the pedestrian crossing (2) and the overpass (3) on the top
// road, the 90-degree turns (4) on the second zigzag pad, the junction (5) from the north turning right, the right-hand snake (6)
// from its top end down to the bay, the bottom road east, the emergency stop (10) on the east loop road, the garage (7) on the
// east pad of the south-east quarter, the junction from the east straight on, the railway crossing (8) on the west road, the
// speed lane (9) on the bottom road, the junction from the south straight on, the parallel parking (11) on the north-east road
// and the finish (12) at its end. North is -y; positions are taken in pixels of the plan photo (px()).
export function buildFull(car) {
  const W = new World("full"); W.car = car; W.k = (car && car.k) || 1;
  const A = 21, O = { x: 0, y: 0 };       // the stop lines 11 m from the centre, just before the zebras
  // the other cars keep to the lanes of the plan (right-hand traffic): east along the bottom side of the cross road, west
  // along its top side and the two-lane east road, south down the north road and on down the road between the south quarters
  const Q = pts => pts.map(p => px(...p));
  buildIntersection(W, A, false, true, {
    lanes: [
      { pts: Q([[150, 614], [560, 612], [612, 603], [780, 603], [830, 612], [1290, 616]]), stop: px(582, 603), axis: "EW", blockBy: [180] },
      { pts: Q([[1320, 568], [800, 568], [780, 572], [612, 572], [560, 576], [150, 577]]), stop: px(802, 572), axis: "EW", blockBy: [0, -90] },
      { pts: Q([[674, 410], [674, 640], [690, 700], [690, 1040]]), stop: px(674, 485), axis: "NS", blockBy: [-90, 90] }
    ],
    peds: [
      { a: px(650, 521), b: px(732, 521), axis: "NS" }, { a: px(655, 668), b: px(735, 668), axis: "NS" },
      { a: px(633, 550), b: px(633, 617), axis: "EW" }, { a: px(756, 552), b: px(756, 617), axis: "EW" }
    ]
  });
  addBoard(W);
  const bare = { bare: true };
  const heading = (a, b) => { const p = px(...a), q = px(...b); return Math.atan2(q[1] - p[1], q[0] - p[0]) / DEG; };
  const at = (x, y, deg) => { const [X, Y] = px(x, y); return new Turtle(W, X, Y, deg, bare); };

  // ---- 1-3: start, the crossing and the overpass on the top road (heading west)
  const D = 150;                                   // the start box and the crossing stand this far (px) east of the overpass
  const T = at(915 + D, 66, heading([915, 66], [100, 66]));
  W.startLine = { pose: T.pose, s: 0 };
  { const [x, y] = px(962 + D, 66); W.start = { x, y, th: T.pose.th }; }
  W.addPaint([toWorld(T.pose, -0.3, -HL), toWorld(T.pose, 0, -HL), toWorld(T.pose, 0, HL), toWorld(T.pose, -0.3, HL)]);
  const zebraS = Math.hypot(...px(716, 66).map((v, i) => v - px(915, 66)[i]));  // distance start line to the crossing
  T.fwd(zebraS - 17.5);
  const tP = piyoda(W, T, 21, { zebra: false, pave: false, l0: -5.4, l1: 2.6 });
  T.fwd(D * 0.1);                                  // the longer run between the crossing and the overpass
  const tE = estakada(W, T, { s0: 1, s1: 13, s2: 24, s3: 36, h: 1.44, stopS: 9, len: 37 });
  // the decorative lane signs of the board must not stand on the overpasses
  W.signs = W.signs.filter(g => g.ramp || !W.ramps.some(r => { const [a, l] = toLocal(r.pose, g.x, g.y); return a > r.s0 - 2 && a < r.s3 + 2 && Math.abs(l) < r.halfW + 1.5; }));

  // ---- 4: the 90-degree turns on the second zigzag pad: in from the road on its west side, out at the top towards the east
  const tB = padExercise(W, {
    id: "burilish", mapNo: 4, name: "90 gradus burchak ostida burilishlar", short: "90° burilish", timeLimit: 120,
    pads: [{ poly: PADS[PAD.zigB], open: padOpen(PADS[PAD.zigB]) }],
    stages: [{ text: "Koridorga g'arb tomondan kiring, ikki marta 90° ga buriling (chapga, keyin o'ngga) va nazorat chiziqlariga tegmasdan sharq tomonga chiqing. 2 daqiqadan oshirmang.",
      enter: { ...xy(px(330, 503)), r: 3.5 }, exit: { ...xy(px(424, 356)), r: 4 } }]
  });

  // ---- 5: the junction from the north, turning right (west)
  const c1 = chorraha(W, O, 90, "right", A);

  // ---- 6: the right-hand snake, from its top end down to the bay
  const tI = padExercise(W, {
    id: "ilon", mapNo: 6, name: "Ilon izi", short: "Ilon izi", timeLimit: 120,
    pads: [{ poly: PADS[PAD.snakeR], open: padOpen(PADS[PAD.snakeR]) }],
    stages: [{ text: "Ilon iziga yuqoridan kiring va nazorat chiziqlariga tegmasdan pastga, cho'ntakka chiqing. 2 daqiqadan oshirmang.",
      enter: { ...xy(px(428, 662)), r: 4 }, exit: { ...xy(px(568, 888)), r: 4.5 } }]
  });

  // ---- 10: the emergency stop on the east loop road (heading north)
  const T4 = at(1362, 1050, heading([1362, 1050], [1362, 640]));
  const tA = avariya(W, T4, 38);

  // ---- 7: the garage on the east pad of the south-east quarter: in from the road above, the box on the east side
  const g0 = px(1178, 733), g1 = px(1178, 1012), gth = Math.atan2(g1[1] - g0[1], g1[0] - g0[0]) / DEG, gd = (a, b) => Math.hypot(...px(...a).map((v, i) => v - px(...b)[i]));
  const tX = boksPad(W, { x: g0[0], y: g0[1], th: gth, Lc: gd([1178, 733], [1178, 1012]), cw: gd([1157, 800], [1200, 800]) / 2,
    bx0: gd([1178, 733], [1178, 890]), bx1: gd([1178, 733], [1178, 950]), bd: gd([1200, 920], [1257, 920]), side: -1, poly: PADS[PAD.T4], open: padOpen(PADS[PAD.T4]) });

  // ---- the junction from the east, straight on (west)
  const c2 = chorraha(W, O, 180, "straight", A);

  // ---- 8: the railway crossing on the west road (heading south; the line comes in from outside the ground, on the right)
  const T2 = at(78, 715, heading([78, 715], [78, 1000]));
  const tR = temir(W, T2, { l0: -4.2, l1: 34, deadEnd: true, from: 1 });

  // ---- 9: the speed lane on the bottom road (heading east)
  const T3 = at(189, 1081, heading([189, 1081], [700, 1081]));
  const tZ = tezlashish(W, T3, 46, [34, 40]);

  // ---- 11: the parallel parking of the video (4:16-4:39): up the east side, then west along the east road and back
  // into the middle pocket cut into the island north of it (pad D3)
  const d3 = PADS[PAD.D3], dBot = Math.max(...d3.map(q => q[1])), dX1 = Math.max(...d3.map(q => q[0]));
  const T5 = new Turtle(W, dX1 + 6.3, dBot + LANE / 2 + 0.05, 180, bare);
  const tK = parkovka(W, T5, { b0: 6.3, len: 30, board: true, bw: 3.2, hideBox: true });

  // ---- the junction from the east, turning right (north) towards the finish road (4:40-4:53)
  const c3 = chorraha(W, O, 180, "right", A);

  // ---- 12: the finish at the end of the north-east road (heading east)
  const fs0 = px(860, 312), fp = { x: fs0[0], y: fs0[1], th: 0 };
  const fS = Math.hypot(...px(1218, 312).map((v, i) => v - fs0[i]));
  W.finishLine = { pose: fp, s: fS, halfW: 5 };
  // the finish of the video (5:00-5:11): a white box across both lanes with FINISH written in it
  { const a = fS - 6, b = fS, hw = 3.6;
    W.addLine([toWorld(fp, a, -hw), toWorld(fp, b, -hw), toWorld(fp, b, hw), toWorld(fp, a, hw), toWorld(fp, a, -hw)], "paint", { width: 0.25 });
    const [x, y] = toWorld(fp, (a + b) / 2, 0); W.texts.push({ x, y, th: fp.th, text: "FINISH", size: 1.6 }); }

  W.tasks.push(tP, tE, tB, c1, tI, tA, tX, c2, tR, tZ, tK, c3);
  return W.build();
}
const xy = ([x, y]) => ({ x, y });

const ELEMENT_FN = { piyoda, estakada, burilish, ilon, boks, parkovka, temir, tezlashish, avariya };

export function buildPractice(id, car) {
  const W = new World(id); W.car = car; W.k = (car && car.k) || 1;
  if (id.startsWith("chorraha")) {
    const A = 40;
    buildIntersection(W, A, true);
    W.start = { x: HL, y: 37, th: -90 * DEG };
    W.tasks.push(chorraha(W, { x: 0, y: 0 }, -90, id.split("-")[1], A));
    return W.build();
  }
  const T = new Turtle(W, 0, 10, -90);
  W.start = { x: 0, y: 8.5, th: -90 * DEG };
  W.addLine([[-HL, 10], [HL, 10]], "edge");
  T.fwd(14);
  W.tasks.push(ELEMENT_FN[id](W, T));
  T.fwd(id === "tezlashish" ? 30 : 22);
  const end = T.end();
  W.addLine([toWorld(end, 0, -HL), toWorld(end, 0, HL)], "edge");
  return W.build();
}
