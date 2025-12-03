# Docker Deployment Guide

This project provides containerized deployment with Vite + Bun React application.

## Quick Start

### Development (with hot reload)
```bash
# Using Docker Compose
docker-compose --profile development up app-dev

# Using deployment script
./docker-deploy.sh dev
```

### Production (built application)
```bash
# Build and run directly
docker build --target production -t cengo-portfolio .
docker run -p 3000:3000 cengo-portfolio

# Using Docker Compose
docker-compose --profile production up app-prod

# Using deployment script
./docker-deploy.sh prod
```

## Docker Stages

### Development Stage (`development`)
- Runs Vite development server
- Hot module replacement enabled
- Port 3000 exposed
- Volume mounts for live reloading

### Build Stage (`builder`)
- Installs all dependencies
- Builds optimized production bundle
- Outputs to `/app/dist`

### Production Stage (`production`)
- Serves built static files with `serve`
- Node.js 18 Alpine base
- Bun runtime included
- Optimized for production

## Docker Compose Profiles

### Development Profile
```bash
docker-compose --profile development up
```
- Starts development container
- Enables hot reloading
- Mounts source code

### Production Profile
```bash
docker-compose --profile production up
```
- Builds and runs production container
- No source code mounting
- Optimized static serving

## Environment Variables

- `NODE_ENV`: Development or Production
- `VITE_API_URL`: API endpoint for development

## Health Checks

Production container includes health check:
```bash
curl -f http://localhost:3000
```

## Container Management

### Build Image
```bash
docker build -t cengo-portfolio .
```

### Run Container
```bash
docker run -d -p 3000:3000 --name cengo-app cengo-portfolio
```

### View Logs
```bash
docker logs -f cengo-app
```

### Stop Container
```bash
docker stop cengo-app
```

### Remove Container
```bash
docker rm cengo-app
```

## Deployment Script Usage

The `docker-deploy.sh` script provides simple commands:

```bash
# Development
./docker-deploy.sh dev

# Production
./docker-deploy.sh prod

# Show logs
./docker-deploy.sh logs

# Clean up
./docker-deploy.sh clean
```

## Platform Compatibility

✅ **Docker-based Platforms**: AWS ECS, Google Cloud Run, Azure Container Apps, DigitalOcean App Platform, Heroku, Railway, Render

✅ **Static Platforms**: Vercel, Netlify (use `dist/` folder)

✅ **Local Development**: Docker Desktop, colima, Rancher Desktop

## Container Features

- **Multi-stage builds** for optimized image size
- **Health checks** for monitoring
- **Environment-specific** configurations
- **Volume mounts** for development
- **Proper labels** for container metadata
- **Optimized base images** (Alpine Linux)

## Troubleshooting

### Build Issues
- Clear Docker cache: `docker system prune -a`
- Check logs: `docker logs <container-name>`
- Rebuild: `docker-compose build --no-cache`

### Port Conflicts
- Change port mapping: `-p 8080:3000`
- Check port usage: `lsof -i :3000`

### Development Issues
- Ensure volumes are mounted correctly
- Check Node.js compatibility
- Verify package.json scripts