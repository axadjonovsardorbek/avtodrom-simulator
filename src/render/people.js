// Realistic people from Mixamo (public/models/people/*.glb, see tools/prepare-people.mjs):
// the instructor in the passenger seat, the learner at the wheel and the singing boy.
// Each one keeps the interface of its hand-built stand-in, so they can be swapped in
// once the files have loaded. Frame of every person: x forward, y up, z right.
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/examples/jsm/libs/meshopt_decoder.module.js";
import { clone as cloneSkinned } from "three/examples/jsm/utils/SkeletonUtils.js";

const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
const load = name => loader.loadAsync(`models/people/${name}.glb`);
const bone = (root, re) => { let b = null; root.traverse(o => { if (!b && o.isBone && re.test(o.name)) b = o; }); return b; };
const V = () => new THREE.Vector3(), Q = () => new THREE.Quaternion(), Z = new THREE.Vector3(0, 0, 1);

/* ---------- materials: matte, and recoloured to match the reference photos ---------- */
// Tint keeps the texture's light and shade but replaces its colour. `bands` paints horizontal
// stripes (model space, bind pose); `sleeves` gives the parts beyond |x| > sleeves.x their own tint.
let styleId = 0;
function restyle(mat, { tint, bands, sleeves, gain = 2.1 } = {}) {
  const m = new THREE.MeshStandardMaterial({ map: mat.map, normalMap: mat.normalMap, alphaMap: mat.alphaMap, transparent: mat.transparent, alphaTest: mat.alphaTest || (mat.transparent ? 0.4 : 0), side: mat.side, roughness: 0.82, metalness: 0, name: mat.name });
  if (!tint && !bands && !sleeves) return m;
  // own shader program per style: three only runs onBeforeCompile (which sets the uniforms) when it builds one
  const key = "people-" + (++styleId);
  m.customProgramCacheKey = () => key;
  m.onBeforeCompile = sh => {
    sh.uniforms.uTint = { value: new THREE.Color(tint || 0xffffff) };
    sh.uniforms.uBands = { value: (bands || [0xffffff, 0xffffff, 0xffffff]).map(c => new THREE.Color(c)) };
    sh.uniforms.uBandH = { value: bands ? bands.h : 0 };
    sh.uniforms.uSleeve = { value: new THREE.Color(sleeves ? sleeves.tint : 0xffffff) };
    sh.uniforms.uSleeveX = { value: sleeves ? sleeves.x : 1e9 };
    sh.uniforms.uOpenX = { value: sleeves ? sleeves.open : -1 };
    sh.uniforms.uGain = { value: gain };
    sh.vertexShader = sh.vertexShader.replace("#include <common>", "#include <common>\nvarying vec3 vObj;").replace("#include <begin_vertex>", "#include <begin_vertex>\nvObj = position;");
    sh.fragmentShader = sh.fragmentShader.replace("#include <common>", `#include <common>
varying vec3 vObj; uniform vec3 uTint; uniform vec3 uBands[3]; uniform float uBandH; uniform vec3 uSleeve; uniform float uSleeveX; uniform float uOpenX; uniform float uGain;`)
      .replace("#include <map_fragment>", `#include <map_fragment>
{
  float lum = dot(diffuseColor.rgb, vec3(0.299, 0.587, 0.114));
  vec3 col = uTint;
  if (uBandH > 0.0) { int i = int(mod(floor(vObj.y / uBandH), 3.0)); col = i == 0 ? uBands[0] : i == 1 ? uBands[1] : uBands[2]; }
  if (abs(vObj.x) > uSleeveX || abs(vObj.x) < uOpenX) {
    // the checked shirt: sleeves, and the open front of the vest
    float c = step(0.5, fract(vObj.x * 22.0)) + step(0.5, fract(vObj.y * 22.0));
    col = uSleeve * (0.85 + 0.25 * mod(c, 2.0));
  }
  diffuseColor.rgb = col * clamp(lum * uGain, 0.35, 1.25);
}`);
  };
  return m;
}
function dress(root, styles) {
  root.traverse(o => {
    if (!o.isMesh) return;
    o.castShadow = false; o.frustumCulled = false;   // the car's shadow proxy covers the people inside            // skinned meshes move away from their bounds
    const key = Object.keys(styles).find(k => new RegExp(k, "i").test(o.name));
    const st = key ? styles[key] : {};
    if (st === null) { o.visible = false; return; }
    const g = o.geometry; g.computeBoundingBox();
    const w = g.boundingBox.max.x - g.boundingBox.min.x;
    const s = st.sleeves ? { ...st.sleeves, x: st.sleeves.k * w, open: (st.sleeves.open || 0) * w } : undefined;
    const b = st.bands ? Object.assign([...st.bands], { h: st.bandK * (g.boundingBox.max.y - g.boundingBox.min.y) }) : undefined;
    o.material = Array.isArray(o.material) ? o.material.map(m => restyle(m, { ...st, sleeves: s, bands: b })) : restyle(o.material, { ...st, sleeves: s, bands: b });
  });
}

// set a bone's world rotation (keeps its parent)
function setWorldQuat(b, qw) {
  const pq = b.parent.getWorldQuaternion(Q());
  b.quaternion.copy(pq.invert().multiply(qw));
  b.updateMatrixWorld(true);
}
// turn bone b so that the point `from` (world) moves towards `to` (world)
function aim(b, from, to) {
  const p = b.getWorldPosition(V());
  const d0 = from.clone().sub(p).normalize(), d1 = to.clone().sub(p).normalize();
  const q = Q().setFromUnitVectors(d0, d1).multiply(b.getWorldQuaternion(Q()));
  setWorldQuat(b, q);
}

// Wrap a Mixamo person: inner group turned to face +x, scaled so hips->head is `torso` m,
// and moved so the hips (seated) or the feet (standing) are at the origin.
function rigPerson(gltf, { torso, seated }) {
  const scene = cloneSkinned(gltf.scene);
  const root = new THREE.Group(), inner = new THREE.Group();
  inner.rotation.y = Math.PI / 2; inner.add(scene); root.add(inner);
  const mixer = new THREE.AnimationMixer(scene);
  const actions = Object.fromEntries(gltf.animations.map(c => [c.name, mixer.clipAction(c)]));
  const first = Object.values(actions)[0]; first.play(); mixer.update(0.01);
  root.updateMatrixWorld(true);
  const hips = bone(scene, /Hips$/), head = bone(scene, /Head$/);
  const s = torso / hips.getWorldPosition(V()).distanceTo(head.getWorldPosition(V()));
  inner.scale.setScalar(s); root.updateMatrixWorld(true);
  if (seated) inner.position.sub(hips.getWorldPosition(V()));
  else { const b = new THREE.Box3().setFromObject(scene); inner.position.y -= b.min.y; }
  root.updateMatrixWorld(true);
  // seated people: feet that reach through the cabin floor are cut off there
  const floor = new THREE.Plane();
  let mats = null;                                 // collected on first use: dress() swaps the materials
  const clipFloor = (extra = []) => {
    if (!mats) { mats = []; scene.traverse(o => { if (o.isMesh) mats.push(...[].concat(o.material)); }); }
    const host = root.parent;
    const planes = seated && host ? [floor, ...extra] : extra;
    if (seated && host) floor.setFromNormalAndCoplanarPoint(V().set(0, 1, 0).transformDirection(host.matrixWorld), host.localToWorld(V().set(0, root.position.y - 0.2, 0)));
    // a different number of planes needs the shader rebuilt
    for (const m of mats) if ((m.clippingPlanes ? m.clippingPlanes.length : 0) !== planes.length) { m.clippingPlanes = planes.length ? planes : null; m.needsUpdate = true; }
    else if (planes.length) m.clippingPlanes = planes;
  };
  return { root, scene, mixer, actions, hips, head, clipFloor, bones: re => bone(scene, re) };
}

/* ---------- instructor: elderly man, green flat cap, beige vest over a blue checked shirt ---------- */
export function realInstructor(gltf) {
  const P = rigPerson(gltf, { torso: 0.6, seated: true });
  dress(P.scene, {
    Hat: { tint: 0x4f5f43 }, Jacket: { tint: 0xc4b69c, sleeves: { k: 0.36, open: 0.09, tint: 0x4f78bf } },
    Pants: { tint: 0x4a4b4f }, Shoes: { tint: 0x3a2c22 }
  });
  const A = P.actions, all = Object.values(A);
  all.forEach(a => { a.play(); a.setEffectiveWeight(0); });
  A.talk.setEffectiveWeight(1);
  let cur = "talk", yaw = 0;
  const door = new THREE.Plane(), roof = new THREE.Plane();
  const neck = P.bones(/Neck$/);
  return {
    root: P.root,
    update(dt, { talking, gesture, angry }) {
      // angry gestures and waving his hands, cheering when the learner did well, otherwise talking slowly
      const want = gesture === "thumb" ? "cheer" : angry || gesture === "angry" || gesture === "brace" ? "angry" : "talk";
      if (want !== cur) { A[want].reset().setEffectiveWeight(1).fadeIn(0.35); A[cur].fadeOut(0.35); cur = want; }
      A.talk.timeScale = talking ? 1 : 0.35;
      P.mixer.update(dt);
      // the waving arms stay inside the cabin: cut at the passenger door glass and the roof lining
      const host = P.root.parent;
      if (host) {
        const n = (x, y, z) => V().set(x, y, z).transformDirection(host.matrixWorld);
        door.setFromNormalAndCoplanarPoint(n(0, 0, -1), host.localToWorld(V().set(0, 0, P.root.position.z + 0.23)));   // the glass leans in towards the roof
        roof.setFromNormalAndCoplanarPoint(n(0, -1, 0), host.localToWorld(V().set(0, P.root.position.y + 0.89, 0)));
      }
      P.clipFloor([door, roof]);
      // look at the driver while speaking
      yaw += ((talking || gesture ? -0.6 : 0) - yaw) * Math.min(1, dt * 5);
      if (neck) { neck.updateMatrixWorld(true); setWorldQuat(neck, Q().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw).multiply(neck.getWorldQuaternion(Q()))); }
    }
  };
}

/* ---------- learner: young man at the wheel; arms follow the steering wheel ---------- */
export function realDriver(gltf) {
  const P = rigPerson(gltf, { torso: 0.6, seated: true });
  dress(P.scene, { Tops: { tint: 0x26334f }, Bottoms: { tint: 0x2b3446 } });
  const arm = side => ({ up: P.bones(new RegExp(side + "Arm$")), fore: P.bones(new RegExp(side + "ForeArm$")), hand: P.bones(new RegExp(side + "Hand$")) });
  const arms = { L: arm("Left"), R: arm("Right") };
  let cockpit = false, grip = null, hold = {};
  const clip = new THREE.Plane();
  const self = {
    root: P.root, wheel: null,
    reset() { grip = null; hold = {}; },
    setCockpit(on) { cockpit = on; },
    update(dt, wheel, car) {
      P.mixer.update(dt);
      P.root.updateMatrixWorld(true);
      if (wheel) {
        wheel.updateMatrixWorld(true);
        const carRoot = P.root.parent;
        // grips at a quarter to three, taken while the wheel is straight
        if (!grip && Math.abs(car.sw) < 2 && carRoot) {
          const c = carRoot.worldToLocal(wheel.getWorldPosition(V()));
          const hL = V().set(c.x - 0.03, c.y + 0.02, c.z - 0.17), hR = V().set(c.x - 0.03, c.y + 0.02, c.z + 0.17);
          grip = { L: wheel.worldToLocal(carRoot.localToWorld(hL.clone())), R: wheel.worldToLocal(carRoot.localToWorld(hR.clone())), homeL: hL, homeR: hR };
        }
        // hand over hand: the hands ride with the rim, and every quarter turn they let go and
        // take it again near their home position (so they never twist round the wheel)
        const regrip = Math.round(car.sw / 90) * 90 * Math.PI / 180;      // every quarter turn
        if (grip && carRoot) {
          // worked out in the car's frame so a moving car does not drag the hands
          const home = { L: grip.homeL, R: grip.homeR };
          for (const k of ["L", "R"]) {
            const cands = [-1, 1].map(sg => carRoot.worldToLocal(wheel.localToWorld(grip[k].clone().applyAxisAngle(Z, sg * regrip))));
            const target = cands[0].distanceTo(home[k]) <= cands[1].distanceTo(home[k]) ? cands[0] : cands[1];
            if (!hold[k]) hold[k] = target.clone();
            const jump = hold[k].distanceTo(target) > 0.06;          // re-grip: move across quickly, not instantly
            hold[k].lerp(target, jump ? Math.min(1, dt * 14) : 1);
          }
        }
        if (grip) for (const k of ["L", "R"]) {
          const a = arms[k]; if (!a.up || !a.fore || !a.hand) continue;
          const T = carRoot.localToWorld(hold[k].clone()), S = a.up.getWorldPosition(V()), E0 = a.fore.getWorldPosition(V()), W0 = a.hand.getWorldPosition(V());
          const l1 = S.distanceTo(E0), l2 = E0.distanceTo(W0);
          const d = T.clone().sub(S), L = Math.min(d.length(), l1 + l2 - 1e-3), dir = d.normalize();
          const x = (l1 * l1 - l2 * l2 + L * L) / (2 * L), h = Math.sqrt(Math.max(0, l1 * l1 - x * x));
          // elbows drop down and out
          const pole = carRoot.localToWorld(V().set(0, -1, k === "L" ? -0.6 : 0.6)).sub(carRoot.getWorldPosition(V())).normalize();
          pole.addScaledVector(dir, -pole.dot(dir)).normalize();
          const E = S.clone().addScaledVector(dir, x).addScaledVector(pole, h);
          aim(a.up, E0, E);
          aim(a.fore, a.hand.getWorldPosition(V()), S.clone().addScaledVector(dir, L));
        }
      }
      // from the driver's own eyes the head is not drawn
      // from the driver's own eyes only what is in front of the shoulders is drawn (arms and hands)
      const host = P.root.parent;
      if (host) {
        const fwd = V().set(1, 0, 0).transformDirection(host.matrixWorld);
        const at = P.root.localToWorld(V().set(0.14, 0, 0));
        clip.setFromNormalAndCoplanarPoint(fwd, at);
      }
      P.clipFloor(cockpit ? [clip] : []);
    }
  };
  return self;
}

// Walk on the spot, always facing the same way. The clip ("Walking Left Turn") moves and turns
// the hips; after every mixer update their travel and turn about the vertical are put back to
// the first frame, keeping the bob, sway and tilt. Works whatever the bone's local axes are.
function pinHips(P) {
  const hips = P.hips, parent = hips.parent;
  parent.updateMatrixWorld(true);
  const up = V().set(0, 1, 0).transformDirection(parent.matrixWorld.clone().invert());   // world up in the parent frame
  const ref = { pos: hips.position.clone(), quat: hips.quaternion.clone() };
  // a hip axis that lies flat at the first frame: its heading tells how far the clip has turned
  const basis = [V().set(1, 0, 0), V().set(0, 1, 0), V().set(0, 0, 1)];
  const flat = basis.reduce((a, b) => Math.abs(a.clone().applyQuaternion(ref.quat).dot(up)) <= Math.abs(b.clone().applyQuaternion(ref.quat).dot(up)) ? a : b);
  const heading = q => { const d = flat.clone().applyQuaternion(q); return d.addScaledVector(up, -d.dot(up)).normalize(); };
  const h0 = heading(ref.quat), turn = Q();
  return () => {
    // position: keep only the component along up
    const d = hips.position.clone().sub(ref.pos), along = d.dot(up);
    hips.position.copy(ref.pos).addScaledVector(up, along);
    // rotation: turn back about up by the heading change since the first frame
    turn.setFromUnitVectors(heading(hips.quaternion), h0);
    hips.quaternion.premultiply(turn);
  };
}

/* ---------- boy: striped hoodie, grey trousers, small ---------- */
export function realKid(gltf) {
  const clip = gltf.animations[0];
  // walk on the spot: the boy is moved by the code, not by the clip
  const P = rigPerson(gltf, { torso: 0.31, seated: false });   // about 1.15 m tall
  dress(P.scene, {
    Hoody: { bands: [0xefe7d2, 0xe8b62a, 0x4a3b31], bandK: 0.06 }, Pants: { tint: 0x777b80 },
    Sneakers: { tint: 0x2c2c30 }, Hair: { tint: 0x3b2a1f }, Body: { tint: 0xe2b08c, gain: 6.5 }
  });
  // a child's head is large for the body
  if (P.head) P.head.scale.setScalar(1.22);
  const walk = P.actions[clip.name];
  const pin = pinHips(P);
  const head = P.head;
  const standT = standingFrame(P, walk, clip);
  let t = 0;
  return {
    root: P.root,
    update(dt, state) {
      t += dt;
      if (state === "walk") { walk.timeScale = 1; P.mixer.update(dt); pin(); P.root.rotation.x = P.root.rotation.z = 0; if (P.head) P.head.scale.setScalar(1.22); }
      else {
        // standing: the walk held at the feet-together frame and re-applied every frame,
        // so the head turns below never add up
        walk.timeScale = 0; walk.time = standT; P.mixer.update(dt); pin(); if (P.head) P.head.scale.setScalar(1.22);
        if (state === "sing") {
          // stands facing the driver's window, sways to the song with small nods, head tipped up
          P.root.rotation.x = Math.sin(t * 2.2) * 0.03;
          P.root.rotation.z = Math.sin(t * 4.4) * 0.02;            // small bob to the beat
        } else P.root.rotation.x = P.root.rotation.z = 0;
      }
    }
  };
}

// The instructor on his feet: his own model with the boy's walking clip (the Mixamo rigs share bone names),
// used when he walks up to the car and gets in. Walks on the spot; the code moves him.
export function realWalker(instructorGltf, kidGltf) {
  const clip = kidGltf.animations[0];
  const P = rigPerson({ scene: instructorGltf.scene, animations: [clip] }, { torso: 0.6, seated: false });
  dress(P.scene, {
    Hat: { tint: 0x4f5f43 }, Jacket: { tint: 0xc4b69c, sleeves: { k: 0.36, open: 0.09, tint: 0x4f78bf } },
    Pants: { tint: 0x4a4b4f }, Shoes: { tint: 0x3a2c22 }
  });
  const walk = P.actions[clip.name], pin = pinHips(P), standT = standingFrame(P, walk, clip), arms = armsDown(P);
  return { root: P.root, update(dt, walking) { walk.timeScale = walking ? 0.9 : 0; if (!walking) walk.time = standT; P.mixer.update(dt); pin(); arms(); } };
}

// The walking clip is the boy's: on the grown-ups its arm tracks leave the arms up in the bind pose. After every update
// the arms are turned to hang down by the sides and swing a little with the step (opposite to the legs).
function armsDown(P) {
  const sides = ["Left", "Right"].map(n => ({ up: P.bones(new RegExp(n + "Arm$")), fore: P.bones(new RegExp(n + "ForeArm$")), hand: P.bones(new RegExp(n + "Hand$")), sg: n === "Left" ? 1 : -1 }));
  const thigh = P.bones(/LeftUpLeg$/), tq = Q(), down = V(), cur = V(), pw = Q(), a = V(), b = V();
  const aim = (bone, child, dir) => {                         // turn `bone` so that the way to `child` points along dir (world)
    bone.updateMatrixWorld(true);
    bone.getWorldPosition(a); child.getWorldPosition(b); cur.subVectors(b, a).normalize();
    tq.setFromUnitVectors(cur, dir);
    bone.parent.getWorldQuaternion(pw);
    const wq = bone.getWorldQuaternion(Q()).premultiply(tq);
    bone.quaternion.copy(pw.invert().multiply(wq));
  };
  return () => {
    if (!sides[0].up || !sides[0].fore) return;
    P.root.updateMatrixWorld(true);
    const fwd = V().set(1, 0, 0).transformDirection(P.root.matrixWorld), side = V().set(0, 0, 1).transformDirection(P.root.matrixWorld);
    // the swing follows the left thigh: forward leg, backward arm
    let swing = 0;
    if (thigh) { const hipP = thigh.getWorldPosition(V()), knee = thigh.children[0] ? thigh.children[0].getWorldPosition(V()) : hipP; swing = Math.max(-1, Math.min(1, V().subVectors(knee, hipP).dot(fwd) / 0.25)); }
    for (const s of sides) {
      if (!s.up || !s.fore) continue;
      down.set(0, -1, 0).addScaledVector(fwd, -s.sg * swing * 0.35).addScaledVector(side, s.sg * -0.12).normalize();
      aim(s.up, s.fore, down);
      if (s.hand) { down.set(0, -1, 0).addScaledVector(fwd, 0.25 - s.sg * swing * 0.3).normalize(); aim(s.fore, s.hand, down); }
    }
  };
}

// The learner on his feet (his own model with the boy's walking clip): he walks up to the driver's door.
export function realDriverWalker(driverGltf, kidGltf) {
  const clip = kidGltf.animations[0];
  const P = rigPerson({ scene: driverGltf.scene, animations: [clip] }, { torso: 0.6, seated: false });
  dress(P.scene, { Tops: { tint: 0x26334f }, Bottoms: { tint: 0x2b3446 } });
  const walk = P.actions[clip.name], pin = pinHips(P), standT = standingFrame(P, walk, clip), arms = armsDown(P);
  return { root: P.root, update(dt, walking) { walk.timeScale = walking ? 0.9 : 0; if (!walking) walk.time = standT; P.mixer.update(dt); pin(); arms(); } };
}

// Pedestrian at the crossing: the same Mixamo walker at adult size in a dark jacket and jeans.
export function realPedestrian(gltf) {
  const clip = gltf.animations[0];
  const P = rigPerson(gltf, { torso: 0.6, seated: false });
  dress(P.scene, { Hoody: { tint: 0x2d3a52 }, Pants: { tint: 0x3a4a66 }, Sneakers: { tint: 0xe8e8e6 }, Hair: { tint: 0x1d1612 }, Body: { tint: 0xd9a77f, gain: 6.5 } });
  const walk = P.actions[clip.name];
  const pin = pinHips(P);
  const standT = standingFrame(P, walk, clip);
  return {
    root: P.root,
    update(dt, walking) {
      walk.timeScale = walking ? 1 : 0;
      if (!walking) walk.time = standT;
      P.mixer.update(dt); pin();
    }
  };
}
// the frame of the walk where the feet are closest together: used as the standing pose
function standingFrame(P, walk, clip) {
  const l = P.bones(/LeftFoot$/), r = P.bones(/RightFoot$/);
  if (!l || !r) return 0;
  let best = 0, bestD = Infinity;
  walk.play();
  for (let t = 0; t < clip.duration; t += clip.duration / 40) {
    walk.time = t; P.mixer.update(0); P.root.updateMatrixWorld(true);
    const a = l.getWorldPosition(V()), b = r.getWorldPosition(V()), d = Math.hypot(a.x - b.x, a.z - b.z);
    if (d < bestD) { bestD = d; best = t; }
  }
  return best;
}

export async function loadPeople() {
  const [i, d, k] = await Promise.all([load("instructor"), load("driver"), load("kid")]);
  return { instructor: i, driver: d, kid: k };
}
