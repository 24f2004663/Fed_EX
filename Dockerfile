# 1. Base image with common dependencies
FROM node:20-bookworm-slim AS base
# Install Python and dependencies needed for both build and runtime
RUN apt-get update && apt-get install -y \
    python3 \
    python3-pip \
    python3-venv \
    sqlite3 \
    openssl \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip3 install -r requirements.txt --break-system-packages

# 2. Dependencies
FROM base AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

# 3. Builder
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npx prisma generate
# Dummy URL to satisfy Prisma validation during build
ENV DATABASE_URL="postgresql://dummy:dummy@localhost:5432/dummy"
RUN npm run build

# 4. Runner
FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production

# Don't run as root
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

# Copy public assets
COPY --from=builder /app/public ./public

# Copy standalone build
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

# Copy specific files needed for runtime (Python scripts, Prisma, etc.)
COPY --from=builder --chown=nextjs:nodejs /app/prisma ./prisma
COPY --from=builder --chown=nextjs:nodejs /app/*.py ./
COPY --from=builder --chown=nextjs:nodejs /app/*.txt ./
# Copy data directory if it exists
COPY --from=builder --chown=nextjs:nodejs /app/data ./data

# Install Prisma globally in runner to ensure CLI availability
RUN npm install -g prisma@5.10.2

USER nextjs

EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"
ENV HOME=/tmp

# Note: In standalone mode, we run 'node server.js'.
# Database migrations/seeding should be done via deploy hooks or CI/CD, not on container boot.
CMD ["node", "server.js"]
