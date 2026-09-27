# syntax=docker/dockerfile:1

# One image, three entrypoints: the web server, the WebSocket gateway and the
# migration runner. They share a codebase and differ only in the command, so
# building three images would mean keeping three things in step for no gain.

# --- dependencies ----------------------------------------------------------
FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
# `npm ci` from the lockfile — a build must not resolve a different tree than
# the one that was tested.
RUN npm ci

# --- build -----------------------------------------------------------------
FROM node:22-alpine AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# NEXT_PUBLIC_* values are inlined at build time, so they are build arguments
# rather than runtime environment.
ARG NEXT_PUBLIC_API_URL=/api/v1
ARG NEXT_PUBLIC_WS_URL
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL \
    NEXT_PUBLIC_WS_URL=$NEXT_PUBLIC_WS_URL \
    NEXT_PUBLIC_USE_MOCK=false \
    NEXT_TELEMETRY_DISABLED=1
RUN npm run build && npm run build:server

# --- runtime ---------------------------------------------------------------
FROM node:22-alpine AS runtime
WORKDIR /app

ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000

# Never root. `node` exists in the base image with uid 1000.
RUN mkdir -p /app/.storage && chown -R node:node /app

# The standalone output carries only the dependencies actually reached, so the
# runtime image does not need node_modules at all.
COPY --from=build --chown=node:node /app/.next/standalone ./
COPY --from=build --chown=node:node /app/.next/static ./.next/static
COPY --from=build --chown=node:node /app/public ./public

# The gateway and the migration runner are bundled to plain JavaScript at build
# time, so the runtime needs no TypeScript loader and no compiler on the
# production path. `dist/db/migrations` travels with them — the runner reads the
# .sql files relative to its own location.
COPY --from=build --chown=node:node /app/dist ./dist

USER node
EXPOSE 3000 3101

# Liveness only: a readiness check here would restart a healthy process during
# a database blip, which is the orchestrator's job to handle differently.
HEALTHCHECK --interval=15s --timeout=3s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/api/v1/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "server.js"]
