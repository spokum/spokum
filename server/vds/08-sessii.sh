#!/usr/bin/env bash
# СпокУм · вход больше не вылетает
#
# Что делает: настраивает службу входа (auth) так, чтобы сессия не отзывалась
# из-за обрыва связи, смены сети, VPN или повторного запроса ключа. Запускать
# один раз, можно и повторно — настройки просто обновятся.
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
docker ps --format '{{.Names}}' | grep -q '^supabase-auth$' \
  || die "Служба входа не запущена. Запустите: cd $STACK && docker compose up -d"

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
import re
import sys

path = sys.argv[1]
text = open(path, encoding='utf-8').read()

VALUES = [
    ('GOTRUE_SECURITY_REFRESH_TOKEN_ROTATION_ENABLED', '"false"'),
    ('GOTRUE_SECURITY_REFRESH_TOKEN_ALLOW_REUSE', '"true"'),
    ('GOTRUE_SECURITY_REFRESH_TOKEN_REUSE_INTERVAL', '"31536000"'),
    ('GOTRUE_RATE_LIMIT_TOKEN_REFRESH', '"900"'),
]

WHY = [
    "# Смена сети, VPN и обрыв связи не должны отзывать вход.",
    "# Ключ входа обновляют сразу два места: приложение и фоновая служба",
    "# уведомлений. Сервер считал это «повторным использованием» и отзывал",
    "# сессию — человека выбрасывало из аккаунта. Эти настройки запрещают",
    "# отзыв: ключ живёт, пока человек сам не нажмёт «Выйти».",
    "# Много людей за одним адресом (мобильный оператор, VPN) — потолок выше.",
]


def line_for(indent, key, value):
    return ' ' * indent + key + ': ' + value


# 1. Обновляем значения, которые уже прописаны (в том числе старые).
for key, value in VALUES:
    pattern = re.compile(r'^([ \t]*)' + key + r':.*$', re.M)
    text = pattern.sub(lambda m: m.group(1) + key + ': ' + value, text)

missing = [(key, value) for key, value in VALUES
           if not re.search(r'^[ \t]*' + re.escape(key) + r':', text, re.M)]

if missing:
    lines = text.splitlines()
    service = None
    for i, row in enumerate(lines):
        if re.match(r'^[ \t]{0,4}auth:\s*$', row):
            j = i + 1
            while j < len(lines) and (lines[j].strip() == '' or lines[j].startswith(' ')):
                j += 1
            service = (i, j)
            break

    if service:
        start, end = service
        env = None
        for k in range(start + 1, end):
            if re.match(r'^[ \t]+environment:\s*$', lines[k]):
                env = k
                break
        if env is None:
            indent = len(lines[start]) - len(lines[start].lstrip()) + 4
            lines[start + 1:start + 1] = (
                [' ' * (indent - 2) + 'environment:']
                + [' ' * indent + row for row in WHY]
                + [line_for(indent, key, value) for key, value in missing]
            )
        else:
            outer = len(lines[env]) - len(lines[env].lstrip())
            indent = outer + 2
            k = env + 1
            while k < len(lines) and (lines[k].strip() == '' or (len(lines[k]) - len(lines[k].lstrip())) > outer):
                k += 1
            lines[k:k] = [' ' * indent + row for row in WHY] \
                + [line_for(indent, key, value) for key, value in missing]
    else:
        block = ['  auth:', '    environment:'] \
            + ['      ' + row for row in WHY] \
            + [line_for(6, key, value) for key, value in missing] + ['']
        tail = next((i for i, row in enumerate(lines) if row.startswith('volumes:')), None)
        if tail is None:
            lines.extend([''] + block)
        else:
            lines[tail:tail] = block

    text = '\n'.join(lines)

open(path, 'w', encoding='utf-8').write(text.rstrip('\n') + '\n')
print('  настройки записаны')

PY
STATUS=$?
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
sleep 10

step "5 из 6. Проверяем, что вход жив"
ANON=$(grep '^ANON_KEY=' "$STACK/.env" | cut -d= -f2-)
HOST=$(grep '^SPOKUM_HOST=' "$STACK/.env" | cut -d= -f2-)
HEALTH=$(curl -s -o /dev/null -w '%{http_code}' --max-time 15 "https://$HOST/auth/v1/health" 2>/dev/null)
REST=$(curl -s -o /dev/null -w '%{http_code}' --max-time 15 \
  -H "apikey: $ANON" -H "Authorization: Bearer $ANON" \
  "https://$HOST/rest/v1/profiles?select=id&limit=1" 2>/dev/null)
echo "  вход:  ${HEALTH:-нет ответа} (годится 200, 401 и 404 — значит служба жива)"
echo "  база:  ${REST:-нет ответа} (ждём 200)"
case "$REST" in
  200) green "база и вход отвечают" ;;
  *000*|"") warn "снаружи пока тишина, проверьте ещё раз через минуту" ;;
  *) warn "ответ кодом $REST — посмотрите docker compose ps и docker compose logs --tail=50 auth" ;;
esac

echo "  настройки в работе:"
APPLIED=$(docker exec supabase-auth env 2>/dev/null \
  | grep -E '^GOTRUE_SECURITY_REFRESH_TOKEN_(ROTATION_ENABLED|ALLOW_REUSE|REUSE_INTERVAL)=|^GOTRUE_RATE_LIMIT_TOKEN_REFRESH=' \
  | sort)
printf '%s\n' "$APPLIED" | sed 's/^/    /'

BAD=0
printf '%s\n' "$APPLIED" | grep -qx 'GOTRUE_SECURITY_REFRESH_TOKEN_ROTATION_ENABLED=false' || BAD=1
printf '%s\n' "$APPLIED" | grep -qx 'GOTRUE_SECURITY_REFRESH_TOKEN_ALLOW_REUSE=true' || BAD=1
if [ "$BAD" = "0" ]; then
  green "  всё на месте: вход больше не отзывается"
else
  warn "  служба входа не увидела настройки — значит запущена не та служба"
  warn "  выполните ещё раз: cd $STACK && docker compose up -d --force-recreate auth"
fi

step "6 из 6. Итог"
docker compose ps --format 'table {{.Service}}\t{{.Status}}' 2>/dev/null | sed 's/^/  /'

printf '\n'
if [ "$BAD" = "0" ]; then
  green "Готово. Вход больше не сгорает от повторного запроса ключа."
else
  warn "Настройки записаны, но служба их пока не подхватила. Повторите запуск скрипта."
fi
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
