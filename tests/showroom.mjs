// Screenshots of the car from several angles in the 360 showroom, plus the cockpit.
import puppeteer from "puppeteer-core";
const OUT = process.argv[2], BASE = process.argv[3] || "http://localhost:5179/";
const browser = await puppeteer.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: "new", args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
const page = await browser.newPage(); await page.setViewport({ width: 1000, height: 640 });
const errs = []; page.on("pageerror", e => errs.push(e.message)); page.on("console", m => (m.type() === "error" || /car model/.test(m.text())) && errs.push(m.text()));
await page.goto(BASE, { waitUntil: "networkidle0" });
const wait = ms => new Promise(r => setTimeout(r, ms));
await wait(1500);
await page.click("#showroomBtn"); await wait(1500);
const fromGlb = await page.evaluate(() => { const r = window.__sim.view.carView.root; return r.children[0] && r.children[0].name === "car"; });
const shots = [["front34", 0.75, 0.18, 6.8], ["side", 1.5708, 0.08, 7.5], ["rear34", 2.45, 0.2, 7], ["front", 0, 0.1, 6.5], ["rear", 3.1416, 0.12, 6.5]];
for (const [name, az, el, dist] of shots) {
  // az is measured from the car's heading: 0 = in front, pi/2 = right side
  await page.evaluate((az, el, dist) => { const v = window.__sim.view; v.orbit = { az, el, dist }; }, az, el, dist);
  await wait(900);
  await page.screenshot({ path: `${OUT}/sr-${name}.png` });
}
await page.click('[data-s="cockpit"]'); await wait(1200);
await page.screenshot({ path: `${OUT}/sr-cockpit.png` });
await page.evaluate(() => { window.__sim.view.drag = { yaw: 0.5, pitch: -0.3 }; }); await wait(900);
await page.screenshot({ path: `${OUT}/sr-cockpit-console.png` });
console.log("glb:", fromGlb, "errors:", errs.join(" | ") || "none");
await browser.close();
