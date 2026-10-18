// Screenshots of the ideal-path guides: node tests/guides.mjs <outdir> (dev server on :5179)
import puppeteer from "puppeteer-core";
const OUT = process.argv[2];
const browser = await puppeteer.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: "new",
  args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] });
const page = await browser.newPage();
await page.setViewport({ width: 1280, height: 800 });
const errs = []; page.on("pageerror", e => errs.push(e.message));
const wait = ms => new Promise(r => setTimeout(r, ms));
for (const el of (process.argv[3] || "parkovka,boks,burilish").split(",")) {
  await page.goto("http://localhost:5179/#mashq-" + el, { waitUntil: "networkidle0" });
  await page.reload({ waitUntil: "networkidle0" });
  await wait(3500);
  // park the car beside the element and look from above
  await page.evaluate(() => { const s = window.__sim.session, p = s.W.tasks[0].pose, c = s.car; c.x = p.x + Math.cos(p.th) * 10 - Math.sin(p.th) * 9; c.y = p.y + Math.sin(p.th) * 10 + Math.cos(p.th) * 9; c.th = p.th; window.__sim.view.orbit = { az: 2.5, el: 1.3, dist: 18 }; });
  for (let i = 0; i < 2; i++) { await page.keyboard.press("KeyC"); await wait(400); } await wait(1200); await page.evaluate(() => { window.__sim.view.orbit = { az: 2.5, el: 1.3, dist: 18 }; }); await wait(600);
  await page.screenshot({ path: `${OUT}/${el}.png` });
}
console.log(errs.length ? errs.join("\n") : "no page errors");
await browser.close();
