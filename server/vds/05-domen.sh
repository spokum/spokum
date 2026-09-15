#!/usr/bin/env bash
set -uo pipefail

STACK=/opt/spokum/supabase
HOST="${1:-api.spokum.ru}"
SITE="${SPOKUM_SITE:-https://spokum.ru}"

green() { printf '\033[32m%s\033[0m\n' "$1"; }
warn()  { printf '\033[33m%s\033[0m\n' "$1"; }
step()  { printf '\n\033[1m%s\033[0m\n' "$1"; }
die()   { printf '\033[31m%s\033[0m\n' "$1"; exit 1; }

[ "$(id -u)" = "0" ] || die "Запускать нужно от root"
[ -f "$STACK/.env" ] || die "База не установлена"

printf '\n\033[1m=== СпокУм · переезд базы на домен %s ===\033[0m\n' "$HOST"

step "1 из 5. Проверяем, куда смотрит домен"
MY=$(curl -s4 --max-time 10 ifconfig.me 2>/dev/null || hostname -I | awk '{print $1}')
GOT=$(getent hosts "$HOST" | awk '{print $1}' | head -1)
echo "  сервер:  $MY"
echo "  домен:   ${GOT:-не резолвится}"
if [ -z "$GOT" ]; then
  die "Домен $HOST никуда не смотрит. Пропишите A-запись на $MY и подождите минут десять"
fi
if [ "$GOT" != "$MY" ]; then
  die "Домен $HOST смотрит на $GOT, а сервер $MY. Поправьте A-запись"
fi
green "домен смотрит на этот сервер"

step "2 из 5. Проверяем, что к нам пускают по 80 порту"
CODE=$(curl -s -o /dev/null -w '%{http_code}' --max-time 15 "http://$HOST/" 2>/dev/null)
[ -n "$CODE" ] && [ "$CODE" != "000" ] && green "порт открыт, ответ $CODE" || warn "по 80 порту тишина, сертификат может не выпуститься"

step "3 из 5. Переписываем настройки"
cp "$STACK/.env" "$STACK/.env.do-domena"
python3 - "$STACK/.env" "$HOST" "$SITE" <<'PY'
import sys
path, host, site = sys.argv[1], sys.argv[2], sys.argv[3]
lines = open(path, encoding='utf-8').read().splitlines()
swap = {
    'SPOKUM_HOST': host,
    'SUPABASE_PUBLIC_URL': 'https://' + host,
    'API_EXTERNAL_URL': 'https://' + host + '/auth/v1',
    'SITE_URL': site,
    'ADDITIONAL_REDIRECT_URLS': site + '/,https://spokum.github.io/spokum/',
}
seen = set()
for i, line in enumerate(lines):
    key = line.split('=', 1)[0]
    if key in swap:
        lines[i] = key + '=' + swap[key]
        seen.add(key)
for key, value in swap.items():
    if key not in seen:
        lines.append(key + '=' + value)
open(path, 'w', encoding='utf-8').write('\n'.join(lines) + '\n')
PY
green "прежние настройки сохранены в .env.do-domena"

step "4 из 5. Перезапуск и выпуск сертификата"
cd "$STACK"
docker compose up -d --force-recreate caddy auth studio api-gw 2>&1 | tail -6
sleep 5

ANON=$(grep '^ANON_KEY=' .env | cut -d= -f2-)
OK=0
for i in $(seq 1 12); do
  CODE=$(curl -s -o /dev/null -w '%{http_code}' --max-time 10 \
    -H "apikey: $ANON" -H "Authorization: Bearer $ANON" "https://$HOST/rest/v1/profiles?select=id&limit=1" 2>/dev/null)
  if [ "$CODE" = "200" ]; then OK=1; break; fi
  printf '  ждём сертификат, ответ %s\n' "${CODE:-нет}"
  sleep 10
done

step "5 из 5. Итог"
if [ "$OK" = "1" ]; then
  green "https://$HOST работает, сертификат выпущен"
  echo
  echo "Теперь пришлите мне две строки для приложения:"
  echo
  echo "адрес: https://$HOST"
  echo "ключ:"
  echo "$ANON"
else
  warn "по домену пока не отвечает"
  echo
  echo "Что смотреть:"
  echo "  docker compose -f $STACK/docker-compose.yml logs --tail 30 caddy"
  echo
  echo "Откатиться на прежний адрес:"
  echo "  cp $STACK/.env.do-domena $STACK/.env && cd $STACK && docker compose up -d --force-recreate caddy auth studio api-gw"
fi
