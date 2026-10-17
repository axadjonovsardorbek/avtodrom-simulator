# Litsenziyalar va mualliflar

Dastur kodi: MIT (`LICENSE`). Quyidagi fayllar o'z litsenziyasida qoladi.

## 3D modellar

| Fayl | Asl model | Muallif | Litsenziya |
|---|---|---|---|
| `public/models/cobalt.glb` | [Chevrolet Cobalt LTZ 2014](https://sketchfab.com/3d-models/chevrolet-cobalt-ltz-2014-f91cbef731444f939e263041400216ca) | [Q.SARDOR](https://sketchfab.com/qsardor57913) | [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) |
| `public/models/malibu.glb` | Chevrolet Malibu XL 2023 | Uzbek 3D | Muallif ruxsati bilan (loyiha egasi olgan); boshqa joyda ishlatish uchun muallifdan alohida ruxsat kerak |

Ikkala model ham o'zgartirilgan (`tools/prepare-cobalt.mjs`, `tools/prepare-malibu-xl.mjs`).

Kod bilan yasalgan zaxira Cobalt, instruktor, haydovchi va bola figuralari dastur kodining bir qismi (MIT).

Ko'rib chiqilib ishlatilmagan modellar: "2019 Chevrolet Malibu LS Sedan" (Ddiaz Design, CC BY-NC-SA 4.0)
va "Chevrolet Malibu Premier 2022" (Type_S, CC BY 4.0).

## Ovozlar

- `public/audio/uz/*.mp3`, `public/audio/uz/ins/calm|angry/*.mp3`: Microsoft Edge neyron ovozlari
  (`uz-UZ-MadinaNeural`, `uz-UZ-SardorNeural`) bilan `edge-tts` orqali yozilgan (`tools/make_voice.py`).
  Microsoft xizmat shartlari amal qiladi.
- `public/audio/uz/ins/rude/*.mp3`, `public/audio/uz/clips/*.mp3` (manba: `src/instructor/source/*.ogg`)
  va `public/sedayanoch.mp3`: loyiha egasi qo'shgan yozuvlar. Ularning huquqlari asl egalariga tegishli.

## Kutubxonalar

three.js (MIT), Vite (MIT), glTF-Transform (MIT), meshoptimizer (MIT), sharp (Apache-2.0), puppeteer-core (Apache-2.0).
