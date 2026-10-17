// Browser check: car loads from the .glb, its parts are rigged, and sound is produced.
import puppeteer from "puppeteer-core";
const OUT = process.argv[2];
const browser = await puppeteer.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: "new", args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--autoplay-policy=no-user-gesture-required"] });
const page = await browser.newPage(); await page.setViewport({ width: 1100, height: 690 });
const errs = []; page.on("pageerror", e => errs.push(e.message)); page.on("console", m => (m.type() === "error" || /car model/.test(m.text())) && errs.push(m.text()));
await page.evaluateOnNewDocument(() => localStorage.setItem("avtodrom.settings", JSON.stringify({ camera: "chase", quality: "high", muted: true })));
await page.goto("http://localhost:5179/", { waitUntil: "networkidle0" });
const wait = ms => new Promise(r => setTimeout(r, ms));
await wait(1500);
await page.click(".elbtn");                       // real user gesture: start the first practice element
await wait(2500);
const info = await page.evaluate(() => {
  const v = window.__sim.view, r = v.carView.root;
  const names = ["body", "interior", "wheel_pivot_FL", "wheel_spin_RR", "steering_wheel", "cluster_screen", "ind_L_front"].map(n => n + ":" + !!r.getObjectByName(n));
  return { fromGlb: r.children[0] && r.children[0].name === "car", names: names.join(" "), muteLabel: document.getElementById("muteBtn").textContent };
});
console.log("model:", JSON.stringify(info));
// sound: start the engine and rev it
await page.keyboard.press("KeyK");
await page.keyboard.down("ShiftLeft"); await page.keyboard.press("KeyI"); await wait(800);
const idle = await page.evaluate(() => window.__sim.audio.level());
await page.keyboard.down("KeyW"); await wait(1200);
const rev = await page.evaluate(() => ({ level: window.__sim.audio.level(), state: window.__sim.audio.ctx.state, rpm: Math.round(window.__sim.session.car.rpm) }));
await page.keyboard.up("KeyW"); await page.keyboard.up("ShiftLeft");
console.log("audio: idle RMS", idle.toFixed(4), "revving RMS", rev.level.toFixed(4), "ctx", rev.state, "rpm", rev.rpm);
await page.evaluate(() => { window.__sim.view.lookOverride = 2.5; window.__sim.view.chasePos = null; });
await wait(1500);
await page.screenshot({ path: OUT + "/glb-front34.png" });
console.log("errors:", errs.join(" | ") || "none");
await browser.close();
