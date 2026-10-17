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

// colour choice for any car whose body paint material is called "paint"
export function addPaint(cv) {
  const paints = [];
  cv.root.traverse(o => { if (o.isMesh) for (const m of [].concat(o.material)) if (m.name === "paint" && !paints.includes(m)) paints.push(m); });
  cv.setPaint = id => {
    const c = COLORS[id] || COLORS.white;
    for (const p of paints) { p.color.setHex(c.color); p.metalness = c.metalness; p.roughness = c.roughness; if (p.map) p.map = null; p.needsUpdate = true; }
  };
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

  // facelift centre stack: piano-black frame with a button row, the 8" MyLink screen,
  // and the climate panel with three round knobs below (all faces point at the cabin)
  const piano = new THREE.MeshPhysicalMaterial({ color: 0x050607, roughness: 0.12, clearcoat: 1, clearcoatRoughness: 0.05 });
  const satin = new THREE.MeshStandardMaterial({ color: 0x9da1a7, roughness: 0.3, metalness: 0.85 });
  const darkGrey = new THREE.MeshStandardMaterial({ color: 0x2b2d31, roughness: 0.7 });
  const face = (x, y, z, tilt) => { const g = new THREE.Group(); g.position.set(x, y, z); g.rotation.set(-tilt, -Math.PI / 2, 0, "YXZ"); car.add(g); return g; };
  const stack = face(2.105, 0.68, 0.04, 0.19);
  const frame = new THREE.Mesh(new THREE.BoxGeometry(0.27, 0.2, 0.02), piano); frame.position.y = 0.012; stack.add(frame);
  const trimL = new THREE.Mesh(new THREE.BoxGeometry(0.006, 0.2, 0.024), satin); trimL.position.set(-0.137, 0.012, 0); stack.add(trimL);
  const trimR = trimL.clone(); trimR.position.x = 0.137; stack.add(trimR);
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(0.19, 0.112), new THREE.MeshBasicMaterial({ map: screenTexture(), toneMapped: false }));
  screen.position.set(0, -0.012, 0.0105); stack.add(screen);
  // button row above the screen: lock, hazard (red triangle), traction
  for (const [bx, w] of [[-0.075, 0.05], [0.075, 0.05]]) {
    const b = new THREE.Mesh(new THREE.BoxGeometry(w, 0.018, 0.006), darkGrey); b.position.set(bx, 0.088, 0.011); stack.add(b);
  }
  const hazard = new THREE.Mesh(new THREE.CylinderGeometry(0.009, 0.009, 0.006, 3), new THREE.MeshStandardMaterial({ color: 0xd8262a, roughness: 0.4, emissive: 0x400000 }));
  hazard.rotation.x = Math.PI / 2; hazard.position.set(0, 0.088, 0.013); stack.add(hazard);
  // volume knob and track buttons at the right of the screen
  const vol = new THREE.Mesh(new THREE.CylinderGeometry(0.011, 0.011, 0.012, 20), satin); vol.rotation.x = Math.PI / 2; vol.position.set(0.118, 0.045, 0.014); stack.add(vol);

  const climate = face(2.085, 0.56, 0.04, 0.15);
  const cpanel = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.07, 0.016), darkGrey); climate.add(cpanel);
  const ringTex = (col) => canvasTex(64, 64, (g, w) => {
    const grd = g.createLinearGradient(0, 0, w, 0); grd.addColorStop(0, "#2f7bff"); grd.addColorStop(1, "#ff3b30");
    g.fillStyle = "#16171a"; g.fillRect(0, 0, w, w);
    g.lineWidth = 6; g.strokeStyle = col === "temp" ? grd : "#c9ccd1"; g.beginPath(); g.arc(32, 32, 26, Math.PI * 0.7, Math.PI * 2.3); g.stroke();
  });
  [["temp", -0.075], ["fan", 0], ["mode", 0.075]].forEach(([k, kx]) => {
    const ring = new THREE.Mesh(new THREE.CircleGeometry(0.026, 28), new THREE.MeshStandardMaterial({ map: ringTex(k), roughness: 0.5 }));
    ring.position.set(kx, 0, 0.0085); climate.add(ring);
    const knob = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.017, 0.014, 28), piano); knob.rotation.x = Math.PI / 2; knob.position.set(kx, 0, 0.015); climate.add(knob);
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.0165, 0.0165, 0.003, 28), satin); cap.rotation.x = Math.PI / 2; cap.position.set(kx, 0, 0.0225); climate.add(cap);
  });

  // instrument cluster: the facelift's analogue tacho + speedo with a digital centre,
  // fed by the simulator's live cluster canvas, under a dark hood
  if (cv.clusterTex) {
    const cl = face(2.215, 0.81, -0.29, 0.3);
    const hood = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.17, 0.06, 32, 1, true, -Math.PI / 2 - 0.9, 1.8), darkGrey);
    hood.rotation.x = Math.PI / 2; hood.scale.set(1, 1, 1); hood.position.set(0, -0.09, 0.03); hood.material.side = THREE.DoubleSide; cl.add(hood);
    const back = new THREE.Mesh(new THREE.PlaneGeometry(0.255, 0.105), new THREE.MeshBasicMaterial({ color: 0x050607 })); back.position.z = -0.002; cl.add(back);
    const dial = new THREE.Mesh(new THREE.PlaneGeometry(0.24, 0.09), new THREE.MeshBasicMaterial({ map: cv.clusterTex, toneMapped: false })); cl.add(dial);
  }

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
