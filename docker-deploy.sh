#!/bin/bash

# Docker Deployment Script for Cengo Portfolio
# Usage: ./docker-deploy.sh [dev|prod]

set -e

# Function to show usage
usage() {
    echo "Usage: $0 [dev|prod]"
    echo "  dev  - Start development container with hot reload"
    echo "  prod - Build and run production container"
    exit 1
}

# Check if argument is provided
if [ $# -eq 0 ]; then
    usage
fi

ENVIRONMENT=$1

# Function to start development environment
start_dev() {
    echo "🚀 Starting development environment..."
    docker-compose --profile development up app-dev
}

# Function to start production environment
start_prod() {
    echo "🏗️  Building and starting production container..."
    docker-compose --profile production up --build app-prod
}

# Function to clean up
cleanup() {
    echo "🧹 Cleaning up containers..."
    docker-compose down --remove-orphans
}

# Function to show logs
show_logs() {
    echo "📋 Showing logs..."
    if [ "$ENVIRONMENT" = "dev" ]; then
        docker-compose logs -f app-dev
    else
        docker-compose logs -f app-prod
    fi
}

# Main logic
case $ENVIRONMENT in
    dev)
        start_dev
        ;;
    prod)
        start_prod
        ;;
    logs)
        show_logs
        ;;
    clean)
        cleanup
        ;;
    *)
        usage
        ;;
esac