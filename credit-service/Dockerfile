# Source: Docker Hub Official Node.js Image — https://hub.docker.com/_/node
FROM node:22-alpine AS build
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY tsconfig.json prisma.config.ts ./
COPY prisma ./prisma
COPY src ./src
# Client generation requires a URL but does not connect to a database.
RUN DATABASE_URL="postgresql://placeholder:placeholder@localhost:5432/placeholder" npm run db:generate && npm run build
# Keep runtime dependencies, including Prisma for startup migrations.
RUN npm prune --omit=dev

FROM node:22-alpine AS runtime
WORKDIR /app

COPY --from=build /app/package.json /app/package-lock.json ./
# Keep the Prisma CLI available for startup migrations.
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/prisma ./prisma
COPY --from=build /app/prisma.config.ts ./
COPY docker-entrypoint.sh ./

EXPOSE 3003

ENTRYPOINT ["sh", "docker-entrypoint.sh"]
