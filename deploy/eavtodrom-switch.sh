#!/usr/bin/env bash
# Moves the simulator to eavtodrom.uz once the domain answers: run from cron every 15 minutes, it waits until
# all five names point at this server, then gets one certificate for them (certbot adds HTTPS and the redirect
# to the nginx site eavtodrom), sets PUBLIC_URL / CORS_ORIGINS of prod and dev to the new addresses (the
# sslip.io ones keep working), restarts both and takes itself out of cron. Log: /root/simulator/eavtodrom-switch.log
set -euo pipefail
IP=207.180.221.193
NAMES=(eavtodrom.uz www.eavtodrom.uz dev.eavtodrom.uz admin.eavtodrom.uz dev-admin.eavtodrom.uz)
for n in "${NAMES[@]}"; do
  [[ $(dig +short "$n" @1.1.1.1 | tail -1) == "$IP" && $(dig +short "$n" @8.8.8.8 | tail -1) == "$IP" ]] || { echo "$(date -Is) $n not yet"; exit 0; }
done
certbot --nginx --non-interactive --redirect --cert-name eavtodrom.uz $(printf -- '-d %s ' "${NAMES[@]}")
setenv() { # setenv <env> <public url> <origins>
  f=/root/simulator/$1/.env
  sed -i "s|^PUBLIC_URL=.*|PUBLIC_URL=$2|; s|^CORS_ORIGINS=.*|CORS_ORIGINS=$3|" "$f"
  (cd /root/simulator/$1 && docker compose up -d >/dev/null)
}
setenv prod https://eavtodrom.uz "https://eavtodrom.uz,https://www.eavtodrom.uz,https://simulator.207-180-221-193.sslip.io"
setenv dev https://dev.eavtodrom.uz "https://dev.eavtodrom.uz,https://dev.simulator.207-180-221-193.sslip.io"
crontab -l | grep -v eavtodrom-switch | crontab -
echo "$(date -Is) done: https://eavtodrom.uz is live"
