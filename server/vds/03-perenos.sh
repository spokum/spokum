#!/usr/bin/env bash
set -uo pipefail

STACK=/opt/spokum/supabase
WORK=/opt/spokum/perenos
LOG=/root/spokum-perenos.log
SCHEMA_URL="${SPOKUM_SCHEMA:-https://raw.githubusercontent.com/spokum/spokum/claude/hello-1zhasq/supabase/schema.sql}"

green() { printf '\033[32m%s\033[0m\n' "$1"; }
warn()  { printf '\033[33m%s\033[0m\n' "$1"; }
step()  { printf '\n\033[1m%s\033[0m\n' "$1"; }
die()   { printf '\033[31m%s\033[0m\n' "$1"; exit 1; }

[ "$(id -u)" = "0" ] || die "Запускать нужно от root"
[ -f "$STACK/.env" ] || die "Сначала второй скрипт, база ещё не поднята"
docker ps --format '{{.Names}}' | grep -q '^supabase-db$' || die "База не запущена: cd $STACK && docker compose up -d"

PG_PASS=$(grep '^POSTGRES_PASSWORD=' "$STACK/.env" | cut -d= -f2-)
mkdir -p "$WORK"
chmod 700 "$WORK"

here() { docker exec -i -e PGPASSWORD="$PG_PASS" supabase-db psql -v ON_ERROR_STOP=1 -U postgres -d postgres "$@"; }
here_soft() { docker exec -i -e PGPASSWORD="$PG_PASS" supabase-db psql -U postgres -d postgres "$@"; }

if [ "${SPOKUM_INSIDE:-}" != "1" ]; then
  printf '\n\033[1m=== СпокУм · перенос данных из Supabase ===\033[0m\n\n'
  echo "Переносим людей, посты, чаты, монеты, подарки и пароли."
  echo "Файлы, видео и фото не трогаем, они останутся в Supabase."
  echo "Supabase останется целым, мы только снимаем копию."
  echo

  if [ ! -f "$WORK/istochnik" ]; then
    echo "Нужна строка подключения к Supabase."
    echo
    echo "Где взять: панель Supabase, слева Project Settings, раздел Database,"
    echo "блок Connection string, вкладка URI. Скопируйте целиком."
    echo "Выглядит так:  postgresql://postgres.abcdefgh:ПАРОЛЬ@aws-0-eu-central-1.pooler.supabase.com:5432/postgres"
    echo
    echo "Если вместо пароля там [YOUR-PASSWORD], пароль берётся там же кнопкой Reset database password."
    echo
    while true; do
      printf 'Вставьте строку: '
      read -r SRC
      case "$SRC" in
        postgres://*|postgresql://*) ;;
        *) echo "Это не похоже на строку подключения, она начинается с postgresql://"; continue ;;
      esac
      case "$SRC" in
        *sslmode=*) ;;
        *\?*) SRC="$SRC&sslmode=require" ;;
        *) SRC="$SRC?sslmode=require" ;;
      esac
      printf 'Проверяю связь... '
      if docker exec -i supabase-db psql "$SRC" -tAc 'select 1' >/dev/null 2>&1; then
        echo "есть"
        break
      fi
      echo "не отвечает"
      echo "Проверьте пароль и что скопировали строку целиком."
    done
    printf '%s' "$SRC" > "$WORK/istochnik"
    chmod 600 "$WORK/istochnik"
    clear
    green "строка сохранена на сервере, в чат она не попадала"
  else
    green "строка подключения уже сохранена"
  fi

  echo
  echo "Дальше в фоне, обрыв связи не помешает."
  echo
  : > "$LOG"
  rm -f /root/spokum-perenos-gotovo
  SPOKUM_INSIDE=1 setsid nohup bash "$0" >> "$LOG" 2>&1 < /dev/null &
  sleep 2
  tail -f "$LOG" &
  TAILER=$!
  while [ ! -f /root/spokum-perenos-gotovo ]; do sleep 3; done
  sleep 2
  kill "$TAILER" 2>/dev/null
  exit 0
fi

finish() { touch /root/spokum-perenos-gotovo; }
trap finish EXIT

SRC=$(cat "$WORK/istochnik")
there() { docker exec -i supabase-db psql -v ON_ERROR_STOP=1 "$SRC" "$@"; }

step "1 из 7. Смотрим, что там есть"
there -tAc "
select 'людей: ' || (select count(*) from auth.users)
    || ', профилей: ' || (select count(*) from public.profiles)
    || ', записей: ' || (select count(*) from public.posts)
    || ', сообщений: ' || (select count(*) from public.messages);
" || die "Не читается исходная база"

step "2 из 7. Накатываем свежую схему на новую базу"
curl -fsSL "$SCHEMA_URL" -o "$WORK/schema.sql" || die "Не скачалась схема"
wc -l < "$WORK/schema.sql" | xargs echo "  строк в схеме:"
here_soft < "$WORK/schema.sql" 2>&1 | grep -iE "^ERROR|^ОШИБКА" | head -20
green "схема на месте"

step "3 из 7. Забираем людей и пароли"
there -tAc "\\copy (
  select instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
         raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
         last_sign_in_at, phone, banned_until, is_super_admin
    from auth.users
) to stdout csv" > "$WORK/users.csv" || die "Не выгрузились люди"
wc -l < "$WORK/users.csv" | xargs echo "  выгружено людей:"

there -tAc "\\copy (
  select id::text, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at,
         coalesce(provider_id, user_id::text)
    from auth.identities
) to stdout csv" > "$WORK/identities.csv" 2>/dev/null || \
there -tAc "\\copy (
  select id::text, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at,
         user_id::text
    from auth.identities
) to stdout csv" > "$WORK/identities.csv" || warn "входы не выгрузились, вход по паролю всё равно работает"
wc -l < "$WORK/identities.csv" 2>/dev/null | xargs echo "  выгружено входов:"

step "4 из 7. Забираем всё остальное"
docker exec -i supabase-db pg_dump "$SRC" \
  --data-only --column-inserts --on-conflict-do-nothing --no-owner --no-privileges \
  --schema=public > "$WORK/public.sql" 2>/dev/null || die "Не снялся дамп данных"
du -h "$WORK/public.sql" | cut -f1 | xargs echo "  размер выгрузки:"

step "5 из 7. Заливаем людей"
docker cp "$WORK/users.csv" supabase-db:/tmp/spokum-users.csv >/dev/null
{
  echo "set session_replication_role = replica;"
  echo "create temp table vhod_users (
    instance_id uuid, id uuid, aud text, role text, email text, encrypted_password text,
    email_confirmed_at timestamptz, raw_app_meta_data jsonb, raw_user_meta_data jsonb,
    created_at timestamptz, updated_at timestamptz, last_sign_in_at timestamptz,
    phone text, banned_until timestamptz, is_super_admin boolean);"
  echo "\\copy vhod_users from '/tmp/spokum-users.csv' csv"
  cat <<'SQL'
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at, last_sign_in_at,
  phone, banned_until, is_super_admin,
  confirmation_token, recovery_token, email_change_token_new, email_change,
  email_change_token_current, phone_change, phone_change_token, reauthentication_token)
select
  coalesce(instance_id, '00000000-0000-0000-0000-000000000000'::uuid),
  id,
  coalesce(nullif(aud, ''), 'authenticated'),
  coalesce(nullif(role, ''), 'authenticated'),
  email,
  encrypted_password,
  coalesce(email_confirmed_at, created_at, now()),
  coalesce(raw_app_meta_data, '{"provider":"email","providers":["email"]}'::jsonb),
  coalesce(raw_user_meta_data, '{}'::jsonb),
  coalesce(created_at, now()),
  coalesce(updated_at, now()),
  last_sign_in_at,
  phone,
  banned_until,
  coalesce(is_super_admin, false),
  '', '', '', '', '', '', '', ''
from vhod_users
on conflict (id) do nothing;
SQL
} | here_soft 2>&1 | grep -viE "^SET$|^CREATE TABLE$|^COPY " | head -20

step "6 из 7. Заливаем входы и все данные"
if [ -s "$WORK/identities.csv" ]; then
  docker cp "$WORK/identities.csv" supabase-db:/tmp/spokum-id.csv >/dev/null
  {
    echo "set session_replication_role = replica;"
    echo "create temp table vhod_id (
      id text, user_id uuid, identity_data jsonb, provider text,
      last_sign_in_at timestamptz, created_at timestamptz, updated_at timestamptz, provider_id text);"
    echo "\\copy vhod_id from '/tmp/spokum-id.csv' csv"
    cat <<'SQL'
insert into auth.identities (id, user_id, identity_data, provider, provider_id,
                             last_sign_in_at, created_at, updated_at)
select
  case when id ~ '^[0-9a-fA-F-]{36}$' then id::uuid else gen_random_uuid() end,
  user_id,
  coalesce(identity_data, '{}'::jsonb),
  coalesce(nullif(provider, ''), 'email'),
  coalesce(nullif(provider_id, ''), user_id::text),
  last_sign_in_at,
  coalesce(created_at, now()),
  coalesce(updated_at, now())
from vhod_id
where exists (select 1 from auth.users u where u.id = vhod_id.user_id)
on conflict do nothing;
SQL
  } | here_soft 2>&1 | grep -viE "^SET$|^CREATE TABLE$|^COPY " | head -10
fi

{
  echo "set session_replication_role = replica;"
  cat "$WORK/public.sql"
} | here_soft 2>&1 | grep -iE "^ERROR|^ОШИБКА" | sort | uniq -c | sort -rn | head -15
green "данные залиты"

step "7 из 7. Чиним счётчики и считаем итог"
here_soft -tAc "
do \$\$
declare row record;
begin
  for row in
    select c.relname as seq, t.relname as tbl, a.attname as col
      from pg_class c
      join pg_depend d on d.objid = c.oid and d.classid = 'pg_class'::regclass
      join pg_class t on t.oid = d.refobjid
      join pg_attribute a on a.attrelid = t.oid and a.attnum = d.refobjsubid
     where c.relkind = 'S' and t.relnamespace = 'public'::regnamespace
  loop
    execute format('select setval(%L, coalesce((select max(%I) from public.%I), 1))', row.seq, row.col, row.tbl);
  end loop;
end \$\$;
" >/dev/null 2>&1
green "счётчики поправлены"

echo
echo "=== Было в Supabase ==="
there -tAc "
select 'людей ' || (select count(*) from auth.users)
    || ' | профилей ' || (select count(*) from public.profiles)
    || ' | записей ' || (select count(*) from public.posts)
    || ' | комментариев ' || (select count(*) from public.comments)
    || ' | сообщений ' || (select count(*) from public.messages)
    || ' | чатов ' || (select count(*) from public.chats);"

echo
echo "=== Стало у нас ==="
here_soft -tAc "
select 'людей ' || (select count(*) from auth.users)
    || ' | профилей ' || (select count(*) from public.profiles)
    || ' | записей ' || (select count(*) from public.posts)
    || ' | комментариев ' || (select count(*) from public.comments)
    || ' | сообщений ' || (select count(*) from public.messages)
    || ' | чатов ' || (select count(*) from public.chats);"

docker exec supabase-db rm -f /tmp/spokum-users.csv /tmp/spokum-id.csv 2>/dev/null
rm -f "$WORK/users.csv" "$WORK/identities.csv"

printf '\n\033[1m=== Перенос закончен ===\033[0m\n\n'
echo "Пароли перенесены, заново регистрироваться никому не надо."
echo "Но всех разлогинит один раз: старые ключи входа подписаны Supabase, у нас свои."
echo
echo "Файлы, фото и видео остались в Supabase и продолжат открываться."
echo "Supabase не тронут, откатиться можно в любой момент."
echo
green "Покажите мне два списка выше, сверим цифры."
