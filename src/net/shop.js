// What is paid and who has it. The Cobalt, Matiz, Damas and Monza and the calm and the angry instructor are free;
// the other cars (paid: true in src/cars/index.js) and the 18+ instructor are bought (server: purchases, filled
// by a payment or by the admin). Without a server (a copy hosted on its own) everything is open, as before.
// The pictures and models are public files, so this is a lock on the menu, not on the files.
import { apiOn, getUser } from "./api.js";

export const ITEM_NAMES = { "instructor:rude": "18+ instruktor" };
export const carItem = car => "car:" + car.id;
export function owns(item) {
  if (!apiOn) return true;
  const u = getUser();
  return !!u && (u.admin || (u.owns || []).includes(item));
}
export const carLocked = car => !!car.paid && !owns(carItem(car));
export const moodLocked = mood => mood === "rude" && !owns("instructor:rude");
