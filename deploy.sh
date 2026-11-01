#!/usr/bin/env bash
# Tavilo production deployment. Run on Lightsail: bash deploy.sh
set -euo pipefail

DEPLOY_DIR="/opt/tavilo"
COMPOSE_FILE="docker-compose.yml"
DEPLOY_REF="${DEPLOY_REF:-main}"

log() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*"; }

cd "${DEPLOY_DIR}"

# A deployment must be reproducible: never merge around server-local changes.
if [[ -n "$(git status --porcelain)" ]]; then
  log "ERROR: deployment checkout has uncommitted changes; refusing to overwrite it."
  exit 1
fi

log "Fetching ${DEPLOY_REF}..."
git fetch --prune origin "${DEPLOY_REF}"
git pull --ff-only origin "${DEPLOY_REF}"

if [[ ! -f .env.server || ! -f backend/.env.production ]]; then
  log "ERROR: required production environment file is missing."
  exit 1
fi
set -a
# shellcheck disable=SC1091
source .env.server
set +a

log "Validating production Compose configuration..."
if ! docker compose -f "${COMPOSE_FILE}" config > /dev/null; then
  log "ERROR: production Compose or environment configuration is invalid."
  exit 1
fi

log "Building immutable application images..."
docker compose -f "${COMPOSE_FILE}" build --pull api frontend

# Bring up only the stateful dependencies first. The API is intentionally not
# started from the new image until its schema is at the required revision.
log "Starting database and Redis..."
docker compose -f "${COMPOSE_FILE}" up -d db redis

log "Waiting for database and Redis readiness..."
MAX_WAIT=120
ELAPSED=0
until docker compose -f "${COMPOSE_FILE}" exec -T db pg_isready -U "${DB_USER}" -d "${DB_NAME}" > /dev/null 2>&1 \
  && docker compose -f "${COMPOSE_FILE}" exec -T redis redis-cli ping | grep -qx PONG; do
  sleep 3
  ELAPSED=$((ELAPSED + 3))
  if [[ ${ELAPSED} -ge ${MAX_WAIT} ]]; then
    log "ERROR: database or Redis did not become ready within ${MAX_WAIT}s."
    docker compose -f "${COMPOSE_FILE}" logs --tail=50 db redis
    exit 1
  fi
done

log "Running database migrations before starting the new API..."
# `api` has a fixed network address so FastAPI can trust X-Real-IP only from
# the Nginx container. Release that address before Compose creates the
# short-lived migration container for the same service.
docker compose -f "${COMPOSE_FILE}" stop api
docker compose -f "${COMPOSE_FILE}" run --rm --no-deps api alembic upgrade head

log "Starting the new API and frontend..."
docker compose -f "${COMPOSE_FILE}" up -d --remove-orphans api frontend

log "Waiting for API health..."
ELAPSED=0
until docker compose -f "${COMPOSE_FILE}" exec -T api curl -sf http://localhost:8000/health > /dev/null 2>&1; do
  sleep 5
  ELAPSED=$((ELAPSED + 5))
  if [[ ${ELAPSED} -ge ${MAX_WAIT} ]]; then
    log "ERROR: API did not become healthy within ${MAX_WAIT}s."
    docker compose -f "${COMPOSE_FILE}" logs --tail=100 api
    exit 1
  fi
done

log "Pruning dangling Docker images..."
docker image prune -f
log "Deployment complete."
