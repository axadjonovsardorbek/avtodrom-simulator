// Advertising on the cars: the centre-stack screen ("screen") and the rear window ("rear"). The admin
// panel's list (server), or public/ads/ads.json, lists the pictures and videos shown in turn, e.g.
// { "items": [ { "src": "reklama.jpg", "sec": 8 }, { "src": "reklama.mp4", "place": "rear", "cars": ["cobalt"] } ] }
// (a picture stays "sec" seconds, 8 by default; a video plays to its end, muted; "place" is "screen"
// when left out; "cars" empty or left out: every car). With no list, or none for a car and a place,
// the screen keeps its own picture and the rear window stays glass. One player feeds every surface
// with the same list, so a video is decoded once however many cars the garage holds. The picture
// fills its surface and is cropped at its edges where its shape differs.
import * as THREE from "three";

let ready = null;
const isVideo = src => /\.(mp4|webm|mov|m4v)(\?|$)/i.test(src);
const urlOf = src => /^(https?:)?\/\/|^\//.test(src) ? src : "ads/" + src;

// where the list comes from: the server's (the admin panel's), when there is one; else ads/ads.json
let source = null;
export function setAdSource(p) { source = p; }
function start() {
  if (!ready) ready = Promise.resolve(source).catch(() => null).then(list => list || fetch("ads/ads.json", { cache: "no-cache" }).then(r => r.ok ? r.json() : null).then(cfg => cfg && cfg.items))
    .then(list => (list || []).filter(it => it && it.src)).catch(() => []);
  return ready;
}
const placeOf = it => (it.place === "rear" ? "rear" : "screen");
const itemsFor = (all, place, car) => all.filter(it => placeOf(it) === place && (!it.cars || !it.cars.length || it.cars.includes(car)));

// one list played in turn onto every surface that shows it
class Player {
  constructor(items, place) {
    this.items = items; this.cur = null; this.surfaces = [];       // WeakRefs: a car that is let go takes its surface with it
    this.aspect = 16 / 9; this.video = null; this.timer = 0; this.place = place;
    // the screen glows; the film on the rear window takes the daylight like the paint round it
    this.mat = place === "rear"
      ? new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.32, metalness: 0, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 })
      : new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false });
    if (place === "rear") this.mat.visible = false;             // no glass covered before the first picture is in
    this.play(0, 0);
  }
  alive() { this.surfaces = this.surfaces.filter(r => r.deref()); return this.surfaces.length > 0; }
  show(tex, aspect) {
    const old = this.mat.map;
    tex.colorSpace = THREE.SRGBColorSpace;
    this.mat.map = tex; this.mat.visible = true; this.mat.needsUpdate = true; this.aspect = aspect || this.aspect;
    for (const r of this.surfaces) { const s = r.deref(); if (s) fit(s, this.aspect); }
    if (old && old !== tex) old.dispose();
  }
  // one item after the other; a file that fails to load is skipped (all of them failing stops the show)
  play(i, failed) {
    const items = this.items;
    if (failed >= items.length) return;
    if (i > 0 && !this.alive()) { players.delete(this.key); return; }   // nothing shows it any more
    const it = items[i % items.length], next = () => this.play(i + 1, 0), skip = () => { this.timer = setTimeout(() => this.play(i + 1, failed + 1), 1000); };
    clearTimeout(this.timer);
    if (this.video) { this.video.pause(); this.video.removeAttribute("src"); this.video.load(); this.video = null; }
    if (isVideo(it.src)) {
      const v = this.video = document.createElement("video");
      Object.assign(v, { muted: true, playsInline: true, loop: items.length === 1, crossOrigin: "anonymous", preload: "auto" });
      v.setAttribute("muted", ""); v.setAttribute("playsinline", "");
      v.addEventListener("loadeddata", () => { this.cur = it; this.show(new THREE.VideoTexture(v), v.videoWidth / v.videoHeight); v.play().catch(() => {}); }, { once: true });
      v.addEventListener("ended", next);
      v.addEventListener("error", skip, { once: true });
      v.src = urlOf(it.src);
    } else {
      new THREE.TextureLoader().load(urlOf(it.src), tex => {
        this.cur = it; this.show(tex, tex.image.width / tex.image.height);
        if (items.length > 1) this.timer = setTimeout(next, (+it.sec || 8) * 1000);
      }, undefined, skip);
    }
  }
  adopt(s, aspect) {
    const uv = s.geometry.attributes.uv;
    s.userData.ad = { base: Float32Array.from(uv.array), aspect, contain: this.place === "rear" };
    s.material = this.mat; fit(s, this.aspect); this.surfaces.push(new WeakRef(s));
  }
}
// the same list (same files, same order) on the same kind of surface shares one player
const players = new Map();
function playerFor(items, place) {
  const key = place + "|" + items.map(it => it.id || it.src).join("|");
  let p = players.get(key);
  if (!p) { p = new Player(items, place); p.key = key; players.set(key, p); }
  return p;
}

// fit the picture to the surface through the surface's own texture coordinates: the screen is filled
// (the picture cropped at its edges), the rear window shows all of it (its edge colour fills the rest,
// so text is never cut on a tall van window)
function fit(s, picAspect) {
  const { base, aspect, contain } = s.userData.ad, uv = s.geometry.attributes.uv;
  const ku = (contain ? Math.max : Math.min)(1, aspect / picAspect), kv = (contain ? Math.max : Math.min)(1, picAspect / aspect);
  for (let i = 0; i < uv.count; i++) uv.setXY(i, 0.5 + (base[2 * i] - 0.5) * ku, 0.5 + (base[2 * i + 1] - 0.5) * kv);
  uv.needsUpdate = true;
}

// a model whose screen is drawn in its dashboard texture atlas: the triangles mapped into the
// atlas rectangle uv = [u0, u1, v0, v1] of material `matName` become a mesh of their own, with
// the rectangle stretched over 0..1 (flipped where the atlas holds it mirrored)
function cutScreen(root, { mat: matName, uv: [u0, u1, v0, v1], flipU, flipV }) {
  const hosts = [];
  root.traverse(o => { if (o.isMesh && !Array.isArray(o.material) && o.material.name.includes(matName)) hosts.push(o); });
  for (const o of hosts) {
    const g = o.geometry, pos = g.attributes.position, uv = g.attributes.uv, idx = g.index;
    if (!uv || !idx) continue;
    const keep = [], cut = [];
    for (let t = 0; t < idx.count; t += 3) {
      const a = idx.getX(t), b = idx.getX(t + 1), c = idx.getX(t + 2);
      const cu = (uv.getX(a) + uv.getX(b) + uv.getX(c)) / 3, cv = (uv.getY(a) + uv.getY(b) + uv.getY(c)) / 3;
      (cu > u0 && cu < u1 && cv > v0 && cv < v1 ? cut : keep).push(a, b, c);
    }
    if (!cut.length) continue;
    let ua = 1, ub = 0, va = 1, vb = 0;
    for (const i of cut) { ua = Math.min(ua, uv.getX(i)); ub = Math.max(ub, uv.getX(i)); va = Math.min(va, uv.getY(i)); vb = Math.max(vb, uv.getY(i)); }
    const P = [], U = [];
    for (const i of cut) {
      P.push(pos.getX(i), pos.getY(i), pos.getZ(i));
      const u = (uv.getX(i) - ua) / (ub - ua), v = (uv.getY(i) - va) / (vb - va);
      U.push(flipU ? 1 - u : u, flipV ? 1 - v : v);
    }
    // the screen's width / height: how far the corners lie apart along u and along v
    const corner = (fu, fv) => { let best = 0, d = -1; for (let k = 0; k < U.length / 2; k++) { const s = (fu ? U[2 * k] : 1 - U[2 * k]) + (fv ? U[2 * k + 1] : 1 - U[2 * k + 1]); if (s > d) { d = s; best = k; } } return new THREE.Vector3(P[3 * best], P[3 * best + 1], P[3 * best + 2]); };
    const c00 = corner(0, 0), aspect = c00.distanceTo(corner(1, 0)) / (c00.distanceTo(corner(0, 1)) || 1);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(P, 3));
    geo.setAttribute("uv", new THREE.Float32BufferAttribute(U, 2));
    const s = new THREE.Mesh(geo, new THREE.MeshBasicMaterial()); s.name = "ad_screen";
    s.userData.cut = { host: o, keep, aspect };
    o.add(s);
    return s;
  }
  return null;
}

// The rear window, found by looking at the car from behind: a grid of rays along the car (+x in the
// car's frame) meets glass facing backwards; the largest rectangle of the grid where every ray did
// becomes a film a few millimetres outside the glass, following its curve. Seen from inside, the
// film's back faces are not drawn: the driver and the rear-view mirror look through it.
// glass: see-through, or named so (some models keep their windows opaque, or tinted black)
const GLASSY = m => m && !/lamp|light|tail|head|turn|поворот|фар/i.test(m.name || "") && ((m.transparent && m.opacity < 0.95) || /glass|window|стекл|окн/i.test(m.name || ""));
function rearWindow(root) {
  root.updateMatrixWorld(true);
  const glass = [];
  root.traverse(o => { if (o.isMesh && o.visible && [].concat(o.material).some(GLASSY)) glass.push(o); });
  if (!glass.length) return null;
  const toRoot = root.matrixWorld.clone().invert(), box = new THREE.Box3();
  for (const o of glass) box.union(new THREE.Box3().setFromObject(o).applyMatrix4(toRoot));
  const NZ = 30, NY = 26, ray = new THREE.Raycaster(), dir = new THREE.Vector3(1, 0, 0).transformDirection(root.matrixWorld);
  const midX = (box.min.x + box.max.x) / 2, nrm = new THREE.Matrix3();
  const hit = [], ok = [];
  let host = null;
  for (let j = 0; j < NY; j++) for (let i = 0; i < NZ; i++) {
    const y = box.min.y + (box.max.y - box.min.y) * (j + 0.5) / NY, z = box.min.z + (box.max.z - box.min.z) * (i + 0.5) / NZ;
    ray.set(new THREE.Vector3(box.min.x - 1, y, z).applyMatrix4(root.matrixWorld), dir);
    const h = ray.intersectObjects(glass, false).find(h => GLASSY(Array.isArray(h.object.material) ? h.object.material[h.face.materialIndex] : h.object.material));
    let good = false;
    if (h && h.face) {
      const n = h.face.normal.clone().applyMatrix3(nrm.getNormalMatrix(h.object.matrixWorld)).transformDirection(toRoot);
      const p = h.point.clone().applyMatrix4(toRoot);
      // facing back at all: the Malibus' rear window leans back to about 17° from flat
      if (p.x < midX && n.x < -0.15) { good = true; hit[j * NZ + i] = { p, n }; host = host || h.object.parent; }
    }
    ok[j * NZ + i] = good;
  }
  // the largest rectangle of good cells (row by row, the heights of good columns as a histogram)
  let best = null;
  const hgt = new Array(NZ).fill(0);
  for (let j = 0; j < NY; j++) {
    for (let i = 0; i < NZ; i++) hgt[i] = ok[j * NZ + i] ? hgt[i] + 1 : 0;
    for (let i0 = 0; i0 < NZ; i0++) {
      let h = Infinity;
      for (let i1 = i0; i1 < NZ && hgt[i1]; i1++) {
        h = Math.min(h, hgt[i1]);
        const area = (i1 - i0 + 1) * h;
        if (!best || area > best.area) best = { area, i0, i1, j0: j - h + 1, j1: j };
      }
    }
  }
  if (!best || best.i1 - best.i0 < 5 || best.j1 - best.j0 < 3) return null;
  // a cell in from each side keeps the film off the rubber and the black edge of the glass
  const i0 = best.i0 + 1, i1 = best.i1 - 1, j0 = best.j0 + 1, j1 = best.j1 - (best.j1 - best.j0 > 5 ? 1 : 0);
  const toHost = host.matrixWorld.clone().invert().multiply(root.matrixWorld);
  const P = [], U = [], I = [], nz = i1 - i0 + 1, ny = j1 - j0 + 1;
  for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
    const { p, n } = hit[j * NZ + i];
    const q = p.clone().addScaledVector(n, 0.006).applyMatrix4(toHost);
    P.push(q.x, q.y, q.z); U.push((i - i0) / (nz - 1), (j - j0) / (ny - 1));
  }
  // facing backwards (to the -x side): seen from behind the car, +z is on the right
  for (let j = 0; j < ny - 1; j++) for (let i = 0; i < nz - 1; i++) { const a = j * nz + i; I.push(a, a + 1, a + nz, a + 1, a + nz + 1, a + nz); }
  const at = (i, j) => hit[j * NZ + i].p;
  const wide = at(i0, (j0 + j1) >> 1).distanceTo(at(i1, (j0 + j1) >> 1));
  let tall = 0; for (let j = j0; j < j1; j++) tall += at((i0 + i1) >> 1, j).distanceTo(at((i0 + i1) >> 1, j + 1));
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(P, 3));
  geo.setAttribute("uv", new THREE.Float32BufferAttribute(U, 2));
  geo.setIndex(I); geo.computeVertexNormals();
  const s = new THREE.Mesh(geo, new THREE.MeshBasicMaterial()); s.name = "ad_rear";
  s.renderOrder = 2; s.castShadow = false; s.receiveShadow = true;
  host.add(s);
  return { mesh: s, aspect: wide / (tall || 1) };
}

// once the list is in: the car's screen (its own "ad_screen" mesh, or the one cut out of its
// dashboard texture as `spec` says) and its rear window show what is meant for this car
export function addScreenAd(cv, spec, carId) {
  cv.ads = [];
  start().then(all => {
    const screen = itemsFor(all, "screen", carId), rear = itemsFor(all, "rear", carId);
    if (screen.length) {
      let s = cv.root.getObjectByName("ad_screen"), aspect;
      if (s) { const p = s.geometry.parameters || {}; aspect = (p.width || 16) / (p.height || 9); }
      else if (spec && (s = cutScreen(cv.root, spec))) {
        const { host, keep } = s.userData.cut; aspect = s.userData.cut.aspect; delete s.userData.cut;
        host.geometry = host.geometry.clone(); host.geometry.setIndex(keep);     // the atlas picture under it goes
      }
      if (s) { const p = playerFor(screen, "screen"); p.adopt(s, aspect); cv.ads.push({ player: p, place: "screen", seen: null }); }
    }
    if (rear.length) {
      const w = rearWindow(cv.root);
      if (w) { const p = playerFor(rear, "rear"); p.adopt(w.mesh, w.aspect); cv.ads.push({ player: p, place: "rear", seen: null }); }
    }
  });
}

// What the player had in front of them: per advert, car and place, how many times it came up and
// for how long. `watching` says which places can be seen now (the screen from the driver's seat,
// the rear window from behind the car). take() hands the counts over and starts again.
const seen = new Map();
export function watchAds(cv, carId, dt, watching) {
  if (!cv || !cv.ads) return;
  for (const a of cv.ads) {
    const it = a.player.cur;
    if (!watching[a.place] || !it || !it.id) { if (!watching[a.place]) a.seen = null; continue; }
    const k = it.id + "|" + carId + "|" + a.place;
    let s = seen.get(k);
    if (!s) seen.set(k, s = { id: it.id, car: carId, place: a.place, views: 0, secs: 0 });
    if (a.seen !== it) { a.seen = it; s.views++; }
    s.secs += dt;
  }
}
export function takeAdViews() {
  const out = [...seen.values()].filter(s => s.secs >= 1).map(s => ({ ...s, secs: Math.round(s.secs) }));
  for (const s of out) seen.delete(s.id + "|" + s.car + "|" + s.place);
  return out;
}
