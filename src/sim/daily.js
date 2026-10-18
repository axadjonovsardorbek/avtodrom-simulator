// Daily task: one goal per calendar day, the same for everyone, counted from the attempt history.

const startOfDay = d => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
const dayNumber = d => Math.floor(startOfDay(d) / 86400000);

// elements: [{ id, name }]; templates take the day's element
const TEMPLATES = [
  (el, n) => ({ goal: n, text: `Bugun ${n} marta «${el.name}» mashqini bajaring`, count: r => r.key === "practice:" + el.id && r.passed }),
  (el, n) => ({ goal: n, text: `Bugun «${el.name}» mashqini ${n} marta xatosiz (0 ball) bajaring`, count: r => r.key === "practice:" + el.id && r.passed && r.total === 0 }),
  () => ({ goal: 1, text: "Bugun to'liq imtihonni topshiring (o'ting)", count: r => r.key === "exam" && r.passed }),
  () => ({ goal: 1, text: "Bugun imtihondan 20 balldan kam jarima bilan o'ting", count: r => r.key === "exam" && r.passed && r.total < 20 }),
  () => ({ goal: 3, text: "Bugun 3 ta turli mashqni muvaffaqiyatli bajaring", count: (r, seen) => { if (!r.key.startsWith("practice:") || !r.passed || seen.has(r.key)) return false; seen.add(r.key); return true; } })
];

export function dailyTask(date, elements) {
  const n = dayNumber(date), t = TEMPLATES[n % TEMPLATES.length], el = elements[(n * 7) % elements.length];
  const def = t(el, 2 + (n % 2));        // 2 or 3 repeats when the template repeats
  const from = startOfDay(date);
  return {
    day: n, text: def.text, goal: def.goal,
    progress(history) { const seen = new Set(); let c = 0; for (const r of history) if (r.at >= from && def.count(r, seen)) c++; return Math.min(def.goal, c); }
  };
}
