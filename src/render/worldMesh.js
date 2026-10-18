// Turns a World description into Three.js meshes.
// Mapping: world (x, y) on the ground -> three (x, height, y).
import * as THREE from "three";
import { mergeVertices } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { offsetPolyline, toWorld, polylineLength } from "../sim/geom.js";
import { asphaltTexture, grassTexture, concreteTexture, signTexture, textTexture, facadeTexture } from "./textures.js";

const Y_ROAD = 0.0, Y_PAD = 0.006, Y_PAINT = 0.016, Y_LINE = 0.02;

// Ribbon along a polyline, sampling terrain height; UVs are planar (world x/z).
function ribbon(pts, width, heightAt, yOff, uvScale = 0) {
  const L = offsetPolyline(pts, -width / 2), R = offsetPolyline(pts, width / 2);
  const pos = [], uv = [], idx = [];
  for (let i = 0; i < pts.length; i++) {
    for (const p of [L[i], R[i]]) {
      pos.push(p[0], heightAt(p[0], p[1]) + yOff, p[1]);
      uv.push(uvScale ? p[0] / uvScale : 0, uvScale ? p[1] / uvScale : 0);
    }
    if (i > 0) { const a = (i - 1) * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }   // upward-facing
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

function flatPoly(poly, heightAt, yOff, uvScale = 0) {
  const shape = new THREE.Shape(poly.map(([x, y]) => new THREE.Vector2(x, y)));
  const g = new THREE.ShapeGeometry(shape);
  const p = g.attributes.position;
  const uv = [];
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i);
    p.setXYZ(i, x, heightAt(x, y) + yOff, y);
    uv.push(uvScale ? x / uvScale : 0, uvScale ? y / uvScale : 0);
  }
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  // ShapeGeometry winds for +z normals; after the swap the faces point down, so flip
  const ix = g.index.array;
  for (let i = 0; i < ix.length; i += 3) { const t = ix[i + 1]; ix[i + 1] = ix[i + 2]; ix[i + 2] = t; }
  g.computeVertexNormals();
  return g;
}

function dashed(pts, on, off) {
  const out = [];
  let cur = [], s = 0, draw = true, left = on;
  cur.push(pts[0]);
  for (let i = 1; i < pts.length; i++) {
    let a = pts[i - 1]; const b = pts[i];
    let seg = Math.hypot(b[0] - a[0], b[1] - a[1]);
    while (seg > left) {
      const t = left / seg, q = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
      if (draw) { cur.push(q); out.push(cur); cur = []; } else cur = [q];
      draw = !draw; seg -= left; a = q; left = draw ? on : off;
    }
    left -= seg; if (draw) cur.push(b);
    s += seg;
  }
  if (draw && cur.length > 1) out.push(cur);
  return out;
}

const groundRot = (th) => Math.atan2(-Math.cos(th), -Math.sin(th));

// merge plain BufferGeometries (position/normal/uv, all indexed or all not)
function mergeGeos(geos) {
  const parts = geos.map(g => g.index ? g.toNonIndexed() : g);
  const out = new THREE.BufferGeometry();
  for (const name of ["position", "normal", "uv"]) {
    if (!parts.every(g => g.attributes[name])) continue;
    const size = parts[0].attributes[name].itemSize, arr = new Float32Array(parts.reduce((t, g) => t + g.attributes[name].array.length, 0));
    let o = 0; for (const g of parts) { arr.set(g.attributes[name].array, o); o += g.attributes[name].array.length; }
    out.setAttribute(name, new THREE.BufferAttribute(arr, size));
  }
  return out;
}

export function buildWorldMeshes(W, quality) {
  const group = new THREE.Group();
  const h = (x, y) => W.heightAt(x, y);
  const dyn = { lights: [], peds: [], gantryLamps: [], cones: [], lines: [] };

  const asph = asphaltTexture(), grass = grassTexture(), conc = concreteTexture();
  const asphaltMat = new THREE.MeshStandardMaterial({ map: asph, roughness: 0.92, metalness: 0, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 });
  const padMat = asphaltMat.clone(); padMat.polygonOffsetFactor = -2; padMat.polygonOffsetUnits = -2;
  const concMat = new THREE.MeshStandardMaterial({ map: conc, roughness: 0.95 });
  const paintMat = c => new THREE.MeshStandardMaterial({ color: c, roughness: 0.7, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 });
  const white = paintMat(0xeeece4), yellow = paintMat(0xf2b632);

  // ground
  const b = W.bounds, gw = b.maxX - b.minX + 200, gh = b.maxY - b.minY + 200;
  grass.repeat.set(gw / 6, gh / 6);
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(gw, gh), new THREE.MeshStandardMaterial({ map: grass, roughness: 1 }));
  ground.rotation.x = -Math.PI / 2;
  ground.position.set((b.minX + b.maxX) / 2, -0.02, (b.minY + b.maxY) / 2);
  ground.receiveShadow = true;
  group.add(ground);

  // roads and pads
  for (const r of W.roads) {
    const m = new THREE.Mesh(ribbon(r.pts, r.width + 0.5, h, Y_ROAD, 7), asphaltMat);
    m.receiveShadow = true; group.add(m);
  }
  for (const p of W.pads) {
    if (p.surface === "concrete") {
      const shape = new THREE.Shape(p.poly.map(([x, y]) => new THREE.Vector2(x, -y)));
      const g = new THREE.ExtrudeGeometry(shape, { depth: 0.14, bevelEnabled: false });
      g.rotateX(-Math.PI / 2);
      const m = new THREE.Mesh(g, concMat); m.receiveShadow = true; m.castShadow = true; group.add(m);
    } else {
      const m = new THREE.Mesh(flatPoly(p.poly, h, Y_PAD, 7), padMat); m.receiveShadow = true; group.add(m);
    }
  }

  // painted lines (one material per line so touched lines can flash)
  for (const ln of W.lines) {
    const pieces = ln.dash ? dashed(ln.pts, ln.dash[0], ln.dash[1]) : [ln.pts];
    const mat = (ln.color === "yellow" ? yellow : white).clone();
    for (const pc of pieces) {
      if (pc.length < 2 || polylineLength(pc) < 0.01) continue;
      const m = new THREE.Mesh(ribbon(pc, ln.width, h, Y_LINE), mat);
      m.receiveShadow = true; group.add(m);
    }
    dyn.lines.push({ ln, mat });
  }
  for (const p of W.paint) {
    const m = new THREE.Mesh(flatPoly(p.poly, h, Y_PAINT), p.color === "yellow" ? yellow : white);
    m.receiveShadow = true; group.add(m);
  }
  for (const t of W.texts) {
    const tex = textTexture(t.text, t.color === "yellow" ? "#f2b632" : "#eeece4");
    const m = new THREE.Mesh(new THREE.PlaneGeometry(t.size * 3.2, t.size), new THREE.MeshStandardMaterial({ map: tex, transparent: true, roughness: 0.7, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 }));
    m.rotation.order = "YXZ"; m.rotation.y = groundRot(t.th); m.rotation.x = -Math.PI / 2;
    m.position.set(t.x, h(t.x, t.y) + Y_PAINT + 0.002, t.y);
    group.add(m);
  }

  // estakada side walls and railings
  for (const r of W.ramps) {
    for (const sg of [-1, 1]) {
      const top = [], pos = [];
      for (let s = r.s0; s <= r.s3 + 1e-6; s += 0.5) {
        const [x, y] = toWorld(r.pose, s, sg * r.halfW);
        const hh = W.heightAt(...toWorld(r.pose, s, 0));
        top.push([x, y, hh]);
      }
      for (let i = 1; i < top.length; i++) {
        const a = top[i - 1], c = top[i];
        pos.push(a[0], -0.02, a[1], c[0], -0.02, c[1], c[0], c[2], c[1], a[0], -0.02, a[1], c[0], c[2], c[1], a[0], a[2], a[1]);
      }
      const g = new THREE.BufferGeometry(); g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3)); g.computeVertexNormals();
      const wall = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ map: conc, color: 0xc9c6bd, roughness: 0.9, side: THREE.DoubleSide }));
      wall.castShadow = true; wall.receiveShadow = true; group.add(wall);
      // railing posts
      for (let s = r.s0 + 2; s < r.s3 - 1; s += 2) {
        const [x, y] = toWorld(r.pose, s, sg * (r.halfW + 0.05));
        const hh = W.heightAt(...toWorld(r.pose, s, 0));
        if (hh < 0.3) continue;
        const post = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.8, 0.06), concMat);
        post.position.set(x, hh + 0.4, y); group.add(post);
      }
    }
  }

  // rails
  const steel = new THREE.MeshStandardMaterial({ color: 0x8d9298, roughness: 0.35, metalness: 0.85 });
  const wood = new THREE.MeshStandardMaterial({ color: 0x4a3a2c, roughness: 0.95 });
  for (const r of W.rails) {
    const len = r.l1 - r.l0, mid = (r.l0 + r.l1) / 2;
    for (const ds of [0, 1.52]) {
      const [x, y] = toWorld(r.pose, r.s + ds, mid);
      const rail = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.06, len), steel);
      rail.position.set(x, 0.035, y); rail.rotation.y = -r.pose.th; group.add(rail);
    }
    for (let l = r.l0 + 0.3; l < r.l1; l += 0.65) {
      const [x, y] = toWorld(r.pose, r.s + 0.76, l);
      const sl = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.03, 0.22), wood);
      sl.position.set(x, 0.012, y); sl.rotation.y = -r.pose.th; sl.receiveShadow = true; group.add(sl);
    }
  }

  // cones
  const coneGeo = new THREE.ConeGeometry(0.17, 0.55, 16);
  const coneMat = new THREE.MeshStandardMaterial({ color: 0xff5a1f, roughness: 0.6 });
  for (const c of W.cones) {
    const m = new THREE.Mesh(coneGeo, coneMat); m.position.set(c.x, 0.275, c.y); m.castShadow = true;
    const band = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.13, 0.1, 16), white); band.position.y = 0.04; m.add(band);
    group.add(m); dyn.cones.push({ c, m });
  }

  // signs
  const post = new THREE.MeshStandardMaterial({ color: 0x8a9096, roughness: 0.5, metalness: 0.6 });
  const signCache = {};
  for (const s of W.signs) {
    const g = new THREE.Group();
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 2.3, 8), post); pole.position.y = 1.15; pole.castShadow = true; g.add(pole);
    const tex = signCache[s.kind] || (signCache[s.kind] = signTexture(s.kind));
    const plate = new THREE.Mesh(new THREE.PlaneGeometry(0.7, 0.7), new THREE.MeshStandardMaterial({ map: tex, transparent: true, side: THREE.DoubleSide, roughness: 0.5 }));
    plate.position.y = 2.05; plate.castShadow = true; g.add(plate);
    g.position.set(s.x, 0, s.y); g.rotation.y = Math.atan2(Math.cos(s.th), Math.sin(s.th));
    group.add(g);
  }

  // traffic lights
  const housingMat = new THREE.MeshStandardMaterial({ color: 0x1c1e21, roughness: 0.6 });
  for (const L of W.lights) {
    const g = new THREE.Group();
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.07, 3.0, 10), post); pole.position.y = 1.5; pole.castShadow = true; g.add(pole);
    const box = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.95, 0.3), housingMat); box.position.set(0, 3.1, 0); box.castShadow = true; g.add(box);
    const lamps = {};
    [["red", 0.3, 0xff2a1a], ["yellow", 0, 0xffb81a], ["green", -0.3, 0x2bff6a]].forEach(([k, dy, col]) => {
      const m = new THREE.Mesh(new THREE.CircleGeometry(0.11, 20), new THREE.MeshStandardMaterial({ color: 0x222222, emissive: col, emissiveIntensity: 0.05 }));
      m.position.set(0, 3.1 + dy, 0.152); g.add(m); lamps[k] = m;
      const visor = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.02, 0.12), housingMat); visor.position.set(0, 3.1 + dy + 0.12, 0.2); g.add(visor);
    });
    g.position.set(L.x, 0, L.y); g.rotation.y = Math.atan2(Math.cos(L.th), Math.sin(L.th));
    group.add(g); dyn.lights.push({ L, lamps });
  }

  // alarm gantries
  for (const gt of W.gantries) {
    const g = new THREE.Group();
    for (const sg of [-1, 1]) {
      const p = new THREE.Mesh(new THREE.BoxGeometry(0.15, 4.6, 0.15), post); p.position.set(0, 2.3, sg * gt.width / 2); p.castShadow = true; g.add(p);
    }
    const bar = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.3, gt.width + 0.2), housingMat); bar.position.set(0, 4.5, 0); g.add(bar);
    for (const z of [-0.8, 0.8]) {
      const m = new THREE.Mesh(new THREE.CircleGeometry(0.16, 20), new THREE.MeshStandardMaterial({ color: 0x220000, emissive: 0xff2010, emissiveIntensity: 0.05 }));
      m.position.set(-0.16, 4.5, z); m.rotation.y = -Math.PI / 2; g.add(m); dyn.gantryLamps.push(m);
    }
    g.position.set(gt.x, 0, gt.y); g.rotation.y = -gt.th;
    group.add(g);
  }

  // pedestrians
  for (const p of W.peds) {
    const g = new THREE.Group();
    const cloth = new THREE.MeshStandardMaterial({ color: 0x3f6fd8, roughness: 0.8 });
    const skin = new THREE.MeshStandardMaterial({ color: 0xd9b28c, roughness: 0.8 });
    const pants = new THREE.MeshStandardMaterial({ color: 0x2a2d33, roughness: 0.9 });
    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.6, 0.42), cloth); torso.position.y = 1.2; g.add(torso);
    const headM = new THREE.Mesh(new THREE.SphereGeometry(0.12, 16, 12), skin); headM.position.y = 1.65; g.add(headM);
    const legs = [];
    for (const z of [-0.1, 0.1]) {
      const pivot = new THREE.Group(); pivot.position.set(0, 0.9, z);
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.88, 0.14), pants); leg.position.y = -0.44; pivot.add(leg);
      g.add(pivot); legs.push(pivot);
    }
    g.traverse(o => { if (o.isMesh) o.castShadow = true; });
    group.add(g); dyn.peds.push({ p, g, legs });
  }

  // surroundings: trees, building, perimeter fence
  const rand = (() => { let s = 12345; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); })();
  // coarse 1 m grid of everything paved (roads with their width, pads), for the grass
  const paved = new Set(), cell = (x, y) => Math.floor(x) + "," + Math.floor(y);
  const mark = (x, y, r) => { for (let i = Math.floor(x - r); i <= Math.ceil(x + r); i++) for (let j = Math.floor(y - r); j <= Math.ceil(y + r); j++) if ((i + 0.5 - x) ** 2 + (j + 0.5 - y) ** 2 <= r * r) paved.add(i + "," + j); };
  for (const r of W.roads) for (let k = 0; k < r.pts.length; k++) {
    const a = r.pts[k], c = r.pts[Math.min(k + 1, r.pts.length - 1)], L = Math.hypot(c[0] - a[0], c[1] - a[1]), n = Math.max(1, Math.ceil(L));
    for (let t = 0; t < n; t++) mark(a[0] + (c[0] - a[0]) * t / n, a[1] + (c[1] - a[1]) * t / n, r.width / 2 + 0.8);
  }
  for (const p of W.pads) { const xs = p.poly.map(q => q[0]), ys = p.poly.map(q => q[1]); for (let i = Math.floor(Math.min(...xs)) - 1; i <= Math.max(...xs) + 1; i++) for (let j = Math.floor(Math.min(...ys)) - 1; j <= Math.max(...ys) + 1; j++) paved.add(i + "," + j); }
  const nearRoad = (x, y) => paved.has(cell(x, y));
  const occupied = (x, y) => {
    for (let i = 0; i < W.routePts.length; i += 3) { const p = W.routePts[i]; if (Math.abs(p[0] - x) < 9 && Math.abs(p[1] - y) < 9 && Math.hypot(p[0] - x, p[1] - y) < 9) return true; }
    for (const p of W.pads) { const xs = p.poly.map(q => q[0]), ys = p.poly.map(q => q[1]); if (x > Math.min(...xs) - 5 && x < Math.max(...xs) + 5 && y > Math.min(...ys) - 5 && y < Math.max(...ys) + 5) return true; }
    if (Math.abs(x) < 40 && Math.abs(y) < 40) return true;
    return false;
  };
  // trees: a trunk and a canopy of three lumpy blobs, each instance tinted a little
  // differently; grass tufts scattered over the fields; lamp posts along the outer road
  const nTrees = quality === "low" ? 70 : 220;
  const trunkGeo = new THREE.CylinderGeometry(0.1, 0.2, 2.4, 7);
  const lump = (r, x, y, z, seed) => {
    const g = new THREE.IcosahedronGeometry(r, 2), p = g.attributes.position, v = new THREE.Vector3();
    for (let i = 0; i < p.count; i++) {
      v.fromBufferAttribute(p, i);
      const n = 1 + 0.16 * Math.sin(v.x * 3.1 + seed) * Math.sin(v.y * 2.7 + seed * 2) * Math.sin(v.z * 3.3 + seed * 3);
      p.setXYZ(i, v.x * n + x, v.y * n * 0.85 + y, v.z * n + z);
    }
    return g;
  };
  const crownGeo = mergeGeos([lump(1.5, 0, 0, 0, 1), lump(1.1, 0.9, -0.35, 0.4, 2), lump(1.05, -0.75, -0.25, -0.55, 3), lump(0.9, 0.1, 0.75, -0.2, 4)]);
  // shared vertices so the canopy shades smoothly instead of in facets
  const crownSmooth = mergeVertices(crownGeo, 1e-3); crownSmooth.computeVertexNormals();
  const trunks = new THREE.InstancedMesh(trunkGeo, new THREE.MeshStandardMaterial({ color: 0x5a4430, roughness: 1 }), nTrees);
  const crowns = new THREE.InstancedMesh(crownSmooth, new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.95 }), nTrees);
  const mtx = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), v = new THREE.Vector3(), col = new THREE.Color();
  let placed = 0;
  for (let tries = 0; tries < nTrees * 30 && placed < nTrees; tries++) {
    const x = b.minX - 20 + rand() * (b.maxX - b.minX + 40), y = b.minY - 20 + rand() * (b.maxY - b.minY + 40);
    if (occupied(x, y)) continue;
    const s = 0.8 + rand() * 0.8;
    mtx.compose(v.set(x, 1.2 * s, y), q.identity(), sc.set(s, s, s)); trunks.setMatrixAt(placed, mtx);
    mtx.compose(v.set(x, 3.0 * s, y), q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), rand() * 6), sc.set(s, s * (0.9 + rand() * 0.4), s)); crowns.setMatrixAt(placed, mtx);
    crowns.setColorAt(placed, col.setHSL(0.24 + rand() * 0.07, 0.42 + rand() * 0.2, 0.22 + rand() * 0.1));
    placed++;
  }
  trunks.count = crowns.count = placed;
  trunks.castShadow = crowns.castShadow = true; crowns.receiveShadow = true;
  group.add(trunks, crowns);

  if (quality !== "low") {
    // grass tufts: a few thin blades per tuft, thousands of them, no shadows
    const blade = new THREE.ConeGeometry(0.025, 0.32, 3); blade.translate(0, 0.16, 0);
    const tuftParts = [];
    for (let k = 0; k < 5; k++) { const g = blade.clone(); g.rotateZ((k - 2) * 0.22); g.rotateY(k * 1.3); g.translate((k - 2) * 0.03, 0, (k % 2) * 0.03); tuftParts.push(g); }
    const tuftGeo = mergeGeos(tuftParts);
    const nTufts = 6000;
    const tufts = new THREE.InstancedMesh(tuftGeo, new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1 }), nTufts);
    let n = 0;
    for (let tries = 0; tries < nTufts * 4 && n < nTufts; tries++) {
      const x = b.minX - 10 + rand() * (b.maxX - b.minX + 20), y = b.minY - 10 + rand() * (b.maxY - b.minY + 20);
      if (nearRoad(x, y, 2.2)) continue;
      const s = 0.7 + rand() * 0.9;
      mtx.compose(v.set(x, -0.02, y), q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), rand() * 6), sc.set(s, s * (0.8 + rand() * 0.6), s)); tufts.setMatrixAt(n, mtx);
      tufts.setColorAt(n, col.setHSL(0.23 + rand() * 0.06, 0.5, 0.16 + rand() * 0.1)); n++;
    }
    tufts.count = n; group.add(tufts);
  }

  if (W.name === "full") {
    const bld = new THREE.Mesh(new THREE.BoxGeometry(34, 9, 12), [concMat, concMat, new THREE.MeshStandardMaterial({ color: 0x9aa3ab }), concMat,
      new THREE.MeshStandardMaterial({ map: facadeTexture() }), concMat]);
    bld.position.set(40, 4.5, 162); bld.castShadow = true; bld.receiveShadow = true; group.add(bld);
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(14, 2.2), new THREE.MeshBasicMaterial({ map: textTexture("IMTIHON MARKAZI", "#1f4f8a", 1024, 160), transparent: true }));
    sign.position.set(40, 7.6, 155.9); sign.rotation.y = Math.PI; group.add(sign);
  }
  const fenceMat = new THREE.MeshStandardMaterial({ color: 0xbfc3c7, roughness: 0.6, metalness: 0.4 });
  const fx0 = b.minX - 8, fx1 = b.maxX + 8, fy0 = b.minY - 8, fy1 = b.maxY + 8;
  for (const [x0, y0, x1, y1] of [[fx0, fy0, fx1, fy0], [fx1, fy0, fx1, fy1], [fx1, fy1, fx0, fy1], [fx0, fy1, fx0, fy0]]) {
    const len = Math.hypot(x1 - x0, y1 - y0);
    const f = new THREE.Mesh(new THREE.BoxGeometry(len, 1.8, 0.05), fenceMat);
    f.position.set((x0 + x1) / 2, 0.9, (y0 + y1) / 2); f.rotation.y = -Math.atan2(y1 - y0, x1 - x0);
    group.add(f);
  }

  return { group, dyn };
}

export function updateWorldMeshes(W, dyn, clock, now) {
  for (const { L, lamps } of dyn.lights) {
    const [st] = W.lightState(L.axis, clock);
    for (const k of ["red", "yellow", "green"]) lamps[k].material.emissiveIntensity = st === k ? 3.2 : 0.04;
  }
  const lit = W.alarm && Math.floor(now / 260) % 2 === 0;
  for (const m of dyn.gantryLamps) m.material.emissiveIntensity = lit ? 4 : 0.05;
  for (const { p, g, legs } of dyn.peds) {
    g.visible = p.visible;
    g.position.set(p.x, 0, p.y); g.rotation.y = -p.th;
    const sw = p.walking ? Math.sin(p.phase * 7) * 0.45 : 0;
    legs[0].rotation.z = sw; legs[1].rotation.z = -sw;
  }
  for (const { c, m } of dyn.cones) if (c.hit && m.rotation.z === 0) { m.rotation.z = 1.4; m.position.y = 0.15; }
  for (const { ln, mat } of dyn.lines) {
    const hot = clock - ln.flash < 0.8;
    if (hot !== !!mat.userData.hot) { mat.userData.hot = hot; mat.color.set(hot ? 0xff3b1f : (ln.color === "yellow" ? 0xf2b632 : 0xeeece4)); }
  }
}
