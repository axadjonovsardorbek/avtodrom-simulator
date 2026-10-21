// The garage: every car on its own lit bay on a slowly turning platform. The camera glides
// between the bays; the player picks a car (and its colour) here. Own scene and camera,
// drawn instead of the autodrome while open.
import * as THREE from "three";
import { singlePass } from "./view.js";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";

const BAY = 7.5;                         // distance between bays, m

// Gets a loaded model ready to show without a stall: its shaders built (in parallel where the
// browser can) and its textures sent to the GPU one per frame; both done on first sight took a
// frame or several.
let warmTarget = null;
export async function warmUp(renderer, root, cam, scene) {
  // never held up for long: a browser that cannot report the compile status still gets the car
  const late = ms => new Promise(r => setTimeout(() => r("late"), ms));
  if (renderer.compileAsync) {
    // shown before its shaders are linked, the car's first frame waits for every one of them (seconds on a slow GPU).
    // With the full-screen passes the scene is drawn into a half-float target, not the screen (no tone mapping in the
    // material, linear output): compiled for the screen, every program was another one and was linked again at draw
    const prev = renderer.getRenderTarget();
    if (renderer.offscreenPost) renderer.setRenderTarget(warmTarget || (warmTarget = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType })));
    // three compiles only what is visible: the hidden parts (the cabin of a car seen from outside, the driver, the
    // walkers) are shown for the moment of the compile, so the first look at them does not stall either
    const hidden = []; root.traverse(o => { if (!o.visible) { hidden.push(o); o.visible = true; } });
    let job;
    try { job = renderer.compileAsync(root, cam, scene); } finally { renderer.setRenderTarget(prev); for (const o of hidden) o.visible = false; }
    const r = await Promise.race([job.catch(e => console.warn("compile", e)), late(8000)]);
    if (r === "late") console.warn("warmUp: shaders still compiling after 8 s");
  }
  const seen = new Set();
  root.traverse(o => { if (o.isMesh) for (const m of [].concat(o.material)) for (const k in m) { const t = m[k]; if (t && t.isTexture && !t.isVideoTexture && !t.isRenderTargetTexture) seen.add(t); } });
  const end = performance.now() + 3000;
  for (const t of seen) { renderer.initTexture(t); if (performance.now() > end) break; await Promise.race([new Promise(r => requestAnimationFrame(r)), late(50)]); }
}

function tiles() {
  const c = document.createElement("canvas"); c.width = c.height = 512;
  const g = c.getContext("2d");
  g.fillStyle = "#2a2d31"; g.fillRect(0, 0, 512, 512);
  for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) {
    const v = 38 + ((i * 7 + j * 13) % 9);
    g.fillStyle = `rgb(${v},${v + 2},${v + 5})`; g.fillRect(i * 128 + 2, j * 128 + 2, 124, 124);
  }
  for (let k = 0; k < 3000; k++) { g.fillStyle = `rgba(255,255,255,${Math.random() * 0.03})`; g.fillRect(Math.random() * 512, Math.random() * 512, 2, 2); }
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(12, 6); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  return t;
}
function sign(text) {
  const c = document.createElement("canvas"); c.width = 1024; c.height = 160;
  const g = c.getContext("2d");
  g.fillStyle = "#0e1013"; g.fillRect(0, 0, 1024, 160);
  g.fillStyle = "#f2b632"; g.fillRect(0, 150, 1024, 10);
  g.fillStyle = "#eef0f2"; g.font = "700 92px 'Barlow Condensed', sans-serif"; g.textAlign = "center"; g.textBaseline = "middle";
  g.fillText(text, 512, 78);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

export class Garage {
  constructor(cars, renderer) {
    this.cars = cars; this.index = 0; this.t = 0; this.renderer = renderer;
    const s = this.scene = new THREE.Scene();
    s.background = new THREE.Color(0x0b0c0e);
    s.fog = new THREE.Fog(0x0b0c0e, 22, 45);
    // studio reflections for the paint and glass
    if (renderer) { s.environment = new THREE.PMREMGenerator(renderer).fromScene(new RoomEnvironment(), 0.04).texture; s.environmentIntensity = 0.55; }
    this.cam = new THREE.PerspectiveCamera(40, 1, 0.3, 100);
    this.camX = 0;
    const W = (cars.length - 1) * BAY + 16;
    // floor, back wall, ceiling
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(W, 16), new THREE.MeshPhysicalMaterial({ map: tiles(), roughness: 0.32, metalness: 0.1, clearcoat: 0.6, clearcoatRoughness: 0.25 }));
    floor.rotation.x = -Math.PI / 2; floor.position.set((cars.length - 1) * BAY / 2, 0, 0); floor.receiveShadow = true; s.add(floor);
    const wallMat = new THREE.MeshStandardMaterial({ color: 0x30343b, roughness: 0.85 });
    const wall = new THREE.Mesh(new THREE.PlaneGeometry(W, 7), wallMat); wall.position.set(floor.position.x, 3.5, -5); s.add(wall);
    const ceil = new THREE.Mesh(new THREE.PlaneGeometry(W, 16), wallMat); ceil.rotation.x = Math.PI / 2; ceil.position.set(floor.position.x, 6, 0); s.add(ceil);
    // wall slats and an amber strip, for depth
    const slat = new THREE.MeshStandardMaterial({ color: 0x2a2e35, roughness: 0.6, metalness: 0.3 });
    for (let x = -W / 2; x < W / 2; x += 0.9) { const b = new THREE.Mesh(new THREE.BoxGeometry(0.08, 6.6, 0.12), slat); b.position.set(floor.position.x + x, 3.3, -4.93); s.add(b); }   // clear of the wall (flush with it they flickered)
    const strip = new THREE.Mesh(new THREE.BoxGeometry(W, 0.05, 0.04), new THREE.MeshBasicMaterial({ color: new THREE.Color(2.4, 1.6, 0.4) }));
    strip.position.set(floor.position.x, 0.6, -4.84); s.add(strip);
    s.add(new THREE.HemisphereLight(0xcfd8e6, 0x2a2c30, 1.1));
    const fill = new THREE.DirectionalLight(0xffffff, 0.8); fill.position.set(4, 8, 6); s.add(fill);

    // the lamp over the bay the camera is at, the only one with a shadow: it takes over from that bay's
    // own spot (which fades out under it), so each car still has one lamp and its shadow
    const key = this.key = new THREE.SpotLight(0xfff4e6, 55, 20, 0.7, 0.6, 1.6);
    key.castShadow = true; key.shadow.mapSize.set(1024, 1024);
    key.shadow.bias = -0.0004; key.shadow.normalBias = 0.03;   // no shadow acne shimmering on the turning car
    key.shadow.camera.near = 2; key.shadow.camera.far = 14;
    key.position.set(0, 5.6, 2.5); s.add(key, key.target);
    this.bays = cars.map((car, i) => {
      const x = i * BAY;
      const g = new THREE.Group(); g.position.set(x, 0, 0); s.add(g);
      // turntable with a glowing rim
      const disc = new THREE.Mesh(new THREE.CylinderGeometry(3.2, 3.3, 0.08, 64), new THREE.MeshPhysicalMaterial({ color: 0x3a3e45, roughness: 0.25, metalness: 0.6, clearcoat: 1 }));
      disc.position.y = 0.04; disc.receiveShadow = true; g.add(disc);
      const rim = new THREE.Mesh(new THREE.TorusGeometry(3.25, 0.025, 8, 96), new THREE.MeshBasicMaterial({ color: new THREE.Color(0.6, 1.4, 2.6) }));
      rim.rotation.x = Math.PI / 2; rim.position.y = 0.085; g.add(rim);
      // light panel above and a spot light from the front
      const panel = new THREE.Mesh(new THREE.BoxGeometry(5.5, 0.06, 2.4), new THREE.MeshBasicMaterial({ color: new THREE.Color(2.2, 2.2, 2.3) }));
      panel.position.set(0, 5.9, 0); g.add(panel);
      // its light only: one shadow-casting lamp follows the camera (six shadow maps redrawn every
      // frame, each with every car in it, made the garage stutter)
      const spot = new THREE.SpotLight(0xfff4e6, 55, 20, 0.7, 0.6, 1.6);
      spot.position.set(0, 5.6, 2.5); spot.target.position.set(0, 0.5, 0);
      g.add(spot, spot.target);
      // name board on the wall
      const board = new THREE.Mesh(new THREE.PlaneGeometry(4, 0.62), new THREE.MeshBasicMaterial({ map: sign(car.name.toUpperCase()) }));
      board.position.set(0, 4.3, -4.85); g.add(board);
      const turn = new THREE.Group(); turn.position.y = 0.08; g.add(turn);
      return { car, g, turn, disc, spot, cv: null };
    });
  }

  // put a loaded car model on its bay (centred on the platform)
  setModel(i, cv) {
    const bay = this.bays[i]; if (!bay) return;
    if (bay.cv) bay.turn.remove(bay.cv.root);
    bay.cv = cv;
    const d = cv.root.getObjectByName("car")?.userData?.dims || cv.root.userData?.dims;
    const mid = d ? (d.wheelbase + d.fOh - d.rOh) / 2 : 1.4;
    cv.root.position.set(-mid, 0, 0); cv.root.rotation.set(0, 0, 0);
    cv.root.traverse(o => { if (o.isMesh && !o.name.startsWith("shadow")) o.castShadow = true; });
    cv.setCockpit && cv.setCockpit(false);
    singlePass(cv.root);
    const show = () => { if (bay.cv === cv) bay.turn.add(cv.root); };
    if (this.renderer) warmUp(this.renderer, cv.root, this.cam, this.scene).then(show, show); else show();
  }

  resize(w, h) { this.cam.aspect = w / h; this.cam.updateProjectionMatrix(); }

  update(dt, drag) {
    this.t += dt;
    const target = this.index * BAY;
    this.camX += (target - this.camX) * Math.min(1, dt * 3.2);
    for (const [i, b] of this.bays.entries()) {
      // the selected car turns (or follows the drag); the others rest at an angle
      if (i === this.index) b.turn.rotation.y = drag != null ? drag : b.turn.rotation.y + dt * 0.25;
      else b.turn.rotation.y += ((-0.7) - b.turn.rotation.y) * Math.min(1, dt * 2);
      if (b.cv) b.cv.update({ steer: 0, wheelSpin: 0, sw: 0, engineOn: true, brake: 0, gear: "P", hazard: false, sig: 0 }, performance.now());
    }
    this.key.position.set(this.camX, 5.6, 2.5); this.key.target.position.set(this.camX, 0.5, 0); this.key.target.updateMatrixWorld();
    for (const [i, b] of this.bays.entries()) b.spot.intensity = 55 * Math.min(1, Math.abs(this.camX - i * BAY) / BAY);
    const bob = Math.sin(this.t * 0.4) * 0.15;
    // looking a little below the car keeps it clear of the bar at the bottom of the screen
    this.cam.position.set(this.camX + 1.2 + bob, 2.3, 9.2);
    this.cam.lookAt(this.camX, -0.15, 0);
  }

  render(renderer) {
    renderer.shadowMap.needsUpdate = true;
    renderer.render(this.scene, this.cam);
  }
}
