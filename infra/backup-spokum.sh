#!/usr/bin/env bash
set -euo pipefail
umask 077

ROOT="${SPOKUM_ROOT:-/opt/spokum}"
BACKUP_ROOT="${SPOKUM_BACKUP_ROOT:-$ROOT/backups}"
RETENTION_DAYS="${SPOKUM_BACKUP_RETENTION_DAYS:-14}"
TIMESTAMP="$(date -u +%Y%m%d-%H%M%S)"
DEST="$BACKUP_ROOT/daily-$TIMESTAMP"
WORK="$BACKUP_ROOT/.daily-$TIMESTAMP.tmp"
CONTAINER_DUMP="/tmp/spokum-backup-$TIMESTAMP.dump"

mkdir -p "$BACKUP_ROOT"
exec 9>"$BACKUP_ROOT/.backup.lock"
if ! flock -n 9; then
  echo "Another SpokUm backup is already running" >&2
  exit 1
fi

cleanup() {
  status=$?
  if (( status != 0 )); then
    rm -rf -- "$WORK"
  fi
  (cd "$ROOT/supabase" && docker compose exec -T db rm -f -- "$CONTAINER_DUMP") >/dev/null 2>&1 || true
  exit "$status"
}
trap cleanup EXIT INT TERM

if [[ ! -d "$ROOT/supabase/volumes/storage" ]]; then
  echo "Storage directory is missing: $ROOT/supabase/volumes/storage" >&2
  exit 1
fi
if [[ -e "$DEST" || -e "$WORK" ]]; then
  echo "Backup destination already exists: $DEST" >&2
  exit 1
fi
mkdir -p "$WORK"

cd "$ROOT/supabase"
docker compose exec -T db pg_dump -U postgres -d postgres -Fc -f "$CONTAINER_DUMP"
docker compose exec -T db pg_restore --list "$CONTAINER_DUMP" > "$WORK/db-contents.txt"
docker compose cp "db:$CONTAINER_DUMP" "$WORK/spokum-db.dump"
docker compose exec -T db rm -f -- "$CONTAINER_DUMP"

tar -czf "$WORK/spokum-storage.tar.gz" -C "$ROOT/supabase/volumes/storage" .
gzip -t "$WORK/spokum-storage.tar.gz"
tar -tzf "$WORK/spokum-storage.tar.gz" >/dev/null
(
  cd "$WORK"
  sha256sum spokum-db.dump spokum-storage.tar.gz > SHA256SUMS
)

mv "$WORK" "$DEST"
find "$BACKUP_ROOT" -mindepth 1 -maxdepth 1 -type d -name 'daily-*' -mtime "+$RETENTION_DAYS" -prune -exec rm -rf -- {} +
echo "Backup verified: $DEST"
