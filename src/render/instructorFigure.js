// The instructor sitting in the passenger seat: a stocky older man with a green flat
// cap, grey moustache, blue checked shirt and beige multi-pocket vest. Built from
// simple shapes, posed with a few joints. Frame: x forward, y up, z right; origin is
// the hip point on the seat.
import * as THREE from "three";

const LEAN = 0.3;   // seat back angle

function plaid() {
  const c = document.createElement("canvas"); c.width = c.height = 128;
  const g = c.getContext("2d");
  g.fillStyle = "#4f78bf"; g.fillRect(0, 0, 128, 128);
  g.fillStyle = "rgba(160,190,235,.45)";
  for (let i = 0; i < 128; i += 32) { g.fillRect(i, 0, 5, 128); g.fillRect(0, i, 128, 5); }
  g.fillStyle = "rgba(30,50,100,.35)";
  for (let i = 16; i < 128; i += 32) { g.fillRect(i, 0, 2, 128); g.fillRect(0, i, 128, 2); }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(3, 3); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// capsule between two points
function limb(a, b, r, mat) {
  const A = new THREE.Vector3(...a), B = new THREE.Vector3(...b), d = B.clone().sub(A);
  const m = new THREE.Mesh(new THREE.CapsuleGeometry(r, Math.max(0.001, d.length()), 6, 12), mat);
  m.position.copy(A).addScaledVector(d, 0.5);
  m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize());
  return m;
}
const ball = (r, mat, pos, scale) => {
  const m = new THREE.Mesh(new THREE.SphereGeometry(r, 20, 14), mat);
  m.position.set(...pos); if (scale) m.scale.set(...scale);
  return m;
};

export function buildInstructor() {
  const M = {
    skin: new THREE.MeshStandardMaterial({ color: 0xc98f6e, roughness: 0.7 }),
    shirt: new THREE.MeshStandardMaterial({ map: plaid(), roughness: 0.9 }),
    vest: new THREE.MeshStandardMaterial({ color: 0xbfb29b, roughness: 0.95, side: THREE.DoubleSide }),
    vestDark: new THREE.MeshStandardMaterial({ color: 0xa69a83, roughness: 0.95 }),
    trousers: new THREE.MeshStandardMaterial({ color: 0x3a3d44, roughness: 0.9 }),
    shoe: new THREE.MeshStandardMaterial({ color: 0x2a211b, roughness: 0.6 }),
    grey: new THREE.MeshStandardMaterial({ color: 0x8d8b87, roughness: 0.95 }),
    cap: new THREE.MeshStandardMaterial({ color: 0x46533f, roughness: 0.9 }),
    white: new THREE.MeshStandardMaterial({ color: 0xf2efe8, roughness: 0.5 }),
    iris: new THREE.MeshStandardMaterial({ color: 0x6b3a12, roughness: 0.3 }),
    dark: new THREE.MeshStandardMaterial({ color: 0x3a1512, roughness: 0.8 }),
    zip: new THREE.MeshStandardMaterial({ color: 0x77736b, roughness: 0.4, metalness: 0.6 })
  };
  const root = new THREE.Group(); root.name = "instructor";

  // legs: thighs along the cushion, shins down to the floor
  for (const s of [-1, 1]) {
    const z = s * 0.1;
    root.add(limb([0, 0, z], [0.42, 0.04, z * 1.15], 0.078, M.trousers));
    root.add(limb([0.42, 0.04, z * 1.15], [0.5, -0.34, z * 1.2], 0.06, M.trousers));
    const shoe = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.07, 0.1), M.shoe);
    shoe.position.set(0.56, -0.39, z * 1.2); root.add(shoe);
  }

  // torso, leaning back with the seat
  const torso = new THREE.Group(); torso.rotation.z = LEAN; root.add(torso);
  const chest = new THREE.Mesh(new THREE.CapsuleGeometry(0.17, 0.26, 8, 20), M.shirt);
  chest.position.y = 0.27; chest.scale.set(1, 1, 1.18); torso.add(chest);
  torso.add(ball(0.165, M.shirt, [0.06, 0.16, 0], [1, 0.95, 1.12]));          // belly
  // open vest with pockets and a zip on each side
  const vest = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.235, 0.42, 28, 1, true, Math.PI / 2 + 0.42, Math.PI * 2 - 0.84), M.vest);
  vest.position.set(0.02, 0.25, 0); vest.scale.set(1.08, 1, 1.12); torso.add(vest);
  for (const s of [-1, 1]) {
    for (const [y, h] of [[0.32, 0.08], [0.13, 0.07]]) {
      const pk = new THREE.Mesh(new THREE.BoxGeometry(0.014, h, 0.085), M.vestDark);
      const a = 0.62;
      const r = 0.2 + (0.31 - y) * 0.083 + 0.006;
      pk.position.set(0.02 + r * Math.cos(a) * 1.08, y, s * r * Math.sin(a) * 1.12); pk.rotation.y = -s * a;
      torso.add(pk);
    }
    const zp = new THREE.Mesh(new THREE.BoxGeometry(0.006, 0.36, 0.008), M.zip);
    zp.position.set(0.215, 0.25, s * 0.1); torso.add(zp);
  }
  torso.add(ball(0.05, M.white, [0.12, 0.47, 0], [0.6, 1, 1]));            // undershirt at the collar
  const collar = new THREE.Mesh(new THREE.TorusGeometry(0.07, 0.022, 8, 20), M.shirt);
  collar.position.set(0.0, 0.5, 0); collar.rotation.x = Math.PI / 2; torso.add(collar);
  torso.add(limb([0, 0.48, 0], [0, 0.58, 0], 0.055, M.skin));                 // neck

  // head: base cancels the lean, yaw turns to the driver, nod for talking
  const headBase = new THREE.Group(); headBase.position.set(0, 0.6, 0); headBase.rotation.z = -LEAN; torso.add(headBase);
  const yaw = new THREE.Group(); headBase.add(yaw);
  const head = new THREE.Group(); yaw.add(head);
  head.add(ball(0.11, M.skin, [0, 0.1, 0], [1, 1.08, 0.97]));
  head.add(ball(0.112, M.grey, [-0.022, 0.11, 0], [1, 1.02, 1.02]));         // grey hair at the back and sides
  head.add(ball(0.06, M.skin, [0.045, 0.02, 0], [1, 0.8, 1.35]));           // jowls / chin
  head.add(ball(0.032, M.skin, [0.108, 0.085, 0], [1.1, 1.05, 1]));          // big nose
  for (const s of [-1, 1]) {
    head.add(ball(0.026, M.skin, [0.0, 0.095, s * 0.105], [0.55, 1, 0.6]));  // ears
    head.add(ball(0.016, M.white, [0.091, 0.128, s * 0.038]));
    head.add(ball(0.009, M.iris, [0.104, 0.128, s * 0.038]));
  }
  const brows = [-1, 1].map(s => {
    const b = new THREE.Mesh(new THREE.BoxGeometry(0.014, 0.014, 0.048), M.grey);
    b.position.set(0.1, 0.158, s * 0.04); head.add(b); return { b, s };
  });
  const tash = new THREE.Mesh(new THREE.CapsuleGeometry(0.019, 0.08, 6, 12), M.grey);   // moustache
  tash.rotation.x = Math.PI / 2; tash.position.set(0.106, 0.055, 0); tash.scale.set(1, 1, 0.75); head.add(tash);
  for (const s of [-1, 1]) head.add(ball(0.016, M.grey, [0.098, 0.04, s * 0.055], [1, 1.2, 1]));
  const mouth = ball(0.022, M.dark, [0.1, 0.028, 0], [0.4, 0.25, 1.3]); head.add(mouth);
  // flat cap with a short brim
  const capTop = new THREE.Mesh(new THREE.SphereGeometry(0.125, 24, 10, 0, Math.PI * 2, 0, Math.PI * 0.45), M.cap);
  capTop.position.set(0.0, 0.16, 0); capTop.scale.set(1.08, 0.62, 1.0); capTop.rotation.z = -0.12; head.add(capTop);
  const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.012, 24, 1, false, 0, Math.PI), M.cap);
  brim.position.set(0.075, 0.172, 0); brim.scale.set(0.85, 1, 1.05); brim.rotation.z = -0.22; head.add(brim);

  // arms: shoulder > elbow > hand; side -1 is next to the driver
  const arms = {};
  for (const s of [-1, 1]) {
    const sh = new THREE.Group(); sh.position.set(-0.01, 0.46, s * 0.225); torso.add(sh);
    sh.add(limb([0, 0, 0], [0, -0.24, 0], 0.056, M.shirt));
    const el = new THREE.Group(); el.position.y = -0.26; sh.add(el);
    const cuff = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.055, 0.05, 14), M.shirt); cuff.position.y = -0.02; el.add(cuff);
    el.add(limb([0, -0.02, 0], [0, -0.22, 0], 0.044, M.skin));
    const hand = new THREE.Group(); hand.position.y = -0.27; el.add(hand);
    hand.add(ball(0.05, M.skin, [0, 0, 0], [0.8, 1.05, 0.65]));
    const thumb = limb([0, 0.0, -s * 0.03], [0.07, 0.0, -s * 0.03], 0.017, M.skin); hand.add(thumb);
    arms[s] = { sh, el, hand, thumb };
  }

  // the pose eases towards a target set of joint angles
  const POSES = {
    rest: { sh: [0, 0, 0.12], el: [0, 0, 1.25], hand: [0, 0, 0.3] },
    point: { sh: [-0.15, 0, 1.15], el: [0, 0, 0.35], hand: [0, 0, 0.2] },
    thumb: { sh: [-0.25, 0, 0.55], el: [0.2, 0, 1.75], hand: [0, 0, -1.5] },
    angry: { sh: [-0.35, 0, 0.55], el: [0, 0, 1.9], hand: [0, 0, 0] },
    brace: { sh: [0, 0, 1.3], el: [0, 0, 0.25], hand: [0, 0, -0.6] }
  };
  const cur = new Map();
  const ease = (obj, key, target, k) => {
    const v = cur.get(obj) || [0, 0, 0];
    for (let i = 0; i < 3; i++) v[i] += (target[i] - v[i]) * k;
    cur.set(obj, v); obj.rotation.set(v[0], v[1], v[2]);
  };
  let t = 0, glance = 0, glanceT = 3;
  return {
    root,
    update(dt, { talking, gesture, angry }) {
      t += dt;
      const k = 1 - Math.exp(-dt * 7);
      // the arm nearest the driver gestures, the other one rests (or braces too)
      const near = POSES[gesture] || POSES.rest, far = gesture === "brace" ? POSES.brace : POSES.rest;
      for (const [s, p] of [[-1, near], [1, far]]) {
        const a = arms[s], sx = s < 0 ? 1 : -1;     // mirror the sideways swing
        ease(a.sh, "sh", [p.sh[0] * sx, p.sh[1], p.sh[2]], k);
        ease(a.el, "el", p.el, k);
        ease(a.hand, "hand", p.hand, k);
      }
      if (gesture === "angry") arms[-1].el.rotation.x += Math.sin(t * 13) * 0.35;      // shakes his hand
      // head: towards the driver while talking, otherwise the road with the odd glance
      glanceT -= dt;
      if (glanceT < 0) { glance = Math.random() < 0.5 ? 0 : (Math.random() < 0.6 ? 0.55 : -0.35); glanceT = 2 + Math.random() * 4; }
      const wantYaw = talking || gesture ? 0.75 : glance;
      yaw.rotation.y += (wantYaw - yaw.rotation.y) * k;
      head.rotation.z = talking ? Math.sin(t * 9) * 0.04 + (angry ? -0.05 : 0) : head.rotation.z * (1 - k);
      mouth.scale.y = talking ? 0.25 + Math.abs(Math.sin(t * 17) * Math.sin(t * 6.3)) * 0.9 : 0.25;
      for (const { b, s } of brows) b.rotation.x = angry ? s * 0.35 : 0;     // frown
      M.skin.color.setHex(angry ? 0xd4836a : 0xc98f6e);                      // goes red when angry
    }
  };
}
