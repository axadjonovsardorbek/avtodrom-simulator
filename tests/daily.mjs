import { dailyTask } from "../src/sim/daily.js";
const ok = (c, m) => { if (!c) { console.error("FAIL", m); process.exit(1); } console.log("ok  ", m); };
const els = [{ id: "parkovka", name: "Parkovka" }, { id: "boks", name: "Boks" }, { id: "ilon", name: "Ilon" }];
const d = new Date(2026, 9, 18, 15, 0), same = new Date(2026, 9, 18, 8, 0);
ok(dailyTask(d, els).text === dailyTask(same, els).text, "same task all day");
const texts = new Set(Array.from({ length: 12 }, (_, i) => dailyTask(new Date(2026, 9, 1 + i), els).text)); ok(texts.size >= 5, "tasks vary from day to day");
// find a day whose task is the "turli mashq" one and check counting
let day = new Date(2026, 9, 1); while (!/turli/.test(dailyTask(day, els).text)) day = new Date(day.getTime() + 86400000);
const t = dailyTask(day, els), at = day.getTime() + 3600000;
const H = [{ key: "practice:boks", passed: true, at }, { key: "practice:boks", passed: true, at }, { key: "practice:ilon", passed: true, at }, { key: "practice:ilon", passed: true, at: at - 90000000 }];
ok(t.progress(H) === 2, "different exercises only, today only");
ok(t.progress([...H, { key: "practice:parkovka", passed: true, at }]) === 3, "goal reached");
