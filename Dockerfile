# ─── Build stage ───────────────────────────────────────────
FROM node:22-alpine AS builder

WORKDIR /app

# prisma generate needs DATABASE_URL to resolve the datasource
ARG DATABASE_URL="postgresql://postgres:postgres@localhost:5432/rhd_db"
ENV DATABASE_URL=$DATABASE_URL

COPY package*.json ./

RUN npm ci --ignore-scripts

COPY prisma ./prisma
COPY tsconfig.json ./
COPY src ./src
COPY public ./public

RUN npm run build

# ─── Runtime stage ─────────────────────────────────────────
FROM node:22-alpine AS runtime

WORKDIR /app

ENV NODE_ENV=production

RUN addgroup -S appgroup && adduser -S appuser -G appgroup

COPY package*.json ./

# --ignore-scripts avoids running the root "postinstall"
# (prisma generate && tsc), which would fail without devDeps.
RUN npm ci --omit=dev --ignore-scripts

COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/public ./public

USER appuser

EXPOSE 5000

CMD ["node", "dist/server.js"]