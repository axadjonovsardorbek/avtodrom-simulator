// Available cars. To add one: drop its .glb into public/models/ (parts named as
// described in src/render/carModel.js -> rigCar) and add an entry here.
// eye: driver's eye point; seat: passenger hip point (instructor); mirrors: rear-view mirror camera points (car frame, meters).
// spec: physics overrides of src/sim/vehicle.js SPEC (dimensions come from tools/prepare-*.mjs).
import COBALT from "./cobalt-dims.json";
import MALIBU from "./malibu-dims.json";
export const CARS = [
  {
    id: "cobalt", name: "Chevrolet Cobalt", model: "models/cobalt.glb",
    credit: "3D model: \"Chevrolet Cobalt LTZ 2014\" by Q.SARDOR (Sketchfab), CC BY 4.0, modified",
    creditUrl: "https://sketchfab.com/3d-models/chevrolet-cobalt-ltz-2014-f91cbef731444f939e263041400216ca",
    dims: COBALT, eye: [1.38, 1.15, -0.3], seat: [1.5, 0.46, 0.36],
    mirrors: { center: [1.98, 1.3, 0], left: [2.33, 1.06, -0.93], right: [2.33, 1.06, 0.93] }
  },
  {
    id: "malibu", name: "Chevrolet Malibu 2", model: "models/malibu.glb",
    credit: "3D model: \"Chevrolet Malibu XL 2023\" (Uzbek 3D), used with the author's permission, modified",
    creditUrl: "",
    dims: MALIBU, eye: [1.29, 1.15, -0.386], seat: [1.42, 0.45, 0.386],
    mirrors: { center: [1.85, 1.3, 0], left: [2.05, 1.03, -0.98], right: [2.05, 1.03, 0.98] },
    spec: { mass: 1500, wb: MALIBU.wheelbase, rOh: MALIBU.rOh, fOh: MALIBU.fOh, width: 1.854, track: MALIBU.track, wheelR: MALIBU.wheelR }
  }
];
export const carById = id => CARS.find(c => c.id === id) || CARS[0];
