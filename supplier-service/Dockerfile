# AI Assistance Disclosure:
# Tool: Claude Code (Opus 5.5)
# Date: 2026-10-21
# Scope: Check and corrected errors in Dockerfile
# Author review: Reviewed, tested, and edited by Amber Tan Junning.

# use multi-stage build

# ---------- build stage ----------
FROM node:22-alpine AS build
WORKDIR /app

COPY package*.json ./
RUN npm ci

# bundle source code inside the docker image
COPY . .
# prisma.config.ts requires DATABASE_URL
# placeholders in the DATABASE_URL can be used since `prisma generate` does not connect to the database
ARG DATABASE_URL="postgresql://placeholder:placeholder@localhost:5432/placeholder"
RUN npx prisma generate && npm run build
# Keep Prisma and tsx for startup migrations and the TypeScript seed script.
RUN npm prune --omit=dev


# ---------- runtime stage ----------
FROM node:22-alpine AS runtime
WORKDIR /app

# Copy package manifests and production dependencies from the build stage
COPY package*.json ./
COPY --from=build /app/node_modules ./node_modules
# Startup migrations and the TypeScript seed script require prisma and tsx.

COPY --from=build /app/dist ./dist
# migrate and seed commands need the prisma schema, migrations, config and generated prisma client
COPY --from=build /app/src/generated ./src/generated
COPY prisma ./prisma
COPY prisma.config.ts docker-entrypoint.sh ./

# expose port 3001
EXPOSE 3001

# start app and run scripting seed everytime app starts
CMD ["sh", "docker-entrypoint.sh"] 
