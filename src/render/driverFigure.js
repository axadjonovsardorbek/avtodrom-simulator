// The learner at the wheel: a young man in a navy bomber jacket over a white T-shirt,
// dark jeans and white trainers, short dark hair. His hands hold the steering wheel at
// a quarter to three and follow it as it turns (two-bone arm IK). From the driver's
// seat only the forearms and hands are shown. Frame: x forward, y up, z right; the
// origin is the hip point on the seat.
import * as THREE from "three";

const LEAN = 0.28;
const UPPER = 0.29, FORE = 0.27;          // shoulder-elbow, elbow-wrist
const RIM = 0.175;                        // where the hands hold the rim, from the hub

const cap = (r, mat) => new THREE.Mesh(new THREE.CylinderGeometry(r, r * 0.92, 1, 16), mat);   // unit length, stretched each frame
const ball = (r, mat, pos, scale) => {
  const m = new THREE.Mesh(new THREE.SphereGeometry(r, 22, 16), mat);
  m.position.set(...pos); if (scale) m.scale.set(...scale);
  return m;
};
const limb = (a, b, r, mat) => {
  const A = new THREE.Vector3(...a), B = new THREE.Vector3(...b), d = B.clone().sub(A);
  const m = new THREE.Mesh(new THREE.CapsuleGeometry(r, Math.max(0.001, d.length()), 6, 14), mat);
  m.position.copy(A).addScaledVector(d, 0.5); m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize());
  return m;
};
// stretch a unit cylinder between two points
function span(m, a, b) {
  const d = b.clone().sub(a), L = d.length();
  m.position.copy(a).addScaledVector(d, 0.5);
  m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize());
  m.scale.set(1, Math.max(0.01, L), 1);
}

export function buildDriver() {
  const M = {
    skin: new THREE.MeshPhysicalMaterial({ color: 0xd2a07e, roughness: 0.55, sheen: 0.4, sheenColor: 0xffb090 }),
    hair: new THREE.MeshStandardMaterial({ color: 0x1c1512, roughness: 0.8 }),
    jacket: new THREE.MeshPhysicalMaterial({ color: 0x1d2a44, roughness: 0.55, sheen: 0.6, sheenColor: 0x5a6f9a }),
    rib: new THREE.MeshStandardMaterial({ color: 0x141c2e, roughness: 0.9 }),
    tee: new THREE.MeshStandardMaterial({ color: 0xf2f2ef, roughness: 0.85 }),
    jeans: new THREE.MeshStandardMaterial({ color: 0x2b3446, roughness: 0.9 }),
    shoe: new THREE.MeshStandardMaterial({ color: 0xf4f4f2, roughness: 0.5 }),
    sole: new THREE.MeshStandardMaterial({ color: 0xcfcfcf, roughness: 0.7 }),
    white: new THREE.MeshStandardMaterial({ color: 0xf4f1ea, roughness: 0.4 }),
    iris: new THREE.MeshStandardMaterial({ color: 0x3a2412, roughness: 0.3 }),
    pupil: new THREE.MeshStandardMaterial({ color: 0x0b0806, roughness: 0.2 }),
    lip: new THREE.MeshStandardMaterial({ color: 0xa8665a, roughness: 0.6 }),
    watch: new THREE.MeshStandardMaterial({ color: 0x23252a, roughness: 0.3, metalness: 0.7 })
  };
  const root = new THREE.Group(); root.name = "driver";
  const body = new THREE.Group(); root.add(body);            // everything hidden from the driver's own eyes

  // legs to the pedals
  for (const s of [-1, 1]) {
    const z = s * 0.1;
    body.add(limb([0, 0, z], [0.44, 0.05, z * 1.1], 0.075, M.jeans));
    // shins go forward to the pedals so the feet stay above the cabin floor (~0.22 m below the hip)
    body.add(limb([0.44, 0.05, z * 1.1], [0.74, -0.16, z * 1.15], 0.058, M.jeans));
    const shoe = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.08, 0.1), M.shoe); shoe.position.set(0.82, -0.19, z * 1.15); shoe.rotation.z = 0.55; body.add(shoe);
    const sole = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.025, 0.105), M.sole); sole.position.set(0.81, -0.225, z * 1.15); sole.rotation.z = 0.55; body.add(sole);
  }
  // torso
  const torso = new THREE.Group(); torso.rotation.z = LEAN; body.add(torso);
  const chest = new THREE.Mesh(new THREE.CapsuleGeometry(0.16, 0.24, 8, 24), M.jacket); chest.position.y = 0.28; chest.scale.set(0.9, 1, 1.18); torso.add(chest);
  const hem = new THREE.Mesh(new THREE.TorusGeometry(0.15, 0.025, 8, 24), M.rib); hem.position.y = 0.07; hem.rotation.x = Math.PI / 2; hem.scale.set(0.9, 1.18, 1); torso.add(hem);
  const collar = new THREE.Mesh(new THREE.TorusGeometry(0.075, 0.024, 8, 20), M.rib); collar.position.y = 0.52; collar.rotation.x = Math.PI / 2; torso.add(collar);
  torso.add(ball(0.05, M.tee, [0.11, 0.48, 0], [0.5, 0.9, 1]));                      // T-shirt at the open neck
  const zip = new THREE.Mesh(new THREE.BoxGeometry(0.006, 0.36, 0.01), M.watch); zip.position.set(0.145, 0.29, 0.03); torso.add(zip);
  torso.add(limb([0, 0.48, 0], [0, 0.6, 0], 0.052, M.skin));
  const shoulders = [-1, 1].map(s => { const o = new THREE.Object3D(); o.position.set(-0.01, 0.45, s * 0.215); torso.add(o); torso.add(ball(0.068, M.jacket, [-0.01, 0.45, s * 0.215])); return o; });

  // head
  const headBase = new THREE.Group(); headBase.position.set(0, 0.6, 0); headBase.rotation.z = -LEAN; torso.add(headBase);
  const head = new THREE.Group(); headBase.add(head);
  head.add(ball(0.102, M.skin, [0, 0.1, 0], [1.02, 1.12, 0.94]));
  head.add(ball(0.052, M.skin, [0.05, 0.03, 0], [1, 0.8, 1.3]));                       // jaw
  for (const s of [-1, 1]) {
    head.add(ball(0.024, M.skin, [-0.005, 0.1, s * 0.098], [0.5, 1.05, 0.6]));         // ears
    const e = [0.088, 0.124, s * 0.038];
    head.add(ball(0.017, M.white, e, [0.65, 0.85, 1.05]));
    head.add(ball(0.0105, M.iris, [e[0] + 0.01, e[1], e[2]]));
    head.add(ball(0.0055, M.pupil, [e[0] + 0.0145, e[1], e[2]]));
    const brow = limb([0.097, 0.152, s * 0.02], [0.094, 0.156, s * 0.06], 0.007, M.hair); head.add(brow);
  }
  head.add(limb([0.1, 0.12, 0], [0.114, 0.075, 0], 0.014, M.skin));                   // nose
  head.add(ball(0.019, M.skin, [0.113, 0.072, 0], [1, 0.8, 1.3]));
  const mouth = new THREE.Mesh(new THREE.TorusGeometry(0.02, 0.004, 6, 14, Math.PI), M.lip);
  mouth.position.set(0.1, 0.035, 0); mouth.rotation.set(Math.PI, Math.PI / 2, 0); head.add(mouth);
  // short textured crop: a cap of hair with a raised quiff at the front
  const hair = new THREE.Mesh(new THREE.SphereGeometry(0.108, 24, 12, 0, Math.PI * 2, 0, Math.PI * 0.5), M.hair);
  hair.position.set(-0.01, 0.12, 0); hair.scale.set(1.04, 0.95, 1.03); hair.rotation.z = 0.42; head.add(hair);   // hairline above the brow
  for (let i = 0; i < 9; i++) {
    const z = (i - 4) * 0.02, q = new THREE.Mesh(new THREE.ConeGeometry(0.022, 0.06, 6), M.hair);
    q.position.set(0.06 - Math.abs(z) * 0.3, 0.205 - Math.abs(z) * 0.15, z); q.rotation.set(z * 1.5, 0, -0.7 - (i % 2) * 0.2); head.add(q);
  }
  const back = ball(0.1, M.hair, [-0.03, 0.1, 0], [0.8, 0.85, 1.0]); head.add(back);      // short back and sides

  // arms: rebuilt between the shoulder, elbow and wrist every frame
  const arms = [-1, 1].map(s => {
    const upper = cap(0.058, M.jacket), fore = new THREE.Mesh(new THREE.CylinderGeometry(0.036, 0.045, 1, 18), M.jacket), cuff = new THREE.Mesh(new THREE.TorusGeometry(0.036, 0.011, 8, 16), M.rib);
    const hand = new THREE.Group(); hand.add(ball(0.045, M.skin, [0, 0, 0], [0.8, 1, 0.75]));
    for (let f = 0; f < 4; f++) hand.add(limb([0.03, 0.02, (f - 1.5) * 0.017], [0.045, -0.025, (f - 1.5) * 0.019], 0.011, M.skin));   // fingers curled round the rim
    hand.add(limb([0.0, 0.025, -s * 0.03], [0.05, 0.03, -s * 0.03], 0.013, M.skin));
    const watch = s < 0 ? new THREE.Mesh(new THREE.TorusGeometry(0.04, 0.008, 8, 16), M.watch) : null;
    // the elbow end of the sleeve stays visible from the driver's seat, so it is closed with a ball
    const elbowBall = ball(0.047, M.jacket, [0, 0, 0]);
    body.add(upper); root.add(fore, cuff, hand, elbowBall); if (watch) root.add(watch);
    return { s, upper, fore, cuff, hand, watch, elbowBall, grip: null, elbow: new THREE.Vector3() };
  });
  root.traverse(o => { if (o.isMesh) o.castShadow = true; });

  const v = new THREE.Vector3(), tmp = new THREE.Vector3(), tmp2 = new THREE.Vector3();
  const shoulderAt = s => root.worldToLocal(shoulders[s < 0 ? 0 : 1].getWorldPosition(new THREE.Vector3()));
  let t = 0;
  return {
    root,
    // cockpit: only the forearms and hands are shown
    reset() { for (const a of arms) a.grip = a.hold = null; },
    setCockpit(on) { body.visible = !on; for (const a of arms) a.fore.visible = a.cuff.visible = a.hand.visible = true; },
    update(dt, wheel, car) {
      t += dt;
      root.updateMatrixWorld(true);
      if (!wheel) return;
      wheel.updateMatrixWorld(true);
      // grip points in the wheel's own frame, taken once while the wheel is straight
      if (!arms[0].grip && Math.abs(car.sw) < 2) {
        // 9 and 3 o'clock on the real rim: in the wheel's own plane, whatever the column tilt
        const c = wheel.getWorldPosition(new THREE.Vector3());
        const n = v.set(0, 0, 1).transformDirection(wheel.matrixWorld);
        const right = tmp.set(0, 0, 1).transformDirection(root.matrixWorld);
        right.addScaledVector(n, -right.dot(n)).normalize();
        const up = tmp2.crossVectors(n, right); if (up.y < 0) up.negate();
        const box = new THREE.Box3().setFromObject(wheel), size = box.getSize(new THREE.Vector3());
        const R = THREE.MathUtils.clamp(Math.abs(right.x) * size.x / 2 + Math.abs(right.z) * size.z / 2 || RIM, 0.12, 0.2) - 0.012;
        for (const a of arms) a.grip = wheel.worldToLocal(c.clone().addScaledVector(right, a.s * R).addScaledVector(up, 0.025));
      }
      head.rotation.y = THREE.MathUtils.clamp(-car.sw / 540 * 0.5, -0.4, 0.4) + Math.sin(t * 0.37) * 0.04;   // looks into the turn
      for (const a of arms) {
        if (!a.grip) continue;
        // hold on while the wheel turns up to ~100 degrees, then keep the hands where they were (hand over hand)
        if (Math.abs(car.sw) < 100 || !a.hold) a.hold = root.worldToLocal(wheel.localToWorld(a.grip.clone()));
        const W = a.hold, S = shoulderAt(a.s);
        // two-bone IK with the elbow dropping down and out
        const d = W.clone().sub(S), L = Math.min(d.length(), UPPER + FORE - 0.001);
        const dir = d.normalize(), x = (UPPER * UPPER - FORE * FORE + L * L) / (2 * L), h = Math.sqrt(Math.max(0, UPPER * UPPER - x * x));
        const pole = tmp.set(0, -1, a.s * 0.6).normalize(); pole.addScaledVector(dir, -pole.dot(dir)).normalize();
        const E = a.elbow.copy(S).addScaledVector(dir, x).addScaledVector(pole, h);
        const Wp = S.clone().addScaledVector(dir, L);
        span(a.upper, S, E); span(a.fore, E, Wp); a.elbowBall.position.copy(E);
        a.cuff.position.copy(Wp).lerp(E, 0.1); a.cuff.quaternion.setFromUnitVectors(v.set(0, 0, 1), tmp2.copy(Wp).sub(E).normalize());
        a.hand.position.copy(Wp).addScaledVector(tmp2, 0.04);
        a.hand.quaternion.setFromUnitVectors(v.set(0, 1, 0), tmp2.clone().negate());
        if (a.watch) { a.watch.position.copy(Wp).lerp(E, 0.16); a.watch.quaternion.copy(a.cuff.quaternion); }
      }
    }
  };
}
