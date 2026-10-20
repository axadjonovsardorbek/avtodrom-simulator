// Three.js scene, lighting, cameras and rear-view mirrors.
import * as THREE from "three";
import { buildWorldMeshes, updateWorldMeshes, fillTrains } from "./worldMesh.js";
import { inPoly } from "../sim/geom.js";
import { Sky } from "three/examples/jsm/objects/Sky.js";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { SMAAPass } from "three/examples/jsm/postprocessing/SMAAPass.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";
import { atmosphereFor, Rain } from "./atmosphere.js";

// sun direction: late-morning sun from the south-east, ~38 degrees up
const SUN_DIR = new THREE.Vector3().setFromSphericalCoords(1, THREE.MathUtils.degToRad(52), THREE.MathUtils.degToRad(135));

// final look: slight warm grade, contrast, saturation and a soft vignette
const GRADE = { vignette: 0.32, saturation: 1.12, contrast: 1.06, warm: 0.025 };
// tone mapping, sRGB and the grade in one full-screen pass (they were two), with a faint fixed dither
// against banding in the sky's gradient
function gradedOutput() {
  const p = new OutputPass(), f = p.material.fragmentShader, end = f.lastIndexOf("}");
  for (const [k, v] of Object.entries(GRADE)) p.uniforms[k] = { value: v };
  p.material.fragmentShader = f.slice(0, end).replace("precision highp float;", "precision highp float;\n\t\tuniform float vignette, saturation, contrast, warm;") + `
      vec4 c = gl_FragColor;
      float l = dot(c.rgb, vec3(0.2126, 0.7152, 0.0722));
      c.rgb = mix(vec3(l), c.rgb, saturation);
      c.rgb = (c.rgb - 0.5) * contrast + 0.5;
      c.rgb += vec3(warm, warm * 0.4, -warm);
      vec2 d = vUv - 0.5; c.rgb *= 1.0 - vignette * smoothstep(0.35, 0.85, length(d * vec2(1.25, 1.0)));
      c.rgb += (fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453) - 0.5) / 255.0;
      gl_FragColor = c;
    }`;
  return p;
}
// Phones draw straight to the screen (no full-screen passes: on a phone the render target in half
// floats with 4x MSAA and the pass that copies it out cost more than the pixels themselves); the
// same tone mapping and grade then happen in every material's own shader, as a custom tone mapping.
// The grade works on display colours, as in the pass; only the vignette is left out.
THREE.ShaderChunk.tonemapping_pars_fragment = THREE.ShaderChunk.tonemapping_pars_fragment.replace(
  "vec3 CustomToneMapping( vec3 color ) { return color; }", `vec3 CustomToneMapping( vec3 color ) {
	vec3 c = pow( clamp( ACESFilmicToneMapping( color ), 0.0, 1.0 ), vec3( 1.0 / 2.2 ) );
	float l = dot( c, vec3( 0.2126, 0.7152, 0.0722 ) );
	c = mix( vec3( l ), c, ${GRADE.saturation.toFixed(3)} );
	c = ( c - 0.5 ) * ${GRADE.contrast.toFixed(3)} + 0.5;
	c += vec3( ${GRADE.warm.toFixed(4)}, ${(GRADE.warm * 0.4).toFixed(4)}, ${(-GRADE.warm).toFixed(4)} );
	return pow( clamp( c, 0.0, 1.0 ), vec3( 2.2 ) );
}`);
const COARSE = matchMedia("(pointer: coarse)").matches;
// straight to the screen: phones below "high", and the light setting everywhere
const direct = quality => quality === "low" || (COARSE && quality !== "high");
import { buildCar } from "./carModel.js";
const MIRRORS = [
  { key: "center", pos: [1.62, 1.33, 0], yaw: 0, fov: 34, w: 640, h: 180 },
  { key: "left", pos: [2.43, 1.08, -0.96], yaw: -0.22, fov: 38, w: 320, h: 220 },
  { key: "right", pos: [2.43, 1.08, 0.96], yaw: 0.22, fov: 38, w: 320, h: 220 }
];

// per quality tier: highest render scale, mirror texture scale, shadow map size, MSAA samples, bloom
// phones: with no full-screen passes there is room for more pixels, and small text and the far road
// lines stay sharp (the frame-time watch below still lowers it on a device that cannot keep up)
const MAXRATIO = COARSE ? { low: 1.5, mid: 1.75, high: 2 } : { low: 1.25, mid: 1.75, high: 1.75 };
const TIER = { low: { mirror: 0.5, shadow: 1024, aa: 0, bloom: false }, mid: { mirror: 0.65, shadow: 1024, aa: 4, bloom: false }, high: { mirror: 1, shadow: 2048, aa: 4, bloom: true } };

export class View {
  constructor(canvas) {
    const r = this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" });
    this.maxRatio = Math.min(window.devicePixelRatio || 1, 1.75);
    this.ratio = this.maxRatio; r.setPixelRatio(this.ratio);
    this.frame = 0; this.ft = 16;          // smoothed frame time, ms
    r.shadowMap.enabled = true;
    r.shadowMap.type = THREE.PCFSoftShadowMap;
    r.toneMapping = THREE.ACESFilmicToneMapping;
    r.toneMappingExposure = 0.72;            // the physical sky is bright; the lights below are raised to match
    r.outputColorSpace = THREE.SRGBColorSpace;
    r.localClippingEnabled = true;            // the driver figure is cut away near the camera
    // reading back each shader's log waits for it to finish compiling: off in the built game, so the
    // browser can compile in parallel (compileAsync) instead of stalling the frame
    r.debug.checkShaderErrors = !!import.meta.env.DEV;

    const s = this.scene = new THREE.Scene();
    s.fog = new THREE.Fog(0xb7cbe0, 180, 600);
    // physical sky (atmospheric scattering) with the sun; it also lights the reflections
    const sky = this.sky = new Sky(); sky.scale.setScalar(650);
    const su = sky.material.uniforms;
    su.turbidity.value = 2.2; su.rayleigh.value = 0.9; su.mieCoefficient.value = 0.003; su.mieDirectionalG.value = 0.85;
    su.sunPosition.value.copy(SUN_DIR);
    s.add(sky);
    s.add(this.hemi = new THREE.HemisphereLight(0xdfeaff, 0x5a6a3e, 1.3));
    const pm = this.pmrem = new THREE.PMREMGenerator(r);
    const envScene = this.envScene = new THREE.Scene(), sky2 = this.sky2 = new Sky(); sky2.scale.setScalar(50);
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
    sun.shadow.camera.layers.enable(1);        // the shadow-only stand-ins (worldMesh.js) live on layer 1
    s.add(sun, sun.target);
    this.sunDir = SUN_DIR.clone();

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
      const cam = new THREE.PerspectiveCamera(m.fov, m.w / m.h, m.key === "center" ? 0.1 : 0.5, 700);   // the wing-mirror cameras start behind their own housing: its shell is cut away by the near plane
      cam.position.set(...m.pos);
      cam.rotation.order = "YXZ";             // pitch about the camera's own axis
      this.carView.root.add(cam);
      // the mirror's picture is kept as light (linear, beyond white) and tone-mapped when it is shown, like the
      // main view: dusk and rain look as dark in the mirrors as through the windscreen
      const rt = new THREE.WebGLRenderTarget(m.w, m.h, { type: THREE.HalfFloatType });
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
    this.findMirrorHousings();
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
  setInstructorVisible(on) { this.instructorWanted = on; if (this.instructor) this.instructor.visible = on; }

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
    if (!this.dyn) return;
    // the people round the ground: how many are shown depends on the quality (each is a skinned figure)
    let n = 0; const most = this.quality === "high" ? 8 : this.quality === "mid" ? 4 : 0;
    for (const d of this.dyn.peds) if (d.p.ambient) d.p.visible = n++ < most;
    if (!this.makePed) return;
    let i = 0;
    for (const d of this.dyn.peds) {
      i++;
      if (d.fig || !d.p.visible) continue;
      d.fig = this.makePed(i, d.p);
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
      const pts = [P(s - 1.4, l0), P(s - 0.4, l0), P(s - 0.4, l1), P(s - 1.4, l1)];
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
    this.W = W; this.dyn = dyn; this.worldGroup = group; this.applyTrafficMode(); if (this.trainTpl) fillTrains(dyn, this.trainTpl);
    this.quality = quality; this.dressPedestrians();
    this.buildStopZones(W);
    this.buildGuides(W);
    this.scene.add(group);
    this.renderer.shadowMap.enabled = quality !== "low";
    // soft shadow edges take 4x the shadow lookups: phones below "high" keep the plain filtered ones
    this.renderer.shadowMap.type = COARSE && quality !== "high" ? THREE.PCFShadowMap : THREE.PCFSoftShadowMap;
    this.quality = quality;
    // lighter mirrors and shadows on the light setting
    const T = TIER[quality] || TIER.high;
    for (const m of this.mirrors) m.rt.setSize(Math.round(m.w * T.mirror), Math.round(m.h * T.mirror));
    this.sun.shadow.mapSize.set(T.shadow, T.shadow);
    if (this.sun.shadow.map) { this.sun.shadow.map.dispose(); this.sun.shadow.map = null; }
    this.ratio = this.maxRatio = Math.min(window.devicePixelRatio || 1, MAXRATIO[quality] || 1.75); this.tooSlow = 0;
    this.renderer.setPixelRatio(this.ratio); if (this.w) this.renderer.setSize(this.w, this.h, false);
    if (this.postQ !== quality) { if (this.composer) this.composer.dispose(); this.composer = null; this.postQ = quality; }
    this.setupPost(quality);
    this.chasePos = null;
    this.applyWorldAtmosphere();
  }

  // Weather and time of day (src/render/atmosphere.js): sky, sun, fog, reflections, rain, lamps, headlights
  setAtmosphere(weather, time) {
    const a = this.atmos = atmosphereFor(weather, time), s = this.scene;
    for (const u of [this.sky.material.uniforms, this.sky2.material.uniforms]) {
      for (const [k, v] of Object.entries(a.sky)) u[k].value = v;
      u.sunPosition.value.copy(a.sunDir);
    }
    this.sunDir.copy(a.sunDir); this._sunBasis = null;
    this.sun.color.setHex(a.sunColor); this.sun.intensity = a.sun;
    this.hemi.color.setHex(a.hemiSky); this.hemi.groundColor.setHex(a.hemiGround); this.hemi.intensity = a.hemi;
    s.fog.color.setHex(a.fog[0]); s.fog.near = a.fog[1]; s.fog.far = a.fog[2];
    s.background = a.background !== null ? new THREE.Color(a.background) : null;
    this.envScene.background = s.background; this.sky.visible = this.sky2.visible = !s.background;
    // the reflections are taken from the new sky; materials that were given the old one get the new one
    const old = s.environment, env = this.pmrem.fromScene(this.envScene, 0.02).texture;
    s.environment = env; s.environmentIntensity = a.env;
    s.traverse(o => { if (o.material) for (const m of [].concat(o.material)) if (m.envMap === old) m.envMap = env; });
    if (old) old.dispose();
    if (a.rain && !this.rain) { this.rain = new Rain(); s.add(this.rain.mesh); }
    if (this.rain) this.rain.mesh.visible = a.rain;
    if (a.lights && !this.heads) {
      // dipped beams: two spot lights from the front of the car onto the road ahead
      this.heads = [0, 1].map(() => { const l = new THREE.SpotLight(0xfff4e0, 60, 45, 0.42, 0.55, 1.6); s.add(l, l.target); return l; });
    }
    if (this.heads) this.heads.forEach(h => { h.visible = a.lights; });
    this.applyWorldAtmosphere();
  }
  // the world's own materials: roads darker and glossy when wet, street lamps lit in the evening
  applyWorldAtmosphere() {
    const a = this.atmos;
    if (!a || !this.worldGroup) return;
    const seen = new Set();
    this.worldGroup.traverse(o => {
      if (!o.material) return;
      for (const m of [].concat(o.material)) {
        if (seen.has(m)) continue; seen.add(m);
        const u = m.userData;
        if (u.road) {
          if (!u.base) u.base = { r: m.roughness, c: m.color.clone() };
          m.roughness = u.base.r + (0.28 - u.base.r) * a.wet;
          m.color.copy(u.base.c).multiplyScalar(1 - 0.32 * a.wet);
        }
        if (u.lamp) m.emissiveIntensity = a.lights ? 4 : 0.35;
      }
    });
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
    this.mSize = { sw, sh, place };
  }

  // the wing-mirror pictures sit where the car's own mirrors are on the screen (so there is one mirror, not two)
  seatSideMirrors() {
    const S = this.mSize; if (!S || !this.w) return;
    this.cam.updateMatrixWorld(true);
    for (const m of this.mirrors.slice(1)) {
      (this._mp = this._mp || new THREE.Vector3()).copy(m.cam.position); this._mp.y -= 0.07; this.carView.root.localToWorld(this._mp);
      const q = this._mp.clone().project(this.cam);
      if (q.z > 1) continue;                                           // behind the head: leave it where it was
      const x = THREE.MathUtils.clamp((q.x * 0.5 + 0.5) * this.w, S.sw / 2 + 6, this.w - S.sw / 2 - 6);
      const y = THREE.MathUtils.clamp((q.y * 0.5 + 0.5) * this.h, S.sh / 2 + 6, this.h - S.sh / 2 - 6);
      S.place(m, x, y, S.sw, S.sh);
    }
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

  // other cars at the junction: "real" cars use these light models, anything else the plain boxes
  setTrainModel(tpl) { this.trainTpl = tpl; if (this.dyn) fillTrains(this.dyn, tpl); }
  setTrafficModels(map) { this.trafficReal = map; this.applyTrafficMode(); }
  setTrafficMode(mode) { this.trafficMode = mode; this.applyTrafficMode(); }
  applyTrafficMode() { if (this.dyn && this.dyn.traffic) { this.dyn.traffic.real = this.trafficMode === "real" ? this.trafficReal : null; this.dyn.traffic.wantReal = this.trafficMode === "real"; } }

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

  startBoarding() {
    if (this.mode !== "cockpit") return;
    this.boarding = { t: 0, dur: 9 }; this.carView.setCockpit(false); if (this.driver) this.driver.root.visible = false;
    if (this.walker && !this.walker.root.parent) this.carView.root.add(this.walker.root);
    if (this.walker && this.walker.root.parent !== this.carView.root) this.carView.root.add(this.walker.root);
    if (this.driverWalker && this.driverWalker.root.parent !== this.carView.root) this.carView.root.add(this.driverWalker.root);
  }
  setWalker(w) { this.walker = w; }
  setDriverWalker(w) { this.driverWalker = w; }
  // true when there is something to show (a car with real doors, in the cabin view)
  canExit() { return this.mode === "cockpit" && !!this.carView.hasDoors; }
  startExit(done) {
    this.exiting = { t: 0, dur: 5.2, done };
    if (this.walker && this.walker.root.parent !== this.carView.root) this.carView.root.add(this.walker.root);
  }
  cancelExit() { if (this.exiting) { this.exiting.done = null; this.finishExit(); } }
  finishExit() {
    const x = this.exiting; this.exiting = null;
    if (this.carView.setDoor) { this.carView.setDoor("lf", 0); this.carView.setDoor("rf", 0); }
    if (this.walker) this.walker.root.visible = false;
    if (this.instructor) this.instructor.visible = !!this.instructorWanted;
    this.carView.setCockpit(this.mode === "cockpit"); if (this.driver) this.driver.root.visible = true;
    if (x && x.done) x.done();
  }
  bump(strength) { this.kick = Math.max(this.kick || 0, 0.4 + strength * 1.4); }
  skipBoarding() {
    if (this.boarding) {
      this.boarding = null; if (this.carView.setDoor) { this.carView.setDoor("lf", 0); this.carView.setDoor("rf", 0); }
      if (this.walker) this.walker.root.visible = false;
      if (this.driverWalker) this.driverWalker.root.visible = false;
      if (this.instructor) this.instructor.visible = !!this.instructorWanted; this.carView.setCockpit(this.mode === "cockpit"); if (this.driver) this.driver.root.visible = true; } }

  setMode(mode) {
    this.mode = mode; if (this.boarding) this.skipBoarding();
    this.carView.setCockpit(mode === "cockpit" || mode === "interiorRear");
    if (this.driver) this.driver.setCockpit(mode === "cockpit");
    this.cam.up.set(0, 1, 0);
    this.chasePos = null;
  }

  update(session, dt, now) {
    const car = session.car, root = this.carView.root;
    // the car stands on the ground (pitch and roll of the road), and the body rocks on its springs about a
    // point between the axles at about hip height, not about the rear axle (the nose and the tail both move)
    root.position.set(car.x, car.h, car.y);
    root.rotation.y = -car.th; root.rotation.z = car.pitch; root.rotation.x = car.groundRoll || 0;
    root.updateMatrixWorld(true);
    const piv = (this._piv = this._piv || new THREE.Vector3()).set((car.spec ? car.spec.wb : 2.7) / 2, 0.5, 0), pw = root.localToWorld(piv.clone());
    const ground = (this._mg = this._mg || new THREE.Matrix4()).copy(root.matrixWorld);
    root.rotation.z += car.bodyPitch || 0; root.rotation.x += car.bodyRoll || 0;
    root.updateMatrixWorld(true);
    root.position.add(pw.sub(root.localToWorld(piv)));
    root.updateMatrixWorld(true);
    this.keepWheelsDown(ground);
    car.lightsOn = !!(this.atmos && this.atmos.lights);      // headlamps lit in the evening, rain and fog
    this.carView.update(car, now);
    this.levelWheels();
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
        const ok = near && d >= 0 && d <= 1.4, stopped = ok && car.v === 0;
        mat.color.setHex(ok ? 0x3ddc84 : near ? 0xf2b632 : 0x3ddc84);
        mat.opacity = stopped ? 0.6 + 0.15 * Math.sin(now / 150) : ok ? 0.5 : near ? 0.32 : 0.22;
      }
    }
    for (const d of this.dyn.peds) if (d.fig) {
      // walks only while actually moving (he stops on the far pavement)
      const moving = d.lastL !== undefined && Math.abs(d.p.l - d.lastL) > 1e-4; d.lastL = d.p.l;
      d.fig.update(dt, moving && d.p.visible);
      // the pavements are raised 0.14 m
      d.fig.root.position.y = this.W.pads.some(q => q.surface === "concrete" && inPoly(q.poly, [d.p.x, d.p.y])) ? 0.14 : d.p.ground || 0;
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
    if (this.exiting && this.mode !== "cockpit") this.finishExit();
    if (this.exiting) {
      // getting out: the driver's door opens and the camera steps out of the car; the instructor leaves by his door and walks away
      const x = this.exiting; x.t += dt;
      const u = Math.min(1, x.t / x.dur), [ex, ey, ez] = this.eye || [1.2, 1.22, -0.37];
      const smooth = q => { q = Math.max(0, Math.min(1, q)); return q * q * (3 - 2 * q); };
      const P = (a, b, c) => root.localToWorld(new THREE.Vector3(a, b, c));
      const S = P(ex - 0.6, 1.62, ez - 2.1), C = P(ex - 0.1, 1.5, ez - 0.75), E = P(ex, ey, ez);
      const seatX = (this.seat || [1.5, 0.46, 0.36])[0], w = this.instructorWanted ? this.walker : null;
      if (u < 0.4) {
        const e = smooth(u / 0.4);
        cam.position.copy(E.clone().multiplyScalar((1 - e) * (1 - e)).addScaledVector(C, 2 * (1 - e) * e).addScaledVector(S, e * e));
        cam.lookAt(P(ex + 10 * (1 - e) + 0.1 * e, ey - 0.45 * (1 - e) + 0.95 * e, ez * (1 - e) + (ez - 0.2) * e));
      } else {
        const k = smooth((u - 0.4) / 0.5), A0 = P(seatX + 3.6, 1.55, 6.4);
        cam.position.copy(S.clone().lerp(A0, k));
        cam.lookAt(P(seatX + 0.1 * (1 - k), 0.95, (ez - 0.2) + (2.3 - (ez - 0.2)) * k));
      }
      if (cam.fov !== 68) { cam.fov = 68; cam.updateProjectionMatrix(); }
      const outside = u > 0.12;
      this.carView.setCockpit(!outside); if (this.driver) this.driver.root.visible = !outside;
      const dk = u < 0.12 ? u / 0.12 : u < 0.8 ? 1 : Math.max(0, (0.92 - u) / 0.12);
      const pk = u < 0.3 ? 0 : u < 0.38 ? (u - 0.3) / 0.08 : u < 0.62 ? 1 : Math.max(0, (0.7 - u) / 0.08);
      if (this.carView.setDoor) { this.carView.setDoor("lf", dk); this.carView.setDoor("rf", pk); }
      if (w) {
        const out = u >= 0.36;
        if (this.instructor) this.instructor.visible = !out && !!this.instructorWanted;
        w.root.visible = out;
        if (out) { const wk = smooth((u - 0.36) / 0.55); w.root.position.set(seatX + 0.05, 0, 1.15 + (5.6 - 1.15) * wk); w.root.rotation.y = -Math.PI / 2; w.update(dt, true); }
      }
      if (!x.thud && u > 0.9) { x.thud = true; if (this.onDoor) this.onDoor(); }
      if (u >= 1) this.finishExit();
    } else if (this.boarding && this.mode !== "cockpit") this.boarding = null;
    if (this.exiting) { /* the camera is placed above */ } else if (this.boarding) {
      // getting in. The camera watches from the front-right while the instructor walks to the passenger door and gets in
      // (it is shut); then it crosses to the front-left where the learner walks up to the driver's door; then it follows
      // him in: the door opens and the camera ducks in and settles on the driver's eyes
      const b = this.boarding; b.t += dt;
      const u = Math.min(1, b.t / b.dur), [ex, ey, ez] = this.eye || [1.2, 1.22, -0.37];
      const smooth = x => { x = Math.max(0, Math.min(1, x)); return x * x * (3 - 2 * x); };
      const P = (x, y, z) => root.localToWorld(new THREE.Vector3(x, y, z));
      const C = P(ex - 0.1, 1.5, ez - 0.75), E = P(ex, ey, ez);
      const seatX = (this.seat || [1.5, 0.46, 0.36])[0];
      const w = this.instructorWanted && this.carView.hasDoors ? this.walker : null;       // he only walks in where there is a door to open
      const dw = this.carView.hasDoors ? this.driverWalker : null;
      for (const x of [this.walker, this.driverWalker]) if (x && x.root.parent !== root) root.add(x.root);       // the car model can arrive after the start
      const A0 = P(seatX + 3.8, 1.55, 4.6), A1 = P(seatX + 3.8, 1.55, -4.6);      // close in: the start lane runs beside the fence
      const L0 = P(seatX + 0.2, 0.95, 2.3), L1 = P(seatX + 0.2, 0.95, -2.3);
      if (u < 0.3) { cam.position.copy(A0); cam.lookAt(L0); }
      else if (u < 0.55) { const k = smooth((u - 0.3) / 0.25); cam.position.copy(A0.clone().lerp(A1, k)); cam.lookAt(L0.clone().lerp(L1, k)); }
      else {
        const e = smooth((u - 0.55) / 0.45);
        cam.position.copy(A1.clone().multiplyScalar((1 - e) * (1 - e)).addScaledVector(C, 2 * (1 - e) * e).addScaledVector(E, e * e));
        const look0 = P(ex + 0.1, 0.95, ez - 0.2), look1 = P(ex + 10, ey - 0.45, ez);
        cam.lookAt(L1.clone().lerp(look0, smooth(e * 3)).lerp(look1, Math.pow(e, 1.4)));
      }
      if (cam.fov !== 68) { cam.fov = 68; cam.updateProjectionMatrix(); }
      // the instructor: a walker until he reaches the door, then he is in his seat
      if (w) {
        const arrived = u >= 0.32;
        w.root.visible = !arrived;
        w.root.position.set(seatX + 0.05, 0, 4.4 + (1.15 - 4.4) * smooth(u / 0.3)); w.root.rotation.y = Math.PI / 2;
        if (!arrived) w.update(dt, true);
      }
      if (this.instructor) this.instructor.visible = !w || u >= 0.32 ? !!this.instructorWanted : false;
      // the learner walks up to the driver's door on the left, stops, and the door opens for him
      if (dw) {
        const here = u >= 0.3 && u < 0.6, walking = u < 0.54;
        dw.root.visible = here;
        dw.root.position.set(ex + 0.1, 0, -4.4 + 3.25 * smooth((u - 0.3) / 0.24)); dw.root.rotation.y = -Math.PI / 2;
        if (here) dw.update(dt, walking);
      }
      // doors: the passenger door opens as he comes up and is pushed shut; the driver's opens for the learner
      const pk = u < 0.2 ? 0 : u < 0.27 ? (u - 0.2) / 0.07 : u < 0.42 ? 1 : Math.max(0, (0.48 - u) / 0.06);
      const dk = u < 0.52 ? 0 : u < 0.6 ? (u - 0.52) / 0.08 : u < 0.88 ? 1 : Math.max(0, (0.97 - u) / 0.09);
      if (this.carView.setDoor) { this.carView.setDoor("rf", pk); this.carView.setDoor("lf", dk); }
      if (!b.thud1 && u > 0.56) { b.thud1 = true; if (this.onDoor) this.onDoor(); }
      if (!b.thudded && u > 0.96) { b.thudded = true; if (this.onDoor) this.onDoor(); }
      // the outside of the car shows until the head is through the door
      const inside = u > 0.8;
      this.carView.setCockpit(inside); if (this.driver) this.driver.root.visible = inside;
      if (u >= 1) this.skipBoarding();
    } else if (this.mode === "cockpit") {
      const [ex0, ey0, ez0] = this.eye || [1.2, 1.22, -0.37];
      const ex = ex0 + this.head.x, ey = ey0 + Math.sin(tt * 31) * shake + Math.sin(tt * 17.3) * shake * 0.6, ez = ez0 + this.head.z;
      const eye = root.localToWorld(new THREE.Vector3(ex, ey, ez));
      const yaw = this.look + this.drag.yaw, pitch = this.drag.pitch - 0.085 + this.head.x * 0.25;     // a little downwards: the road close to the bonnet stays in view
      const tgt = root.localToWorld(new THREE.Vector3(ex + 10 * Math.cos(yaw) * Math.cos(pitch), ey + 10 * Math.sin(pitch), ez + 10 * Math.sin(yaw) * Math.cos(pitch)));
      cam.position.copy(eye); cam.lookAt(tgt);
      this.seatSideMirrors();
      if (cam.fov !== 74) { cam.fov = 74; cam.updateProjectionMatrix(); }
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
    // a bump shakes the picture for a moment
    if (this.kick > 0.002) {
      const k = this.kick;
      cam.position.x += (Math.random() - 0.5) * k * 0.12; cam.position.y += (Math.random() - 0.5) * k * 0.12; cam.position.z += (Math.random() - 0.5) * k * 0.12;
      cam.rotateZ((Math.random() - 0.5) * k * 0.08); this.kick *= Math.exp(-dt * 5);
    }
    // depth precision: the near plane decides it. Inside the cabin things are close, outside
    // a near plane of 5 cm wastes the depth buffer and close layers of the body (paint over
    // its inner shell) flicker through each other on 24-bit GPUs ("scratches" on the bumper)
    const near = this.mode === "cockpit" || this.mode === "interiorRear" ? 0.05 : 0.3;
    if (cam.near !== near) { cam.near = near; cam.far = 700; cam.updateProjectionMatrix(); }
    // shift the picture sideways (menu: car between the panels) without changing the view
    if (this.viewShift) cam.setViewOffset(this.w, this.h, -this.viewShift, 0, this.w, this.h); else if (cam.view) cam.clearViewOffset();
    // the sun's shadow box follows the car in whole shadow-map texels: moved by fractions of a texel, every
    // shadow edge in the ground would crawl and shimmer as the car drives
    const sb = this._sunBasis || (this._sunBasis = (() => {
      const z = this.sunDir.clone().normalize(), x = new THREE.Vector3(0, 1, 0).cross(z).normalize();
      return { x, y: z.clone().cross(x), z };
    })());
    const texel = (this.sun.shadow.camera.right - this.sun.shadow.camera.left) / this.sun.shadow.mapSize.x;
    const snap = v => Math.round(v / texel) * texel;
    const a = snap(cp.dot(sb.x)), b = snap(cp.dot(sb.y)), c = cp.dot(sb.z);
    const tp = this.sun.target.position.copy(sb.x).multiplyScalar(a).addScaledVector(sb.y, b).addScaledVector(sb.z, c);
    this.sun.position.copy(tp).addScaledVector(this.sunDir, 110);
    if (this.rain && this.rain.mesh.visible) this.rain.update(dt, cam.position, [car.x, car.y, car.h]);
    if (this.heads && this.heads[0].visible) {
      const fx = (car.spec ? car.spec.wb + car.spec.fOh : 3.5) - 0.3, P = (x, y, z, v) => v.set(x, y, z).applyMatrix4(root.matrixWorld);
      this.heads.forEach((h, i) => { const sd = i ? 0.6 : -0.6; P(fx, 0.68, sd, h.position); P(fx + 16, -0.6, sd * 2.2, h.target.position); h.target.updateMatrixWorld(); });
    }
    this.sky.position.copy(cam.position);
  }

  // The wheels go back to where the body's rocking on its springs moved them from, and stand as
  // the road does, not as the body leans: tilted with the body in a turn, they looked like wheels
  // with a broken camber. keepWheelsDown places them and resets their turn to the rest one
  // (the car then sets steering and spin); levelWheels then takes the body's lean off them.
  keepWheelsDown(ground) {
    const cv = this.carView, root = cv.root;
    if (!cv.wheels || !cv.wheels.length) return;
    if (!cv.wheelRest) {
      // each wheel's place and its parent's frame in the car's own frame (fixed: they are parts of the car)
      const inv = root.matrixWorld.clone().invert();
      cv.wheelRest = cv.wheels.map(w => {
        const inParent = inv.clone().multiply(w.parent.matrixWorld);
        return { w, pos: w.position.clone(), rot: w.rotation.clone(), inParent, toParent: inParent.clone().invert(), level: new THREE.Quaternion() };
      });
    }
    const d = (this._md = this._md || new THREE.Matrix4()).copy(root.matrixWorld).invert().multiply(ground), q = this._wq || (this._wq = new THREE.Vector3());
    const m = this._wm || (this._wm = new THREE.Matrix4());
    for (const r of cv.wheelRest) {
      r.w.position.copy(q.copy(r.pos).applyMatrix4(r.inParent).applyMatrix4(d).applyMatrix4(r.toParent));
      r.w.rotation.copy(r.rot);
      // the same correction as a turn in the wheel's parent frame (the body's lean, undone)
      r.level.setFromRotationMatrix(m.copy(r.toParent).multiply(d).multiply(r.inParent));
    }
  }
  levelWheels() {
    const cv = this.carView;
    if (!cv.wheelRest) return;
    for (const r of cv.wheelRest) { r.w.quaternion.premultiply(r.level); r.w.updateMatrixWorld(true); }
  }

  // Keeps the frame rate up on any device: the render resolution follows the measured frame time
  // (down quickly when frames are slow, back up slowly when there is headroom).
  // Each change reallocates the render targets and shows as a blink, so it changes rarely: down after
  // 1.4 s of slow frames, up only after 4 s of fast ones (no pumping between two sizes).
  // `capMs`: the frame time the frame-rate setting holds the game to (30 FPS is not a slow device).
  adapt(dtMs, capMs = 0) {
    this.ft += (Math.min(dtMs, 100) - this.ft) * 0.05;
    this.adaptT = (this.adaptT || 0) + dtMs;
    if (this.adaptT < 700) return;
    this.adaptT = 0;
    const lo = this.quality === "low" ? 0.55 : this.quality === "mid" ? 0.6 : 0.9, hi = this.quality === "low" ? Math.min(1, this.maxRatio) : this.maxRatio;
    let r = this.ratio;
    const base = Math.max(1000 / 60, capMs);
    const slow = this.ft > base + (this.quality === "high" ? 9.3 : 4.3), fast = this.ft < base - 2.2 && this.ratio < hi;   // under ~48 fps (~38 on high: sharpness first) / over ~68 fps
    this.slowN = slow ? (this.slowN || 0) + 1 : 0; this.fastN = fast ? (this.fastN || 0) + 1 : 0;
    // a size found too slow is not tried again (until the quality setting changes)
    if (this.slowN >= 2) { this.tooSlow = r; r = Math.max(lo, r - 0.15); this.slowN = 0; }
    else if (this.fastN >= 6 && r + 0.05 < (this.tooSlow || Infinity) - 1e-3) { r = Math.min(hi, r + 0.05); this.fastN = 0; }
    if (Math.abs(r - this.ratio) > 1e-3) { this.ratio = r; this.renderer.setPixelRatio(r); this.renderer.setSize(this.w, this.h, false); if (this.composer) { this.composer.setPixelRatio(r); this.composer.setSize(this.w, this.h); } }
  }

  // a composer with the same bloom and grade for another scene (the garage)
  composerFor(scene, cam) {
    if (direct(this.quality)) return null;
    const T = TIER[this.quality] || TIER.high, size = this.renderer.getDrawingBufferSize(new THREE.Vector2());
    const c = new EffectComposer(this.renderer, new THREE.WebGLRenderTarget(size.x || 2, size.y || 2, { type: THREE.HalfFloatType, samples: T.aa }));
    c.addPass(new RenderPass(scene, cam));
    if (T.bloom) c.addPass(new UnrealBloomPass(new THREE.Vector2(256, 256), 0.3, 0.5, 1.8));
    c.addPass(gradedOutput()); if (!T.aa) c.addPass(new SMAAPass(1, 1));
    c.setPixelRatio(this.ratio); c.setSize(this.w, this.h);
    return c;
  }

  // bloom (lamps, sun glints) and the colour grade; off on the light setting
  // MSAA on the composer's target (the renderer's own antialias does not reach it); bloom on high only
  setupPost(quality) {
    const T = TIER[quality] || TIER.high;
    this.renderer.toneMapping = direct(quality) ? THREE.CustomToneMapping : THREE.ACESFilmicToneMapping;
    if (direct(quality)) { this.composer = null; this.bloom = null; return; }
    if (this.composer) return;
    const size = this.renderer.getDrawingBufferSize(new THREE.Vector2());
    const target = new THREE.WebGLRenderTarget(size.x || 2, size.y || 2, { type: THREE.HalfFloatType, samples: T.aa });
    const c = this.composer = new EffectComposer(this.renderer, target);
    c.addPass(new RenderPass(this.scene, this.cam));
    if (T.bloom) {
      this.bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.22, 0.5, 1.5);   // only really bright things glow
      c.addPass(this.bloom);
    }
    c.addPass(gradedOutput());                 // tone mapping + sRGB, then the grade on the final (display) colours
    if (!T.aa) c.addPass(new SMAAPass(1, 1));   // edge smoothing only without MSAA (both together cost three more passes for nothing)
    c.setPixelRatio(this.ratio); if (this.w) c.setSize(this.w, this.h);
  }

  // the small meshes around each wing-mirror camera (housing, glass, stalk): hidden while that mirror is drawn,
  // so the picture shows the road behind and not the car's own mirror a second time
  findMirrorHousings() {
    const root = this.carView.root; root.updateMatrixWorld(true);
    const inv = root.matrixWorld.clone().invert(), box = new THREE.Box3(), c = new THREE.Vector3(), sz = new THREE.Vector3();
    for (const m of this.mirrors) {
      m.housing = [];
      if (m.key === "center") continue;
      root.traverse(o => {
        if (!o.isMesh || !o.geometry) return;
        box.setFromObject(o).applyMatrix4(inv); box.getCenter(c); box.getSize(sz);
        if (sz.length() < 0.55 && c.distanceTo(m.cam.position) < 0.32) m.housing.push(o);
      });
    }
  }

  render() {
    const r = this.renderer;
    this.frame++;
    // the sun's shadow map is redrawn once every frame (drawn every other frame, the car's own shadow jumped
    // behind the moving car and the shadows flickered); not on its own, which would redraw it for the mirror too
    r.shadowMap.autoUpdate = false;
    if (r.shadowMap.enabled) r.shadowMap.needsUpdate = true;
    const mirrors = this.mode === "cockpit" && !this.boarding && !this.exiting;
    if (mirrors) {
      // which mirrors are redrawn this frame: on high the inside one every frame and the wing mirrors in turn,
      // on mid one of the three in turn, on low one every other frame
      const f = this.frame, M = this.mirrors;
      // a device that falls behind (frames over ~22 ms) gets the next lighter schedule
      const q = this.ft > 22 ? (this.quality === "high" ? "mid" : "low") : this.quality;
      const now = q === "high" ? [M[0], M[1 + f % 2]] : q === "mid" ? [M[f % 3]] : f % 2 ? [] : [M[(f >> 1) % 3]];
      if (now.length) this.carView.setCockpit(false);
      for (const m of now) {
        const hid = (m.housing || []).filter(o => o.visible); hid.forEach(o => { o.visible = false; });
        r.setRenderTarget(m.rt); r.render(this.scene, m.cam);
        hid.forEach(o => { o.visible = true; });
      }
      if (now.length) { this.carView.setCockpit(true); r.setRenderTarget(null); }
    }
    if (this.composer) this.composer.render(); else r.render(this.scene, this.cam);
    if (mirrors) {
      r.autoClear = false; r.clearDepth();
      r.render(this.hud, this.hudCam);
      r.autoClear = true;
    }
  }
}
