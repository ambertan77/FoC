# Source: Docker Hub Official Node.js Image — https://hub.docker.com/_/node
FROM node:22-alpine AS build
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . . 

# Vite embeds these public API URLs in the browser bundle at build time.
ARG VITE_AUTH_API_BASE_URL
ARG VITE_SUPPLIER_API_BASE_URL
ARG VITE_ORDER_API_BASE_URL
ARG VITE_CREDIT_API_BASE_URL
RUN npm run build

# This image runs Nginx without root privileges on port 8080.
# Source: NGINX Unprivileged Image — https://hub.docker.com/r/nginxinc/nginx-unprivileged
FROM nginxinc/nginx-unprivileged:stable-alpine AS runtime
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 8080
