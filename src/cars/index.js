// Available cars. To add one: drop its .glb into public/models/ (parts named as
// described in src/render/carModel.js -> rigCar) and add an entry here.
// eye: driver's eye point; seat: passenger hip point (instructor); mirrors: rear-view mirror camera points (car frame, meters).
// spec: physics overrides of src/sim/vehicle.js SPEC (dimensions come from tools/prepare-*.mjs).
import COBALT from "./cobalt-dims.json";
import PREMIER from "./malibu-premier-dims.json";

// 1.5 turbo of the Malibu: flat torque from low revs
const TURBO = [[0, 60], [1000, 150], [1500, 235], [2500, 250], [4000, 250], [5000, 228], [5600, 200], [6200, 0]];
// engine sound: Cobalt 1.5 (naturally aspirated, buzzy) vs Malibu 1.5T (deeper, smoother, turbo whistle)
const NA = { harm: [0.55, 0.35, 0.3], drive: 2.6, filter: [700, 2600], gain: 1, turbo: 0 };
const TURBO_SOUND = { harm: [0.5, 0.2, 0.45], drive: 1.8, filter: [480, 1700], gain: 0.9, turbo: 1 };
export const CARS = [
  {
    id: "cobalt", name: "Chevrolet Cobalt", model: "models/cobalt.glb",
    credit: "3D model: \"Chevrolet Cobalt LTZ 2014\" by Q.SARDOR (Sketchfab), CC BY 4.0, modified",
    creditUrl: "https://sketchfab.com/3d-models/chevrolet-cobalt-ltz-2014-f91cbef731444f939e263041400216ca",
    dims: COBALT, eye: [1.38, 1.15, -0.3], seat: [1.5, 0.46, 0.36],
    mirrors: { center: [1.98, 1.3, 0], left: [2.33, 1.06, -0.93], right: [2.33, 1.06, 0.93] },
    sound: NA
  },
  {
    id: "malibu-premier", name: "Chevrolet Malibu 2 Premier", model: "models/malibu-premier.glb",
    credit: "3D model: \"2021 Chevrolet Malibu 2LZ Premier\" by twr422 (Sketchfab), CC BY 4.0, modified",
    creditUrl: "https://sketchfab.com/3d-models/2021-chevrolet-malibu-2lz-premier-c1e8e127ce114b14a166e93100642424",
    dims: PREMIER, eye: [1.37, 1.18, -0.389], seat: [1.5, 0.47, 0.389],
    mirrors: { center: [1.92, 1.32, 0], left: [2.3, 1.06, -1.0], right: [2.3, 1.06, 1.0] },
    spec: { mass: 1500, wb: PREMIER.wheelbase, rOh: PREMIER.rOh, fOh: PREMIER.fOh, width: 1.854, track: PREMIER.track, wheelR: PREMIER.wheelR, torque: TURBO, clutchCap: 400, autoForce: 5600 },
    sound: TURBO_SOUND
  }
];
// "malibu" was the Malibu XL model, now replaced by the Premier
export const carById = id => CARS.find(c => c.id === (id === "malibu" ? "malibu-premier" : id)) || CARS[0];
