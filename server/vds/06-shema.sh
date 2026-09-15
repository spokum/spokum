#!/usr/bin/env bash
set -uo pipefail

STACK=/opt/spokum/supabase
URL="${SPOKUM_SCHEMA:-https://raw.githubusercontent.com/spokum/spokum/main/supabase/schema.sql}"
FILE=/root/spokum-schema.sql

green() { printf '\033[32m%s\033[0m\n' "$1"; }
step()  { printf '\n\033[1m%s\033[0m\n' "$1"; }
die()   { printf '\033[31m%s\033[0m\n' "$1"; exit 1; }

[ "$(id -u)" = "0" ] || die "Запускать нужно от root"
[ -f "$STACK/.env" ] || die "База не установлена"
docker ps --format '{{.Names}}' | grep -q '^supabase-db$' || die "База не запущена"

PG_PASS=$(grep '^POSTGRES_PASSWORD=' "$STACK/.env" | cut -d= -f2-)
run() { docker exec -i -e PGPASSWORD="$PG_PASS" supabase-db psql -U postgres -d postgres "$@"; }

printf '\n\033[1m=== СпокУм · обновление схемы базы ===\033[0m\n'

step "1 из 3. Скачиваем свежую схему"
curl -fsSL "$URL" -o "$FILE" || die "Не скачалась"
wc -l < "$FILE" | xargs echo "  строк:"

step "2 из 3. Накатываем"
OUT=$(run < "$FILE" 2>&1)
BAD=$(printf '%s' "$OUT" | grep -iE '^ERROR' | sort | uniq -c | sort -rn | head -15)
if [ -n "$BAD" ]; then
  printf '\033[31mОшибки:\033[0m\n%s\n' "$BAD"
else
  green "без единой ошибки"
fi

step "3 из 3. Проверяем, что появилось"
run -tAc "
select 'таблиц: ' || count(*) from information_schema.tables where table_schema = 'public';
select 'функций: ' || count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public';
select 'словарь автофильтра: ' || count(*) from public.guard_words;
select 'заметки о людях: ' || case when to_regclass('public.people_notes') is null then 'нет' else 'есть' end;
select 'напоминания: ' || case when to_regclass('public.reminders') is null then 'нет' else 'есть' end;
select 'людей: ' || count(*) from public.profiles;
select 'записей: ' || count(*) from public.posts;
"

rm -f "$FILE"
printf '\n'
green "Готово. Новые функции включены."
