// Scripted drives through practice grounds; checks that the penalty rules fire
// for mistakes and stay silent for a careful driver.
import { buildPractice } from "../src/world/tracks.js";
import { Session } from "../src/sim/session.js";
import { toLocal } from "../src/sim/geom.js";

let failed = 0;
const check = (name, cond, extra = "") => { console.log(`${cond ? "ok  " : "FAIL"} ${name}${extra ? "  " + extra : ""}`); if (!cond) failed++; };

function setup(id) {
  const w = buildPractice(id); w.traffic = null;      // the rule checks drive a scripted car: no random cross traffic
  const s = new Session(w, { mode: "practice", transmission: "auto" });
  const c = s.car;
  c.belt = true; c.startEngine(); c.shift("D"); c.handbrake = false;
  return s;
}
const H = 1 / 120;
// drive straight; `ctrl(s, frontS)` returns { v: target m/s, stop: bool }
function drive(s, seconds, ctrl) {
  const task = s.W.tasks[0];
  for (let t = 0; t < seconds && s.state === "running"; t += H) {
    const fs = toLocal(task.pose, ...s.car.frontPoint())[0];
    const { v, stop } = ctrl(fs, t);
    const c = s.car;
    if (stop) { c.throttle = 0; c.brake = 1; }
    else if (c.v < v - 0.2) { c.throttle = 0.5; c.brake = 0; }
    else if (c.v > v + 0.3) { c.throttle = 0; c.brake = 0.4; }
    else { c.throttle = 0.15; c.brake = 0; }
    s.step(H);
  }
}
const codes = s => s.log.map(e => e.code).join(",");

// railway: careful (stop 0.5 m before line, stand 4 s)
{
  const s = setup("temir"); let stoppedAt = null;
  drive(s, 60, (fs, t) => {
    if (stoppedAt == null && 12 - fs < 0.9 + s.car.v * s.car.v / 9) { if (s.car.v === 0) stoppedAt = t; return { stop: true }; }
    if (stoppedAt != null && t - stoppedAt < 4) return { stop: true };
    return { v: 3 };
  });
  check("railway careful: no penalties", s.total === 0, codes(s));
  check("railway careful: element done", s.state === "done");
}
// railway: no stop
{
  const s = setup("temir"); drive(s, 40, () => ({ v: 4 }));
  check("railway rolled through: #25", s.log.some(e => e.code === "railStop"), codes(s));
}
// railway: stop 3 m short, then go immediately
{
  const s = setup("temir"); let st = null, warnedWhileStanding = false;
  s.on(ev => { if (ev.type === "stopFarNow" && s.car.v === 0 && !s.log.some(e => e.code === "stopFar")) warnedWhileStanding = true; });
  drive(s, 60, (fs, t) => {
    if (st == null && 12 - fs < 3 + s.car.v * s.car.v / 9) { if (s.car.v === 0) st = t; return { stop: true }; }
    if (st != null && t - st < 1) return { stop: true };
    return { v: 3 };
  });
  check("railway far + early start: #4 and #12", s.log.some(e => e.code === "stopFar") && s.log.some(e => e.code === "early3s"), codes(s));
  check("stopped far: told at once, before the penalty", warnedWhileStanding);
}
// seat belt and speed
{
  const s = setup("tezlashish"); s.car.belt = false; s.car.v = 12.8;
  drive(s, 30, () => ({ v: 13.5 }));
  check("no belt: #1", s.log.some(e => e.code === "belt"), codes(s));
  check("over 45 km/h: #31", s.log.some(e => e.code === "speed40"), codes(s));
}
{
  const s = setup("piyoda");
  drive(s, 25, () => ({ v: 7.6 }));
  check("27 km/h outside the 40 zone: #8", s.log.some(e => e.code === "speed20"), codes(s));
}
// intersection: wait for green, then go
{
  const s = setup("chorraha-straight");
  const task = s.W.tasks[0];
  drive(s, 90, fs => {
    const [st] = s.W.lightState("NS", s.clock);
    if (fs < task.pose && false) return { v: 0 };
    const crossed = s.active && s.active.f.crossed;
    if (!crossed && st !== "green" && 30 - fs < 0.8 + s.car.v * s.car.v / 9) return { stop: true };
    return { v: 3 };
  });
  check("intersection on green: no penalties", s.total === 0, codes(s));
  check("intersection done", s.state === "done");
}
// intersection: run the red
{
  const s = setup("chorraha-straight");
  s.W.lightOffset = 13;   // NS red at t=0
  drive(s, 30, () => ({ v: 4 }));
  check("red light: #24", s.log.some(e => e.code === "redLight"), codes(s));
}

console.log(failed ? `\n${failed} check(s) failed` : "\nall rule checks passed");
if (failed) process.exitCode = 1;
