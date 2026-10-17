// Exam elements. Each one draws its geometry into the world at the turtle's
// current pose (local frame: s along travel, l to the right) and returns a
// task whose rules are evaluated by the session in that same local frame.
import { toWorld, toLocal, DEG, polyNearPoint } from "../sim/geom.js";
import { LANE } from "./path.js";

const HL = LANE / 2;
const W2 = (pose, pts) => pts.map(([s, l]) => toWorld(pose, s, l));
const rect = (pose, s0, s1, l0, l1) => W2(pose, [[s0, l0], [s1, l0], [s1, l1], [s0, l1]]);
const at = (pose, s, l) => { const [x, y] = toWorld(pose, s, l); return { x, y }; };
const inBox = ([s, l], s0, s1, l0, l1) => s >= s0 && s <= s1 && l >= l0 && l <= l1;

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

function stopPaint(W, pose, s, l0 = -HL, l1 = HL) { W.addPaint(rect(pose, s - 0.4, s, l0, l1)); }
function stopHint(ctx, st, lineS) {
  if (!st || st.crossed) return "";
  if (st.still) return `Turibsiz: ${st.standT.toFixed(1)} s · chiziqqacha ${st.stopD.toFixed(2)} m`;
  const d = lineS - ctx.fs;
  return d < 10 ? `To'xtash chizig'igacha: ${Math.max(0, d).toFixed(1)} m` : "";
}

/* 2. Piyodalar o'tish joyi (tartibga solinmagan) */
export function piyoda(W, T) {
  const pose = T.pose, stopS = 14, z0 = 15.5, z1 = 19.5, cross = (z0 + z1) / 2;
  T.fwd(34);
  stopPaint(W, pose, stopS);
  for (let l = -HL + 0.2; l < HL - 0.2; l += 0.9) W.addPaint(rect(pose, z0, z1, l, Math.min(l + 0.5, HL - 0.1)));
  W.addPad(rect(pose, 10, 25, -5.4, -HL - 0.35), "concrete");
  W.addPad(rect(pose, 10, 25, HL + 0.35, 5.4), "concrete");
  W.signs.push({ ...at(pose, 13, 2.9), th: pose.th + Math.PI, kind: "zebra" });
  W.signs.push({ ...at(pose, 21.5, -2.9), th: pose.th, kind: "zebra" });
  const ped = { x: 0, y: 0, th: pose.th + Math.PI / 2, visible: Math.random() < 0.85, l: -4.4, walking: false, phase: 0 };
  const place = () => { const [x, y] = toWorld(pose, cross, ped.l); ped.x = x; ped.y = y; };
  place(); W.peds.push(ped);
  const onRoad = () => ped.walking && ped.l > -HL - 0.6 && ped.l < HL + 0.6;
  return task({
    id: "piyoda", mapNo: 2, name: "Piyodalar o'tish joyi", short: "Piyoda", pose,
    tick(ctx) {
      if (!ped.visible) return;
      if (!ped.walking && ctx.fs > cross - 19) ped.walking = true;
      if (ped.walking && ped.l < 4.8) {
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
export function estakada(W, T) {
  const pose = T.pose, stopS = 18;
  T.fwd(44);
  W.ramps.push({ pose, s0: 10, s1: 22, s2: 28, s3: 40, h: 1.92, halfW: HL + 0.4 });
  stopPaint(W, pose, stopS);
  W.texts.push({ ...at(pose, stopS - 1.6, 0), th: pose.th, text: "STOP", size: 1.0 });
  W.signs.push({ ...at(pose, 7, 2.9), th: pose.th + Math.PI, kind: "hill" });
  return task({
    id: "estakada", mapNo: 1, name: "To'xtash va tik balandlikka ko'tarilish (estakada)", short: "Estakada", pose,
    stages: [{
      text: "Estakadaga chiqing va to'xtash chizig'idan oshmasdan, undan 1 m ichida to'xtang.",
      update(ctx) { stopLineRule(ctx, "sl", stopS, () => true, "stopLine"); },
      hint: ctx => stopHint(ctx, ctx.f.sl, stopS) || "Qiyalikda ilashish va qo'l tormozidan foydalaning.",
      done: ctx => (ctx.f.sl && ctx.f.sl.crossed) || (ctx.car.v === 0 && ctx.still > 0.3 && ctx.fs > 10 && stopS - ctx.fs < 8)
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
      done: ctx => ctx.rs > 40
    }]
  });
}

/* 3. 90 gradus burchak ostida burilishlar (nazorat chiziqli koridor) */
export function burilish(W, T, first = 1) {
  const pose = T.pose, mid = 12;
  T.setStyle({ width: 5, kind: "ctrl" });
  T.fwd(7); T.corner(90 * first); T.fwd(mid); T.corner(-90 * first); T.fwd(7);
  T.setStyle({ width: LANE, kind: "edge" });
  const endL = mid * first;
  return task({
    id: "burilish", mapNo: 3, name: "90 gradus burchak ostida burilishlar", short: "90° burilish", pose, timeLimit: 120,
    active: ctx => ctx.fs > -0.3 && Math.abs(ctx.fl) < 3,
    stages: [{
      text: `Koridorda ikki marta 90° ga buriling (${first > 0 ? "o'ngga, keyin chapga" : "chapga, keyin o'ngga"}). Nazorat chiziqlariga tegmang, 2 daqiqadan oshirmang.`,
      done: ctx => ctx.PL.every(([s, l]) => s > 14.3 && Math.abs(l - endL) < 3)
    }]
  });
}

/* 5. Ilon izi */
export function ilon(W, T) {
  const pose = T.pose, L = 48;
  T.setStyle({ width: LANE, kind: "ctrl" });
  T.wiggle(L, 2.8);
  T.setStyle({ width: LANE, kind: "edge" });
  for (const s of [0, L]) for (const l of [-HL - 0.6, HL + 0.6]) W.cones.push({ ...at(pose, s, l), hit: false });
  return task({
    id: "ilon", mapNo: 5, name: "Ilon izi", short: "Ilon izi", pose, timeLimit: 120,
    stages: [{
      text: "Ilon izi koridoridan nazorat chiziqlariga tegmasdan o'ting. 2 daqiqadan oshirmang.",
      done: ctx => ctx.rs > L
    }]
  });
}

/* 6. Tor joyda qayrilib olish uchun boksga kirish */
export function boks(W, T) {
  const pose = T.pose, A = 6, Lc = 20, bx0 = 11, bx1 = 13.8, bd = 5.6, reg = 3.5 + bd - 1.6;
  T.gapR(A, A + 7);
  T.fwd(A + 7 + 9);
  const [cx, cy] = toWorld(pose, A + 3.5, HL);
  const cp = { x: cx, y: cy, th: pose.th + Math.PI / 2 };   // corridor frame
  W.addPad(rect(cp, 0, Lc, -3.5, 3.5));
  W.addPad(rect(cp, bx0, bx1, 3.4, 3.5 + bd));
  W.addLine(W2(cp, [[0, -3.5], [Lc, -3.5], [Lc, 3.5], [bx1, 3.5], [bx1, 3.5 + bd], [bx0, 3.5 + bd], [bx0, 3.5], [0, 3.5]]), "ctrl");
  W.addPaint(rect(cp, bx0 + 0.15, bx1 - 0.15, reg - 0.06, reg + 0.06), "yellow");
  const CL = ctx => ctx.P.map(([x, y]) => toLocal(cp, x, y));
  const inB = q => inBox(q, bx0, bx1, 3.5, 3.5 + bd);
  return task({
    id: "boks", mapNo: 6, name: "Tor joyda qayrilib olish uchun boksga kirish", short: "Boks", pose, allowReverse: true,
    active: ctx => ctx.fs > A - 1 && Math.abs(ctx.fl) < 6,
    stages: [{
      text: "O'ngga burilib koridorga kiring va boksdan o'tib to'xtang. O'ng chiroqni yoqing, orqaga yurib boksga kiring: orqa g'ildiraklar sariq chiziqqa yetsin. To'xtang.",
      update(ctx) {
        const C = CL(ctx), f = ctx.f;
        if (!f.entered && C.some(([s, l]) => s > bx0 && s < bx1 && l > 3.6)) {
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
      done: ctx => ctx.PL.every(([s, l]) => s > A + 8.5 && Math.abs(l) < HL + 0.4)
    }]
  });
}

/* 9. Orqaga harakatlanib parallel to'xtash (parkovka) */
export function parkovka(W, T) {
  const pose = T.pose, b0 = 9, b1 = 15.8, bw = 2.5, wide = 2.5, reg = b0 + 1.55;
  T.gapR(b0, b1);
  T.gapL(0, 30);
  T.fwd(30);
  // the road is widened to the left along the parking zone
  W.addPad(W2(pose, [[0, -HL + 0.1], [2, -HL - wide], [28, -HL - wide], [30, -HL + 0.1]]));
  W.addLine(W2(pose, [[0, -HL], [2, -HL - wide], [28, -HL - wide], [30, -HL]]), "edge");
  W.addPad(rect(pose, b0, b1, HL - 0.1, HL + bw));
  W.addLine(W2(pose, [[b0, HL], [b0, HL + bw], [b1, HL + bw], [b1, HL]]), "ctrl");
  W.addPaint(rect(pose, reg - 0.06, reg + 0.06, HL + 0.15, HL + bw - 0.15), "yellow");
  const inB = q => inBox(q, b0, b1, HL, HL + bw);
  return task({
    id: "parkovka", mapNo: 9, name: "Orqaga harakatlanib parallel to'xtash (parkovka)", short: "Parkovka", pose, allowReverse: true,
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
export function temir(W, T) {
  const pose = T.pose, stopS = 12, r0 = 17.5;
  T.fwd(36);
  stopPaint(W, pose, stopS);
  W.rails.push({ pose, s: r0, l0: -8, l1: 8 });
  W.signs.push({ ...at(pose, 11.2, 2.9), th: pose.th + Math.PI, kind: "stop" });
  W.signs.push({ ...at(pose, 8.5, 2.9), th: pose.th + Math.PI, kind: "rail" });
  return task({
    id: "temir", mapNo: 7, name: "Temir yo'l kesishmasi", short: "Temir yo'l", pose,
    stages: [{
      text: "Tartibga solinmagan temir yo'l kesishmasi. To'xtash chizig'i oldida (1 m ichida) to'xtang, kamida 3 soniya turing, keyin o'ting.",
      update(ctx) { stopLineRule(ctx, "sl", stopS, () => true, "railStop"); },
      hint: ctx => stopHint(ctx, ctx.f.sl, stopS),
      done: ctx => ctx.rs > r0 + 3
    }]
  });
}

/* 8. Tezlashish bo'lagi */
export function tezlashish(W, T) {
  const pose = T.pose, z0 = 56, z1 = 64;
  T.fwd(75);
  W.addLine(W2(pose, [[z0, -HL + 0.2], [z1, -HL + 0.2], [z1, HL - 0.2], [z0, HL - 0.2], [z0, -HL + 0.2]]), "paint", { color: "yellow", width: 0.12 });
  W.texts.push({ ...at(pose, (z0 + z1) / 2, 0), th: pose.th, text: "STOP", size: 1.1, color: "yellow" });
  W.texts.push({ ...at(pose, 6, 0), th: pose.th, text: "40", size: 1.6 });
  W.signs.push({ ...at(pose, 2, 2.9), th: pose.th + Math.PI, kind: "limit40" });
  return task({
    id: "tezlashish", mapNo: 8, name: "Tezlashish bo'lagi", short: "Tezlashish", pose, vlim: 40,
    stages: [{
      text: "Tezlikni oshirib ikkinchi uzatmaga o'ting, 40 km/soatdan oshirmang. So'ng sariq zonada to'xtang.",
      update(ctx) {
        const f = ctx.f;
        if (ctx.car.gearNumber >= 2 && ctx.car.v > 1) f.g2 = true;
        f.vmax = Math.max(f.vmax || 0, ctx.car.kmh);
        if (!f.chk && ctx.fs > z0) { f.chk = true; if (!f.g2) ctx.pen("gear2"); }
      },
      hint: ctx => `Uzatma: ${ctx.car.gearNumber || "N"} · eng yuqori tezlik ${Math.round(ctx.f.vmax || 0)} km/soat${ctx.f.g2 ? " · 2-uzatma qayd etildi" : ""}`,
      done: ctx => (ctx.f.chk && ctx.still > 0.8) || ctx.rs > 75
    }]
  });
}

/* 8. Avariya holatda to'xtash */
export function avariya(W, T) {
  const pose = T.pose, L = 62, trig = 16 + Math.random() * 12;
  T.fwd(L);
  for (let s = 8; s < L; s += 12) W.gantries.push({ ...at(pose, s, 0), th: pose.th, width: 5.2 });
  return task({
    id: "avariya", mapNo: 8, name: "Avariya holatda to'xtash", short: "Avariya", pose,
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
    id: "chorraha-" + dir, mapNo: 4, name: meta[0], short: meta[1], pose,
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
