# Litsenziyalar va mualliflar

Dastur kodi: MIT (`LICENSE`). Quyidagi fayllar o'z litsenziyasida qoladi.

## 3D modellar

| Fayl | Asl model | Muallif | Litsenziya |
|---|---|---|---|
| `public/models/cobalt.glb` | [Chevrolet Cobalt LTZ 2014](https://sketchfab.com/3d-models/chevrolet-cobalt-ltz-2014-f91cbef731444f939e263041400216ca) | [Q.SARDOR](https://sketchfab.com/qsardor57913) | [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) |
| `public/models/malibu-premier.glb` | [2021 Chevrolet Malibu 2LZ Premier](https://sketchfab.com/3d-models/2021-chevrolet-malibu-2lz-premier-c1e8e127ce114b14a166e93100642424) | [twr422](https://sketchfab.com/twr422) | [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) |

Hamma modellar o'zgartirilgan (`tools/prepare-cobalt.mjs`, `tools/prepare-malibu-premier.mjs`).

Kod bilan yasalgan zaxira Cobalt, instruktor, haydovchi va bola figuralari dastur kodining bir qismi (MIT).

Ko'rib chiqilib ishlatilmagan modellar: "2019 Chevrolet Malibu LS Sedan" (Ddiaz Design, CC BY-NC-SA 4.0),
"Chevrolet Malibu Premier 2022" (Type_S, CC BY 4.0) va "Malibu XL 2023" (Uzbek 3D).

## Ovozlar

- `public/audio/uz/*.mp3`, `public/audio/uz/ins/calm|angry/*.mp3`: Microsoft Edge neyron ovozlari
  (`uz-UZ-MadinaNeural`, `uz-UZ-SardorNeural`) bilan `edge-tts` orqali yozilgan (`tools/make_voice.py`).
  Microsoft xizmat shartlari amal qiladi.
- `public/audio/uz/ins/rude/*.mp3`, `public/audio/uz/clips/*.mp3` (manba: `src/instructor/source/*.ogg`)
  va `public/sedayanoch.mp3`: loyiha egasi qo'shgan yozuvlar. Ularning huquqlari asl egalariga tegishli.

## Kutubxonalar

three.js (MIT), Vite (MIT), glTF-Transform (MIT), meshoptimizer (MIT), sharp (Apache-2.0), puppeteer-core (Apache-2.0).
