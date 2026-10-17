# Avtodrom simulyatori

B toifa haydovchilik guvohnomasi amaliy imtihoniga (avtodrom qismi) tayyorlanish uchun 3D simulyator. Mashqlar ketma-ketligi Toshkent imtihon markazi normasiga, jarima ballari esa rasmiy jadvalga asoslangan.

## Ishga tushirish

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # dist/ papkasiga tayyor sayt
npm test           # brauzersiz testlar: fizika, trassa, qoidalar
npm run export:car # public/models/cobalt.glb ni kod modelidan qayta yaratish (Chrome kerak)
```

Havola orqali to'g'ridan-to'g'ri ochish: `#imtihon`, `#trening`, `#mashq-ilon` (yoki boshqa element id).

## Rejimlar

- **Imtihon**: butun avtodrom bo'ylab 13 mashq ketma-ket. Jarima 20 balldan oshsa, imtihon to'xtatiladi.
- **Trening**: xuddi shu marshrut, lekin xatodan keyin ham davom etasiz.
- **Alohida mashq**: 12 elementdan birini qisqa maydonda mashq qilish.

## Boshqaruv

| Tugma | Vazifa |
|---|---|
| W / ↑ | Gaz |
| S / ↓ | Tormoz |
| Shift | Ilashish (qo'yib yuborilganda asta qaytadi) |
| A D / ← → | Rul |
| 1–5, R, N | Uzatmalar (mexanik); avtomatda F = D, R, N, P |
| I | Dvigatel |
| Space | Qo'l tormozi |
| Q / E | Burilish chiroqlari |
| H | Avariya ishorasi |
| K | Kamar |
| Z / X | Chapga / o'ngga qarash |
| C, M, L, Esc | Kamera, xarita, ovoz, menyu |

Rul yoki gamepad (standart mapping): chap stik rul, RT gaz, LT tormoz, LB ilashish, A/B uzatma.

## Mashinalar

Mashinalar ro'yxati `src/cars/index.js` da. Har bir mashina `public/models/` dagi `.glb` fayldan yuklanadi.
Hozircha bitta mashina bor: Chevrolet Cobalt (`cobalt.glb`). Bu model kod orqali yasalgan (`src/render/cobaltBody.js`, `src/render/carModel.js`) va `npm run export:car` bilan faylga chiqarilgan.

Yangi mashina qo'shish:

1. `.glb` faylni `public/models/` ga qo'ying. O'lchami metrda bo'lsin, orqa o'q markazi koordinata boshida, old tomoni +X, o'ng tomoni +Z, yuqorisi +Y.
2. Harakatlanadigan qismlarni shunday nomlang:
   - `body`, `interior`;
   - g'ildiraklar: `wheel_pivot_FL/FR/RL/RR` va `wheel_spin_FL/FR/RL/RR`;
   - `steering_wheel`, `cluster_screen`, `hazard_button`;
   - burilish chiroqlari: `ind_L_*`, `ind_R_*`;
   - orqaga yurish chirog'i: `lamp_reverse_*`;
   - materiallar: `lamp_head*`, `lamp_tail`.
3. `src/cars/index.js` ga `{ id, name, model }` qatorini qo'shing. Menyuda paydo bo'ladi.

Fizika parametrlari hozircha barcha mashinalar uchun bir xil (`src/sim/vehicle.js` dagi `SPEC`).

## Tuzilishi

```
src/
  sim/        fizika va qoidalar (DOM'siz, node'da test qilinadi)
    vehicle.js     dvigatel, ilashish, uzatmalar qutisi, rul
    session.js     imtihon jarayoni, umumiy qoidalar, mashqlar ketma-ketligi
    penalties.js   rasmiy jarima jadvali
  world/      trassa
    path.js        yo'l quruvchi (to'g'ri, yoy, burchak, ilon)
    elements.js    12 element: geometriya va tekshiruv qoidalari
    tracks.js      to'liq avtodrom va alohida mashq maydonlari
  cars/       mashinalar ro'yxati
  render/     Three.js: sahna, mashina modeli va yuklovchi, oynalar, ovoz
  ui/         boshqaruv, asboblar paneli, menyu
tests/        node testlari va brauzer skrinshot skriptlari
tools/        export-car.mjs: kod modelini .glb ga chiqarish
public/models/  mashina modellari (.glb)
```

## Taxminlar

- O'tish chegarasi (jami 20 balldan oshmasligi) jadvalda ko'rsatilmagan, taxmin qilingan: `src/sim/penalties.js` dagi `PASS_LIMIT`.
- Tezlik xatosi 5 km/soat o'lchov xatoligi bilan hisoblanadi (25 va 45 km/soat).
- Avtodrom xaritasi rasmdagi tartibga o'xshatib qurilgan, o'lchamlari taxminiy.
- Hisobga olinmagan bandlar: №6 (4.7 va 3.24 belgilari), №26 (imtihonni tark etish), №32 (umumiy vaqt chegarasi noma'lum).
