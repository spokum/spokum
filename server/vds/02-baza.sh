#!/usr/bin/env bash
set -uo pipefail

DIR=/opt/spokum
STACK=$DIR/supabase
KEYS=/root/spokum-klyuchi.txt
LOG=/root/spokum-baza.log
HOST="${SPOKUM_HOST:-95-215-56-145.sslip.io}"
SITE="${SPOKUM_SITE:-https://spokum.github.io}"

green() { printf '\033[32m%s\033[0m\n' "$1"; }
warn()  { printf '\033[33m%s\033[0m\n' "$1"; }
step()  { printf '\n\033[1m%s\033[0m\n' "$1"; }
die()   { printf '\033[31m%s\033[0m\n' "$1"; exit 1; }

[ "$(id -u)" = "0" ] || die "Запускать нужно от root"
command -v docker >/dev/null 2>&1 || die "Docker не найден, сначала первый скрипт"

if [ "${SPOKUM_INSIDE:-}" != "1" ]; then
  printf '\n\033[1m=== СпокУм · база на своём сервере ===\033[0m\n\n'
  if [ "${SPOKUM_ZANOVO:-}" = "1" ] && [ -d "$STACK" ]; then
    case "$STACK" in
      /opt/spokum/*) ;;
      *) die "Странный путь установки, стирать не буду" ;;
    esac
    echo "Стираем прежнюю установку вместе с данными и ставим заново."
    ( cd "$STACK" && docker compose down -v --remove-orphans >/dev/null 2>&1 )
    rm -rf "$STACK/volumes/db/data"
    rm -rf "$STACK/volumes/storage"
    mkdir -p "$STACK/volumes/storage"
    rm -f "$STACK/.env"
    green "стёрто начисто"
    echo
  fi
  echo "Адрес базы будет: https://$HOST"
  echo "Работа идёт в фоне, обрыв связи ей не мешает."
  echo
  : > "$LOG"
  rm -f /root/spokum-baza-gotovo
  SPOKUM_INSIDE=1 SPOKUM_HOST="$HOST" SPOKUM_SITE="$SITE" \
    setsid nohup bash "$0" >> "$LOG" 2>&1 < /dev/null &
  sleep 2
  tail -f "$LOG" &
  TAILER=$!
  while [ ! -f /root/spokum-baza-gotovo ]; do sleep 3; done
  sleep 2
  kill "$TAILER" 2>/dev/null
  exit 0
fi

finish() { touch /root/spokum-baza-gotovo; }
trap finish EXIT

step "1 из 9. Проверки"
free -m | awk '/Mem:/ {printf "память: %s МБ всего, %s МБ свободно\n", $2, $7}'
df -h / | awk 'NR==2 {print "диск: " $4 " свободно"}'
if ! getent hosts "$HOST" >/dev/null 2>&1; then
  die "Адрес $HOST не резолвится, сертификат выпустить не выйдет"
fi
green "адрес $HOST на месте"

step "2 из 9. Забираем сборку Supabase"
mkdir -p "$DIR"
if [ ! -d "$STACK/.git" ] && [ ! -f "$STACK/docker-compose.yml" ]; then
  rm -rf "$DIR/tmp-supabase"
  git clone --depth 1 --filter=blob:none --sparse \
    https://github.com/supabase/supabase.git "$DIR/tmp-supabase" >/dev/null 2>&1 \
    || die "Не удалось скачать сборку"
  git -C "$DIR/tmp-supabase" sparse-checkout set docker >/dev/null 2>&1
  mkdir -p "$STACK"
  cp -a "$DIR/tmp-supabase/docker/." "$STACK/"
  rm -rf "$DIR/tmp-supabase"
  green "скачано"
else
  green "уже скачано"
fi
[ -f "$STACK/docker-compose.yml" ] || die "Сборка скачалась неправильно"

step "3 из 9. Пароли и ключи"
if [ ! -f "$STACK/.env" ]; then
  cp "$STACK/.env.example" "$STACK/.env"

  PG_PASS=$(tr -dc 'A-Za-z0-9' < /dev/urandom | head -c 40)
  JWT_SECRET=$(tr -dc 'A-Za-z0-9' < /dev/urandom | head -c 48)
  SECRET_BASE=$(tr -dc 'A-Za-z0-9' < /dev/urandom | head -c 64)
  VAULT_KEY=$(tr -dc 'A-Za-z0-9' < /dev/urandom | head -c 32)
  META_KEY=$(tr -dc 'A-Za-z0-9' < /dev/urandom | head -c 32)
  RT_KEY=$(tr -dc 'a-z0-9' < /dev/urandom | head -c 16)
  PANEL_PASS=$(tr -dc 'A-Za-z0-9' < /dev/urandom | head -c 20)
  S3_ID=$(tr -dc 'a-f0-9' < /dev/urandom | head -c 32)
  S3_SECRET=$(tr -dc 'a-f0-9' < /dev/urandom | head -c 64)

  read -r ANON_KEY SERVICE_KEY <<< "$(python3 - "$JWT_SECRET" <<'PY'
import base64, hashlib, hmac, json, sys, time
secret = sys.argv[1]
def raw(data): return base64.urlsafe_b64encode(data).rstrip(b'=').decode()
head = raw(json.dumps({"alg": "HS256", "typ": "JWT"}, separators=(',', ':')).encode())
def token(role):
    now = int(time.time())
    body = raw(json.dumps({"role": role, "iss": "supabase", "iat": now, "exp": now + 315360000}, separators=(',', ':')).encode())
    msg = f"{head}.{body}".encode()
    sign = raw(hmac.new(secret.encode(), msg, hashlib.sha256).digest())
    return f"{head}.{body}.{sign}"
print(token("anon"), token("service_role"))
PY
)"
  [ -n "$ANON_KEY" ] || die "Не получилось выпустить ключи"

  put() { python3 - "$STACK/.env" "$1" "$2" <<'PY'
import sys
path, key, value = sys.argv[1], sys.argv[2], sys.argv[3]
lines = open(path, encoding='utf-8').read().splitlines()
done = False
for i, line in enumerate(lines):
    if line.startswith(key + '='):
        lines[i] = key + '=' + value
        done = True
if not done:
    lines.append(key + '=' + value)
open(path, 'w', encoding='utf-8').write('\n'.join(lines) + '\n')
PY
  }

  put POSTGRES_PASSWORD "$PG_PASS"
  put JWT_SECRET "$JWT_SECRET"
  put ANON_KEY "$ANON_KEY"
  put SERVICE_ROLE_KEY "$SERVICE_KEY"
  put SECRET_KEY_BASE "$SECRET_BASE"
  put VAULT_ENC_KEY "$VAULT_KEY"
  put PG_META_CRYPTO_KEY "$META_KEY"
  put REALTIME_DB_ENC_KEY "$RT_KEY"
  put DASHBOARD_USERNAME spokum
  put DASHBOARD_PASSWORD "$PANEL_PASS"
  put S3_PROTOCOL_ACCESS_KEY_ID "$S3_ID"
  put S3_PROTOCOL_ACCESS_KEY_SECRET "$S3_SECRET"
  put SUPABASE_PUBLIC_URL "https://$HOST"
  put API_EXTERNAL_URL "https://$HOST/auth/v1"
  put SITE_URL "$SITE"
  put ADDITIONAL_REDIRECT_URLS "$SITE/spokum/,$SITE/spokum/index.html"
  put ENABLE_EMAIL_AUTOCONFIRM true
  put ENABLE_EMAIL_SIGNUP true
  put DISABLE_SIGNUP false
  put ENABLE_PHONE_SIGNUP false
  put ENABLE_PHONE_AUTOCONFIRM false
  put STUDIO_DEFAULT_ORGANIZATION "SpokUm"
  put STUDIO_DEFAULT_PROJECT "spokum"
  put COMPOSE_FILE "docker-compose.yml:compose.spokum.yml"
  chmod 600 "$STACK/.env"
  green "ключи выпущены"
else
  green "ключи уже есть, оставляем прежние"
fi

step "4 из 9. Настройки под четыре гигабайта"
cat > "$STACK/compose.spokum.yml" <<'YML'
services:
  supavisor:
    profiles: ["nikogda"]

  api-gw:
    ports: !override
      - "127.0.0.1:8000:8000"

  db:
    command: !override
      - postgres
      - -c
      - config_file=/etc/postgresql/postgresql.conf
      - -c
      - log_min_messages=fatal
      - -c
      - shared_buffers=768MB
      - -c
      - effective_cache_size=2GB
      - -c
      - work_mem=8MB
      - -c
      - maintenance_work_mem=192MB
      - -c
      - max_connections=100
      - -c
      - random_page_cost=1.1
      - -c
      - effective_io_concurrency=200
      - -c
      - wal_buffers=16MB
      - -c
      - max_wal_size=2GB
      - -c
      - min_wal_size=512MB
      - -c
      - checkpoint_completion_target=0.9

  caddy:
    container_name: spokum-caddy
    image: caddy:2-alpine
    restart: unless-stopped
    depends_on:
      - api-gw
    ports:
      - "80:80"
      - "443:443"
    environment:
      SPOKUM_HOST: ${SPOKUM_HOST}
    volumes:
      - ./Caddyfile:/etc/caddy/Caddyfile:ro
      - caddy-data:/data
      - caddy-config:/config

volumes:
  caddy-data:
  caddy-config:
YML

cat > "$STACK/Caddyfile" <<'CADDY'
{$SPOKUM_HOST} {
	encode zstd gzip
	request_body {
		max_size 60MB
	}
	reverse_proxy api-gw:8000 {
		flush_interval -1
	}
}
CADDY

grep -q '^SPOKUM_HOST=' "$STACK/.env" || echo "SPOKUM_HOST=$HOST" >> "$STACK/.env"
python3 - "$STACK/.env" "$HOST" <<'PY'
import sys
path, host = sys.argv[1], sys.argv[2]
lines = open(path, encoding='utf-8').read().splitlines()
for i, line in enumerate(lines):
    if line.startswith('SPOKUM_HOST='):
        lines[i] = 'SPOKUM_HOST=' + host
    if line.startswith('SUPABASE_PUBLIC_URL='):
        lines[i] = 'SUPABASE_PUBLIC_URL=https://' + host
    if line.startswith('API_EXTERNAL_URL='):
        lines[i] = 'API_EXTERNAL_URL=https://' + host + '/auth/v1'
open(path, 'w', encoding='utf-8').write('\n'.join(lines) + '\n')
PY
green "готово"

step "5 из 9. Логи контейнеров под присмотром"
mkdir -p /etc/docker
cat > /etc/docker/daemon.json <<'JSON'
{
  "iptables": true,
  "log-driver": "json-file",
  "log-opts": { "max-size": "10m", "max-file": "3" }
}
JSON
systemctl restart docker >/dev/null 2>&1
sleep 3
green "логи не разрастутся; наружу открыт только Caddy, сама база висит на 127.0.0.1"

step "6 из 9. Запуск, первый раз это долго"
cd "$STACK"
docker compose pull -q 2>&1 | tail -3
docker compose up -d 2>&1 | tail -20

step "7 из 9. Ждём, пока всё поднимется"
for i in $(seq 1 60); do
  BAD=$(docker compose ps --format '{{.Service}} {{.Health}} {{.State}}' 2>/dev/null \
    | awk '$2=="unhealthy" || $2=="starting" || $3=="restarting" {print $1}' | tr '\n' ' ')
  if [ -z "$BAD" ]; then break; fi
  printf '  ждём: %s\n' "$BAD"
  sleep 10
done
docker compose ps --format 'table {{.Service}}\t{{.Status}}'

SICK=$(docker compose ps --format '{{.Service}} {{.State}}' 2>/dev/null | awk '$2=="restarting" {print $1}')
if [ -n "$SICK" ]; then
  warn "не поднялись: $SICK"
  for one in $SICK; do
    printf '\n  --- %s, последние строки ---\n' "$one"
    docker compose logs --tail 12 --no-log-prefix "$one" 2>&1 | tail -12 | sed 's/^/  /'
  done
fi

step "8 из 9. Сертификат и проверка снаружи"
ANON=$(grep '^ANON_KEY=' "$STACK/.env" | cut -d= -f2-)
OK=0
for i in $(seq 1 30); do
  CODE=$(curl -s -o /dev/null -w '%{http_code}' --max-time 10 \
    -H "apikey: $ANON" -H "Authorization: Bearer $ANON" "https://$HOST/rest/v1/" 2>/dev/null)
  case "$CODE" in
    200|401|404) OK=1; break ;;
  esac
  printf '  сертификат ещё выпускается, ответ %s\n' "${CODE:-нет}"
  sleep 10
done
if [ "$OK" = "1" ]; then
  green "https://$HOST отвечает, сертификат выпущен"
else
  warn "снаружи пока не отвечает, смотрите: docker compose -f $STACK/docker-compose.yml logs caddy"
fi

step "9 из 9. Сохраняем ключи"
{
  echo "СпокУм · доступы к своей базе"
  echo "сохранено: $(date)"
  echo
  echo "Адрес базы:       https://$HOST"
  echo "Панель Studio:    https://$HOST"
  echo "  логин:          $(grep '^DASHBOARD_USERNAME=' "$STACK/.env" | cut -d= -f2-)"
  echo "  пароль:         $(grep '^DASHBOARD_PASSWORD=' "$STACK/.env" | cut -d= -f2-)"
  echo
  echo "ANON_KEY (можно вставлять в приложение):"
  grep '^ANON_KEY=' "$STACK/.env" | cut -d= -f2-
  echo
  echo "SERVICE_ROLE_KEY (НИКОМУ, только для сервера):"
  grep '^SERVICE_ROLE_KEY=' "$STACK/.env" | cut -d= -f2-
  echo
  echo "Пароль Postgres:"
  grep '^POSTGRES_PASSWORD=' "$STACK/.env" | cut -d= -f2-
  echo
  echo "Файл со всеми настройками: $STACK/.env"
  echo "Управление: cd $STACK && docker compose ps | logs | restart"
} > "$KEYS"
chmod 600 "$KEYS"
green "записано в $KEYS"

printf '\n\033[1m=== База поднята ===\033[0m\n\n'
echo "Адрес:  https://$HOST"
echo "Панель: https://$HOST  (логин spokum)"
echo
free -m | awk '/Mem:/ {printf "память занято %s МБ из %s МБ\n", $3, $2}'
echo
echo "Все доступы лежат в $KEYS — не показывайте этот файл целиком никому."
echo
echo "Мне нужна только одна строка, она и так открытая:"
echo
grep -A1 '^ANON_KEY' "$KEYS" | tail -1
echo
green "Покажите мне её и список сервисов выше."
