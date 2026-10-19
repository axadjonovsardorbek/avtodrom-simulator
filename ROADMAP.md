# Rivojlanish rejasi

Simulyatorga keyingi qo'shilishi mumkin bo'lgan ishlar, foydasi kattasidan boshlab.
Bajarilganini `[x]` bilan belgilang.

## 1. Imtihonga tayyorlanishni kuchaytirish (eng foydali)

- [x] **Xatolar tahlili.** Har urinish natijasi saqlanadi (brauzerda). Menyuda "Natijalar va xatolar tahlili": eng ko'p ball olib qo'yadigan xatolar, mashqlar bo'yicha urinishlar va so'nggi natijalar grafigi.
- [x] **Ideal yo'l ko'rsatmasi (arvoh-chiziq).** Trening rejimida parkovka, boks va 90° burilishda to'g'ri traektoriya yo'lda chiziq bo'lib ko'rinadi.
- [x] **Takroriy ko'rish (replay).** Mashqdan keyin o'z haydashni tepadan qayta ko'rish, xato joylari qizil nuqta bilan.
- [x] **Ko'zgularni sozlash.** Chap, o'ng va salon ko'zgusini burish (imtihonda bu ham tekshiriladi).
- [x] **Qadamma-qadam o'quv rejimi.** Kamar, kalit, uzatma, qo'l tormozi, start: har bir qadam ko'rsatiladi va bajarilguncha keyingisiga o'tilmaydi.
- [x] **Imtihon bayonnomasi.** Rasmiy shakldagi varaqa: sana, ism, jarima bandlari, natija.

## 2. O'yin hissi

- [x] **Natija ekrani:** yulduzchalar (1–3), eng yaxshi natija, oldingisi bilan solishtirish, mashqlar bo'yicha hisobot.
- [x] **Yutuqlar:** "Birinchi imtihon", "Xatosiz parkovka", "Hammasi 0 ball bilan" va boshqalar.
- [x] **Sertifikat:** o'tgan imtihon uchun yuklab olinadigan rasm.
- [x] **Mashinaga o'tirish animatsiyasi:** kamera eshikka yaqinlashib, mashinaga kiradi va o'tiradi (eshik yopilish ovozi bilan). Istalgan tugma bosilsa, o'tkazib yuboriladi. Eshikning ochilishi va kamar/kalit animatsiyasi modelda eshik bo'lmagani uchun qilinmagan.
- [x] **Kunlik vazifa:** masalan, "Bugun 3 marta parallel parkovka qiling".

## 3. Poligon va dunyo

- [x] **Ob-havo va kun vaqti:** sozlamalarda quyoshli, bulutli, yomg'ir, tuman; kunduz yoki kechqurun (ko'cha chiroqlari va faralar yonadi). Yomg'irda yo'l ho'l: tormoz yo'li uzunroq, tezlikda keskin burilib bo'lmaydi.
- [x] **Boshqa mashinalar:** svetoforli chorrahada boshqa mashinalar yo'lda yuradi, qizil va sariqda to'xtaydi, orasida masofa saqlaydi; o'quvchining yo'liga tushadigan yo'l bo'sh qoldiriladi. Tegib ketsa — to'qnashuv jarimasi (100 ball).
- [ ] **Ko'proq piyodalar:** hozir faqat piyodalar o'tish joyida bitta piyoda bor.
- [ ] **Qo'shimcha poligonlar:** boshqa imtihon markazlari sxemasi bo'yicha (har biri uchun sxema va raqamlar ro'yxati kerak).
- [ ] **Haqiqiy dvigatel ovozlari:** Cobalt va Malibu yozuvlari bilan almashtirish (litsenziyasi aniq yozuvlar kerak).

## 4. Texnik va tarqatish

- [ ] **O'z domeni** (masalan, `avtodrom.uz`): GitHub Pages'ga ulash.
- [ ] **Telegram mini-ilova:** Telegram ichida to'g'ridan-to'g'ri ochiladigan qilish.
- [ ] **Ko'p tilli:** rus va ingliz tillari (hozir faqat o'zbekcha).
- [ ] **Haqiqiy rul va pedallar:** Logitech G29 kabi qurilmalar, rul qarshiligi (force feedback).
- [x] **Hisoblar (akkaunt) va admin panel:** Google va Telegram orqali kirish, natijalar tarixi serverda (Go + PostgreSQL, `server/`). Admin panelda foydalanuvchilar, natijalar, reklama va mashinalarni boshqarish. Ishlashi uchun server VPS'ga o'rnatilishi kerak (`server/README.md`).
- [x] **Statistika va reyting:** admin panelda foydalanuvchilar soni va faolligi, mashqlar va xatolar statistikasi; o'yinda va admin panelda reyting jadvali.

## 5. Realistiklik (navbatdagi katta ishlar)

- [x] **Mashinaga kirish:** Cobalt'da haqiqiy eshiklar: instruktor yo'lovchi eshigidan yurib kirib o'tiradi, eshik yopiladi, keyin haydovchi eshigi ochiladi va kamera kiradi.
- [x] **Tushish:** imtihon tugagach eshiklar ochilib, instruktor va haydovchi tushadi (eshiklari alohida qism bo'lgan Cobalt'da).
- [ ] **Boshqa mashinalarda eshiklar:** Cobalt'dan boshqa modellarda eshik alohida qism emas; Monza, Malibu, Matiz, Damas uchun eshiklarni model ichidan ajratib ishlash kerak.
- [ ] **Fizika:** shinalarning ushlashi, og'irlik ko'chishi, tormoz yo'li (nam yo'l), qiyalikda orqaga siljish, dvigatel tormozi, ABS.
- [ ] **Avtodrom:** haqiqiy imtihon markazi o'lchamlari va belgilari, asfalt chiziqlar, to'siqlar, binolar, daraxtlar (aniq sxema kerak).
- [ ] **Boshqa mashinalar:** chap burilishda qarshi mashinaga yo'l berish qoidasi, ko'proq oqim.

## Hal qilinishi kerak bo'lgan masalalar

Sayt ommaviy ekan, bular ochiq turibdi:

- [ ] **Modellar litsenziyasi.** Malibu 2019 va Monza modellarining muallifi va litsenziyasi aniqlanmagan (`CREDITS.md`). Muallif nomi va havolasini qo'shish yoki modelni olib tashlash kerak.
- [ ] **Audio kliplar.** "Sedayanoch" qo'shig'i, 18+ rejimdagi yozuvlar, "fayzulla" va "balandku" kliplari boshqa odamlarniki. Keng tarqatishdan oldin ruxsat olish yoki olib tashlash kerak.
- [ ] **Bobur aka.** Instruktor haqiqiy odam bo'lsa, so'kinadigan personajga uning ismini qo'yish uchun roziligi kerak (aks holda "Instruktor" deb umumiy nom qilinadi).
- [ ] **Mixamo odamlari.** Mixamo shartlari asosida ishlatilgan, ularni alohida fayl sifatida qayta tarqatib bo'lmaydi.

## Tavsiya etilgan tartib

1. Xatolar tahlili, ideal yo'l, ko'zgularni sozlash, yulduzchalar va yutuqlar (odamni qaytib kelib mashq qilishga undaydi).
2. Telegram mini-ilova va o'z domeni (tarqatish uchun).
3. Litsenziya masalalarini hal qilish (ommaviy qilishdan oldin).
4. Hisoblar va admin panel (hamma ishdan keyin, oxirida).
