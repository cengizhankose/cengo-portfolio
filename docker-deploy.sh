#!/bin/bash

# Local Docker helper for Cengo Portfolio (BE-25). Not a deployment path:
# production is Out Plane building the Dockerfile on every push to main.
# Usage: ./docker-deploy.sh dev | prod | logs [dev|prod] | clean

set -e

usage() {
    echo "Usage: $0 dev | prod | logs [dev|prod] | clean"
    echo "  dev   - Start the development container with hot reload (compose db included)"
    echo "  prod  - Build and run the production image against the compose database"
    echo "  logs  - Follow the logs of the prod (default) or dev container"
    echo "  clean - Stop and remove the containers"
    exit 1
}

if [ $# -eq 0 ]; then
    usage
fi

start_dev() {
    echo "Starting development environment..."
    docker compose --profile development up app-dev
}

start_prod() {
    echo "Building and starting the production container..."
    docker compose --profile production up --build app-prod
}

cleanup() {
    echo "Cleaning up containers..."
    docker compose --profile development --profile production down --remove-orphans
}

show_logs() {
    echo "Showing logs..."
    if [ "${1:-prod}" = "dev" ]; then
        docker compose logs -f app-dev
    else
        docker compose logs -f app-prod
    fi
}

case $1 in
    dev)
        start_dev
        ;;
    prod)
        start_prod
        ;;
    logs)
        show_logs "$2"
        ;;
    clean)
        cleanup
        ;;
    *)
        usage
        ;;
esac
