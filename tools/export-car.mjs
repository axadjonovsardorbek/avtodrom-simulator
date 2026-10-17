// Regenerates public/models/cobalt.glb from the procedural model in src/render/carModel.js.
// Usage: npm run export:car   (needs Google Chrome installed)
import { createServer } from "vite";
import puppeteer from "puppeteer-core";
import { writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const chrome = process.env.CHROME || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const server = await createServer({ root, server: { port: 5199, strictPort: false }, logLevel: "error" });
await server.listen();
const url = server.resolvedUrls.local[0];
const browser = await puppeteer.launch({ executablePath: chrome, headless: "new", args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
try {
  const page = await browser.newPage();
  await page.goto(url, { waitUntil: "networkidle0" });
  await page.waitForFunction(() => typeof window.__exportCar === "function");
  const b64 = await page.evaluate(() => window.__exportCar());
  const out = join(root, "public/models/cobalt.glb");
  mkdirSync(dirname(out), { recursive: true });
  const buf = Buffer.from(b64, "base64");
  writeFileSync(out, buf);
  console.log(`wrote ${out} (${(buf.length / 1024).toFixed(0)} KB)`);
} finally {
  await browser.close();
  await server.close();
}
