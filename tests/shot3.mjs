import puppeteer from "puppeteer-core";
const OUT = process.argv[2];
const browser = await puppeteer.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: "new", args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] });
const page = await browser.newPage();
await page.setViewport({ width: 1100, height: 700 });
const errs = []; page.on("pageerror", e => errs.push(e.message));
const wait = ms => new Promise(r => setTimeout(r, ms));
for (const h of ["mashq-estakada", "mashq-chorraha-left", "mashq-boks"]) {
  await page.goto("http://localhost:5179/?" + h + "#" + h, { waitUntil: "networkidle0" });
  await wait(2000);
  await page.keyboard.press("KeyC"); await wait(1500);
  await page.screenshot({ path: `${OUT}/${h}.png` });
}
console.log("errors:", errs.join(" | ") || "none");
await browser.close();
