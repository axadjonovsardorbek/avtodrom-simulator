// Advertising on the centre-stack screen. public/ads/ads.json lists the pictures and videos
// shown in turn, e.g. { "items": [ { "src": "reklama.jpg", "sec": 8 }, { "src": "reklama.mp4" } ] }
// (a picture stays "sec" seconds, 8 by default; a video plays to its end, muted). With no list,
// or an empty one, every screen keeps its own picture. One player feeds every car's screen, so
// a video is decoded once however many cars the garage holds. The picture fills the screen and
// is cropped at its edges where its shape differs from the screen's.
import * as THREE from "three";

const mat = new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false });
const screens = [];              // WeakRefs to the screen meshes: a car that is let go takes its screen with it
let ready = null, picAspect = 16 / 9;

const isVideo = src => /\.(mp4|webm|mov|m4v)(\?|$)/i.test(src);
const urlOf = src => /^(https?:)?\/\/|^\//.test(src) ? src : "ads/" + src;

function start() {
  if (!ready) ready = fetch("ads/ads.json", { cache: "no-cache" }).then(r => r.ok ? r.json() : null).then(cfg => {
    const items = ((cfg && cfg.items) || []).filter(it => it && it.src);
    if (!items.length) return false;
    play(items, 0, 0);
    return true;
  }).catch(() => false);
  return ready;
}

let video = null, timer = 0;
function show(tex, aspect) {
  const old = mat.map;
  tex.colorSpace = THREE.SRGBColorSpace;
  mat.map = tex; mat.needsUpdate = true; picAspect = aspect || picAspect;
  for (const r of screens) { const s = r.deref(); if (s) fit(s); }
  if (old && old !== tex) old.dispose();
}
// one item after the other; a file that fails to load is skipped (all of them failing stops the show)
function play(items, i, failed) {
  if (failed >= items.length) return;
  const it = items[i % items.length], next = () => play(items, i + 1, 0), skip = () => { timer = setTimeout(() => play(items, i + 1, failed + 1), 1000); };
  clearTimeout(timer);
  if (video) { video.pause(); video.removeAttribute("src"); video.load(); video = null; }
  if (isVideo(it.src)) {
    const v = video = document.createElement("video");
    Object.assign(v, { muted: true, playsInline: true, loop: items.length === 1, crossOrigin: "anonymous", preload: "auto" });
    v.setAttribute("muted", ""); v.setAttribute("playsinline", "");
    v.addEventListener("loadeddata", () => { show(new THREE.VideoTexture(v), v.videoWidth / v.videoHeight); v.play().catch(() => {}); }, { once: true });
    v.addEventListener("ended", next);
    v.addEventListener("error", skip, { once: true });
    v.src = urlOf(it.src);
  } else {
    new THREE.TextureLoader().load(urlOf(it.src), tex => {
      show(tex, tex.image.width / tex.image.height);
      if (items.length > 1) timer = setTimeout(next, (+it.sec || 8) * 1000);
    }, undefined, skip);
  }
}

// crop the picture to the screen's shape through the screen's own texture coordinates
function fit(s) {
  const { base, aspect } = s.userData.ad, uv = s.geometry.attributes.uv;
  const ku = Math.min(1, aspect / picAspect), kv = Math.min(1, picAspect / aspect);
  for (let i = 0; i < uv.count; i++) uv.setXY(i, 0.5 + (base[2 * i] - 0.5) * ku, 0.5 + (base[2 * i + 1] - 0.5) * kv);
  uv.needsUpdate = true;
}
function adopt(s, aspect) {
  const uv = s.geometry.attributes.uv;
  s.userData.ad = { base: Float32Array.from(uv.array), aspect };
  s.material = mat; fit(s); screens.push(new WeakRef(s));
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
    const s = new THREE.Mesh(geo, mat); s.name = "ad_screen";
    s.userData.cut = { host: o, keep, aspect };
    o.add(s);
    return s;
  }
  return null;
}

// once there is something to show: the car's screen (its own "ad_screen" mesh, or the one cut out
// of its dashboard texture as `spec` says) shows the advertising
export function addScreenAd(cv, spec) {
  start().then(on => {
    if (!on) return;
    const own = cv.root.getObjectByName("ad_screen");
    if (own) { const p = own.geometry.parameters || {}; adopt(own, (p.width || 16) / (p.height || 9)); return; }
    if (!spec) return;
    const s = cutScreen(cv.root, spec);
    if (!s) return;
    const { host, keep, aspect } = s.userData.cut; delete s.userData.cut;
    host.geometry = host.geometry.clone(); host.geometry.setIndex(keep);     // the atlas picture under it goes
    adopt(s, aspect);
  });
}
