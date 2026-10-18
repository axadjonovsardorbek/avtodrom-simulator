// Attempt history kept in localStorage: feeds the result screen (stars, best, change since
// the previous try) and the mistakes analysis in the menu.
import { PASS_LIMIT } from "./penalties.js";

const KEY = "avtodrom.history";
const MAX = 200;

export function loadHistory() {
  try { const h = JSON.parse(localStorage.getItem(KEY) || "[]"); return Array.isArray(h) ? h : []; } catch (_) { return []; }
}
function saveHistory(h) { try { localStorage.setItem(KEY, JSON.stringify(h.slice(-MAX))); } catch (_) {} }

// 3 stars: no penalty, 2: up to 20, 1: passed (within the limit), 0: failed
export function starsFor(total, passed) {
  if (!passed) return 0;
  return total === 0 ? 3 : total <= 20 ? 2 : 1;
}

// key: "exam", "training" or "practice:<element id>"
export const keyFor = (mode, elementId) => mode === "practice" ? "practice:" + elementId : mode;

export function recordAttempt(session, { passed, key }) {
  const mistakes = {};
  for (const e of session.log) {
    const m = mistakes[e.code] || (mistakes[e.code] = { n: e.n, text: e.text, pts: 0, count: 0, tasks: {} });
    m.pts += e.pts; m.count++;
    if (e.task) m.tasks[e.task] = (m.tasks[e.task] || 0) + 1;
  }
  const rec = { at: Date.now(), key, passed, total: session.total, t: Math.round(session.t), mistakes };
  const h = loadHistory();
  const same = h.filter(r => r.key === key);
  const prev = same[same.length - 1] || null;
  const bestBefore = same.filter(r => r.passed).reduce((b, r) => b === null || r.total < b ? r.total : b, null);
  h.push(rec);
  saveHistory(h);
  return {
    rec, prev, stars: starsFor(session.total, passed),
    attempts: same.length + 1,
    newBest: passed && (bestBefore === null || session.total < bestBefore),
    best: passed ? Math.min(session.total, bestBefore ?? Infinity) : bestBefore
  };
}

// Aggregate for the analysis screen
export function analyse(history = loadHistory()) {
  const byMistake = {}, byKey = {};
  for (const r of history) {
    const k = byKey[r.key] || (byKey[r.key] = { key: r.key, tries: 0, passes: 0, best: null, last: [] });
    k.tries++; if (r.passed) { k.passes++; if (k.best === null || r.total < k.best) k.best = r.total; }
    k.last.push(r.total); if (k.last.length > 10) k.last.shift();
    for (const [code, m] of Object.entries(r.mistakes || {})) {
      const a = byMistake[code] || (byMistake[code] = { code, n: m.n, text: m.text, pts: 0, count: 0, attempts: 0, tasks: {} });
      a.pts += m.pts; a.count += m.count; a.attempts++;
      for (const [t, c] of Object.entries(m.tasks || {})) a.tasks[t] = (a.tasks[t] || 0) + c;
    }
  }
  const mistakes = Object.values(byMistake).sort((a, b) => b.pts - a.pts);
  return { total: history.length, passes: history.filter(r => r.passed).length, mistakes, keys: Object.values(byKey), limit: PASS_LIMIT };
}

export function clearHistory() { try { localStorage.removeItem(KEY); } catch (_) {} }
