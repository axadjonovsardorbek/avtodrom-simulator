// Renders the car from the same viewpoints as the reference photos for side-by-side checks.
import puppeteer from "puppeteer-core";
const OUT = process.argv[2], BASE = process.argv[3] || "http://localhost:5179/";
const browser = await puppeteer.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: "new", args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
const page = await browser.newPage(); await page.setViewport({ width: 738, height: 414 });
const errs = []; page.on("pageerror", e => errs.push(e.message));
await page.goto(BASE, { waitUntil: "load", timeout: 120000 });
const wait = ms => new Promise(r => setTimeout(r, ms));
await wait(3000);
await page.click("#showroomBtn"); await wait(2500);
await page.evaluate(() => { document.querySelector("#showroom").style.display = "none"; document.querySelector(".topbar").style.display = "none"; });
// camera presets: [name, mode, setup]
const views = [
  ["ext-front34", v => { v.setMode("orbit"); v.orbit = { az: 0.62, el: 0.12, dist: 6.2 }; }],
  ["ext-side", v => { v.setMode("orbit"); v.orbit = { az: -1.5708, el: 0.02, dist: 8.5 }; }],
  ["int-rear", v => { v.setMode("interiorRear"); }]
];
for (const [name, setup] of views) {
  await page.evaluate(src => { const v = window.__sim.view; (0, eval)(src)(v); }, setup.toString());
  await wait(1500);
  await page.screenshot({ path: `${OUT}/cmp-${name}.png` });
}
console.log("errors:", errs.join(" | ") || "none");
await browser.close();
