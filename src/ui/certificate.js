// Certificate for a passed exam, drawn on a canvas (landscape A4 at 150 dpi) to save or print.
const MONTHS = ["yanvar", "fevral", "mart", "aprel", "may", "iyun", "iyul", "avgust", "sentyabr", "oktyabr", "noyabr", "dekabr"];
const W = 1754, H = 1240, GOLD = "#b8892b", INK = "#1b1f24", MUTED = "#5a626b";

// data: { name, date: Date, total, time (s), car, plate, stars }
export function drawCertificate(d) {
  const c = document.createElement("canvas"); c.width = W; c.height = H;
  const g = c.getContext("2d"), font = (px, w = 400, fam = 'Georgia, "Times New Roman", serif') => { g.font = `${w} ${px}px ${fam}`; };
  g.fillStyle = "#fffdf6"; g.fillRect(0, 0, W, H);
  // double border with corner marks
  g.strokeStyle = GOLD; g.lineWidth = 10; g.strokeRect(50, 50, W - 100, H - 100);
  g.lineWidth = 2; g.strokeRect(78, 78, W - 156, H - 156);
  for (const [x, y] of [[78, 78], [W - 78, 78], [78, H - 78], [W - 78, H - 78]]) { g.fillStyle = GOLD; g.beginPath(); g.arc(x, y, 14, 0, 7); g.fill(); }
  g.textAlign = "center"; g.textBaseline = "alphabetic";
  g.fillStyle = GOLD; font(30, 700, "system-ui, sans-serif"); g.fillText("A V T O D R O M   S I M U L Y A T O R I", W / 2, 190);
  g.fillStyle = INK; font(112, 700); g.fillText("SERTIFIKAT", W / 2, 330);
  g.fillStyle = MUTED; font(34, 400); g.fillText("Ushbu sertifikat bilan tasdiqlanadiki", W / 2, 420);
  g.fillStyle = INK; font(86, 700); g.fillText(d.name || "Nomzod", W / 2, 550);
  g.strokeStyle = GOLD; g.lineWidth = 2; g.beginPath(); g.moveTo(W / 2 - 420, 580); g.lineTo(W / 2 + 420, 580); g.stroke();
  g.fillStyle = INK; font(40, 400); g.fillText("B toifa amaliy imtihonini avtodromda muvaffaqiyatli topshirdi", W / 2, 670);
  // stars
  font(84, 400, "system-ui, sans-serif");
  const st = d.stars || 1;
  for (let i = 0; i < 3; i++) { g.fillStyle = i < st ? GOLD : "#d9d3c3"; g.fillText("★", W / 2 + (i - 1) * 100, 790); }
  g.fillStyle = INK; font(38, 600, "system-ui, sans-serif");
  g.fillText(`Jarima: ${d.total} ball · Vaqt: ${Math.floor(d.time / 60)}:${String(Math.floor(d.time % 60)).padStart(2, "0")}`, W / 2, 890);
  g.fillStyle = MUTED; font(30, 400, "system-ui, sans-serif");
  g.fillText(`${d.car} · ${d.plate}`, W / 2, 940);
  g.fillText(`${d.date.getDate()}-${MONTHS[d.date.getMonth()]} ${d.date.getFullYear()}-yil`, W / 2, 985);
  g.font = '22px system-ui, sans-serif'; g.fillText("Simulyator natijasi: rasmiy hujjat hisoblanmaydi", W / 2, H - 130);
  return c;
}
