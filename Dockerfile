FROM oven/bun:1

WORKDIR /app

COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

COPY drizzle.config.ts ./
COPY drizzle ./drizzle
COPY src ./src
COPY web/dist ./web/dist

EXPOSE 3000

# Migrations run programmatically on boot inside src/server.ts (auto-migrate),
# after the db healthcheck has passed.
CMD ["bun", "run", "src/server.ts"]
