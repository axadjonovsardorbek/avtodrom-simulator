// One driving run: owns the vehicle, applies the exam rules, walks through
// the world's tasks in order and records penalties.
import { Vehicle } from "./vehicle.js";
import { PEN, PASS_LIMIT, SPEED_TOL } from "./penalties.js";
import { toLocal, polyTouchesSeg, polyNearPoint } from "./geom.js";
import { buildSolidGrid, collideCar } from "./collide.js";

export const START_SIGNAL_AT = 3;   // seconds after load the "Start" signal is given

export class Session {
  // mode: "exam" (stops when the limit is exceeded), "training" (full route, keeps going),
  // "practice" (single element)
  constructor(world, { mode = "training", transmission = "manual", spec } = {}) {
    this.W = world;
    this.mode = mode;
    this.strict = mode === "exam";
    this.full = !!world.startLine;
    this.car = new Vehicle(world.start, transmission, spec);
    Object.assign(this.car, { sig: 0, hazard: false, belt: false });
    this.clock = 0;          // since load
    this.t = 0;              // since the car first moved
    this.started = false;
    this.state = "running";
    this.log = [];
    this.total = 0;
    this.limitHit = false;
    this.taskIdx = 0;
    this.active = null;      // { task, stage, f, t0 }
    this.done = [];          // task results
    this.still = 0;
    this.overT = 0; this.overN = 0; this.revD = 0;
    this.flags = {};
    this.listeners = [];
  }

  on(fn) { this.listeners.push(fn); return () => { this.listeners = this.listeners.filter(f => f !== fn); }; }
  emit(type, data = {}) { for (const fn of this.listeners) fn({ type, ...data }); }

  get startSignal() { return !this.full || this.clock >= START_SIGNAL_AT; }
  get currentTask() { return this.active ? this.active.task : this.W.tasks[this.taskIdx] || null; }

  pen(code) {
    if (this.state !== "running") return;
    const p = PEN[code];
    const task = this.currentTask;
    const e = { code, n: p.n, pts: p.pts, text: p.text, t: this.t, task: task ? task.short : (this.full ? "Marshrut" : "") };
    this.log.push(e);
    this.total += p.pts;
    this.emit("penalty", e);
    if (!this.limitHit && this.total > PASS_LIMIT) {
      this.limitHit = true;
      this.emit("limit", { total: this.total });
      if (this.strict) this.end(false);
    }
  }

  end(ok) {
    if (this.state !== "running") return;
    this.state = ok ? "done" : "failed";
    this.emit("end", { ok, passed: ok && this.total <= PASS_LIMIT, total: this.total, t: this.t });
  }

  // Context handed to task rules, expressed in the task's local frame.
  ctxFor(task, dt) {
    const car = this.car, pose = task.pose;
    const P = car.corners();
    const [cs, cl] = toLocal(pose, car.x, car.y);
    const [fs, fl] = toLocal(pose, ...car.frontPoint());
    const rb = [car.x + Math.cos(car.th) * car.rear, car.y + Math.sin(car.th) * car.rear];
    const [rs] = toLocal(pose, rb[0], rb[1]);
    const a = this.active && this.active.task === task ? this.active : null;
    return {
      W: this.W, car, task, dt, t: this.t, clock: this.clock,
      sig: car.sig, hazard: car.hazard, still: this.still,
      P, PL: P.map(([x, y]) => toLocal(pose, x, y)), cs, cl, fs, fl, rs,
      f: a ? a.f : {},
      pen: code => this.pen(code),
      emit: (type, d) => this.emit(type, d)
    };
  }

  step(dt) {
    if (this.state !== "running") return;
    const car = this.car, W = this.W;
    this.clock += dt;
    const prev = { x: car.x, y: car.y, th: car.th };
    car.step(dt, (x, y) => W.heightAt(x, y));
    if (W.ramps.length && W.offRampEdge(car.wheelPoints())) {
      Object.assign(car, prev); car.v = 0;
      if (this.clock - (this.kerbT ?? -9) > 2) { this.kerbT = this.clock; this.emit("car", { kind: "kerb", text: "Estakada chetiga tegdingiz" }); }
    }
    for (const e of car.events) {
      if (e.type === "stall" && this.startSignal) this.pen("stall");
      this.emit("car", { kind: e.type, text: e.text });
    }
    car.events.length = 0;

    if (!this.started && car.odo > 0.05) { this.started = true; this.emit("moved"); }
    if (this.started) this.t += dt;
    this.still = car.v === 0 ? this.still + dt : 0;

    this.trafficStep(dt);
    this.contacts();
    this.globalRules(dt);
    if (this.state !== "running") return;
    this.taskRules(dt);
    if (this.state !== "running") return;
    this.finishRules();
  }

  // solid things (poles, trunks, fence, walls): the car is pushed out and slowed; a hard hit counts as a crash
  contacts() {
    const W = this.W; if (!W.solids || !W.solids.length) return;
    if (!W.solidGrid) W.solidGrid = buildSolidGrid(W.solids);
    const hit = collideCar(this.car, W.solids, W.solidGrid);
    if (!hit || hit.speed < 0.6) return;
    this.hits = this.hits || new Set();
    this.emit("bump", { strength: Math.min(1, hit.speed / 8), what: "solid" });
    if (!this.hits.has(hit.index) && hit.speed > 1.2) { this.hits.add(hit.index); this.pen("crash"); }
  }

  // other cars at the junction: advanced in 50 ms steps; the arm of the next signal task stays empty
  trafficStep(dt) {
    const T = this.W.traffic; if (!T) return;
    const next = this.W.tasks.slice(this.taskIdx).find(t => t.arm !== undefined);
    const deg = next ? ((next.arm + 180 + 540) % 360) - 180 : null;
    T.setBlock(deg, this.car.x, this.car.y);
    this.trafficT = (this.trafficT || 0) + dt;
    if (this.trafficT >= 0.05) { T.step(this.trafficT, this.clock); this.trafficT = 0; }
    for (const c of T.cars) if (T.touches(c, this.car.corners())) {
      // pushed away from the other car, and slowed
      const p = T.worldPose(c), dx = this.car.x - p.x, dy = this.car.y - p.y, d = Math.hypot(dx, dy) || 1;
      this.car.x += dx / d * 0.04; this.car.y += dy / d * 0.04;
      const closing = Math.abs(this.car.v);
      if (closing > 0.3) { this.car.v *= -0.1; this.emit("bump", { strength: Math.min(1, closing / 8), what: "car" }); }
      if (!c.hit) { c.hit = true; this.pen("crash"); }
    }
  }

  globalRules(dt) {
    const car = this.car, W = this.W, f = this.flags;
    const kmh = car.kmh;
    if (!f.belt && car.odo > 0.3 && !car.belt) { f.belt = true; this.pen("belt"); }

    // start element
    if (this.full) {
      const sinceSignal = this.clock - START_SIGNAL_AT;
      if (!this.started && !f.s30 && sinceSignal > 30) { f.s30 = true; this.pen("start30"); }
      if (!this.started && !f.s40 && sinceSignal > 40) { f.s40 = true; this.pen("start40"); }
      const [fs] = toLocal(W.startLine.pose, ...car.frontPoint());
      if (!f.startX && fs > W.startLine.s) { f.startX = true; if (car.sig !== -1) this.pen("startSignal"); }
      if (f.startX && !f.start10 && fs > W.startLine.s + 10) { f.start10 = true; if (car.sig === -1) this.pen("startSigOff"); }
    }

    // speed
    const task = this.active ? this.active.task : null;
    const vlim = task ? task.vlim : 20;
    if (!f.v40 && kmh > 40 + SPEED_TOL) { f.v40 = true; this.pen("speed40"); }
    if (vlim === 20 && kmh > 20 + SPEED_TOL) {
      this.overT += dt;
      if (this.overN < 1 + Math.floor(this.overT / 5)) { this.overN++; this.pen("speed20"); }
    }

    // reversing outside the elements that require it
    if (car.v < 0 && !(task && task.allowReverse)) {
      this.revD -= car.v * dt;
      if (this.revD > 0.5 && !f.rev) { f.rev = true; this.pen("reverse"); }
    } else if (car.v > 0.5) { this.revD = 0; f.rev = false; }

    // painted lines
    const P = car.corners();
    const xs = P.map(p => p[0]), ys = P.map(p => p[1]);
    const touching = new Set();
    for (const sg of W.segmentsNear(Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)))
      if (polyTouchesSeg(P, sg.a, sg.b)) { touching.add(sg.li); W.lines[sg.li].hit = [(sg.a[0] + sg.b[0]) / 2, (sg.a[1] + sg.b[1]) / 2]; }
    W.lines.forEach((ln, li) => {
      if (touching.has(li)) {
        ln.flash = this.clock;
        if (!ln.touch && this.clock - ln.lastT > 0.6) this.pen(ln.kind === "ctrl" ? "ctrlLine" : "offRoute");
        ln.touch = true; ln.lastT = this.clock;
      } else if (ln.touch && this.clock - ln.lastT > 0.3) ln.touch = false;
    });
    for (const c of W.cones) if (!c.hit && polyNearPoint(P, [c.x, c.y], 0.22)) { c.hit = true; this.pen("crash"); }
  }

  activate(task) {
    this.active = { task, stage: 0, f: {}, t0: this.t, slow: false };
    const ctx = this.ctxFor(task, 0);
    task.stages[0].enter && task.stages[0].enter(ctx);
    this.emit("task", { task });
  }

  taskRules(dt) {
    const tasks = this.W.tasks;
    if (this.taskIdx >= tasks.length) return;
    const task = tasks[this.taskIdx];
    if (!this.active) {
      if (task.active(this.ctxFor(task, dt))) this.activate(task);
      else {
        // reaching a later element first means this one was skipped
        const next = tasks[this.taskIdx + 1];
        if (next && next.active(this.ctxFor(next, dt))) { this.pen("notDone"); this.complete(false); }
        return;
      }
    }
    const a = this.active;
    const ctx = this.ctxFor(a.task, dt);
    if (a.task.tick) a.task.tick(ctx);
    const st = a.task.stages[a.stage];
    if (st.update) st.update(ctx);
    if (this.state !== "running") return;
    if (a.task.timeLimit && !a.slow && this.t - a.t0 > a.task.timeLimit) { a.slow = true; this.pen("slow2min"); }
    if (st.done(ctx)) {
      a.stage++;
      if (a.stage >= a.task.stages.length) this.complete(true);
      else {
        const nx = a.task.stages[a.stage];
        nx.enter && nx.enter(this.ctxFor(a.task, dt));
        this.emit("stage", { task: a.task, stage: a.stage });
      }
      return;
    }
    const next = tasks[this.taskIdx + 1];
    if (next && next.active(this.ctxFor(next, dt))) { this.pen("notDone"); this.complete(false); }
  }

  complete(ok) {
    const task = this.W.tasks[this.taskIdx];
    this.done.push({ task, ok, t: this.active ? this.t - this.active.t0 : 0 });
    this.active = null;
    this.taskIdx++;
    this.W.alarm = false;
    this.emit("taskDone", { task, ok });
    if (!this.full && this.taskIdx >= this.W.tasks.length) this.end(true);
  }

  finishRules() {
    if (!this.full) return;
    const fl = this.W.finishLine;
    const [fs, l] = toLocal(fl.pose, ...this.car.frontPoint());
    if (fs > fl.s && Math.abs(l) < 6) {
      if (this.taskIdx < this.W.tasks.length) this.pen("notDone");
      if (this.car.sig !== 1) this.pen("finishSignal");
      this.end(true);
    }
  }

  // Text for the "next step" banner.
  guidance() {
    const car = this.car;
    if (this.full && !this.startSignal) return { title: "Tayyorlaning", text: "Start ishorasini kuting." };
    if (!this.started) {
      const need = [];
      if (!car.belt) need.push("kamarni taqing (K)");
      if (!car.engineOn) need.push("dvigatelni o't oldiring (I)");
      if (car.transmission === "manual" ? car.gear === "N" : (car.gear === "P" || car.gear === "N")) need.push(car.transmission === "manual" ? "1-uzatmani qo'shing" : "selektorni D ga qo'ying");
      if (car.handbrake) need.push("qo'l tormozini tushiring (Space)");
      if (this.full && car.sig !== -1) need.push("chap chiroqni yoqing (Q)");
      if (need.length) return { title: this.full ? "Start" : "Tayyorgarlik", text: need.join(", ") + "." };
    }
    if (this.full && this.flags.startX && !this.flags.start10 && car.sig === -1)
      return { title: "Start", text: "Start chizig'idan keyin 10 m ichida chap chiroqni o'chiring." };
    const a = this.active;
    if (a) {
      const st = a.task.stages[a.stage];
      const ctx = this.ctxFor(a.task, 0);
      return { title: a.task.name, text: st.text, hint: st.hint ? st.hint(ctx) : "", stage: a.task.stages.length > 1 ? `${a.stage + 1}/${a.task.stages.length}` : "" };
    }
    const next = this.W.tasks[this.taskIdx];
    if (next) return { title: "Keyingi mashq", text: next.name };
    if (this.full) return { title: "Finish", text: "O'ng chiroqni yoqing va Finish chizig'idan o'ting." };
    return { title: "", text: "" };
  }
}
