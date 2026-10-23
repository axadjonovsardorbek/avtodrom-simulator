#!/usr/bin/env bash
# Update the VPS from GitHub: deploy/deploy.sh dev|prod
# dev = branch backup-current in /root/simulator/dev, prod = main in /root/simulator/prod.
# Each is a git clone run with docker compose (own database, uploads and port; .env there, never in git).
# Push the branch first: the server pulls what is on GitHub.
set -euo pipefail
ENV=${1:?usage: deploy.sh dev|prod}
[[ $ENV == dev || $ENV == prod ]] || { echo "dev or prod"; exit 1; }
HOST=${DEPLOY_HOST:-root@207.180.221.193}
ssh "$HOST" "set -e; cd /root/simulator/$ENV; git pull -q --ff-only; git log -1 --oneline
  docker compose up -d --build --remove-orphans 2>&1 | tail -2; docker image prune -f >/dev/null"
