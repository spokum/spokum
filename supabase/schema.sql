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
alter table public.profiles add column if not exists mod_rank smallint not null default 0;

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
  new.mod_rank := old.mod_rank;
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
    update public.profiles set mod_rank = 1 where id = target and mod_rank = 0;
  end if;

  if flags ? 'isModerator' and not coalesce((flags->>'isModerator')::boolean, false) then
    update public.profiles set mod_rank = 0 where id = target and not is_admin;
  end if;

  if coalesce((flags->>'clearAll')::boolean, false) and not founder then
    update public.profiles set mod_rank = 0 where id = target;
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

  perform public.notify_user(
    target, 'premium', 'Вам выдали СпокУм Премиум',
    'До ' || to_char(result, 'DD.MM.YYYY') || '. ' || coalesce(nullif(trim(reason), ''), 'Без причины'),
    jsonb_build_object('until', result)
  );

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

alter table public.posts add column if not exists kind text not null default 'text';
alter table public.posts add column if not exists media jsonb not null default '[]'::jsonb;
alter table public.posts add column if not exists video text;
alter table public.posts add column if not exists poster text;
alter table public.posts add column if not exists duration integer not null default 0;
alter table public.posts add column if not exists views integer not null default 0;
create index if not exists posts_kind_idx on public.posts (kind, created_at desc);

create table if not exists public.announcements (
  id bigint generated always as identity primary key,
  title text not null default '',
  body text not null default '',
  tone text not null default 'info',
  author_id uuid references public.profiles on delete set null,
  created_at timestamptz not null default now(),
  until timestamptz not null default now() + interval '7 days'
);
create index if not exists announcements_until_idx on public.announcements (until desc);

alter table public.announcements enable row level security;

drop policy if exists announcements_read on public.announcements;
create policy announcements_read on public.announcements for select using (true);

drop policy if exists announcements_write on public.announcements;
create policy announcements_write on public.announcements for insert
  with check (public.viewer_is_admin() and author_id = auth.uid());

drop policy if exists announcements_delete on public.announcements;
create policy announcements_delete on public.announcements for delete using (public.viewer_is_admin());

create table if not exists public.call_signals (
  id bigint generated always as identity primary key,
  chat_id bigint not null references public.chats on delete cascade,
  from_id uuid not null references public.profiles on delete cascade,
  to_id uuid not null references public.profiles on delete cascade,
  kind text not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists call_signals_to_idx on public.call_signals (to_id, created_at desc);

alter table public.call_signals enable row level security;

drop policy if exists call_signals_read on public.call_signals;
create policy call_signals_read on public.call_signals for select
  using (to_id = auth.uid() or from_id = auth.uid());

drop policy if exists call_signals_insert on public.call_signals;
create policy call_signals_insert on public.call_signals for insert
  with check (from_id = auth.uid() and public.is_chat_member(chat_id));

drop policy if exists call_signals_delete on public.call_signals;
create policy call_signals_delete on public.call_signals for delete
  using (to_id = auth.uid() or from_id = auth.uid());

create or replace function public.purge_call_signals()
returns void language sql security definer set search_path = public as $$
  delete from public.call_signals where created_at < now() - interval '2 minutes';
$$;

create or replace function public.bump_post_views(target bigint)
returns void language sql security definer set search_path = public as $$
  update public.posts set views = views + 1 where id = target;
$$;

create or replace function public.admin_wipe_posts(target uuid)
returns integer language plpgsql security definer set search_path = public as $$
declare
  removed integer;
begin
  if not public.viewer_is_admin() then
    raise exception 'Нет прав';
  end if;
  delete from public.posts where author_id = target;
  get diagnostics removed = row_count;
  insert into public.audit (actor_id, action) values (auth.uid(), 'wipe_posts');
  return removed;
end;
$$;

create or replace function public.admin_reset_look(target uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.viewer_is_admin() then
    raise exception 'Нет прав';
  end if;
  perform set_config('spokum.privileged', 'on', true);
  update public.profiles
     set avatar = null, banner = null, status_icon = null, pins = '[]'::jsonb, bio = ''
   where id = target;
  insert into public.audit (actor_id, action) values (auth.uid(), 'reset_look');
end;
$$;

create or replace function public.admin_rename(target uuid, name text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.viewer_is_admin() then
    raise exception 'Нет прав';
  end if;
  perform set_config('spokum.privileged', 'on', true);
  update public.profiles set display_name = left(coalesce(name, ''), 40) where id = target;
  insert into public.audit (actor_id, action) values (auth.uid(), 'rename');
end;
$$;

grant execute on function public.purge_call_signals() to authenticated;
grant execute on function public.bump_post_views(bigint) to authenticated, anon;
grant execute on function public.admin_wipe_posts(uuid) to authenticated;
grant execute on function public.admin_reset_look(uuid) to authenticated;
grant execute on function public.admin_rename(uuid, text) to authenticated;

do $$
begin
  alter publication supabase_realtime add table public.call_signals;
exception when duplicate_object then null;
end $$;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'media',
  'media',
  true,
  26214400,
  array['video/mp4', 'video/webm', 'video/quicktime', 'image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
  set public = true,
      file_size_limit = 26214400,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "media bucket read" on storage.objects;
create policy "media bucket read" on storage.objects for select
  using (bucket_id = 'media');

drop policy if exists "media bucket insert" on storage.objects;
create policy "media bucket insert" on storage.objects for insert to authenticated
  with check (bucket_id = 'media' and public.viewer_can_write());

drop policy if exists "media bucket delete" on storage.objects;
create policy "media bucket delete" on storage.objects for delete to authenticated
  using (bucket_id = 'media' and owner = auth.uid());

grant select, insert, update, delete on table public.announcements to authenticated;
grant select on table public.announcements to anon;
grant select, insert, delete on table public.call_signals to authenticated;

alter table public.profiles add column if not exists login_name text;
update public.profiles set login_name = username where login_name is null;

create table if not exists public.usernames (
  username text primary key,
  user_id uuid not null references public.profiles on delete cascade,
  created_at timestamptz not null default now()
);
create index if not exists usernames_user_idx on public.usernames (user_id, created_at);

insert into public.usernames (username, user_id)
select username, id from public.profiles
on conflict (username) do nothing;

alter table public.usernames enable row level security;

drop policy if exists usernames_read on public.usernames;
create policy usernames_read on public.usernames for select using (true);

grant select on table public.usernames to authenticated, anon;

create or replace function public.username_limit()
returns integer language sql stable security definer set search_path = public as $$
  select case when public.viewer_is_premium() then 8 else 3 end;
$$;

create or replace function public.add_username(wanted text)
returns text language plpgsql security definer set search_path = public as $$
declare
  clean text;
  taken uuid;
  used integer;
begin
  if auth.uid() is null then
    raise exception 'Нужен вход';
  end if;
  clean := lower(trim(both from coalesce(wanted, '')));
  clean := regexp_replace(clean, '^@', '');
  if clean !~ '^[a-z0-9_]{3,20}$' then
    raise exception 'Юзернейм: 3-20 символов, латиница, цифры и _';
  end if;
  select user_id into taken from public.usernames where username = clean;
  if taken is not null then
    if taken = auth.uid() then
      return clean;
    end if;
    raise exception 'Юзернейм занят';
  end if;
  if exists (select 1 from public.profiles where username = clean and id <> auth.uid()) then
    raise exception 'Юзернейм занят';
  end if;
  select count(*) into used from public.usernames where user_id = auth.uid();
  if used >= public.username_limit() then
    raise exception 'Больше юзернеймов не поместится: лимит %', public.username_limit();
  end if;
  insert into public.usernames (username, user_id) values (clean, auth.uid());
  return clean;
end;
$$;

create or replace function public.drop_username(target text)
returns void language plpgsql security definer set search_path = public as $$
declare
  clean text;
  main text;
begin
  if auth.uid() is null then
    raise exception 'Нужен вход';
  end if;
  clean := lower(regexp_replace(coalesce(target, ''), '^@', ''));
  select username into main from public.profiles where id = auth.uid();
  if clean = main then
    raise exception 'Это основной юзернейм, сначала выберите другой основным';
  end if;
  if clean = (select login_name from public.profiles where id = auth.uid()) then
    raise exception 'С этим юзернеймом вы входите в аккаунт, его убрать нельзя';
  end if;
  delete from public.usernames where username = clean and user_id = auth.uid();
end;
$$;

create or replace function public.set_main_username(target text)
returns text language plpgsql security definer set search_path = public as $$
declare
  clean text;
  owner uuid;
begin
  if auth.uid() is null then
    raise exception 'Нужен вход';
  end if;
  clean := lower(regexp_replace(coalesce(target, ''), '^@', ''));
  select user_id into owner from public.usernames where username = clean;
  if owner is null or owner <> auth.uid() then
    raise exception 'Этот юзернейм вам не принадлежит';
  end if;
  perform set_config('spokum.privileged', 'on', true);
  update public.profiles set username = clean where id = auth.uid();
  return clean;
end;
$$;

create or replace function public.resolve_login(target text)
returns text language sql stable security definer set search_path = public as $$
  select coalesce(p.login_name, p.username)
    from public.usernames u
    join public.profiles p on p.id = u.user_id
   where u.username = lower(regexp_replace(coalesce(target, ''), '^@', ''))
   limit 1;
$$;

create or replace function public.find_by_username(needle text)
returns setof uuid language sql stable security definer set search_path = public as $$
  select distinct user_id from public.usernames
   where username ilike '%' || lower(regexp_replace(coalesce(needle, ''), '^@', '')) || '%'
   limit 40;
$$;

grant execute on function public.username_limit() to authenticated;
grant execute on function public.add_username(text) to authenticated;
grant execute on function public.drop_username(text) to authenticated;
grant execute on function public.set_main_username(text) to authenticated;
grant execute on function public.resolve_login(text) to authenticated, anon;
grant execute on function public.find_by_username(text) to authenticated, anon;

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  wanted text;
  founder boolean;
begin
  wanted := lower(coalesce(new.raw_user_meta_data->>'username', split_part(new.email, '@', 1)));
  founder := wanted = 'vanya8';
  insert into public.profiles (id, username, login_name, display_name, hue, is_admin, is_developer, is_verified)
  values (
    new.id,
    wanted,
    wanted,
    coalesce(nullif(new.raw_user_meta_data->>'display_name', ''), wanted),
    200 + (length(wanted) * 37) % 140,
    founder,
    founder,
    founder
  );
  insert into public.usernames (username, user_id) values (wanted, new.id)
  on conflict (username) do nothing;
  return new;
end;
$$;

create or replace function public.protect_login_name()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if coalesce(current_setting('spokum.privileged', true), '') = 'on' then
    return new;
  end if;
  new.login_name := old.login_name;
  return new;
end;
$$;

drop trigger if exists profiles_protect_login on public.profiles;
create trigger profiles_protect_login
  before update on public.profiles
  for each row execute function public.protect_login_name();

create table if not exists public.tg_links (
  tg_id bigint primary key,
  user_id uuid not null references public.profiles on delete cascade,
  tg_name text not null default '',
  linked_at timestamptz not null default now()
);
create unique index if not exists tg_links_user_idx on public.tg_links (user_id);

create table if not exists public.link_codes (
  code text primary key,
  user_id uuid not null references public.profiles on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '20 minutes',
  used_at timestamptz
);
create index if not exists link_codes_user_idx on public.link_codes (user_id, created_at desc);

create table if not exists public.payments (
  id bigint generated always as identity primary key,
  user_id uuid references public.profiles on delete set null,
  tg_id bigint,
  charge_id text unique,
  stars integer not null default 0,
  days integer not null default 0,
  created_at timestamptz not null default now(),
  refunded_at timestamptz
);
create index if not exists payments_user_idx on public.payments (user_id, created_at desc);

alter table public.tg_links enable row level security;
alter table public.link_codes enable row level security;
alter table public.payments enable row level security;

drop policy if exists tg_links_own on public.tg_links;
create policy tg_links_own on public.tg_links for select
  using (user_id = auth.uid() or public.viewer_is_admin());

drop policy if exists tg_links_forget on public.tg_links;
create policy tg_links_forget on public.tg_links for delete using (user_id = auth.uid());

drop policy if exists payments_own on public.payments;
create policy payments_own on public.payments for select
  using (user_id = auth.uid() or public.viewer_is_admin());

grant select, delete on table public.tg_links to authenticated;
grant select on table public.payments to authenticated;

create or replace function public.make_link_code()
returns text language plpgsql security definer set search_path = public as $$
declare
  fresh text;
begin
  if auth.uid() is null then
    raise exception 'Нужен вход';
  end if;
  delete from public.link_codes where user_id = auth.uid() and used_at is null;
  fresh := upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10));
  insert into public.link_codes (code, user_id) values (fresh, auth.uid());
  return fresh;
end;
$$;

create or replace function public.my_billing()
returns json language sql stable security definer set search_path = public as $$
  select json_build_object(
    'telegram', (select tg_name from public.tg_links where user_id = auth.uid()),
    'payments', coalesce((
      select json_agg(json_build_object('stars', stars, 'days', days, 'at', created_at) order by created_at desc)
      from (select * from public.payments where user_id = auth.uid() order by created_at desc limit 10) p
    ), '[]'::json)
  );
$$;

create or replace function public.bot_bind(code text, tg bigint, tg_name text)
returns json language plpgsql security definer set search_path = public as $$
declare
  found public.link_codes;
  who public.profiles;
begin
  select * into found from public.link_codes
   where link_codes.code = upper(trim(bot_bind.code))
     and used_at is null
     and expires_at > now();
  if found.code is null then
    return json_build_object('ok', false, 'error', 'Код не найден или устарел');
  end if;
  update public.link_codes set used_at = now() where link_codes.code = found.code;
  delete from public.tg_links where user_id = found.user_id or tg_id = tg;
  insert into public.tg_links (tg_id, user_id, tg_name) values (tg, found.user_id, coalesce(tg_name, ''));
  select * into who from public.profiles where id = found.user_id;
  return json_build_object('ok', true, 'username', who.username, 'name', who.display_name);
end;
$$;

create or replace function public.bot_whoami(tg bigint)
returns json language sql stable security definer set search_path = public as $$
  select json_build_object(
    'username', p.username,
    'name', p.display_name,
    'premium_until', p.premium_until
  )
  from public.tg_links l join public.profiles p on p.id = l.user_id
  where l.tg_id = tg;
$$;

create or replace function public.bot_unbind(tg bigint)
returns void language sql security definer set search_path = public as $$
  delete from public.tg_links where tg_id = tg;
$$;

create or replace function public.bot_grant_premium(tg bigint, days integer, stars integer, charge text)
returns json language plpgsql security definer set search_path = public as $$
declare
  target uuid;
  base timestamptz;
  result timestamptz;
  who public.profiles;
begin
  select user_id into target from public.tg_links where tg_id = tg;
  if target is null then
    return json_build_object('ok', false, 'error', 'Аккаунт не привязан');
  end if;
  if exists (select 1 from public.payments where charge_id = charge) then
    select premium_until into result from public.profiles where id = target;
    return json_build_object('ok', true, 'until', result, 'repeat', true);
  end if;

  perform set_config('spokum.privileged', 'on', true);

  select greatest(coalesce(premium_until, now()), now()) into base from public.profiles where id = target;
  result := base + make_interval(days => days);

  update public.profiles
     set premium_until = result,
         premium_reason = 'Оплачено звёздами Telegram',
         premium_granted_at = now()
   where id = target;

  insert into public.payments (user_id, tg_id, charge_id, stars, days)
  values (target, tg, charge, stars, days);

  insert into public.audit (actor_id, action, meta)
  values (target, 'premium_paid', json_build_object('stars', stars, 'days', days)::jsonb);

  select * into who from public.profiles where id = target;
  return json_build_object('ok', true, 'until', result, 'username', who.username);
end;
$$;

revoke execute on function public.bot_bind(text, bigint, text) from public, anon, authenticated;
revoke execute on function public.bot_whoami(bigint) from public, anon, authenticated;
revoke execute on function public.bot_unbind(bigint) from public, anon, authenticated;
revoke execute on function public.bot_grant_premium(bigint, integer, integer, text) from public, anon, authenticated;

grant execute on function public.make_link_code() to authenticated;
grant execute on function public.my_billing() to authenticated;

create or replace function public.bot_stats()
returns json language sql security definer set search_path = public as $$
  select json_build_object(
    'users', (select count(*) from public.profiles),
    'users_today', (select count(*) from public.profiles where created_at > now() - interval '1 day'),
    'users_week', (select count(*) from public.profiles where created_at > now() - interval '7 days'),
    'online', (select count(*) from public.profiles where last_seen > now() - interval '5 minutes'),
    'active_day', (select count(*) from public.profiles where last_seen > now() - interval '1 day'),
    'active_week', (select count(*) from public.profiles where last_seen > now() - interval '7 days'),
    'premium', (select count(*) from public.profiles where premium_until > now()),
    'moderators', (select count(*) from public.profiles where is_moderator),
    'banned', (select count(*) from public.profiles where banned_until > now()),
    'muted', (select count(*) from public.profiles where muted_until > now()),
    'posts', (select count(*) from public.posts where not removed and kind = 'text'),
    'reels', (select count(*) from public.posts where not removed and kind in ('video', 'album')),
    'posts_today', (select count(*) from public.posts where created_at > now() - interval '1 day'),
    'comments', (select count(*) from public.comments),
    'messages', (select count(*) from public.messages),
    'chats', (select count(*) from public.chats),
    'reports_open', (select count(*) from public.reports where status = 'open'),
    'linked', (select count(*) from public.tg_links),
    'orders', (select count(*) from public.payments),
    'orders_today', (select count(*) from public.payments where created_at > now() - interval '1 day'),
    'orders_week', (select count(*) from public.payments where created_at > now() - interval '7 days'),
    'stars', (select coalesce(sum(stars), 0) from public.payments where refunded_at is null),
    'stars_today', (select coalesce(sum(stars), 0) from public.payments where refunded_at is null and created_at > now() - interval '1 day'),
    'stars_week', (select coalesce(sum(stars), 0) from public.payments where refunded_at is null and created_at > now() - interval '7 days'),
    'refunded', (select count(*) from public.payments where refunded_at is not null),
    'last_order', (select created_at from public.payments order by created_at desc limit 1)
  );
$$;

revoke execute on function public.bot_stats() from public, anon, authenticated;

create table if not exists public.notifications (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles on delete cascade,
  kind text not null,
  title text not null default '',
  body text not null default '',
  meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  read_at timestamptz
);
create index if not exists notifications_user_idx on public.notifications (user_id, created_at desc);
create index if not exists notifications_unread_idx on public.notifications (user_id) where read_at is null;

alter table public.notifications enable row level security;

drop policy if exists notifications_own on public.notifications;
create policy notifications_own on public.notifications for select using (user_id = auth.uid());

drop policy if exists notifications_touch on public.notifications;
create policy notifications_touch on public.notifications for update using (user_id = auth.uid());

drop policy if exists notifications_drop on public.notifications;
create policy notifications_drop on public.notifications for delete using (user_id = auth.uid());

grant select, update, delete on table public.notifications to authenticated;

alter table public.profiles add column if not exists notify_posts boolean not null default true;

create or replace function public.notify_user(target uuid, kind text, title text, body text, meta jsonb default '{}'::jsonb)
returns void language sql security definer set search_path = public as $$
  insert into public.notifications (user_id, kind, title, body, meta)
  select target, kind, title, body, coalesce(meta, '{}'::jsonb)
  where target is not null;
$$;

create or replace function public.notify_staff(kind text, title text, body text, meta jsonb default '{}'::jsonb, skip uuid default null)
returns void language sql security definer set search_path = public as $$
  insert into public.notifications (user_id, kind, title, body, meta)
  select p.id, kind, title, body, coalesce(meta, '{}'::jsonb)
  from public.profiles p
  where (p.is_moderator or p.is_admin)
    and (skip is null or p.id <> skip)
    and coalesce(p.banned_until, to_timestamp(0)) < now();
$$;

create or replace function public.notify_admins(kind text, title text, body text, meta jsonb default '{}'::jsonb, skip uuid default null)
returns void language sql security definer set search_path = public as $$
  insert into public.notifications (user_id, kind, title, body, meta)
  select p.id, kind, title, body, coalesce(meta, '{}'::jsonb)
  from public.profiles p
  where p.is_admin and (skip is null or p.id <> skip);
$$;

create or replace function public.notify_new_message()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  sender text;
  preview text;
begin
  if new.kind = 'call' then
    return new;
  end if;
  select display_name into sender from public.profiles where id = new.author_id;
  preview := case
    when new.kind = 'image' then 'Фото'
    when new.kind = 'voice' then 'Голосовое сообщение'
    when new.kind = 'sticker' then 'Стикер'
    else left(coalesce(new.body, ''), 90)
  end;
  insert into public.notifications (user_id, kind, title, body, meta)
  select m.user_id, 'message', coalesce(sender, 'Новое сообщение'), preview,
         jsonb_build_object('chat', new.chat_id, 'from', new.author_id)
  from public.chat_members m
  where m.chat_id = new.chat_id and m.user_id <> new.author_id;
  return new;
end;
$$;

drop trigger if exists messages_notify on public.messages;
create trigger messages_notify
  after insert on public.messages
  for each row execute function public.notify_new_message();

create or replace function public.notify_new_report()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  who text;
begin
  select display_name into who from public.profiles where id = new.reporter_id;
  perform public.notify_staff(
    'report',
    'Новая жалоба',
    coalesce(who, 'Кто-то') || ': ' || left(coalesce(new.reason, ''), 90),
    jsonb_build_object('report', new.id, 'target_kind', new.target_kind),
    new.reporter_id
  );
  return new;
end;
$$;

drop trigger if exists reports_notify on public.reports;
create trigger reports_notify
  after insert on public.reports
  for each row execute function public.notify_new_report();

create or replace function public.notify_new_post()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  who text;
  label text;
begin
  select display_name into who from public.profiles where id = new.author_id;
  label := case new.kind when 'video' then 'Новое видео' when 'album' then 'Новый альбом' else 'Новая запись' end;
  insert into public.notifications (user_id, kind, title, body, meta)
  select p.id, 'newpost', label,
         coalesce(who, 'Кто-то') || ': ' || left(coalesce(new.body, 'без текста'), 90),
         jsonb_build_object('post', new.id, 'author', new.author_id)
  from public.profiles p
  where (p.is_moderator or p.is_admin)
    and p.notify_posts
    and p.id <> new.author_id
    and coalesce(p.banned_until, to_timestamp(0)) < now();
  return new;
end;
$$;

drop trigger if exists posts_notify on public.posts;
create trigger posts_notify
  after insert on public.posts
  for each row execute function public.notify_new_post();

create or replace function public.mark_notifications(ids bigint[] default null)
returns void language sql security definer set search_path = public as $$
  update public.notifications
     set read_at = now()
   where user_id = auth.uid()
     and read_at is null
     and (ids is null or id = any(ids));
$$;

create or replace function public.clear_notifications()
returns void language sql security definer set search_path = public as $$
  delete from public.notifications where user_id = auth.uid();
$$;

grant execute on function public.mark_notifications(bigint[]) to authenticated;
grant execute on function public.clear_notifications() to authenticated;
revoke execute on function public.notify_user(uuid, text, text, text, jsonb) from public, anon, authenticated;
revoke execute on function public.notify_staff(text, text, text, jsonb, uuid) from public, anon, authenticated;
revoke execute on function public.notify_admins(text, text, text, jsonb, uuid) from public, anon, authenticated;

do $$
begin
  alter publication supabase_realtime add table public.notifications;
exception when duplicate_object then null;
end $$;

create or replace function public.mod_remove_post(target bigint, reason text)
returns void language plpgsql security definer set search_path = public as $$
declare
  author uuid;
  actor text;
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

  perform public.notify_user(
    author, 'removed', 'Ваша запись снята с публикации',
    'Причина: ' || reason,
    jsonb_build_object('post', target)
  );

  select display_name into actor from public.profiles where id = auth.uid();
  perform public.notify_admins(
    'modaction', 'Модератор снял запись',
    coalesce(actor, 'Модератор') || ': ' || left(reason, 90),
    jsonb_build_object('post', target),
    auth.uid()
  );

  perform public.log_action('post.remove', jsonb_build_object('post', target, 'reason', reason));
end;
$$;

create or replace function public.mod_punish(target uuid, kind text, minutes integer, reason text)
returns void language plpgsql security definer set search_path = public as $$
declare
  until timestamptz;
  actor text;
  label text;
  who text;
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

  label := case kind
    when 'warn' then 'Вам вынесли предупреждение'
    when 'mute' then 'Вам ограничили публикации'
    else 'Ваш аккаунт заблокирован'
  end;

  perform public.notify_user(
    target, 'punish', label,
    'Причина: ' || reason || case when kind <> 'warn' and coalesce(minutes, 0) > 0
      then '. До ' || to_char(until, 'DD.MM.YYYY HH24:MI') else '' end,
    jsonb_build_object('kind', kind, 'minutes', minutes)
  );

  select display_name into actor from public.profiles where id = auth.uid();
  select display_name into who from public.profiles where id = target;
  perform public.notify_admins(
    'modaction', 'Модератор выдал наказание',
    coalesce(actor, 'Модератор') || ' → ' || coalesce(who, 'человек') || ': ' || kind,
    jsonb_build_object('user', target, 'kind', kind),
    auth.uid()
  );

  perform public.log_action('mod.punish', jsonb_build_object('user', target, 'kind', kind, 'minutes', minutes));
end;
$$;

create or replace function public.bot_grant_premium(tg bigint, days integer, stars integer, charge text)
returns json language plpgsql security definer set search_path = public as $$
declare
  target uuid;
  base timestamptz;
  result timestamptz;
  who public.profiles;
begin
  select user_id into target from public.tg_links where tg_id = tg;
  if target is null then
    return json_build_object('ok', false, 'error', 'Аккаунт не привязан');
  end if;
  if exists (select 1 from public.payments where charge_id = charge) then
    select premium_until into result from public.profiles where id = target;
    return json_build_object('ok', true, 'until', result, 'repeat', true);
  end if;

  perform set_config('spokum.privileged', 'on', true);

  select greatest(coalesce(premium_until, now()), now()) into base from public.profiles where id = target;
  result := base + make_interval(days => days);

  update public.profiles
     set premium_until = result,
         premium_reason = 'Оплачено звёздами Telegram',
         premium_granted_at = now()
   where id = target;

  insert into public.payments (user_id, tg_id, charge_id, stars, days)
  values (target, tg, charge, stars, days);

  insert into public.audit (actor_id, action, meta)
  values (target, 'premium_paid', json_build_object('stars', stars, 'days', days)::jsonb);

  perform public.notify_user(
    target, 'premium', 'СпокУм Премиум подключён',
    'Оплата принята. Действует до ' || to_char(result, 'DD.MM.YYYY'),
    jsonb_build_object('until', result)
  );

  perform public.notify_admins(
    'payment', 'Новая оплата',
    stars::text || ' звёзд за ' || days::text || ' дн.',
    jsonb_build_object('user', target, 'stars', stars),
    null
  );

  select * into who from public.profiles where id = target;
  return json_build_object('ok', true, 'until', result, 'username', who.username);
end;
$$;

revoke execute on function public.bot_grant_premium(bigint, integer, integer, text) from public, anon, authenticated;

create table if not exists public.devices (
  id text primary key,
  label text not null default '',
  platform text not null default '',
  country text not null default '',
  app text not null default 'web',
  first_seen timestamptz not null default now(),
  last_seen timestamptz not null default now()
);

create table if not exists public.device_users (
  device_id text not null references public.devices on delete cascade,
  user_id uuid not null references public.profiles on delete cascade,
  first_seen timestamptz not null default now(),
  last_seen timestamptz not null default now(),
  primary key (device_id, user_id)
);
create index if not exists device_users_user_idx on public.device_users (user_id, last_seen desc);

create table if not exists public.device_bans (
  id bigint generated always as identity primary key,
  device_id text not null references public.devices on delete cascade,
  until timestamptz,
  reason text not null default '',
  actor_id uuid references public.profiles on delete set null,
  created_at timestamptz not null default now(),
  lifted_at timestamptz,
  lifted_by uuid references public.profiles on delete set null
);
create index if not exists device_bans_device_idx on public.device_bans (device_id, created_at desc);

alter table public.devices enable row level security;
alter table public.device_users enable row level security;
alter table public.device_bans enable row level security;

drop policy if exists devices_read on public.devices;
create policy devices_read on public.devices for select using (public.viewer_is_moderator());

drop policy if exists device_users_read on public.device_users;
create policy device_users_read on public.device_users for select using (public.viewer_is_moderator());

drop policy if exists device_bans_read on public.device_bans;
create policy device_bans_read on public.device_bans for select using (public.viewer_is_moderator());

create or replace function public.rank_name(rank integer)
returns text language sql immutable as $$
  select case coalesce(rank, 0)
    when 0 then 'Стажёр'
    when 1 then 'Младший модератор'
    when 2 then 'Модератор'
    when 3 then 'Старший модератор'
    when 4 then 'Ведущий модератор'
    when 5 then 'Начальник модераторов'
    else 'Стажёр' end;
$$;

create or replace function public.device_ban_state(fp text)
returns jsonb language sql security definer set search_path = public as $$
  select coalesce(
    (select jsonb_build_object(
        'blocked', true,
        'until', b.until,
        'forever', b.until is null,
        'reason', b.reason)
       from public.device_bans b
      where b.device_id = fp
        and b.lifted_at is null
        and (b.until is null or b.until > now())
      order by b.created_at desc
      limit 1),
    jsonb_build_object('blocked', false));
$$;

create or replace function public.touch_device(fp text, info jsonb, fresh boolean default false)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  state jsonb;
  stop timestamptz;
begin
  if coalesce(trim(fp), '') = '' then return jsonb_build_object('blocked', false); end if;

  state := public.device_ban_state(fp);

  insert into public.devices (id, label, platform, country, app)
  values (
    fp,
    left(coalesce(info->>'label', ''), 120),
    left(coalesce(info->>'platform', ''), 60),
    left(coalesce(info->>'country', ''), 60),
    left(coalesce(info->>'app', 'web'), 20)
  )
  on conflict (id) do update
    set last_seen = now(),
        label = case when excluded.label <> '' then excluded.label else public.devices.label end,
        platform = case when excluded.platform <> '' then excluded.platform else public.devices.platform end,
        country = case when excluded.country <> '' then excluded.country else public.devices.country end,
        app = case when excluded.app <> '' then excluded.app else public.devices.app end;

  if auth.uid() is not null then
    insert into public.device_users (device_id, user_id)
    values (fp, auth.uid())
    on conflict (device_id, user_id) do update set last_seen = now();
  end if;

  if (state->>'blocked')::boolean and fresh and auth.uid() is not null then
    stop := coalesce((state->>'until')::timestamptz, now() + interval '100 years');
    perform set_config('spokum.privileged', 'on', true);
    update public.profiles
       set banned_until = stop,
           ban_reason = 'Регистрация с заблокированного устройства'
     where id = auth.uid() and not is_admin;
    insert into public.audit (actor_id, action, meta)
    values (auth.uid(), 'device.evade', jsonb_build_object('device', fp));
    perform public.notify_staff(
      'modaction', 'Обход блокировки устройства',
      'С заблокированного устройства завели новый аккаунт',
      jsonb_build_object('user', auth.uid(), 'device', fp),
      null);
  end if;

  return state;
end;
$$;

create or replace function public.mod_user_info(target uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  who public.profiles;
  result jsonb;
begin
  if not public.viewer_is_moderator() then raise exception 'Только для модераторов'; end if;
  select * into who from public.profiles where id = target;
  if who.id is null then raise exception 'Человек не найден'; end if;

  select jsonb_build_object(
    'id', who.id,
    'username', who.username,
    'displayName', who.display_name,
    'createdAt', who.created_at,
    'lastSeen', who.last_seen,
    'bannedUntil', who.banned_until,
    'mutedUntil', who.muted_until,
    'banReason', who.ban_reason,
    'isModerator', who.is_moderator,
    'isAdmin', who.is_admin,
    'rank', who.mod_rank,
    'rankName', case when who.is_admin and who.mod_rank = 0 then 'Администратор' else public.rank_name(who.mod_rank) end,
    'posts', (select count(*) from public.posts p where p.author_id = target),
    'comments', (select count(*) from public.comments c where c.author_id = target),
    'reportsOn', (select count(*) from public.reports r where r.target_user = target),
    'reportsBy', (select count(*) from public.reports r where r.reporter_id = target),
    'punishments', (select count(*) from public.punishments p where p.user_id = target),
    'countries', (select coalesce(jsonb_agg(distinct d.country), '[]'::jsonb)
                    from public.device_users du
                    join public.devices d on d.id = du.device_id
                   where du.user_id = target and d.country <> ''),
    'devices', (select coalesce(jsonb_agg(item order by item->>'lastSeen' desc), '[]'::jsonb)
                  from (
                    select jsonb_build_object(
                      'id', d.id,
                      'label', d.label,
                      'platform', d.platform,
                      'country', d.country,
                      'app', d.app,
                      'firstSeen', du.first_seen,
                      'lastSeen', du.last_seen,
                      'accounts', (select count(*) from public.device_users x where x.device_id = d.id),
                      'ban', public.device_ban_state(d.id)
                    ) as item
                    from public.device_users du
                    join public.devices d on d.id = du.device_id
                    where du.user_id = target
                  ) rows)
  ) into result;

  perform public.log_action('mod.userinfo', jsonb_build_object('user', target));
  return result;
end;
$$;

create or replace function public.mod_ban_device(fp text, minutes integer, reason text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  stop timestamptz;
  owners integer;
begin
  if not public.viewer_is_moderator() then raise exception 'Только для модераторов'; end if;
  if coalesce(trim(reason), '') = '' then raise exception 'Нужна причина'; end if;
  if not exists (select 1 from public.devices where id = fp) then raise exception 'Устройство не найдено'; end if;
  if exists (
    select 1 from public.device_users du
    join public.profiles p on p.id = du.user_id
    where du.device_id = fp and p.is_admin
  ) then
    raise exception 'На этом устройстве заходил админ';
  end if;

  stop := case when coalesce(minutes, 0) <= 0 then null else now() + make_interval(mins => minutes) end;

  update public.device_bans
     set lifted_at = now(), lifted_by = auth.uid()
   where device_id = fp and lifted_at is null;

  insert into public.device_bans (device_id, until, reason, actor_id)
  values (fp, stop, reason, auth.uid());

  select count(*) into owners from public.device_users where device_id = fp;

  perform public.notify_admins(
    'modaction', 'Блокировка устройства',
    case when stop is null then 'Навсегда' else 'До ' || to_char(stop, 'DD.MM.YYYY HH24:MI') end || '. ' || reason,
    jsonb_build_object('device', fp),
    null);

  perform public.log_action('device.ban', jsonb_build_object('device', fp, 'minutes', minutes, 'reason', reason));
  return jsonb_build_object('ok', true, 'until', stop, 'accounts', owners);
end;
$$;

create or replace function public.mod_unban_device(fp text)
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  if not public.viewer_is_admin() then raise exception 'Снять блокировку устройства может только админ'; end if;
  update public.device_bans
     set lifted_at = now(), lifted_by = auth.uid()
   where device_id = fp and lifted_at is null;
  perform public.log_action('device.unban', jsonb_build_object('device', fp));
  return jsonb_build_object('ok', true);
end;
$$;

create or replace function public.admin_mod_team()
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  result jsonb;
begin
  if not public.viewer_is_admin() then raise exception 'Только для админов'; end if;

  select coalesce(jsonb_agg(row order by (row->>'score')::int desc), '[]'::jsonb) into result
  from (
    select jsonb_build_object(
      'id', p.id,
      'username', p.username,
      'displayName', p.display_name,
      'avatar', p.avatar,
      'hue', p.hue,
      'isAdmin', p.is_admin,
      'rank', p.mod_rank,
      'rankName', case when p.is_admin and p.mod_rank = 0 then 'Администратор' else public.rank_name(p.mod_rank) end,
      'since', p.created_at,
      'lastSeen', p.last_seen,
      'removals', r.removals,
      'punishments', r.punishments,
      'reports', r.reports,
      'strikes', r.strikes,
      'recent', r.recent,
      'lastAction', r.last_action,
      'score', r.removals + r.punishments + r.reports,
      'deserved', case
        when r.strikes >= 2 then 0
        when r.removals + r.punishments + r.reports >= 400 then 4
        when r.removals + r.punishments + r.reports >= 150 then 3
        when r.removals + r.punishments + r.reports >= 50 then 2
        when r.removals + r.punishments + r.reports >= 10 then 1
        else 0 end
    ) as row
    from public.profiles p
    cross join lateral (
      select
        (select count(*) from public.punishments x where x.actor_id = p.id and x.kind = 'post_removed')::int as removals,
        (select count(*) from public.punishments x where x.actor_id = p.id and x.kind in ('warn', 'mute', 'ban'))::int as punishments,
        (select count(*) from public.reports x where x.handled_by = p.id)::int as reports,
        (select count(*) from public.mod_strikes x where x.moderator_id = p.id)::int as strikes,
        (select count(*) from public.punishments x where x.actor_id = p.id and x.created_at > now() - interval '30 days')::int as recent,
        (select max(x.created_at) from public.punishments x where x.actor_id = p.id) as last_action
    ) r
    where p.is_moderator or p.is_admin
  ) rows;

  return result;
end;
$$;

create or replace function public.admin_set_rank(target uuid, rank integer)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  title text;
begin
  if not public.viewer_is_admin() then raise exception 'Только для админов'; end if;
  if rank < 0 or rank > 5 then raise exception 'Звание от 0 до 5'; end if;
  if not exists (select 1 from public.profiles where id = target and (is_moderator or is_admin)) then
    raise exception 'Звание только для модераторов';
  end if;

  perform set_config('spokum.privileged', 'on', true);
  update public.profiles set mod_rank = rank where id = target;
  title := public.rank_name(rank);

  perform public.notify_user(
    target, 'modaction', 'Новое звание',
    'Теперь вы ' || title,
    jsonb_build_object('rank', rank));

  perform public.log_action('mod.rank', jsonb_build_object('user', target, 'rank', rank));
  return jsonb_build_object('ok', true, 'rank', rank, 'rankName', title);
end;
$$;

revoke execute on function public.touch_device(text, jsonb, boolean) from public, anon;
grant execute on function public.touch_device(text, jsonb, boolean) to authenticated;
revoke execute on function public.mod_user_info(uuid) from public, anon;
grant execute on function public.mod_user_info(uuid) to authenticated;
revoke execute on function public.mod_ban_device(text, integer, text) from public, anon;
grant execute on function public.mod_ban_device(text, integer, text) to authenticated;
revoke execute on function public.mod_unban_device(text) from public, anon;
grant execute on function public.mod_unban_device(text) to authenticated;
revoke execute on function public.admin_mod_team() from public, anon;
grant execute on function public.admin_mod_team() to authenticated;
revoke execute on function public.admin_set_rank(uuid, integer) from public, anon;
grant execute on function public.admin_set_rank(uuid, integer) to authenticated;
