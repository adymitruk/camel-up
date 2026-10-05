#!/bin/bash
# Deploy Camel Up to apps.dymitruk.com staging or prod
# Usage: ./deploy.sh [staging|prod]
set -e

ENV="${1:-staging}"
WWW="/var/www/apps.dymitruk.com/$ENV/camel-up"
SRC="$(cd "$(dirname "$0")" && pwd)"   # this repo IS the app

if [ "$ENV" != "staging" ] && [ "$ENV" != "prod" ]; then
  echo "Usage: $0 [staging|prod]"
  exit 1
fi

echo "🚀 Deploying Camel Up → $ENV"

# Ensure target dir exists
sudo mkdir -p "$WWW"
sudo chown ubuntu:ubuntu "$WWW"

# Copy repo contents into www (never a git repo there)
rsync -a --delete \
  --exclude '.git' \
  --exclude 'deploy.sh' \
  "$SRC/" "$WWW/"

echo "✅ Deployed to https://apps.dymitruk.com/$ENV/camel-up/"