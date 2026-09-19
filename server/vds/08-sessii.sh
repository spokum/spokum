#!/usr/bin/env bash
# СпокУм · вход больше не вылетает
#
# Что делает: настраивает службу входа (auth) так, чтобы сессия не отзывалась
# из-за обрыва связи, смены сети или VPN. Запускать один раз, можно и повторно.
set -uo pipefail

STACK=/opt/spokum/supabase
LOG=/root/spokum-sessii.log
KEEP=/opt/spokum/compose-do-sessiy.yml.bak

green() { printf '\033[32m%s\033[0m\n' "$1"; }
warn()  { printf '\033[33m%s\033[0m\n' "$1"; }
step()  { printf '\n\033[1m%s\033[0m\n' "$1"; }
die()   { printf '\033[31m%s\033[0m\n' "$1"; exit 1; }

[ "$(id -u)" = "0" ] || die "Запускать нужно от root"
[ -f "$STACK/.env" ] || die "База не установлена: нет $STACK/.env"
[ -f "$STACK/compose.spokum.yml" ] || die "Не найден $STACK/compose.spokum.yml"
docker ps --format '{{.Names}}' | grep -q '^supabase-auth$' || die "Служба входа не запущена"

printf '\n\033[1m=== СпокУм · вход, который не вылетает ===\033[0m\n'

step "1 из 6. Что стоит сейчас"
IMAGE=$(docker inspect --format '{{.Config.Image}}' supabase-auth 2>/dev/null)
echo "  служба входа: ${IMAGE:-неизвестно}"
echo "  настройки:"
docker exec supabase-auth env 2>/dev/null | grep -E 'GOTRUE_SECURITY_REFRESH_TOKEN|GOTRUE_RATE_LIMIT_TOKEN_REFRESH|GOTRUE_JWT_EXP' \
  | sort | sed 's/^/    /' || true
echo "  жалобы на повторный вход за последнее время:"
docker logs supabase-auth 2>&1 | grep -ci 'already used\|refresh_token_already_used' | sed 's/^/    строк: /'

step "2 из 6. Копируем прежние настройки"
cp "$STACK/compose.spokum.yml" "$KEEP"
green "копия: $KEEP"

step "3 из 6. Прописываем настройки"
python3 - "$STACK/compose.spokum.yml" <<'PY'
import sys

path = sys.argv[1]
text = open(path, encoding='utf-8').read()

if 'GOTRUE_SECURITY_REFRESH_TOKEN_ROTATION_ENABLED' in text:
    print('  настройки уже прописаны, ничего не меняем')
    sys.exit(0)

block = """  auth:
    environment:
      # Смена сети, VPN и обрыв связи не должны отзывать вход.
      # Если выключить вращение, один и тот же ключ входа работает и в
      # приложении, и в вебе, и в фоне, поэтому «повторное использование»
      # больше не считается взломом и сессия не сгорает.
      GOTRUE_SECURITY_REFRESH_TOKEN_ROTATION_ENABLED: "false"
      GOTRUE_SECURITY_REFRESH_TOKEN_ALLOW_REUSE: "true"
      GOTRUE_SECURITY_REFRESH_TOKEN_REUSE_INTERVAL: "3600"
      # Много людей за одним адресом (мобильный оператор, VPN) — поднимаем потолок.
      GOTRUE_RATE_LIMIT_TOKEN_REFRESH: "900"

"""

lines = text.splitlines()
out = []
done = False
for line in lines:
    if not done and line.startswith('volumes:'):
        out.extend(block.rstrip('\n').splitlines())
        done = True
    out.append(line)

if not done:
    print('  ВНИМАНИЕ: в файле нет раздела volumes, настройки не дописаны')
    sys.exit(2)

open(path, 'w', encoding='utf-8').write('\n'.join(out) + '\n')
print('  настройки дописаны')
PY
STATUS=$?
if [ "$STATUS" = "2" ]; then
  cp "$KEEP" "$STACK/compose.spokum.yml"
  die "Настройки не дописались, вернули прежний файл"
fi
[ "$STATUS" = "0" ] || die "Не получилось изменить compose.spokum.yml"

cd "$STACK" || die "Нет папки $STACK"
if ! docker compose config >/dev/null 2>&1; then
  cp "$KEEP" compose.spokum.yml
  docker compose config 2>&1 | tail -5 | sed 's/^/  /'
  die "Сборка настроек не сошлась, вернули прежний файл"
fi
green "файл настроек в порядке"

step "4 из 6. Перезапускаем службу входа"
docker compose up -d --force-recreate auth 2>&1 | tail -5
sleep 8

step "5 из 6. Проверяем, что вход жив"
ANON=$(grep '^ANON_KEY=' "$STACK/.env" | cut -d= -f2-)
HOST=$(grep '^SPOKUM_HOST=' "$STACK/.env" | cut -d= -f2-)
HEALTH=$(curl -s -o /dev/null -w '%{http_code}' --max-time 15 "https://$HOST/auth/v1/health" 2>/dev/null)
REST=$(curl -s -o /dev/null -w '%{http_code}' --max-time 15 \
  -H "apikey: $ANON" -H "Authorization: Bearer $ANON" \
  "https://$HOST/rest/v1/profiles?select=id&limit=1" 2>/dev/null)
echo "  вход:  ${HEALTH:-нет ответа}"
echo "  база:  ${REST:-нет ответа}"
case "$HEALTH$REST" in
  *000*|"") warn "снаружи пока тишина, проверьте ещё раз через минуту" ;;
  *) green "оба адреса отвечают" ;;
esac

echo "  настройки в работе:"
docker exec supabase-auth env 2>/dev/null | grep -E 'GOTRUE_SECURITY_REFRESH_TOKEN|GOTRUE_RATE_LIMIT_TOKEN_REFRESH' \
  | sort | sed 's/^/    /' || true

step "6 из 6. Итог"
docker compose ps --format 'table {{.Service}}\t{{.Status}}' 2>/dev/null | sed 's/^/  /'

printf '\n'
green "Готово. Вход больше не сгорает от повторного запроса."
echo
echo "Откатить настройки, если что-то пойдёт не так:"
echo "  cp $KEEP $STACK/compose.spokum.yml"
echo "  cd $STACK && docker compose up -d --force-recreate auth"
echo
{
  echo "СпокУм · настройки входа, $(date)"
  echo "файл: $STACK/compose.spokum.yml"
  echo "копия прежнего: $KEEP"
  echo "проверка: docker logs supabase-auth | grep -c 'already used'"
} > "$LOG"
echo "Записано в $LOG"
