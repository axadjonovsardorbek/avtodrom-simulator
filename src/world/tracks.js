// Track layouts: the full autodrome (one continuous exam route) and the
// small practice grounds for single elements.
import { World } from "./world.js";
import { Turtle, LANE } from "./path.js";
import { DEG, toWorld } from "../sim/geom.js";
import { Traffic } from "./traffic.js";
import { piyoda, estakada, burilish, ilon, ilonS, boks, parkovka, temir, tezlashish, avariya, chorraha } from "./elements.js";

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
export function buildIntersection(W, A, caps = false) {
  const R = 6, C = HL * 2 + R;
  const arc = (cx, cy, a0, a1) => {
    const p = [];
    for (let i = 0; i <= 14; i++) { const a = a0 + (a1 - a0) * i / 14; p.push([cx + R * Math.cos(a), cy + R * Math.sin(a)]); }
    return p;
  };
  const fNE = arc(C, -C, Math.PI, Math.PI / 2), fSE = arc(C, C, Math.PI * 1.5, Math.PI);
  const fSW = arc(-C, C, 0, -Math.PI / 2), fNW = arc(-C, -C, Math.PI / 2, 0);
  W.addPad([...fNE, ...fSE, ...fSW, ...fNW]);
  [fNE, fSE, fSW, fNW].forEach(f => W.addLine(f, "edge"));

  for (const deg of [-90, 0, 90, 180]) {
    const th = deg * DEG, c = Math.cos(th), n = Math.sin(th);
    const keep = W.routePts.length;
    const T = new Turtle(W, c * C, n * C, deg, { width: LANE * 2 });
    T.fwd(A - C); T.end();
    W.routePts.length = keep;            // arm centre lines are not a driving path
    W.addLine([[c * 10, n * 10], [c * A, n * A]], "edge");             // solid centre line
    // stop line on the incoming lane (traffic heading back to the centre)
    const inc = { x: c * A, y: n * A, th: th + Math.PI };
    W.addPaint([toWorld(inc, A - 10.4, 0), toWorld(inc, A - 10, 0), toWorld(inc, A - 10, LANE), toWorld(inc, A - 10.4, LANE)]);
    // signal head on the right of the incoming lane
    const [lx, ly] = toWorld(inc, A - 10.7, LANE + 1.4);
    W.lights.push({ x: lx, y: ly, th: inc.th + Math.PI, axis: Math.abs(n) > 0.5 ? "NS" : "EW" });
    if (caps) W.addLine([toWorld({ x: c * A, y: n * A, th }, 0, -LANE), toWorld({ x: c * A, y: n * A, th }, 0, LANE)], "edge");
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

// white diagonal hatching of a rectangle (no-entry zones on the board)
function hatch(W, x0, y0, x1, y1, step = 1.4) {
  for (let d = -(y1 - y0); d < x1 - x0; d += step) {
    const a = [x0 + Math.max(0, d), y0 + Math.max(0, -d)], b = [x0 + Math.min(x1 - x0, d + (y1 - y0)), y0 + Math.min(y1 - y0, (x1 - x0) - d)];
    if (b[0] > a[0]) W.addLine([a, b], "paint", { width: 0.2 });
  }
}
// zebra crossing across an arm, at distance s from the centre
function zebra(W, deg, s) {
  const th = deg * DEG, pose = { x: Math.cos(th) * s, y: Math.sin(th) * s, th: th + Math.PI };
  for (let l = -LANE + 0.3; l < LANE - 0.3; l += 0.9) W.addPaint([toWorld(pose, -1.6, l), toWorld(pose, 1.6, l), toWorld(pose, 1.6, l + 0.5), toWorld(pose, -1.6, l + 0.5)]);
}

// car: { length, rOh } of the car being driven (the parking box is sized to it)
//
// Layout of the B/C exam ground of the Tashkent centre, drawn from its board (1 m = 10 px of the plan):
// the signalised intersection (5) in the middle with the four quarters round it. North-west: the 90-degree
// turns (4); south-west: the snake (6) and the railway crossing (8); south-east: the garage boxes (7);
// north-east: the start (1) on the top road, the pedestrian crossing (2), the overpass (3) and the long road
// with the speed lane (9), the emergency stop (10) and the parking bays (11); the finish (12) is at the top.
// The route goes: start, crossing, overpass, down the west road into the 90-degree turns, the junction from the west
// (straight), the garage on the east road, the speed lane on the south road, the junction from the south (left),
// the railway crossing on the west road, the snake on the south road, the junction from the south again (straight),
// the emergency stop on the road north-east, the parking bays on the east arm, the junction from the east
// (right) and the finish at the top. North is -y.
export function buildFull(car) {
  const W = new World("full"); W.car = car; W.k = (car && car.k) || 1;
  const A = 30, XL = 60, XR = 68, YT = 62, YB = 52, YU = 38, O = { x: 0, y: 0 };
  buildIntersection(W, A);
  for (const deg of [-90, 0, 90, 180]) zebra(W, deg, 15);

  // ---- the start pad (top right) and the way west along the top road
  const SX = 22;                                     // start line
  const sp = { x: SX, y: -YT, th: 180 * DEG };
  const loc = pts => pts.map(([s_, l]) => toWorld(sp, s_, l));
  W.addPad(loc([[0, -5], [-44, -5], [-44, 5], [0, 5]]));
  W.addLine(loc([[0, -1.75], [0, -5], [-44, -5], [-44, -1.75]]), "edge"); W.addLine(loc([[0, 1.75], [0, 5], [-44, 5], [-44, 1.75]]), "edge");
  { const [x, y] = toWorld(sp, -4.4, 0); W.start = { x, y, th: sp.th }; }
  const T = new Turtle(W, SX, -YT, 180, { wide: true });
  W.startLine = { pose: T.pose, s: 0 };
  W.addPaint([toWorld(T.pose, -0.3, -HL), toWorld(T.pose, 0, -HL), toWorld(T.pose, 0, HL), toWorld(T.pose, -0.3, HL)]);
  { const [tx, ty] = toWorld(T.pose, -3, 0); W.texts.push({ x: tx, y: ty, th: T.pose.th, text: "START", size: 1.1 }); }
  for (const k of [1, 2]) W.addLine(loc([[-9 * k - 4, 0], [-9 * k - 6.5, 0]]), "paint", { width: 0.25 });   // arrows are drawn as short dashes
  const tP = piyoda(W, T, 26);
  const tE = estakada(W, T);
  T.fwdTo("x", -(XL - ARC)); T.arc(ARC, -90);                   // top-left corner, down the west road
  T.fwdTo("y", -26.25); T.arc(ARC, -90);                        // east into the corridor of the 90-degree turns
  const tB = burilish(W, T, 1);
  T.arc(4, 90); T.arc(4, -90);                                 // back to the lane of the west arm
  T.end();

  // ---- P1: junction from the west (straight), the garage on the east road, the speed lane on the south road
  const c2 = chorraha(W, O, 0, "straight", A);
  const T3 = new Turtle(W, A, HL, 0, { wide: true });
  T3.fwdTo("x", XR - ARC); T3.arc(ARC, 90); T3.fwd(2);
  const tX = boks(W, T3);
  T3.fwdTo("y", YB - ARC); T3.arc(ARC, 90);
  const tZ = tezlashish(W, T3, 48);
  T3.fwdTo("x", HL + ARC); T3.arc(ARC, 90); T3.fwdTo("y", A); T3.end();

  // ---- P2: junction from the south (left turn), the railway crossing on the west road, the snake on the south road
  const c3 = chorraha(W, O, -90, "left", A);
  const T4 = new Turtle(W, -A, -HL, 180, { wide: true });
  T4.fwdTo("x", -(XL - ARC)); T4.arc(ARC, -90);
  const tR = temir(W, T4);
  T4.fwdTo("y", YB - ARC); T4.arc(ARC, -90); T4.fwd(2.75);
  const tI = ilonS(W, T4, 10);
  T4.arc(ARC, -90); T4.fwdTo("y", A); T4.end();

  // ---- P3: junction from the south again (straight), the emergency stop on the north-east road, then back down to the east arm
  const c1 = chorraha(W, O, -90, "straight", A);
  const T5 = new Turtle(W, HL, -A, -90, { wide: true });
  T5.arc(ARC, 90);
  const tA = avariya(W, T5, 44);
  T5.fwdTo("x", XR - ARC); T5.arc(ARC, 90); T5.fwdTo("y", -(HL + ARC)); T5.arc(ARC, 90);
  // ---- the parking bays on the east arm (heading west), then the junction from the east (right turn)
  const tK = parkovka(W, T5);
  T5.end();
  const c4 = chorraha(W, O, 180, "right", A);

  // ---- finish at the top, on the north arm (the way up to the top road)
  const T6 = new Turtle(W, HL, -A, -90, { wide: true });
  T6.gapR(0, 14);
  const fp = T6.pose;
  T6.fwdTo("y", -YT + 8); T6.end();
  W.finishLine = { pose: fp, s: 20, halfW: HL };
  checker(W, fp, 19, HL);
  W.texts.push({ x: HL, y: -A - 22.5, th: -90 * DEG, text: "FINISH", size: 1.0 });
  W.addPad([[16, -A - 20], [0, -A - 20], [0, -A - 34], [16, -A - 34]]);
  W.addLine([[3.5, -A - 20], [16, -A - 20], [16, -A - 34], [0, -A - 34], [0, -A - 20]], "edge");

  // ---- the stretches of the west and east roads that the route does not use (plain roads, not part of the route line)
  for (const [x, y0, y1] of [[-XL, -26.25, 6.25], [XR, -(HL + ARC), ARC]]) {
    const keep = W.routePts.length;
    const R = new Turtle(W, x, y0, 90, { wide: true });
    R.fwdTo("y", y1); R.end();
    W.routePts.length = keep;
  }

  // ---- the plan's markings: parking diamonds on the plaza, no-entry hatching, bays
  W.addPad([[2, -YT + 5], [60, -YT + 5], [60, -YT + 16], [2, -YT + 16]]);
  for (let k = 0; k < 10; k++) { const cx = 8 + k * 5.4, cy = -YT + 10.5; W.addLine([[cx - 4.2, cy], [cx, cy - 3.2], [cx + 4.2, cy], [cx, cy + 3.2], [cx - 4.2, cy]], "paint", { width: 0.12 }); }
  hatch(W, -62, -9, -54, 0); hatch(W, -3, 44, 3, 49.5); hatch(W, 65, -23, 69, -9.5);

  W.tasks.push(tP, tE, tB, c2, tX, tZ, c3, tR, tI, c1, tA, tK, c4);
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
