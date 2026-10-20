// Solid things in the world (poles, trunks, the fence, the building) as small circles, and the car's
// reaction when it touches one: pushed out, speed killed, a little turn away from the contact.
const CELL = 6;

export function buildSolidGrid(solids) {
  const grid = new Map();
  solids.forEach((s, i) => {
    const r = s[2];
    for (let gx = Math.floor((s[0] - r) / CELL); gx <= Math.floor((s[0] + r) / CELL); gx++)
      for (let gy = Math.floor((s[1] - r) / CELL); gy <= Math.floor((s[1] + r) / CELL); gy++) {
        const k = gx + "," + gy; (grid.get(k) || grid.set(k, []).get(k)).push(i);
      }
  });
  return grid;
}

// Returns the strongest contact this step ({ index, speed }) or null. Mutates the car.
export function collideCar(car, solids, grid) {
  if (!solids.length) return null;
  const s = car.spec, hw = s.width / 2, F = car.front, R = car.rear, c = Math.cos(car.th), n = Math.sin(car.th);
  const seen = new Set(); let worst = null;
  for (let gx = Math.floor((car.x - 6) / CELL); gx <= Math.floor((car.x + 6) / CELL); gx++)
    for (let gy = Math.floor((car.y - 6) / CELL); gy <= Math.floor((car.y + 6) / CELL); gy++) {
      const cell = grid.get(gx + "," + gy); if (!cell) continue;
      for (const i of cell) {
        if (seen.has(i)) continue; seen.add(i);
        const [sx, sy, r] = solids[i];
        const dx = sx - car.x, dy = sy - car.y, lx = dx * c + dy * n, ly = -dx * n + dy * c;
        const px = Math.max(R, Math.min(F, lx)), py = Math.max(-hw, Math.min(hw, ly));
        let ex = lx - px, ey = ly - py, d = Math.hypot(ex, ey);
        if (d >= r) continue;
        if (d < 1e-6) { ex = 1; ey = 0; d = 0; }                              // centre inside the box: push along x
        const nlx = d ? ex / d : ex, nly = d ? ey / d : ey, pen = r - d;
        // normal in the world, pointing from the car to the post
        const nx = nlx * c - nly * n, ny = nlx * n + nly * c;
        car.x -= nx * pen; car.y -= ny * pen;
        const along = c * nx + n * ny;                                         // how head-on the contact is
        const vn = car.v * along;                                              // closing speed along the normal
        if (vn > 0) {
          car.v -= (1.15) * vn * along;                                        // lose the normal part, bounce a little
          const rx = px - (F + R) / 2, torque = -rx * nly + py * nlx;          // which way the contact point turns the car
          car.th += Math.sign(torque) * Math.min(0.06, vn * 0.012);
          if (car.jolt) car.jolt(-nlx * vn * 0.09, nly * vn * 0.09);              // the nose dips into a head-on hit, the roof leans into a side one
          if (!worst || vn > worst.speed) worst = { index: i, speed: vn };
        } else if (vn < 0 && car.v < 0) {                                      // reversing into it
          const vb = -vn;
          car.v += 1.15 * vb * Math.abs(along);
          if (car.jolt) car.jolt(-nlx * vb * 0.09, nly * vb * 0.09);
          if (!worst || vb > worst.speed) worst = { index: i, speed: vb };
        }
      }
    }
  return worst;
}
