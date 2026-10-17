// Sanity checks for the lofted Cobalt body: outward normals, dimensions.
import { buildBodyGeometries, DIM } from "../src/render/cobaltBody.js";
const g = buildBodyGeometries();
const check = (name, geo, pick) => {
  const p = geo.attributes.position, n = geo.attributes.normal;
  let bad = 0, tot = 0;
  for (let i = 0; i < p.count; i++) { const r = pick(p.getX(i), p.getY(i), p.getZ(i), n.getX(i), n.getY(i), n.getZ(i)); if (r === null) continue; tot++; if (!r) bad++; }
  console.log(`${bad ? "FAIL" : "ok  "} ${name}: ${bad}/${tot} wrong`);
};
check("lower side normals point out", g.lower, (x, y, z, nx, ny, nz) => Math.abs(z) > 0.5 && y < 0.9 && x > 0.5 && x < 2.2 ? Math.sign(nz) === Math.sign(z) : null);
check("lower top normals point up", g.lower, (x, y, z, nx, ny, nz) => Math.abs(z) < 0.3 && x > 2.7 && x < 3.3 ? ny > 0 : null);
check("roof normals point up", g.green, (x, y, z, nx, ny, nz) => Math.abs(z) < 0.3 && x > 0.9 && x < 1.7 ? ny > 0 : null);
check("front cap faces forward", g.capFront, (x, y, z, nx) => nx > 0);
check("rear cap faces back", g.capRear, (x, y, z, nx) => nx < 0);
g.lower.computeBoundingBox(); g.green.computeBoundingBox();
const b = g.lower.boundingBox, r = g.green.boundingBox;
console.log("length", (b.max.x - b.min.x).toFixed(3), "width", (b.max.z - b.min.z).toFixed(3), "height", r.max.y.toFixed(3), "groups", g.lower.groups.map(x => x.count).join("/"), g.green.groups.map(x => x.count).join("/"));
