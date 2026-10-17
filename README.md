# Avtodrom simulyatori

B toifa haydovchilik guvohnomasi amaliy imtihoniga (avtodrom qismi) tayyorlanish uchun 3D simulyator. Mashqlar ketma-ketligi Toshkent imtihon markazi normasiga, jarima ballari esa rasmiy jadvalga asoslangan.

## Ishga tushirish

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # dist/ papkasiga tayyor sayt
npm test           # brauzersiz testlar: fizika, trassa, qoidalar
npm run prepare:cobalt -- ~/Downloads/chevrolet_cobalt_ltz_2014.glb   # Sketchfab modelidan public/models/cobalt.glb
```

## Ovozli ko'rsatmalar

Imtihon tizimi ovozi o'zbek tilida, `public/audio/uz/*.mp3` fayllarida (Microsoft neyron ovozi `uz-UZ-MadinaNeural`).
Matnlar `src/audio/phrases.json` da. Matnni o'zgartirsangiz, fayllarni qayta yozing (internet kerak):

```bash
python3 -m venv .venv && .venv/bin/pip install edge-tts
.venv/bin/python tools/make_voice.py          # hammasi
.venv/bin/python tools/make_voice.py ins      # faqat instruktor
```

## Instruktor

Yo'lovchi o'rindig'ida instruktor Bobur aka o'tiradi (`src/render/instructorFigure.js`). U xatolarni aytadi,
kerak bo'lsa qo'lini silkitadi, yaxshi bajarilgan mashqda bosh barmog'ini ko'taradi.
Menyuda "Instruktor" tanlanadi:

- **Jahldor** — qattiq gapiradi, lekin so'kinmaydi;
- **Jahldor, so'kinadi (18+)** — faqat `src/instructor/source/*.ogg` dagi yozuvlar, har xatoda aralash tartibda
  (`public/audio/uz/ins/rude/*.mp3` ga o'girilgan, ovoz balandligi tenglashtirilgan; ro'yxat — `src/instructor/instructor.js`, `RUDE_CLIPS`);
- **Yumshoq** — xotirjam maslahat beradi;
- **Yo'q** — instruktor yo'q, xatolarni imtihon tizimi ovozi aytadi.

Gaplar `src/instructor/lines.json` da (ovoz `uz-UZ-SardorNeural`, jahldor uchun tezroq va pastroq).

Havola orqali to'g'ridan-to'g'ri ochish: `#imtihon`, `#trening`, `#mashq-ilon` (yoki boshqa element id).

## Poligon o'lchami

Trening va alohida mashqlarda poligonni kengaytirish mumkin (menyuda "Poligon"): **Keng** (boshlovchi, 1,5 marta), **O'rtacha** (1,25), **Haqiqiy o'lcham**. Kengayadigan joylar tor mashqlar: 90° burilish koridori, ilon izi koridori, boks (koridor, boks eni va chuqurligi) va parallel parkovka qutisi. Imtihon har doim haqiqiy o'lchamda. Kodda: `W.k` (`src/world/elements.js`).

## Telefonda

Telefon va planshetda ekranda tugmalar chiqadi (gorizontal holatda): chapda rul o'qlari, o'rtada burilish va avariya chiroqlari, kamar, dvigatel, qo'l tormozi, o'ngda uzatma, ilashish (mexanikada), tormoz va gaz pedallari. Mashq boshlanganda to'liq ekranga o'tadi; telefon tik turganda yotqizish so'raladi. Kompyuterda sinash uchun: manzil oxiriga `?mobile` qo'shing.

## Rejimlar

- **Imtihon**: butun avtodrom bo'ylab 13 mashq ketma-ket. Jarima 100 balldan oshsa, imtihondan o'tilmaydi va imtihon to'xtatiladi (`PASS_LIMIT`).
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

## Avtodrom sxemasi

Toshkent imtihon markazi sxemasi bo'yicha: o'rtada svetoforli chorraha, shimolda start, piyodalar o'tish joyi, estakada va 90° burilishlar, janubi-g'arbda ilon izi, janubi-sharqda boks, g'arb tomonda temir yo'l kesishmasi, shimoliy chetda tezlashish bo'lagi va avariya to'xtashi, sharq tomonda parallel parkovka (`src/world/tracks.js`, `buildFull`).

## Mashinalar

Mashinalar ro'yxati `src/cars/index.js` da. Har bir mashina `public/models/` dagi `.glb` fayldan yuklanadi.
Mashinalar: Chevrolet Cobalt (`cobalt.glb`), Chevrolet Malibu 2 (`malibu.glb`, qora salon) va Chevrolet Malibu 2 Premier (`malibu-premier.glb`, oq salon). Menyuda mashina va kuzov rangi tanlanadi.

3D model: ["Chevrolet Cobalt LTZ 2014"](https://sketchfab.com/3d-models/chevrolet-cobalt-ltz-2014-f91cbef731444f939e263041400216ca), muallif [Q.SARDOR](https://sketchfab.com/qsardor57913), litsenziya [CC BY 4.0](http://creativecommons.org/licenses/by/4.0/).
O'zgartirishlar (`tools/prepare-cobalt.mjs`): takrorlangan g'ildiraklar olib tashlangan, o'lcham va o'qlar moslangan, g'ildiraklar va rul harakatlanadigan qilingan, materiallar sozlangan, burilish chiroqlari qo'shilgan, uchburchaklar soni kamaytirilib siqilgan (33 MB dan 1,8 MB ga).

Malibu modeli: "Chevrolet Malibu XL 2023" (Uzbek 3D), muallif ruxsati bilan ishlatilgan (loyiha egasi ruxsat olgan, `CREDITS.md`).
O'zgartirishlar (`tools/prepare-malibu-xl.mjs`): o'qlar va o'lcham haqiqiy mashinaga moslangan (4,933 m), g'ildiraklar va rul harakatlanadigan qilingan, chiroq grafikasi yonadigan qilingan, burilish chiroqlari qo'shilgan, teksturalar WebP ga o'tkazilgan, siqilgan (3,3 MB).

Malibu Premier modeli: ["2021 Chevrolet Malibu 2LZ Premier"](https://sketchfab.com/3d-models/2021-chevrolet-malibu-2lz-premier-c1e8e127ce114b14a166e93100642424), muallif [twr422](https://sketchfab.com/twr422), litsenziya [CC BY 4.0](http://creativecommons.org/licenses/by/4.0/). O'zgartirishlar (`tools/prepare-malibu-premier.mjs`): g'ildirak qismlari yig'ilib harakatlanadigan qilingan, rul paneldan kesib ajratilgan, chiroqlar, burilish chiroqlari, siqish (37 MB dan 6,8 MB ga).

Model yuklanmasa, kod bilan yasalgan zaxira model ishlatiladi (`src/render/cobaltBody.js`, `src/render/carModel.js`; `npm run export:procedural` uni faylga chiqaradi).

Yangi mashina qo'shish:

1. `.glb` faylni `public/models/` ga qo'ying. O'lchami metrda bo'lsin, orqa o'q markazi koordinata boshida, old tomoni +X, o'ng tomoni +Z, yuqorisi +Y.
2. Harakatlanadigan qismlarni shunday nomlang:
   - `body`, `interior`;
   - g'ildiraklar: `wheel_pivot_FL/FR/RL/RR` va `wheel_spin_FL/FR/RL/RR`;
   - `steering_wheel`, `cluster_screen`, `hazard_button`;
   - burilish chiroqlari: `ind_L_*`, `ind_R_*`;
   - orqaga yurish chirog'i: `lamp_reverse_*`;
   - materiallar: `lamp_head*`, `lamp_tail`.
3. `src/cars/index.js` ga `{ id, name, model, dims, eye, seat, mirrors, spec }` qatorini qo'shing. Menyuda paydo bo'ladi.

Fizika parametrlari `src/sim/vehicle.js` dagi `SPEC` dan olinadi, mashinaning `spec` maydoni ularni almashtiradi (o'lcham, massa). Parallel to'xtash qutisi mashina uzunligiga moslanadi (uzunlik + 2,3 m).

Rulda haydovchi o'tiradi (`src/render/driverFigure.js`): qo'llari rulni ushlab turadi va rul bilan birga buriladi, kabinadan faqat qo'llari ko'rinadi.

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

## Litsenziya

Kod: MIT (`LICENSE`). Modellar, ovozlar va musiqa o'z litsenziyasida: `CREDITS.md`.

## Taxminlar

- O'tish chegarasi: jami jarima 100 balldan oshmasligi kerak (`src/sim/penalties.js` dagi `PASS_LIMIT`).
- Tezlik xatosi 5 km/soat o'lchov xatoligi bilan hisoblanadi (25 va 45 km/soat).
- Avtodrom xaritasi rasmdagi tartibga o'xshatib qurilgan, o'lchamlari taxminiy.
- Hisobga olinmagan bandlar: №6 (4.7 va 3.24 belgilari), №26 (imtihonni tark etish), №32 (umumiy vaqt chegarasi noma'lum).
