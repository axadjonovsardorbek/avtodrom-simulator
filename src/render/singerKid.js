// Training-mode easter egg: stop at the pedestrian crossing and a little boy in a
// striped hoodie walks up to the driver's window and sings "Sedayanoch"
// (public/sedayanoch.mp3, from 0:03). Drive off and he goes back to the kerb.
import * as THREE from "three";
import { toWorld, toLocal, inPoly } from "../sim/geom.js";

const SONG = "sedayanoch.mp3", SONG_FROM = 3;

function stripes() {
  const c = document.createElement("canvas"); c.width = 16; c.height = 128;
  const g = c.getContext("2d");
  const bands = ["#f1ead6", "#e9b828", "#4a3b31", "#f1ead6", "#e9b828", "#4a3b31", "#f1ead6", "#e9b828"];
  bands.forEach((col, i) => { g.fillStyle = col; g.fillRect(0, i * 16, 16, 16); });
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(1, 2.2);
  return t;
}
const cap = (r, len, mat) => new THREE.Mesh(new THREE.CapsuleGeometry(r, len, 6, 12), mat);
const ball = (r, mat, pos, scale) => { const m = new THREE.Mesh(new THREE.SphereGeometry(r, 18, 12), mat); m.position.set(...pos); if (scale) m.scale.set(...scale); return m; };

// a boy about 1.15 m tall; x forward, y up, origin between the feet
export function buildKid() {
  const M = {
    hoodie: new THREE.MeshStandardMaterial({ map: stripes(), roughness: 0.95 }),
    cream: new THREE.MeshStandardMaterial({ color: 0xf1ead6, roughness: 0.95 }),
    pants: new THREE.MeshStandardMaterial({ color: 0x6f7378, roughness: 0.95 }),
    shoe: new THREE.MeshStandardMaterial({ color: 0x2b2b2e, roughness: 0.7 }),
    skin: new THREE.MeshStandardMaterial({ color: 0xc89470, roughness: 0.75 }),
    hair: new THREE.MeshStandardMaterial({ color: 0x3b2a1f, roughness: 0.9 }),
    eye: new THREE.MeshStandardMaterial({ color: 0x1c140f, roughness: 0.3 }),
    white: new THREE.MeshStandardMaterial({ color: 0xf4f1ea, roughness: 0.4 }),
    mouth: new THREE.MeshStandardMaterial({ color: 0x5a1f1c, roughness: 0.8 }),
    badge: new THREE.MeshStandardMaterial({ color: 0x3f8fd9, roughness: 0.6 })
  };
  const root = new THREE.Group(); root.name = "singer_kid";
  const body = new THREE.Group(); root.add(body);
  const legs = [-1, 1].map(s => {
    const hip = new THREE.Group(); hip.position.set(0, 0.5, s * 0.075); body.add(hip);
    const leg = cap(0.055, 0.36, M.pants); leg.position.y = -0.23; hip.add(leg);
    const shoe = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.06, 0.08), M.shoe); shoe.position.set(0.03, -0.47, 0); hip.add(shoe);
    return hip;
  });
  const torso = cap(0.15, 0.22, M.hoodie); torso.position.y = 0.72; torso.scale.set(0.8, 1, 1); body.add(torso);
  const pocket = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.08, 0.16), M.hoodie); pocket.position.set(0.12, 0.62, 0); body.add(pocket);
  const badge = ball(0.025, M.badge, [0.125, 0.78, 0.07], [0.4, 1, 1]); body.add(badge);   // the cartoon cat on the chest
  const hood = new THREE.Mesh(new THREE.TorusGeometry(0.085, 0.034, 10, 20), M.cream);
  hood.position.set(-0.02, 0.92, 0); hood.rotation.set(Math.PI / 2, 0.35, 0); body.add(hood);
  for (const s of [-1, 1]) { const st = cap(0.006, 0.12, M.cream); st.position.set(0.1, 0.84, s * 0.035); body.add(st); }
  const arms = [-1, 1].map(s => {
    const sh = new THREE.Group(); sh.position.set(0, 0.86, s * 0.17); body.add(sh);
    const up = cap(0.045, 0.16, M.hoodie); up.position.y = -0.1; sh.add(up);
    const el = new THREE.Group(); el.position.y = -0.21; sh.add(el);
    const fo = cap(0.04, 0.13, M.hoodie); fo.position.y = -0.08; el.add(fo);
    el.add(ball(0.038, M.skin, [0, -0.19, 0]));
    return { sh, el };
  });
  const head = new THREE.Group(); head.position.set(0, 1.0, 0); body.add(head);
  head.add(ball(0.12, M.skin, [0, 0.08, 0], [0.95, 1.05, 0.95]));
  head.add(ball(0.125, M.hair, [-0.015, 0.12, 0], [1, 0.95, 1.02]));            // short messy hair
  const fringe = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, 0.2), M.hair); fringe.position.set(0.085, 0.17, 0); fringe.rotation.z = -0.5; head.add(fringe);
  for (const s of [-1, 1]) {
    head.add(ball(0.022, M.white, [0.1, 0.095, s * 0.04], [0.6, 0.8, 1]));
    head.add(ball(0.013, M.eye, [0.113, 0.095, s * 0.04]));
    head.add(ball(0.025, M.skin, [0, 0.085, s * 0.115], [0.5, 1, 0.5]));        // ears
  }
  head.add(ball(0.018, M.skin, [0.118, 0.065, 0]));                              // nose
  const mouth = ball(0.02, M.mouth, [0.108, 0.025, 0], [0.4, 0.4, 1.3]); head.add(mouth);
  root.traverse(o => { if (o.isMesh) o.castShadow = true; });

  let t = 0;
  return {
    root,
    // state: "walk" | "sing" | "idle"
    update(dt, state) {
      t += dt;
      const walk = state === "walk", sing = state === "sing";
      const sw = walk ? Math.sin(t * 9) * 0.5 : 0;
      legs[0].rotation.z = sw; legs[1].rotation.z = -sw;
      arms[0].sh.rotation.z = walk ? -sw * 0.6 : sing ? 0.3 + Math.sin(t * 4) * 0.15 : 0.05;
      arms[1].sh.rotation.z = walk ? sw * 0.6 : sing ? 0.9 + Math.sin(t * 4 + 1) * 0.35 : 0.05;  // waves one hand while singing
      arms[1].sh.rotation.x = sing ? 0.35 : 0;
      arms[0].el.rotation.z = sing ? 1.0 : 0.2; arms[1].el.rotation.z = sing ? 1.3 : 0.2;
      body.position.y = walk ? Math.abs(Math.sin(t * 9)) * 0.025 : sing ? Math.abs(Math.sin(t * 5)) * 0.03 : 0;
      body.rotation.x = sing ? Math.sin(t * 2.5) * 0.08 : 0;                     // sways to the song
      head.rotation.x = sing ? Math.sin(t * 2.5 + 0.6) * 0.15 : 0;
      head.rotation.z = sing ? 0.12 + Math.sin(t * 3.1) * 0.05 : 0;               // looks up at the driver
      mouth.scale.y = sing ? 0.4 + Math.abs(Math.sin(t * 15) * Math.sin(t * 4.7)) * 1.4 : 0.4;
    }
  };
}

// Decides when the boy comes and goes; lives outside the exam logic (it never penalises).
export class KidShow {
  constructor(scene, audio) {
    this.audio = audio;
    this.kid = buildKid();
    this.kid.root.visible = false;
    scene.add(this.kid.root);
    this.reset(null);
  }
  reset(session, enabled = false) {
    this.session = session; this.enabled = enabled;
    this.state = "away"; this.used = false; this.still = 0;
    this.stopSong(0);
    this.kid.root.visible = false;
  }
  stopSong(fade = 0.6) { if (this.song) { this.song.stop(fade); this.song = null; } }

  update(dt) {
    const s = this.session, kid = this.kid;
    if (!s || !this.enabled) return;
    const car = s.car, task = s.currentTask;
    const W = s.W;
    // which crossing: the active piyoda task's frame
    const pose = task && task.id === "piyoda" ? task.pose : this.pose;
    if (task && task.id === "piyoda") this.pose = task.pose;
    if (this.state === "away") {
      if (this.used || !pose || s.state !== "running") return;
      const [cs] = toLocal(pose, car.x, car.y);
      this.still = Math.abs(car.v) < 0.1 && cs > 2 && cs < 17 ? this.still + dt : 0;
      if (this.still < 1.2) return;
      // start on the left pavement, abreast of the car
      this.used = true; this.state = "come";
      const [x, y] = toWorld(pose, Math.min(cs + 1, 22), -4.9);
      this.pos = [x, y]; kid.root.visible = true;
    }
    const win = toWorld(car, 1.25, -1.45);          // next to the driver's door
    const target = this.state === "leave" ? this.home : win;
    const dx = target[0] - this.pos[0], dy = target[1] - this.pos[1], d = Math.hypot(dx, dy);
    if (this.state === "come" || this.state === "leave") {
      const step = Math.min(d, 1.3 * dt);
      if (d > 0.02) { this.pos[0] += dx / d * step; this.pos[1] += dy / d * step; this.th = Math.atan2(dy, dx); }
      if (this.state === "come" && d < 0.08) {
        this.state = "sing";
        this.song = this.audio.song(SONG, SONG_FROM, () => { if (this.state === "sing") this.goHome(); });
      }
      if (this.state === "leave" && d < 0.08) { this.state = "gone"; kid.root.visible = false; }
    }
    if (this.state === "sing") {
      this.th = Math.atan2(car.y - this.pos[1] + Math.sin(car.th) * 1.3, car.x - this.pos[0] + Math.cos(car.th) * 1.3);
      if (Math.abs(car.v) > 0.6 || d > 1.5) { this.stopSong(); this.goHome(); }
    }
    if (this.state === "come" && Math.abs(car.v) > 2) this.goHome();
    // pavements are raised 0.14 m (see worldMesh.js)
    const kerb = W.pads.some(p => p.surface === "concrete" && inPoly(p.poly, this.pos)) ? 0.14 : 0;
    kid.root.position.set(this.pos[0], kerb + W.heightAt(this.pos[0], this.pos[1]), this.pos[1]);
    kid.root.rotation.y = -(this.th || 0);
    kid.update(dt, this.state === "sing" ? "sing" : this.state === "gone" ? "idle" : "walk");
  }
  goHome() {
    this.state = "leave";
    const [s] = toLocal(this.pose, this.pos[0], this.pos[1]);
    this.home = toWorld(this.pose, s, -5.2);
  }
}
