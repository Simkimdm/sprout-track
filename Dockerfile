# Stage 1: install all dependencies (incl. devDependencies) and generate Prisma clients
FROM node:22-alpine AS deps

ARG DATABASE_PROVIDER=sqlite

# python3 make g++: build tools for the better-sqlite3 native module (build stage only)
RUN apk add --no-cache python3 make g++

WORKDIR /app

COPY package.json package-lock.json ./
COPY prisma ./prisma/
COPY prisma.config.ts ./
COPY scripts/prisma-provider.js ./scripts/

ENV DATABASE_PROVIDER=${DATABASE_PROVIDER}
RUN npm ci --no-audit --no-fund && \
    npm run prisma:generate && \
    npm run prisma:generate:log

# Stage 2: build the Next.js application
FROM node:22-alpine AS builder

ARG DATABASE_PROVIDER=sqlite

WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY . .

ENV DATABASE_PROVIDER=${DATABASE_PROVIDER}
# Build-time placeholder database URLs (also the runtime SQLite defaults).
# docker-startup.sh treats these exact values as placeholders, so runtime env
# and the persisted env file always win over them.
ENV DATABASE_URL="file:/db/baby-tracker.db"
ENV LOG_DATABASE_URL="file:/db/baby-tracker-logs.db"

# Build the application; drop the build cache, it is not needed at runtime
RUN npm run build && rm -rf .next/cache

# Shrink node_modules BEFORE the runner copies it: pruning in the runner would
# only delete files in a later layer, the copied layer itself would still count
# towards the image size. The script keeps only the runtime dependency closure
# (next, Prisma stack, tsx, ...) and drops dead weight like the glibc variants
# of swc/libvips (never loaded on Alpine/musl).
RUN npm prune --omit=dev --no-audit --no-fund && \
    node scripts/docker-prune-runner-modules.js

# Stage 3: production runner without devDependencies and build cache
FROM node:22-alpine AS runner

ARG ENABLE_NOTIFICATIONS=true
ARG DATABASE_PROVIDER=sqlite

# Runtime system packages:
# - tzdata: timezone support
# - openssl: ENC_HASH generation
# - dcron: notification cron jobs
# - curl: healthcheck
# - postgresql-client: pg_isready for PostgreSQL healthchecks
RUN apk add --no-cache tzdata openssl dcron curl postgresql-client

WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV DATABASE_PROVIDER=${DATABASE_PROVIDER}
ENV DATABASE_URL="file:/db/baby-tracker.db"
ENV LOG_DATABASE_URL="file:/db/baby-tracker-logs.db"
ENV PORT=3000
ENV TZ=UTC
ENV ENABLE_NOTIFICATIONS=${ENABLE_NOTIFICATIONS}

COPY --from=builder /app/package.json /app/package-lock.json ./
# Already pruned to production dependencies and without glibc binaries (see builder)
COPY --from=builder /app/node_modules ./node_modules

COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public
COPY --from=builder /app/next.config.ts ./
# app/ and src/ are needed at runtime: docker-startup.sh runs the seed and the
# notification cron setup via tsx, which resolves imports from the source tree
COPY --from=builder /app/app ./app
COPY --from=builder /app/src ./src
COPY --from=builder /app/prisma ./prisma/
COPY --from=builder /app/prisma.config.ts ./
COPY --from=builder /app/scripts ./scripts/
# .dockerignore keeps only the CSV files here (needed for seeding)
COPY --from=builder /app/documentation ./documentation/

# Conditionally set up notification files and directories if ENABLE_NOTIFICATIONS is true
RUN if [ "$ENABLE_NOTIFICATIONS" = "true" ]; then \
      echo "Notification features enabled - setting up notification infrastructure..." && \
      mkdir -p /app/logs && \
      chmod 755 /app/logs && \
      echo "Notification logs directory created" && \
      # Fix line endings and permissions on cron script for Alpine
      sed -i 's/\r$//' /app/scripts/run-notification-cron.sh && \
      chmod +x /app/scripts/run-notification-cron.sh && \
      echo "Notification cron script prepared"; \
    else \
      echo "Notification features disabled - skipping notification setup"; \
    fi

# Create env directory and base .env file (ENC_HASH and JWT_SECRET are generated at container startup)
# DATABASE_URL is set at runtime via environment variables; SQLite file paths are
# only baked in for sqlite builds so a stale env volume can't clobber a
# PostgreSQL deployment (issue #171)
RUN mkdir -p /app/env && \
    echo "Creating base .env file..." && \
    echo "# Environment variables for Docker container" > /app/env/.env && \
    echo "DATABASE_PROVIDER=\"${DATABASE_PROVIDER}\"" >> /app/env/.env && \
    echo "ENABLE_LOG=\"false\"" >> /app/env/.env && \
    if [ "$DATABASE_PROVIDER" = "sqlite" ]; then \
      echo "DATABASE_URL=\"file:/db/baby-tracker.db\"" >> /app/env/.env && \
      echo "LOG_DATABASE_URL=\"file:/db/baby-tracker-logs.db\"" >> /app/env/.env; \
    fi && \
    echo "NODE_ENV=production" >> /app/env/.env && \
    echo "PORT=3000" >> /app/env/.env && \
    echo "TZ=UTC" >> /app/env/.env && \
    echo "AUTH_LIFE=86400" >> /app/env/.env && \
    echo "REFRESH_TOKEN_LIFE=604800" >> /app/env/.env && \
    echo "IDLE_TIME=604800" >> /app/env/.env && \
    echo "APP_VERSION=1.6.8" >> /app/env/.env && \
    echo "COOKIE_SECURE=false" >> /app/env/.env && \
    echo "ENABLE_NOTIFICATIONS=true" >> /app/env/.env && \
    echo "Base .env file created (ENC_HASH and JWT_SECRET are generated at startup)" && \
    # Create symlink so Next.js can find the env file at build time and runtime
    ln -sf /app/env/.env /app/.env

# Create volume mount points
VOLUME /db
VOLUME /app/env
VOLUME /app/Files

# Copy startup script that runs migrations and starts the app
COPY docker-startup.sh /usr/local/bin/docker-startup.sh
RUN sed -i 's/\r$//' /usr/local/bin/docker-startup.sh && \
    chmod +x /usr/local/bin/docker-startup.sh && \
    ls -la /usr/local/bin/docker-startup.sh && \
    echo "Startup script copied and made executable"

# Set entrypoint to run migrations before starting the app
ENTRYPOINT ["/usr/local/bin/docker-startup.sh"]

# Start the application
CMD ["npm", "start"]

# Expose the port
EXPOSE 3000
