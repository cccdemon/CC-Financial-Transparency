#!/bin/sh
set -e

echo "[entrypoint] applying schema via prisma db push..."
# Will exit non-zero on any destructive change (no --accept-data-loss).
# For breaking schema migrations, switch to: prisma migrate deploy
npx prisma db push --skip-generate

echo "[entrypoint] schema in sync, launching app"
exec "$@"
