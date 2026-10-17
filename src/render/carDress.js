// Brings the loaded 2014 Cobalt model closer to the current Uzbek-built car (2020+):
// paint colour choice, smoked headlamp housings, the MyLink touchscreen on the centre
// stack and "COBALT" plates. Applied at load time because it needs canvas textures.
import * as THREE from "three";

export const COLORS = {
  white: { name: "Oq", color: 0xf3f4f2, metalness: 0.15, roughness: 0.28 },
  blue: { name: "To'q ko'k", color: 0x1b2b63, metalness: 0.55, roughness: 0.3 },
  graphite: { name: "Grafit", color: 0x3a3d41, metalness: 0.55, roughness: 0.3 }
};

function canvasTex(w, h, draw) {
  const c = document.createElement("canvas"); c.width = w; c.height = h;
  draw(c.getContext("2d"), w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return t;
}

// MyLink home screen: apps row, status bar
function screenTexture() {
  return canvasTex(512, 300, (g, w, h) => {
    g.fillStyle = "#07090c"; g.fillRect(0, 0, w, h);
    const bg = g.createLinearGradient(0, 0, 0, h); bg.addColorStop(0, "#141a24"); bg.addColorStop(1, "#05070a");
    g.fillStyle = bg; g.fillRect(14, 14, w - 28, h - 28);
    const apps = [["#7b5cff", "Audiosistema"], ["#ff9f2e", "Telefon"], ["#3fb2ff", "Sozlamalar"], ["#ff4d5e", "Apple CarPlay"], ["#4fd27a", "Android Auto"]];
    g.textAlign = "center"; g.font = "15px sans-serif";
    apps.forEach(([col, name], i) => {
      const x = 80 + (i % 4) * 116, y = i < 4 ? 95 : 200;
      g.fillStyle = col; g.beginPath(); g.arc(x, y, 26, 0, Math.PI * 2); g.fill();
      g.fillStyle = "rgba(255,255,255,.85)"; g.beginPath(); g.arc(x, y, 9, 0, Math.PI * 2); g.fill();
      g.fillStyle = "#d9dee6"; g.fillText(name, x, y + 46);
    });
    g.fillStyle = "#9aa3ae"; g.font = "16px sans-serif"; g.textAlign = "left"; g.fillText("⌂  ♪  ✆", 26, h - 24);
    g.textAlign = "right"; g.fillText("24°   10:45", w - 26, h - 24);
  });
}

function plateTexture() {
  return canvasTex(520, 112, (g, w, h) => {
    g.fillStyle = "#0d0e10"; g.fillRect(0, 0, w, h);
    g.strokeStyle = "#c9ccd1"; g.lineWidth = 6; g.strokeRect(5, 5, w - 10, h - 10);
    g.fillStyle = "#f2f3f5"; g.font = "bold 76px sans-serif"; g.textAlign = "center"; g.textBaseline = "middle";
    g.fillText("COBALT", w / 2, h / 2 + 4);
  });
}

export function dressCobalt(cv) {
  const root = cv.root;
  const car = root.name === "car" ? root : root.getObjectByName("car");
  if (!car) return;
  let paint = null;
  const smoked = new THREE.MeshStandardMaterial({ name: "lamp_housing", color: 0x2a2d32, metalness: 0.9, roughness: 0.25 });
  car.traverse(o => {
    if (!o.isMesh) return;
    if (o.material && o.material.name === "paint") paint = o.material;
    // the facelift has black headlamp housings around a chrome projector
    if (/^fara_escape/.test(o.name)) o.material = smoked;
    // darker tint on the front door windows too
    if (/^door_(lf|rf)_ok_glass/.test(o.name)) { o.material = o.material.clone(); o.material.opacity = 0.42; }
  });

  // 8" touchscreen over the old radio panel on the centre stack (it faces the cabin, tilted back)
  const stack = new THREE.Group(); stack.position.set(2.108, 0.66, 0); stack.rotation.set(-0.19, -Math.PI / 2, 0, "YXZ");
  const bezel = new THREE.Mesh(new THREE.BoxGeometry(0.235, 0.15, 0.012), new THREE.MeshPhysicalMaterial({ color: 0x050607, roughness: 0.15, clearcoat: 1 }));
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(0.19, 0.112), new THREE.MeshBasicMaterial({ map: screenTexture(), toneMapped: false }));
  screen.position.z = 0.0065;
  const hazard = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.006, 3), new THREE.MeshStandardMaterial({ color: 0xd8262a, roughness: 0.4 }));
  hazard.rotation.x = Math.PI / 2; hazard.position.set(0, 0.066, 0.008);
  stack.add(bezel, screen, hazard); car.add(stack);

  // black "COBALT" plates front and rear, where the source has the plate holder screws
  const plateMat = new THREE.MeshStandardMaterial({ map: plateTexture(), roughness: 0.5, metalness: 0.2 });
  const front = new THREE.Mesh(new THREE.BoxGeometry(0.006, 0.112, 0.52), [0, 0, 0, 0, 0, 0].map((_, i) => i === 0 ? plateMat : new THREE.MeshStandardMaterial({ color: 0x0d0e10 })));
  front.position.set(3.582, 0.45, 0); car.add(front);
  const rear = front.clone(); rear.position.set(-0.882, 0.545, 0); rear.rotation.y = Math.PI; car.add(rear);

  // rectangular vents of the facelift dashboard over the round 2014 ones
  const slats = canvasTex(64, 64, (g, w, h) => {
    g.fillStyle = "#0b0c0e"; g.fillRect(0, 0, w, h);
    for (let y = 4; y < h; y += 9) { g.fillStyle = "#3a3d42"; g.fillRect(0, y, w, 3); g.fillStyle = "#55595f"; g.fillRect(0, y, w, 1); }
  });
  const ventFrame = new THREE.MeshPhysicalMaterial({ color: 0x1a1b1e, roughness: 0.3, clearcoat: 0.6 });
  const ventGrille = new THREE.MeshStandardMaterial({ map: slats, roughness: 0.6 });
  const vent = (x, y, z, w, h, tilt) => {
    const g = new THREE.Group(); g.position.set(x, y, z); g.rotation.set(0, -Math.PI / 2, 0, "YXZ"); g.rotateX(-tilt);
    const frame = new THREE.Mesh(new THREE.BoxGeometry(w + 0.024, h + 0.024, 0.03), ventFrame); g.add(frame);
    const grille = new THREE.Mesh(new THREE.PlaneGeometry(w, h), ventGrille); grille.position.z = 0.0155; g.add(grille);
    const tab = new THREE.Mesh(new THREE.BoxGeometry(0.014, 0.008, 0.012), new THREE.MeshStandardMaterial({ color: 0x8c9096, metalness: 0.8, roughness: 0.3 }));
    tab.position.set(0, -h / 2 + 0.004, 0.02); g.add(tab);
    car.add(g);
  };
  vent(2.215, 0.826, -0.022, 0.105, 0.062, 0.15);    // centre pair
  vent(2.215, 0.826, 0.098, 0.105, 0.062, 0.15);
  vent(2.19, 0.752, -0.565, 0.1, 0.062, 0.05);       // sides
  vent(2.19, 0.752, 0.585, 0.1, 0.062, 0.05);

  // gold bowtie on the airbag cover, kept level in the wheel's own frame
  const wheel = car.getObjectByName("steering_wheel");
  if (wheel) {
    const sh = new THREE.Shape([[-0.5, 0.3], [-0.18, 0.3], [-0.18, 0.5], [0.18, 0.5], [0.18, 0.3], [0.44, 0.3], [0.5, -0.3],
      [0.18, -0.3], [0.18, -0.5], [-0.18, -0.5], [-0.18, -0.3], [-0.44, -0.3]].map(([x, y]) => new THREE.Vector2(x, y)));
    const geo = new THREE.ExtrudeGeometry(sh, { depth: 0.04, bevelEnabled: false });
    const tie = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ name: "bowtie_gold", color: 0xd7a531, metalness: 1, roughness: 0.25 }));
    tie.scale.set(0.068, 0.026, 0.05);
    // which way is "up" on the wheel when it is straight
    wheel.updateMatrixWorld(true);
    const up = new THREE.Vector3(0, 1, 0).transformDirection(car.matrixWorld).applyQuaternion(wheel.getWorldQuaternion(new THREE.Quaternion()).invert());
    const holder = new THREE.Group(); holder.rotation.z = Math.atan2(-up.x, up.y);
    holder.position.set(0, 0, -0.008);                // just proud of the hub face (local -z faces the driver)
    tie.rotation.y = Math.PI;                         // extrude towards the hub, face the driver
    holder.add(tie); wheel.add(holder);
  }
  car.traverse(o => { if (o.isMesh && o.material && o.material.name === "lamp_head") { Object.assign(o.material, { metalness: 0.35, roughness: 0.35 }); o.material.color.setHex(0x3a3e44); o.material.emissive.setHex(0x8a8070); } });

  cv.setPaint = id => {
    const c = COLORS[id] || COLORS.white;
    if (paint) { paint.color.setHex(c.color); paint.metalness = c.metalness; paint.roughness = c.roughness; }
  };
}
