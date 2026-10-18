// Three.js scene, lighting, cameras and rear-view mirrors.
import * as THREE from "three";
import { buildWorldMeshes, updateWorldMeshes } from "./worldMesh.js";
import { inPoly } from "../sim/geom.js";
import { buildCar } from "./carModel.js";
// Outdoor reflection scene: bright sky dome, horizon band, dark green ground.
function skyEnvironment() {
  const scene = new THREE.Scene();
  const geo = new THREE.SphereGeometry(50, 48, 24);
  const col = [], p = geo.attributes.position, c = new THREE.Color();
  for (let i = 0; i < p.count; i++) {
    const y = p.getY(i) / 50;
    if (y > 0.04) c.setRGB(0.55 + 0.25 * (1 - y), 0.7 + 0.18 * (1 - y), 0.95);
    else if (y > -0.04) c.setRGB(0.9, 0.92, 0.94);
    else c.setRGB(0.18, 0.24, 0.14);
    col.push(c.r, c.g, c.b);
  }
  geo.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
  scene.add(new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide })));
  const sun = new THREE.Mesh(new THREE.SphereGeometry(3, 16, 8), new THREE.MeshBasicMaterial({ color: new THREE.Color(6, 5.6, 5) }));
  sun.position.set(30, 35, 20); scene.add(sun);
  return scene;
}

const MIRRORS = [
  { key: "center", pos: [1.62, 1.33, 0], yaw: 0, fov: 34, w: 640, h: 180 },
  { key: "left", pos: [2.43, 1.08, -0.96], yaw: -0.22, fov: 38, w: 320, h: 220 },
  { key: "right", pos: [2.43, 1.08, 0.96], yaw: 0.22, fov: 38, w: 320, h: 220 }
];

export class View {
  constructor(canvas) {
    const r = this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" });
    r.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
    r.shadowMap.enabled = true;
    r.shadowMap.type = THREE.PCFSoftShadowMap;
    r.toneMapping = THREE.ACESFilmicToneMapping;
    r.toneMappingExposure = 1.05;
    r.outputColorSpace = THREE.SRGBColorSpace;
    r.localClippingEnabled = true;            // the driver figure is cut away near the camera

    const s = this.scene = new THREE.Scene();
    s.background = new THREE.Color(0xa9c6e2);
    s.fog = new THREE.Fog(0xbfd2e4, 140, 460);
    s.add(new THREE.HemisphereLight(0xe4f0ff, 0x56663a, 1.1));
    // soft studio reflections for the car paint and glass
    const pm = new THREE.PMREMGenerator(r);
    s.environment = pm.fromScene(skyEnvironment(), 0.02).texture;
    s.environmentIntensity = 0.55;
    const sun = this.sun = new THREE.DirectionalLight(0xfff0d8, 2.4);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    Object.assign(sun.shadow.camera, { left: -40, right: 40, top: 40, bottom: -40, near: 1, far: 260 });
    sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.03;
    s.add(sun, sun.target);

    this.cam = new THREE.PerspectiveCamera(60, 1, 0.05, 900);
    // soft cabin light so the interior is readable under the roof's shadow
    this.cabinLight = new THREE.PointLight(0xfff2e2, 0.8, 2.6, 1.8);
    this.cabinLight.visible = false;
    s.add(this.cabinLight);
    this.carView = buildCar();
    s.add(this.carView.root);
    this.carView.root.rotation.order = "YZX";

    // mirrors render into textures shown on an overlay (flipped horizontally)
    this.hud = new THREE.Scene();
    this.hudCam = new THREE.OrthographicCamera(0, 1, 1, 0, -1, 1);
    this.mirrors = MIRRORS.map(m => {
      const cam = new THREE.PerspectiveCamera(m.fov, m.w / m.h, 0.1, 300);
      cam.position.set(...m.pos);
      cam.rotation.y = Math.PI / 2 + m.yaw;   // look backwards, side mirrors angled outwards
      this.carView.root.add(cam);
      const rt = new THREE.WebGLRenderTarget(m.w, m.h);
      rt.texture.colorSpace = THREE.SRGBColorSpace;
      rt.texture.repeat.set(-1, 1); rt.texture.offset.set(1, 0);
      const frame = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ color: 0x111214 }));
      const quad = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: rt.texture }));
      quad.position.z = 0.1;
      this.hud.add(frame, quad);
      return { ...m, cam, rt, frame, quad };
    });

    this.mode = "cockpit";
    this.look = 0;
    this.orbit = { az: 2.5, el: 0.22, dist: 7.5 };   // 360-degree view around the car
    this.drag = { yaw: 0, pitch: 0 };                 // mouse/touch look from the driver's seat
    this.chasePos = null;
    this.worldGroup = null;
  }

  // Swap in another car model (e.g. one loaded from a .glb); mirrors move with it.
  setCarModel(cv, car) {
    if (car) {
      this.eye = car.eye;
      for (const m of this.mirrors) if (car.mirrors && car.mirrors[m.key]) m.cam.position.set(...car.mirrors[m.key]);
    }
    if (car && car.seat) this.seat = car.seat;
    const old = this.carView.root;
    this.scene.remove(old);
    cv.root.rotation.order = "YZX";
    for (const m of this.mirrors) cv.root.add(m.cam);
    this.carView = cv;
    this.scene.add(cv.root);
    cv.setCockpit(this.mode === "cockpit");
    if (this.instructor) this.setInstructor(this.instructor);
    if (this.driver) { this.driver.reset(); this.placeDriver(); }
  }

  // the instructor rides in the passenger seat of whatever car is shown
  setInstructor(fig) {
    this.instructor = fig;
    fig.position.set(...(this.seat || [1.5, 0.46, 0.36]));
    this.carView.root.add(fig);
  }
  setInstructorVisible(on) { if (this.instructor) this.instructor.visible = on; }

  // the learner at the wheel; hands follow the steering wheel
  setDriver(d) { this.driver = d; this.placeDriver(); }
  placeDriver() {
    if (!this.driver) return;
    const [ex, ey, ez] = this.eye || [1.38, 1.15, -0.3];
    this.driver.root.position.set(ex + 0.13, ey - 0.69, ez);
    this.carView.root.add(this.driver.root);
    this.driver.wheel = this.carView.root.getObjectByName("steering_wheel");
    this.driver.root.children.length && this.driver.setCockpit(this.mode === "cockpit");
  }

  // swap the simple pedestrian figures for realistic ones (when the people files have loaded)
  setPedestrianMaker(make) { this.makePed = make; this.dressPedestrians(); }
  dressPedestrians() {
    if (!this.makePed || !this.dyn) return;
    for (const d of this.dyn.peds) {
      if (d.fig) continue;
      d.fig = this.makePed();
      d.g.children.forEach(c => { c.visible = false; });
      d.g.add(d.fig.root);
    }
  }

  setWorld(W, quality = "high") {
    if (this.worldGroup) {
      this.scene.remove(this.worldGroup);
      this.worldGroup.traverse(o => { if (o.geometry) o.geometry.dispose(); });
    }
    const { group, dyn } = buildWorldMeshes(W, quality);
    this.W = W; this.dyn = dyn; this.worldGroup = group;
    this.dressPedestrians();
    this.scene.add(group);
    this.renderer.shadowMap.enabled = quality !== "low";
    this.chasePos = null;
  }

  resize(w, h) {
    this.renderer.setSize(w, h, false);
    this.cam.aspect = w / h; this.cam.updateProjectionMatrix();
    Object.assign(this.hudCam, { left: 0, right: w, top: h, bottom: 0 }); this.hudCam.updateProjectionMatrix();
    this.w = w; this.h = h;
    // phones (short landscape screens): smaller mirrors so the controls stay clear
    const small = h < 520;
    const top = small ? h * 0.15 : Math.min(110, h * 0.14);
    const cw = small ? Math.min(w * 0.26, 260) : Math.min(w * 0.34, 400), ch = cw * 180 / 640;
    const sw = small ? Math.min(w * 0.12, 120) : Math.min(w * 0.17, 210), sh = sw * 220 / 320;
    const place = (m, x, y, mw, mh) => { m.quad.position.set(x, y, 0.1); m.quad.scale.set(mw, mh, 1); m.frame.position.set(x, y, 0); m.frame.scale.set(mw + 8, mh + 8, 1); };
    place(this.mirrors[0], w / 2, h - top - ch / 2, cw, ch);
    const my = small ? h * 0.42 : h * 0.47;      // overlay y runs from the bottom
    place(this.mirrors[1], 14 + sw / 2, my, sw, sh);
    place(this.mirrors[2], w - 14 - sw / 2, my, sw, sh);
  }

  setMode(mode) {
    this.mode = mode;
    this.carView.setCockpit(mode === "cockpit" || mode === "interiorRear");
    if (this.driver) this.driver.setCockpit(mode === "cockpit");
    this.cam.up.set(0, 1, 0);
    this.chasePos = null;
  }

  update(session, dt, now) {
    const car = session.car, root = this.carView.root;
    root.position.set(car.x, car.h, car.y);
    root.rotation.y = -car.th; root.rotation.z = car.pitch + (car.bodyPitch || 0); root.rotation.x = (car.groundRoll || 0) + (car.bodyRoll || 0);
    root.updateMatrixWorld(true);
    this.carView.update(car, now);
    if (this.driver) this.driver.update(dt, this.driver.wheel, car);
    this.cabinLight.visible = this.mode === "cockpit" || this.mode === "interiorRear";
    if (this.cabinLight.visible) this.cabinLight.position.copy(root.localToWorld(new THREE.Vector3(1.2, 1.12, 0)));
    updateWorldMeshes(this.W, this.dyn, session.clock, now);
    for (const d of this.dyn.peds) if (d.fig) {
      d.fig.update(dt, d.p.walking && d.p.visible);
      // the pavements are raised 0.14 m
      d.fig.root.position.y = this.W.pads.some(q => q.surface === "concrete" && inPoly(q.poly, [d.p.x, d.p.y])) ? 0.14 : 0;
    }

    const f = new THREE.Vector3(Math.cos(car.th), 0, Math.sin(car.th));
    const cp = new THREE.Vector3(car.x, car.h, car.y);
    const cam = this.cam;
    if (this.mode === "cockpit") {
      const [ex, ey, ez] = this.eye || [1.2, 1.22, -0.37];
      const eye = root.localToWorld(new THREE.Vector3(ex, ey, ez));
      const yaw = this.look + this.drag.yaw, pitch = this.drag.pitch - 0.045;
      const tgt = root.localToWorld(new THREE.Vector3(ex + 10 * Math.cos(yaw) * Math.cos(pitch), ey + 10 * Math.sin(pitch), ez + 10 * Math.sin(yaw) * Math.cos(pitch)));
      cam.position.copy(eye); cam.lookAt(tgt);
      if (cam.fov !== 68) { cam.fov = 68; cam.updateProjectionMatrix(); }
    } else if (this.mode === "chase") {
      const yaw = this.lookOverride ?? this.look * 1.6;
      const back = new THREE.Vector3(Math.cos(car.th + yaw), 0, Math.sin(car.th + yaw));
      const want = cp.clone().addScaledVector(back, -7.5).add(new THREE.Vector3(0, 3.1, 0));
      if (!this.chasePos) this.chasePos = want.clone();
      this.chasePos.lerp(want, 1 - Math.exp(-dt * 4));
      cam.position.copy(this.chasePos);
      cam.lookAt(cp.clone().addScaledVector(f, 2).add(new THREE.Vector3(0, 1, 0)));
      if (cam.fov !== 55) { cam.fov = 55; cam.updateProjectionMatrix(); }
    } else if (this.mode === "interiorRear") {
      // like a photo taken from the middle of the rear seat (used to compare with references)
      const eye = root.localToWorld(new THREE.Vector3(0.85, 1.24, 0.0));
      cam.position.copy(eye); cam.lookAt(root.localToWorld(new THREE.Vector3(3.0, 0.92, 0)));
      if (cam.fov !== 58) { cam.fov = 58; cam.updateProjectionMatrix(); }
    } else if (this.mode === "orbit") {
      const o = this.orbit, a = car.th + o.az;
      const c = cp.clone().addScaledVector(f, 1.25).add(new THREE.Vector3(0, 0.75, 0));
      cam.position.set(c.x + o.dist * Math.cos(o.el) * Math.cos(a), Math.max(0.25, c.y + o.dist * Math.sin(o.el)), c.z + o.dist * Math.cos(o.el) * Math.sin(a));
      cam.lookAt(c);
      if (cam.fov !== 45) { cam.fov = 45; cam.updateProjectionMatrix(); }
    } else {
      cam.up.set(0, 0, -1);
      cam.position.set(car.x, car.h + 34, car.y + 0.01);
      cam.lookAt(cp);
      if (cam.fov !== 50) { cam.fov = 50; cam.updateProjectionMatrix(); }
    }
    // shift the picture sideways (menu: car between the panels) without changing the view
    if (this.viewShift) cam.setViewOffset(this.w, this.h, -this.viewShift, 0, this.w, this.h); else if (cam.view) cam.clearViewOffset();
    this.sun.position.set(car.x + 45, 85, car.y + 30);
    this.sun.target.position.copy(cp);
  }

  render() {
    const r = this.renderer;
    const mirrors = this.mode === "cockpit";
    if (mirrors) {
      this.carView.setCockpit(false);
      for (const m of this.mirrors) { r.setRenderTarget(m.rt); r.render(this.scene, m.cam); }
      this.carView.setCockpit(true);
      r.setRenderTarget(null);
    }
    r.render(this.scene, this.cam);
    if (mirrors) {
      r.autoClear = false; r.clearDepth();
      r.render(this.hud, this.hudCam);
      r.autoClear = true;
    }
  }
}
