#!/bin/sh
# AI Assistance Disclosure:
# Tool: ChatGPT (Astra 6)
# Date: approx. 2026-10-19
# Scope: Generated the entrypoint that runs prisma migrate deploy and then execs the Node server.
# Author review: Reviewed, tested, and edited by Lim Shao Qi.

# Exit immediately if a command exits with a non-zero status.
set -e

# Apply committed migrations before accepting requests.
./node_modules/.bin/prisma migrate deploy
# replaces the shell process with the node process
exec node dist/index.js
