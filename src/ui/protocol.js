// The exam protocol sheet: a one-page report in the form of the exam centre's penalty table,
// drawn on a canvas so it can be shown, saved as a picture or printed.
import { PEN, PASS_LIMIT } from "../sim/penalties.js";

const W = 1240, PAD = 70;                                   // A4 at 150 dpi
const INK = "#1b1f24", MUTED = "#5a626b", RULE = "#c9ced4", RED = "#c62828", GREEN = "#1b7f3c";

function wrap(g, text, maxW) {
  const out = []; let line = "";
  for (const w of text.split(" ")) {
    const t = line ? line + " " + w : w;
    if (g.measureText(t).width > maxW && line) { out.push(line); line = w; } else line = t;
  }
  if (line) out.push(line);
  return out;
}

// data: { name, date: Date, modeLabel, car, plate, time (s), total, passed, log: [{ code, pts }] }
export function drawProtocol(d) {
  const rows = Object.entries(PEN).sort((a, b) => a[1].n - b[1].n);
  const hits = {};
  for (const e of d.log) { const h = hits[e.code] || (hits[e.code] = { c: 0, p: 0 }); h.c++; h.p += e.pts; }
  const probe = document.createElement("canvas").getContext("2d");
  probe.font = "20px system-ui, sans-serif";
  const lines = rows.map(([, p]) => wrap(probe, p.text, 700));
  const rowH = n => 14 + n * 25;
  const tableH = 44 + lines.reduce((s, l) => s + rowH(l.length), 0);
  const H = 470 + tableH + 250;
  const c = document.createElement("canvas"); c.width = W; c.height = H;
  const g = c.getContext("2d");
  g.fillStyle = "#fff"; g.fillRect(0, 0, W, H);
  g.textBaseline = "alphabetic";
  const font = (px, w = 400) => { g.font = `${w} ${px}px system-ui, "Helvetica Neue", Arial, sans-serif`; };

  // header
  g.fillStyle = INK; font(38, 700); g.textAlign = "center";
  g.fillText("IMTIHON BAYONNOMASI", W / 2, 110);
  font(22); g.fillStyle = MUTED;
  g.fillText("Avtomatlashtirilgan avtodrom · B toifa · Simulyator natijasi", W / 2, 148);
  g.strokeStyle = INK; g.lineWidth = 3; g.beginPath(); g.moveTo(PAD, 176); g.lineTo(W - PAD, 176); g.stroke();

  // candidate block
  g.textAlign = "left";
  const info = [
    ["Nomzod", d.name || "________________________"],
    ["Sana", d.date.toLocaleDateString("uz-UZ", { day: "2-digit", month: "2-digit", year: "numeric" }) + "  " + d.date.toLocaleTimeString("uz-UZ", { hour: "2-digit", minute: "2-digit" })],
    ["Imtihon turi", d.modeLabel], ["Avtomobil", `${d.car} · ${d.plate}`], ["Davomiyligi", `${Math.floor(d.time / 60)} daq ${String(Math.floor(d.time % 60)).padStart(2, "0")} s`]
  ];
  let y = 222;
  for (const [k, v] of info) { font(22); g.fillStyle = MUTED; g.fillText(k, PAD, y); font(24, 600); g.fillStyle = INK; g.fillText(v, PAD + 230, y); y += 40; }

  // table
  y += 16;
  const cols = { n: PAD + 12, text: PAD + 70, cnt: W - PAD - 190, pts: W - PAD - 14 };
  g.fillStyle = "#eef1f4"; g.fillRect(PAD, y, W - 2 * PAD, 40);
  font(18, 700); g.fillStyle = MUTED; g.textAlign = "left"; g.fillText("№", cols.n, y + 27); g.fillText("JARIMA BANDI", cols.text, y + 27);
  g.textAlign = "right"; g.fillText("MARTA", cols.cnt + 64, y + 27); g.fillText("BALL", cols.pts, y + 27);
  y += 40;
  rows.forEach(([code, p], i) => {
    const h = hits[code], rh = rowH(lines[i].length);
    if (h) { g.fillStyle = "#fdecea"; g.fillRect(PAD, y, W - 2 * PAD, rh); }
    g.strokeStyle = RULE; g.lineWidth = 1; g.beginPath(); g.moveTo(PAD, y + rh); g.lineTo(W - PAD, y + rh); g.stroke();
    g.fillStyle = h ? RED : INK; g.textAlign = "left"; font(20, h ? 700 : 400);
    g.fillText(String(p.n), cols.n, y + 31);
    lines[i].forEach((ln, k) => g.fillText(ln, cols.text, y + 31 + k * 25));
    g.textAlign = "right"; font(20, h ? 700 : 400);
    g.fillStyle = h ? RED : MUTED;
    g.fillText(h ? `${h.c}` : `(${p.pts})`, cols.cnt + 64, y + 31);
    g.fillText(h ? `${h.p}` : "–", cols.pts, y + 31);
    y += rh;
  });
  g.strokeStyle = INK; g.lineWidth = 2; g.beginPath(); g.moveTo(PAD, y); g.lineTo(W - PAD, y); g.stroke();

  // result
  y += 56; g.textAlign = "left";
  font(26, 600); g.fillStyle = INK; g.fillText(`Jami jarima balli: ${d.total}  (ruxsat etilgan chegara: ${PASS_LIMIT})`, PAD, y);
  y += 62; font(40, 800); g.fillStyle = d.passed ? GREEN : RED;
  g.fillText(d.passed ? "NATIJA: O'TDI" : "NATIJA: O'TMADI", PAD, y);
  y += 70; font(20); g.fillStyle = MUTED;
  g.fillText("Nomzod imzosi: ______________________", PAD, y);
  g.textAlign = "right"; g.fillText("Imtihon oluvchi: ______________________", W - PAD, y);
  y += 38; g.textAlign = "left"; font(16); g.fillText("Bu simulyator natijasi bo'lib, rasmiy imtihon hujjati hisoblanmaydi.", PAD, y);
  return c;
}
