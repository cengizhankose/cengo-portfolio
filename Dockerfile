# Multi-stage Dockerfile for Vite + Bun React app
FROM oven/bun:1.3.3-alpine AS base
WORKDIR /app

# Copy package files
COPY package.json bun.lock* ./

# Install dependencies
RUN bun install --frozen-lockfile

# Development stage
FROM base AS development
ENV NODE_ENV=development

# Copy source code
COPY . .

# Expose port
EXPOSE 3000

# Start development server
CMD ["bun", "run", "dev"]

# Production build stage
FROM base AS builder
ENV NODE_ENV=production

# Copy source code
COPY . .

# Build the application
RUN bun run build

# Production stage - Use Node.js to serve static files
FROM node:18-alpine AS production

WORKDIR /app

# Copy built assets from builder stage
COPY --from=builder /app/dist ./dist

# Install serve for static file serving
RUN npm install -g serve

# Expose port
EXPOSE 3000

# Health check (optional - remove if causing issues)
# HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
#   CMD wget --no-verbose --tries=1 --spider http://localhost:3000 || exit 1

# Add proper labels
LABEL maintainer="Cengizhan Köse"
LABEL version="1.0.0"
LABEL description="Cengizhan Köse Portfolio - Vite + Bun React App"

# Serve the built application
CMD ["serve", "-s", "dist", "-l", "3000"]