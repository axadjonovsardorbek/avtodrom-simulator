# Avtodrom server

Simulyatorning backend qismi (Go va PostgreSQL). Quyidagilar shu server orqali ishlaydi:

- **Hisoblar:** Google va Telegram orqali kirish, Telegram mini-ilova ichida avtomatik kirish.
- **Natijalar:** har bir urinish serverda saqlanadi. Boshqa qurilmadan kirganda tarix o'sha yerda ham chiqadi.
- **Reyting:** imtihon va trening bo'yicha eng yaxshi natijalar jadvali.
- **Admin panel** (`admin.html`):
  - umumiy statistika;
  - foydalanuvchilar: bloklash, admin qilish, o'chirish;
  - barcha natijalar va reyting;
  - mashina ekranidagi reklamani yuklash;
  - mashinalarni yoqish va o'chirish.

Server ishlamasa yoki ulanmagan bo'lsa ham simulyator ishlayveradi: natijalar faqat brauzerda saqlanadi, "Kirish" tugmasi chiqmaydi.

## Tuzilishi

| Fayl | Nima qiladi |
|---|---|
| `main.go` | sozlamalar (environment), marshrutlar, CORS, limit |
| `auth.go` | Google token, Telegram widget va mini-ilova imzosini tekshirish |
| `users.go` | kirish, sessiyalar, `/api/me` |
| `public.go` | `/api/config`, urinishlarni saqlash, reyting |
| `admin.go` | admin API: statistika, foydalanuvchilar, natijalar, reklama, mashinalar |
| `db.go` | PostgreSQL jadvallari (server ishga tushganda o'zi yaratadi) |

## Kompyuterda sinash

```bash
# 1. Baza (Postgres o'rnatilgan bo'lsa)
createdb avtodrom

# 2. Server: Google va Telegramsiz, ism bilan kirish (faqat sinov uchun)
cd server
DATABASE_URL="postgres://localhost/avtodrom?sslmode=disable" DEV_LOGIN=1 ADMINS="dev:boss" ADDR=":8088" go run .

# 3. Simulyator shu serverga ulangan holda (boshqa terminalda, loyiha papkasida)
VITE_API_URL=http://localhost:8088 npm run dev
```

So'ng http://localhost:5173/admin.html sahifasini oching va "Boss" ismi bilan kiring: bu foydalanuvchi admin bo'ladi.

Testlar: `go test ./...`. To'liq API testi uchun bo'sh baza kerak:

```bash
TEST_DATABASE_URL="postgres://localhost/avtodrom_test?sslmode=disable" go test ./...
```

## VPS'ga o'rnatish (Ubuntu 22.04/24.04)

Quyidagi buyruqlarda `api.example.uz` o'rniga o'z domeningizni yozing. Bu domenning DNS yozuvi VPS'ning IP manziliga qaratilgan bo'lishi kerak.

**1. Postgres va nginx'ni o'rnating:**

```bash
sudo apt update && sudo apt install -y postgresql nginx certbot python3-certbot-nginx
sudo -u postgres psql -c "CREATE USER avtodrom WITH PASSWORD 'kuchli-parol';"
sudo -u postgres psql -c "CREATE DATABASE avtodrom OWNER avtodrom;"
```

**2. Serverni yig'ing** (o'z kompyuteringizda, Go kerak) va VPS'ga ko'chiring:

```bash
cd server
GOOS=linux GOARCH=amd64 CGO_ENABLED=0 go build -o avtodrom-server .
scp avtodrom-server deploy/avtodrom.service deploy/nginx.conf .env.example user@VPS:/tmp/
```

**3. VPS'da joylashtiring:**

```bash
sudo useradd --system --home /opt/avtodrom avtodrom
sudo mkdir -p /opt/avtodrom /var/lib/avtodrom/uploads
sudo mv /tmp/avtodrom-server /opt/avtodrom/ && sudo chmod +x /opt/avtodrom/avtodrom-server
sudo cp /tmp/.env.example /opt/avtodrom/.env && sudo nano /opt/avtodrom/.env     # qiymatlarni to'ldiring
sudo chown -R avtodrom:avtodrom /opt/avtodrom /var/lib/avtodrom && sudo chmod 600 /opt/avtodrom/.env
sudo cp /tmp/avtodrom.service /etc/systemd/system/ && sudo systemctl daemon-reload && sudo systemctl enable --now avtodrom
sudo journalctl -u avtodrom -f      # "listening on ..." chiqsa ishlayapti
```

**4. nginx va HTTPS:**

```bash
sudo cp /tmp/nginx.conf /etc/nginx/sites-available/avtodrom      # ichida api.example.uz ni almashtiring
sudo ln -s /etc/nginx/sites-available/avtodrom /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
sudo certbot --nginx -d api.example.uz
curl https://api.example.uz/api/config        # JSON qaytsa, tayyor
```

**5. Yangilash.** Yangi `avtodrom-server` faylini `/opt/avtodrom/` ga qo'yasiz va `sudo systemctl restart avtodrom` buyrug'ini berasiz. Jadvallarni server o'zi yangilaydi.

**6. Zaxira nusxa** (har kecha):

```bash
sudo -u postgres crontab -e
# 0 3 * * * pg_dump avtodrom | gzip > /var/backups/avtodrom-$(date +\%F).sql.gz
```

Reklama fayllari `/var/lib/avtodrom/uploads` papkasida turadi. Ularni ham zaxiralang.

## Google orqali kirish

1. https://console.cloud.google.com ga kiring va loyiha oching.
2. **APIs & Services → OAuth consent screen**ni to'ldiring. Turi: External, ilova nomi: Avtodrom simulyatori.
3. **Credentials → Create credentials → OAuth client ID** ni bosing. Turi: **Web application**.
4. **Authorized JavaScript origins** ga sayt manzilini qo'shing, masalan `https://axadjonovsardorbek.github.io`. Kompyuterda sinash uchun `http://localhost:5173` ni ham qo'shing.
5. Chiqqan Client ID'ni `.env` faylidagi `GOOGLE_CLIENT_ID` ga yozing.

## Telegram orqali kirish

1. @BotFather'da `/newbot` buyrug'i bilan bot oching. Token'ni `TELEGRAM_BOT_TOKEN` ga, bot nomini (@ siz) `TELEGRAM_BOT_NAME` ga yozing.
2. @BotFather'da `/setdomain` buyrug'ini bering, botni tanlang va sayt domenini kiriting: `axadjonovsardorbek.github.io` (yoki o'z domeningiz). Telegram tugmasi faqat shu domenda ishlaydi.
3. Mini-ilova ham kerak bo'lsa: `/newapp` (yoki bot sozlamalarida Menu Button) orqali sayt manzilini bering. Mini-ilova ichida foydalanuvchi o'zi kiradi.

## Adminlar

Birinchi admin `.env` faylidagi `ADMINS` ro'yxati orqali beriladi. Masalan:

```
ADMINS=tg:123456789,google:axadjonovsardorbeck@gmail.com
```

- Telegram ID'ingizni @userinfobot orqali bilib olsangiz bo'ladi.
- Google uchun tasdiqlangan email yoziladi.

Shu hisob bilan kirganingizda admin bo'lasiz. Keyin admin panelda boshqalarni ham "Admin qilish" tugmasi bilan admin qilish mumkin.

## Saytni serverga ulash

Sayt GitHub Pages'da qoladi, faqat build vaqtida server manzili beriladi:

1. GitHub'da repozitoriyani oching: **Settings → Secrets and variables → Actions → Variables → New repository variable**.
2. Nomi `API_URL`, qiymati `https://api.example.uz`.
3. `main`ga push qilinganda sayt shu server bilan yig'iladi. "Kirish" va "Reyting" tugmalari paydo bo'ladi, admin panel `…/admin.html` manzilida ochiladi.

`.env` faylidagi `CORS_ORIGINS` ga sayt manzilini yozishni unutmang. Masalan: `https://axadjonovsardorbek.github.io`.

Sayt ham shu VPS'da tursin desangiz:

- `.env` ga `STATIC_DIR=/var/www/avtodrom` yozing va `dist/` papkasini o'sha yerga ko'chiring;
- saytni `VITE_API_URL=/ npm run build` bilan yig'ing.

## API qisqacha

| So'rov | Kim uchun | Nima |
|---|---|---|
| `GET /api/config` | hamma | kirish sozlamalari, reklama ro'yxati, o'chirilgan mashinalar |
| `POST /api/auth/google`, `/telegram`, `/telegram-webapp` | hamma | kirish, `token` qaytaradi |
| `GET /api/me`, `POST /api/logout` | kirgan | hisob, chiqish |
| `POST /api/attempts`, `GET /api/me/attempts` | kirgan | urinishlarni saqlash va olish |
| `GET /api/leaderboard?key=exam` | hamma | reyting |
| `/api/admin/*` | admin | statistika, foydalanuvchilar, natijalar, reklama, mashinalar |

So'rovlarda token `Authorization: Bearer <token>` sarlavhasida yuboriladi.


## To'lovlar (inPAY)

1. inpay.uz kabinetida kassa oching; merchant ID va merchant token'ni serverdagi `.env` ga yozing:
   `INPAY_MERCHANT_ID=...`, `INPAY_MERCHANT_TOKEN=...` (chatga yozmang).
2. `PUBLIC_URL` saytning https manzili bo'lishi shart: inPAY to'lov natijasini `PUBLIC_URL/api/shop/inpay` ga yuboradi,
   xaridor `PUBLIC_URL/?order=<id>` ga qaytadi. Kassa sozlamalarida shu domenni ruxsat etilganlarga qo'shing.
3. Admin panel → Do'kon: to'lovlarni yoqish/o'chirish, qaysi narsa pullik, narxlar va muddatlar, tariflar, promokodlar,
   to'lovlar ro'yxati va tushum.

inPAY'ning callback'i imzolanmagan, shuning uchun server unga ishonmaydi: har bir buyurtma faqat inPAY'ning
`GET /transactions/` javobi bo'yicha (holat `success` va summa to'liq) to'langan deb belgilanadi.
inPAY'da sinov (sandbox) rejimi yo'q: birinchi sinovni eng kichik summa (1 000 so'm) bilan qiling.
