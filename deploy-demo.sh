#!/usr/bin/env bash
# Deploys the public demo (demo.autoshift.co.il). Run it on the server only when you choose:
# production deploys never touch the demo, and this script never touches production.
#
# The demo DB is wiped every time. Sandboxes are throwaway and the app creates the current schema
# on startup, so the demo never needs Alembic. Visitors in the middle of a session are sent to
# the login page and start a new sandbox with one click.
set -euo pipefail
cd "$(dirname "$0")"

if [ ! -f .env.demo ]; then
  echo "Missing .env.demo: copy .env.demo.example and fill it in." >&2
  exit 1
fi

compose() {
  docker compose --env-file .env.demo -f docker-compose.demo.yml "$@"
}

git pull --ff-only
# -v removes only this project's volume (autoshift-demo_demo_postgres_data)
compose down -v
compose up -d --build
compose ps
