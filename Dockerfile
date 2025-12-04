# Multi-stage Dockerfile for Vite + Bun React app
FROM oven/bun:1.3.3-alpine AS base
WORKDIR /app

# Copy package files
COPY package.json bun.lock* ./

# Install dependencies once and reuse
RUN bun install --frozen-lockfile

# Development target (optional)
FROM base AS development
ENV NODE_ENV=development
COPY . .
EXPOSE 3000
CMD ["bun", "run", "dev"]

# Build target
FROM base AS builder
ENV NODE_ENV=production
COPY . .
RUN bun run build

# Production stage - serve static files without fetching extra tools
FROM node:18-alpine AS production
WORKDIR /app
RUN npm install -g serve
COPY --from=builder /app/dist ./dist
EXPOSE 3000
CMD ["serve", "-s", "dist", "-l", "3000"]
