// What is paid and who has it. The admin decides (server: GET /api/shop): whether selling is on at all, which items
// are paid ("car:<id>", "instructor:rude"), and the products on sale (an item, or the bundle "all", for a price and
// a number of days). An owner of "all" has every item. Without a server (a copy hosted on its own) everything is
// open. The pictures and models are public files, so this is a lock on the menu, not on the files.
import { apiOn, getUser, api } from "./api.js";

// until the server answers: the newer cars and the 18+ instructor are paid (as the server starts)
let shop = { enabled: true, paid: ["car:malibu-premier", "car:malibu-2019", "car:kia-k5", "car:passat-2022", "car:passat-pro", "instructor:rude"], products: [], payments: false };
let loading = null;
export function loadShop() {
  if (!apiOn) return Promise.resolve(shop);
  return loading || (loading = api("/api/shop", { timeout: 8000 }).then(s => { shop = s; return s; }).catch(() => { loading = null; return shop; }));
}
export const shopInfo = () => shop;

export const ITEM_NAMES = { "instructor:rude": "18+ instruktor", all: "Hammasi" };
export const carItem = car => "car:" + car.id;
export function owns(item) {
  if (!apiOn) return true;
  const u = getUser();
  return !!u && ((u.owns || []).includes(item) || (u.owns || []).includes("all"));
}
export const locked = item => apiOn && shop.enabled && shop.paid.includes(item) && !owns(item);
export const carLocked = car => locked(carItem(car));
export const moodLocked = mood => mood === "rude" && locked("instructor:rude");

// the products that open an item: its own, and the bundles that hold it (or everything)
export const productsFor = item => shop.products.filter(p => p.items.includes(item) || p.items.includes("all"));

export const quote = (product, promo) => api("/api/shop/quote", { method: "POST", body: { product, promo } });
export const buy = (product, promo) => api("/api/shop/buy", { method: "POST", body: { product, promo } });
export const orderStatus = id => api("/api/shop/orders/" + encodeURIComponent(id));
