FROM node:22-slim AS base

# Install dependencies only when needed
FROM base AS deps
# Debian-based build tools for native dependencies
RUN apt-get update && apt-get install -y \
    python3 \
    make \
    gcc \
    g++ \
    openssl \
    libsqlite3-dev \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install dependencies
# prisma/ is copied before install because the package.json postinstall hook
# runs `prisma generate`, which needs prisma/schema.prisma to exist.
COPY package.json package-lock.json* ./
COPY prisma ./prisma
RUN npm install

# Rebuild the source code only when needed
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Set build-time environment variables for Next.js
ARG NEXT_PUBLIC_RACE_SERVER_URL=http://localhost:9876
ENV NEXT_PUBLIC_RACE_SERVER_URL=$NEXT_PUBLIC_RACE_SERVER_URL

RUN npx prisma generate
RUN npm run build

# Production image, copy all the files and run next
FROM base AS runner
WORKDIR /app

ENV NODE_ENV=production

# Prisma's schema engine (used by `prisma migrate deploy` in start.sh) needs
# openssl at runtime; node:22-slim does not ship it. tzdata lets the TZ env var
# (set in docker-compose) resolve to a real zone — without it Date.getHours()
# stays on UTC and the dashboard charts shift by the host's offset (e.g. -7h).
RUN apt-get update && apt-get install -y openssl ca-certificates tzdata \
    && rm -rf /var/lib/apt/lists/*

RUN groupadd --system --gid 1001 nodejs
RUN useradd --system --uid 1001 nextjs

COPY --from=builder /app/public ./public

# Automatically leverage output traces to reduce image size
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
# Copy prisma files for migrations (prisma.config.ts provides datasource.url from
# DATABASE_URL — required by `prisma migrate deploy` since the schema has no url).
COPY --from=builder --chown=nextjs:nodejs /app/prisma ./prisma
COPY --from=builder --chown=nextjs:nodejs /app/prisma.config.ts ./prisma.config.ts
COPY --from=builder --chown=nextjs:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=nextjs:nodejs /app/package.json ./package.json
COPY --from=builder --chown=nextjs:nodejs /app/start.sh ./start.sh

# Strip CR so a CRLF-checked-out start.sh still runs (avoids "exec: ./start.sh: not found")
RUN sed -i 's/\r$//' start.sh && chmod +x start.sh

USER nextjs

EXPOSE 3000

ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

CMD ["./start.sh"]
