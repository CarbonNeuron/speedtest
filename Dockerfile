FROM node:22-bookworm-slim AS base
COPY --from=oven/bun:1.4.3 /usr/local/bin/bun /usr/local/bin/bun
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1

FROM base AS dependencies
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

FROM base AS builder
COPY --from=dependencies /app/node_modules ./node_modules
COPY . .
RUN bun run build

FROM base AS runner
ENV NODE_ENV=production
ENV PORT=3000
RUN groupadd --system --gid 1001 speedtest && useradd --system --uid 1001 --gid speedtest speedtest
COPY --from=builder --chown=speedtest:speedtest /app/.next ./.next
COPY --from=builder --chown=speedtest:speedtest /app/node_modules ./node_modules
COPY --from=builder --chown=speedtest:speedtest /app/public ./public
COPY --from=builder --chown=speedtest:speedtest /app/package.json /app/bun.lock /app/next.config.ts ./
USER speedtest
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 CMD node -e "fetch('http://127.0.0.1:3000/api/ping').then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"
CMD ["bun", "run", "start", "--hostname", "0.0.0.0"]
