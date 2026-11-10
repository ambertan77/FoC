# AI Assistance Disclosure:
# Tool: Claude Code (Opus 5.5)
# Date: 2026-10-21
# Scope: Generate implementation code to seed the database on supplier service container startup
# Author review: Reviewed, tested, and edited by Amber Tan Junning.

#!/bin/sh
set -e # stop if any step fails

npx prisma migrate deploy # apply migrations (update tables)
npx prisma db seed
exec node dist/index.js # start the app