// Exam elements. Each one draws its geometry into the world at the turtle's
// current pose (local frame: s along travel, l to the right) and returns a
// task whose rules are evaluated by the session in that same local frame.
import { toWorld, toLocal, DEG, polyNearPoint } from "../sim/geom.js";
import { insetPoly, PAD_INSET } from "./straighten.js";
import { LANE } from "./path.js";

const HL = LANE / 2;
const W2 = (pose, pts) => pts.map(([s, l]) => toWorld(pose, s, l));
const rect = (pose, s0, s1, l0, l1) => W2(pose, [[s0, l0], [s1, l0], [s1, l1], [s0, l1]]);
const at = (pose, s, l) => { const [x, y] = toWorld(pose, s, l); return { x, y }; };
const inBox = ([s, l], s0, s1, l0, l1) => s >= s0 && s <= s1 && l >= l0 && l <= l1;

// Training aid: the ideal path (and, for reversing, where the car ends up) drawn on the road.
// line / ghost are world-space polylines; drawn only outside the exam (see View.buildGuides).
function guide(W, line, ghost) { (W.guides || (W.guides = [])).push({ line, ghost }); }
// points of a smooth S-curve in (s, l) from (s0, l0) to (s1, l1): zero slope at both ends
const sCurve = (s0, l0, s1, l1, n = 24) => Array.from({ length: n + 1 }, (_, i) => { const u = i / n; return [s0 + (s1 - s0) * u, l0 + (l1 - l0) * (1 - Math.cos(Math.PI * u)) / 2]; });
// the car's outline: rear axle at (s, l), heading along `dir` (local radians), as local points
function carOutline(car, s, l, dir) {
  const w = (car.width || 1.85) / 2, c = Math.cos(dir), n = Math.sin(dir), rear = -(car.rOh ?? 0.9), front = car.length - (car.rOh ?? 0.9);
  return [[rear, -w], [front, -w], [front, w], [rear, w]].map(([a, b]) => [s + c * a - n * b, l + n * a + c * b]);
}

function task(def) {
  return {
    allowReverse: false, vlim: 20, timeLimit: 0,
    active: ctx => ctx.fs > -0.5 && Math.abs(ctx.fl) < 6,
    ...def
  };
}

// Stop-line bookkeeping (penalties #4, #11/#25, #12) for travel along +s.
export function stopLineRule(ctx, key, lineS, required, missCode) {
  const st = ctx.f[key] || (ctx.f[key] = { stopD: null, standT: 0, crossed: false, still: false });
  if (st.crossed) return st;
  const d = lineS - ctx.fs;
  if (ctx.car.v === 0 && d >= 0 && d < 8) {
    if (!st.still) { st.still = true; st.stopStart = ctx.t; }
    st.stopD = d; st.standT = ctx.t - st.stopStart;
    // tell the UI at once (the penalty itself is only decided when the line is crossed)
    if (d > 1 && st.standT > 0.4 && !st.farSaid) { st.farSaid = true; ctx.emit("stopFarNow", { d }); }
  } else st.still = false;
  if (d < 0) {
    st.crossed = true;
    const req = required();
    if (req && st.stopD == null) ctx.pen(missCode);
    else if (st.stopD != null) {
      if (st.stopD > 1) ctx.pen("stopFar");
      if (req && st.standT < 3) ctx.pen("early3s");
    }
  }
  return st;
}

// Training aid: the 1 m stop zone before each stop line (front bumper between s-1 and s).
// Drawn only outside the exam (see View.setWorld); rule distances are measured to s.
function stopZone(W, pose, s, l0 = -HL, l1 = HL) { (W.stopZones || (W.stopZones = [])).push({ pose, s, l0, l1 }); }
function stopPaint(W, pose, s, l0 = -HL, l1 = HL) { W.addPaint(rect(pose, s - 0.4, s, l0, l1)); stopZone(W, pose, s, l0, l1); }
function stopHint(ctx, st, lineS) {
  if (!st || st.crossed) return "";
  if (st.still) return `Turibsiz: ${st.standT.toFixed(1)} s · chiziqqacha ${st.stopD.toFixed(2)} m`;
  const d = lineS - ctx.fs;
  return d < 10 ? `To'xtash chizig'igacha: ${Math.max(0, d).toFixed(1)} m` : "";
}

/* 2. Piyodalar o'tish joyi (tartibga solinmagan) */
export function piyoda(W, T, len = 34, opt = {}) {
  const pose = T.pose, stopS = 14, z0 = 15.5, z1 = 19.5, cross = (z0 + z1) / 2;
  T.fwd(len);
  stopPaint(W, pose, stopS);
  if (opt.zebra !== false) for (let l = -HL + 0.2; l < HL - 0.2; l += 0.9) W.addPaint(rect(pose, z0, z1, l, Math.min(l + 0.5, HL - 0.1)));   // the board draws its own zebra when opt.zebra is false
  if (opt.pave !== false) { W.addPad(rect(pose, 10, 25, -5.4, -HL - 0.35), "concrete"); W.addPad(rect(pose, 10, 25, HL + 0.35, 5.4), "concrete"); }
  W.signs.push({ ...at(pose, 13, 2.9), th: pose.th + Math.PI, kind: "zebra" });
  W.signs.push({ ...at(pose, 21.5, -2.9), th: pose.th, kind: "zebra" });
  const l0 = opt.l0 ?? -4.4, l1 = opt.l1 ?? 4.8;      // where the pedestrian waits and where he walks to
  const ped = { x: 0, y: 0, th: pose.th + Math.PI / 2, visible: opt.l0 !== undefined || Math.random() < 0.85, l: l0, walking: false, phase: 0 };
  const place = () => { const [x, y] = toWorld(pose, cross, ped.l); ped.x = x; ped.y = y; };
  place(); W.peds.push(ped);
  const onRoad = () => ped.walking && ped.l > -HL - 0.6 && ped.l < HL + 0.6;
  return task({
    id: "piyoda", mapNo: 2, name: "Piyodalar o'tish joyi", short: "Piyoda", pose,
    tick(ctx) {
      if (!ped.visible) return;
      if (!ped.walking && ctx.fs > cross - 12) ped.walking = true;   // steps off when the car is ~8 m before the stop line
      if (ped.walking && ped.l < l1) {
        const nl = ped.l + 1.15 * ctx.dt;
        if (!polyNearPoint(ctx.P, toWorld(pose, cross, nl + 0.3), 0.6)) { ped.l = nl; ped.phase += ctx.dt; }
        place();
      }
    },
    stages: [{
      text: "Tartibga solinmagan piyodalar o'tish joyi. Piyoda o'tayotgan bo'lsa, to'xtash chizig'i oldida (1 m ichida) to'xtab yo'l bering.",
      update(ctx) {
        stopLineRule(ctx, "sl", stopS, () => ped.visible && ped.walking && ped.l < HL + 0.6, "stopLine");
        if (!ctx.f.hit && ped.visible && Math.abs(ctx.car.v) > 0.05 && polyNearPoint(ctx.P, [ped.x, ped.y], 0.25)) {
          ctx.f.hit = true; ctx.pen("crash");
        }
      },
      hint: ctx => onRoad() ? "Piyoda yo'lni kesib o'tmoqda. To'xtang!" :
        ped.walking && ped.l <= -HL - 0.6 ? "Piyoda o'tishga tayyorlanmoqda." : stopHint(ctx, ctx.f.sl, stopS),
      done: ctx => ctx.rs > z1 + 0.5
    }]
  });
}

/* 1. To'xtash va tik balandlikka ko'tarilish (estakada) */
export function estakada(W, T, opt = {}) {
  const { s0 = 10, s1 = 22, s2 = 28, s3 = 40, h = 1.92, stopS = 18, len = 44 } = opt;
  const pose = T.pose;
  T.fwd(len);
  W.ramps.push({ pose, s0, s1, s2, s3, h, halfW: HL + 0.4 });
  // the second overpass beside it (the ground has two, side by side)
  { const [x, y] = toWorld(pose, 0, -(2 * (HL + 0.4) + 0.5)); W.ramps.push({ pose: { x, y, th: pose.th }, s0, s1, s2, s3, h, halfW: HL + 0.4, extra: true }); }
  stopPaint(W, pose, stopS);
  W.texts.push({ ...at(pose, stopS - 1.6, 0), th: pose.th, text: "STOP", size: 1.0 });
  W.signs.push({ ...at(pose, Math.max(1, s0 - 3), 2.9), th: pose.th + Math.PI, kind: "hill" });
  return task({
    id: "estakada", mapNo: 3, name: "To'xtash va tik balandlikka ko'tarilish (estakada)", short: "Estakada", pose,
    stages: [{
      text: "Estakadaga chiqing va to'xtash chizig'idan oshmasdan, undan 1 m ichida to'xtang.",
      update(ctx) { stopLineRule(ctx, "sl", stopS, () => true, "stopLine"); },
      hint: ctx => stopHint(ctx, ctx.f.sl, stopS) || "Qiyalikda ilashish va qo'l tormozidan foydalaning.",
      done: ctx => (ctx.f.sl && ctx.f.sl.crossed) || (ctx.car.v === 0 && ctx.still > 0.3 && ctx.fs > s0 && stopS - ctx.fs < 8)
    }, {
      text: "Kamida 3 soniya turing. So'ng orqaga 0,3 m dan ko'p siljimasdan 30 soniya ichida harakatni boshlang.",
      enter(ctx) { Object.assign(ctx.f, { ref: ctx.cs, back: 0, track: true, t0: ctx.t }); },
      update(ctx) {
        stopLineRule(ctx, "sl", stopS, () => true, "stopLine");
        const f = ctx.f;
        if (!f.track) return;
        f.back = Math.max(f.back, f.ref - ctx.cs);
        if (ctx.cs > f.ref + 0.8) f.track = false;
        if (!f.rolled && f.back > 0.3) { f.rolled = true; ctx.pen("hillBack"); }
        if (f.track && !f.late && ctx.t - f.t0 > 30) { f.late = true; ctx.pen("hill30"); }
      },
      hint: ctx => ctx.f.track ? `Turibsiz: ${Math.floor(ctx.t - ctx.f.t0)} s · orqaga: ${Math.round(Math.max(0, ctx.f.back) * 100)} sm (ruxsat 30 sm)` : "",
      done: ctx => ctx.rs > s3
    }]
  });
}

/* 3. 90 gradus burchak ostida burilishlar (nazorat chiziqli koridor) */
// W.k: training size of the tight elements (1 = real exam size, 1.5 = wide for beginners)
const K = W => W.k || 1;

export function burilish(W, T, first = 1) {
  const pose = T.pose, mid = 12;
  T.setStyle({ width: 5 * K(W), kind: "ctrl" });
  T.fwd(7); T.corner(90 * first); T.fwd(mid); T.corner(-90 * first); T.fwd(7);
  T.setStyle({ width: LANE, kind: "edge" });
  const endL = mid * first;
  { // centre line with rounded corners
    const r = Math.min(3.5, mid / 3), a = 7, pts = [], arc = (cs, cl, a0, a1) => { for (let i = 0; i <= 10; i++) { const t = a0 + (a1 - a0) * i / 10; pts.push([cs + r * Math.cos(t), cl + r * Math.sin(t)]); } };
    pts.push([0, 0]);
    // first corner: turn towards +l (first > 0) or -l; arc centre sits r to that side of the line
    arc(a - r, first * r, -Math.PI / 2 * first, 0);
    arc(a + r, first * (mid - r), Math.PI, Math.PI - Math.PI / 2 * first * 1);
    pts.push([a + 7, endL]);
    guide(W, W2(pose, pts));
  }
  return task({
    id: "burilish", mapNo: 4, name: "90 gradus burchak ostida burilishlar", short: "90° burilish", pose, timeLimit: 120,
    active: ctx => ctx.fs > -0.3 && Math.abs(ctx.fl) < 3,
    stages: [{
      text: `Koridorda ikki marta 90° ga buriling (${first > 0 ? "o'ngga, keyin chapga" : "chapga, keyin o'ngga"}). Nazorat chiziqlariga tegmang, 2 daqiqadan oshirmang.`,
      done: ctx => ctx.PL.every(([s, l]) => s > 14.3 && Math.abs(l - endL) < 3 * K(W))
    }]
  });
}

/* 5. Ilon izi */
export function ilon(W, T, L = 48) {
  const pose = T.pose, hw = LANE * K(W) / 2;
  T.setStyle({ width: 2 * hw, kind: "ctrl" });
  T.wiggle(L, 2.8);
  T.setStyle({ width: LANE, kind: "edge" });
  for (const s of [0, L]) for (const l of [-hw - 0.6, hw + 0.6]) W.cones.push({ ...at(pose, s, l), hit: false });
  return task({
    id: "ilon", mapNo: 6, name: "Ilon izi", short: "Ilon izi", pose, timeLimit: 120,
    stages: [{
      text: "Ilon izi koridoridan nazorat chiziqlariga tegmasdan o'ting. 2 daqiqadan oshirmang.",
      done: ctx => ctx.rs > L
    }]
  });
}

// The snake as drawn on the plan: a big S-shaped corridor (two bends one way, two the other) that climbs 2R into the
// island and comes back. The turtle comes in heading east and leaves heading east, 4R + 3 m further on.
export function ilonS(W, T, R = 10) {
  const pose = T.pose, hw = LANE * K(W) / 2, L = 4 * R + 3;
  T.setStyle({ width: 2 * hw, kind: "ctrl" });
  T.arc(R, -90); T.arc(R, 90); T.fwd(3); T.arc(R, 90); T.arc(R, -90);
  const end = T.pose;
  T.setStyle({ width: LANE, kind: "edge" });
  for (const [p, d] of [[pose, 0], [end, 0]]) for (const l of [-hw - 0.6, hw + 0.6]) W.cones.push({ ...at(p, d, l), hit: false });
  return task({
    id: "ilon", mapNo: 6, name: "Ilon izi", short: "Ilon izi", pose, timeLimit: 120,
    active: ctx => ctx.fs > -0.5 && ctx.fs < L + 6,
    stages: [{
      text: "Ilon izi koridoridan nazorat chiziqlariga tegmasdan o'ting. 2 daqiqadan oshirmang.",
      done: ctx => ctx.rs > L - 1
    }]
  });
}

/* 6. Tor joyda qayrilib olish uchun boksga kirish */
export function boks(W, T) {
  // cw: corridor half width; the box widens and deepens with the training size
  const k = K(W), cw = 3.5 * k, car = W.car || { length: 4.479, rOh: 0.9 };
  const pose = T.pose, A = 6, Lc = 20, bx0 = 11, bx1 = bx0 + 2.8 + (k - 1) * 2.5, bd = 5.6 + (k - 1) * 2, reg = cw + bd - 1.6;
  T.gapR(A, A + 2 * cw);
  T.fwd(A + 2 * cw + 9);
  const [cx, cy] = toWorld(pose, A + cw, HL);
  const cp = { x: cx, y: cy, th: pose.th + Math.PI / 2 };   // corridor frame
  W.addPad(rect(cp, 0, Lc, -cw, cw));
  W.addPad(rect(cp, bx0, bx1, cw - 0.1, cw + bd));
  W.addLine(W2(cp, [[0, -cw], [Lc, -cw], [Lc, cw], [bx1, cw], [bx1, cw + bd], [bx0, cw + bd], [bx0, cw], [0, cw]]), "ctrl");
  W.addPaint(rect(cp, bx0 + 0.15, bx1 - 0.15, reg - 0.06, reg + 0.06), "yellow");
  { // reversing arc of the rear axle into the box, and the car as it should end up
    const sf = (bx0 + bx1) / 2, R = Math.min(5, reg + cw - 1, Lc - 0.8 - sf), pts = [];
    // quarter circle about (sf + R, reg): from beside the box, heading along the corridor, to the box, heading into it
    for (let i = 0; i <= 20; i++) { const t = Math.PI / 2 * i / 20; pts.push([sf + R - R * Math.sin(t), reg - R * Math.cos(t)]); }
    guide(W, W2(cp, pts), W2(cp, carOutline(car, sf, reg, -Math.PI / 2)));
  }
  const CL = ctx => ctx.P.map(([x, y]) => toLocal(cp, x, y));
  const inB = q => inBox(q, bx0, bx1, cw, cw + bd);
  return task({
    id: "boks", mapNo: 7, name: "Tor joyda qayrilib olish uchun boksga kirish", short: "Boks", pose, allowReverse: true,
    active: ctx => ctx.fs > A - 1 && Math.abs(ctx.fl) < 6,
    stages: [{
      text: "O'ngga burilib koridorga kiring va boksdan o'tib to'xtang. O'ng chiroqni yoqing, orqaga yurib boksga kiring: orqa g'ildiraklar sariq chiziqqa yetsin. To'xtang.",
      update(ctx) {
        const C = CL(ctx), f = ctx.f;
        if (!f.entered && C.some(([s, l]) => s > bx0 && s < bx1 && l > cw + 0.1)) {
          f.entered = true;
          if (ctx.car.v > 0.05) ctx.pen("notDone");
          if (ctx.sig !== 1) ctx.pen("turnSignal");
        }
        if (!f.reg && C.every(inB) && ctx.still > 1.2) {
          f.reg = true;
          if (toLocal(cp, ctx.car.x, ctx.car.y)[1] < reg) ctx.pen("regLine");
        }
      },
      hint(ctx) {
        const C = CL(ctx);
        if (!C.every(inB)) return "";
        return toLocal(cp, ctx.car.x, ctx.car.y)[1] >= reg ? "Orqa g'ildiraklar chiziqda. To'liq to'xtang." : "Orqa g'ildiraklar hali sariq chiziqqa yetmadi.";
      },
      done: ctx => CL(ctx).every(inB) && ctx.still > 1.2
    }, {
      text: "Chap chiroqni yoqing, boksdan chiqib chapga buriling va koridordan asosiy yo'lga qayting.",
      enter(ctx) { ctx.f.moved = false; },
      update(ctx) {
        if (!ctx.f.moved && Math.abs(ctx.car.v) > 0.05) { ctx.f.moved = true; if (ctx.sig !== -1) ctx.pen("turnSignal"); }
      },
      done: ctx => ctx.PL.every(([s, l]) => s > A + 2 * cw + 1.5 && Math.abs(l) < HL + 0.4)
    }]
  });
}

/* 9. Orqaga harakatlanib parallel to'xtash (parkovka) */
export function parkovka(W, T, opt = {}) {
  // the box is the car's length plus 2.3 m (6.8 m for the Cobalt); the yellow line sits where its rear axle should be
  const car = W.car || { length: 4.479, rOh: 0.9 };
  const k = K(W);
  const b0 = opt.b0 ?? 9, b1 = opt.b1 ?? b0 + car.length + 2.32 + (k - 1) * 4, bw = opt.bw ?? 2.5 * k, wide = 2.5, reg = b0 + car.rOh + 0.65, pose = T.pose, Lr = opt.len ?? 30;
  T.gapR(b0, b1);
  T.gapL(0, Lr);
  T.fwd(Lr);
  if (!opt.board) {
    // the road is widened to the left along the parking zone
    W.addPad(W2(pose, [[0, -HL + 0.1], [2, -HL - wide], [28, -HL - wide], [30, -HL + 0.1]]));
    W.addLine(W2(pose, [[0, -HL], [2, -HL - wide], [28, -HL - wide], [30, -HL]]), "edge");
    W.addPad(rect(pose, b0, b1, HL - 0.1, HL + bw));
  }
  W.addLine(W2(pose, [[b0, HL], [b0, HL + bw], [b1, HL + bw], [b1, HL]]), "ctrl");
  W.addPaint(rect(pose, reg - 0.06, reg + 0.06, HL + 0.15, HL + bw - 0.15), "yellow");
  { // rear axle: reverse from beside the box in an S-curve onto the yellow line
    const lf = HL + bw / 2, l0 = 0.6, span = 2 * Math.sqrt(Math.max(1, 2 * 5 * (lf - l0) / 2 - ((lf - l0) / 2) ** 2));
    guide(W, W2(pose, sCurve(reg + span, l0, reg, lf)), W2(pose, carOutline(car, reg, lf, 0)));
  }
  const inB = q => inBox(q, b0, b1, HL, HL + bw);
  return task({
    id: "parkovka", mapNo: 11, name: "Orqaga harakatlanib parallel to'xtash (parkovka)", short: "Parkovka", pose, allowReverse: true,
    stages: [{
      text: "Qutidan o'tib to'xtang. O'ng chiroqni yoqing, orqaga yurib qutiga kiring: orqa g'ildiraklar sariq chiziqqa yetsin. To'xtang.",
      update(ctx) {
        const f = ctx.f;
        if (!f.entered && ctx.PL.some(([s, l]) => s > b0 && s < b1 && l > HL + 0.1)) {
          f.entered = true;
          if (ctx.car.v > 0.05) ctx.pen("notDone");
          if (ctx.sig !== 1) ctx.pen("turnSignal");
        }
        if (!f.reg && ctx.PL.every(inB) && ctx.still > 1.2) { f.reg = true; if (ctx.cs > reg) ctx.pen("regLine"); }
      },
      hint: ctx => ctx.PL.every(inB) ? (ctx.cs <= reg ? "Orqa g'ildiraklar chiziqda. To'liq to'xtang." : "Orqa g'ildiraklar hali sariq chiziqqa yetmadi.") : "",
      done: ctx => ctx.PL.every(inB) && ctx.still > 1.2
    }, {
      text: "Chap chiroqni yoqing va qutidan chiqib harakatni davom ettiring.",
      enter(ctx) { ctx.f.moved = false; },
      update(ctx) {
        if (!ctx.f.moved && Math.abs(ctx.car.v) > 0.05) { ctx.f.moved = true; if (ctx.sig !== -1) ctx.pen("turnSignal"); }
      },
      done: ctx => ctx.PL.every(([s, l]) => s > b1 + 5 && l < HL)
    }]
  });
}

/* 7. Temir yo'l kesishmasi (tartibga solinmagan) */
export function temir(W, T, opt = {}) {
  const pose = T.pose, stopS = 12, r0 = 17.5;
  T.fwd(36);
  stopPaint(W, pose, stopS);
  W.rails.push({ pose, s: r0, l0: opt.l0 ?? -22, l1: opt.l1 ?? 22, deadEnd: !!opt.deadEnd, from: opt.from || -1, train: { pos: null, timer: 55, dir: 1, hit: false } });   // a steam locomotive crosses now and then (src/sim/session.js trainStep)
  W.signs.push({ ...at(pose, 11.2, 2.9), th: pose.th + Math.PI, kind: "stop" });
  W.signs.push({ ...at(pose, 8.5, 2.9), th: pose.th + Math.PI, kind: "rail" });
  return task({
    id: "temir", mapNo: 8, name: "Temir yo'l kesishmasi", short: "Temir yo'l", pose,
    stages: [{
      text: "Tartibga solinmagan temir yo'l kesishmasi. To'xtash chizig'i oldida (1 m ichida) to'xtang, kamida 3 soniya turing, keyin o'ting.",
      update(ctx) { stopLineRule(ctx, "sl", stopS, () => true, "railStop"); },
      hint: ctx => stopHint(ctx, ctx.f.sl, stopS),
      done: ctx => ctx.rs > r0 + 3
    }]
  });
}

/* 8. Tezlashish bo'lagi */
export function tezlashish(W, T, L = 75, zone = [L - 19, L - 11]) {
  const pose = T.pose, [z0, z1] = zone;
  T.fwd(L);
  W.addLine(W2(pose, [[z0, -HL + 0.2], [z1, -HL + 0.2], [z1, HL - 0.2], [z0, HL - 0.2], [z0, -HL + 0.2]]), "paint", { color: "yellow", width: 0.12 });
  W.texts.push({ ...at(pose, (z0 + z1) / 2, 0), th: pose.th, text: "STOP", size: 1.1, color: "yellow" });
  W.texts.push({ ...at(pose, 6, 0), th: pose.th, text: "40", size: 1.6 });
  W.signs.push({ ...at(pose, 2, 2.9), th: pose.th + Math.PI, kind: "limit40" });
  return task({
    id: "tezlashish", mapNo: 9, name: "Tezlashish bo'lagi", short: "Tezlashish", pose, vlim: 40,
    stages: [{
      text: "Tezlikni oshirib ikkinchi uzatmaga o'ting, 40 km/soatdan oshirmang. So'ng sariq zonada to'xtang.",
      update(ctx) {
        const f = ctx.f;
        if (ctx.car.gearNumber >= 2 && ctx.car.v > 1) f.g2 = true;
        f.vmax = Math.max(f.vmax || 0, ctx.car.kmh);
        if (!f.chk && ctx.fs > z0) { f.chk = true; if (!f.g2) ctx.pen("gear2"); }
      },
      hint: ctx => `Uzatma: ${ctx.car.gearNumber || "N"} · eng yuqori tezlik ${Math.round(ctx.f.vmax || 0)} km/soat${ctx.f.g2 ? " · 2-uzatma qayd etildi" : ""}`,
      done: ctx => (ctx.f.chk && ctx.still > 0.8) || ctx.rs > L
    }]
  });
}

/* 8. Avariya holatda to'xtash */
export function avariya(W, T, L = 62) {
  const pose = T.pose, trig = 16 + Math.random() * 12;
  T.fwd(L);
  for (let s = 8; s < L; s += 12) W.gantries.push({ ...at(pose, s, 0), th: pose.th, width: 5.2 });
  return task({
    id: "avariya", mapNo: 10, name: "Avariya holatda to'xtash", short: "Avariya", pose,
    stages: [{
      text: "15–20 km/soat tezlikda harakatlaning. Qizil ishora yonganidan so'ng 2 soniya ichida to'xtang, 3 soniya ichida avariya ishorasini yoqing.",
      update(ctx) {
        const f = ctx.f, W_ = ctx.W;
        if (!f.alarm && ((ctx.fs > trig && ctx.car.kmh >= 12) || ctx.fs > 40)) {
          f.alarm = true; f.at = ctx.t; W_.alarm = true; ctx.emit("alarm");
        }
        if (!f.alarm) return;
        if (f.stopT == null && ctx.car.v === 0) f.stopT = ctx.t;
        if (f.stopT == null && !f.p19 && ctx.t - f.at > 2) { f.p19 = true; ctx.pen("alarm2s"); }
        if (f.stopT != null && !f.hz && (ctx.hazard || ctx.t - f.stopT > 3)) {
          f.hz = true; W_.alarm = false;
          if (!ctx.hazard) ctx.pen("hazardOn");
        }
      },
      hint: ctx => !ctx.f.alarm ? "Ishora kutilmaganda yonadi. Tormozga tayyor turing." :
        ctx.f.stopT == null ? "TO'XTANG!" : (ctx.hazard ? "" : "Avariya ishorasini yoqing!"),
      done: ctx => !!ctx.f.hz
    }, {
      text: "Avariya ishorasini o'chiring va harakatni davom ettiring.",
      enter(ctx) { ctx.f.moved = false; },
      update(ctx) {
        if (!ctx.f.moved && Math.abs(ctx.car.v) > 0.05) { ctx.f.moved = true; if (ctx.hazard) ctx.pen("hazardOff"); }
      },
      done: ctx => ctx.rs > L
    }]
  });
}

/* 4. Svetoforli chorraha. Geometry comes from buildIntersection(). */
export function chorraha(W, center, approachDeg, dir, A) {
  const th = approachDeg * DEG, c = Math.cos(th), n = Math.sin(th);
  const pose = { x: center.x - c * A - n * HL, y: center.y - n * A + c * HL, th };
  const stopS = A - 10;
  stopZone(W, pose, stopS);
  const turn = { straight: 0, left: -1, right: 1 }[dir];
  const exitTh = th + turn * 90 * DEG;
  const axis = Math.abs(Math.sin(th)) > 0.5 ? "NS" : "EW";
  const meta = {
    straight: ["Chorraha: to'g'riga", "Chorraha ↑", "Svetoforli chorrahadan to'g'riga o'ting."],
    left: ["Chorraha: chapga burilish", "Chorraha ←", "Chap chiroqni yoqing va svetoforli chorrahada chapga buriling."],
    right: ["Chorraha: o'ngga burilish", "Chorraha →", "O'ng chiroqni yoqing va svetoforli chorrahada o'ngga buriling."]
  }[dir];
  const exitOk = (P, eth) => {
    const ep = { x: center.x, y: center.y, th: eth };
    return P.every(([x, y]) => { const [s, l] = toLocal(ep, x, y); return s > 12 && l > -0.4 && l < LANE + 0.4; });
  };
  return task({
    arm: approachDeg,
    id: "chorraha-" + dir, mapNo: 5, name: meta[0], short: meta[1], pose,
    active: ctx => ctx.fs > stopS - 8 && Math.abs(ctx.fl) < 3,
    stages: [{
      text: meta[2] + " Qizil va sariq ishora taqiqlovchi: to'xtash chizig'i oldida (1 m ichida) to'xtang.",
      update(ctx) {
        const f = ctx.f, [st] = W.lightState(axis, ctx.clock);
        stopLineRule(ctx, "sl", stopS, () => false, "stopLine");
        if (!f.crossed && ctx.fs > stopS) {
          f.crossed = true;
          if (st !== "green") ctx.pen("redLight");
          if (turn && ctx.sig !== turn) ctx.pen("turnSignal");
        }
        if (!f.crossed && st === "green") {
          f.greenT = (f.greenT || 0) + ctx.dt;
          if (!f.slow && f.greenT > 30) { f.slow = true; ctx.pen("greenSlow"); }
        }
        if (!f.wrong) for (const k of [-1, 0, 1]) {
          if (k === turn) continue;
          if (exitOk(ctx.P, th + k * 90 * DEG)) { f.wrong = true; ctx.pen("notDone"); }
        }
      },
      hint(ctx) {
        if (ctx.f.crossed) return "";
        const [st, left] = W.lightState(axis, ctx.clock);
        return `Svetofor: ${{ red: "qizil", yellow: "sariq", green: "yashil" }[st]} · ${Math.ceil(left)} s`;
      },
      done: ctx => ctx.f.wrong || exitOk(ctx.P, exitTh)
    }]
  });
}

/* ---- exercises on the pale pads of the plan (src/world/board.js) ---- */

// the outline of a pad as control lines, without the edges that are open ends (open(mx, my) tells which)
function padOutline(W, poly, open) {
  // the control line is the yellow line painted just inside the kerb (src/world/board.js draws it); it is touched, not seen here
  const ins = insetPoly(poly, PAD_INSET);
  let run = [];
  const flush = () => { if (run.length > 1) W.addLine(run, "ctrl", { width: 0.2, color: "yellow", hidden: true }); run = []; };
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length];
    if (open && open((a[0] + b[0]) / 2, (a[1] + b[1]) / 2)) { flush(); continue; }
    if (!run.length) run.push(ins[i]);
    run.push(ins[(i + 1) % poly.length]);
  }
  flush();
}
const inZone = (z, P) => P.every(([x, y]) => Math.hypot(x - z.x, y - z.y) <= z.r);
const anyZone = (z, P) => P.some(([x, y]) => Math.hypot(x - z.x, y - z.y) <= z.r);

// One or more pads driven through in turn: in each stage the car goes in at `enter` and has to come out at `exit`
// (all four corners inside the circle) without touching the outline.
export function padExercise(W, { id, mapNo, name, short, pads, stages, timeLimit = 120 }) {
  for (const p of pads) padOutline(W, p.poly, p.open);
  const xs = pads.flatMap(p => p.poly.map(q => q[0])), ys = pads.flatMap(p => p.poly.map(q => q[1]));
  const box = [Math.min(...xs) - 9, Math.min(...ys) - 9, Math.max(...xs) + 9, Math.max(...ys) + 9];
  const e0 = stages[0].enter;
  return task({
    id, mapNo, name, short, pose: { x: e0.x, y: e0.y, th: 0 }, timeLimit,
    active: ctx => ctx.car.x > box[0] && ctx.car.x < box[2] && ctx.car.y > box[1] && ctx.car.y < box[3],
    stages: stages.map(st => ({
      text: st.text,
      update(ctx) { if (!ctx.f.started && anyZone(st.enter, ctx.P)) ctx.f.started = true; },
      hint: ctx => ctx.f.started ? "" : "Mashq boshlanadigan joyga yaqinlashing.",
      done: ctx => ctx.f.started && inZone(st.exit, ctx.P)
    }))
  });
}

// The garage of the plan: a T-shaped pad, a corridor with a box beside it. The car drives in at the open end of the
// corridor, passes the box, and reverses into it (the box is on the right when side is 1, on the left when it is -1).
// d: { x, y, th (deg, the way into the corridor), Lc, cw, bx0, bx1, bd, side, poly, open }
export function boksPad(W, d) {
  const car = W.car || { length: 4.479, rOh: 0.9 }, { Lc, cw, bx0, bx1, bd, side: sg } = d;
  const cp = { x: d.x, y: d.y, th: d.th * DEG }, reg = cw + bd - 1.2;      // the arms of the plan are shallow: the nose may stand a little way out into the corridor
  padOutline(W, d.poly, d.open);
  const lo = Math.min(sg * (reg - 0.06), sg * (reg + 0.06)), hi = Math.max(sg * (reg - 0.06), sg * (reg + 0.06));
  W.addPaint(rect(cp, bx0 + 0.15, bx1 - 0.15, lo, hi), "yellow");
  { // reversing arc of the rear axle into the box, and the car as it should end up
    const sf = (bx0 + bx1) / 2, R = Math.min(5, reg + cw - 1, Lc - 0.8 - sf), pts = [];
    for (let i = 0; i <= 20; i++) { const t = Math.PI / 2 * i / 20; pts.push([sf + R - R * Math.sin(t), sg * (reg - R * Math.cos(t))]); }
    guide(W, W2(cp, pts), W2(cp, carOutline(car, sf, reg, -Math.PI / 2).map(([s_, l_]) => [s_, sg * l_])));
  }
  const CL = ctx => ctx.P.map(([x, y]) => { const [s_, l_] = toLocal(cp, x, y); return [s_, sg * l_]; });
  const inB = q => inBox(q, bx0, bx1, cw - 0.9, cw + bd);
  const near = ctx => { const [s_, l_] = toLocal(cp, ctx.car.x, ctx.car.y); return s_ > -9 && s_ < Lc + 3 && Math.abs(l_) < cw + bd + 6; };
  return task({
    id: "boks", mapNo: 7, name: "Tor joyda qayrilib olish uchun boksga kirish", short: "Boks", pose: cp, allowReverse: true,
    active: near,
    stages: [{
      text: "Garajning koridoriga kiring va boksdan o'tib to'xtang. " + (sg > 0 ? "O'ng" : "Chap") + " chiroqni yoqing, orqaga yurib boksga kiring: orqa g'ildiraklar sariq chiziqqa yetsin. To'xtang.",
      update(ctx) {
        const C = CL(ctx), f = ctx.f;
        if (!f.entered && C.some(([s_, l_]) => s_ > bx0 && s_ < bx1 && l_ > cw + 0.1)) {
          f.entered = true;
          if (ctx.car.v > 0.05) ctx.pen("notDone");
          if (ctx.sig !== sg) ctx.pen("turnSignal");
        }
        if (!f.reg && C.every(inB) && ctx.still > 1.2) {
          f.reg = true;
          const [, l_] = toLocal(cp, ctx.car.x, ctx.car.y);
          if (sg * l_ < reg) ctx.pen("regLine");
        }
      },
      hint(ctx) {
        const C = CL(ctx);
        if (!C.every(inB)) return "";
        const [, l_] = toLocal(cp, ctx.car.x, ctx.car.y);
        return sg * l_ >= reg ? "Orqa g'ildiraklar chiziqda. To'liq to'xtang." : "Orqa g'ildiraklar hali sariq chiziqqa yetmadi.";
      },
      done: ctx => CL(ctx).every(inB) && ctx.still > 1.2
    }, {
      text: (sg > 0 ? "Chap" : "O'ng") + " chiroqni yoqing, boksdan chiqib koridordan orqaga, yo'lga qayting.",
      enter(ctx) { ctx.f.moved = false; },
      update(ctx) {
        if (!ctx.f.moved && Math.abs(ctx.car.v) > 0.05) { ctx.f.moved = true; if (ctx.sig !== -sg) ctx.pen("turnSignal"); }
      },
      done: ctx => CL(ctx).every(([s_]) => s_ < -1.5)
    }]
  });
}
