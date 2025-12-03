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

# Build stage
FROM base AS builder
ENV NODE_ENV=production

# Copy source code
COPY . .

# Build the application
RUN bun run build

# Production stage
FROM nginx:alpine AS production

# Install curl for health check
RUN apk add --no-cache curl

# Copy custom nginx configuration
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Copy built assets from builder stage
COPY --from=builder /app/build /usr/share/nginx/html

# Expose port
EXPOSE 80

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD curl -f http://localhost/ || exit 1

# Add proper labels
LABEL maintainer="Cengizhan Köse"
LABEL version="1.0.0"
LABEL description="Cengizhan Köse Portfolio - Vite + Bun React App"

# Start nginx
CMD ["nginx", "-g", "daemon off;"]