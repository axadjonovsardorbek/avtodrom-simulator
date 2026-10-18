// Achievements: unlocked from the attempt history; kept in localStorage.
const KEY = "avtodrom.achievements";

// each check gets (history, last attempt, extra { elements: [ids] })
const clean = el => (h, last) => last.key === "practice:" + el && last.passed && last.total === 0;
export const ACHIEVEMENTS = [
  { id: "first_try", name: "Birinchi urinish", text: "Birinchi marta mashq yoki imtihon topshirish", check: () => true },
  { id: "first_exam", name: "Birinchi imtihon", text: "To'liq imtihonni topshirib ko'rish", check: (h, l) => l.key === "exam" },
  { id: "first_pass", name: "Imtihondan o'tdingiz", text: "Imtihonni birinchi marta muvaffaqiyatli topshirish", check: (h, l) => l.key === "exam" && l.passed },
  { id: "clean_exam", name: "Hammasi 0 ball bilan", text: "Imtihonni birorta ham jarima ballisiz topshirish", check: (h, l) => l.key === "exam" && l.passed && l.total === 0 },
  { id: "clean_parkovka", name: "Xatosiz parkovka", text: "Parallel parkovkani 0 ball bilan bajarish", check: clean("parkovka") },
  { id: "clean_boks", name: "Boksning ustasi", text: "Boksga kirishni 0 ball bilan bajarish", check: clean("boks") },
  { id: "clean_burilish", name: "Aniq burilish", text: "90° burilishlarni 0 ball bilan bajarish", check: clean("burilish") },
  { id: "streak3", name: "Ketma-ket uch", text: "Imtihondan ketma-ket 3 marta o'tish", check: h => { const ex = h.filter(r => r.key === "exam"); return ex.length >= 3 && ex.slice(-3).every(r => r.passed); } },
  { id: "ten", name: "Mashq qilish — ustozlik", text: "10 ta urinish qilish", check: h => h.length >= 10 },
  { id: "all_elements", name: "Barcha mashqlar", text: "Har bir alohida mashqni kamida bir marta bajarish", check: (h, l, x) => (x.elements || []).length > 0 && x.elements.every(id => h.some(r => r.key === "practice:" + id && r.passed)) }
];

export function loadAchievements() { try { return JSON.parse(localStorage.getItem(KEY) || "{}") || {}; } catch (_) { return {}; } }

// call after the attempt was recorded (history includes `last`); returns the newly unlocked ones
export function unlock(history, last, extra = {}) {
  const have = loadAchievements(), fresh = [];
  for (const a of ACHIEVEMENTS) if (!have[a.id] && a.check(history, last, extra)) { have[a.id] = Date.now(); fresh.push(a); }
  if (fresh.length) { try { localStorage.setItem(KEY, JSON.stringify(have)); } catch (_) {} }
  return fresh;
}
