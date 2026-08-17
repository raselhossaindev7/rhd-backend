#!/bin/bash

# VPS Deployment Script for RHD Backend
# Run: chmod +x deploy.sh && ./deploy.sh

set -e

echo "========================================="
echo "  RHD Backend VPS Deployment"
echo "========================================="
echo ""

# Check required files
if [ ! -f "docker-compose.yml" ]; then
    echo "Error: docker-compose.yml not found!"
    exit 1
fi

if [ ! -f ".env" ]; then
    echo "Error: .env file not found!"
    echo "Please copy .env.example to .env and configure it first."
    exit 1
fi

# Build and start containers
echo "Building and starting containers..."
docker compose up -d --build

# Run database migrations
echo ""
echo "Running database migrations..."
docker compose run --rm backend npx prisma migrate deploy || echo "WARN: migration failed"

echo ""
echo "========================================="
echo "  Deployment Complete!"
echo "========================================="
echo ""
echo "Backend running on:"
echo "  - Docker: http://rhd-api:5000"
echo "  - Local:  http://localhost:8080"
echo "  - HTTPS:  https://localhost:9443"
echo ""
echo "API URL: https://api.raselhossain.dev"
echo ""
echo "To issue the SSL certificate (first time only):"
echo "  docker compose run --rm certbot certonly --webroot -w /var/www/certbot -d api.raselhossain.dev"
echo ""
echo "Useful commands:"
echo "  - View logs: docker compose logs -f"
echo "  - Restart:   docker compose restart"
echo "  - Stop:      docker compose down"
echo ""