// Track layouts: the full autodrome (one continuous exam route) and the
// small practice grounds for single elements.
import { World } from "./world.js";
import { Turtle, LANE } from "./path.js";
import { DEG, toWorld } from "../sim/geom.js";
import { Traffic } from "./traffic.js";
import { addBoard } from "./board.js";
import { PADS, px } from "./boardData.js";
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
export function buildIntersection(W, A, caps = false, bare = false) {
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
  W.traffic = new Traffic(W, A);
  W.traffic.warm(-45, 0);
}


function checker(W, pose, s, halfW) {
  const q = 0.5;
  for (let l = -halfW, i = 0; l < halfW - 0.01; l += q, i++)
    for (let r = 0; r < 2; r++) if ((i + r) % 2 === 0) {
      const l1 = Math.min(l + q, halfW);
      W.addPaint([toWorld(pose, s + r * q, l), toWorld(pose, s + (r + 1) * q, l), toWorld(pose, s + (r + 1) * q, l1), toWorld(pose, s + r * q, l1)]);
    }
}

// car: { length, rOh } of the car being driven (the parking box is sized to it)
//
// The B/C exam ground of the Tashkent centre, drawn from the plan on its board (src/world/board.js): asphalt everywhere,
// the islands and the pale exercise pads cut into it. Start (1) at the top right, heading west: the pedestrian crossing (2),
// the overpass (3), down the west road into the 90-degree turns (4) and the junction (5) from the north; the snake (6) in the
// south-west, the railway crossing (8) on the west road, the junction from the west, the emergency stop (10) on the east road,
// the garage (7) in the south-east, the parking bays (11) on the east road, the junction from the east, the speed lane (9) on
// the north-east road, the junction from the north again and the finish (12) on the east road. North is -y.
export function buildFull(car) {
  const W = new World("full"); W.car = car; W.k = (car && car.k) || 1;
  const A = 30, O = { x: 0, y: 0 };
  buildIntersection(W, A, false, true);
  addBoard(W);
  const bare = { bare: true };

  // ---- 1-3: the start line, the crossing and the overpass on the top road (heading west)
  const [sx, sy] = px(915, 62);
  const T = new Turtle(W, sx, sy, 180, bare);
  W.startLine = { pose: T.pose, s: 0 };
  { const [x, y] = px(959, 62); W.start = { x, y, th: 180 * DEG }; }
  W.addPaint([toWorld(T.pose, -0.3, -HL), toWorld(T.pose, 0, -HL), toWorld(T.pose, 0, HL), toWorld(T.pose, -0.3, HL)]);
  T.fwd(2.4);
  const tP = piyoda(W, T, 26, { zebra: false, pave: false });
  const tE = estakada(W, T);

  // ---- 4: the 90-degree turns, the zigzag of the first pale pad (in at the west end, out at the top east end)
  const tB = padExercise(W, {
    id: "burilish", mapNo: 4, name: "90 gradus burchak ostida burilishlar", short: "90° burilish", timeLimit: 120,
    pads: [{ poly: PADS[0], open: (x, y) => (Math.abs(x + 48.35) < 0.5 && y > -23.5 && y < -15.5) || (Math.abs(x + 35.15) < 0.3 && y < -35 && y > -43) }],
    stages: [{ text: "Koridorga g'arb tomondan kiring, ikki marta 90° ga buriling (chapga, keyin o'ngga) va nazorat chiziqlariga tegmasdan yuqori chetdan chiqing. 2 daqiqadan oshirmang.", enter: { x: -47, y: -19.5, r: 3 }, exit: { x: -33, y: -39, r: 4 } }]
  });

  // ---- 5: the junction from the north (straight)
  const c1 = chorraha(W, O, 90, "straight", A);

  // ---- 6: the snake: the right strand from the bottom to the top, then the left one from the top to the bottom
  const tI = padExercise(W, {
    id: "ilon", mapNo: 6, name: "Ilon izi", short: "Ilon izi", timeLimit: 150,
    pads: [{ poly: PADS[7], open: (x, y) => y > 27.7 || y < 9.8 }, { poly: PADS[8], open: (x, y) => y > 34.8 || y < 10.7 }],
    stages: [
      { text: "Ilon izining o'ng qismiga pastdan kiring va nazorat chiziqlariga tegmasdan yuqoriga chiqing.", enter: { x: -12.3, y: 29.5, r: 3.5 }, exit: { x: -27.6, y: 8.8, r: 4 } },
      { text: "Endi chap qismiga yuqoridan kiring va pastga tushing. 2 daqiqadan oshirmang.", enter: { x: -51.5, y: 10.3, r: 3.5 }, exit: { x: -28.5, y: 34.5, r: 4 } }
    ]
  });

  // ---- 8: the railway crossing on the west road (heading north)
  const [rx] = px(98, 900);
  const T2 = new Turtle(W, rx, 52.5, -90, bare);
  const tR = temir(W, T2);

  // ---- the junction from the west (straight), the emergency stop on the east road
  const c2 = chorraha(W, O, 0, "straight", A);
  const [ex0] = px(800, 0);
  const T3 = new Turtle(W, ex0, -1, 0, bare);
  const tA = avariya(W, T3, 44);

  // ---- 7: the garage: the first T-shaped pad of the south-east, in at its south end, the box on the west side
  const tX = boksPad(W, { x: 14.2, y: 38.6, th: -90, Lc: 19, cw: 2.1, bx0: 7.2, bx1: 12.9, bd: 4.8, side: -1, poly: PADS[11], open: (x, y) => y > 38.2 });

  // ---- 11: the parking bays on the east road (heading west, the bay on the right)
  const [bx] = px(1250, 0);
  const T4 = new Turtle(W, bx, -7.75, 180, bare);
  const tK = parkovka(W, T4, { b0: bx - 43, b1: bx - 33.5, bw: 3.5, len: 30, board: true });

  // ---- the junction from the east (right turn), then the speed lane on the north-east road (heading east)
  const c3 = chorraha(W, O, 180, "right", A);
  const [ux, uy] = px(759, 348);
  const T5 = new Turtle(W, ux, uy, 0, bare);
  const tZ = tezlashish(W, T5, 46, [40, 45.5]);

  // ---- the junction from the north (left turn) and the finish on the east road
  const c4 = chorraha(W, O, 90, "left", A);
  const [fx] = px(1285, 0);
  const fp = { x: 30, y: HL, th: 0 };
  W.finishLine = { pose: fp, s: fx - 30, halfW: 6 };
  checker(W, fp, fx - 30 - 1, 4.5);
  W.texts.push({ x: fx - 3.5, y: HL - 5.5, th: 0, text: "FINISH", size: 1.4 });

  W.tasks.push(tP, tE, tB, c1, tI, tR, c2, tA, tX, tK, c3, tZ, c4);
  return W.build();
}

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
