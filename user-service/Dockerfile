# Source: Docker Hub Official Node.js Image — https://hub.docker.com/_/node
# Build with Node.js 22 on the small Alpine Linux base; npm is included.
FROM node:22-alpine AS builder
# Set the working directory for all subsequent commands to /app.
WORKDIR /app
# Copy dependency manifests first so source-only changes can reuse the npm layer.
COPY package.json package-lock.json ./
# Runs `npm ci` to install production and development dependencies, using the package-lock.json file to ensure reproducible builds.
RUN npm ci
# Copy the rest of the source code
COPY . .
# Generate the Prisma Client and build the TypeScript source code into JavaScript.
RUN npm run db:generate && npm run build
# Strips out development dependencies from node_modules to reduce the size of the final image
RUN npm prune --omit=dev

# Start a fresh runtime stage, excluding build tools and original source files.
FROM node:22-alpine AS production
# Set the working directory for all subsequent commands to /app.
WORKDIR /app
# Copies the package files from the builder stage into the production stage
COPY --from=builder /app/package.json /app/package-lock.json ./
# Copy the pruned production dependencies
COPY --from=builder /app/node_modules ./node_modules
# Copy compiled application code
COPY --from=builder /app/dist ./dist
# Keep the schema and migration history needed by prisma migrate deploy.
COPY --from=builder /app/prisma ./prisma
# Tell Prisma where its schema, migrations, and runtime DATABASE_URL are defined.
COPY --from=builder /app/prisma.config.ts ./
# Copy the startup script from the build context into the runtime image.
COPY docker-entrypoint.sh ./

EXPOSE 3000

ENTRYPOINT ["sh", "docker-entrypoint.sh"]

