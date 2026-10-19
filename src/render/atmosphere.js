// Weather and time of day: the sky, the sun and its shadows, the fog, the reflections, wet roads,
// rain, the street lamps and the car's headlights in the evening.
import * as THREE from "three";

const dir = (polar, azimuth) => new THREE.Vector3().setFromSphericalCoords(1, THREE.MathUtils.degToRad(polar), THREE.MathUtils.degToRad(azimuth));

// sky (scattering), sun, ambient light, fog [colour, near, far] (null: the clear-day haze) and how wet the roads are
const SKY = {
  clear: { turbidity: 2.2, rayleigh: 0.9, mieCoefficient: 0.003, mieDirectionalG: 0.85 },
  cloudy: { turbidity: 12, rayleigh: 0.5, mieCoefficient: 0.02, mieDirectionalG: 0.7 },
  evening: { turbidity: 6, rayleigh: 2.4, mieCoefficient: 0.006, mieDirectionalG: 0.9 }
};
export function atmosphereFor(weather = "clear", time = "day") {
  const evening = time === "evening";
  const a = {
    sunDir: evening ? dir(81, 245) : dir(52, 135),       // evening: low in the west, long shadows
    sunColor: evening ? 0xffa45c : 0xfff1dc, sun: evening ? 1.5 : 3.6,
    hemiSky: evening ? 0x8a9ccc : 0xdfeaff, hemiGround: evening ? 0x3a3a34 : 0x5a6a3e, hemi: evening ? 0.55 : 1.3,
    sky: evening ? SKY.evening : SKY.clear, background: null, env: evening ? 0.45 : 0.75,
    fog: [evening ? 0x8e8a9a : 0xb7cbe0, 180, 600], wet: 0, rain: false, lights: evening
  };
  if (weather === "cloudy") Object.assign(a, { sky: SKY.cloudy, sun: a.sun * 0.45, hemi: a.hemi * 1.15, env: a.env * 0.9, fog: [evening ? 0x6f7380 : 0xaeb6c0, 120, 520] });
  if (weather === "rain") {
    const c = evening ? 0x4a5058 : 0x8d949c;
    Object.assign(a, { sky: SKY.cloudy, background: c, sun: a.sun * 0.22, hemi: a.hemi * 1.1, env: a.env * 0.8, fog: [c, 25, 260], wet: 1, rain: true, lights: true });
  }
  if (weather === "fog") {
    const c = evening ? 0x6b6e74 : 0xc4c9ce;
    Object.assign(a, { sky: SKY.cloudy, background: c, sun: a.sun * 0.3, hemi: a.hemi * 1.2, env: a.env * 0.8, fog: [c, 4, 90], lights: true });
  }
  return a;
}

// how well the tyres hold (brakes, the sharpest turn): a wet road holds about two thirds as well
export const gripFor = weather => (weather === "rain" ? 0.68 : 1);

// Rain: streaks falling round the camera (none inside the car's own box)
export class Rain {
  constructor(n = 2600) {
    this.n = n; this.size = [44, 22, 44];
    const pos = new Float32Array(n * 6);
    this.geo = new THREE.BufferGeometry(); this.geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    this.mesh = new THREE.LineSegments(this.geo, new THREE.LineBasicMaterial({ color: 0xb4bfcc, transparent: true, opacity: 0.38, depthWrite: false, fog: true }));
    this.mesh.frustumCulled = false; this.mesh.renderOrder = 5;
    this.drops = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) this.spawn(i, Math.random() * this.size[1]);
    this.at = new THREE.Vector3();
  }
  spawn(i, y) {
    const [w, , d] = this.size;
    this.drops[i * 3] = (Math.random() - 0.5) * w; this.drops[i * 3 + 1] = y; this.drops[i * 3 + 2] = (Math.random() - 0.5) * d;
  }
  // centre: the camera; car: [x, z] of the car's middle (the cabin stays dry)
  update(dt, centre, car) {
    const p = this.geo.attributes.position.array, D = this.drops, fall = 11 * dt, [w, h, d] = this.size;
    this.at.copy(centre);
    for (let i = 0; i < this.n; i++) {
      let y = D[i * 3 + 1] - fall;
      if (y < 0) { this.spawn(i, h + y); y = D[i * 3 + 1]; }
      D[i * 3 + 1] = y;
      // the box moves with the camera: the drops wrap round it
      let x = ((D[i * 3] + w / 2 - centre.x) % w + w) % w - w / 2 + centre.x, z = ((D[i * 3 + 2] + d / 2 - centre.z) % d + d) % d - d / 2 + centre.z;
      const wy = centre.y - 6 + y;
      if (car && Math.abs(x - car[0]) < 2.6 && Math.abs(z - car[1]) < 2.6 && wy < car[2] + 1.7) x += x > car[0] ? 2.6 : -2.6;
      p[i * 6] = x; p[i * 6 + 1] = wy; p[i * 6 + 2] = z;
      p[i * 6 + 3] = x + 0.03; p[i * 6 + 4] = wy + 0.42; p[i * 6 + 5] = z + 0.02;
    }
    this.geo.attributes.position.needsUpdate = true;
  }
}
