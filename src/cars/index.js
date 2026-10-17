// Available cars. To add one: drop its .glb into public/models/ (parts named as
// described in src/render/carModel.js -> rigCar) and add an entry here.
export const CARS = [
  { id: "cobalt", name: "Chevrolet Cobalt", model: "models/cobalt.glb" }
];
export const carById = id => CARS.find(c => c.id === id) || CARS[0];
