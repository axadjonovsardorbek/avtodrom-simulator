// Uzbek registration plates (520 x 112 mm): region code in its own box, the number,
// the flag and "UZ" on the right, two screws. Text like "01 A 070 BJ" can be changed
// from the menu; every plate on the car is redrawn.
import * as THREE from "three";

export const DEFAULT_PLATE = "01 A 070 BJ";
const FONT = "'Barlow Condensed', 'Arial Narrow', sans-serif";

function drawPlate(g, text) {
  const W = 1040, H = 224;
  const [region, ...rest] = String(text || DEFAULT_PLATE).trim().toUpperCase().split(/\s+/);
  g.clearRect(0, 0, W, H);
  // white plate with a black rounded border
  g.fillStyle = "#fbfbf8"; g.strokeStyle = "#111"; g.lineWidth = 8;
  const r = 22; g.beginPath(); g.roundRect(6, 6, W - 12, H - 12, r); g.fill(); g.stroke();
  // region box
  g.lineWidth = 6; g.beginPath(); g.moveTo(222, 14); g.lineTo(222, H - 14); g.stroke();
  g.fillStyle = "#111"; g.textAlign = "center"; g.textBaseline = "middle";
  g.font = `700 150px ${FONT}`;
  g.fillText(region || "01", 128, H / 2 + 8);
  g.fillText(rest.join(" ") || "A 070 BJ", 560, H / 2 + 8);
  // flag (blue / white / green with thin red lines) and "UZ"
  const fx = 880, fy = 38, fw = 92, sh = 15;
  g.fillStyle = "#1eb2e8"; g.fillRect(fx, fy, fw, sh);
  g.fillStyle = "#ce1126"; g.fillRect(fx, fy + sh, fw, 3);
  g.fillStyle = "#ffffff"; g.fillRect(fx, fy + sh + 3, fw, sh);
  g.fillStyle = "#ce1126"; g.fillRect(fx, fy + 2 * sh + 3, fw, 3);
  g.fillStyle = "#1eb53a"; g.fillRect(fx, fy + 2 * sh + 6, fw, sh);
  g.strokeStyle = "#999"; g.lineWidth = 1.5; g.strokeRect(fx, fy, fw, 3 * sh + 6);
  g.fillStyle = "#1d8fc9"; g.font = `700 96px ${FONT}`; g.fillText("UZ", fx + fw / 2, 160);
  // screws
  g.fillStyle = "#222";
  for (const x of [40, W - 40]) { g.beginPath(); g.arc(x, H / 2, 9, 0, Math.PI * 2); g.fill(); }
}

export function plateMaterial(text) {
  const c = document.createElement("canvas"); c.width = 1040; c.height = 224;
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 8;
  const mat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.45, metalness: 0.05 });
  mat.userData.setText = t => { drawPlate(c.getContext("2d"), t); tex.needsUpdate = true; };
  mat.userData.setText(text);
  // redraw once the plate font has arrived
  if (document.fonts && document.fonts.load) document.fonts.load(`700 150px ${FONT}`).then(() => mat.userData.setText(mat.userData.text)).catch(() => {});
  mat.userData.text = text;
  return mat;
}

// a plate as a thin box whose +x face carries the picture; back = true turns it to face rearwards
export function makePlate(mat, back) {
  const edge = new THREE.MeshStandardMaterial({ color: 0x1a1b1d, roughness: 0.6 });
  const m = new THREE.Mesh(new THREE.BoxGeometry(0.006, 0.112, 0.52), [mat, edge, edge, edge, edge, edge]);
  m.name = "plate"; if (back) m.rotation.y = Math.PI;
  return m;
}

// Adds plates to a loaded car. `spots` = [{ pos, back }] in the car frame; when omitted the
// model's own plate meshes (names containing "Plate") are hidden and replaced in place.
export function addPlates(cv, text, spots) {
  const root = cv.root, car = root.name === "car" ? root : root.getObjectByName("car") || root;
  const mat = plateMaterial(text || DEFAULT_PLATE);
  if (!spots) {
    spots = [];
    car.updateMatrixWorld(true);
    const inv = car.matrixWorld.clone().invert();
    root.traverse(o => {
      if (!o.isMesh || !/Plate/.test(o.name) || o.name === "plate") return;
      const b = new THREE.Box3().setFromObject(o).applyMatrix4(inv), c = b.getCenter(new THREE.Vector3());
      o.visible = false;
      spots.push({ pos: [c.x + (c.x > 1 ? 0.004 : -0.004), c.y, c.z], back: c.x < 1 });
    });
  }
  for (const s of spots) { const p = makePlate(mat, s.back); p.position.set(...s.pos); car.add(p); }
  cv.setPlate = t => { mat.userData.text = t; mat.userData.setText(t || DEFAULT_PLATE); };
}
