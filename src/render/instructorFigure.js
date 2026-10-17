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
    skin: new THREE.MeshPhysicalMaterial({ color: 0xc98f6e, roughness: 0.55, sheen: 0.4, sheenColor: 0xffb090 }),
    shirt: new THREE.MeshStandardMaterial({ map: plaid(), roughness: 0.9 }),
    vest: new THREE.MeshStandardMaterial({ color: 0xbfb29b, roughness: 0.95, side: THREE.DoubleSide }),
    vestDark: new THREE.MeshStandardMaterial({ color: 0xa69a83, roughness: 0.95 }),
    trousers: new THREE.MeshStandardMaterial({ color: 0x3a3d44, roughness: 0.9 }),
    shoe: new THREE.MeshStandardMaterial({ color: 0x2a211b, roughness: 0.6 }),
    grey: new THREE.MeshStandardMaterial({ color: 0x9a9893, roughness: 0.95 }),
    cap: new THREE.MeshStandardMaterial({ color: 0x46533f, roughness: 0.9 }),
    white: new THREE.MeshStandardMaterial({ color: 0xf2efe8, roughness: 0.5 }),
    iris: new THREE.MeshStandardMaterial({ color: 0x6b3a12, roughness: 0.3 }),
    dark: new THREE.MeshStandardMaterial({ color: 0x3a1512, roughness: 0.8 }),
    pupil: new THREE.MeshStandardMaterial({ color: 0x0e0a08, roughness: 0.2 }),
    shine: new THREE.MeshBasicMaterial({ color: 0xffffff }),
    lip: new THREE.MeshStandardMaterial({ color: 0x9a5546, roughness: 0.6 }),
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
  // vest shell over the shoulders and sides; the checked shirt and belly show through the open front
  const shell = new THREE.Mesh(new THREE.CapsuleGeometry(0.182, 0.25, 8, 24), M.vest);
  shell.position.y = 0.27; shell.scale.set(1, 1, 1.2); torso.add(shell);
  torso.add(ball(0.168, M.shirt, [0.07, 0.17, 0], [1, 1, 1.05]));              // belly in the checked shirt
  const placket = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.22, 0.1), M.shirt);
  placket.position.set(0.165, 0.38, 0); placket.rotation.z = -0.15; torso.add(placket);
  for (let i = 0; i < 3; i++) torso.add(ball(0.007, M.zip, [0.188, 0.44 - i * 0.07, 0]));  // shirt buttons
  // vest seams, zip and the patch pockets with flaps
  const onShell = (a, y, sd) => { const r = 0.183; return [r * Math.cos(a), y, sd * 1.2 * r * Math.sin(a)]; };
  for (const sd of [-1, 1]) {
    const edge = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.42, 0.02), M.vestDark);
    edge.position.set(...onShell(0.42, 0.28, sd)); edge.rotation.y = -sd * 0.5; torso.add(edge);
    const zp = new THREE.Mesh(new THREE.BoxGeometry(0.006, 0.4, 0.008), M.zip);
    zp.position.set(...onShell(0.44, 0.28, sd)); zp.position.x += 0.008; torso.add(zp);
    for (const [y, w, h] of (sd > 0 ? [[0.36, 0.09, 0.09], [0.12, 0.1, 0.08]] : [[0.12, 0.1, 0.08]])) {
      const pk = new THREE.Group(); pk.position.set(...onShell(0.78, y, sd)); pk.rotation.y = -sd * 0.78; torso.add(pk);
      const body = new THREE.Mesh(new THREE.BoxGeometry(0.014, h, w), M.vest); body.position.x = 0.006; pk.add(body);
      const flap = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.028, w * 1.04), M.vestDark); flap.position.set(0.012, h / 2 - 0.01, 0); pk.add(flap);
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.012, 0.003, 6, 12), M.zip); ring.position.set(0.018, -h / 2 + 0.005, 0); ring.rotation.y = Math.PI / 2; pk.add(ring);
    }
  }
  // shirt collar points over the vest, white T-shirt at the neck
  torso.add(ball(0.045, M.white, [0.115, 0.5, 0], [0.5, 0.8, 1]));
  for (const sd of [-1, 1]) {
    const c = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.07, 0.06), M.shirt);
    c.position.set(0.11, 0.52, sd * 0.055); c.rotation.set(sd * 0.5, -sd * 0.6, -0.3); torso.add(c);
  }
  const collar = new THREE.Mesh(new THREE.TorusGeometry(0.068, 0.02, 8, 20), M.shirt);
  collar.position.set(0.0, 0.52, 0); collar.rotation.x = Math.PI / 2; torso.add(collar);
  torso.add(limb([0, 0.48, 0], [0, 0.6, 0], 0.062, M.skin));                   // thick neck

  // head: base cancels the lean, yaw turns to the driver, nod for talking
  const headBase = new THREE.Group(); headBase.position.set(0, 0.6, 0); headBase.rotation.z = -LEAN; torso.add(headBase);
  const yaw = new THREE.Group(); headBase.add(yaw);
  const head = new THREE.Group(); yaw.add(head);
  head.add(ball(0.112, M.skin, [0, 0.1, 0], [1, 1.05, 0.98]));
  head.add(ball(0.114, M.grey, [-0.024, 0.105, 0], [1, 1, 1.03]));            // grey hair at the back and sides
  head.add(ball(0.068, M.skin, [0.04, 0.005, 0], [1, 0.75, 1.4]));            // round jowls and double chin
  for (const sd of [-1, 1]) {
    head.add(ball(0.03, M.skin, [0.052, 0.055, sd * 0.07]));                   // full cheeks
    head.add(ball(0.031, M.skin, [-0.002, 0.095, sd * 0.108], [0.5, 1.1, 0.65])); // ears
    const burn = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.05, 0.012), M.grey);   // sideburns
    burn.position.set(0.02, 0.12, sd * 0.104); head.add(burn);
    // eyes: white, brown iris, pupil, a highlight and a heavy upper lid
    const ey = [0.094, 0.132, sd * 0.042];
    head.add(ball(0.019, M.white, ey, [0.7, 1, 1]));
    head.add(ball(0.011, M.iris, [0.105, 0.131, sd * 0.042]));
    head.add(ball(0.006, M.pupil, [0.111, 0.131, sd * 0.042]));
    head.add(ball(0.0025, M.shine, [0.114, 0.135, sd * 0.039]));
    const lid = new THREE.Mesh(new THREE.SphereGeometry(0.021, 16, 8, 0, Math.PI * 2, 0, Math.PI * 0.42), M.skin);
    lid.position.set(...ey); lid.scale.set(0.78, 1, 1.05); lid.rotation.z = -0.25; head.add(lid);
  }
  head.add(limb([0.1, 0.125, 0], [0.118, 0.09, 0], 0.016, M.skin));           // nose bridge
  head.add(ball(0.036, M.skin, [0.118, 0.082, 0], [1.1, 1, 1.08]));           // big round nose
  const brows = [-1, 1].map(sd => {                                            // bushy grey brows
    const b = limb([0, 0, -0.024], [0, 0, 0.024], 0.012, M.grey);
    const g = new THREE.Group(); g.position.set(0.102, 0.162, sd * 0.045); g.add(b); head.add(g);
    return { b: g, s: sd };
  });
  // thick walrus moustache, drooping at the ends
  head.add(limb([0.112, 0.056, -0.035], [0.112, 0.056, 0.035], 0.021, M.grey));
  for (const sd of [-1, 1]) head.add(ball(0.021, M.grey, [0.104, 0.043, sd * 0.05], [1, 1.25, 1.1]));
  const smile = new THREE.Mesh(new THREE.TorusGeometry(0.024, 0.0045, 6, 14, Math.PI), M.lip);
  smile.position.set(0.106, 0.028, 0); smile.rotation.set(Math.PI, Math.PI / 2, 0); head.add(smile);
  const mouth = ball(0.02, M.dark, [0.104, 0.024, 0], [0.4, 0.25, 1.2]); head.add(mouth);
  // padded flat cap with a short brim and a button on top
  const capTop = new THREE.Mesh(new THREE.SphereGeometry(0.13, 28, 12, 0, Math.PI * 2, 0, Math.PI * 0.5), M.cap);
  capTop.position.set(0.008, 0.155, 0); capTop.scale.set(1.12, 0.52, 1.03); capTop.rotation.z = -0.14; head.add(capTop);
  const band = new THREE.Mesh(new THREE.CylinderGeometry(0.118, 0.118, 0.025, 28, 1, true), M.cap);
  band.position.set(0.0, 0.158, 0); band.rotation.z = -0.1; head.add(band);
  const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.012, 24, 1, false, 0, Math.PI), M.cap);
  brim.position.set(0.082, 0.168, 0); brim.scale.set(0.85, 1, 1.08); brim.rotation.z = -0.25; head.add(brim);
  head.add(ball(0.009, M.cap, [0.0, 0.222, 0]));

  // arms: shoulder > elbow > hand with fingers; side -1 is next to the driver
  const arms = {};
  for (const s of [-1, 1]) {
    const sh = new THREE.Group(); sh.position.set(-0.01, 0.46, s * 0.228); torso.add(sh);
    sh.add(ball(0.062, M.vest, [0, -0.01, 0], [1, 0.8, 1]));                     // vest over the shoulder
    sh.add(limb([0, 0, 0], [0, -0.24, 0], 0.06, M.shirt));
    const el = new THREE.Group(); el.position.y = -0.26; sh.add(el);
    const cuff = new THREE.Mesh(new THREE.TorusGeometry(0.052, 0.016, 8, 16), M.shirt); cuff.position.y = -0.03; cuff.rotation.x = Math.PI / 2; el.add(cuff);
    el.add(limb([0, -0.02, 0], [0, -0.21, 0], 0.046, M.skin));
    const hand = new THREE.Group(); hand.position.y = -0.26; el.add(hand);
    hand.add(ball(0.045, M.skin, [0, 0, 0], [0.75, 1, 0.9]));                   // palm
    for (let f = 0; f < 4; f++) {
      const fz = (f - 1.5) * 0.019;
      const fg = limb([0.02, -0.03, fz], [0.045, -0.055, fz], 0.0115, M.skin); hand.add(fg);
    }
    const thumb = limb([0.02, 0.0, -s * 0.03], [0.07, 0.01, -s * 0.032], 0.015, M.skin); hand.add(thumb);
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
      for (const { b, s } of brows) b.rotation.x = angry ? -s * 0.35 : 0;     // frown
      M.skin.color.setHex(angry ? 0xd4836a : 0xc98f6e);                      // goes red when angry
    }
  };
}
