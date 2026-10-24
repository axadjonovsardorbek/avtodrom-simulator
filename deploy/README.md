# Deploying to the VPS

The server runs two copies of the simulator side by side, each a git clone started with docker compose:

| | Folder | Branch | Address | Local port |
|---|---|---|---|---|
| prod | `/root/simulator/prod` | `main` | https://simulator.207-180-221-193.sslip.io | 127.0.0.1:8092 |
| dev | `/root/simulator/dev` | `backup-current` | https://dev.simulator.207-180-221-193.sslip.io | 127.0.0.1:8091 |

The admin panels have their own addresses (the same app; `/` opens admin.html, and `/admin.html` on the game's address redirects there):
https://admin.simulator.207-180-221-193.sslip.io (prod) and https://admin.dev.simulator.207-180-221-193.sslip.io (dev),
nginx site `/etc/nginx/sites-available/simulator-admin`.

Each has its own Postgres container, database volume and uploads volume (compose project `simulator-prod` / `simulator-dev`).
The host's nginx (`/etc/nginx/sites-available/simulator`) proxies the two addresses to the local ports; HTTPS is from certbot.

## eavtodrom.uz

The domain's names (eavtodrom.uz, www, dev, admin, dev-admin) go to the same two servers through the nginx site
`eavtodrom` (`deploy/nginx-eavtodrom.conf`). Until the .uz registry activates the domain it is served over
plain HTTP only; `deploy/eavtodrom-switch.sh` (in root's crontab every 15 minutes, copied to
`/root/simulator/`) waits until all five names resolve to the server, then gets the certificate, points
`PUBLIC_URL` and `CORS_ORIGINS` of prod and dev at the new addresses, restarts both and removes its cron line.
Log: `/root/simulator/eavtodrom-switch.log`. The sslip.io addresses keep working.

## Updating

Automatic: GitHub Actions (`.github/workflows/deploy.yml`) runs the tests on every push, then deploys:
a push to `backup-current` updates dev, a push to `main` updates prod. A failing test stops the deploy.
It logs in with the `DEPLOY_SSH_KEY` secret, which the server lets run only `/root/simulator/deploy.sh dev|prod`
(forced command in `/root/.ssh/authorized_keys`); that script pulls the branch, rebuilds and waits for the app to answer.

By hand, the same:

```
deploy/deploy.sh dev     # pulls backup-current, rebuilds, restarts
deploy/deploy.sh prod    # pulls main
```

## Each copy's .env

`/root/simulator/<env>/.env` (mode 600, not in git):

```
COMPOSE_PROJECT_NAME=simulator-prod
DB_PASSWORD=<random>
PORT=127.0.0.1:8092        # localhost only: docker would otherwise bypass the firewall
PUBLIC_URL=https://simulator.207-180-221-193.sslip.io
TRUST_PROXY=1
CORS_ORIGINS=https://simulator.207-180-221-193.sslip.io
```

The admin login and the Google, Telegram and inPAY keys are not here: they are kept in the database and set in the admin panel.

## Moving to a new server

1. Install Docker (`curl -fsSL https://get.docker.com | sh`) and nginx with certbot.
2. `git clone -b main https://github.com/axadjonovsardorbek/avtodrom-simulator.git /root/simulator/prod` (and `-b backup-current ... dev`).
3. Write each `.env` as above, then `docker compose up -d --build` in each folder.
4. Copy the nginx site, run `certbot --nginx -d <address>`.
5. To keep the data: `docker compose exec db pg_dump -U avtodrom avtodrom > dump.sql` on the old server, then restore it with `psql` on the new one. Copy the `uploads` volume too.
