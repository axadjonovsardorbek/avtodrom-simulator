// History: stars, best, comparison with the previous try, aggregation
const store = {};
globalThis.localStorage = { getItem: k => store[k] ?? null, setItem: (k, v) => { store[k] = String(v); }, removeItem: k => { delete store[k]; } };
const { recordAttempt, starsFor, analyse } = await import("../src/sim/history.js");
const ok = (c, m) => { if (!c) { console.error("FAIL", m); process.exit(1); } console.log("ok  ", m); };
const sess = (total, log = []) => ({ total, t: 100, log });
ok(starsFor(0, true) === 3 && starsFor(20, true) === 2 && starsFor(60, true) === 1 && starsFor(0, false) === 0, "stars");
const a = recordAttempt(sess(30, [{ code: "belt", n: 1, text: "kamar", pts: 5, task: "Marshrut" }]), { passed: true, key: "exam" });
ok(a.attempts === 1 && a.prev === null && a.newBest && a.stars === 1, "first attempt");
const b = recordAttempt(sess(10, [{ code: "belt", n: 1, text: "kamar", pts: 5 }, { code: "belt", n: 1, text: "kamar", pts: 5 }]), { passed: true, key: "exam" });
ok(b.prev.total === 30 && b.newBest && b.best === 10 && b.stars === 2, "better second attempt");
const c = recordAttempt(sess(150), { passed: false, key: "exam" });
ok(!c.newBest && c.best === 10 && c.stars === 0, "failed attempt keeps best");
const an = analyse();
ok(an.total === 3 && an.passes === 2 && an.mistakes[0].code === "belt" && an.mistakes[0].count === 3 && an.mistakes[0].pts === 15, "aggregate");
