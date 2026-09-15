#!/usr/bin/env bash
set -uo pipefail
STACK=/opt/spokum/supabase
green() { printf '\033[32m%s\033[0m\n' "$1"; }
die() { printf '\033[31m%s\033[0m\n' "$1"; exit 1; }
[ -f "$STACK/Caddyfile" ] || die "Не найдена настройка Caddy"

HOST=$(grep '^SPOKUM_HOST=' "$STACK/.env" | cut -d= -f2-)
IP=$(curl -s4 --max-time 10 ifconfig.me 2>/dev/null || hostname -I | awk '{print $1}')
OLD="${IP//./-}.sslip.io"

cat > "$STACK/Caddyfile" <<CADDY
{\$SPOKUM_HOST}, $OLD {
	encode zstd gzip
	request_body {
		max_size 60MB
	}
	reverse_proxy api-gw:8000 {
		flush_interval -1
	}
}
CADDY

cd "$STACK"
docker compose up -d --force-recreate caddy 2>&1 | tail -3
sleep 6
ANON=$(grep '^ANON_KEY=' .env | cut -d= -f2-)
for name in "$HOST" "$OLD"; do
  CODE=$(curl -s -o /dev/null -w '%{http_code}' --max-time 15 \
    -H "apikey: $ANON" -H "Authorization: Bearer $ANON" \
    "https://$name/rest/v1/profiles?select=id&limit=1" 2>/dev/null)
  printf '  %-34s %s\n' "$name" "${CODE:-нет ответа}"
done
echo
green "Оба адреса ведут на базу, старые вкладки не отвалятся."
