#!/usr/bin/env bash
##############################################################
# Tavilo production deploy — the ONLY command you need on the server.
#
#   bash deploy.sh            deploy origin/main (default)
#   bash deploy.sh rollback   put the previous images back
#   bash deploy.sh status     containers + live /ready check
#   bash deploy.sh logs [svc] follow logs (api, frontend, db, redis, migrate)
#   bash deploy.sh backup     take a database backup now
#
#   DEPLOY_REF=some-branch bash deploy.sh      deploy another ref
#   SKIP_BACKUP=1 bash deploy.sh               skip pre-deploy DB dump
#
# What a deploy does, in order (any failure stops and prints logs):
#   lock -> preflight -> git ff-only -> clean stale containers
#   -> DB backup -> build images -> `compose up -d`
#      (Compose runs `migrate` first, then api, then nginx — enforced by
#       depends_on, so there is no manual migration step)
#   -> wait healthy -> smoke test through nginx (HTTP + HTTPS)
#
# Safe to re-run at any time; every step is idempotent.
# NEVER run `docker compose down -v` (it deletes the database volume).
##############################################################
set -Eeuo pipefail

DEPLOY_DIR="${DEPLOY_DIR:-/opt/tavilo}"
DEPLOY_REF="${DEPLOY_REF:-main}"
BACKUP_DIR="${BACKUP_DIR:-${HOME}/tavilo-backups}"
BACKUP_KEEP="${BACKUP_KEEP:-10}"
HEALTH_TIMEOUT="${HEALTH_TIMEOUT:-180}"
SITE_HOST="${SITE_HOST:-tavilo.website}"
PROJECT="tavilo"
IMAGES=(tavilo-api tavilo-frontend)

log()  { printf '[%s] %s\n' "$(date '+%Y-%m-%d %H:%M:%S')" "$*"; }
warn() { log "WARN: $*"; }
die()  { log "ERROR: $*"; exit 1; }

# Always the production file + secrets file, regardless of the caller's shell,
# so the dev override can never be applied (and DB_* are never empty).
dc() { docker compose -f docker-compose.yml --env-file .env.server "$@"; }

##############################################################
# Failure report — what broke, plus how to get back
##############################################################
on_error() {
  local line="$1"
  trap - ERR
  log "ERROR: deploy failed near line ${line}. Current state:"
  dc ps -a 2>/dev/null || true
  for svc in migrate api frontend; do
    log "── last logs: ${svc}"
    dc logs --no-color --tail=40 "${svc}" 2>/dev/null || true
  done
  cat <<EOF

Nothing is lost:
  • If it failed during 'migrate', the old API is still serving (Alembic
    migrations are transactional on Postgres).
  • Database backup from this run: ${BACKUP_FILE:-<none taken>}
  • To return to the previous release:  bash deploy.sh rollback
EOF
  exit 1
}

##############################################################
# Helpers
##############################################################
container_health() {  # <service> -> healthy|unhealthy|starting|running|exited|missing
  local id
  id="$(dc ps -aq "$1" 2>/dev/null | head -n1)"
  [[ -z "${id}" ]] && { echo missing; return; }
  docker inspect -f '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' "${id}"
}

wait_healthy() {      # <service> [timeout]
  local svc="$1" timeout="${2:-${HEALTH_TIMEOUT}}" waited=0 state
  while :; do
    state="$(container_health "${svc}")"
    [[ "${state}" == "healthy" ]] && { log "  ${svc}: healthy"; return 0; }
    if (( waited >= timeout )); then
      log "ERROR: ${svc} not healthy after ${timeout}s (state: ${state})"
      return 1
    fi
    sleep 3; waited=$((waited + 3))
  done
}

retry() {             # <seconds> <cmd...>
  local limit="$1" waited=0; shift
  until "$@" > /dev/null 2>&1; do
    (( waited >= limit )) && return 1
    sleep 2; waited=$((waited + 2))
  done
}

smoke_test() {
  log "Smoke test through nginx (this exercises nginx -> API -> Postgres + Redis)..."
  retry 60 curl -fsS "http://127.0.0.1/ready" \
    || die "HTTP /ready failed (API, database or Redis unhealthy behind nginx)."
  log "  http  /ready ok"
  retry 30 curl -fsSk --resolve "${SITE_HOST}:443:127.0.0.1" "https://${SITE_HOST}/ready" \
    || die "HTTPS /ready failed (check ssl/origin.pem and ssl/origin.key)."
  log "  https /ready ok"
  retry 30 curl -fsSk --resolve "${SITE_HOST}:443:127.0.0.1" "https://${SITE_HOST}/" \
    || die "HTTPS front page failed."
  log "  https /      ok"
}

##############################################################
# Preflight — fail early with a clear message, before touching anything
##############################################################
preflight() {
  log "Preflight checks..."
  command -v docker > /dev/null || die "docker is not installed."
  command -v curl   > /dev/null || die "curl is not installed."
  command -v flock  > /dev/null || die "flock is not installed (util-linux)."

  local ver
  ver="$(docker compose version --short 2>/dev/null | sed 's/^v//')" \
    || die "Docker Compose v2 plugin is missing."
  printf '%s\n%s\n' "2.20.0" "${ver}" | sort -V -C \
    || die "Docker Compose ${ver} is too old; need >= 2.20."

  [[ -f .env.server ]]              || die ".env.server is missing (DB_USER, DB_PASSWORD, DB_NAME)."
  [[ -f backend/.env.production ]]  || die "backend/.env.production is missing."
  chmod 600 .env.server backend/.env.production
  local v
  for v in DB_USER DB_PASSWORD DB_NAME; do
    grep -Eq "^${v}=.+" .env.server || die "${v} is empty or missing in .env.server."
  done

  [[ -f /opt/tavilo/ssl/origin.pem && -f /opt/tavilo/ssl/origin.key ]] \
    || die "TLS cert/key missing: /opt/tavilo/ssl/origin.pem and origin.key."

  dc config -q || die "Compose configuration is invalid."

  # Port 80/443 held by something that is not our own nginx container.
  if [[ -z "$(dc ps -q --status running frontend 2>/dev/null)" ]] \
     && command -v ss > /dev/null \
     && ss -ltnH '( sport = :80 or sport = :443 )' 2>/dev/null | grep -q .; then
    die "Port 80/443 is already in use by another process (host nginx/apache?). Stop it first."
  fi

  local free_mb
  free_mb="$(df -Pm "${DEPLOY_DIR}" | awk 'NR==2 {print $4}')"
  if (( free_mb < 2000 )); then
    warn "Only ${free_mb} MB free; pruning old build cache."
    docker builder prune -f --filter 'until=72h' > /dev/null || true
    free_mb="$(df -Pm "${DEPLOY_DIR}" | awk 'NR==2 {print $4}')"
    (( free_mb >= 800 )) || die "Disk almost full (${free_mb} MB free). Free space and retry."
  fi
}

##############################################################
# Self-heal leftovers from earlier failed runs
##############################################################
clean_stale() {
  # One-off `compose run` containers (from manual debugging) and containers
  # stuck in Created/Exited state can hold names or block a clean `up`.
  docker ps -aq \
    --filter "label=com.docker.compose.project=${PROJECT}" \
    --filter "label=com.docker.compose.oneoff=True" \
    | xargs -r docker rm -f > /dev/null
  docker ps -aq \
    --filter "label=com.docker.compose.project=${PROJECT}" \
    --filter "status=created" \
    | xargs -r docker rm -f > /dev/null
}

##############################################################
# Database backup (skipped on a first deploy when no DB exists yet)
##############################################################
BACKUP_FILE=""
backup_db() {
  if [[ "${SKIP_BACKUP:-0}" == "1" ]]; then warn "SKIP_BACKUP=1 — not backing up."; return 0; fi
  if [[ -z "$(dc ps -q --status running db 2>/dev/null)" ]]; then
    log "No running database yet (first deploy?) — skipping backup."
    return 0
  fi
  mkdir -p "${BACKUP_DIR}"
  chmod 700 "${BACKUP_DIR}"
  local ts tmp
  ts="$(date '+%Y%m%d-%H%M%S')"
  tmp="${BACKUP_DIR}/.partial-${ts}.sql.gz"
  BACKUP_FILE="${BACKUP_DIR}/pre-deploy-${ts}.sql.gz"
  log "Backing up database -> ${BACKUP_FILE}"
  if dc exec -T db sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" --no-owner' | gzip > "${tmp}" \
     && [[ -s "${tmp}" ]]; then
    mv "${tmp}" "${BACKUP_FILE}"
  else
    rm -f "${tmp}"
    die "Database backup failed; refusing to deploy. (Override with SKIP_BACKUP=1 if you accept the risk.)"
  fi
  # Keep only the newest BACKUP_KEEP dumps.
  ls -1t "${BACKUP_DIR}"/pre-deploy-*.sql.gz 2>/dev/null | tail -n +"$((BACKUP_KEEP + 1))" | xargs -r rm -f
}

##############################################################
# Commands
##############################################################
cmd_deploy() {
  preflight

  if [[ -n "$(git status --porcelain)" ]]; then
    die "Server checkout has uncommitted changes; refusing to deploy. Run: git status"
  fi
  log "Fetching ${DEPLOY_REF}..."
  git fetch --prune origin "${DEPLOY_REF}"
  git merge --ff-only FETCH_HEAD
  log "Deploying commit $(git rev-parse --short HEAD): $(git log -1 --pretty=%s)"

  clean_stale
  backup_db

  # Keep the running release's images as :previous so `rollback` works.
  local img
  for img in "${IMAGES[@]}"; do
    docker image inspect "${img}:latest" > /dev/null 2>&1 && docker tag "${img}:latest" "${img}:previous"
  done

  log "Building images..."
  dc build --pull api frontend

  # Compose orders the rollout itself:
  #   db+redis healthy -> migrate (alembic upgrade head) -> api healthy -> nginx
  # A failing migration aborts here and leaves the old API running.
  log "Rolling out (migrate -> api -> frontend)..."
  dc up -d --remove-orphans

  log "Waiting for services to report healthy..."
  local svc
  for svc in db redis api frontend; do wait_healthy "${svc}"; done

  smoke_test

  docker image prune -f > /dev/null
  docker builder prune -f --filter 'until=168h' > /dev/null || true
  log "Deployment complete: $(git rev-parse --short HEAD) is live."
}

cmd_rollback() {
  local img
  for img in "${IMAGES[@]}"; do
    docker image inspect "${img}:previous" > /dev/null 2>&1 \
      || die "No ${img}:previous image; nothing to roll back to."
  done
  warn "Rolling back application containers. The database schema is NOT reverted;"
  warn "if the failed release added a migration, restore from ${BACKUP_DIR} only if needed."
  for img in "${IMAGES[@]}"; do docker tag "${img}:previous" "${img}:latest"; done
  # --no-deps: do not re-run migrations during a rollback.
  dc up -d --no-build --no-deps --force-recreate api frontend
  wait_healthy api
  wait_healthy frontend
  smoke_test
  log "Rollback complete."
}

cmd_status() {
  dc ps -a
  echo
  curl -fsS "http://127.0.0.1/ready" && echo || { echo "ready check FAILED"; return 1; }
}

cmd_logs()   { dc logs -f --tail=100 "$@"; }
cmd_backup() { backup_db; log "Backup done: ${BACKUP_FILE:-none}"; }

##############################################################
# Entry point (wrapped in a function so editing this file mid-run via
# `git merge` can never corrupt a running deploy)
##############################################################
main() {
  cd "${DEPLOY_DIR}" || die "Cannot cd to ${DEPLOY_DIR}"

  # One deploy at a time.
  exec 9> "/tmp/${PROJECT}-deploy.lock"
  flock -n 9 || die "Another deploy is already running."

  trap 'on_error $LINENO' ERR

  local cmd="${1:-deploy}"
  [[ $# -gt 0 ]] && shift
  case "${cmd}" in
    deploy)   cmd_deploy ;;
    rollback) cmd_rollback ;;
    status)   cmd_status ;;
    logs)     cmd_logs "$@" ;;
    backup)   preflight; cmd_backup ;;
    *)        die "Unknown command '${cmd}'. Use: deploy | rollback | status | logs | backup" ;;
  esac
}

main "$@"; exit $?