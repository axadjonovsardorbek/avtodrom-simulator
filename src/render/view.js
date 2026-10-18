// Three.js scene, lighting, cameras and rear-view mirrors.
import * as THREE from "three";
import { buildWorldMeshes, updateWorldMeshes } from "./worldMesh.js";
import { inPoly } from "../sim/geom.js";
import { Sky } from "three/examples/jsm/objects/Sky.js";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { ShaderPass } from "three/examples/jsm/postprocessing/ShaderPass.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";

// sun direction: late-morning sun from the south-east, ~38 degrees up
const SUN_DIR = new THREE.Vector3().setFromSphericalCoords(1, THREE.MathUtils.degToRad(52), THREE.MathUtils.degToRad(135));

// final look: slight warm grade, contrast, saturation and a soft vignette
const GradeShader = {
  uniforms: { tDiffuse: { value: null }, vignette: { value: 0.32 }, saturation: { value: 1.12 }, contrast: { value: 1.06 }, warm: { value: 0.025 } },
  vertexShader: "varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }",
  fragmentShader: `uniform sampler2D tDiffuse; uniform float vignette, saturation, contrast, warm; varying vec2 vUv;
    void main(){ vec4 c = texture2D(tDiffuse, vUv);
      float l = dot(c.rgb, vec3(0.2126, 0.7152, 0.0722));
      c.rgb = mix(vec3(l), c.rgb, saturation);
      c.rgb = (c.rgb - 0.5) * contrast + 0.5;
      c.rgb += vec3(warm, warm * 0.4, -warm);
      vec2 d = vUv - 0.5; c.rgb *= 1.0 - vignette * smoothstep(0.35, 0.85, length(d * vec2(1.25, 1.0)));
      gl_FragColor = c; }`
};
import { buildCar } from "./carModel.js";
const MIRRORS = [
  { key: "center", pos: [1.62, 1.33, 0], yaw: 0, fov: 34, w: 640, h: 180 },
  { key: "left", pos: [2.43, 1.08, -0.96], yaw: -0.22, fov: 38, w: 320, h: 220 },
  { key: "right", pos: [2.43, 1.08, 0.96], yaw: 0.22, fov: 38, w: 320, h: 220 }
];

// per quality tier: highest render scale, mirror texture scale, shadow map size, MSAA samples, bloom
const MAXRATIO = { low: 1, mid: 1.5, high: 2 };
const TIER = { low: { mirror: 0.5, shadow: 1024, aa: 0, bloom: false }, mid: { mirror: 0.65, shadow: 1024, aa: 4, bloom: false }, high: { mirror: 1, shadow: 2048, aa: 4, bloom: true } };

export class View {
  constructor(canvas) {
    const r = this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" });
    this.maxRatio = Math.min(window.devicePixelRatio || 1, 2);
    this.ratio = this.maxRatio; r.setPixelRatio(this.ratio);
    this.frame = 0; this.ft = 16;          // smoothed frame time, ms
    r.shadowMap.enabled = true;
    r.shadowMap.type = THREE.PCFSoftShadowMap;
    r.toneMapping = THREE.ACESFilmicToneMapping;
    r.toneMappingExposure = 0.72;            // the physical sky is bright; the lights below are raised to match
    r.outputColorSpace = THREE.SRGBColorSpace;
    r.localClippingEnabled = true;            // the driver figure is cut away near the camera

    const s = this.scene = new THREE.Scene();
    s.fog = new THREE.Fog(0xb7cbe0, 180, 600);
    // physical sky (atmospheric scattering) with the sun; it also lights the reflections
    const sky = this.sky = new Sky(); sky.scale.setScalar(650);
    const su = sky.material.uniforms;
    su.turbidity.value = 2.2; su.rayleigh.value = 0.9; su.mieCoefficient.value = 0.003; su.mieDirectionalG.value = 0.85;
    su.sunPosition.value.copy(SUN_DIR);
    s.add(sky);
    s.add(new THREE.HemisphereLight(0xdfeaff, 0x5a6a3e, 1.3));
    const pm = new THREE.PMREMGenerator(r);
    const envScene = new THREE.Scene(), sky2 = new Sky(); sky2.scale.setScalar(50);
    for (const k of ["turbidity", "rayleigh", "mieCoefficient", "mieDirectionalG"]) sky2.material.uniforms[k].value = su[k].value;
    sky2.material.uniforms.sunPosition.value.copy(SUN_DIR); envScene.add(sky2);
    const eg = new THREE.Mesh(new THREE.CircleGeometry(40, 32), new THREE.MeshBasicMaterial({ color: 0x3a4a2c })); eg.rotation.x = -Math.PI / 2; eg.position.y = -2; envScene.add(eg);
    s.environment = pm.fromScene(envScene, 0.02).texture;
    s.environmentIntensity = 0.75;
    const sun = this.sun = new THREE.DirectionalLight(0xfff1dc, 3.6);
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
      const cam = new THREE.PerspectiveCamera(m.fov, m.w / m.h, 0.1, 700);
      cam.position.set(...m.pos);
      cam.rotation.order = "YXZ";             // pitch about the camera's own axis
      this.carView.root.add(cam);
      const rt = new THREE.WebGLRenderTarget(m.w, m.h);
      rt.texture.colorSpace = THREE.SRGBColorSpace;
      rt.texture.repeat.set(-1, 1); rt.texture.offset.set(1, 0);
      const frame = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ color: 0x111214 }));
      const quad = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: rt.texture }));
      quad.position.z = 0.1;
      this.hud.add(frame, quad);
      return { ...m, cam, rt, frame, quad, adj: { yaw: 0, pitch: 0 } };
    });
    try { const a = JSON.parse(localStorage.getItem("avtodrom.mirrors") || "{}"); for (const m of this.mirrors) if (a[m.key]) Object.assign(m.adj, a[m.key]); } catch (_) {}
    for (const m of this.mirrors) this.aimMirror(m);

    this.mode = "cockpit";
    this.look = 0;
    this.orbit = { az: 2.5, el: 0.22, dist: 7.5 };   // 360-degree view around the car
    this.drag = { yaw: 0, pitch: 0 };                 // mouse/touch look from the driver's seat
    this.chasePos = null;
    this.worldGroup = null;
  }

  // Finish the look of a loaded car: sharp textures at oblique angles, softer normal maps (leather
  // and plastics looked wavy), glossy clear-coated paint and chrome that mirror the sky.
  polishCar(root) {
    const env = this.scene.environment, maxA = this.renderer.capabilities.getMaxAnisotropy();
    const seen = new Set();
    root.traverse(o => {
      if (!o.isMesh) return;
      for (const m of [].concat(o.material)) {
        if (!m || seen.has(m)) continue; seen.add(m);
        for (const k of ["map", "normalMap", "roughnessMap", "metalnessMap", "aoMap", "emissiveMap"]) if (m[k]) m[k].anisotropy = maxA;
        if (m.normalMap && m.normalScale) m.normalScale.set(0.55, 0.55);
        if (!m.isMeshStandardMaterial) continue;
        const name = m.name || "";
        if (/paint/i.test(name) && !/black/i.test(name)) { Object.assign(m, { clearcoat: 1, clearcoatRoughness: 0.05 }); m.envMap = env; m.envMapIntensity = 0.95; }
        else if (m.metalness > 0.6) { m.envMap = env; m.envMapIntensity = 1.1; }
        else if (/glass/i.test(name) || m.transparent) { m.envMap = env; m.envMapIntensity = 1.2; }
        m.needsUpdate = true;
      }
    });
  }

  // Swap in another car model (e.g. one loaded from a .glb); mirrors move with it.
  setCarModel(cv, car) {
    this.polishCar(cv.root);
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

  // translucent 1 m zones before the stop lines; green when the car stands inside one
  buildStopZones(W) {
    this.zones = [];
    for (const z of W.stopZones || []) {
      const { pose, s, l0, l1 } = z, c = Math.cos(pose.th), n = Math.sin(pose.th);
      const P = (ss, l) => new THREE.Vector3(pose.x + c * ss - n * l, 0, pose.y + n * ss + c * l);
      const pts = [P(s - 1, l0), P(s - 0.4, l0), P(s - 0.4, l1), P(s - 1, l1)];
      const g = new THREE.BufferGeometry().setFromPoints(pts.map(p => p.setY(W.heightAt(p.x, p.z) + 0.024)));
      g.setIndex([0, 1, 2, 0, 2, 3, 0, 2, 1, 0, 3, 2]);
      const mat = new THREE.MeshBasicMaterial({ color: 0x3ddc84, transparent: true, opacity: 0.28, depthWrite: false });
      const m = new THREE.Mesh(g, mat); m.renderOrder = 2;
      // "1 m" marks at the sides
      this.worldGroup.add(m);
      this.zones.push({ z, m, mat });
    }
    this.setZonesVisible(this.zonesOn !== false);
  }
  setZonesVisible(on) { this.zonesOn = on; for (const z of this.zones || []) z.m.visible = on; if (this.guideGroup) this.guideGroup.visible = on; }

  // training aid: the ideal path as a dashed ribbon, the final car position as an outline
  buildGuides(W) {
    const g = this.guideGroup = new THREE.Group();
    const mat = (c, o) => new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: o, depthWrite: false, side: THREE.DoubleSide });
    const dashM = mat(0x4fb3ff, 0.8), ghostM = mat(0x3ddc84, 0.7);
    const ribbon = (pts, w, m, dash, closed) => {
      const P = pts.map(([x, y]) => new THREE.Vector3(x, W.heightAt(x, y) + 0.03, y)), pos = [], idx = [];
      const n = closed ? P.length : P.length - 1;
      let run = 0;
      for (let i = 0; i < n; i++) {
        const a = P[i], b = P[(i + 1) % P.length], len = a.distanceTo(b);
        if (!len) continue;
        const keep = !dash || Math.floor(run / dash) % 2 === 0; run += len;
        if (!keep) continue;
        const d = b.clone().sub(a).normalize(), nx = new THREE.Vector3(-d.z, 0, d.x).multiplyScalar(w / 2), k = pos.length / 3;
        for (const v of [a.clone().sub(nx), a.clone().add(nx), b.clone().add(nx), b.clone().sub(nx)]) pos.push(v.x, v.y, v.z);
        idx.push(k, k + 1, k + 2, k, k + 2, k + 3);
      }
      if (!pos.length) return;
      const geo = new THREE.BufferGeometry(); geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3)); geo.setIndex(idx);
      const m2 = new THREE.Mesh(geo, m); m2.renderOrder = 3; g.add(m2);
    };
    const dense = pts => { const out = []; for (let i = 0; i < pts.length - 1; i++) { const [a, b] = [pts[i], pts[i + 1]], n = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / 0.25)); for (let j = 0; j < n; j++) out.push([a[0] + (b[0] - a[0]) * j / n, a[1] + (b[1] - a[1]) * j / n]); } out.push(pts[pts.length - 1]); return out; };
    for (const gd of W.guides || []) {
      ribbon(dense(gd.line), 0.22, dashM, 0.6, false);
      if (gd.ghost) ribbon(dense([...gd.ghost, gd.ghost[0]]), 0.1, ghostM, 0, false);
    }
    this.worldGroup.add(g);
    g.visible = this.zonesOn !== false;
  }

  setWorld(W, quality = "high") {
    if (this.worldGroup) {
      this.scene.remove(this.worldGroup);
      this.worldGroup.traverse(o => { if (o.geometry) o.geometry.dispose(); });
    }
    const { group, dyn } = buildWorldMeshes(W, quality);
    this.W = W; this.dyn = dyn; this.worldGroup = group;
    this.dressPedestrians();
    this.buildStopZones(W);
    this.buildGuides(W);
    this.scene.add(group);
    this.renderer.shadowMap.enabled = quality !== "low";
    this.quality = quality;
    // lighter mirrors and shadows on the light setting
    const T = TIER[quality] || TIER.high;
    for (const m of this.mirrors) m.rt.setSize(Math.round(m.w * T.mirror), Math.round(m.h * T.mirror));
    this.sun.shadow.mapSize.set(T.shadow, T.shadow);
    if (this.sun.shadow.map) { this.sun.shadow.map.dispose(); this.sun.shadow.map = null; }
    this.ratio = this.maxRatio = Math.min(window.devicePixelRatio || 1, MAXRATIO[quality] || 1.75);
    this.renderer.setPixelRatio(this.ratio); if (this.w) this.renderer.setSize(this.w, this.h, false);
    if (this.postQ !== quality) { if (this.composer) this.composer.dispose(); this.composer = null; this.postQ = quality; }
    this.setupPost(quality);
    this.chasePos = null;
  }

  resize(w, h) {
    this.renderer.setSize(w, h, false);
    if (this.composer) { this.composer.setPixelRatio(this.ratio); this.composer.setSize(w, h); }
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

  // mirrors: look backwards, side mirrors angled outwards, plus the driver's own adjustment
  aimMirror(m) { m.cam.rotation.set(m.adj.pitch, Math.PI / 2 + m.yaw + m.adj.yaw, 0); }
  // the mirror under a screen point (cockpit view only); the overlay's y axis runs from the bottom
  mirrorAt(x, y) {
    if (this.mode !== "cockpit") return null;
    return this.mirrors.find(m => Math.abs(x - m.quad.position.x) < m.quad.scale.x / 2 && Math.abs(this.h - y - m.quad.position.y) < m.quad.scale.y / 2) || null;
  }
  adjustMirror(m, dx, dy) {
    const clamp = v => Math.min(0.4, Math.max(-0.4, v));
    m.adj.yaw = clamp(m.adj.yaw - dx * 0.003); m.adj.pitch = clamp(m.adj.pitch + dy * 0.003);
    this.aimMirror(m);
  }
  resetMirror(m) { m.adj.yaw = m.adj.pitch = 0; this.aimMirror(m); this.saveMirrors(); }
  saveMirrors() {
    try { localStorage.setItem("avtodrom.mirrors", JSON.stringify(Object.fromEntries(this.mirrors.map(m => [m.key, m.adj])))); } catch (_) {}
  }

  // red pins where penalties happened (replay)
  setReplayMarkers(marks = []) {
    if (this.replayGroup) { this.scene.remove(this.replayGroup); this.replayGroup.traverse(o => { if (o.geometry) o.geometry.dispose(); }); this.replayGroup = null; }
    if (!marks.length) return;
    const g = this.replayGroup = new THREE.Group(), red = new THREE.MeshBasicMaterial({ color: 0xff3b30 });
    for (const m of marks) {
      const pin = new THREE.Group(); pin.position.set(m.x, m.h, m.y);
      const cone = new THREE.Mesh(new THREE.ConeGeometry(0.35, 1.1, 10), red); cone.rotation.x = Math.PI; cone.position.y = 1.1;
      const ball = new THREE.Mesh(new THREE.SphereGeometry(0.4, 12, 8), red); ball.position.y = 1.9;
      const ring = new THREE.Mesh(new THREE.RingGeometry(0.9, 1.15, 28), new THREE.MeshBasicMaterial({ color: 0xff3b30, transparent: true, opacity: 0.55, side: THREE.DoubleSide })); ring.rotation.x = -Math.PI / 2; ring.position.y = 0.06;
      pin.add(cone, ball, ring); g.add(pin);
    }
    this.scene.add(g);
  }

  startBoarding() { if (this.mode === "cockpit") { this.boarding = { t: 0, dur: 3.2 }; this.carView.setCockpit(false); if (this.driver) this.driver.root.visible = false; } }
  skipBoarding() { if (this.boarding) { this.boarding = null; this.carView.setCockpit(this.mode === "cockpit"); if (this.driver) this.driver.root.visible = true; } }

  setMode(mode) {
    this.mode = mode; if (this.boarding) this.skipBoarding();
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
    if (this.zones && this.zonesOn) {
      const [fx, fy] = car.frontPoint();
      for (const { z, mat } of this.zones) {
        const dx = fx - z.pose.x, dy = fy - z.pose.y, c = Math.cos(z.pose.th), n = Math.sin(z.pose.th);
        const s = dx * c + dy * n, l = -dx * n + dy * c, d = z.s - s;
        const near = l > z.l0 - 1 && l < z.l1 + 1 && d > -0.5 && d < 6;
        const ok = near && d >= 0 && d <= 1, stopped = ok && car.v === 0;
        mat.color.setHex(ok ? 0x3ddc84 : near ? 0xf2b632 : 0x3ddc84);
        mat.opacity = stopped ? 0.6 + 0.15 * Math.sin(now / 150) : ok ? 0.5 : near ? 0.32 : 0.22;
      }
    }
    for (const d of this.dyn.peds) if (d.fig) {
      // walks only while actually moving (he stops on the far pavement)
      const moving = d.lastL !== undefined && Math.abs(d.p.l - d.lastL) > 1e-4; d.lastL = d.p.l;
      d.fig.update(dt, moving && d.p.visible);
      // the pavements are raised 0.14 m
      d.fig.root.position.y = this.W.pads.some(q => q.surface === "concrete" && inPoly(q.poly, [d.p.x, d.p.y])) ? 0.14 : 0;
    }

    const f = new THREE.Vector3(Math.cos(car.th), 0, Math.sin(car.th));
    const cp = new THREE.Vector3(car.x, car.h, car.y);
    const cam = this.cam;
    // head motion: the body lags behind acceleration and braking, leans into turns, and the
    // road surface gives a faint shake that grows with speed
    const accel = dt > 0 ? (car.v - (this.lastV ?? car.v)) / dt : 0; this.lastV = car.v;
    const lat = car.v * car.v / 2.8 * Math.tan(car.steer || 0);
    const k = Math.min(1, dt * 5);
    this.head = this.head || { x: 0, z: 0 };
    this.head.x += (THREE.MathUtils.clamp(-accel * 0.012, -0.07, 0.05) - this.head.x) * k;
    this.head.z += (THREE.MathUtils.clamp(lat * 0.006, -0.05, 0.05) - this.head.z) * k;
    const shake = Math.min(1, Math.abs(car.v) / 12) * 0.0035, tt = now / 1000;
    if (this.boarding && this.mode !== "cockpit") this.boarding = null;
    if (this.boarding) {
      // getting in: walk up to the driver's door, duck in and sit down
      const b = this.boarding; b.t += dt;
      const u = Math.min(1, b.t / b.dur), e = u * u * (3 - 2 * u), [ex, ey, ez] = this.eye || [1.2, 1.22, -0.37];
      const P = (x, y, z) => root.localToWorld(new THREE.Vector3(x, y, z));
      const S = P(ex - 0.6, 1.62, ez - 2.1), C = P(ex - 0.1, 1.5, ez - 0.75), E = P(ex, ey, ez);
      cam.position.copy(S.multiplyScalar((1 - e) * (1 - e)).addScaledVector(C, 2 * (1 - e) * e).addScaledVector(E, e * e));
      const look0 = P(ex + 0.1, 0.95, ez - 0.2), look1 = P(ex + 10, ey - 0.45, ez);
      cam.lookAt(look0.lerp(look1, Math.pow(e, 1.4)));
      if (cam.fov !== 68) { cam.fov = 68; cam.updateProjectionMatrix(); }
      // the outside of the car shows until the head is through the door
      this.carView.setCockpit(u > 0.62); if (this.driver) this.driver.root.visible = u > 0.62;
      if (!b.thudded && u > 0.8) { b.thudded = true; if (this.onDoor) this.onDoor(); }
      if (u >= 1) { this.boarding = null; this.carView.setCockpit(true); if (this.driver) this.driver.root.visible = true; }
    } else if (this.mode === "cockpit") {
      const [ex0, ey0, ez0] = this.eye || [1.2, 1.22, -0.37];
      const ex = ex0 + this.head.x, ey = ey0 + Math.sin(tt * 31) * shake + Math.sin(tt * 17.3) * shake * 0.6, ez = ez0 + this.head.z;
      const eye = root.localToWorld(new THREE.Vector3(ex, ey, ez));
      const yaw = this.look + this.drag.yaw, pitch = this.drag.pitch - 0.045 + this.head.x * 0.25;
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
      // a wider view as the speed rises
      const fov = 55 + Math.min(8, Math.abs(car.v) * 0.45);
      if (Math.abs(cam.fov - fov) > 0.05) { cam.fov += (fov - cam.fov) * Math.min(1, dt * 3); cam.updateProjectionMatrix(); }
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
    // depth precision: the near plane decides it. Inside the cabin things are close, outside
    // a near plane of 5 cm wastes the depth buffer and close layers of the body (paint over
    // its inner shell) flicker through each other on 24-bit GPUs ("scratches" on the bumper)
    const near = this.mode === "cockpit" || this.mode === "interiorRear" ? 0.05 : 0.3;
    if (cam.near !== near) { cam.near = near; cam.far = 700; cam.updateProjectionMatrix(); }
    // shift the picture sideways (menu: car between the panels) without changing the view
    if (this.viewShift) cam.setViewOffset(this.w, this.h, -this.viewShift, 0, this.w, this.h); else if (cam.view) cam.clearViewOffset();
    this.sun.position.set(car.x + SUN_DIR.x * 110, SUN_DIR.y * 110, car.y + SUN_DIR.z * 110);
    this.sky.position.copy(cam.position);
    this.sun.target.position.copy(cp);
  }

  // Keeps the frame rate up on any device: the render resolution follows the measured frame time
  // (down quickly when frames are slow, back up slowly when there is headroom).
  adapt(dtMs) {
    this.ft += (Math.min(dtMs, 100) - this.ft) * 0.05;
    this.adaptT = (this.adaptT || 0) + dtMs;
    if (this.adaptT < 700) return;
    this.adaptT = 0;
    const lo = this.quality === "low" ? 0.55 : this.quality === "mid" ? 0.6 : 0.9, hi = this.quality === "low" ? Math.min(1, this.maxRatio) : this.maxRatio;
    let r = this.ratio;
    if (this.ft > (this.quality === "high" ? 26 : 21)) r = Math.max(lo, r - 0.15);   // under ~48 fps (~38 on high: sharpness first)
    else if (this.ft < 14.5) r = Math.min(hi, r + 0.05);   // over ~68 fps
    if (Math.abs(r - this.ratio) > 1e-3) { this.ratio = r; this.renderer.setPixelRatio(r); this.renderer.setSize(this.w, this.h, false); if (this.composer) { this.composer.setPixelRatio(r); this.composer.setSize(this.w, this.h); } }
  }

  // a composer with the same bloom and grade for another scene (the garage)
  composerFor(scene, cam) {
    if (this.quality === "low") return null;
    const T = TIER[this.quality] || TIER.high, size = this.renderer.getDrawingBufferSize(new THREE.Vector2());
    const c = new EffectComposer(this.renderer, new THREE.WebGLRenderTarget(size.x || 2, size.y || 2, { type: THREE.HalfFloatType, samples: T.aa }));
    c.addPass(new RenderPass(scene, cam));
    if (T.bloom) c.addPass(new UnrealBloomPass(new THREE.Vector2(256, 256), 0.3, 0.5, 1.8));
    c.addPass(new OutputPass()); c.addPass(new ShaderPass(GradeShader));
    c.setPixelRatio(this.ratio); c.setSize(this.w, this.h);
    return c;
  }

  // bloom (lamps, sun glints) and the colour grade; off on the light setting
  // MSAA on the composer's target (the renderer's own antialias does not reach it); bloom on high only
  setupPost(quality) {
    const T = TIER[quality] || TIER.high;
    if (quality === "low") { this.composer = null; return; }
    if (this.composer) return;
    const size = this.renderer.getDrawingBufferSize(new THREE.Vector2());
    const target = new THREE.WebGLRenderTarget(size.x || 2, size.y || 2, { type: THREE.HalfFloatType, samples: T.aa });
    const c = this.composer = new EffectComposer(this.renderer, target);
    c.addPass(new RenderPass(this.scene, this.cam));
    if (T.bloom) {
      this.bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.22, 0.5, 1.5);   // only really bright things glow
      c.addPass(this.bloom);
    }
    c.addPass(new OutputPass());               // tone mapping + sRGB
    c.addPass(new ShaderPass(GradeShader));    // the grade works on the final (display) colours
    c.setPixelRatio(this.ratio); if (this.w) c.setSize(this.w, this.h);
  }

  render() {
    const r = this.renderer;
    this.frame++;
    // the sun's shadow map is redrawn every other frame (the car moves little in 1/30 s)
    r.shadowMap.autoUpdate = false;
    if (r.shadowMap.enabled && this.frame % 2 === 0) r.shadowMap.needsUpdate = true;
    const mirrors = this.mode === "cockpit";
    if (mirrors) {
      // one mirror per frame, in turn: each still updates 20 times a second at 60 fps
      const m = this.mirrors[this.frame % this.mirrors.length];
      this.carView.setCockpit(false);
      r.setRenderTarget(m.rt); r.render(this.scene, m.cam);
      this.carView.setCockpit(true);
      r.setRenderTarget(null);
    }
    if (this.composer) this.composer.render(); else r.render(this.scene, this.cam);
    if (mirrors) {
      r.autoClear = false; r.clearDepth();
      r.render(this.hud, this.hudCam);
      r.autoClear = true;
    }
  }
}
