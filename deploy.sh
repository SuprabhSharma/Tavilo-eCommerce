#!/usr/bin/env bash
##############################################################
# Tavilo — Production deploy script
# Run on the Lightsail server: bash deploy.sh
# Make executable once: chmod +x deploy.sh
##############################################################
set -euo pipefail

DEPLOY_DIR="/opt/tavilo"
COMPOSE_FILE="docker-compose.yml"

log() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*"; }

log "🚀 Starting Tavilo deploy..."

# ── 1. Pull latest code ──────────────────────────────────
cd "${DEPLOY_DIR}"
log "📥 Pulling latest code from main..."
git pull origin main

# ── 2. Load server env (DB credentials for compose) ──────
if [[ -f .env.server ]]; then
  set -a
  # shellcheck disable=SC1091
  source .env.server
  set +a
else
  log "❌ .env.server not found! Aborting."
  exit 1
fi

# ── 3. Build and restart containers ──────────────────────
log "🔨 Building images and (re)starting services..."
docker compose -f "${COMPOSE_FILE}" build --pull
docker compose -f "${COMPOSE_FILE}" up -d --remove-orphans

# ── 4. Wait for api to become healthy ────────────────────
log "⏳ Waiting for api container to be healthy..."
MAX_WAIT=120
ELAPSED=0
until docker compose -f "${COMPOSE_FILE}" exec -T api curl -sf http://localhost:8000/health > /dev/null 2>&1; do
  sleep 5
  ELAPSED=$((ELAPSED + 5))
  if [[ ${ELAPSED} -ge ${MAX_WAIT} ]]; then
    log "❌ api did not become healthy within ${MAX_WAIT}s. Check logs:"
    docker compose -f "${COMPOSE_FILE}" logs --tail=50 api
    exit 1
  fi
done

# ── 5. Run Alembic migrations ─────────────────────────────
log "🗄️  Running database migrations..."
docker compose -f "${COMPOSE_FILE}" exec -T api alembic upgrade head

# ── 6. Remove dangling images to free disk space ─────────
log "🧹 Pruning dangling images..."
docker image prune -f

log "✅ Deploy complete! $(date)"
