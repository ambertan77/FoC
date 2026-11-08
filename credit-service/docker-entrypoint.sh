#!/bin/sh
# AI Assistance Disclosure:
# Tool: ChatGPT (Astra 6)
# Date: approx. 2026-10-21
# Scope: Generated the entrypoint that runs prisma migrate deploy and then execs the Node server.
# Author review: Reviewed, tested, and edited by Lim Shao Qi.

set -e

# Apply committed migrations before accepting requests.
./node_modules/.bin/prisma migrate deploy
exec node dist/index.js
