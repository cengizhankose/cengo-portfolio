# Use Node.js as base image
FROM node:18-alpine AS base

# Install Bun globally
FROM oven/bun:1.3.3 AS bun-base

# Install dependencies only when needed
FROM bun-base AS deps
WORKDIR /app

# Copy package files
COPY package.json bun.lock* ./

# Install dependencies with Bun
RUN bun install --frozen-lockfile --production=false

# Development stage
FROM base AS development
WORKDIR /app

# Copy bun and node modules from deps stage
COPY --from=deps /app/node_modules ./node_modules
COPY --from=bun-base /usr/local/bin/bun /usr/local/bin/bun

# Copy source code
COPY . .

# Set environment for development
ENV NODE_ENV=development
ENV VITE_API_URL=http://localhost:3000

# Expose development port
EXPOSE 3000

# Start development server
CMD ["bun", "run", "dev"]

# Build stage
FROM base AS builder
WORKDIR /app

# Copy bun and dependencies
COPY --from=deps /app/node_modules ./node_modules
COPY --from=bun-base /usr/local/bin/bun /usr/local/bin/bun

# Copy source code
COPY . .

# Set environment for production
ENV NODE_ENV=production

# Build the application
RUN bun run build

# Production stage
FROM nginx:alpine AS production

# Copy custom nginx configuration
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Copy built assets from builder stage
COPY --from=builder /app/build /usr/share/nginx/html

# Expose port
EXPOSE 80

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD curl -f http://localhost/ || exit 1

# Start nginx
CMD ["nginx", "-g", "daemon off;"]