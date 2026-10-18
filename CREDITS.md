# Litsenziyalar va mualliflar

Dastur kodi: MIT (`LICENSE`). Quyidagi fayllar o'z litsenziyasida qoladi.

## 3D modellar

| Fayl | Asl model | Muallif | Litsenziya |
|---|---|---|---|
| `public/models/cobalt.glb` | [Chevrolet Cobalt LTZ 2014](https://sketchfab.com/3d-models/chevrolet-cobalt-ltz-2014-f91cbef731444f939e263041400216ca) | [Q.SARDOR](https://sketchfab.com/qsardor57913) | [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) |
| `public/models/malibu-2019.glb` | 2019 Chevrolet Malibu Premier (Sketchfab) | muallif ko'rsatilishi kerak | Sketchfab litsenziyasi (aniqlanmoqda) |
| `public/models/monza.glb` | 2023 Chevrolet Monza (Sketchfab) | muallif ko'rsatilishi kerak | Sketchfab litsenziyasi (aniqlanmoqda) |
| `public/models/matiz.glb` | [Daewoo Matiz [FULL INTERIOR]](https://sketchfab.com/3d-models/daewoo-matiz-full-interior-c2bb5406a5f8484d9e76e0deb044f5b5) | [ALEX MILOS (TEDIORE)](https://sketchfab.com/TEDIORE) | [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) |
| `public/models/damas.glb` | Chevrolet Damas (Sketchfab) | muallif ko'rsatilishi kerak | litsenziya aniqlanmoqda |
| `public/models/malibu-premier.glb` | [2021 Chevrolet Malibu 2LZ Premier](https://sketchfab.com/3d-models/2021-chevrolet-malibu-2lz-premier-c1e8e127ce114b14a166e93100642424) | [twr422](https://sketchfab.com/twr422) | [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) |

Hamma modellar o'zgartirilgan (`tools/prepare-cobalt.mjs`, `tools/prepare-malibu-premier.mjs`).

## Odamlar

`public/models/people/*.glb` (instruktor, haydovchi, bola): personajlar va harakatlar [Mixamo](https://www.mixamo.com) (Adobe), Mixamo shartlari asosida loyihada ishlatilgan. `tools/prepare-people.mjs` ularni birlashtiradi, kiyim ranglarini o'zgartiradi va siqadi (asl `.fbx` fayllar repoda yo'q).

Kod bilan yasalgan zaxira Cobalt, instruktor, haydovchi va bola figuralari dastur kodining bir qismi (MIT); Mixamo fayllari yuklanmasa ular ishlatiladi.

Ko'rib chiqilib ishlatilmagan modellar: "2019 Chevrolet Malibu LS Sedan" (Ddiaz Design, CC BY-NC-SA 4.0),
"Chevrolet Malibu Premier 2022" (Type_S, CC BY 4.0) va "Malibu XL 2023" (Uzbek 3D).

## Ovozlar

- `public/audio/uz/*.mp3`, `public/audio/uz/ins/calm|angry/*.mp3`: Microsoft Edge neyron ovozlari
  (`uz-UZ-MadinaNeural`, `uz-UZ-SardorNeural`) bilan `edge-tts` orqali yozilgan (`tools/make_voice.py`).
  Microsoft xizmat shartlari amal qiladi.
- `public/audio/uz/ins/rude/*.mp3`, `public/audio/uz/clips/*.mp3` (manba: `src/instructor/source/*.mp3`)
  va `public/sedayanoch.mp3`: loyiha egasi qo'shgan yozuvlar. Ularning huquqlari asl egalariga tegishli.
- `public/models/train.glb`: "Little train" (bug lokomotivi, `Small train.3ds/.obj`), loyiha egasi yuklab olgan; muallifi va litsenziyasi aniqlanmagan.
  Kabina plastinkasidagi rasm (burgut belgisi) o'chirilgan, geometriya soddalashtirilgan (`tools/convert-train.py`, `tools/make-train.mjs`).

## Kutubxonalar

three.js (MIT), Vite (MIT), glTF-Transform (MIT), meshoptimizer (MIT), sharp (Apache-2.0), puppeteer-core (Apache-2.0).
