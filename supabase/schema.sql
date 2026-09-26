create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users on delete cascade,
  username text not null unique,
  display_name text not null default '',
  bio text not null default '',
  hue integer not null default 220,
  avatar text,
  mood text not null default 'calm',
  theme text not null default 'calm',
  accent text not null default 'mint',
  is_admin boolean not null default false,
  is_moderator boolean not null default false,
  is_developer boolean not null default false,
  is_verified boolean not null default false,
  banned_until timestamptz,
  muted_until timestamptz,
  ban_reason text not null default '',
  created_at timestamptz not null default now(),
  last_seen timestamptz not null default now(),
  constraint username_format check (username ~ '^[a-z0-9_]{3,20}$')
);

create table if not exists public.posts (
  id bigint generated always as identity primary key,
  author_id uuid not null references public.profiles on delete cascade,
  body text not null default '',
  image text,
  mood text not null default 'calm',
  created_at timestamptz not null default now(),
  removed boolean not null default false,
  removed_by uuid references public.profiles on delete set null,
  removed_reason text not null default '',
  removed_at timestamptz
);
create index if not exists posts_created_idx on public.posts (created_at desc);
create index if not exists posts_author_idx on public.posts (author_id);

create table if not exists public.likes (
  post_id bigint not null references public.posts on delete cascade,
  user_id uuid not null references public.profiles on delete cascade,
  created_at timestamptz not null default now(),
  primary key (post_id, user_id)
);

create table if not exists public.comments (
  id bigint generated always as identity primary key,
  post_id bigint not null references public.posts on delete cascade,
  author_id uuid not null references public.profiles on delete cascade,
  body text not null,
  created_at timestamptz not null default now()
);
create index if not exists comments_post_idx on public.comments (post_id);

create table if not exists public.contacts (
  user_id uuid not null references public.profiles on delete cascade,
  contact_id uuid not null references public.profiles on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, contact_id)
);

create table if not exists public.chats (
  id bigint generated always as identity primary key,
  kind text not null default 'dm',
  title text not null default '',
  hue integer not null default 220,
  owner_id uuid references public.profiles on delete set null,
  created_at timestamptz not null default now(),
  constraint chat_kind check (kind in ('dm', 'group', 'channel'))
);

create table if not exists public.chat_members (
  chat_id bigint not null references public.chats on delete cascade,
  user_id uuid not null references public.profiles on delete cascade,
  role text not null default 'member',
  read_at timestamptz not null default to_timestamp(0),
  primary key (chat_id, user_id)
);
create index if not exists chat_members_user_idx on public.chat_members (user_id);

create table if not exists public.messages (
  id bigint generated always as identity primary key,
  chat_id bigint not null references public.chats on delete cascade,
  author_id uuid references public.profiles on delete set null,
  kind text not null default 'text',
  body text not null default '',
  media text,
  duration integer not null default 0,
  created_at timestamptz not null default now(),
  removed boolean not null default false
);
create index if not exists messages_chat_idx on public.messages (chat_id, id desc);

create table if not exists public.reports (
  id bigint generated always as identity primary key,
  reporter_id uuid not null references public.profiles on delete cascade,
  target_kind text not null,
  target_id text not null,
  target_user uuid references public.profiles on delete cascade,
  reason text not null,
  image text,
  status text not null default 'open',
  created_at timestamptz not null default now(),
  handled_by uuid references public.profiles on delete set null,
  handled_at timestamptz
);

create table if not exists public.punishments (
  id bigint generated always as identity primary key,
  actor_id uuid references public.profiles on delete set null,
  user_id uuid not null references public.profiles on delete cascade,
  kind text not null,
  minutes integer not null default 0,
  reason text not null default '',
  post_id bigint references public.posts on delete set null,
  created_at timestamptz not null default now(),
  reverted boolean not null default false,
  reverted_by uuid references public.profiles on delete set null
);

create table if not exists public.mod_strikes (
  id bigint generated always as identity primary key,
  moderator_id uuid not null references public.profiles on delete cascade,
  admin_id uuid references public.profiles on delete set null,
  reason text not null default '',
  created_at timestamptz not null default now()
);

create table if not exists public.audit (
  id bigint generated always as identity primary key,
  actor_id uuid references public.profiles on delete set null,
  action text not null,
  meta jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.journal (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles on delete cascade,
  day date not null,
  body text not null default '',
  mood text,
  word text,
  created_at timestamptz not null default now(),
  unique (user_id, day)
);
create index if not exists journal_user_idx on public.journal (user_id, day desc);

create table if not exists public.stories (
  id bigint generated always as identity primary key,
  author_id uuid not null references public.profiles on delete cascade,
  kind text not null default 'video',
  media text not null,
  storage_path text,
  caption text not null default '',
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '24 hours'
);
create index if not exists stories_author_idx on public.stories (author_id, expires_at desc);

create table if not exists public.stickers (
  id bigint generated always as identity primary key,
  owner_id uuid not null references public.profiles on delete cascade,
  image text not null,
  created_at timestamptz not null default now()
);
create index if not exists stickers_owner_idx on public.stickers (owner_id);

create table if not exists public.game_scores (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles on delete cascade,
  game text not null,
  score integer not null,
  created_at timestamptz not null default now()
);
create index if not exists game_scores_idx on public.game_scores (game, score desc);

alter table public.profiles add column if not exists premium_until timestamptz;
alter table public.profiles add column if not exists pins jsonb not null default '[]'::jsonb;
alter table public.profiles add column if not exists status_icon text;
alter table public.profiles add column if not exists banner text;
alter table public.profiles add column if not exists day_word text;
alter table public.profiles add column if not exists day_word_at timestamptz;
alter table public.profiles add column if not exists share_word boolean not null default false;
alter table public.profiles add column if not exists premium_reason text not null default '';
alter table public.profiles add column if not exists premium_granted_at timestamptz;

create or replace function public.viewer_is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select is_admin from public.profiles where id = auth.uid()), false);
$$;

create or replace function public.viewer_is_moderator()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select is_moderator or is_admin from public.profiles where id = auth.uid()), false);
$$;

create or replace function public.viewer_can_write()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((
    select (banned_until is null or banned_until < now())
       and (muted_until is null or muted_until < now())
    from public.profiles where id = auth.uid()
  ), false);
$$;

create or replace function public.viewer_is_premium()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select premium_until > now() from public.profiles where id = auth.uid()), false);
$$;

create or replace function public.is_chat_member(target_chat bigint)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.chat_members where chat_id = target_chat and user_id = auth.uid());
$$;

create or replace function public.chat_role(target_chat bigint)
returns text language sql stable security definer set search_path = public as $$
  select role from public.chat_members where chat_id = target_chat and user_id = auth.uid();
$$;

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  wanted text;
  founder boolean;
begin
  wanted := lower(coalesce(new.raw_user_meta_data->>'username', split_part(new.email, '@', 1)));
  founder := wanted = 'vanya8';
  insert into public.profiles (id, username, display_name, hue, is_admin, is_developer, is_verified)
  values (
    new.id,
    wanted,
    coalesce(nullif(new.raw_user_meta_data->>'display_name', ''), wanted),
    200 + (length(wanted) * 37) % 140,
    founder,
    founder,
    founder
  );
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

create or replace function public.protect_profile()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if coalesce(current_setting('spokum.privileged', true), '') = 'on' then
    return new;
  end if;
  if not public.viewer_is_premium() then
    new.pins := old.pins;
    new.status_icon := old.status_icon;
  end if;
  new.username := old.username;
  new.is_admin := old.is_admin;
  new.is_moderator := old.is_moderator;
  new.is_developer := old.is_developer;
  new.is_verified := old.is_verified;
  new.banned_until := old.banned_until;
  new.muted_until := old.muted_until;
  new.ban_reason := old.ban_reason;
  new.created_at := old.created_at;
  new.premium_until := old.premium_until;
  new.premium_reason := old.premium_reason;
  new.premium_granted_at := old.premium_granted_at;
  return new;
end;
$$;

drop trigger if exists profiles_protect on public.profiles;
create trigger profiles_protect
  before update on public.profiles
  for each row execute function public.protect_profile();

alter table public.profiles enable row level security;
alter table public.posts enable row level security;
alter table public.likes enable row level security;
alter table public.comments enable row level security;
alter table public.contacts enable row level security;
alter table public.chats enable row level security;
alter table public.chat_members enable row level security;
alter table public.messages enable row level security;
alter table public.reports enable row level security;
alter table public.punishments enable row level security;
alter table public.mod_strikes enable row level security;
alter table public.audit enable row level security;
alter table public.journal enable row level security;
alter table public.stories enable row level security;
alter table public.stickers enable row level security;
alter table public.game_scores enable row level security;

drop policy if exists profiles_read on public.profiles;
create policy profiles_read on public.profiles for select using (true);

drop policy if exists profiles_update_own on public.profiles;
create policy profiles_update_own on public.profiles for update
  using (id = auth.uid() or public.viewer_is_admin())
  with check (id = auth.uid() or public.viewer_is_admin());

drop policy if exists posts_read on public.posts;
create policy posts_read on public.posts for select
  using (removed = false or author_id = auth.uid() or public.viewer_is_moderator());

drop policy if exists posts_insert on public.posts;
create policy posts_insert on public.posts for insert
  with check (author_id = auth.uid() and public.viewer_can_write());

drop policy if exists posts_delete on public.posts;
create policy posts_delete on public.posts for delete
  using (author_id = auth.uid() or public.viewer_is_admin());

drop policy if exists likes_read on public.likes;
create policy likes_read on public.likes for select using (true);

drop policy if exists likes_write on public.likes;
create policy likes_write on public.likes for insert
  with check (user_id = auth.uid() and public.viewer_can_write());

drop policy if exists likes_remove on public.likes;
create policy likes_remove on public.likes for delete using (user_id = auth.uid());

drop policy if exists comments_read on public.comments;
create policy comments_read on public.comments for select using (true);

drop policy if exists comments_insert on public.comments;
create policy comments_insert on public.comments for insert
  with check (author_id = auth.uid() and public.viewer_can_write());

drop policy if exists comments_delete on public.comments;
create policy comments_delete on public.comments for delete
  using (author_id = auth.uid() or public.viewer_is_moderator());

drop policy if exists contacts_own on public.contacts;
create policy contacts_own on public.contacts for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists chats_read on public.chats;
create policy chats_read on public.chats for select
  using (owner_id = auth.uid() or public.is_chat_member(id));

drop policy if exists chats_insert on public.chats;
create policy chats_insert on public.chats for insert
  with check (owner_id = auth.uid() and public.viewer_can_write());

drop policy if exists chat_members_read on public.chat_members;
create policy chat_members_read on public.chat_members for select using (public.is_chat_member(chat_id));

drop policy if exists chat_members_insert on public.chat_members;
create policy chat_members_insert on public.chat_members for insert
  with check (user_id = auth.uid() or public.chat_role(chat_id) = 'owner');

drop policy if exists chat_members_update on public.chat_members;
create policy chat_members_update on public.chat_members for update
  using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists messages_read on public.messages;
create policy messages_read on public.messages for select
  using (removed = false and public.is_chat_member(chat_id));

drop policy if exists messages_insert on public.messages;
create policy messages_insert on public.messages for insert
  with check (
    author_id = auth.uid()
    and public.viewer_can_write()
    and public.is_chat_member(chat_id)
    and (
      (select kind from public.chats where id = chat_id) <> 'channel'
      or public.chat_role(chat_id) = 'owner'
    )
  );

drop policy if exists reports_insert on public.reports;
create policy reports_insert on public.reports for insert
  with check (reporter_id = auth.uid());

drop policy if exists reports_read on public.reports;
create policy reports_read on public.reports for select
  using (reporter_id = auth.uid() or public.viewer_is_moderator());

drop policy if exists punishments_read on public.punishments;
create policy punishments_read on public.punishments for select
  using (user_id = auth.uid() or public.viewer_is_moderator());

drop policy if exists strikes_read on public.mod_strikes;
create policy strikes_read on public.mod_strikes for select
  using (moderator_id = auth.uid() or public.viewer_is_admin());

drop policy if exists audit_read on public.audit;
create policy audit_read on public.audit for select using (public.viewer_is_admin());

drop policy if exists journal_own on public.journal;
create policy journal_own on public.journal for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists stories_read on public.stories;
create policy stories_read on public.stories for select using (expires_at > now());

drop policy if exists stories_insert on public.stories;
create policy stories_insert on public.stories for insert
  with check (author_id = auth.uid() and public.viewer_is_premium() and public.viewer_can_write());

drop policy if exists stories_delete on public.stories;
create policy stories_delete on public.stories for delete
  using (author_id = auth.uid() or public.viewer_is_moderator());

drop policy if exists stickers_read on public.stickers;
create policy stickers_read on public.stickers for select using (owner_id = auth.uid());

drop policy if exists stickers_insert on public.stickers;
create policy stickers_insert on public.stickers for insert
  with check (owner_id = auth.uid() and public.viewer_is_premium());

drop policy if exists stickers_delete on public.stickers;
create policy stickers_delete on public.stickers for delete using (owner_id = auth.uid());

drop policy if exists scores_read on public.game_scores;
create policy scores_read on public.game_scores for select using (true);

drop policy if exists scores_insert on public.game_scores;
create policy scores_insert on public.game_scores for insert
  with check (user_id = auth.uid());

create or replace function public.log_action(action text, meta jsonb)
returns void language sql security definer set search_path = public as $$
  insert into public.audit (actor_id, action, meta) values (auth.uid(), action, meta);
$$;

create or replace function public.open_dm(peer uuid)
returns bigint language plpgsql security definer set search_path = public as $$
declare
  existing bigint;
  fresh bigint;
begin
  if auth.uid() is null then raise exception 'Нужен вход'; end if;
  if peer = auth.uid() then raise exception 'Нельзя открыть диалог с собой'; end if;

  select c.id into existing
  from public.chats c
  join public.chat_members a on a.chat_id = c.id and a.user_id = auth.uid()
  join public.chat_members b on b.chat_id = c.id and b.user_id = peer
  where c.kind = 'dm'
  limit 1;

  if existing is not null then return existing; end if;

  insert into public.chats (kind, owner_id, hue)
  values ('dm', auth.uid(), (select hue from public.profiles where id = peer))
  returning id into fresh;

  insert into public.chat_members (chat_id, user_id, role) values (fresh, auth.uid(), 'owner');
  insert into public.chat_members (chat_id, user_id, role) values (fresh, peer, 'member');
  return fresh;
end;
$$;

create or replace function public.mod_remove_post(target bigint, reason text)
returns void language plpgsql security definer set search_path = public as $$
declare
  author uuid;
begin
  if not public.viewer_is_moderator() then raise exception 'Только для модераторов'; end if;
  if coalesce(trim(reason), '') = '' then raise exception 'Нужна причина'; end if;

  select author_id into author from public.posts where id = target;
  if author is null then raise exception 'Пост не найден'; end if;

  update public.posts
     set removed = true, removed_by = auth.uid(), removed_reason = reason, removed_at = now()
   where id = target;

  insert into public.punishments (actor_id, user_id, kind, reason, post_id)
  values (auth.uid(), author, 'post_removed', reason, target);

  perform public.log_action('post.remove', jsonb_build_object('post', target, 'reason', reason));
end;
$$;

create or replace function public.mod_punish(target uuid, kind text, minutes integer, reason text)
returns void language plpgsql security definer set search_path = public as $$
declare
  until timestamptz;
begin
  if not public.viewer_is_moderator() then raise exception 'Только для модераторов'; end if;
  if kind not in ('warn', 'mute', 'ban') then raise exception 'Неизвестное наказание'; end if;
  if coalesce(trim(reason), '') = '' then raise exception 'Нужна причина'; end if;
  if (select is_admin from public.profiles where id = target) then raise exception 'Нельзя наказать админа'; end if;

  perform set_config('spokum.privileged', 'on', true);
  until := now() + make_interval(mins => greatest(0, coalesce(minutes, 0)));

  if kind = 'mute' then
    update public.profiles set muted_until = until where id = target;
  elsif kind = 'ban' then
    update public.profiles set banned_until = until, ban_reason = reason where id = target;
  end if;

  insert into public.punishments (actor_id, user_id, kind, minutes, reason)
  values (auth.uid(), target, kind, coalesce(minutes, 0), reason);

  perform public.log_action('mod.punish', jsonb_build_object('user', target, 'kind', kind, 'minutes', minutes));
end;
$$;

create or replace function public.mod_close_report(target bigint, new_status text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.viewer_is_moderator() then raise exception 'Только для модераторов'; end if;
  if new_status not in ('closed', 'rejected') then raise exception 'Неизвестный статус'; end if;
  update public.reports
     set status = new_status, handled_by = auth.uid(), handled_at = now()
   where id = target;
end;
$$;

create or replace function public.admin_set_flags(target uuid, flags jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare
  founder boolean;
begin
  if not public.viewer_is_admin() then raise exception 'Только для админов'; end if;
  founder := (select username = 'vanya8' from public.profiles where id = target);
  perform set_config('spokum.privileged', 'on', true);

  if coalesce((flags->>'clearAll')::boolean, false) then
    update public.profiles
       set is_moderator = false,
           is_developer = false,
           is_verified = false,
           is_admin = case when founder then true else false end
     where id = target;
  else
    update public.profiles
       set is_admin = case
             when founder then true
             when flags ? 'isAdmin' then (flags->>'isAdmin')::boolean
             else is_admin end,
           is_moderator = coalesce((flags->>'isModerator')::boolean, is_moderator),
           is_developer = coalesce((flags->>'isDeveloper')::boolean, is_developer),
           is_verified = coalesce((flags->>'isVerified')::boolean, is_verified)
     where id = target;
  end if;

  if coalesce((flags->>'isModerator')::boolean, false) then
    delete from public.mod_strikes where moderator_id = target;
  end if;

  perform public.log_action('admin.flags', jsonb_build_object('user', target, 'flags', flags));
end;
$$;

create or replace function public.admin_set_state(target uuid, action text, minutes integer, reason text)
returns void language plpgsql security definer set search_path = public as $$
declare
  until timestamptz;
begin
  if not public.viewer_is_admin() then raise exception 'Только для админов'; end if;
  if (select username = 'vanya8' from public.profiles where id = target) then
    raise exception 'Нельзя ограничить основателя';
  end if;

  perform set_config('spokum.privileged', 'on', true);
  until := now() + make_interval(mins => greatest(0, coalesce(minutes, 0)));

  if action = 'ban' then
    update public.profiles set banned_until = until, ban_reason = coalesce(reason, '') where id = target;
  elsif action = 'unban' then
    update public.profiles set banned_until = null, ban_reason = '' where id = target;
  elsif action = 'mute' then
    update public.profiles set muted_until = until where id = target;
  elsif action = 'unmute' then
    update public.profiles set muted_until = null where id = target;
  else
    raise exception 'Неизвестное действие';
  end if;

  insert into public.punishments (actor_id, user_id, kind, minutes, reason)
  values (auth.uid(), target, action, coalesce(minutes, 0), coalesce(reason, ''));

  perform public.log_action('admin.state', jsonb_build_object('user', target, 'action', action));
end;
$$;

create or replace function public.admin_revert(target bigint, strike boolean, reason text)
returns integer language plpgsql security definer set search_path = public as $$
declare
  entry public.punishments;
  strikes integer;
begin
  if not public.viewer_is_admin() then raise exception 'Только для админов'; end if;

  perform set_config('spokum.privileged', 'on', true);
  select * into entry from public.punishments where id = target;
  if entry.id is null then raise exception 'Действие не найдено'; end if;
  if entry.reverted then raise exception 'Уже отменено'; end if;

  if entry.kind = 'post_removed' and entry.post_id is not null then
    update public.posts set removed = false, removed_by = null, removed_reason = '', removed_at = null
     where id = entry.post_id;
  elsif entry.kind = 'mute' then
    update public.profiles set muted_until = null where id = entry.user_id;
  elsif entry.kind = 'ban' then
    update public.profiles set banned_until = null, ban_reason = '' where id = entry.user_id;
  end if;

  update public.punishments set reverted = true, reverted_by = auth.uid() where id = target;

  strikes := null;
  if coalesce(strike, false) and entry.actor_id is not null then
    insert into public.mod_strikes (moderator_id, admin_id, reason)
    values (entry.actor_id, auth.uid(), coalesce(reason, 'Необоснованное действие'));

    select count(*) into strikes from public.mod_strikes where moderator_id = entry.actor_id;

    if strikes >= 3 then
      update public.profiles set is_moderator = false where id = entry.actor_id;
    end if;
  end if;

  perform public.log_action('admin.revert', jsonb_build_object('action', target, 'strikes', strikes));
  return strikes;
end;
$$;

create or replace function public.admin_stats()
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  result jsonb;
begin
  if not public.viewer_is_admin() then raise exception 'Только для админов'; end if;

  select jsonb_build_object(
    'users', (select count(*) from public.profiles),
    'online', (select count(*) from public.profiles where last_seen > now() - interval '5 minutes'),
    'newToday', (select count(*) from public.profiles where created_at > now() - interval '1 day'),
    'posts', (select count(*) from public.posts where removed = false),
    'postsWeek', (select count(*) from public.posts where created_at > now() - interval '7 days'),
    'messages', (select count(*) from public.messages),
    'chats', (select count(*) from public.chats),
    'reportsOpen', (select count(*) from public.reports where status = 'open'),
    'banned', (select count(*) from public.profiles where banned_until > now()),
    'moderators', (select count(*) from public.profiles where is_moderator),
    'moods', coalesce((
      select jsonb_agg(to_jsonb(counts)) from (
        select mood, count(*) as n from public.posts where removed = false group by mood order by n desc
      ) counts
    ), '[]'::jsonb),
    'daily', coalesce((
      select jsonb_agg(to_jsonb(series) order by series.day)
      from (
        select
          to_char(day, 'DD.MM') as day,
          (select count(*) from public.posts p where p.created_at >= day and p.created_at < day + interval '1 day') as posts,
          (select count(*) from public.profiles u where u.created_at >= day and u.created_at < day + interval '1 day') as users,
          (select count(*) from public.messages m where m.created_at >= day and m.created_at < day + interval '1 day') as messages
        from generate_series(date_trunc('day', now()) - interval '6 days', date_trunc('day', now()), interval '1 day') as day
      ) series
    ), '[]'::jsonb)
  ) into result;

  return result;
end;
$$;

create or replace function public.admin_users(search text)
returns setof jsonb language plpgsql security definer set search_path = public as $$
begin
  if not public.viewer_is_admin() then raise exception 'Только для админов'; end if;

  return query
    select to_jsonb(p) || jsonb_build_object(
      'strikes', (select count(*) from public.mod_strikes s where s.moderator_id = p.id),
      'post_count', (select count(*) from public.posts o where o.author_id = p.id and o.removed = false),
      'like_count', (select count(*) from public.likes l join public.posts o on o.id = l.post_id where o.author_id = p.id)
    )
    from public.profiles p
    where coalesce(search, '') = ''
       or p.username ilike '%' || search || '%'
       or p.display_name ilike '%' || search || '%'
    order by p.created_at desc
    limit 200;
end;
$$;

create or replace function public.admin_grant_premium(target uuid, days integer, reason text)
returns timestamptz language plpgsql security definer set search_path = public as $$
declare
  base timestamptz;
  result timestamptz;
begin
  if not public.viewer_is_admin() then raise exception 'Только для админов'; end if;
  if days is null or days < 1 or days > 365 then raise exception 'Срок от 1 до 365 дней'; end if;

  perform set_config('spokum.privileged', 'on', true);

  select greatest(coalesce(premium_until, now()), now()) into base
    from public.profiles where id = target;
  if base is null then raise exception 'Пользователь не найден'; end if;

  result := base + make_interval(days => days);

  update public.profiles
     set premium_until = result,
         premium_reason = coalesce(nullif(trim(reason), ''), 'Без причины'),
         premium_granted_at = now()
   where id = target;

  perform public.log_action('admin.premium.grant',
    jsonb_build_object('user', target, 'days', days, 'reason', reason, 'until', result));

  return result;
end;
$$;

create or replace function public.admin_revoke_premium(target uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.viewer_is_admin() then raise exception 'Только для админов'; end if;

  perform set_config('spokum.privileged', 'on', true);

  update public.profiles
     set premium_until = null, premium_reason = '', premium_granted_at = null
   where id = target;

  perform public.log_action('admin.premium.revoke', jsonb_build_object('user', target));
end;
$$;

create or replace function public.purge_expired_stories()
returns void language sql security definer set search_path = public as $$
  delete from public.stories where expires_at < now();
$$;

create or replace function public.touch_presence()
returns void language sql security definer set search_path = public as $$
  update public.profiles set last_seen = now() where id = auth.uid();
$$;

grant execute on function public.open_dm(uuid) to authenticated;
grant execute on function public.mod_remove_post(bigint, text) to authenticated;
grant execute on function public.mod_punish(uuid, text, integer, text) to authenticated;
grant execute on function public.mod_close_report(bigint, text) to authenticated;
grant execute on function public.admin_set_flags(uuid, jsonb) to authenticated;
grant execute on function public.admin_set_state(uuid, text, integer, text) to authenticated;
grant execute on function public.admin_revert(bigint, boolean, text) to authenticated;
grant execute on function public.admin_stats() to authenticated;
grant execute on function public.admin_users(text) to authenticated;
grant execute on function public.viewer_is_premium() to authenticated, anon;
grant execute on function public.purge_expired_stories() to authenticated;
grant execute on function public.admin_grant_premium(uuid, integer, text) to authenticated;
grant execute on function public.admin_revoke_premium(uuid) to authenticated;
grant execute on function public.touch_presence() to authenticated;

do $$
begin
  alter publication supabase_realtime add table public.messages;
exception when duplicate_object then null;
end $$;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'stories',
  'stories',
  true,
  26214400,
  array['video/mp4', 'video/webm', 'video/quicktime', 'image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
  set public = true,
      file_size_limit = 26214400,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "stories bucket read" on storage.objects;
create policy "stories bucket read" on storage.objects for select
  using (bucket_id = 'stories');

drop policy if exists "stories bucket insert" on storage.objects;
create policy "stories bucket insert" on storage.objects for insert to authenticated
  with check (bucket_id = 'stories' and public.viewer_is_premium());

drop policy if exists "stories bucket delete" on storage.objects;
create policy "stories bucket delete" on storage.objects for delete to authenticated
  using (bucket_id = 'stories' and owner = auth.uid());
