import puppeteer from "puppeteer-core";
const OUT = process.argv[2];
const browser = await puppeteer.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: "new", args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--autoplay-policy=no-user-gesture-required"] });
const page = await browser.newPage(); await page.setViewport({ width: 1100, height: 690 });
const errs = []; page.on("pageerror", e => errs.push(e.message)); page.on("console", m => m.type() === "error" && errs.push(m.text()));
await page.evaluateOnNewDocument(() => localStorage.setItem("avtodrom.settings", JSON.stringify({ camera: "chase", quality: "high" })));
await page.goto("http://localhost:5179/#mashq-piyoda", { waitUntil: "networkidle0" });
const wait = ms => new Promise(r => setTimeout(r, ms));
await wait(2500);
for (const [name, yaw] of [["front34", 2.5], ["front", Math.PI], ["rear34", 0.6]]) {
  await page.evaluate(y => { window.__sim.view.lookOverride = y; window.__sim.view.chasePos = null; }, yaw);
  await wait(1500);
  await page.screenshot({ path: `${OUT}/car-${name}.png` });
}
// exercise the sound effects so any runtime error shows up
await page.evaluate(() => { const a = window.__sim.audio; a.start(); a.starter(); a.shift(); a.grind(); a.handbrake(true); a.belt(true); a.penalty(); a.chime(); a.thump(1); a.stall(); a.countdown(true); a.say("Start"); });
await wait(500);
console.log("errors:", errs.join(" | ") || "none");
await browser.close();
