#!/bin/sh
set -e

echo "[entrypoint] applying schema via prisma db push..."
# Invoke the Prisma CLI by its real path (not the .bin shim) so Node resolves
# __dirname to node_modules/prisma/build/ where prisma_schema_build_bg.wasm
# lives. Going through .bin/prisma would break that lookup when the .bin
# symlink was flattened to a regular file during Docker COPY.
#
# Will exit non-zero on any destructive change. For breaking schema migrations,
# switch to: prisma migrate deploy
node /app/node_modules/prisma/build/index.js db push --skip-generate

echo "[entrypoint] schema in sync, launching app"
exec "$@"
