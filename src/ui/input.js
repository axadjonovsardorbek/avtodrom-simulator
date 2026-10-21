// Keyboard, touch, mouse-steering and gamepad input -> pedals, steering and
// discrete actions. Pedals ramp like a real foot would.
import { clamp } from "../sim/geom.js";

const ramp = (v, target, up, down, dt) => target > v ? Math.min(target, v + up * dt) : Math.max(target, v - down * dt);

export class Controls {
  constructor(canvas, onAction) {
    this.keys = new Set();
    this.touch = {};
    this.onAction = onAction;
    this.mouseSteer = false;
    this.mouseX = 0.5;
    this.look = 0;
    this.enabled = true;
    this.padIndex = null;

    const ACTIONS = {
      KeyQ: "sigL", KeyE: "sigR", KeyH: "hazard", KeyK: "belt", Space: "hand", KeyI: "engine",
      Digit1: "g1", Digit2: "g2", Digit3: "g3", Digit4: "g4", Digit5: "g5", KeyR: "gR", KeyN: "gN", Digit0: "gN",
      KeyF: "gD", KeyP: "gP", KeyC: "camera", KeyM: "map", Escape: "pause", KeyL: "mute"
    };
    const HELD = new Set(["KeyW", "ArrowUp", "KeyS", "ArrowDown", "KeyA", "ArrowLeft", "KeyD", "ArrowRight", "ShiftLeft", "ShiftRight", "KeyZ", "KeyX"]);
    addEventListener("keydown", e => {
      if (!this.enabled || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.target && (e.target.tagName === "INPUT" || e.target.tagName === "SELECT")) return;
      if (HELD.has(e.code)) { this.keys.add(e.code); e.preventDefault(); }
      else if (ACTIONS[e.code]) { e.preventDefault(); if (!e.repeat) this.onAction(ACTIONS[e.code]); }
    });
    addEventListener("keyup", e => { this.keys.delete(e.code); });
    addEventListener("blur", () => { this.keys.clear(); this.touch = {}; });

    canvas.addEventListener("pointermove", e => {
      const r = canvas.getBoundingClientRect();
      this.mouseX = (e.clientX - r.left) / r.width;
    });
    addEventListener("gamepadconnected", e => { this.padIndex = e.gamepad.index; this.onAction("padConnected"); });
    addEventListener("gamepaddisconnected", () => { this.padIndex = null; });
  }

  // on-screen steering wheel: drag round it like a real wheel (the angle you turn it through is the steering angle)
  bindWheel(el) {
    if (!el) return;
    let id = null, a0 = 0, sw0 = 0, last = 0;
    // the thumb's angle round the centre, and how far out it is (0 centre, 1 rim): near the centre the angle
    // jumps about with every small movement, so there the wheel is not turned
    const ang = e => { const r = el.getBoundingClientRect(); return Math.atan2(e.clientY - (r.top + r.height / 2), e.clientX - (r.left + r.width / 2)) * 180 / Math.PI; };
    const out = e => { const r = el.getBoundingClientRect(); return Math.hypot(e.clientX - (r.left + r.width / 2), e.clientY - (r.top + r.height / 2)) / (r.width / 2); };
    el.addEventListener("pointerdown", e => { e.preventDefault(); id = e.pointerId; try { el.setPointerCapture(id); } catch (_) {} a0 = last = ang(e); sw0 = this.wheelSw ?? this.curSw ?? 0; this.wheelSw = sw0; });
    el.addEventListener("pointermove", e => {
      if (e.pointerId !== id) return;
      let a = ang(e), d = a - last; if (d > 180) d -= 360; else if (d < -180) d += 360;      // continue past the +-180 seam
      last = a;
      // a thumb turns a phone's wheel through much less than hands turn a real one: about a third of a turn of the
      // thumb reaches full lock (540 deg), instead of more than a whole turn
      if (out(e) > 0.22) this.wheelSw = clamp((this.wheelSw ?? 0) + d * 2.4, -540, 540);
    });
    const up = e => { if (e.pointerId === id) { id = null; this.wheelSw = null; } };
    el.addEventListener("pointerup", up); el.addEventListener("pointercancel", up); el.addEventListener("lostpointercapture", up);
    el.addEventListener("contextmenu", e => e.preventDefault());
  }

  bindTouch(root) {
    this.bindWheel(root.querySelector("#wheelpad"));
    root.querySelectorAll("[data-hold]").forEach(b => {
      const k = b.dataset.hold;
      const on = e => { e.preventDefault(); this.touch[k] = true; b.classList.add("held"); try { b.setPointerCapture(e.pointerId); } catch (_) {} };
      const off = () => { this.touch[k] = false; b.classList.remove("held"); };
      b.addEventListener("pointerdown", on);
      ["pointerup", "pointercancel", "lostpointercapture"].forEach(t => b.addEventListener(t, off));
      b.addEventListener("contextmenu", e => e.preventDefault());
    });
    root.querySelectorAll("[data-act]").forEach(b => {
      b.addEventListener("pointerdown", e => { e.preventDefault(); this.onAction(b.dataset.act); });
    });
  }

  held(...codes) { return codes.some(c => this.keys.has(c)); }

  apply(car, dt) {
    const k = this.keys, t = this.touch;
    let gas = this.held("KeyW", "ArrowUp") || t.gas ? 1 : 0;
    let brk = this.held("KeyS", "ArrowDown") || t.brake ? 1 : 0;
    let clu = this.held("ShiftLeft", "ShiftRight") || t.clutch ? 1 : 0;
    let steerDir = (this.held("KeyD", "ArrowRight") || t.right ? 1 : 0) - (this.held("KeyA", "ArrowLeft") || t.left ? 1 : 0);
    this.look = ramp(this.look, this.held("KeyZ") ? -1.2 : this.held("KeyX") ? 1.2 : 0, 4, 4, dt);

    // gamepad / wheel (standard mapping): left stick steers, RT gas, LT brake, LB clutch
    const pad = this.padIndex != null && navigator.getGamepads ? navigator.getGamepads()[this.padIndex] : null;
    let padSteer = null;
    if (pad) {
      const b = pad.buttons;
      if (b[7] && b[7].value > 0.02) gas = b[7].value;
      if (b[6] && b[6].value > 0.02) brk = b[6].value;
      if (b[4] && b[4].pressed) clu = 1;
      if (Math.abs(pad.axes[0]) > 0.04) padSteer = pad.axes[0];
      this.padButtons(pad);
    }

    car.throttle = ramp(car.throttle, gas, 1.7, 4, dt);
    car.brake = ramp(car.brake, brk, 3.5, 6, dt);
    car.clutch = ramp(car.clutch, clu, 6, 0.75, dt);      // slow release lets you find the bite point

    // hands cannot spin the wheel instantly: every input chases its target at a human rate
    const toward = (target, rate) => { const d = target - car.sw; car.sw += Math.sign(d) * Math.min(Math.abs(d), rate * dt); };
    this.curSw = car.sw;
    if (this.wheelSw != null) toward(this.wheelSw, 2600);
    else if (padSteer != null) toward(Math.sign(padSteer) * padSteer * padSteer * 540, 1400 / (1 + Math.abs(car.v) / 12));
    else if (this.mouseSteer) toward(clamp((this.mouseX - 0.5) * 2 * 1.15, -1, 1) * 540, 1400);
    else if (steerDir) {
      // a tap nudges the wheel, holding winds it faster (hand over hand); reversing direction is quick
      this.steerHeld = Math.sign(car.sw) && Math.sign(car.sw) !== steerDir ? 0.35 : (this.steerHeld || 0) + dt;
      // up to 900 deg/s when slow (manoeuvres); calmer at speed so the car does not dart about
      const rate = (420 + Math.min(1, this.steerHeld / 0.3) * 640) / (1 + Math.abs(car.v) / 14);
      car.sw = clamp(car.sw + steerDir * rate * dt, -540, 540);
    } else {
      this.steerHeld = 0;
      // let go and the caster brings the wheel back while rolling (not when standing still)
      const back = Math.min(Math.abs(car.sw), Math.min(900, 90 + Math.abs(car.v) * 150) * dt);
      car.sw -= Math.sign(car.sw) * back;
    }
  }

  padButtons(pad) {
    const prev = this.prevPad || [];
    const map = { 0: "gUp", 1: "gDown", 2: "sigL", 3: "sigR", 5: "hand", 8: "camera", 9: "pause" };
    pad.buttons.forEach((b, i) => { if (b.pressed && !prev[i] && map[i]) this.onAction(map[i]); });
    this.prevPad = pad.buttons.map(b => b.pressed);
  }
}
