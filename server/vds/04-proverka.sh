#!/usr/bin/env bash
STACK=/opt/spokum/supabase
cd "$STACK" 2>/dev/null || { echo "нет папки $STACK"; exit 1; }
HOST=$(grep '^SPOKUM_HOST=' .env | cut -d= -f2-)
ANON=$(grep '^ANON_KEY=' .env | cut -d= -f2-)

line() { printf '\n\033[1m--- %s ---\033[0m\n' "$1"; }

line "1. Что запущено"
docker compose ps --format 'table {{.Service}}\t{{.Status}}'

line "2. Кто занял порты 80 и 443"
ss -tlnp 2>/dev/null | grep -E ':80 |:443 ' || echo "никто не слушает 80 и 443"

line "3. Что говорит Caddy"
docker compose logs --tail 40 --no-log-prefix caddy 2>&1 | tail -40

line "4. Отвечает ли база внутри сервера"
curl -s -o /dev/null -w 'шлюз на 127.0.0.1:8000 отдал: %{http_code}\n' --max-time 10 \
  -H "apikey: $ANON" http://127.0.0.1:8000/rest/v1/

line "5. Отвечает ли Caddy по http"
curl -s -o /dev/null -w 'http отдал: %{http_code}\n' --max-time 10 http://127.0.0.1/

line "6. Виден ли сервер сам себе снаружи"
echo "адрес: $HOST"
getent hosts "$HOST" || echo "адрес не резолвится"
curl -s -o /dev/null -w 'снаружи по https: %{http_code}\n' --max-time 20 "https://$HOST/rest/v1/"

line "7. Пускают ли к нам на 80 порт"
curl -s -o /dev/null -w 'извне на порт 80: %{http_code}\n' --max-time 20 "http://$HOST/"

line "8. Файрвол"
ufw status 2>/dev/null | head -8

line "9. Сертификат"
docker compose exec -T caddy ls -R /data/caddy/certificates 2>/dev/null | head -20 || echo "папки с сертификатом нет"

printf '\n\033[1m--- конец ---\033[0m\n'
