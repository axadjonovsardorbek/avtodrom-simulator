// paid: sold from the start (the admin's shop settings decide in the end, src/net/shop.js)
// Available cars. To add one: drop its .glb into public/models/ (parts named as
// described in src/render/carModel.js -> rigCar) and add an entry here.
// eye: driver's eye point; seat: passenger hip point (instructor); mirrors: rear-view mirror camera points (car frame, meters).
// spec: physics overrides of src/sim/vehicle.js SPEC (dimensions come from tools/prepare-*.mjs).
import COBALT from "./cobalt-dims.json";
import PREMIER from "./malibu-premier-dims.json";
import MALIBU19 from "./malibu-2019-dims.json";
import MONZA from "./monza-dims.json";
import MATIZ from "./matiz-dims.json";
import DAMAS from "./damas-dims.json";
import K5 from "./kia-k5-dims.json";
import PASSAT22 from "./passat-2022-dims.json";
import PASSATPRO from "./passat-pro-dims.json";

// Monza 1.5 (113 hp): a little more torque than the Cobalt's
// 0.8 litre engines of the Matiz and the Damas
const NA08 = [[0, 30], [1000, 58], [2000, 66], [3000, 70], [4000, 72], [5000, 68], [6000, 55], [6500, 0]];
const NA08_DAMAS = [[0, 28], [1000, 52], [2000, 60], [3000, 62], [3800, 62], [4800, 56], [5500, 0]];
const NA15 = [[0, 55], [1000, 112], [2000, 132], [3000, 140], [4000, 146], [5000, 140], [6000, 118], [6600, 0]];
// 1.5 turbo of the Malibu: flat torque from low revs
const TURBO = [[0, 60], [1000, 150], [1500, 235], [2500, 250], [4000, 250], [5000, 228], [5600, 200], [6200, 0]];
// 2.0 turbo of the Passat Pro 380TSI
const TURBO20 = [[0, 80], [1000, 220], [1500, 350], [4000, 350], [5000, 320], [6000, 270], [6500, 0]];
// engine sound: Cobalt 1.5 (naturally aspirated, buzzy) vs Malibu 1.5T (deeper, smoother, turbo whistle)
const NA = { harm: [0.55, 0.35, 0.3], drive: 2.6, filter: [700, 2600], gain: 1, turbo: 0 };
const TURBO_SOUND = { harm: [0.5, 0.2, 0.45], drive: 1.8, filter: [480, 1700], gain: 0.9, turbo: 1 };
export const CARS = [
  {
    id: "cobalt", name: "Chevrolet Cobalt", model: "models/cobalt.glb", info: "1.5 · 106 o.k. · 4,48 m",
    credit: "3D model: \"Chevrolet Cobalt LTZ 2014\" by Q.SARDOR (Sketchfab), CC BY 4.0, modified",
    creditUrl: "https://sketchfab.com/3d-models/chevrolet-cobalt-ltz-2014-f91cbef731444f939e263041400216ca",
    dims: COBALT, eye: [1.38, 1.15, -0.3], seat: [1.5, 0.46, 0.36],
    mirrors: { center: [1.98, 1.3, 0], left: [2.33, 1.06, -0.93], right: [2.33, 1.06, 0.93] },
    sound: NA,
    voice: { url: "cobalt.mp3", from: 4, dur: 3 }          // plays from the 4th second when the car is picked
  },
  {
    id: "malibu-premier", plateY: [0.47, 0.82], paid: true, name: "Chevrolet Malibu 2 Premier", model: "models/malibu-premier.glb", info: "1.5 Turbo · 163 o.k. · 4,93 m",
    credit: "3D model: \"2021 Chevrolet Malibu 2LZ Premier\" by twr422 (Sketchfab), CC BY 4.0, modified",
    creditUrl: "https://sketchfab.com/3d-models/2021-chevrolet-malibu-2lz-premier-c1e8e127ce114b14a166e93100642424",
    dims: PREMIER, eye: [1.37, 1.18, -0.389], seat: [1.5, 0.47, 0.389],
    // the centre screen (the bowtie picture in its dashboard texture) shows public/ads/ads.json
    screen: { mat: "selfillumdiffuse__dash", uv: [0.755, 0.995, 0.87, 0.995] },
    mirrors: { center: [1.92, 1.32, 0], left: [2.3, 1.06, -1.0], right: [2.3, 1.06, 1.0] },
    spec: { mass: 1500, wb: PREMIER.wheelbase, rOh: PREMIER.rOh, fOh: PREMIER.fOh, width: 1.854, track: PREMIER.track, wheelR: PREMIER.wheelR, torque: TURBO, clutchCap: 400, autoForce: 5600 },
    sound: TURBO_SOUND,
    voice: { url: "guvohnoma.mp3", from: 0 }
  },
  {
    id: "malibu-2019", plateY: [0.456, 0.82], paid: true, name: "Chevrolet Malibu 2019", model: "models/malibu-2019.glb", info: "1.5 Turbo · 163 o.k. · 4,92 m",
    credit: "3D model: \"2019 Chevrolet Malibu Premier\" (Sketchfab), modified", creditUrl: "",
    dims: MALIBU19, eye: [1.35, 1.17, -0.385], seat: [1.48, 0.46, 0.385],
    screen: { at: { c: [2.148, 0.935, -0.006], n: [-0.87, 0.5, 0], w: 0.152, h: 0.085 } },
    mirrors: { center: [1.9, 1.32, 0], left: [2.3, 1.06, -1.0], right: [2.3, 1.06, 1.0] },
    spec: { mass: 1500, wb: MALIBU19.wheelbase, rOh: MALIBU19.rOh, fOh: MALIBU19.fOh, width: 1.854, track: MALIBU19.track, wheelR: MALIBU19.wheelR, torque: TURBO, clutchCap: 400, autoForce: 5600 },
    sound: TURBO_SOUND,
    voice: { url: "katta.mp3", from: 0, dur: 4 }
  },
  {
    id: "monza", name: "Chevrolet Monza", model: "models/monza.glb", info: "1.5 · 113 o.k. · 4,66 m",
    credit: "3D model: \"2023 Chevrolet Monza\" (Sketchfab), modified", creditUrl: "",
    dims: MONZA, eye: [1.21, 1.16, -0.41], seat: [1.35, 0.46, 0.41],
    screen: { at: { c: [1.904, 0.966, 0.025], n: [-0.99, 0.09, -0.13], w: 0.128, h: 0.105 } },
    mirrors: { center: [1.76, 1.3, 0], left: [2.15, 1.05, -0.98], right: [2.15, 1.05, 0.98] },
    spec: { mass: 1320, wb: MONZA.wheelbase, rOh: MONZA.rOh, fOh: MONZA.fOh, width: 1.80, track: MONZA.track, wheelR: MONZA.wheelR, torque: NA15, clutchCap: 300, autoForce: 4700 },
    sound: NA,
    voice: { url: "monzachila_shottamisila.mp3", from: 1.7, dur: 1.8 }
  },
  {
    id: "matiz", plateY: [0.47, 0.79], name: "Daewoo Matiz", model: "models/matiz.glb", info: "0.8 · 51 o.k. · 3,50 m",
    credit: "3D model: \"Daewoo Matiz [FULL INTERIOR]\" by ALEX MILOS (Sketchfab), CC BY 4.0, modified",
    creditUrl: "https://sketchfab.com/3d-models/daewoo-matiz-full-interior-c2bb5406a5f8484d9e76e0deb044f5b5",
    dims: MATIZ, eye: [1.05, 1.13, -0.331], seat: [1.06, 0.4, 0.331],
    mirrors: { center: [1.6, 1.22, 0], left: [1.95, 0.95, -0.85], right: [1.95, 0.95, 0.85] },
    spec: { mass: 850, wb: MATIZ.wheelbase, rOh: MATIZ.rOh, fOh: MATIZ.fOh, width: 1.6, track: MATIZ.track, wheelR: MATIZ.wheelR, torque: NA08, clutchCap: 130, autoForce: 2600, maxRpm: 6200 },
    sound: { ...NA, filter: [800, 2800] },
    voice: { url: "matiz.m4a", from: 0, dur: 4 }
  },
  {
    id: "damas", plateY: [0.57, 0.61], name: "Chevrolet Damas", model: "models/damas.glb", info: "0.8 · 38 o.k. · 3,50 m",
    credit: "3D model: \"Chevrolet Damas\" (Sketchfab), modified", creditUrl: "",
    dims: DAMAS, eye: [1.5, 1.4, -0.332], seat: [1.48, 0.66, 0.332],
    mirrors: { center: [2.1, 1.55, 0], left: [2.16, 1.4, -0.82], right: [2.16, 1.4, 0.82] },
    spec: { mass: 900, wb: DAMAS.wheelbase, rOh: DAMAS.rOh, fOh: DAMAS.fOh, width: 1.5, track: DAMAS.track, wheelR: DAMAS.wheelR, torque: NA08_DAMAS, clutchCap: 110, autoForce: 2300, maxRpm: 5800 },
    sound: { ...NA, filter: [800, 2800] },
    voice: { url: "damas.mp3", from: 33, dur: 4.3 }
  },
  {
    id: "kia-k5", plateY: [0.53, 0.67], paid: true, name: "Kia K5", model: "models/kia-k5.glb", info: "1.6 Turbo · 180 o.k. · 4,91 m",
    credit: "3D model: \"Kia K5 2025\" (Sketchfab), modified", creditUrl: "",
    dims: K5, eye: [1.2, 1.12, -0.386], seat: [1.33, 0.44, 0.386],
    screen: { at: { c: [2.032, 0.938, 0.006], n: [-0.985, 0.172, 0], w: 0.262, h: 0.09 } },      // the centre screen, measured from the seat
    mirrors: { center: [1.75, 1.24, 0], left: [2.15, 1.02, -0.98], right: [2.15, 1.02, 0.98] },
    spec: { mass: 1450, wb: K5.wheelbase, rOh: K5.rOh, fOh: K5.fOh, width: 1.86, track: K5.track, wheelR: K5.wheelR, torque: TURBO, clutchCap: 400, autoForce: 5800 },
    sound: TURBO_SOUND
  },
  {
    id: "passat-2022", plateY: [0.404, 0.748], paid: true, name: "Volkswagen Passat 2022", model: "models/passat-2022.glb", info: "1.4 TSI · 150 o.k. · 4,78 m",
    credit: "3D model: \"Volkswagen Passat 2022\" (Sketchfab), modified", creditUrl: "",
    dims: PASSAT22, eye: [1.19, 1.16, -0.374], seat: [1.32, 0.46, 0.374],
    screen: { at: { c: [1.967, 0.829, 0.026], n: [-0.94, 0.35, 0], w: 0.105, h: 0.07 } },
    mirrors: { center: [1.74, 1.29, 0], left: [2.14, 1.06, -0.94], right: [2.14, 1.06, 0.94] },
    spec: { mass: 1480, wb: PASSAT22.wheelbase, rOh: PASSAT22.rOh, fOh: PASSAT22.fOh, width: 1.83, track: PASSAT22.track, wheelR: PASSAT22.wheelR, torque: TURBO, clutchCap: 400, autoForce: 5600 },
    sound: TURBO_SOUND
  },
  {
    id: "passat-pro", plateY: [0.496, 0.788], paid: true, name: "Volkswagen Passat Pro", model: "models/passat-pro.glb", info: "2.0 TSI · 220 o.k. · 5,01 m",
    credit: "3D model: \"2025 Volkswagen Passat Pro 380TSI\" (Sketchfab), modified", creditUrl: "",
    dims: PASSATPRO, eye: [1.3, 1.22, -0.36], seat: [1.43, 0.5, 0.36],
    screen: { at: { c: [2.069, 0.988, 0.018], n: [-0.98, 0.12, -0.17], w: 0.285, h: 0.148 } },
    mirrors: { center: [1.85, 1.34, 0], left: [2.25, 1.12, -1.0], right: [2.25, 1.12, 1.0] },
    spec: { mass: 1580, wb: PASSATPRO.wheelbase, rOh: PASSATPRO.rOh, fOh: PASSATPRO.fOh, width: 1.84, track: PASSATPRO.track, wheelR: PASSATPRO.wheelR, torque: TURBO20, clutchCap: 500, autoForce: 6800 },
    sound: TURBO_SOUND
  }
];
// "malibu" was the Malibu XL model, now replaced by the Premier
// every car the simulator has; CARS itself loses the ones the admin switched off (server: /api/config)
export const ALL_CARS = CARS.slice();
export function setDisabledCars(ids) {
  const off = new Set(ids || []), keep = ALL_CARS.filter(c => !off.has(c.id));
  CARS.splice(0, CARS.length, ...(keep.length ? keep : ALL_CARS.slice(0, 1)));     // never none
}
export const carById = id => CARS.find(c => c.id === (id === "malibu" ? "malibu-premier" : id)) || CARS[0];
