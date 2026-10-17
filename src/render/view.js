// Three.js scene, lighting, cameras and rear-view mirrors.
import * as THREE from "three";
import { buildWorldMeshes, updateWorldMeshes } from "./worldMesh.js";
import { buildCar } from "./carModel.js";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";

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

    const s = this.scene = new THREE.Scene();
    s.background = new THREE.Color(0xa9c6e2);
    s.fog = new THREE.Fog(0xbfd2e4, 140, 460);
    s.add(new THREE.HemisphereLight(0xe4f0ff, 0x56663a, 1.1));
    // soft studio reflections for the car paint and glass
    const pm = new THREE.PMREMGenerator(r);
    s.environment = pm.fromScene(new RoomEnvironment(), 0.04).texture;
    s.environmentIntensity = 0.35;
    const sun = this.sun = new THREE.DirectionalLight(0xfff0d8, 2.4);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    Object.assign(sun.shadow.camera, { left: -40, right: 40, top: 40, bottom: -40, near: 1, far: 260 });
    sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.03;
    s.add(sun, sun.target);

    this.cam = new THREE.PerspectiveCamera(60, 1, 0.05, 900);
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
    this.chasePos = null;
    this.worldGroup = null;
  }

  setWorld(W, quality = "high") {
    if (this.worldGroup) {
      this.scene.remove(this.worldGroup);
      this.worldGroup.traverse(o => { if (o.geometry) o.geometry.dispose(); });
    }
    const { group, dyn } = buildWorldMeshes(W, quality);
    this.W = W; this.dyn = dyn; this.worldGroup = group;
    this.scene.add(group);
    this.renderer.shadowMap.enabled = quality !== "low";
    this.chasePos = null;
  }

  resize(w, h) {
    this.renderer.setSize(w, h, false);
    this.cam.aspect = w / h; this.cam.updateProjectionMatrix();
    Object.assign(this.hudCam, { left: 0, right: w, top: h, bottom: 0 }); this.hudCam.updateProjectionMatrix();
    this.w = w; this.h = h;
    const top = Math.min(110, h * 0.14);
    const cw = Math.min(w * 0.34, 400), ch = cw * 180 / 640;
    const sw = Math.min(w * 0.17, 210), sh = sw * 220 / 320;
    const place = (m, x, y, mw, mh) => { m.quad.position.set(x, y, 0.1); m.quad.scale.set(mw, mh, 1); m.frame.position.set(x, y, 0); m.frame.scale.set(mw + 8, mh + 8, 1); };
    place(this.mirrors[0], w / 2, h - top - ch / 2, cw, ch);
    place(this.mirrors[1], 14 + sw / 2, h * 0.47, sw, sh);
    place(this.mirrors[2], w - 14 - sw / 2, h * 0.47, sw, sh);
  }

  setMode(mode) {
    this.mode = mode;
    this.carView.setCockpit(mode === "cockpit");
    this.cam.up.set(0, 1, 0);
    this.chasePos = null;
  }

  update(session, dt, now) {
    const car = session.car, root = this.carView.root;
    root.position.set(car.x, car.h, car.y);
    root.rotation.y = -car.th; root.rotation.z = car.pitch;
    root.updateMatrixWorld(true);
    this.carView.update(car, now);
    updateWorldMeshes(this.W, this.dyn, session.clock, now);

    const f = new THREE.Vector3(Math.cos(car.th), 0, Math.sin(car.th));
    const cp = new THREE.Vector3(car.x, car.h, car.y);
    const cam = this.cam;
    if (this.mode === "cockpit") {
      const eye = root.localToWorld(new THREE.Vector3(1.2, 1.22, -0.37));
      const yaw = this.look;
      const tgt = root.localToWorld(new THREE.Vector3(1.2 + 10 * Math.cos(yaw), 0.75, -0.37 + 10 * Math.sin(yaw)));
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
    } else {
      cam.up.set(0, 0, -1);
      cam.position.set(car.x, car.h + 34, car.y + 0.01);
      cam.lookAt(cp);
      if (cam.fov !== 50) { cam.fov = 50; cam.updateProjectionMatrix(); }
    }
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
