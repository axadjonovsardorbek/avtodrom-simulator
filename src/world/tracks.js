// Track layouts: the full autodrome (one continuous exam route) and the
// small practice grounds for single elements.
import { World } from "./world.js";
import { Turtle, LANE } from "./path.js";
import { DEG, toWorld } from "../sim/geom.js";
import { Traffic } from "./traffic.js";
import { piyoda, estakada, burilish, ilon, boks, parkovka, temir, tezlashish, avariya, chorraha } from "./elements.js";

const HL = LANE / 2;

export const ELEMENTS = [
  { id: "piyoda", mapNo: 2, name: "Piyodalar o'tish joyi" },
  { id: "estakada", mapNo: 1, name: "Estakada" },
  { id: "burilish", mapNo: 3, name: "90° burilishlar" },
  { id: "chorraha-straight", mapNo: 4, name: "Chorraha: to'g'riga" },
  { id: "ilon", mapNo: 5, name: "Ilon izi" },
  { id: "boks", mapNo: 6, name: "Boksga kirish" },
  { id: "chorraha-left", mapNo: 4, name: "Chorraha: chapga" },
  { id: "temir", mapNo: 7, name: "Temir yo'l kesishmasi" },
  { id: "tezlashish", mapNo: 8, name: "Tezlashish bo'lagi" },
  { id: "avariya", mapNo: 8, name: "Avariya holatda to'xtash" },
  { id: "parkovka", mapNo: 9, name: "Parallel parkovka" },
  { id: "chorraha-right", mapNo: 4, name: "Chorraha: o'ngga" }
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

// car: { length, rOh } of the car being driven (the parking box is sized to it)
//
// Layout follows the Tashkent exam centre scheme: the signalised intersection (5) in the
// middle, the start, crossing, overpass and 90-degree turns above it, the serpentine in
// the south-west, the turning boxes in the south-east, the railway crossing on the west
// side and the acceleration strip along the north edge. North is -y.
export function buildFull(car) {
  const W = new World("full"); W.car = car; W.k = (car && car.k) || 1;
  const A = 30, XL = 96, YB = 140, YS = 75, O = { x: 0, y: 0 };   // YS: south edge road
  buildIntersection(W, A);

  // Start pad and the start route in the northern pocket, heading south
  W.addPad([[-52, -131], [-68, -131], [-68, -137.6], [-52, -137.6]]);
  W.addLine([[-58.25, -131], [-52, -131], [-52, -137.6], [-68, -137.6], [-68, -131], [-61.75, -131]], "edge");
  W.addLine([[-56, -132.5], [-56, -137.6]], "paint"); W.addLine([[-64, -132.5], [-64, -137.6]], "paint");
  W.start = { x: -60, y: -135.4, th: 90 * DEG };
  const T = new Turtle(W, -60, -131, 90);
  W.startLine = { pose: T.pose, s: 0 };
  W.addPaint([toWorld(T.pose, -0.3, -HL), toWorld(T.pose, 0, -HL), toWorld(T.pose, 0, HL), toWorld(T.pose, -0.3, HL)]);
  W.texts.push({ x: -60, y: -129, th: 90 * DEG, text: "START", size: 1.1 });
  T.fwd(4);
  const tP = piyoda(W, T);
  T.fwd(3);
  const tE = estakada(W, T);
  T.fwd(1); T.arc(ARC, -90); T.fwd(4);
  const tB = burilish(W, T, -1);
  T.fwdTo("x", -(ARC + HL)); T.arc(ARC, 90); T.fwdTo("y", -A); T.end();

  // P1: north arm, straight south. Then the serpentine loop (south-west).
  const c1 = chorraha(W, O, 90, "straight", A);
  const T2 = new Turtle(W, -HL, A, 90);
  T2.fwdTo("y", YS - ARC); T2.arc(ARC, 90); T2.fwd(6);
  const tI = ilon(W, T2);
  T2.fwdTo("x", -XL); T2.arc(ARC, 90); T2.fwdTo("y", HL + ARC); T2.arc(ARC, 90); T2.fwdTo("x", -A); T2.end();

  // P2: west arm, straight east. Then the box loop (south-east).
  const c2 = chorraha(W, O, 0, "straight", A);
  const T3 = new Turtle(W, A, HL, 0);
  T3.fwdTo("x", XL); T3.arc(ARC, 90); T3.fwd(2);
  const tX = boks(W, T3);
  T3.fwdTo("y", YS - ARC); T3.arc(ARC, 90); T3.fwdTo("x", HL + ARC); T3.arc(ARC, 90); T3.fwdTo("y", A); T3.end();

  // P3: south arm, left turn to the west. Then the outer loop: railway on the west side,
  // acceleration strip and emergency stop along the north edge, parking on the east side.
  const c3 = chorraha(W, O, -90, "left", A);
  const T4 = new Turtle(W, -A, -HL, 180);
  T4.fwdTo("x", -XL); T4.arc(ARC, 90); T4.fwd(4);
  const tR = temir(W, T4);
  T4.fwdTo("y", -(YB - ARC)); T4.arc(ARC, 90); T4.fwd(4);
  const tZ = tezlashish(W, T4);
  T4.fwd(2);
  const tA = avariya(W, T4);
  T4.fwdTo("x", XL); T4.arc(ARC, 90); T4.fwd(4);
  const tK = parkovka(W, T4);
  T4.fwdTo("y", -(HL + ARC)); T4.arc(ARC, 90); T4.fwdTo("x", A); T4.end();

  // P4: east arm, right turn to the north. Then the finish.
  const c4 = chorraha(W, O, 180, "right", A);
  const T5 = new Turtle(W, HL, -A, -90);
  const fp = T5.pose;
  T5.fwdTo("y", -66); T5.end();
  W.finishLine = { pose: fp, s: 32, halfW: HL };
  checker(W, fp, 31, HL);
  W.texts.push({ x: HL, y: -64.5, th: -90 * DEG, text: "FINISH", size: 1.0 });
  W.addPad([[16, -66], [0, -66], [0, -84], [16, -84]]);
  W.addLine([[3.5, -66], [16, -66], [16, -84], [0, -84], [0, -66]], "edge");

  W.tasks.push(tP, tE, tB, c1, tI, c2, tX, c3, tR, tZ, tA, tK, c4);
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
