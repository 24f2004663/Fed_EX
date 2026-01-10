# 1. Base image with Node.js and OS libraries
FROM node:20-bookworm-slim AS base

# 2. Install Python 3 and build tools
RUN apt-get update && apt-get install -y \
    python3 \
    python3-pip \
    python3-venv \
    sqlite3 \
    openssl \
    && rm -rf /var/lib/apt/lists/*

# 3. Set working directory
WORKDIR /app

# 4. Copy package files and install dependencies
COPY package*.json ./
RUN npm ci

# 5. Copy the rest of the application
COPY . .

# 6. Generate Prisma Client
RUN npx prisma generate

# 7. Build the Next.js application
RUN npm run build

# 8. Expose the port
EXPOSE 3000

# 9. Start the application
CMD ["sh", "-c", "npx prisma db push && node prisma/simulate_pipeline.js && npm start"]
