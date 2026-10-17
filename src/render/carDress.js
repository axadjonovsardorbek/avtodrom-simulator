// Brings the loaded 2014 Cobalt model closer to the current Uzbek-built car (2020+):
// paint colour choice, smoked headlamp housings, the MyLink touchscreen on the centre
// stack. Applied at load time because it needs canvas textures.
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
  // fit a plane to the dashboard surface between heights y0..y1 at lateral z (rays from the
  // cabin forwards), so the new parts sit just proud of it whatever the model's shape
  car.updateMatrixWorld(true);
  const dash = []; car.traverse(o => { if (o.isMesh && o.visible && /^painel/.test(o.name)) dash.push(o); });
  const onDash = (y0, y1, z, yc, fallback) => {
    const rc = new THREE.Raycaster(), pts = [];
    for (let y = y0; y <= y1 + 1e-6; y += 0.02) {
      rc.set(car.localToWorld(new THREE.Vector3(1.5, y, z)), new THREE.Vector3(1, 0, 0).transformDirection(car.matrixWorld));
      const h = rc.intersectObjects(dash, false)[0];
      if (h) pts.push(car.worldToLocal(h.point.clone()));
    }
    if (pts.length < 3) return face(...fallback);
    // least squares x = a + b y, then use the front-most (cabin-side) offset so nothing pokes through
    const n = pts.length, my = pts.reduce((t, p) => t + p.y, 0) / n, mx = pts.reduce((t, p) => t + p.x, 0) / n;
    const b = pts.reduce((t, p) => t + (p.y - my) * (p.x - mx), 0) / (pts.reduce((t, p) => t + (p.y - my) ** 2, 0) || 1);
    const a0 = Math.min(...pts.map(p => p.x - b * p.y));
    return face(a0 + b * yc - 0.006, yc, z, Math.atan(b));
  };
  // one tilted piano-black panel (as in the current car): the two centre vents on top,
  // the lock / hazard / ESC buttons, then the screen in a satin bezel
  // the 2014 round centre vents and their satin rings stay hidden behind the new panel
  car.traverse(o => { if (o.isMesh && /^painel_painel1/.test(o.name)) o.visible = false; });
  // laid on the dashboard surface (x 2.225 at y 0.80 down to 2.13 at y 0.60), just proud of it
  const stack = onDash(0.6, 0.82, 0.04, 0.735, [2.19, 0.735, 0.04, 0.44]);
  const trap = new THREE.Shape([[-0.13, 0.135], [0.13, 0.135], [0.116, -0.135], [-0.116, -0.135]].map(([x, y]) => new THREE.Vector2(x, y)));
  // a solid block that reaches back into the dashboard, so no gap shows round its edges
  const sideMat = new THREE.MeshStandardMaterial({ color: 0x3c3f44, roughness: 0.7 });
  const panel = new THREE.Mesh(new THREE.ExtrudeGeometry(trap, { depth: 0.16, bevelEnabled: true, bevelSize: 0.004, bevelThickness: 0.003, bevelSegments: 2 }), [piano, sideMat]);
  panel.position.z = -0.148; stack.add(panel);
  for (const sx of [-1, 1]) {                                             // satin side trims
    const e = new THREE.Mesh(new THREE.BoxGeometry(0.006, 0.272, 0.006), satin);
    e.position.set(sx * 0.123, 0, 0.014); e.rotation.z = sx * 0.065; stack.add(e);
  }
  const slatsTex = canvasTex(64, 64, (g, w, h) => {
    g.fillStyle = "#08090b"; g.fillRect(0, 0, w, h);
    for (let y = 4; y < h; y += 9) { g.fillStyle = "#34373c"; g.fillRect(0, y, w, 3); g.fillStyle = "#4e5258"; g.fillRect(0, y, w, 1); }
  });
  const slatMat = new THREE.MeshStandardMaterial({ map: slatsTex, roughness: 0.6 });
  for (const vx of [-0.058, 0.058]) {
    const v = new THREE.Mesh(new THREE.PlaneGeometry(0.094, 0.044), slatMat); v.position.set(vx, 0.09, 0.0125); stack.add(v);
    const tab = new THREE.Mesh(new THREE.BoxGeometry(0.016, 0.007, 0.008), satin); tab.position.set(vx, 0.065, 0.016); stack.add(tab);
  }
  for (const bx of [-0.07, 0.07]) {
    const b = new THREE.Mesh(new THREE.BoxGeometry(0.044, 0.014, 0.005), darkGrey); b.position.set(bx, 0.042, 0.014); stack.add(b);
  }
  const hazard = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.005, 3), new THREE.MeshStandardMaterial({ color: 0xd8262a, roughness: 0.4, emissive: 0x400000 }));
  hazard.rotation.x = Math.PI / 2; hazard.position.set(0, 0.042, 0.015); stack.add(hazard);
  const bezel = new THREE.Mesh(new THREE.BoxGeometry(0.176, 0.1, 0.004), satin); bezel.position.set(-0.008, -0.04, 0.0125); stack.add(bezel);
  const glassBlack = new THREE.Mesh(new THREE.PlaneGeometry(0.168, 0.092), piano); glassBlack.position.set(-0.008, -0.04, 0.0148); stack.add(glassBlack);
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(0.152, 0.084), new THREE.MeshBasicMaterial({ map: screenTexture(), toneMapped: false }));
  screen.position.set(-0.008, -0.04, 0.0152); stack.add(screen);
  // volume knob and the two track buttons at the right of the screen
  const vol = new THREE.Mesh(new THREE.CylinderGeometry(0.009, 0.009, 0.01, 20), satin); vol.rotation.x = Math.PI / 2; vol.position.set(0.096, -0.008, 0.017); stack.add(vol);
  for (const by of [-0.04, -0.062]) { const b = new THREE.Mesh(new THREE.BoxGeometry(0.014, 0.016, 0.004), darkGrey); b.position.set(0.096, by, 0.014); stack.add(b); }

  const climate = onDash(0.5, 0.6, 0.04, 0.555, [2.1, 0.555, 0.04, 0.3]);
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
