# syntax=docker/dockerfile:1

# ---- Build stage: install deps and build the React SPA ----
FROM node:22-slim AS build
WORKDIR /app

# Install all deps (dev included) for the Vite build.
COPY package.json package-lock.json* ./
RUN npm ci || npm install

# Build the SPA into /app/dist
COPY . .
RUN npm run build

# ---- Runtime stage: production deps only + built assets ----
FROM node:22-slim AS runtime
ENV NODE_ENV=production
WORKDIR /app

# Only production dependencies in the runtime image.
COPY package.json package-lock.json* ./
RUN npm ci --omit=dev || npm install --omit=dev

# App code + built assets.
COPY --from=build /app/dist ./dist
COPY server ./server
COPY data/schema.json ./data/schema.json
COPY data/francesco_dataset.json ./data/francesco_dataset.json
COPY data/gear_final.json ./data/gear_final.json

# Cloud Run provides $PORT (default 8080). The server reads it.
ENV PORT=8080
EXPOSE 8080

# Firestore is the default persistence backend on Cloud Run (survives cold starts /
# multiple instances). Override with STORE_BACKEND=sqlite for a single-instance/volume setup.
ENV STORE_BACKEND=firestore

CMD ["node", "server/index.js"]
