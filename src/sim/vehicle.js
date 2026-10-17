// Vehicle model: kinematic bicycle steering, longitudinal dynamics with a real
// engine / clutch / gearbox (manual) or a simple torque-converter automatic.
import { clamp, DEG } from "./geom.js";

const G = 9.81;
const RPM2W = Math.PI / 30;

// Roughly a Chevrolet Cobalt 1.5 (the usual exam car in Uzbekistan).
export const SPEC = {
  mass: 1250,
  wb: 2.744, rOh: 0.9, fOh: 0.854, width: 1.735, track: 1.454,   // from the Cobalt model (4.479 m long)
  maxSteer: 35 * DEG, wheelLock: 540,         // steering-wheel degrees to full lock
  wheelR: 0.322,
  final: 4.1, gears: [0, 3.58, 2.02, 1.35, 0.98, 0.81], reverse: 3.31,
  idleRpm: 850, stallRpm: 380, maxRpm: 6300, Ie: 0.17,
  clutchCap: 280,                               // Nm, fully engaged
  brakeDecel: 7.5, handbrakeDecel: 3.6, roll: 0.13, aero: 0.0004
};
export const FRONT = SPEC.wb + SPEC.fOh;
export const REAR = -SPEC.rOh;
export const HW = SPEC.width / 2;

const TORQUE = [[0, 50], [1000, 104], [2000, 124], [3000, 134], [4000, 138], [5000, 131], [6000, 113], [6600, 0]];
export function engineTorque(rpm) {
  if (rpm <= 0) return TORQUE[0][1];
  for (let i = 1; i < TORQUE.length; i++) {
    if (rpm <= TORQUE[i][0]) {
      const [r0, t0] = TORQUE[i - 1], [r1, t1] = TORQUE[i];
      return t0 + (t1 - t0) * (rpm - r0) / (r1 - r0);
    }
  }
  return 0;
}

// Pedal travel 1 = fully pressed (disengaged). Bite point around 0.55.
export function clutchEngage(pedal) {
  const e = clamp((0.72 - pedal) / 0.42, 0, 1);
  return e * e * (3 - 2 * e);
}

export class Vehicle {
  constructor({ x, y, th }, transmission = "manual") {
    this.transmission = transmission;
    this.x = x; this.y = y; this.th = th;
    this.v = 0; this.sw = 0; this.steer = 0;
    this.h = 0; this.pitch = 0; this.grade = 0;
    this.engineOn = false; this.rpm = 0;
    this.gear = transmission === "manual" ? "N" : "P";
    this.autoGear = 1;
    this.throttle = 0; this.brake = 0; this.clutch = 0;
    this.handbrake = true;
    this.wheelSpin = 0; this.odo = 0;
    this.events = [];
  }

  emit(type, data) { this.events.push({ type, ...data }); }

  get kmh() { return Math.abs(this.v) * 3.6; }

  // Gear number used by exam rules (2nd gear on the acceleration strip).
  get gearNumber() {
    if (this.transmission === "manual") return typeof this.gear === "number" ? this.gear : 0;
    return this.gear === "D" ? this.autoGear : 0;
  }

  startEngine() {
    if (this.engineOn) return true;
    if (this.transmission === "manual" && this.gear !== "N" && this.clutch < 0.8) {
      this.emit("hint", { text: "Dvigatelni o't oldirish uchun ilashish pedalini bosing yoki neytralga qo'ying" });
      return false;
    }
    if (this.transmission === "auto" && this.gear !== "P" && this.gear !== "N") {
      this.emit("hint", { text: "Dvigatelni o't oldirish uchun P yoki N holatiga qo'ying" });
      return false;
    }
    this.engineOn = true; this.rpm = SPEC.idleRpm + 250;
    this.emit("engineStart");
    return true;
  }
  stopEngine() { if (this.engineOn) { this.engineOn = false; this.emit("engineStop"); } }

  shift(g) {
    if (g === this.gear) return true;
    if (this.transmission === "manual") {
      if (g !== "N" && this.clutch < 0.7) { this.emit("grind", { text: "Uzatmani almashtirishda ilashishni to'liq bosing" }); return false; }
      if (g === "R" && this.v > 0.4) { this.emit("grind", { text: "Orqa uzatma faqat to'xtagan holatda qo'shiladi" }); return false; }
      if (typeof g === "number" && this.v < -0.4) { this.emit("grind", { text: "Avval to'xtang" }); return false; }
    } else {
      if ((g === "R" || g === "P") && this.v > 0.4) { this.emit("grind", { text: "Avval to'xtang" }); return false; }
      if (g === "D" && this.v < -0.4) { this.emit("grind", { text: "Avval to'xtang" }); return false; }
      if (g !== "N" && g !== this.gear && this.brake < 0.2 && this.engineOn && (g === "D" || g === "R")) {
        this.emit("hint", { text: "Selektorni tormozni bosib turib almashtiring" });
      }
    }
    this.gear = g;
    this.emit("shift", { gear: g });
    return true;
  }

  // heightAt(x, y) -> ground height in meters
  step(dt, heightAt) {
    const s = SPEC;
    this.steer = clamp(this.sw / s.wheelLock, -1, 1) * s.maxSteer;

    // terrain under the axles
    const c = Math.cos(this.th), n = Math.sin(this.th);
    const hR = heightAt(this.x, this.y), hF = heightAt(this.x + c * s.wb, this.y + n * s.wb);
    this.h = (hR + hF) / 2;
    this.pitch = Math.atan2(hF - hR, s.wb);
    this.grade = Math.sin(this.pitch);
    const Fload = s.mass * G * this.grade + s.aero * s.mass * this.v * Math.abs(this.v);

    let a;
    if (this.transmission === "manual") a = this.manualStep(dt, Fload);
    else a = this.autoStep(dt, Fload);

    let v = this.v + a * dt;
    const dec = s.roll + this.brake * s.brakeDecel + (this.handbrake ? s.handbrakeDecel : 0) + (this.gear === "P" ? 50 : 0);
    if (Math.abs(v) <= dec * dt) v = 0; else v -= Math.sign(v) * dec * dt;
    this.v = v;

    this.th += this.v / s.wb * Math.tan(this.steer) * dt;
    const hz = Math.cos(this.pitch);
    this.x += this.v * hz * Math.cos(this.th) * dt;
    this.y += this.v * hz * Math.sin(this.th) * dt;
    this.wheelSpin += this.v / s.wheelR * dt;
    this.odo += Math.abs(this.v) * dt;
  }

  manualStep(dt, Fload) {
    const s = SPEC;
    const ratio = this.gear === "R" ? -s.reverse * s.final : this.gear === "N" ? 0 : s.gears[this.gear] * s.final;
    let we = this.rpm * RPM2W;
    const wc = this.v / s.wheelR * ratio;

    let Te = 0;
    if (this.engineOn) {
      const idleCtl = clamp((s.idleRpm - this.rpm) * 0.3, 0, 80);
      Te = (this.rpm < s.maxRpm ? this.throttle * engineTorque(this.rpm) : 0) + idleCtl;
    }
    const Tf = this.engineOn ? 9 + 0.0035 * this.rpm : 18 + 0.004 * this.rpm;

    let Tc = 0;
    const cap = ratio ? clutchEngage(this.clutch) * s.clutchCap : 0;
    if (cap > 0) {
      const Iv = s.mass * s.wheelR * s.wheelR / (ratio * ratio);
      const Tload = Fload * s.wheelR / ratio;
      const k1 = dt / s.Ie, k2 = dt / Iv;
      // torque that would make engine and wheels turn together this step
      const Tlock = (we - wc + k1 * (Te - Tf) + k2 * Tload) / (k1 + k2);
      Tc = Math.abs(Tlock) <= cap ? Tlock : Math.sign(Tlock) * cap;
    }
    we += dt / s.Ie * (Te - Tf - Tc);
    if (we < 0) we = 0;
    this.rpm = we / RPM2W;

    if (this.engineOn && this.rpm < s.stallRpm) {
      this.engineOn = false;
      this.emit("stall");
    }
    const Fdrive = ratio ? Tc * ratio / s.wheelR : 0;
    return (Fdrive - Fload) / s.mass;
  }

  autoStep(dt, Fload) {
    const s = SPEC;
    const dir = this.gear === "D" ? 1 : this.gear === "R" ? -1 : 0;
    let F = 0;
    if (this.engineOn && dir) {
      const vf = this.v * dir;
      if (this.throttle > 0.03) F += dir * this.throttle * 4300 * clamp(1 - vf / 17, 0.15, 1);
      else if (vf < 1.0) F += dir * 1100;          // creep
    }
    // gear and rpm for display only
    const kmh = Math.abs(this.v) * 3.6;
    this.autoGear = kmh < 14 ? 1 : kmh < 28 ? 2 : kmh < 45 ? 3 : 4;
    if (this.engineOn) {
      const wheelRpm = Math.abs(this.v) / s.wheelR / RPM2W * s.gears[this.autoGear] * s.final;
      const target = Math.max(s.idleRpm + this.throttle * (dir ? 1400 : 3500), wheelRpm * 0.9);
      this.rpm += (target - this.rpm) * Math.min(1, dt * 6);
    } else this.rpm += (0 - this.rpm) * Math.min(1, dt * 4);
    return (F - Fload) / s.mass;
  }

  corners() {
    const c = Math.cos(this.th), n = Math.sin(this.th);
    const p = (a, b) => [this.x + c * a - n * b, this.y + n * a + c * b];
    return [p(FRONT, -HW), p(FRONT, HW), p(REAR, HW), p(REAR, -HW)];
  }
  frontPoint() { return [this.x + Math.cos(this.th) * FRONT, this.y + Math.sin(this.th) * FRONT]; }
}
