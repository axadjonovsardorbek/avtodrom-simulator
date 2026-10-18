// The driving instructor in the passenger seat: picks what to say about the
// learner's driving and which gesture to make. Mood "angry" scolds, "calm" coaches.
// Lines live in lines.json and are recorded to public/audio/uz/ins/<mood>/<key>_<n>.mp3.
import LINES from "./lines.json";

// penalty code -> line key
const PEN = {
  belt: "belt", startSignal: "signal", turnSignal: "signal", finishSignal: "signal", startSigOff: "signalOff",
  stopFar: "stopLine", stopLine: "stopLine", early3s: "early", speed20: "speed", speed40: "speed",
  start30: "go", start40: "go", greenSlow: "slow", slow2min: "slow", hill30: "hill", hillBack: "hill",
  ctrlLine: "line", regLine: "line", gear2: "gear", alarm2s: "hazard", hazardOn: "hazard", hazardOff: "hazard",
  stall: "stall", redLight: "redLight", railStop: "rail", notDone: "notDone", offRoute: "offRoute",
  reverse: "reverse", crash: "crash"
};
// lines that cut in over whatever is being said
const URGENT = new Set(["crash", "hill", "redLight", "rail", "reverse"]);
// gesture that goes with a line
const GESTURE = { good: "thumb", pass: "thumb", crash: "brace", hill: "brace", redLight: "brace", rail: "brace", go: "point", offRoute: "point", signal: "point", gear: "point" };

// Mood "rude" (18+) plays only the user's own recordings, shuffled, on every mistake
// (src/instructor/source/*.ogg -> public/audio/uz/ins/rude/<name>.mp3).
// "chingzbl" is cut to its first 7 s and "bl" to its first 4 s; "hayron" (amazement) is rarer, see below
const RUDE_CLIPS = ["chingiz_iye", "dadangmanmi", "dal", "davlataka", "haromi", "jamshid", "uka", "bekzod1", "bekzod2", "chingiz_uka", "chingzbl", "bl", "nodon", "uka2", "qlq", "shayba", "dab", "mazgi", "tupik", "skameyka"];
const HAYRON_EVERY = 5, HAYRON_CLEAN = 90;          // about one mistake in five; or after this many seconds of driving without a penalty
const NOT_MISTAKES = new Set(["hello", "good", "pass"]);
const voiceMood = mood => mood === "rude" ? "angry" : mood;

export const lineIds = mood => Object.entries(LINES.lines).flatMap(([k, v]) => v[voiceMood(mood)].map((_, i) => `ins/${voiceMood(mood)}/${k}_${i}`))
  .filter(() => mood !== "rude").concat(mood === "rude" ? RUDE_CLIPS.concat("hayron", "barakalla").map(c => "ins/rude/" + c) : []);

export class Instructor {
  constructor(audio) {
    this.audio = audio;
    this.mood = "angry";
    this.reset();
  }
  get on() { return this.mood !== "off"; }
  reset() {
    this.last = {};            // key -> time it was last said
    this.lastAny = -99;
    this.lastVariant = {};
    this.gesture = null; this.gestureUntil = 0;
    this.t = 0; this.cleanT = 0; this.lastHayron = -99; this.still = 0; this.revT = 0; this.hbT = 0; this.helloAt = 0.8;
  }

  say(key, { urgent = URGENT.has(key), cooldown = 6 } = {}) {
    if (!this.on || !LINES.lines[key]) return;
    if (this.mood === "rude") return this.rude(key);
    if (this.t - (this.last[key] ?? -99) < cooldown) return;
    if (!urgent && this.t - this.lastAny < 2.2) return;
    const mood = voiceMood(this.mood);
    const list = LINES.lines[key][mood];
    let i = Math.floor(Math.random() * list.length);
    if (list.length > 1 && i === this.lastVariant[key]) i = (i + 1) % list.length;
    this.lastVariant[key] = i; this.last[key] = this.lastAny = this.t;
    this.audio.prompt(`ins/${mood}/${key}_${i}`, list[i], urgent, { pan: 0.35, talk: true });
    const g = GESTURE[key] || (mood === "angry" && key !== "hello" ? "angry" : null);
    if (g) { this.gesture = g; this.gestureUntil = this.t + (g === "thumb" ? 2.5 : 2.2); }
  }

  // one of the user's recordings for any mistake: a shuffled deck, so all play before one repeats
  rude(key) {
    if (NOT_MISTAKES.has(key) || this.audio.talking()) return;
    // now and then, amazement instead of a scolding
    if (this.t - (this.lastHayron ?? -99) > 25 && Math.random() < 1 / HAYRON_EVERY) return this.hayron();
    if (!this.deck || !this.deck.length) {
      this.deck = RUDE_CLIPS.slice().sort(() => Math.random() - 0.5);
      if (this.deck[0] === this.lastRude) this.deck.push(this.deck.shift());
    }
    const c = this.lastRude = this.deck.shift();
    this.lastAny = this.t;
    this.audio.prompt("ins/rude/" + c, null, true, { pan: 0.2, talk: true });
    this.gesture = "angry"; this.gestureUntil = this.t + 2.5;
  }

  hayron() {
    this.lastHayron = this.lastAny = this.t; this.cleanT = 0;
    this.audio.prompt("ins/rude/hayron", null, true, { pan: 0.2, talk: true });
    this.gesture = "angry"; this.gestureUntil = this.t + 2.5;
  }

  // session events (penalty, taskDone, car, limit, end)
  onEvent(ev) {
    if (!this.on) return;
    switch (ev.type) {
      case "penalty":
        this.cleanT = 0; this.taskPen = true;
        if (ev.code === "stopFar") break;              // main.js plays the user's own clip for this one
        this.say(PEN[ev.code] || "generic", { cooldown: 3 }); break;
      case "taskDone":
        // rude mood: an exercise done without a single mistake earns a "barakalla" (its first 3 s)
        if (this.mood === "rude") { if (ev.ok && !this.taskPen && !this.audio.talking()) { this.lastAny = this.t; this.audio.prompt("ins/rude/barakalla", null, true, { pan: 0.2, talk: true }); this.gesture = "thumb"; this.gestureUntil = this.t + 2.5; } this.taskPen = false; break; }
        if (ev.ok) this.say("good", { cooldown: 4 }); break;
      case "limit": this.say("limit", { urgent: true }); break;
      case "end": this.say(ev.passed ? "pass" : "fail", { urgent: true, cooldown: 0 }); break;
      case "car":
        if (ev.kind === "stall") this.say("stall", { cooldown: 4 });
        else if (ev.kind === "grind") this.say("grind", { cooldown: 8 });
        break;
    }
  }

  // things he notices without a penalty
  update(session, dt, startSignalAt) {
    this.t += dt;
    if (!this.on) return;
    if (this.helloAt && this.t > this.helloAt) { this.helloAt = 0; this.say("hello", { cooldown: 0 }); }
    if (session.state !== "running") return;
    const car = session.car;
    // rude mood: a long clean stretch is also worth a gasp
    if (this.mood === "rude" && session.started) {
      this.cleanT = (this.cleanT || 0) + dt;
      if (this.cleanT > HAYRON_CLEAN && !this.audio.talking()) this.hayron();
    }
    // standing still long after the start signal
    const waiting = session.full && !session.started && session.clock > startSignalAt;
    this.still = waiting && Math.abs(car.v) < 0.1 ? this.still + dt : 0;
    if (this.still > 9) { this.say("go", { cooldown: 15 }); }
    this.revT = car.engineOn && car.rpm > 4800 ? this.revT + dt : 0;
    if (this.revT > 1) this.say("rev", { cooldown: 15 });
    this.hbT = car.handbrake && Math.abs(car.v) > 1.5 ? this.hbT + dt : 0;
    if (this.hbT > 1.2) this.say("handbrake", { cooldown: 15 });
  }

  // what the figure should be doing right now
  pose() {
    return {
      talking: this.audio.talking(),
      gesture: this.t < this.gestureUntil ? this.gesture : null,
      angry: voiceMood(this.mood) === "angry" && this.t - this.lastAny < 4 && this.gesture !== "thumb"
    };
  }
}
