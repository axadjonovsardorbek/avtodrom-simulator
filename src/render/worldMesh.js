// Turns a World description into Three.js meshes.
// Mapping: world (x, y) on the ground -> three (x, height, y).
import * as THREE from "three";
import { mergeVertices, mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { offsetPolyline, untangle, toWorld, polylineLength } from "../sim/geom.js";
import { asphaltTexture, grassTexture, concreteTexture, signTexture, textTexture, facadeTexture, bushTexture } from "./textures.js";

const Y_ROAD = 0.0, Y_PAD = 0.006, Y_PAINT = 0.05, Y_LINE = 0.055;      // the plan's layers (grass, kerb band, pads) lie between 0.02 and 0.04

// many small static meshes with one material become one draw call
function addMerged(group, geos, mat, shadow = true) {
  if (!geos.length) return;
  const g = geos.length === 1 ? geos[0] : mergeGeometries(geos, false);
  if (geos.length > 1) geos.forEach(x => x.dispose());
  const m = new THREE.Mesh(g, mat); m.receiveShadow = shadow; group.add(m);
}

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

// blocks of flats round the exam ground: [x, y, width, depth, height]
const BLOCKS_AROUND = [[-30, -98, 46, 18, 22], [32, -100, 40, 16, 28], [-112, -20, 18, 50, 24], [-110, 45, 16, 40, 18], [112, -10, 18, 46, 30], [110, 55, 16, 36, 22], [-20, 95, 50, 16, 20], [45, 98, 34, 16, 26]];

export function buildWorldMeshes(W, quality) {
  const group = new THREE.Group();
  const h = (x, y) => W.heightAt(x, y);
  const dyn = { lights: [], peds: [], gantryLamps: [], cones: [], lines: [] };
  W.solids = (W.baseSolids || []).slice(); W.solidGrid = null;     // the kerbs of the plan are already there
  const solid = (x, y, r) => W.solids.push([x, y, r]);
  const wall = (x0, y0, x1, y1, r = 0.2, step = 0.7) => { const L = Math.hypot(x1 - x0, y1 - y0), n = Math.max(1, Math.ceil(L / step)); for (let i = 0; i <= n; i++) solid(x0 + (x1 - x0) * i / n, y0 + (y1 - y0) * i / n, r); };

  const asph = asphaltTexture(), grass = grassTexture(), conc = concreteTexture();
  const asphaltMat = new THREE.MeshStandardMaterial({ map: asph, roughness: 0.92, metalness: 0, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 });
  const padMat = asphaltMat.clone(); padMat.polygonOffsetFactor = -2; padMat.polygonOffsetUnits = -2;
  const concMat = new THREE.MeshStandardMaterial({ map: conc, roughness: 0.95 });
  // the exercise lanes are asphalt like the roads (a shade lighter, newer); their white edge lines are painted over them
  const padLightMat = new THREE.MeshStandardMaterial({ map: asph, color: 0xd8dce0, roughness: 0.9, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 });
  const paintMat = c => new THREE.MeshStandardMaterial({ color: c, roughness: 0.7, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 });
  const white = paintMat(0xeeece4), yellow = paintMat(0xf2b632);

  // ground
  const b = W.bounds, gw = b.maxX - b.minX + 200, gh = b.maxY - b.minY + 200;
  grass.repeat.set(gw / 6, gh / 6);
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(gw, gh), new THREE.MeshStandardMaterial({ map: grass, roughness: 1 }));
  ground.rotation.x = -Math.PI / 2;
  ground.position.set((b.minX + b.maxX) / 2, W.board ? -0.15 : -0.02, (b.minY + b.maxY) / 2);   // well below the asphalt of the plan: seen from high up the two would fight
  ground.receiveShadow = true;
  group.add(ground);

  // the plan of the exam ground (src/world/board.js): asphalt everywhere, the islands with kerbs, the pale pads
  if (W.board) {
    const bd = W.board, grassTex = grassTexture(), islandMat = new THREE.MeshStandardMaterial({ map: grassTex, roughness: 1, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
    const kerbMat = new THREE.MeshStandardMaterial({ color: 0xdcdad3, roughness: 0.85 });
    const frame = new THREE.Mesh(flatPoly(bd.frame, h, Y_ROAD, 7), asphaltMat); frame.receiveShadow = true; group.add(frame);
    // asphalt; the islands raised 10 cm inside a 12 cm kerb; the pads (cut out of the islands) at road level, painted pale
    const flatShape = (shape, y) => { const g = new THREE.ShapeGeometry(shape); const p = g.attributes.position, uv = [];
      for (let i = 0; i < p.count; i++) { const x = p.getX(i), z = -p.getY(i); p.setXYZ(i, x, y, z); uv.push(x / 7, z / 7); }
      g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2)); g.computeVertexNormals(); return g; };
    const grassGeos = [], kerbGeos = [];
    for (const isl of bd.islands) {
      const shape = new THREE.Shape(isl.kerb.map(([x, y]) => new THREE.Vector2(x, -y)));
      shape.holes.push(new THREE.Path(isl.grass.map(([x, y]) => new THREE.Vector2(x, -y))));
      const kg = new THREE.ExtrudeGeometry(shape, { depth: 0.17, bevelEnabled: false }); kg.rotateX(-Math.PI / 2);   // a raised kerb round the raised island
      kerbGeos.push(kg.index ? kg.toNonIndexed() : kg);
      grassGeos.push(flatPoly(isl.grass, h, 0.14, 7));
    }
    addMerged(group, grassGeos, islandMat);
    for (const g of kerbGeos) g.deleteAttribute("uv");
    addMerged(group, kerbGeos, kerbMat);
    const padG = bd.pads.map(p => flatPoly(p, h, 0.03, 7));
    addMerged(group, padG, padLightMat);

    // low round bushes on the islands, as on the ground itself
    const inside = (poly, x, y) => { let c = false; for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) if ((poly[i][1] > y) !== (poly[j][1] > y) && x < (poly[j][0] - poly[i][0]) * (y - poly[i][1]) / (poly[j][1] - poly[i][1]) + poly[i][0]) c = !c; return c; };
    const edgeD = (poly, x, y) => { let d = 1e9; for (let i = 0; i < poly.length; i++) { const a = poly[i], b2 = poly[(i + 1) % poly.length], dx = b2[0] - a[0], dy = b2[1] - a[1], L = dx * dx + dy * dy || 1, t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (y - a[1]) * dy) / L)); d = Math.min(d, Math.hypot(a[0] + dx * t - x, a[1] + dy * t - y)); } return d; };
    // a round, leafy shrub: a smooth ball with a lumpy outline, flat underneath
    const bushGeo = (() => { const g = new THREE.IcosahedronGeometry(0.6, quality === "low" ? 1 : 2), p = g.attributes.position, v = new THREE.Vector3(); for (let i = 0; i < p.count; i++) { v.fromBufferAttribute(p, i); const n = 1 + 0.09 * Math.sin(v.x * 9) * Math.sin(v.y * 8 + 1) * Math.sin(v.z * 10 + 2) + 0.05 * Math.sin(v.x * 23 + v.z * 19); p.setXYZ(i, v.x * n, Math.max(-0.05, v.y * n * 0.85), v.z * n); } const m = mergeVertices(g); m.computeVertexNormals(); return m; })();
    const rand = (() => { let s = 777; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); })();
    const spots = [], per = quality === "low" ? 16 : quality === "mid" ? 11 : 8;      // m² of island per bush: the islands are full of them
    for (const isl of bd.islands) {
      const xs = isl.grass.map(q => q[0]), ys = isl.grass.map(q => q[1]), x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
      const n = Math.round((x1 - x0) * (y1 - y0) / per);
      for (let k = 0; k < n * 3 && spots.length < 6000; k++) { const x = x0 + rand() * (x1 - x0), y = y0 + rand() * (y1 - y0); if (inside(isl.grass, x, y) && edgeD(isl.grass, x, y) > 0.9) spots.push([x, y]); if (k > n * 3) break; }
    }
    const bushes = new THREE.InstancedMesh(bushGeo, new THREE.MeshStandardMaterial({ map: bushTexture(), color: 0xffffff, roughness: 0.9 }), spots.length);
    const bm = new THREE.Matrix4(), bq = new THREE.Quaternion(), bs = new THREE.Vector3(), bv = new THREE.Vector3(), bc = new THREE.Color();
    spots.forEach(([x, y], i) => { const s = 1.0 + rand() * 0.7; bm.compose(bv.set(x, 0.12 + 0.3 * s, y), bq.setFromAxisAngle(new THREE.Vector3(0, 1, 0), rand() * 6), bs.set(s, s * (0.8 + rand() * 0.4), s)); bushes.setMatrixAt(i, bm); bushes.setColorAt(i, bc.setHSL(0.26 + rand() * 0.05, 0.42 + rand() * 0.12, 0.30 + rand() * 0.08)); });
    bushes.castShadow = quality === "high"; bushes.receiveShadow = true; group.add(bushes);

    // a mesh fence round the ground, a little way out from its edge
    { const f = bd.frame.map(([x, y]) => [x + Math.sign(x) * 2.5, y + Math.sign(y) * 2.5]), postGeo = new THREE.BoxGeometry(0.08, 2.2, 0.08), posts = [], panels = [];
      const meshMat = new THREE.MeshStandardMaterial({ color: 0x3f5a46, transparent: true, opacity: 0.32, side: THREE.DoubleSide, roughness: 0.8, depthWrite: false });
      for (let i = 0; i < 4; i++) { const a = f[i], c = f[(i + 1) % 4], L = Math.hypot(c[0] - a[0], c[1] - a[1]), n = Math.ceil(L / 3);
        for (let k = 0; k <= n; k++) posts.push([a[0] + (c[0] - a[0]) * k / n, a[1] + (c[1] - a[1]) * k / n]);
        const pl = new THREE.PlaneGeometry(L, 2); pl.rotateY(-Math.atan2(c[1] - a[1], c[0] - a[0])); pl.translate((a[0] + c[0]) / 2, 1.1, (a[1] + c[1]) / 2); panels.push(pl); }
      const pm = new THREE.InstancedMesh(postGeo, new THREE.MeshStandardMaterial({ color: 0x4d5a52, roughness: 0.6, metalness: 0.4 }), posts.length);
      posts.forEach(([x, y], i) => { bm.compose(bv.set(x, 1.1, y), bq.identity(), bs.set(1, 1, 1)); pm.setMatrixAt(i, bm); });
      group.add(pm); addMerged(group, panels, meshMat, false); }

    // blocks of flats beyond the fence, like the ones round the centre
    { const fac = facadeTexture(); fac.wrapS = fac.wrapT = THREE.RepeatWrapping;
      const blocks = BLOCKS_AROUND;
      for (const [x, y, w, d, hgt] of blocks) {
        const mat = new THREE.MeshStandardMaterial({ map: fac.clone(), roughness: 0.85 }); mat.map.repeat.set(Math.max(w, d) / 16, hgt / 9); mat.map.needsUpdate = true;
        const m = new THREE.Mesh(new THREE.BoxGeometry(w, hgt, d), [mat, mat, new THREE.MeshStandardMaterial({ color: 0x8c8f93 }), mat, mat, mat]);
        m.position.set(x, hgt / 2, y); m.castShadow = quality === "high"; group.add(m); wall(x - w / 2, y - d / 2, x + w / 2, y - d / 2, 0.3, 1); wall(x - w / 2, y + d / 2, x + w / 2, y + d / 2, 0.3, 1);
      } }
  }

  // roads and pads
  const roadGeos = [], padGeos = [];
  for (const r of W.roads) {
    const wide = r.shift ? untangle(offsetPolyline(r.pts, r.shift)) : r.pts;      // a road with a second lane beside it: one ribbon, twice as wide
    roadGeos.push(ribbon(wide, r.shift ? r.width * 2 + 0.5 : r.width + 0.5, h, Y_ROAD, 7));
  }
  addMerged(group, roadGeos, asphaltMat);
  for (const p of W.pads) {
    if (p.surface === "concrete") {
      const shape = new THREE.Shape(p.poly.map(([x, y]) => new THREE.Vector2(x, -y)));
      const g = new THREE.ExtrudeGeometry(shape, { depth: 0.14, bevelEnabled: false });
      g.rotateX(-Math.PI / 2);
      const m = new THREE.Mesh(g, concMat); m.receiveShadow = true; m.castShadow = true; group.add(m);
    } else {
      padGeos.push(flatPoly(p.poly, h, Y_PAD, 7));
    }
  }
  addMerged(group, padGeos, padMat);

  // painted lines: all the white ones are one mesh, all the yellow ones another (a touched line flashes in its own overlay, see below)
  const lineGeos = { white: [], yellow: [] }, paintGeos = { white: [], yellow: [] };
  for (const ln of W.lines) {
    if (ln.hidden) { dyn.lines.push({ ln, h, group }); continue; }      // the foot of a kerb: the kerb itself is what one sees
    const pieces = ln.dash ? dashed(ln.pts, ln.dash[0], ln.dash[1]) : [ln.pts];
    for (const pc of pieces) {
      if (pc.length < 2 || polylineLength(pc) < 0.01) continue;
      lineGeos[ln.color === "yellow" ? "yellow" : "white"].push(ribbon(pc, ln.width, h, Y_LINE));
    }
    dyn.lines.push({ ln, h, group });
  }
  addMerged(group, lineGeos.white, white); addMerged(group, lineGeos.yellow, yellow);
  for (const p of W.paint) paintGeos[p.color === "yellow" ? "yellow" : "white"].push(flatPoly(p.poly, h, Y_PAINT));
  addMerged(group, paintGeos.white, white); addMerged(group, paintGeos.yellow, yellow);
  for (const t of W.texts) {
    const tex = textTexture(t.text, t.color === "yellow" ? "#f2b632" : "#eeece4");
    const m = new THREE.Mesh(new THREE.PlaneGeometry(t.size * 3.2, t.size), new THREE.MeshStandardMaterial({ map: tex, transparent: true, roughness: 0.7, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 }));
    m.rotation.order = "YXZ"; m.rotation.y = groundRot(t.th); m.rotation.x = -Math.PI / 2;
    m.position.set(t.x, h(t.x, t.y) + Y_PAINT + 0.002, t.y);
    group.add(m);
  }

  // estakada side walls and railings
  for (const r of W.ramps) {
    { // the deck: a concrete road surface that climbs and comes down again
      const pos = [], idx = [], uv = [];
      for (let s = r.s0, i = 0; s <= r.s3 + 1e-6; s += 0.5, i++) {
        const hh = W.heightAt(...toWorld(r.pose, s, 0)) + 0.025;
        for (const l of [-r.halfW, r.halfW]) { const [x, y] = toWorld(r.pose, s, l); pos.push(x, hh, y); uv.push(l / 3, s / 3); }
        if (i) { const a = (i - 1) * 2; idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
      }
      const g = new THREE.BufferGeometry(); g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx); g.computeVertexNormals();
      if (g.attributes.normal.getY(0) < 0) { const ix = g.index.array; for (let k = 0; k < ix.length; k += 3) { const t = ix[k + 1]; ix[k + 1] = ix[k + 2]; ix[k + 2] = t; } g.computeVertexNormals(); }
      const deck = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ map: conc, color: 0xb9b6ae, roughness: 0.9 })); deck.receiveShadow = true; group.add(deck);
    }
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
      // the tall concrete parapet along the deck (as on the video)
      { const seg = [];
        for (let s = r.s0; s <= r.s3 + 1e-6; s += 0.5) { const [x, y] = toWorld(r.pose, s, sg * (r.halfW + 0.12)); seg.push([x, y, W.heightAt(...toWorld(r.pose, s, 0))]); }
        const pp = [], ii = []; const hgt = 0.45;
        seg.forEach(([x, y, hh], i) => { pp.push(x, hh, y, x, hh + hgt, y); if (i) { const a = (i - 1) * 2; ii.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); } });
        const pg = new THREE.BufferGeometry(); pg.setAttribute("position", new THREE.Float32BufferAttribute(pp, 3)); pg.setIndex(ii); pg.computeVertexNormals();
        const pm = new THREE.Mesh(pg, new THREE.MeshStandardMaterial({ color: 0xd2d0c8, roughness: 0.85, side: THREE.DoubleSide })); pm.castShadow = true; group.add(pm); }
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
    const sleepers = [];
    for (let l = r.l0 + 0.3; l < r.l1; l += 0.65) {
      const [x, y] = toWorld(r.pose, r.s + 0.76, l);
      const g = new THREE.BoxGeometry(2.4, 0.03, 0.22);
      g.applyMatrix4(new THREE.Matrix4().makeRotationY(-r.pose.th).setPosition(x, 0.012, y));
      sleepers.push(g);
    }
    addMerged(group, sleepers, wood);
  }

  // locomotives: an empty holder per crossing, the model is put in by View.setTrainModel
  dyn.trains = W.rails.filter(r => r.train).map(r => { const holder = new THREE.Group(); holder.visible = false; group.add(holder); return { r, holder }; });

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
    const plate = new THREE.Mesh(new THREE.PlaneGeometry(s.big ? 0.9 : 0.7, s.big ? 0.9 : 0.7), new THREE.MeshStandardMaterial({ map: tex, transparent: true, side: THREE.DoubleSide, roughness: 0.5 }));
    plate.position.y = s.h || 2.05; plate.castShadow = true; g.add(plate);
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

  // posts of signs, signal heads and the alarm gantries are solid too
  for (const g of W.signs) solid(g.x, g.y, 0.14);
  for (const L of W.lights) solid(L.x, L.y, 0.16);
  for (const gt of W.gantries) { const a = gt.th + Math.PI / 2; for (const sg of [-1, 1]) solid(gt.x + Math.cos(a) * sg * gt.width / 2, gt.y + Math.sin(a) * sg * gt.width / 2, 0.25); }

  // other cars: simple low-poly bodies, made when they first appear
  dyn.traffic = { group, made: new Map() };

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
  if (W.board) { const xs = W.board.frame.map(q => q[0]), ys = W.board.frame.map(q => q[1]); for (let i = Math.floor(Math.min(...xs)) - 3; i <= Math.max(...xs) + 3; i++) for (let j = Math.floor(Math.min(...ys)) - 3; j <= Math.max(...ys) + 3; j++) paved.add(i + "," + j); }
  const nearRoad = (x, y) => paved.has(cell(x, y));
  const occupied = (x, y) => {
    for (let i = 0; i < W.routePts.length; i += 3) { const p = W.routePts[i]; if (Math.abs(p[0] - x) < 9 && Math.abs(p[1] - y) < 9 && Math.hypot(p[0] - x, p[1] - y) < 9) return true; }
    for (const p of W.pads) { const xs = p.poly.map(q => q[0]), ys = p.poly.map(q => q[1]); if (x > Math.min(...xs) - 5 && x < Math.max(...xs) + 5 && y > Math.min(...ys) - 5 && y < Math.max(...ys) + 5) return true; }
    if (Math.abs(x) < 40 && Math.abs(y) < 40) return true;
    if (W.board && BLOCKS_AROUND.some(([bx, by, w, d]) => Math.abs(x - bx) < w / 2 + 4 && Math.abs(y - by) < d / 2 + 4)) return true;
    if (W.board) { const f = W.board.frame; if (x > f[0][0] - 6 && x < f[1][0] + 6 && y > f[0][1] - 6 && y < f[2][1] + 6) return true; }
    return false;
  };
  // trees: a trunk and a canopy of three lumpy blobs, each instance tinted a little
  // differently; grass tufts scattered over the fields; lamp posts along the outer road
  const nTrees = quality === "low" ? 70 : quality === "mid" ? 150 : 220;
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
    solid(x, y, 0.28 * s);
    mtx.compose(v.set(x, 1.2 * s, y), q.identity(), sc.set(s, s, s)); trunks.setMatrixAt(placed, mtx);
    mtx.compose(v.set(x, 3.0 * s, y), q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), rand() * 6), sc.set(s, s * (0.9 + rand() * 0.4), s)); crowns.setMatrixAt(placed, mtx);
    crowns.setColorAt(placed, col.setHSL(0.24 + rand() * 0.07, 0.42 + rand() * 0.2, 0.22 + rand() * 0.1));
    placed++;
  }
  trunks.count = crowns.count = placed;
  trunks.castShadow = crowns.castShadow = true; crowns.receiveShadow = true;
  group.add(trunks, crowns);

  // street lamps along the route, set back from the edge, with a lit head
  {
    const spots = [];
    let acc = 0;
    for (let i = 1; i < W.routePts.length; i++) {
      const [x0, y0] = W.routePts[i - 1], [x1, y1] = W.routePts[i], L = Math.hypot(x1 - x0, y1 - y0);
      acc += L; if (acc < 32 || L < 1e-6) continue;
      const nx = -(y1 - y0) / L, ny = (x1 - x0) / L, side = spots.length % 2 ? 1 : -1;
      const x = x1 + nx * 4.6 * side, y = y1 + ny * 4.6 * side;
      if (nearRoad(x, y) || spots.some(p => Math.hypot(p[0] - x, p[1] - y) < 18)) continue;
      spots.push([x, y, Math.atan2(-ny * side, -nx * side)]); acc = 0;
    }
    if (W.board) {                                    // along the edge of the plan, just outside it, the arms reaching over the asphalt
      const [a, b, c, d] = W.board.frame, edge = (p0, p1, nx, ny, rot) => { const L = Math.hypot(p1[0] - p0[0], p1[1] - p0[1]), n = Math.floor(L / 26); for (let i = 0; i < n; i++) { const t = (i + 0.5) / n; spots.push([p0[0] + (p1[0] - p0[0]) * t + nx * 2.4, p0[1] + (p1[1] - p0[1]) * t + ny * 2.4, rot]); } };
      edge(a, b, 0, -1, Math.PI / 2); edge(b, c, 1, 0, Math.PI); edge(d, c, 0, 1, -Math.PI / 2); edge(a, d, -1, 0, 0);
    }
    for (const sp of spots) solid(sp[0], sp[1], 0.16);
    const poleGeo = new THREE.CylinderGeometry(0.06, 0.1, 6.5, 8); poleGeo.translate(0, 3.25, 0);
    const armGeo = new THREE.BoxGeometry(1.4, 0.07, 0.07); armGeo.translate(0.65, 6.35, 0);
    const headGeo = new THREE.BoxGeometry(0.55, 0.12, 0.24); headGeo.translate(1.3, 6.28, 0);
    const steel = new THREE.MeshStandardMaterial({ color: 0x8a9096, roughness: 0.5, metalness: 0.7 });
    const lampMat = new THREE.MeshStandardMaterial({ color: 0xf4f1e6, emissive: 0xfff2d0, emissiveIntensity: 0.35 });
    const poles = new THREE.InstancedMesh(mergeGeos([poleGeo, armGeo]), steel, spots.length);
    const heads = new THREE.InstancedMesh(headGeo, lampMat, spots.length);
    spots.forEach(([x, y, a], i) => { mtx.compose(v.set(x, 0, y), q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), -a), sc.set(1, 1, 1)); poles.setMatrixAt(i, mtx); heads.setMatrixAt(i, mtx); });
    poles.castShadow = true; group.add(poles, heads);
  }

  if (quality !== "low") {
    // grass tufts: a few thin blades per tuft, thousands of them, no shadows
    const blade = new THREE.ConeGeometry(0.025, 0.32, 3); blade.translate(0, 0.16, 0);
    const tuftParts = [];
    for (let k = 0; k < 5; k++) { const g = blade.clone(); g.rotateZ((k - 2) * 0.22); g.rotateY(k * 1.3); g.translate((k - 2) * 0.03, 0, (k % 2) * 0.03); tuftParts.push(g); }
    const tuftGeo = mergeGeos(tuftParts);
    const nTufts = quality === "mid" ? 2500 : 6000;
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
    // exam centre building north of the track: two storeys, glazing, a canopy over the
    // entrance, the sign, flag poles with the Uzbek flag and a camera tower at the corner
    const BY = W.board ? -78 : -160, BX = W.board ? 95 : 40;
    const B = new THREE.Group(); B.position.set(BX, 0, BY); group.add(B);
    wall(BX - 18, BY - 6.5, BX + 18, BY - 6.5, 0.3, 1); wall(BX - 18, BY + 6.5, BX + 18, BY + 6.5, 0.3, 1); wall(BX - 18, BY - 6.5, BX - 18, BY + 6.5, 0.3, 1); wall(BX + 18, BY - 6.5, BX + 18, BY + 6.5, 0.3, 1);
    solid(BX - 4.2, BY + 9.6, 0.16); solid(BX + 4.2, BY + 9.6, 0.16);
    const wallM = new THREE.MeshStandardMaterial({ color: 0xe6e2da, roughness: 0.85 });
    const darkM = new THREE.MeshStandardMaterial({ color: 0x2b3038, roughness: 0.4, metalness: 0.4 });
    const glassM = new THREE.MeshPhysicalMaterial({ color: 0x5f7f99, roughness: 0.08, metalness: 0.2, clearcoat: 1, envMapIntensity: 1.4 });
    const body = new THREE.Mesh(new THREE.BoxGeometry(36, 8, 13), wallM); body.position.y = 4; body.castShadow = body.receiveShadow = true; B.add(body);
    const roof = new THREE.Mesh(new THREE.BoxGeometry(37, 0.5, 14), darkM); roof.position.y = 8.25; B.add(roof);
    for (const fy of [2.3, 5.9]) {                         // two bands of windows on the track side
      const band = new THREE.Mesh(new THREE.BoxGeometry(32, 2.1, 0.12), glassM); band.position.set(0, fy, 6.52); B.add(band);
      for (let x = -16; x <= 16; x += 2.6) { const mul = new THREE.Mesh(new THREE.BoxGeometry(0.12, 2.2, 0.18), darkM); mul.position.set(x, fy, 6.55); B.add(mul); }
    }
    const canopy = new THREE.Mesh(new THREE.BoxGeometry(9, 0.25, 3.4), darkM); canopy.position.set(0, 3.6, 8.1); canopy.castShadow = true; B.add(canopy);
    for (const x of [-4.2, 4.2]) { const p = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 3.6, 10), darkM); p.position.set(x, 1.8, 9.6); B.add(p); }
    const door = new THREE.Mesh(new THREE.BoxGeometry(4, 2.8, 0.1), glassM); door.position.set(0, 1.4, 6.56); B.add(door);
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(14, 2.2), new THREE.MeshBasicMaterial({ map: textTexture("IMTIHON MARKAZI", "#1f4f8a", 1024, 160), transparent: true }));
    sign.position.set(0, 7.6, 6.6); B.add(sign);
    // flags
    const flagTex = (() => { const c = document.createElement("canvas"); c.width = 192; c.height = 96; const g = c.getContext("2d");
      g.fillStyle = "#0099b5"; g.fillRect(0, 0, 192, 31); g.fillStyle = "#ce1126"; g.fillRect(0, 31, 192, 3); g.fillStyle = "#fff"; g.fillRect(0, 34, 192, 28);
      g.fillStyle = "#ce1126"; g.fillRect(0, 62, 192, 3); g.fillStyle = "#1eb53a"; g.fillRect(0, 65, 192, 31);
      g.fillStyle = "#fff"; g.beginPath(); g.arc(24, 15, 10, 0, 7); g.fill(); g.fillStyle = "#0099b5"; g.beginPath(); g.arc(28, 15, 9, 0, 7); g.fill();
      const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t; })();
    dyn.flags = [];
    for (const x of [-12, -9, 12]) {
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.08, 10, 8), new THREE.MeshStandardMaterial({ color: 0xc8ccd1, metalness: 0.8, roughness: 0.3 }));
      pole.position.set(x, 5, 12); pole.castShadow = true; B.add(pole);
      const fg = new THREE.PlaneGeometry(2.4, 1.2, 12, 1); fg.translate(1.2, 0, 0);
      const flag = new THREE.Mesh(fg, new THREE.MeshStandardMaterial({ map: flagTex, side: THREE.DoubleSide, roughness: 0.8 }));
      flag.position.set(x, 9.2, 12); B.add(flag); dyn.flags.push(flag);
    }
    // camera tower
    const tw = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.25, 12, 8), darkM); tw.position.set(19.5, 6, 8); B.add(tw);
    for (const a of [0, 2.1, 4.2]) { const cm = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.25, 0.25), new THREE.MeshStandardMaterial({ color: 0xf2f2f0 })); cm.position.set(19.5 + Math.cos(a) * 0.35, 11.6, 8 + Math.sin(a) * 0.35); cm.rotation.y = -a; B.add(cm); }
  }

  // raised kerbs along the road edges, broken where other roads or pads join
  {
    const curbM = new THREE.MeshStandardMaterial({ color: 0xc9c7c0, roughness: 0.9 });
    const roadCells = new Map(), key = (x, y) => Math.floor(x) + "," + Math.floor(y);
    W.roads.forEach((r, ri) => { for (let k = 0; k < r.pts.length; k++) { const [x, y] = r.pts[k], R = r.width / 2 + 0.6;
      for (let i = Math.floor(x - R); i <= x + R; i++) for (let j = Math.floor(y - R); j <= y + R; j++) if ((i + 0.5 - x) ** 2 + (j + 0.5 - y) ** 2 <= R * R) { const c = i + "," + j; if (!roadCells.has(c)) roadCells.set(c, new Set()); roadCells.get(c).add(ri); } } });
    const inPad = (x, y) => W.pads.some(p => { let inside = false; const P = p.poly; for (let i = 0, j = P.length - 1; i < P.length; j = i++) if ((P[i][1] > y) !== (P[j][1] > y) && x < (P[j][0] - P[i][0]) * (y - P[i][1]) / (P[j][1] - P[i][1]) + P[i][0]) inside = !inside; return inside; });
    const pos = [], idx = [];
    const H = 0.12, W1 = 0.22;
    W.roads.forEach((r, ri) => {
      for (const side of [-1, 1]) {
        const ex = side < 0 && r.shift ? r.width : 0, inner = untangle(offsetPolyline(r.pts, side * (r.width / 2 + ex + 0.25))), outer = untangle(offsetPolyline(r.pts, side * (r.width / 2 + ex + 0.25 + W1)));   // untangle: the inside of a sharp corner would stick out as a loop
        for (let k = 1; k < r.pts.length; k++) {
          const mx = (inner[k][0] + inner[k - 1][0]) / 2, my = (inner[k][1] + inner[k - 1][1]) / 2;
          const others = roadCells.get(key(mx, my));
          if ((others && [...others].some(o => o !== ri)) || inPad(mx, my)) continue;
          const a = inner[k - 1], b2 = inner[k], c = outer[k], d = outer[k - 1], n = pos.length / 3;
          const y0 = h(a[0], a[1]);
          // top face and the face towards the road
          pos.push(a[0], y0 + H, a[1], b2[0], y0 + H, b2[1], c[0], y0 + H, c[1], d[0], y0 + H, d[1], a[0], y0, a[1], b2[0], y0, b2[1]);
          if (side > 0) idx.push(n, n + 1, n + 2, n, n + 2, n + 3, n + 4, n + 5, n + 1, n + 4, n + 1, n);
          else idx.push(n, n + 2, n + 1, n, n + 3, n + 2, n + 4, n + 1, n + 5, n + 4, n, n + 1);
        }
      }
    });
    const g = new THREE.BufferGeometry(); g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals();
    const curbs = new THREE.Mesh(g, curbM); curbs.receiveShadow = true; curbs.castShadow = quality !== "low"; group.add(curbs);
  }

  // asphalt repairs: darker patches and a few crack lines scattered on the roads (not on the exam ground: its asphalt is new)
  if (!W.board) {
    const tex = (() => { const c = document.createElement("canvas"); c.width = c.height = 256; const g = c.getContext("2d");
      g.fillStyle = "rgba(20,22,25,0.55)"; g.beginPath(); g.moveTo(20, 30); g.lineTo(230, 18); g.lineTo(240, 220); g.lineTo(30, 236); g.closePath(); g.fill();
      g.strokeStyle = "rgba(10,10,12,0.9)"; g.lineWidth = 3; g.beginPath(); g.moveTo(40, 120); for (let x = 40; x < 220; x += 18) g.lineTo(x, 120 + (Math.random() - 0.5) * 40); g.stroke();
      const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t; })();
    const m = new THREE.MeshStandardMaterial({ map: tex, transparent: true, depthWrite: false, roughness: 0.95, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 });
    const n = quality === "low" ? 25 : quality === "mid" ? 45 : 70, patches = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), m, n);
    let k = 0;
    for (let t = 0; t < n * 10 && k < n; t++) {
      let p, rw = 3.5;
      if (W.board) {                                          // anywhere on the asphalt of the plan, not on an island or a pad
        const f = W.board.frame; p = [f[0][0] + 3 + rand() * (f[1][0] - f[0][0] - 6), f[0][1] + 3 + rand() * (f[2][1] - f[0][1] - 6)];
        const inside = poly => { let c = false; for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) if ((poly[i][1] > p[1]) !== (poly[j][1] > p[1]) && p[0] < (poly[j][0] - poly[i][0]) * (p[1] - poly[i][1]) / (poly[j][1] - poly[i][1]) + poly[i][0]) c = !c; return c; };
        if (W.board.islands.some(i => inside(i.kerb)) || W.board.pads.some(inside)) continue;
        rw = 0;
      } else { const r = W.roads[Math.floor(rand() * W.roads.length)]; p = r.pts[Math.floor(rand() * r.pts.length)]; rw = r.width; }
      if (!p) continue;
      const sz = 0.8 + rand() * 1.8;
      mtx.compose(v.set(p[0] + (rand() - 0.5) * Math.max(0, rw - sz), h(p[0], p[1]) + 0.01, p[1] + (rand() - 0.5) * Math.max(0, rw - sz)), q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), rand() * 6), sc.set(sz, 1, sz * (0.6 + rand() * 0.6)));
      patches.setMatrixAt(k++, mtx);
    }
    patches.count = k; patches.receiveShadow = true; group.add(patches);
  }
  const fenceMat = new THREE.MeshStandardMaterial({ color: 0xbfc3c7, roughness: 0.6, metalness: 0.4 });
  const fx0 = b.minX - 8, fx1 = b.maxX + 8, fy0 = b.minY - 8, fy1 = b.maxY + 8;
  for (const [x0, y0, x1, y1] of [[fx0, fy0, fx1, fy0], [fx1, fy0, fx1, fy1], [fx1, fy1, fx0, fy1], [fx0, fy1, fx0, fy0]]) {
    const len = Math.hypot(x1 - x0, y1 - y0);
    wall(x0, y0, x1, y1, 0.25, 1.2);
    const f = new THREE.Mesh(new THREE.BoxGeometry(len, 1.8, 0.05), fenceMat);
    f.position.set((x0 + x1) / 2, 0.9, (y0 + y1) / 2); f.rotation.y = -Math.atan2(y1 - y0, x1 - x0);
    group.add(f);
  }

  return { group, dyn };
}

const flashMat = new THREE.MeshBasicMaterial({ color: 0xff3b1f });
const _trMats = {};
function trafficCar(color) {
  const g = new THREE.Group();
  const paint = _trMats[color] || (_trMats[color] = new THREE.MeshStandardMaterial({ color, roughness: 0.35, metalness: 0.35 }));
  const glass = _trMats.glass || (_trMats.glass = new THREE.MeshStandardMaterial({ color: 0x15191f, roughness: 0.1, metalness: 0.6 }));
  const tyre = _trMats.tyre || (_trMats.tyre = new THREE.MeshStandardMaterial({ color: 0x151618, roughness: 0.9 }));
  const lamp = _trMats.lamp || (_trMats.lamp = new THREE.MeshStandardMaterial({ color: 0xfff6dc, emissive: 0xfff0c0, emissiveIntensity: 1.2 }));
  const tail = _trMats.tail || (_trMats.tail = new THREE.MeshStandardMaterial({ color: 0xa01010, emissive: 0xc01010, emissiveIntensity: 0.6 }));
  const box = (w, h, d, m, x, y, z) => { const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); b.position.set(x, y, z); b.castShadow = true; g.add(b); return b; };
  box(4.3, 0.62, 1.78, paint, 0, 0.62, 0);                 // lower body (x forward)
  box(2.3, 0.5, 1.6, glass, -0.25, 1.18, 0);               // glasshouse
  box(2.2, 0.06, 1.56, paint, -0.25, 1.46, 0);             // roof
  box(0.08, 0.2, 1.4, lamp, 2.16, 0.7, 0);
  box(0.08, 0.2, 1.4, tail, -2.16, 0.74, 0);
  for (const [x, z] of [[1.32, 0.9], [1.32, -0.9], [-1.32, 0.9], [-1.32, -0.9]]) { const w = new THREE.Mesh(new THREE.CylinderGeometry(0.33, 0.33, 0.22, 14), tyre); w.rotation.x = Math.PI / 2; w.position.set(x, 0.33, z); g.add(w); }
  return g;
}

// a copy of a light car model with its own paint colour
function realCar(tpl, color) {
  const g = tpl.clone(true);
  g.userData.tails = [];
  g.traverse(o => {
    if (!o.isMesh) return;
    o.material = [].concat(o.material).map(m => {
      if (m && m.name === "paint") { const c = m.clone(); c.color.setHex(color); return c; }
      if (m && m.name === "lamp_tail") { const c = m.clone(); g.userData.tails.push(c); return c; }       // its own brake light
      return m;
    });
    if (!Array.isArray(o.material) || o.material.length === 1) o.material = [].concat(o.material)[0];
  });
  return g;
}

export function fillTrains(dyn, tpl) {
  for (const t of dyn.trains || []) if (!t.holder.children.length) {
    const m = tpl.clone(true); m.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = false; } });
    t.holder.add(m);
  }
}

export function updateWorldMeshes(W, dyn, clock, now) {
  for (const { r, holder } of dyn.trains || []) {
    const T = r.train; holder.visible = T.pos !== null && holder.children.length > 0;
    if (!holder.visible) continue;
    const [x, y] = toWorld(r.pose, r.s + 0.76, T.pos), [x1, y1] = toWorld(r.pose, r.s + 0.76, T.pos + T.dir);
    holder.position.set(x, W.heightAt ? W.heightAt(x, y) + 0.12 : 0.12, y);       // the wheels sit on the rails (0.07 m)
    holder.rotation.y = -Math.atan2(y1 - y, x1 - x);
  }
  if (W.traffic && dyn.traffic) {
    const seen = new Set();
    for (const c of W.traffic.cars) {
      let m = dyn.traffic.made.get(c);
      const tpl = dyn.traffic.real && c.model && dyn.traffic.real[c.model];
      if (!tpl && c.model && dyn.traffic.wantReal) continue;               // its model is still loading: nothing rather than a box
      if (m && tpl && !m.userData.real) { dyn.traffic.group.remove(m); m = null; }                 // the light model arrived after the box
      if (!m) { m = tpl ? realCar(tpl, c.color) : trafficCar(c.color); m.userData.real = !!tpl; dyn.traffic.group.add(m); dyn.traffic.made.set(c, m); }
      const p = tpl ? W.traffic.axlePose(c) : W.traffic.worldPose(c);     // real models sit on their rear axle, the boxes on their middle
      m.position.set(p.x, W.heightAt ? W.heightAt(p.x, p.y) : 0, p.y); m.rotation.order = "YXZ"; m.rotation.y = -p.th; seen.add(c);
      // braking: the nose dips and the brake lights come on (also while it waits at the light); accelerating: the nose lifts
      m.rotation.z = THREE.MathUtils.clamp(c.a * 0.006, -0.03, 0.02);
      const stop = c.a < -0.4 || (c.v < 0.3 && c.ls && c.ls !== "green");
      if (m.userData.tails) for (const t of m.userData.tails) { t.emissive.setHex(0xff1a10); t.emissiveIntensity = stop ? 3 : 0.15; }
    }
    for (const [c, m] of dyn.traffic.made) if (!seen.has(c)) { dyn.traffic.group.remove(m); dyn.traffic.made.delete(c); }
  }
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
  // flags flutter
  if (dyn.flags) for (const f of dyn.flags) { const p = f.geometry.attributes.position; for (let i = 0; i < p.count; i++) { const x = p.getX(i); p.setZ(i, Math.sin(x * 2.2 - now / 260) * 0.12 * (x / 2.4)); } p.needsUpdate = true; }
  for (const { c, m } of dyn.cones) if (c.hit && m.rotation.z === 0) { m.rotation.z = 1.4; m.position.y = 0.15; }
  // a touched line glows red only around the contact (about 6 m), not along its whole length
  for (const L of dyn.lines) {
    const { ln } = L, hot = clock - ln.flash < 0.8 && ln.hit;
    if (!hot) { if (L.flashMesh && L.flashMesh.visible) L.flashMesh.visible = false; continue; }
    const key = ln.hit[0].toFixed(1) + "," + ln.hit[1].toFixed(1);
    if (L.hitKey !== key) {
      L.hitKey = key;
      let k = 0, best = Infinity;
      ln.pts.forEach((p, i) => { const d = Math.hypot(p[0] - ln.hit[0], p[1] - ln.hit[1]); if (d < best) { best = d; k = i; } });
      let a = k, b = k, len = 0;
      while (a > 0 && len < 3) { len += Math.hypot(ln.pts[a][0] - ln.pts[a - 1][0], ln.pts[a][1] - ln.pts[a - 1][1]); a--; }
      len = 0;
      while (b < ln.pts.length - 1 && len < 3) { len += Math.hypot(ln.pts[b + 1][0] - ln.pts[b][0], ln.pts[b + 1][1] - ln.pts[b][1]); b++; }
      const piece = ln.pts.slice(a, b + 1);
      if (L.flashMesh) { L.group.remove(L.flashMesh); L.flashMesh.geometry.dispose(); L.flashMesh = null; }
      if (piece.length > 1) {
        L.flashMesh = new THREE.Mesh(ribbon(piece, ln.width * 1.15, L.h, Y_LINE + 0.004), flashMat);
        L.flashMesh.renderOrder = 4; L.group.add(L.flashMesh);
      }
    }
    if (L.flashMesh) L.flashMesh.visible = true;
  }
}
