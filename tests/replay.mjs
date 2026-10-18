import { Recorder } from "../src/sim/replay.js";
const ok = (c, m) => { if (!c) { console.error("FAIL", m); process.exit(1); } console.log("ok  ", m); };
const r = new Recorder(), s = { clock: 0, car: { x: 0, y: 0, th: 0, h: 0, v: 0 } };
for (let i = 0; i <= 50; i++) { s.clock = i * 0.02; s.car.x = i; r.sample(s); }     // 1 s at 50 Hz
ok(r.samples.length <= 11 && r.samples.length >= 9, "samples at about 10 Hz");
ok(Math.abs(r.at(0.5).x - 25) < 3, "interpolates");
ok(r.at(99).x === r.samples[r.samples.length - 1][1] && r.at(-1).x === 0, "clamps outside the run");
s.car.th = 3.1; r.next = 0; s.clock = 2; r.sample(s); s.car.th = -3.1; s.clock = 2.1; r.sample(s);
const th = r.at(2.05).th; ok(Math.abs(Math.abs(th) - Math.PI) < 0.1, "angle blends across +-pi");
r.mark(s, { pts: 5, n: 1, text: "x" }); ok(r.marks.length === 1 && r.marks[0].pts === 5, "marks");
