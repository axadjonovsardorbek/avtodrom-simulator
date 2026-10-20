// Many rays against big meshes at once. Each mesh's triangles are read once and every ray is
// tested against each of them (Möller–Trumbore on plain arrays), after a cheap test against the
// mesh's bounding box. three's Raycaster walks every triangle again for every ray, with an object
// per vertex: the roof sign, the plates and the rear window of one car model (a few dozen to some
// hundreds of rays over 300 000 triangles) took it about half a second, a visible stall.
import * as THREE from "three";

const box = new THREE.Box3(), inv = new THREE.Matrix4(), ray = new THREE.Ray(), v = new THREE.Vector3();

// rays: [{ origin: Vector3, dir: Vector3 (unit) }] in world space. Returns per ray the nearest hit
// { point, normal (world, the face's), object, material } or null; `accept(material)` skips the rest.
export function castRays(meshes, rays, accept) {
  const best = rays.map(() => null), bestT = rays.map(() => Infinity);
  for (const o of meshes) {
    const g = o.geometry, pos = g && g.attributes.position;
    if (!pos) continue;
    const mats = [].concat(o.material);
    if (accept && !mats.some(accept)) continue;
    if (!g.boundingBox) g.computeBoundingBox();
    inv.copy(o.matrixWorld).invert();
    // the rays in the mesh's own frame; those that miss its box are left out
    const R = [];
    for (let k = 0; k < rays.length; k++) {
      ray.origin.copy(rays[k].origin).applyMatrix4(inv);
      ray.direction.copy(rays[k].dir).transformDirection(inv);
      const scale = v.copy(rays[k].origin).add(rays[k].dir).applyMatrix4(inv).sub(ray.origin).length();   // local units per metre
      if (!ray.intersectsBox(box.copy(g.boundingBox).expandByScalar(1e-4))) continue;
      R.push({ k, ox: ray.origin.x, oy: ray.origin.y, oz: ray.origin.z, dx: ray.direction.x, dy: ray.direction.y, dz: ray.direction.z, scale });
    }
    if (!R.length) continue;
    const n = pos.count, P = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { P[3 * i] = pos.getX(i); P[3 * i + 1] = pos.getY(i); P[3 * i + 2] = pos.getZ(i); }
    const idx = g.index ? g.index.array : null, tris = (idx ? idx.length : n) / 3;
    const groups = g.groups.length ? g.groups : [{ start: 0, count: tris * 3, materialIndex: 0 }];
    for (const grp of groups) {
      const mat = mats[grp.materialIndex] || mats[0];
      if (accept && !accept(mat)) continue;
      const t0 = grp.start / 3, t1 = Math.min(tris, (grp.start + grp.count) / 3);
      for (let t = t0; t < t1; t++) {
        const a = 3 * (idx ? idx[3 * t] : 3 * t), b = 3 * (idx ? idx[3 * t + 1] : 3 * t + 1), c = 3 * (idx ? idx[3 * t + 2] : 3 * t + 2);
        const ax = P[a], ay = P[a + 1], az = P[a + 2];
        const e1x = P[b] - ax, e1y = P[b + 1] - ay, e1z = P[b + 2] - az, e2x = P[c] - ax, e2y = P[c + 1] - ay, e2z = P[c + 2] - az;
        for (const r of R) {
          const px = r.dy * e2z - r.dz * e2y, py = r.dz * e2x - r.dx * e2z, pz = r.dx * e2y - r.dy * e2x;
          const det = e1x * px + e1y * py + e1z * pz;
          if (det > -1e-12 && det < 1e-12) continue;
          const f = 1 / det, sx = r.ox - ax, sy = r.oy - ay, sz = r.oz - az;
          const u = f * (sx * px + sy * py + sz * pz);
          if (u < 0 || u > 1) continue;
          const qx = sy * e1z - sz * e1y, qy = sz * e1x - sx * e1z, qz = sx * e1y - sy * e1x;
          const w = f * (r.dx * qx + r.dy * qy + r.dz * qz);
          if (w < 0 || u + w > 1) continue;
          const d = f * (e2x * qx + e2y * qy + e2z * qz) / r.scale;   // distance in world units
          if (d <= 1e-6 || d >= bestT[r.k]) continue;
          bestT[r.k] = d;
          best[r.k] = { object: o, material: mat, local: [ax + e1x * u + e2x * w, ay + e1y * u + e2y * w, az + e1z * u + e2z * w], ln: [e1y * e2z - e1z * e2y, e1z * e2x - e1x * e2z, e1x * e2y - e1y * e2x] };
        }
      }
    }
  }
  const nm = new THREE.Matrix3();
  return best.map(h => h && {
    object: h.object, material: h.material,
    point: new THREE.Vector3(...h.local).applyMatrix4(h.object.matrixWorld),
    normal: new THREE.Vector3(...h.ln).applyMatrix3(nm.getNormalMatrix(h.object.matrixWorld)).normalize()
  });
}
