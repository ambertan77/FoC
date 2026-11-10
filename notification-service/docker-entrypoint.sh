#!/bin/sh

set -e

# Apply committed migrations before accepting requests.
./node_modules/.bin/prisma migrate deploy
exec node dist/index.js
