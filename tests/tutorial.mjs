// Step-by-step drill: steps advance only when the car is really in that state
import { Tutorial } from "../src/ui/tutorial.js";
const ok = (c, m) => { if (!c) { console.error("FAIL", m); process.exit(1); } console.log("ok  ", m); };
const car = { belt: false, clutch: 0, engineOn: false, gear: "N", handbrake: true, sig: 0, odo: 0 };
const t = new Tutorial("manual");
ok(t.tick(car).step.id === "belt", "starts with the belt");
car.engineOn = true; ok(t.tick(car).step.id === "belt", "later states do not skip a step");
car.belt = true; ok(t.tick(car).step.id === "clutch", "belt done, clutch next");
car.clutch = 1; car.gear = 1; ok(t.tick(car).step.id === "hand", "engine already on and gear in: jumps to the handbrake");
car.handbrake = false; car.sig = -1; ok(t.tick(car).step.id === "go", "signal on, ready to go");
car.odo = 2; const d = t.tick(car, 1000); ok(d.done && !d.hide, "finished");
ok(t.tick(car, 20000).hide, "card hides later");
const a = new Tutorial("auto"); ok(!a.steps.some(s => s.id === "clutch") && a.steps.find(s => s.id === "gear").done({ gear: "D" }), "automatic has no clutch step");
