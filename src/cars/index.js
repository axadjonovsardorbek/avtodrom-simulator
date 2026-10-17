// Available cars. To add one: drop its .glb into public/models/ (parts named as
// described in src/render/carModel.js -> rigCar) and add an entry here.
// eye: driver's eye point; seat: passenger hip point (instructor); mirrors: rear-view mirror camera points (car frame, meters).
export const CARS = [
  {
    id: "cobalt", name: "Chevrolet Cobalt", model: "models/cobalt.glb",
    credit: "3D model: \"Chevrolet Cobalt LTZ 2014\" by Q.SARDOR (Sketchfab), CC BY 4.0, modified",
    creditUrl: "https://sketchfab.com/3d-models/chevrolet-cobalt-ltz-2014-f91cbef731444f939e263041400216ca",
    eye: [1.38, 1.15, -0.3], seat: [1.5, 0.46, 0.36],
    mirrors: { center: [1.98, 1.3, 0], left: [2.33, 1.06, -0.93], right: [2.33, 1.06, 0.93] }
  }
];
export const carById = id => CARS.find(c => c.id === id) || CARS[0];
