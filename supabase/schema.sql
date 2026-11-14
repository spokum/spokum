--
-- PostgreSQL database dump
--

\restrict xpgImm9wbHjE9uimu2xSH77rDmgawF9xGvz29xrNqEsM1EqMxRB1Z0DOmdYC1nf

-- Dumped from database version 17.6
-- Dumped by pg_dump version 17.6

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: public; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA public;


--
-- Name: SCHEMA public; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON SCHEMA public IS 'standard public schema';


--
-- Name: accept_friend(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.accept_friend(p_requester uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE me uuid := auth.uid();
BEGIN
  IF me IS NULL THEN RAISE EXCEPTION 'Нужен вход' USING ERRCODE = '401'; END IF;
  UPDATE public.friendships SET status = 'accepted' WHERE requester_id = p_requester AND addressee_id = me AND status = 'pending';
  IF NOT FOUND THEN RAISE EXCEPTION 'Заявка не найдена' USING ERRCODE = '404'; END IF;
  RETURN jsonb_build_object('ok', true);
END;
$$;


--
-- Name: active_events(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.active_events() RETURNS jsonb
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'id', e.id, 'name', e.name, 'description', e.description,
    'startsAt', e.starts_at, 'endsAt', e.ends_at,
    'progress', COALESCE(ep.progress, 0), 'target', COALESCE(ep.target, 10),
    'claimed', COALESCE(ep.claimed, false)
  ) ORDER BY e.ends_at), '[]'::jsonb)
  FROM public.season_events e
  LEFT JOIN public.event_progress ep ON ep.event_id = e.id AND ep.user_id = auth.uid()
  WHERE e.active AND e.ends_at > now();
$$;


--
-- Name: active_pixel_battle(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.active_pixel_battle() RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE
  pb public.pixel_battles%ROWTYPE;
  me uuid := auth.uid();
  cd record;
BEGIN
  SELECT * INTO pb FROM public.pixel_battles WHERE active AND ends_at > now() ORDER BY id DESC LIMIT 1;
  IF NOT FOUND THEN RETURN jsonb_build_object('active', false); END IF;
  
  SELECT pixels_placed, cooldown_until INTO cd FROM public.pixel_cooldowns WHERE user_id = me AND battle_id = pb.id;
  
  RETURN jsonb_build_object(
    'active', true,
    'id', pb.id,
    'width', pb.width,
    'height', pb.height,
    'endsAt', pb.ends_at,
    'pixelsPlaced', COALESCE(cd.pixels_placed, 0),
    'cooldownUntil', cd.cooldown_until,
    'maxPixels', 3,
    'cooldownSecs', 120
  );
END;
$$;


--
-- Name: active_tournaments(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.active_tournaments() RETURNS jsonb
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'id', t.id, 'gameId', t.game_id, 'title', t.title,
    'startsAt', t.starts_at, 'endsAt', t.ends_at,
    'prize1', t.prize_1, 'prize2', t.prize_2, 'prize3', t.prize_3,
    'active', t.active
  ) ORDER BY t.ends_at), '[]'::jsonb)
  FROM public.tournaments t WHERE t.active AND t.ends_at > now();
$$;


--
-- Name: add_confession(text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.add_confession(p_body text, p_mood text DEFAULT 'calm'::text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE me uuid := auth.uid(); new_id bigint;
BEGIN
  IF me IS NULL THEN RAISE EXCEPTION 'Нужен вход' USING ERRCODE = '401'; END IF;
  IF NOT public.viewer_can_write() THEN RAISE EXCEPTION 'Нельзя сейчас' USING ERRCODE = '403'; END IF;
  IF length(p_body) < 1 OR length(p_body) > 1000 THEN
    RAISE EXCEPTION 'Текст 1-1000 символов' USING ERRCODE = '400';
  END IF;
  INSERT INTO public.confessions (author_id, body, mood) VALUES (me, p_body, p_mood) RETURNING id INTO new_id;
  RETURN jsonb_build_object('ok', true, 'id', new_id);
END;
$$;


--
-- Name: add_username(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.add_username(wanted text) RETURNS text
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $_$
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
$_$;


--
-- Name: add_wishlist_item(text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.add_wishlist_item(p_title text, p_link text DEFAULT NULL::text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE me uuid := auth.uid(); new_id bigint;
BEGIN
  IF me IS NULL THEN RAISE EXCEPTION 'Нужен вход' USING ERRCODE = '401'; END IF;
  IF length(p_title) < 1 OR length(p_title) > 200 THEN
    RAISE EXCEPTION 'Название 1-200 символов' USING ERRCODE = '400';
  END IF;
  INSERT INTO public.wishlist (user_id, title, link) VALUES (me, p_title, p_link) RETURNING id INTO new_id;
  RETURN jsonb_build_object('ok', true, 'id', new_id);
END;
$$;


--
-- Name: add_xp(integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.add_xp(p_amount integer) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE
  me uuid := auth.uid();
  new_xp integer;
  new_level integer;
  leveled_up boolean := false;
BEGIN
  SET LOCAL row_security = off;
  SET LOCAL spokum.privileged = on;
  IF me IS NULL THEN RAISE EXCEPTION 'Нужен вход' USING ERRCODE = '401'; END IF;
  UPDATE public.profiles SET xp = xp + p_amount WHERE id = me RETURNING xp INTO new_xp;
  -- Уровень: 100 * level XP нужно для следующего
  new_level := 1;
  WHILE new_xp >= (new_level * 100) LOOP
    new_xp := new_xp - (new_level * 100);
    new_level := new_level + 1;
    leveled_up := true;
  END LOOP;
  UPDATE public.profiles SET level = new_level WHERE id = me AND level < new_level;
  IF leveled_up THEN
    UPDATE public.profiles SET coins = coins + 50 WHERE id = me;
    INSERT INTO public.coin_log (user_id, amount, reason) VALUES (me, 50, 'Новый уровень ' || new_level);
  END IF;
  RETURN jsonb_build_object('ok', true, 'level', new_level, 'leveledUp', leveled_up);
END;
$$;


--
-- Name: admin_create_promo(text, text, integer, integer, integer, timestamp with time zone); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.admin_create_promo(p_code text, p_reward_type text, p_reward_amount integer DEFAULT 0, p_reward_days integer DEFAULT 0, p_max_uses integer DEFAULT 0, p_expires_at timestamp with time zone DEFAULT NULL::timestamp with time zone) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE me uuid := auth.uid(); new_id bigint;
BEGIN
  SET row_security = off;
  IF me IS NULL THEN RAISE EXCEPTION 'Нужен вход' USING ERRCODE = '401'; END IF;
  IF NOT public.viewer_is_admin() THEN RAISE EXCEPTION 'Только админ' USING ERRCODE = '403'; END IF;
  IF p_code IS NULL OR length(trim(p_code)) < 3 OR length(trim(p_code)) > 32 THEN
    RAISE EXCEPTION 'Код 3-32 символа' USING ERRCODE = '400';
  END IF;
  IF p_reward_type NOT IN ('coins', 'premium', 'coins_premium') THEN
    RAISE EXCEPTION 'Тип награды: coins, premium, coins_premium' USING ERRCODE = '400';
  END IF;

  INSERT INTO public.promocodes (code, reward_type, reward_amount, reward_days, max_uses, expires_at, created_by)
    VALUES (upper(trim(p_code)), p_reward_type, p_reward_amount, p_reward_days, p_max_uses, p_expires_at, me)
    RETURNING id INTO new_id;

  PERFORM public.log_action('promo.create', jsonb_build_object('id', new_id, 'code', upper(trim(p_code))));
  RETURN jsonb_build_object('ok', true, 'id', new_id);
END;
$$;


--
-- Name: admin_create_tournament(text, text, timestamp with time zone, integer, integer, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.admin_create_tournament(p_game_id text, p_title text, p_ends_at timestamp with time zone, p_prize_1 integer DEFAULT 500, p_prize_2 integer DEFAULT 250, p_prize_3 integer DEFAULT 100) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$DECLARE me uuid := auth.uid(); new_id bigint; BEGIN SET LOCAL row_security = off; IF me IS NULL THEN RAISE EXCEPTION 'Нужен вход' USING ERRCODE = '401'; END IF; IF NOT public.viewer_is_admin() THEN RAISE EXCEPTION 'Только админ' USING ERRCODE = '403'; END IF; INSERT INTO public.tournaments (game_id, title, ends_at, prize_1, prize_2, prize_3) VALUES (p_game_id, p_title, p_ends_at, p_prize_1, p_prize_2, p_prize_3) RETURNING id INTO new_id; RETURN jsonb_build_object('ok', true, 'id', new_id); END; $$;


--
-- Name: admin_delete_promo(bigint); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.admin_delete_promo(p_id bigint) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE me uuid := auth.uid();
BEGIN
  IF me IS NULL THEN RAISE EXCEPTION 'Нужен вход' USING ERRCODE = '401'; END IF;
  IF NOT public.viewer_is_admin() THEN RAISE EXCEPTION 'Только админ' USING ERRCODE = '403'; END IF;
  DELETE FROM public.promocodes WHERE id = p_id;
  RETURN jsonb_build_object('ok', true);
END;
$$;


--
-- Name: admin_delete_user(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.admin_delete_user(target uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'auth', 'storage'
    AS $$
declare
  boss uuid := auth.uid();
  who public.profiles;
  posts_count bigint := 0;
  messages_count bigint := 0;
  files_count bigint := 0;
begin
  if boss is null then raise exception 'Нужен вход'; end if;
  if not exists (select 1 from public.profiles where id = boss and is_admin) then
    raise exception 'Удалять аккаунты может только админ';
  end if;
  if target is null then raise exception 'Кого удалять?'; end if;
  if target = boss then raise exception 'Себя удалить нельзя'; end if;

  select * into who from public.profiles where id = target;

  if not found then
    -- Профиля уже нет, но запись входа могла остаться.
    delete from auth.users where id = target;
    return jsonb_build_object('ok', true, 'username', '', 'note', 'входа не было, запись очищена');
  end if;

  if who.username = 'vanya8' then raise exception 'Основателя удалить нельзя'; end if;

  perform set_config('spokum.privileged', 'on', true);

  select count(*) into posts_count from public.posts where author_id = target;
  select count(*) into messages_count from public.messages where user_id = target;

  -- Файлы человека из хранилища (аватары, баннеры, вложения, истории).
  begin
    select count(*) into files_count from storage.objects where owner = target and bucket_id in ('media', 'stories');
    delete from storage.objects where owner = target and bucket_id in ('media', 'stories');
  exception
    when undefined_table or undefined_column or insufficient_privilege then
      files_count := 0;
  end;

  -- Запись в журнал делаем до удаления профиля, иначе будет не о ком писать.
  insert into public.audit (actor_id, action, meta)
  values (boss, 'admin.delete_user', jsonb_build_object(
    'id', target,
    'username', who.username,
    'displayName', who.display_name,
    'posts', posts_count,
    'messages', messages_count,
    'files', files_count
  ));

  -- Удаляем запись входа: профиль и весь его контент уезжают каскадом,
  -- а вместе с ними — все его входы и ключи обновления.
  delete from auth.users where id = target;

  return jsonb_build_object(
    'ok', true,
    'username', who.username,
    'displayName', who.display_name,
    'id', target,
    'posts', posts_count,
    'messages', messages_count,
    'files', files_count
  );
end;
$$;


--
-- Name: admin_give_coins(uuid, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.admin_give_coins(target uuid, amount integer) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  purse integer;
begin
  if not public.viewer_is_admin() then raise exception 'Только для админов'; end if;
  perform set_config('spokum.privileged', 'on', true);
  update public.profiles set coins = greatest(0, coins + amount) where id = target returning coins into purse;
  insert into public.coin_log (user_id, amount, reason) values (target, amount, 'От администрации');
  if amount > 0 then
    perform public.notify_user(target, 'gift', 'Монеты от администрации',
      'Вам начислено ' || amount::text, jsonb_build_object('coins', amount));
  end if;
  return jsonb_build_object('ok', true, 'coins', purse);
end;
$$;


--
-- Name: admin_grant_premium(uuid, integer, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.admin_grant_premium(target uuid, days integer, reason text) RETURNS timestamp with time zone
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
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


--
-- Name: admin_health(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.admin_health() RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  result jsonb;
begin
  if not public.viewer_is_admin() then raise exception 'Только для админов'; end if;

  select jsonb_build_object(
    'freshUsers', (select count(*) from public.profiles where created_at > now() - interval '24 hours'),
    'reportsDay', (select count(*) from public.reports where created_at > now() - interval '24 hours'),
    'reportsWeek', (select count(*) from public.reports where created_at > now() - interval '7 days'),
    'removedDay', (select count(*) from public.posts where removed and removed_at > now() - interval '24 hours'),
    'punishDay', (select count(*) from public.punishments where created_at > now() - interval '24 hours'),
    'openReports', (select count(*) from public.reports where status = 'open'),
    'openAppeals', (select count(*) from public.appeals where status = 'open'),
    'silentMods', (
      select coalesce(jsonb_agg(jsonb_build_object('username', m.username, 'displayName', m.display_name)), '[]'::jsonb)
      from public.profiles m
      where m.is_moderator and not m.is_admin
        and not exists (
          select 1 from public.punishments p
          where p.actor_id = m.id and p.created_at > now() - interval '7 days'
        )
    ),
    'crowdedDevices', (
      select coalesce(jsonb_agg(row_to_json(d)), '[]'::jsonb) from (
        select device_id, count(distinct user_id) as people
        from public.device_users
        where last_seen > now() - interval '7 days'
        group by device_id
        having count(distinct user_id) >= 3
        order by count(distinct user_id) desc
        limit 5
      ) d
    ),
    'nightOwls', (
      select coalesce(jsonb_agg(jsonb_build_object('username', username, 'displayName', display_name)), '[]'::jsonb)
      from (
        select username, display_name from public.profiles
        where last_seen > now() - interval '12 hours'
          and extract(hour from (last_seen at time zone 'Europe/Moscow')) between 2 and 5
        order by last_seen desc
        limit 6
      ) owls
    ),
    'quietest', (
      select coalesce(jsonb_agg(jsonb_build_object('username', username, 'displayName', display_name, 'days', floor(extract(epoch from (now() - last_seen)) / 86400))), '[]'::jsonb)
      from (
        select username, display_name, last_seen from public.profiles
        where last_seen < now() - interval '14 days'
        order by last_seen asc
        limit 5
      ) sleepy
    )
  ) into result;

  return result;
end;
$$;


--
-- Name: admin_list_promos(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.admin_list_promos() RETURNS jsonb
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'id', p.id, 'code', p.code, 'rewardType', p.reward_type,
    'rewardAmount', p.reward_amount, 'rewardDays', p.reward_days,
    'maxUses', p.max_uses, 'usedCount', p.used_count,
    'expiresAt', p.expires_at, 'disabled', p.disabled,
    'createdAt', p.created_at
  ) ORDER BY p.created_at DESC), '[]'::jsonb)
  FROM public.promocodes p;
$$;


--
-- Name: admin_mod_team(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.admin_mod_team() RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
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


--
-- Name: admin_praise(uuid, text, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.admin_praise(target uuid, note text, purse integer DEFAULT 100) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  gift integer := least(500, greatest(0, coalesce(purse, 100)));
begin
  if not public.viewer_is_admin() then raise exception 'Только для админов'; end if;
  if target is null then raise exception 'Некого хвалить'; end if;
  perform set_config('spokum.privileged', 'on', true);
  update public.profiles set coins = coalesce(coins, 0) + gift where id = target;
  perform set_config('spokum.privileged', 'off', true);
  insert into public.coin_log (user_id, amount, reason) values (target, gift, 'Спасибо от администрации');
  perform public.notify_user(target, 'premium', 'Спасибо вам',
    coalesce(nullif(trim(note), ''), 'Администрация заметила, что с вами в сети спокойнее'),
    jsonb_build_object('coins', gift));
  return jsonb_build_object('ok', true, 'coins', gift);
end;
$$;


--
-- Name: admin_praise_pick(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.admin_praise_pick() RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  result jsonb;
begin
  if not public.viewer_is_admin() then raise exception 'Только для админов'; end if;
  select jsonb_build_object(
    'id', p.id,
    'username', p.username,
    'displayName', p.display_name,
    'avatar', p.avatar,
    'hue', p.hue,
    'posts', (select count(*) from public.posts x where x.author_id = p.id and not x.removed and x.created_at > now() - interval '7 days'),
    'answers', (select count(*) from public.comments c where c.author_id = p.id and not c.removed and c.created_at > now() - interval '7 days')
  ) into result
  from public.profiles p
  where p.banned_until is null
    and p.id <> auth.uid()
    and p.last_seen > now() - interval '7 days'
    and not exists (select 1 from public.punishments pun where pun.user_id = p.id and pun.created_at > now() - interval '30 days')
  order by random()
  limit 1;
  return coalesce(result, jsonb_build_object('id', null));
end;
$$;


--
-- Name: admin_quiet_call(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.admin_quiet_call(body text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
begin
  if not public.viewer_is_admin() then raise exception 'Только для админов'; end if;
  insert into public.announcements (title, body, tone, until, author_id)
  values ('Пять минут тишины',
    coalesce(nullif(trim(body), ''), 'Отложите телефон, посмотрите в окно и просто подышите. Мы никуда не убежим'),
    'info', now() + interval '2 hours', auth.uid());
  return jsonb_build_object('ok', true);
end;
$$;


--
-- Name: admin_rename(uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.admin_rename(target uuid, name text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
begin
  if not public.viewer_is_admin() then
    raise exception 'Нет прав';
  end if;
  perform set_config('spokum.privileged', 'on', true);
  update public.profiles set display_name = left(coalesce(name, ''), 40) where id = target;
  insert into public.audit (actor_id, action) values (auth.uid(), 'rename');
end;
$$;


--
-- Name: admin_reset_look(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.admin_reset_look(target uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
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


--
-- Name: admin_revert(bigint, boolean, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.admin_revert(target bigint, strike boolean, reason text) RETURNS integer
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
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


--
-- Name: admin_revoke_premium(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.admin_revoke_premium(target uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
begin
  if not public.viewer_is_admin() then raise exception 'Только для админов'; end if;

  perform set_config('spokum.privileged', 'on', true);

  update public.profiles
     set premium_until = null, premium_reason = '', premium_granted_at = null
   where id = target;

  perform public.log_action('admin.premium.revoke', jsonb_build_object('user', target));
end;
$$;


--
-- Name: admin_set_beta(uuid, boolean); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.admin_set_beta(target uuid, on_beta boolean) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
begin
  if not public.viewer_is_admin() then raise exception 'Только для админов'; end if;
  perform set_config('spokum.privileged', 'on', true);
  update public.profiles set is_beta = coalesce(on_beta, false) where id = target;
  perform public.log_action('admin.beta', jsonb_build_object('user', target, 'on', on_beta));
  return jsonb_build_object('ok', true);
end;
$$;


--
-- Name: admin_set_challenge(text, text, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.admin_set_challenge(p_title text, p_description text, p_reward integer DEFAULT 50) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE me uuid := auth.uid(); new_id bigint;
BEGIN
  SET LOCAL row_security = off;
  IF me IS NULL THEN RAISE EXCEPTION 'Нужен вход' USING ERRCODE = '401'; END IF;
  IF NOT public.viewer_is_admin() THEN RAISE EXCEPTION 'Только админ' USING ERRCODE = '403'; END IF;
  INSERT INTO public.daily_challenges (day, title, description, reward)
    VALUES (CURRENT_DATE, p_title, p_description, p_reward)
    ON CONFLICT (day) DO UPDATE SET title = EXCLUDED.title, description = EXCLUDED.description, reward = EXCLUDED.reward
    RETURNING id INTO new_id;
  RETURN jsonb_build_object('ok', true, 'id', new_id);
END;
$$;


--
-- Name: admin_set_flags(uuid, jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.admin_set_flags(target uuid, flags jsonb) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
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


--
-- Name: admin_set_rank(uuid, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.admin_set_rank(target uuid, rank integer) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
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


--
-- Name: admin_set_state(uuid, text, integer, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.admin_set_state(target uuid, action text, minutes integer, reason text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
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


--
-- Name: admin_stats(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.admin_stats() RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
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


--
-- Name: admin_toggle_promo(bigint, boolean); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.admin_toggle_promo(p_id bigint, p_disabled boolean) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE me uuid := auth.uid();
BEGIN
  IF me IS NULL THEN RAISE EXCEPTION 'Нужен вход' USING ERRCODE = '401'; END IF;
  IF NOT public.viewer_is_admin() THEN RAISE EXCEPTION 'Только админ' USING ERRCODE = '403'; END IF;
  UPDATE public.promocodes SET disabled = p_disabled WHERE id = p_id;
  RETURN jsonb_build_object('ok', true);
END;
$$;


--
-- Name: admin_users(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.admin_users(search text) RETURNS SETOF jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
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


--
-- Name: admin_wipe_posts(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.admin_wipe_posts(target uuid) RETURNS integer
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
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


--
-- Name: am_i_blocked(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.am_i_blocked(p_target uuid) RETURNS boolean
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
SELECT EXISTS (SELECT 1 FROM public.blocks WHERE blocker_id = p_target AND blocked_id = auth.uid());
$$;


--
-- Name: appeal_judge(bigint, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.appeal_judge(target bigint, verdict text, note text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  row public.appeals;
  punish public.punishments;
begin
  if not public.viewer_is_admin() then raise exception 'Только админ'; end if;
  select * into row from public.appeals where id = target;
  if row.id is null then raise exception 'Спор не найден'; end if;
  if row.status <> 'open' then raise exception 'Спор уже закрыт'; end if;
  select * into punish from public.punishments where id = row.punishment_id;

  if verdict = 'accept' then
    perform set_config('spokum.privileged', 'on', true);
    if punish.kind = 'ban' then
      update public.profiles set banned_until = null, ban_reason = '' where id = row.user_id;
    elsif punish.kind = 'mute' then
      update public.profiles set muted_until = null where id = row.user_id;
    end if;
    perform set_config('spokum.privileged', 'off', true);
    update public.punishments set reverted = true, reverted_by = auth.uid() where id = row.punishment_id;
    perform public.notify_user(row.user_id, 'punish', 'Наказание снято',
      coalesce(nullif(note, ''), 'Мы пересмотрели решение, всё в порядке'), jsonb_build_object('appeal', target));
  else
    perform public.notify_user(row.user_id, 'punish', 'Наказание оставлено',
      coalesce(nullif(note, ''), 'Мы посмотрели ещё раз и оставили решение'), jsonb_build_object('appeal', target));
  end if;

  update public.appeals
     set status = case when verdict = 'accept' then 'accepted' else 'kept' end,
         answer = coalesce(note, ''),
         judge_id = auth.uid(),
         closed_at = now()
   where id = target;

  return jsonb_build_object('ok', true);
end;
$$;


--
-- Name: appeal_queue(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.appeal_queue() RETURNS jsonb
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', a.id,
    'punishment', a.punishment_id,
    'kind', p.kind,
    'reason', p.reason,
    'minutes', p.minutes,
    'body', a.body,
    'status', a.status,
    'createdAt', a.created_at,
    'who', jsonb_build_object('id', u.id, 'username', u.username, 'displayName', u.display_name, 'avatar', u.avatar, 'hue', u.hue),
    'actor', jsonb_build_object('id', m.id, 'username', m.username, 'displayName', m.display_name)
  ) order by a.created_at desc), '[]'::jsonb)
  from public.appeals a
  join public.punishments p on p.id = a.punishment_id
  join public.profiles u on u.id = a.user_id
  left join public.profiles m on m.id = p.actor_id
  where public.viewer_is_moderator() and a.status = 'open';
$$;


--
-- Name: appeal_send(bigint, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.appeal_send(target bigint, body text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  row public.punishments;
begin
  if auth.uid() is null then raise exception 'Нужен вход'; end if;
  if length(coalesce(trim(body), '')) < 10 then raise exception 'Опишите подробнее, хотя бы десять символов'; end if;
  select * into row from public.punishments where id = target;
  if row.id is null or row.user_id <> auth.uid() then raise exception 'Это не ваше наказание'; end if;
  if row.created_at < now() - interval '30 days' then raise exception 'Спорить можно тридцать дней'; end if;
  if exists (select 1 from public.appeals where punishment_id = target) then
    raise exception 'Спор по этому наказанию уже отправлен';
  end if;
  insert into public.appeals (punishment_id, user_id, body) values (target, auth.uid(), body);
  perform public.notify_admins('modaction', 'Спор о наказании',
    'Пользователь просит пересмотреть решение', jsonb_build_object('punishment', target));
  return jsonb_build_object('ok', true);
end;
$$;


--
-- Name: block_user(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.block_user(p_target uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE me uuid := auth.uid();
BEGIN
  IF me IS NULL THEN RAISE EXCEPTION 'Нужен вход' USING ERRCODE = '401'; END IF;
  IF me = p_target THEN RAISE EXCEPTION 'Нельзя себя' USING ERRCODE = '400'; END IF;
  INSERT INTO public.blocks (blocker_id, blocked_id) VALUES (me, p_target)
    ON CONFLICT DO NOTHING;
  -- Удаляем контакты и лайки — блокировка полная
  DELETE FROM public.contacts WHERE user_id = me AND contact_id = p_target;
  DELETE FROM public.contacts WHERE user_id = p_target AND contact_id = me;
  PERFORM public.log_action('block.user', jsonb_build_object('target', p_target));
  RETURN jsonb_build_object('ok', true);
END;
$$;


--
-- Name: bot_bind(text, bigint, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.bot_bind(code text, tg bigint, tg_name text) RETURNS json
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
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


--
-- Name: bot_grant_premium(bigint, integer, integer, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.bot_grant_premium(tg bigint, days integer, stars integer, charge text) RETURNS json
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
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


--
-- Name: bot_stats(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.bot_stats() RETURNS json
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
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


--
-- Name: bot_unbind(bigint); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.bot_unbind(tg bigint) RETURNS void
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  delete from public.tg_links where tg_id = tg;
$$;


--
-- Name: bot_whoami(bigint); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.bot_whoami(tg bigint) RETURNS json
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select json_build_object(
    'username', p.username,
    'name', p.display_name,
    'premium_until', p.premium_until
  )
  from public.tg_links l join public.profiles p on p.id = l.user_id
  where l.tg_id = tg;
$$;


--
-- Name: breathe_in(integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.breathe_in(minutes integer) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  together integer;
begin
  if auth.uid() is null then return jsonb_build_object('together', 0); end if;
  delete from public.breaths where started_at < now() - interval '10 minutes';
  insert into public.breaths (user_id, started_at, minutes)
  values (auth.uid(), now(), coalesce(minutes, 0))
  on conflict (user_id) do update set started_at = now(), minutes = excluded.minutes;
  select count(*) into together from public.breaths where started_at > now() - interval '4 minutes';
  return jsonb_build_object('together', together);
end;
$$;


--
-- Name: breathe_out(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.breathe_out() RETURNS void
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  delete from public.breaths where user_id = auth.uid();
$$;


--
-- Name: bump_daily_quest(text, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.bump_daily_quest(p_quest_key text, p_amount integer DEFAULT 1) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE me uuid := auth.uid();
BEGIN
  SET LOCAL row_security = off;
  IF me IS NULL THEN RETURN; END IF;
  UPDATE public.daily_quests
    SET progress = LEAST(target, progress + p_amount),
        completed = (progress + p_amount >= target)
    WHERE user_id = me
      AND quest_type = 'daily'
      AND day = CURRENT_DATE
      AND quest_key = p_quest_key
      AND NOT claimed;
  UPDATE public.daily_quests
    SET progress = LEAST(target, progress + p_amount),
        completed = (progress + p_amount >= target)
    WHERE user_id = me
      AND quest_type = 'weekly'
      AND week_start = public.start_of_week(CURRENT_DATE)
      AND quest_key = p_quest_key
      AND NOT claimed;
END;
$$;


--
-- Name: bump_post_views(bigint); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.bump_post_views(target bigint) RETURNS void
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  update public.posts set views = views + 1 where id = target;
$$;


--
-- Name: buy_gift(text, uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.buy_gift(gift text, target uuid, note text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  kind public.gift_types;
  purse integer;
  fresh bigint;
  who text;
  room bigint;
begin
  if not public.viewer_can_write() then raise exception 'Сейчас нельзя'; end if;
  select * into kind from public.gift_types where id = gift;
  if kind.id is null then raise exception 'Подарок не найден'; end if;
  if coalesce(kind.price, 0) <= 0 then raise exception 'Этот подарок не продаётся: его выдают за событие'; end if;
  if not exists (select 1 from public.profiles where id = target) then raise exception 'Человек не найден'; end if;

  select coins into purse from public.profiles where id = auth.uid();
  if purse < kind.price then raise exception 'Не хватает монет: нужно % , у вас %', kind.price, purse; end if;

  perform set_config('spokum.privileged', 'on', true);
  update public.profiles set coins = coins - kind.price where id = auth.uid();
  insert into public.coin_log (user_id, amount, reason) values (auth.uid(), -kind.price, 'Подарок ' || kind.title);

  insert into public.gifts (type_id, owner_id, from_id, note)
  values (gift, target, auth.uid(), left(coalesce(note, ''), 200))
  returning id into fresh;

  select display_name into who from public.profiles where id = auth.uid();
  if target <> auth.uid() then
    perform public.notify_user(target, 'gift', 'Вам подарок',
      coalesce(who, 'Кто-то') || ' дарит вам: ' || kind.title,
      jsonb_build_object('gift', fresh, 'from', auth.uid()));

    select c.id into room
      from public.chats c
      join public.chat_members a on a.chat_id = c.id and a.user_id = auth.uid()
      join public.chat_members b on b.chat_id = c.id and b.user_id = target
     where c.kind = 'dm'
     limit 1;

    if room is null then
      insert into public.chats (kind, owner_id) values ('dm', auth.uid()) returning id into room;
      insert into public.chat_members (chat_id, user_id, role) values (room, auth.uid(), 'owner'), (room, target, 'member');
    end if;

    insert into public.messages (chat_id, author_id, kind, body)
    values (room, auth.uid(), 'gift',
      coalesce(who, 'Кто-то') || ' дарит вам ' || kind.title ||
      case when coalesce(trim(note), '') <> '' then '. ' || left(trim(note), 200) else '' end);
  end if;

  return jsonb_build_object('ok', true, 'gift', fresh, 'coins', purse - kind.price);
end;
$$;


--
-- Name: campfire_join(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.campfire_join() RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  words text[] := array['Ветер','Туман','Ветка','Камень','Иней','Свет','Тень','Роса','Пепел','Искра','Тихий','Дальний','Ночной','Снежный','Лесной','Серый','Мятный','Синий'];
  room bigint;
  mine text;
begin
  if not public.viewer_can_write() then raise exception 'Сейчас нельзя'; end if;

  delete from public.campfire_messages where created_at < now() - interval '1 hour';
  delete from public.campfire_rooms where closes_at < now();

  select r.id into mine from public.campfire_seats s join public.campfire_rooms r on r.id = s.room_id
   where s.user_id = auth.uid() and r.closes_at > now() limit 1;
  if mine is not null then
    select room_id, alias into room, mine from public.campfire_seats where user_id = auth.uid() and room_id = mine::bigint;
    return jsonb_build_object('room', room, 'alias', mine);
  end if;

  select r.id into room from public.campfire_rooms r
   where r.closes_at > now()
     and (select count(*) from public.campfire_seats s where s.room_id = r.id) < 10
   order by r.created_at limit 1;

  if room is null then
    insert into public.campfire_rooms default values returning id into room;
  end if;

  mine := words[1 + floor(random() * array_length(words, 1))::int] || ' ' ||
          words[1 + floor(random() * array_length(words, 1))::int];

  insert into public.campfire_seats (room_id, user_id, alias)
  values (room, auth.uid(), mine)
  on conflict (room_id, user_id) do update set joined_at = now()
  returning alias into mine;

  return jsonb_build_object('room', room, 'alias', mine);
end;
$$;


--
-- Name: campfire_leave(bigint); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.campfire_leave(room bigint) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
begin
  delete from public.campfire_seats where room_id = room and user_id = auth.uid();
end;
$$;


--
-- Name: campfire_read(bigint, bigint); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.campfire_read(room bigint, after bigint DEFAULT 0) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  mine text;
  result jsonb;
begin
  select alias into mine from public.campfire_seats where room_id = room and user_id = auth.uid();
  if mine is null then raise exception 'Вы не у этого костра'; end if;

  select jsonb_build_object(
    'alias', mine,
    'people', (select count(*) from public.campfire_seats where room_id = room),
    'closesAt', (select closes_at from public.campfire_rooms where id = room),
    'messages', coalesce((
      select jsonb_agg(jsonb_build_object('id', m.id, 'alias', m.alias, 'body', m.body, 'createdAt', m.created_at, 'mine', m.alias = mine) order by m.id)
        from (select * from public.campfire_messages where room_id = room and id > coalesce(after, 0) order by id desc limit 80) m
    ), '[]'::jsonb)
  ) into result;
  return result;
end;
$$;


--
-- Name: campfire_say(bigint, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.campfire_say(room bigint, body text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  mine text;
begin
  if not public.viewer_can_write() then raise exception 'Сейчас нельзя'; end if;
  if coalesce(trim(body), '') = '' then raise exception 'Пустое сообщение'; end if;
  select alias into mine from public.campfire_seats where room_id = room and user_id = auth.uid();
  if mine is null then raise exception 'Вы не у этого костра'; end if;
  if (select closes_at from public.campfire_rooms where id = room) < now() then raise exception 'Костёр погас'; end if;

  insert into public.campfire_messages (room_id, author_id, alias, body)
  values (room, auth.uid(), mine, left(body, 600));
  return jsonb_build_object('ok', true);
end;
$$;


--
-- Name: can_spin_today(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.can_spin_today() RETURNS boolean
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT NOT EXISTS(SELECT 1 FROM public.daily_spins WHERE user_id = auth.uid() AND day = CURRENT_DATE);
$$;


--
-- Name: capsule_add(text, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.capsule_add(body text, days integer) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  fresh bigint;
  waiting integer;
begin
  if not public.viewer_can_write() then raise exception 'Сейчас нельзя'; end if;
  if coalesce(trim(body), '') = '' then raise exception 'Пустое письмо'; end if;
  if days < 1 or days > 1825 then raise exception 'Срок от одного дня до пяти лет'; end if;

  select count(*) into waiting from public.capsules where user_id = auth.uid() and opened_at is null;
  if waiting >= 20 then raise exception 'Больше двадцати капсул сразу нельзя'; end if;

  insert into public.capsules (user_id, body, open_at)
  values (auth.uid(), left(body, 4000), now() + make_interval(days => days))
  returning id into fresh;
  return jsonb_build_object('ok', true, 'capsule', fresh);
end;
$$;


--
-- Name: capsule_check(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.capsule_check() RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  ready integer;
begin
  if auth.uid() is null then return jsonb_build_object('ready', 0); end if;
  select count(*) into ready from public.capsules
   where user_id = auth.uid() and opened_at is null and open_at <= now();

  if ready > 0 then
    update public.capsules set opened_at = now()
     where user_id = auth.uid() and opened_at is null and open_at <= now();
    perform public.notify_user(auth.uid(), 'capsule', 'Капсула времени открылась',
      'Вы писали это себе. Пора прочитать', jsonb_build_object('count', ready));
  end if;
  return jsonb_build_object('ready', ready);
end;
$$;


--
-- Name: chat_reactions(bigint); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.chat_reactions(room bigint) RETURNS jsonb
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select coalesce(jsonb_object_agg(message_id, rows), '{}'::jsonb) from (
    select r.message_id, jsonb_agg(jsonb_build_object('glyph', r.glyph, 'user', r.user_id)) as rows
    from public.message_reactions r
    join public.messages m on m.id = r.message_id
    where m.chat_id = room
      and exists (select 1 from public.chat_members cm where cm.chat_id = room and cm.user_id = auth.uid())
    group by r.message_id
  ) grouped;
$$;


--
-- Name: chat_role(bigint); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.chat_role(target_chat bigint) RETURNS text
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select role from public.chat_members where chat_id = target_chat and user_id = auth.uid();
$$;


--
-- Name: claim_daily_quest(bigint); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.claim_daily_quest(p_id bigint) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE me uuid := auth.uid(); q public.daily_quests%ROWTYPE;
BEGIN
  SET LOCAL row_security = off;
  SET LOCAL spokum.privileged = on;
  IF me IS NULL THEN RAISE EXCEPTION 'Нужен вход' USING ERRCODE = '401'; END IF;
  SELECT * INTO q FROM public.daily_quests WHERE id = p_id AND user_id = me;
  IF NOT FOUND THEN RAISE EXCEPTION 'Задание не найдено' USING ERRCODE = '404'; END IF;
  IF NOT q.completed THEN RAISE EXCEPTION 'Задание ещё не выполнено' USING ERRCODE = '400'; END IF;
  IF q.claimed THEN RAISE EXCEPTION 'Награда уже получена' USING ERRCODE = '409'; END IF;
  UPDATE public.daily_quests SET claimed = true WHERE id = p_id;
  UPDATE public.profiles SET coins = coins + q.reward WHERE id = me;
  INSERT INTO public.coin_log (user_id, amount, reason) VALUES (me, q.reward, 'Ежедневное задание');
  PERFORM public.log_action('quest.claim', jsonb_build_object('id', p_id, 'reward', q.reward));
  RETURN jsonb_build_object('ok', true, 'reward', q.reward);
END;
$$;


--
-- Name: clear_notifications(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.clear_notifications() RETURNS void
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  delete from public.notifications where user_id = auth.uid();
$$;


--
-- Name: complete_today_challenge(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.complete_today_challenge() RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE me uuid := auth.uid(); dc public.daily_challenges%ROWTYPE; already boolean;
BEGIN
  SET LOCAL row_security = off;
  SET LOCAL spokum.privileged = on;
  IF me IS NULL THEN RAISE EXCEPTION 'Нужен вход' USING ERRCODE = '401'; END IF;
  SELECT * INTO dc FROM public.daily_challenges WHERE day = CURRENT_DATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Челленджа сегодня нет' USING ERRCODE = '404'; END IF;
  SELECT EXISTS(SELECT 1 FROM public.daily_challenge_completions WHERE user_id = me AND challenge_id = dc.id) INTO already;
  IF already THEN RAISE EXCEPTION 'Вы уже выполнили челлендж' USING ERRCODE = '409'; END IF;
  INSERT INTO public.daily_challenge_completions (user_id, challenge_id) VALUES (me, dc.id);
  UPDATE public.profiles SET coins = coins + dc.reward WHERE id = me;
  INSERT INTO public.coin_log (user_id, amount, reason) VALUES (me, dc.reward, 'Челлендж дня');
  RETURN jsonb_build_object('ok', true, 'reward', dc.reward);
END;
$$;


--
-- Name: confessions_list(integer, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.confessions_list(p_limit integer DEFAULT 30, p_offset integer DEFAULT 0) RETURNS jsonb
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'id', c.id, 'body', c.body, 'mood', c.mood, 'createdAt', c.created_at,
    'canDelete', (c.author_id = auth.uid())
  ) ORDER BY c.created_at DESC), '[]'::jsonb)
  FROM public.confessions c
  WHERE NOT c.removed
  LIMIT GREATEST(1, LEAST(p_limit, 100))
  OFFSET GREATEST(0, p_offset);
$$;


--
-- Name: create_group(text, text, boolean); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.create_group(p_name text, p_description text DEFAULT ''::text, p_is_private boolean DEFAULT false) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE me uuid := auth.uid(); new_id bigint; slug text;
BEGIN
  SET LOCAL row_security = off;
  IF me IS NULL THEN RAISE EXCEPTION 'Нужен вход' USING ERRCODE = '401'; END IF;
  IF length(p_name) < 2 OR length(p_name) > 50 THEN RAISE EXCEPTION 'Название 2-50 символов' USING ERRCODE = '400'; END IF;
  slug := lower(regexp_replace(p_name, '[^a-zA-Z0-9а-яё]+', '-', 'g'));
  slug := trim(both '-' from slug);
  IF length(slug) < 2 THEN slug := 'group-' || extract(epoch from now())::bigint; END IF;
  INSERT INTO public.groups (name, slug, description, owner_id, is_private) VALUES (p_name, slug, p_description, me, p_is_private) RETURNING id INTO new_id;
  INSERT INTO public.group_members (group_id, user_id, role) VALUES (new_id, me, 'owner');
  RETURN jsonb_build_object('ok', true, 'id', new_id, 'slug', slug);
END;
$$;


--
-- Name: delete_comment(bigint, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.delete_comment(target bigint, reason text DEFAULT NULL::text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  row public.comments;
  post_author uuid;
  who text;
begin
  select * into row from public.comments where id = target;
  if row.id is null then raise exception 'Комментарий не найден'; end if;
  select author_id into post_author from public.posts where id = row.post_id;

  if row.author_id = auth.uid() or post_author = auth.uid() then
    delete from public.comments where id = target;
    return jsonb_build_object('ok', true, 'mode', 'deleted');
  end if;

  if not public.viewer_is_moderator() then raise exception 'Это не ваш комментарий'; end if;
  if coalesce(trim(reason), '') = '' then raise exception 'Нужна причина'; end if;

  update public.comments
     set removed = true, removed_by = auth.uid(), removed_reason = reason
   where id = target;

  insert into public.punishments (actor_id, user_id, kind, reason, post_id)
  values (auth.uid(), row.author_id, 'comment_removed', reason, row.post_id);

  perform public.notify_user(row.author_id, 'removed', 'Ваш комментарий снят', reason,
    jsonb_build_object('post', row.post_id));

  select display_name into who from public.profiles where id = auth.uid();
  perform public.notify_admins('modaction', 'Модератор снял комментарий',
    coalesce(who, 'Модератор') || ': ' || reason,
    jsonb_build_object('comment', target), auth.uid());

  perform public.log_action('comment.remove', jsonb_build_object('comment', target, 'reason', reason));
  return jsonb_build_object('ok', true, 'mode', 'removed');
end;
$$;


--
-- Name: delete_confession(bigint); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.delete_confession(p_id bigint) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE me uuid := auth.uid();
BEGIN
  IF me IS NULL THEN RAISE EXCEPTION 'Нужен вход' USING ERRCODE = '401'; END IF;
  DELETE FROM public.confessions WHERE id = p_id AND author_id = me;
  RETURN jsonb_build_object('ok', true);
END;
$$;


--
-- Name: delete_my_comment(bigint); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.delete_my_comment(p_id bigint) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE me uuid := auth.uid(); owner uuid;
BEGIN
  IF me IS NULL THEN RAISE EXCEPTION 'Нужен вход' USING ERRCODE = '401'; END IF;
  SELECT author_id INTO owner FROM public.comments WHERE id = p_id;
  IF owner IS NULL THEN RAISE EXCEPTION 'Комментарий не найден' USING ERRCODE = '404'; END IF;
  IF owner <> me THEN RAISE EXCEPTION 'Можно удалять только свои' USING ERRCODE = '403'; END IF;
  UPDATE public.comments SET removed = true, removed_reason = 'author', removed_auto = true WHERE id = p_id;
  RETURN jsonb_build_object('ok', true);
END;
$$;


--
-- Name: delete_my_message(bigint); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.delete_my_message(p_id bigint) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE me uuid := auth.uid(); owner uuid;
BEGIN
  IF me IS NULL THEN RAISE EXCEPTION 'Нужен вход' USING ERRCODE = '401'; END IF;
  SELECT author_id INTO owner FROM public.messages WHERE id = p_id;
  IF owner IS NULL THEN RAISE EXCEPTION 'Сообщение не найдено' USING ERRCODE = '404'; END IF;
  IF owner <> me THEN RAISE EXCEPTION 'Можно удалять только свои' USING ERRCODE = '403'; END IF;
  UPDATE public.messages SET removed = true WHERE id = p_id;
  RETURN jsonb_build_object('ok', true);
END;
$$;


--
-- Name: device_ban_state(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.device_ban_state(fp text) RETURNS jsonb
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
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


--
-- Name: disable_pin_code(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.disable_pin_code() RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE me uuid := auth.uid();
BEGIN
  SET LOCAL row_security = off;
  SET LOCAL spokum.privileged = on;
  IF me IS NULL THEN RAISE EXCEPTION 'Нужен вход' USING ERRCODE = '401'; END IF;
  UPDATE public.profiles SET pin_code = NULL WHERE id = me;
  RETURN jsonb_build_object('ok', true);
END;
$$;


--
-- Name: drop_username(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.drop_username(target text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
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


--
-- Name: event_claim(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.event_claim() RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
begin
  raise exception 'Событие закончилось';
end;
$$;


--
-- Name: event_state(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.event_state() RETURNS jsonb
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select jsonb_build_object('active', false, 'id', 'summer26');
$$;


--
-- Name: feed_reels(integer, bigint[]); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.feed_reels(size integer DEFAULT 12, seen bigint[] DEFAULT '{}'::bigint[]) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  result jsonb;
  want integer := least(30, greatest(4, coalesce(size, 12)));
begin
  select coalesce(jsonb_agg(id order by rank), '[]'::jsonb) into result
  from (
    select p.id,
      row_number() over (
        partition by p.author_id
        order by (p.created_at > now() - interval '3 days') desc, random()
      ) * 100
      + case when p.author_id = auth.uid() then 40 else 0 end
      - least(30, p.views / 10)
      + (random() * 12)::int as rank
    from public.posts p
    where not p.removed
      and (p.kind in ('video', 'album') or p.video is not null)
      and not (p.id = any(coalesce(seen, '{}')))
    order by rank
    limit want
  ) rows;
  return result;
end;
$$;


--
-- Name: find_by_username(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.find_by_username(needle text) RETURNS SETOF uuid
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select distinct user_id from public.usernames
   where username ilike '%' || lower(regexp_replace(coalesce(needle, ''), '^@', '')) || '%'
   limit 40;
$$;


--
-- Name: follow(uuid, boolean); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.follow(target uuid, on_follow boolean) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  who text;
begin
  if not public.viewer_can_write() then raise exception 'Сейчас нельзя'; end if;
  if target = auth.uid() then raise exception 'На себя подписаться нельзя'; end if;

  if on_follow then
    insert into public.follows (follower_id, target_id) values (auth.uid(), target) on conflict do nothing;
    select display_name into who from public.profiles where id = auth.uid();
    perform public.notify_user(target, 'newpost', 'На вас подписались',
      coalesce(who, 'Кто-то') || ' теперь читает вас', jsonb_build_object('user', auth.uid()));
  else
    delete from public.follows where follower_id = auth.uid() and target_id = target;
  end if;

  return jsonb_build_object(
    'following', on_follow,
    'followers', (select count(*) from public.follows where target_id = target)
  );
end;
$$;


--
-- Name: follow_state(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.follow_state(target uuid) RETURNS jsonb
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select jsonb_build_object(
    'following', exists (select 1 from public.follows where follower_id = auth.uid() and target_id = target),
    'followers', (select count(*) from public.follows where target_id = target),
    'following_count', (select count(*) from public.follows where follower_id = target)
  );
$$;


--
-- Name: get_pixel_info(bigint, integer, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_pixel_info(p_battle_id bigint, p_x integer, p_y integer) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE
  cell record;
BEGIN
  SELECT pc.color, pc.placed_at, p.username, p.display_name, p.avatar, p.hue
    INTO cell
    FROM public.pixel_cells pc
    LEFT JOIN public.profiles p ON p.id = pc.user_id
    WHERE pc.battle_id = p_battle_id AND pc.x = p_x AND pc.y = p_y;
  IF NOT FOUND THEN RETURN jsonb_build_object('empty', true); END IF;
  RETURN jsonb_build_object(
    'color', cell.color,
    'username', cell.username,
    'displayName', cell.display_name,
    'avatar', cell.avatar,
    'hue', cell.hue,
    'placedAt', cell.placed_at
  );
END;
$$;


--
-- Name: get_wishlist(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_wishlist(p_user_id uuid) RETURNS jsonb
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'id', w.id, 'title', w.title, 'link', w.link,
    'grantedBy', w.granted_by, 'grantedAt', w.granted_at,
    'createdAt', w.created_at,
    'canDelete', (w.user_id = auth.uid())
  ) ORDER BY w.created_at DESC), '[]'::jsonb)
  FROM public.wishlist w WHERE w.user_id = p_user_id;
$$;


--
-- Name: grant_coins(integer, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.grant_coins(amount integer, reason text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  today integer;
  give integer;
  total integer;
begin
  if auth.uid() is null then raise exception 'Нужен вход'; end if;
  give := least(greatest(coalesce(amount, 0), 0), 40);
  if give = 0 then return jsonb_build_object('added', 0); end if;

  select coalesce(sum(l.amount), 0) into today
    from public.coin_log l
   where l.user_id = auth.uid() and l.amount > 0 and l.created_at > now() - interval '24 hours';

  give := least(give, greatest(0, 300 - today));
  if give = 0 then
    select coins into total from public.profiles where id = auth.uid();
    return jsonb_build_object('added', 0, 'coins', total, 'limit', true);
  end if;

  perform set_config('spokum.privileged', 'on', true);
  update public.profiles set coins = coins + give where id = auth.uid() returning coins into total;
  insert into public.coin_log (user_id, amount, reason) values (auth.uid(), give, coalesce(reason, ''));
  return jsonb_build_object('added', give, 'coins', total);
end;
$$;


--
-- Name: gratitude_add(text, boolean); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.gratitude_add(p_body text, p_anonymous boolean DEFAULT false) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  me uuid := auth.uid();
  row public.gratitude_entries;
BEGIN
  IF me IS NULL THEN RAISE EXCEPTION 'Нужен вход' USING ERRCODE = '401';
  END IF;
  IF NOT public.viewer_can_write() THEN RAISE EXCEPTION 'Нельзя писать' USING ERRCODE = '403'; END IF;
  IF length(p_body) < 1 OR length(p_body) > 500 THEN
    RAISE EXCEPTION 'Текст 1-500 символов' USING ERRCODE = '400';
  END IF;
  INSERT INTO public.gratitude_entries (author_id, body, anonymous)
    VALUES (me, p_body, p_anonymous) RETURNING * INTO row;
  PERFORM public.log_action('gratitude.add', jsonb_build_object('id', row.id));
  RETURN jsonb_build_object('ok', true, 'id', row.id);
END;
$$;


--
-- Name: gratitude_list(integer, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.gratitude_list(p_limit integer DEFAULT 30, p_offset integer DEFAULT 0) RETURNS jsonb
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'id', g.id,
    'body', g.body,
    'anonymous', g.anonymous,
    'author', CASE WHEN g.anonymous THEN null ELSE
      jsonb_build_object('id', p.id, 'username', p.username, 'display_name', p.display_name, 'avatar', p.avatar, 'hue', p.hue, 'is_verified', p.is_verified, 'is_admin', p.is_admin, 'is_moderator', p.is_moderator)
    END,
    'createdAt', g.created_at
  ) ORDER BY g.created_at DESC), '[]'::jsonb)
  FROM public.gratitude_entries g
  LEFT JOIN public.profiles p ON p.id = g.author_id
  LIMIT GREATEST(1, LEAST(p_limit, 100))
  OFFSET GREATEST(0, p_offset);
$$;


--
-- Name: guard_comments(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.guard_comments() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  verdict jsonb;
begin
  if public.viewer_is_moderator() then return new; end if;
  verdict := public.guard_look('comment', coalesce(new.body, ''), new.author_id);
  perform set_config('spokum.guard', verdict::text, true);
  if (verdict->>'hide')::boolean then
    new.removed := true;
    new.removed_by := null;
    new.removed_auto := true;
    new.removed_reason := public.guard_reason(verdict);
  end if;
  return new;
end;
$$;


--
-- Name: guard_comments_note(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.guard_comments_note() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  verdict jsonb;
  score integer;
begin
  begin
    verdict := nullif(current_setting('spokum.guard', true), '')::jsonb;
  exception when others then verdict := null;
  end;
  if verdict is null then return new; end if;
  score := coalesce((verdict->>'score')::integer, 0);
  if score <= 0 then return new; end if;

  insert into public.guard_hits (target_kind, target_id, user_id, score, verdict, action, body)
  values ('comment', new.id, new.author_id, score, verdict,
          case when new.removed_auto then 'hidden' else 'flagged' end,
          left(coalesce(new.body, ''), 400));

  if new.removed_auto then
    perform public.notify_user(new.author_id, 'removed', 'Комментарий скрыт автоматически',
      new.removed_reason || '. Модератор посмотрит и вернёт, если это ошибка',
      jsonb_build_object('post', new.post_id, 'auto', true));
    perform public.notify_staff('report', 'Автофильтр скрыл комментарий',
      left(coalesce(new.body, ''), 90), jsonb_build_object('comment', new.id, 'auto', true), new.author_id);
  end if;
  return new;
end;
$$;


--
-- Name: guard_config_read(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.guard_config_read() RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  cfg public.guard_config;
begin
  if not public.viewer_is_moderator() then raise exception 'Только для модераторов'; end if;
  select * into cfg from public.guard_config where id = 1;
  return jsonb_build_object('live', cfg.live, 'hide_at', cfg.hide_at, 'mass_at', cfg.mass_at,
    'watch_links', cfg.watch_links, 'watch_caps', cfg.watch_caps, 'watch_flood', cfg.watch_flood);
end;
$$;


--
-- Name: guard_config_write(jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.guard_config_write(patch jsonb) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
begin
  if not public.viewer_is_admin() then raise exception 'Только для админа'; end if;
  update public.guard_config set
    live = coalesce((patch->>'live')::boolean, live),
    hide_at = least(20, greatest(1, coalesce((patch->>'hide_at')::integer, hide_at))),
    mass_at = least(50, greatest(2, coalesce((patch->>'mass_at')::integer, mass_at))),
    watch_links = coalesce((patch->>'watch_links')::boolean, watch_links),
    watch_caps = coalesce((patch->>'watch_caps')::boolean, watch_caps),
    watch_flood = coalesce((patch->>'watch_flood')::boolean, watch_flood)
  where id = 1;
  perform public.log_action('guard.config', patch);
  return public.guard_config_read();
end;
$$;


--
-- Name: guard_fresh_author(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.guard_fresh_author() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  born timestamptz;
  made integer;
begin
  select created_at into born from public.profiles where id = new.author_id;
  if born is null or born < now() - interval '24 hours' then return new; end if;
  select count(*) into made from public.posts
   where author_id = new.author_id and created_at > now() - interval '1 hour';
  if made >= 8 then
    raise exception 'Первые сутки можно не больше восьми записей в час. Так мы держим спам подальше';
  end if;
  return new;
end;
$$;


--
-- Name: guard_keep(bigint); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.guard_keep(target bigint) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
begin
  if not public.viewer_is_moderator() then raise exception 'Только для модераторов'; end if;
  update public.guard_hits set kept = true where id = target and not undone;
  if not found then raise exception 'Запись не найдена'; end if;
  perform public.log_action('guard.keep', jsonb_build_object('hit', target));
  return jsonb_build_object('ok', true);
end;
$$;


--
-- Name: guard_look(text, text, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.guard_look(kind text, src text, author uuid) RETURNS jsonb
    LANGUAGE plpgsql STABLE
    SET search_path TO 'public'
    AS $$
declare
  cfg public.guard_config;
  found jsonb;
  total integer;
  notes text[] := '{}';
  born timestamptz;
  links integer;
  letters integer;
  caps integer;
  recent integer;
begin
  select * into cfg from public.guard_config where id = 1;
  if cfg.id is null or not cfg.live then
    return jsonb_build_object('score', 0, 'hits', '[]'::jsonb, 'notes', notes, 'hide', false);
  end if;

  found := public.guard_scan(src);
  total := (found->>'score')::integer;

  if jsonb_array_length(found->'hits') > 0 then
    if (found->'kinds') ? 'threat' then notes := notes || 'угроза'::text;
    elsif (found->'kinds') ? 'insult' then notes := notes || 'оскорбление'::text;
    elsif (found->'kinds') ? 'spam' then notes := notes || 'спам'::text;
    else notes := notes || 'запрещённые слова'::text;
    end if;
  end if;

  select created_at into born from public.profiles where id = author;

  if cfg.watch_links then
    select count(*) into links from regexp_matches(lower(coalesce(src, '')),
      '(https?://|t\.me/|www\.|vk\.com|telegram\.|@[a-z0-9_]{5,})', 'g');
    if links > 0 and born is not null and born > now() - interval '7 days' then
      total := total + 3;
      notes := notes || 'ссылки с нового аккаунта'::text;
    elsif links >= 3 then
      total := total + 2;
      notes := notes || 'много ссылок'::text;
    end if;
  end if;

  if cfg.watch_caps and length(coalesce(src, '')) > 40 then
    letters := length(regexp_replace(coalesce(src, ''), '[^А-Яа-яA-Za-zЁё]', '', 'g'));
    caps := length(regexp_replace(coalesce(src, ''), '[^А-ЯA-ZЁ]', '', 'g'));
    if letters > 0 and caps::numeric / letters > 0.75 then
      total := total + 1;
      notes := notes || 'сплошные заглавные'::text;
    end if;
  end if;

  if cfg.watch_flood and author is not null then
    if kind = 'post' then
      select count(*) into recent from public.posts
       where author_id = author and created_at > now() - interval '3 minutes';
      if exists (select 1 from public.posts
                  where author_id = author and created_at > now() - interval '1 hour'
                    and public.guard_norm(body) = public.guard_norm(src)
                    and public.guard_norm(src) <> '') then
        total := total + 3;
        notes := notes || 'повтор того же текста'::text;
      end if;
    else
      select count(*) into recent from public.comments
       where author_id = author and created_at > now() - interval '3 minutes';
      if exists (select 1 from public.comments
                  where author_id = author and created_at > now() - interval '1 hour'
                    and public.guard_norm(body) = public.guard_norm(src)
                    and public.guard_norm(src) <> '') then
        total := total + 3;
        notes := notes || 'повтор того же текста'::text;
      end if;
    end if;
    if recent >= 6 then
      total := total + 2;
      notes := notes || 'слишком часто'::text;
    end if;
  end if;

  return jsonb_build_object(
    'score', total,
    'hits', found->'hits',
    'kinds', found->'kinds',
    'notes', notes,
    'hide', total >= cfg.hide_at);
end;
$$;


--
-- Name: guard_mass(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.guard_mass() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  cfg public.guard_config;
  many integer;
  target bigint;
  author uuid;
  text_body text;
begin
  select * into cfg from public.guard_config where id = 1;
  if cfg.id is null or not cfg.live then return new; end if;
  if new.target_kind not in ('post', 'comment') then return new; end if;

  begin
    target := new.target_id::bigint;
  exception when others then return new;
  end;

  select count(distinct reporter_id) into many from public.reports
   where target_kind = new.target_kind and target_id = new.target_id
     and created_at > now() - interval '24 hours';
  if many < cfg.mass_at then return new; end if;

  if new.target_kind = 'post' then
    select author_id, left(body, 400) into author, text_body from public.posts
     where id = target and not removed;
    if author is null then return new; end if;
    update public.posts
       set removed = true, removed_by = null, removed_auto = true, removed_at = now(),
           removed_reason = 'Автофильтр: много жалоб'
     where id = target;
    perform public.notify_user(author, 'removed', 'Запись скрыта до проверки',
      'На неё пожаловались несколько человек. Модератор посмотрит и вернёт, если это ошибка',
      jsonb_build_object('post', target, 'auto', true));
  else
    select author_id, left(body, 400) into author, text_body from public.comments
     where id = target and not removed;
    if author is null then return new; end if;
    update public.comments
       set removed = true, removed_by = null, removed_auto = true,
           removed_reason = 'Автофильтр: много жалоб'
     where id = target;
    perform public.notify_user(author, 'removed', 'Комментарий скрыт до проверки',
      'На него пожаловались несколько человек. Модератор посмотрит и вернёт, если это ошибка',
      jsonb_build_object('comment', target, 'auto', true));
  end if;

  insert into public.guard_hits (target_kind, target_id, user_id, score, verdict, action, body)
  values (new.target_kind, target, author, many,
          jsonb_build_object('notes', jsonb_build_array('много жалоб'), 'reports', many),
          'mass', coalesce(text_body, ''));

  perform public.notify_staff('report', 'Автофильтр скрыл по жалобам',
    many || ' жалобы на одну запись', jsonb_build_object('target', target, 'auto', true), null);
  return new;
end;
$$;


--
-- Name: guard_norm(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.guard_norm(src text) RETURNS text
    LANGUAGE sql IMMUTABLE
    AS $$
  select trim(regexp_replace(
    regexp_replace(
      regexp_replace(
        translate(lower(coalesce(src, '')), 'abcehkmoptuxy0346@ё', 'авсенкмортихуозчбае'),
        '[^а-я ]+', ' ', 'g'),
      '(.)\1+', '\1', 'g'),
    ' +', ' ', 'g'));
$$;


--
-- Name: guard_posts(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.guard_posts() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  verdict jsonb;
begin
  if public.viewer_is_moderator() then return new; end if;
  verdict := public.guard_look('post', coalesce(new.body, ''), new.author_id);
  perform set_config('spokum.guard', verdict::text, true);
  if (verdict->>'hide')::boolean then
    new.removed := true;
    new.removed_by := null;
    new.removed_auto := true;
    new.removed_reason := public.guard_reason(verdict);
    new.removed_at := now();
  end if;
  return new;
end;
$$;


--
-- Name: guard_posts_note(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.guard_posts_note() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  verdict jsonb;
  score integer;
begin
  begin
    verdict := nullif(current_setting('spokum.guard', true), '')::jsonb;
  exception when others then verdict := null;
  end;
  if verdict is null then return new; end if;
  score := coalesce((verdict->>'score')::integer, 0);
  if score <= 0 then return new; end if;

  insert into public.guard_hits (target_kind, target_id, user_id, score, verdict, action, body)
  values ('post', new.id, new.author_id, score, verdict,
          case when new.removed_auto then 'hidden' else 'flagged' end,
          left(coalesce(new.body, ''), 400));

  if new.removed_auto then
    perform public.notify_user(new.author_id, 'removed', 'Запись скрыта автоматически',
      new.removed_reason || '. Модератор посмотрит и вернёт, если это ошибка',
      jsonb_build_object('post', new.id, 'auto', true));
    perform public.notify_staff('report', 'Автофильтр скрыл запись',
      left(coalesce(new.body, ''), 90), jsonb_build_object('post', new.id, 'auto', true), new.author_id);
  end if;
  return new;
end;
$$;


--
-- Name: guard_queue(integer, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.guard_queue(size integer DEFAULT 40, mode text DEFAULT 'all'::text) RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  result jsonb;
  want integer := least(120, greatest(5, coalesce(size, 40)));
begin
  if not public.viewer_is_moderator() then raise exception 'Только для модераторов'; end if;
  select coalesce(jsonb_agg(row), '[]'::jsonb) into result from (
    select jsonb_build_object(
      'id', h.id,
      'kind', h.target_kind,
      'target', h.target_id,
      'score', h.score,
      'action', h.action,
      'body', h.body,
      'notes', coalesce(h.verdict->'notes', '[]'::jsonb),
      'hits', coalesce(h.verdict->'hits', '[]'::jsonb),
      'source', h.source,
      'at', h.created_at,
      'undone', h.undone,
      'kept', h.kept,
      'author', case when p.id is null then null else jsonb_build_object(
        'id', p.id, 'username', p.username, 'display_name', p.display_name,
        'avatar', p.avatar, 'hue', p.hue) end
    ) as row, h.created_at
    from public.guard_hits h
    left join public.profiles p on p.id = h.user_id
    where (mode = 'all'
       or (mode = 'hidden' and h.action in ('hidden', 'mass'))
       or (mode = 'flagged' and h.action = 'flagged')
       or (mode = 'open' and h.action in ('hidden', 'mass') and not h.undone and not h.kept))
    order by h.created_at desc
    limit want
  ) rows;
  return result;
end;
$$;


--
-- Name: guard_reason(jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.guard_reason(verdict jsonb) RETURNS text
    LANGUAGE sql IMMUTABLE
    AS $$
  select 'Автофильтр: ' || coalesce(nullif(array_to_string(
    array(select jsonb_array_elements_text(coalesce(verdict->'notes', '[]'::jsonb))), ', '), ''), 'подозрительная запись');
$$;


--
-- Name: guard_scan(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.guard_scan(src text) RETURNS jsonb
    LANGUAGE plpgsql STABLE
    SET search_path TO 'public'
    AS $_$
declare
  clean text := public.guard_norm(src);
  squashed text;
  hits jsonb := '[]'::jsonb;
  total integer := 0;
  kinds text[] := '{}';
  item record;
  aimed boolean;
begin
  if clean = '' then return jsonb_build_object('score', 0, 'hits', hits, 'kinds', kinds); end if;
  squashed := replace(clean, ' ', '');

  for item in select word, kind, weight from public.guard_words where live loop
    if clean ~ ('(^| )' || item.word || '[а-я]{0,4}( |$)')
      or (length(item.word) >= 5 and position(item.word in squashed) > 0) then
      hits := hits || jsonb_build_object('word', item.word, 'kind', item.kind, 'weight', item.weight);
      total := total + item.weight;
      if not (item.kind = any(kinds)) then kinds := kinds || item.kind; end if;
    end if;
  end loop;

  aimed := clean ~ '(^| )(ты|тебе|тебя|тобой|вы|вам|вас|твоя|твой|твое)( |$)';
  if aimed and ('insult' = any(kinds) or 'threat' = any(kinds)) then
    total := total + 2;
    kinds := kinds || 'aimed'::text;
  end if;

  return jsonb_build_object('score', total, 'hits', hits, 'kinds', kinds);
end;
$_$;


--
-- Name: guard_stats(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.guard_stats() RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  day_all integer;
  day_hidden integer;
  week_hidden integer;
  week_undone integer;
  top jsonb;
begin
  if not public.viewer_is_moderator() then raise exception 'Только для модераторов'; end if;
  select count(*) into day_all from public.guard_hits where created_at > now() - interval '1 day';
  select count(*) into day_hidden from public.guard_hits
   where created_at > now() - interval '1 day' and action in ('hidden', 'mass');
  select count(*) into week_hidden from public.guard_hits
   where created_at > now() - interval '7 days' and action in ('hidden', 'mass');
  select count(*) into week_undone from public.guard_hits
   where created_at > now() - interval '7 days' and undone;

  select coalesce(jsonb_agg(jsonb_build_object('word', word, 'count', many)), '[]'::jsonb) into top
  from (
    select hit->>'word' as word, count(*) as many
    from public.guard_hits h, jsonb_array_elements(coalesce(h.verdict->'hits', '[]'::jsonb)) hit
    where h.created_at > now() - interval '7 days'
    group by hit->>'word'
    order by count(*) desc
    limit 8
  ) rows;

  return jsonb_build_object(
    'day', day_all, 'day_hidden', day_hidden,
    'week_hidden', week_hidden, 'week_undone', week_undone,
    'miss', case when week_hidden = 0 then 0
                 else round(week_undone::numeric * 100 / week_hidden) end,
    'top', top);
end;
$$;


--
-- Name: guard_try(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.guard_try(src text) RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
begin
  if not public.viewer_is_moderator() then raise exception 'Только для модераторов'; end if;
  return public.guard_look('post', coalesce(src, ''), auth.uid());
end;
$$;


--
-- Name: guard_undo(bigint); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.guard_undo(target bigint) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  hit public.guard_hits;
  who text;
begin
  if not public.viewer_is_moderator() then raise exception 'Только для модераторов'; end if;
  select * into hit from public.guard_hits where id = target;
  if hit.id is null then raise exception 'Запись не найдена'; end if;
  if hit.undone then return jsonb_build_object('ok', true, 'already', true); end if;

  if hit.target_kind = 'post' then
    update public.posts
       set removed = false, removed_auto = false, removed_reason = '', removed_at = null
     where id = hit.target_id and removed_auto;
  else
    update public.comments
       set removed = false, removed_auto = false, removed_reason = ''
     where id = hit.target_id and removed_auto;
  end if;

  update public.guard_hits
     set undone = true, undone_by = auth.uid(), undone_at = now(), kept = false
   where id = target;

  if hit.user_id is not null then
    perform public.notify_user(hit.user_id, 'removed', 'Автофильтр ошибся',
      'Модератор вернул вашу запись, она снова видна всем',
      jsonb_build_object('post', hit.target_id));
  end if;

  select display_name into who from public.profiles where id = auth.uid();
  perform public.log_action('guard.undo', jsonb_build_object('hit', target, 'by', who));
  return jsonb_build_object('ok', true);
end;
$$;


--
-- Name: guard_word_add(text, text, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.guard_word_add(src text, kind text DEFAULT 'insult'::text, weight integer DEFAULT 3) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  clean text := public.guard_norm(src);
begin
  if not public.viewer_is_admin() then raise exception 'Только для админа'; end if;
  if length(clean) < 3 then raise exception 'Слово слишком короткое'; end if;
  if kind not in ('insult', 'threat', 'spam', 'link') then raise exception 'Не тот вид'; end if;
  insert into public.guard_words (word, kind, weight, added_by)
  values (clean, kind, least(9, greatest(1, coalesce(weight, 3))), auth.uid())
  on conflict (word) do update set kind = excluded.kind, weight = excluded.weight, live = true;
  perform public.log_action('guard.word', jsonb_build_object('word', clean, 'kind', kind));
  return jsonb_build_object('ok', true, 'word', clean);
end;
$$;


--
-- Name: guard_word_drop(bigint); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.guard_word_drop(target bigint) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
begin
  if not public.viewer_is_admin() then raise exception 'Только для админа'; end if;
  delete from public.guard_words where id = target;
  return jsonb_build_object('ok', true);
end;
$$;


--
-- Name: guard_words_all(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.guard_words_all() RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
begin
  if not public.viewer_is_moderator() then raise exception 'Только для модераторов'; end if;
  return (select coalesce(jsonb_agg(jsonb_build_object(
    'id', id, 'word', word, 'kind', kind, 'weight', weight, 'live', live) order by kind, word), '[]'::jsonb)
    from public.guard_words);
end;
$$;


--
-- Name: handle_new_user(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.handle_new_user() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
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


--
-- Name: invite_mine(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.invite_mine() RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  mine text;
  used integer;
begin
  if auth.uid() is null then raise exception 'Нужен вход'; end if;
  select code into mine from public.invites where owner_id = auth.uid() limit 1;
  if mine is null then
    mine := lower(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8));
    insert into public.invites (code, owner_id) values (mine, auth.uid());
  end if;
  select count(*) into used from public.invite_uses where owner_id = auth.uid();
  return jsonb_build_object('code', mine, 'used', coalesce(used, 0),
    'taken', exists (select 1 from public.invite_uses where guest_id = auth.uid()));
end;
$$;


--
-- Name: invite_use(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.invite_use(code text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  clean text := lower(regexp_replace(coalesce(code, ''), '[^a-z0-9]', '', 'g'));
  host uuid;
  born timestamptz;
begin
  if auth.uid() is null then raise exception 'Нужен вход'; end if;
  select created_at into born from public.profiles where id = auth.uid();
  if born < now() - interval '7 days' then raise exception 'Код можно ввести только в первую неделю'; end if;
  if exists (select 1 from public.invite_uses where guest_id = auth.uid()) then
    raise exception 'Вы уже вводили код';
  end if;
  select owner_id into host from public.invites where invites.code = clean;
  if host is null then raise exception 'Такого кода нет'; end if;
  if host = auth.uid() then raise exception 'Свой код не считается'; end if;

  insert into public.invite_uses (code, owner_id, guest_id) values (clean, host, auth.uid());
  perform set_config('spokum.privileged', 'on', true);
  update public.profiles set coins = coalesce(coins, 0) + 150 where id = auth.uid();
  update public.profiles set coins = coalesce(coins, 0) + 250 where id = host;
  perform set_config('spokum.privileged', 'off', true);
  insert into public.coin_log (user_id, amount, reason) values
    (auth.uid(), 150, 'Пришёл по приглашению'),
    (host, 250, 'Позвал друга');
  perform public.notify_user(host, 'gift', 'К вам пришёл друг',
    'Кто-то зашёл по вашему приглашению, вам двести пятьдесят монет', jsonb_build_object('coins', 250));
  return jsonb_build_object('ok', true, 'coins', 150);
end;
$$;


--
-- Name: is_chat_member(bigint); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.is_chat_member(target_chat bigint) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select exists (select 1 from public.chat_members where chat_id = target_chat and user_id = auth.uid());
$$;


--
-- Name: join_group(bigint); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.join_group(p_group_id bigint) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE me uuid := auth.uid();
BEGIN
  IF me IS NULL THEN RAISE EXCEPTION 'Нужен вход' USING ERRCODE = '401'; END IF;
  INSERT INTO public.group_members (group_id, user_id) VALUES (p_group_id, me) ON CONFLICT DO NOTHING;
  RETURN jsonb_build_object('ok', true);
END;
$$;


--
-- Name: leave_group(bigint); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.leave_group(p_group_id bigint) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE me uuid := auth.uid();
BEGIN
  IF me IS NULL THEN RAISE EXCEPTION 'Нужен вход' USING ERRCODE = '401'; END IF;
  DELETE FROM public.group_members WHERE group_id = p_group_id AND user_id = me AND role != 'owner';
  IF NOT FOUND THEN RAISE EXCEPTION 'Нельзя покинуть свою группу' USING ERRCODE = '400'; END IF;
  RETURN jsonb_build_object('ok', true);
END;
$$;


--
-- Name: letter_reply(bigint, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.letter_reply(target bigint, answer text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  row public.letters;
begin
  if not public.viewer_can_write() then raise exception 'Сейчас нельзя'; end if;
  select * into row from public.letters where id = target;
  if row.id is null or row.to_id <> auth.uid() then raise exception 'Письмо не ваше'; end if;
  if row.reply is not null then raise exception 'Ответ уже отправлен'; end if;
  if coalesce(trim(answer), '') = '' then raise exception 'Пустой ответ'; end if;

  update public.letters set reply = left(answer, 2000), replied_at = now() where id = target;

  perform public.notify_user(row.author_id, 'letter', 'На ваше письмо ответили',
    'Незнакомец написал вам в ответ', jsonb_build_object('letter', target));

  return jsonb_build_object('ok', true);
end;
$$;


--
-- Name: letter_send(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.letter_send(body text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  fresh bigint;
  waiting integer;
begin
  if not public.viewer_can_write() then raise exception 'Сейчас нельзя'; end if;
  if length(coalesce(trim(body), '')) < 10 then raise exception 'Напишите хотя бы пару строк'; end if;

  select count(*) into waiting from public.letters
   where author_id = auth.uid() and created_at > now() - interval '24 hours';
  if waiting >= 3 then raise exception 'Не больше трёх писем в сутки'; end if;

  insert into public.letters (author_id, body) values (auth.uid(), left(body, 2000)) returning id into fresh;
  return jsonb_build_object('ok', true, 'letter', fresh);
end;
$$;


--
-- Name: letter_take(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.letter_take() RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  row public.letters;
begin
  if not public.viewer_can_write() then raise exception 'Сейчас нельзя'; end if;

  select * into row from public.letters
   where taken_at is null and author_id <> auth.uid()
   order by random() limit 1
   for update skip locked;

  if row.id is null then return jsonb_build_object('empty', true); end if;

  update public.letters set to_id = auth.uid(), taken_at = now() where id = row.id;
  return jsonb_build_object('id', row.id, 'body', row.body, 'createdAt', row.created_at);
end;
$$;


--
-- Name: level_leaderboard(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.level_leaderboard() RETURNS jsonb
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'userId', p.id, 'username', p.username, 'displayName', p.display_name,
    'avatar', p.avatar, 'hue', p.hue, 'level', p.level, 'xp', p.xp,
    'streak', p.streak_days
  )), '[]'::jsonb)
  FROM (
    SELECT * FROM public.profiles
    WHERE banned_until IS NULL OR banned_until < now()
    ORDER BY level DESC, xp DESC
    LIMIT 50
  ) p;
$$;


--
-- Name: list_groups(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.list_groups() RETURNS jsonb
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'id', g.id, 'name', g.name, 'slug', g.slug, 'description', g.description,
    'hue', g.hue, 'members', (SELECT count(*) FROM public.group_members WHERE group_id = g.id),
    'joined', EXISTS(SELECT 1 FROM public.group_members WHERE group_id = g.id AND user_id = auth.uid())
  ) ORDER BY g.name), '[]'::jsonb)
  FROM public.groups g WHERE NOT g.is_private OR EXISTS (SELECT 1 FROM public.group_members WHERE group_id = g.id AND user_id = auth.uid());
$$;


--
-- Name: log_action(text, jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.log_action(action text, meta jsonb) RETURNS void
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  insert into public.audit (actor_id, action, meta) values (auth.uid(), action, meta);
$$;


--
-- Name: make_link_code(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.make_link_code() RETURNS text
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
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


--
-- Name: mark_notifications(bigint[]); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.mark_notifications(ids bigint[] DEFAULT NULL::bigint[]) RETURNS void
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  update public.notifications
     set read_at = now()
   where user_id = auth.uid()
     and read_at is null
     and (ids is null or id = any(ids));
$$;


--
-- Name: mentor_board(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.mentor_board() RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  result jsonb;
begin
  if not public.viewer_is_moderator() then raise exception 'Только для модераторов'; end if;

  select jsonb_build_object(
    'students', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', p.id, 'username', p.username, 'displayName', p.display_name,
        'avatar', p.avatar, 'hue', p.hue, 'rank', p.mod_rank,
        'rankName', public.rank_name(p.mod_rank),
        'since', m.created_at,
        'actions', (select count(*) from public.punishments x where x.actor_id = p.id),
        'good', (select count(*) from public.mentor_reviews r where r.student_id = p.id and r.verdict = 'good'),
        'bad', (select count(*) from public.mentor_reviews r where r.student_id = p.id and r.verdict <> 'good')
      ) order by m.created_at desc)
      from public.mentorships m join public.profiles p on p.id = m.student_id
      where m.mentor_id = auth.uid() and m.ended_at is null), '[]'::jsonb),
    'mentor', (
      select jsonb_build_object('id', p.id, 'displayName', p.display_name, 'username', p.username,
        'rankName', public.rank_name(p.mod_rank), 'since', m.created_at)
      from public.mentorships m join public.profiles p on p.id = m.mentor_id
      where m.student_id = auth.uid() and m.ended_at is null),
    'reviews', coalesce((
      select jsonb_agg(jsonb_build_object('id', r.id, 'verdict', r.verdict, 'note', r.note,
        'createdAt', r.created_at, 'mentor', p.display_name) order by r.created_at desc)
      from public.mentor_reviews r join public.profiles p on p.id = r.mentor_id
      where r.student_id = auth.uid() limit 30), '[]'::jsonb),
    'free', coalesce((
      select jsonb_agg(jsonb_build_object('id', p.id, 'username', p.username, 'displayName', p.display_name,
        'avatar', p.avatar, 'hue', p.hue, 'rankName', public.rank_name(p.mod_rank)))
      from public.profiles p
      where p.is_moderator and not p.is_admin and p.id <> auth.uid() and coalesce(p.mod_rank, 0) < 3
        and not exists (select 1 from public.mentorships m where m.student_id = p.id and m.ended_at is null)), '[]'::jsonb)
  ) into result;
  return result;
end;
$$;


--
-- Name: mentor_drop(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.mentor_drop(student uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
begin
  update public.mentorships set ended_at = now()
   where student_id = student and ended_at is null and (mentor_id = auth.uid() or public.viewer_is_admin());
  return jsonb_build_object('ok', true);
end;
$$;


--
-- Name: mentor_feed(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.mentor_feed() RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  result jsonb;
begin
  if not public.viewer_is_moderator() then raise exception 'Только для модераторов'; end if;
  select coalesce(jsonb_agg(row order by (row->>'createdAt') desc), '[]'::jsonb) into result
  from (
    select jsonb_build_object(
      'id', x.id, 'kind', x.kind, 'reason', x.reason, 'minutes', x.minutes,
      'createdAt', x.created_at, 'proof', p.removed_proof,
      'student', s.display_name, 'studentId', s.id,
      'target', t.display_name,
      'review', (select jsonb_build_object('verdict', r.verdict, 'note', r.note)
                   from public.mentor_reviews r where r.punishment_id = x.id limit 1)
    ) as row
    from public.punishments x
    join public.mentorships m on m.student_id = x.actor_id and m.ended_at is null and m.mentor_id = auth.uid()
    join public.profiles s on s.id = x.actor_id
    left join public.profiles t on t.id = x.user_id
    left join public.posts p on p.id = x.post_id
    order by x.created_at desc limit 40
  ) rows;
  return result;
end;
$$;


--
-- Name: mentor_review(bigint, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.mentor_review(target bigint, verdict text, note text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  act public.punishments;
  link public.mentorships;
begin
  if verdict not in ('good', 'soft', 'hard', 'wrong') then raise exception 'Неизвестная оценка'; end if;
  select * into act from public.punishments where id = target;
  if act.id is null then raise exception 'Решение не найдено'; end if;

  select * into link from public.mentorships
   where student_id = act.actor_id and ended_at is null and mentor_id = auth.uid();
  if link.id is null and not public.viewer_is_admin() then raise exception 'Это не ваш ученик'; end if;

  insert into public.mentor_reviews (mentor_id, student_id, punishment_id, verdict, note)
  values (auth.uid(), act.actor_id, target, verdict, left(coalesce(note, ''), 500));

  perform public.notify_user(act.actor_id, 'modaction',
    case verdict when 'good' then 'Наставник одобрил решение'
                 when 'soft' then 'Наставник: мягковато'
                 when 'hard' then 'Наставник: слишком строго'
                 else 'Наставник: решение неверное' end,
    coalesce(nullif(trim(note), ''), 'Без комментария'),
    jsonb_build_object('punishment', target, 'verdict', verdict));

  return jsonb_build_object('ok', true);
end;
$$;


--
-- Name: mentor_take(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.mentor_take(student uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  rank integer;
  who text;
begin
  select mod_rank into rank from public.profiles where id = auth.uid();
  if not public.viewer_is_admin() and coalesce(rank, 0) < 3 then
    raise exception 'Брать учеников может старший модератор и выше';
  end if;
  if student = auth.uid() then raise exception 'Себя брать нельзя'; end if;
  if not exists (select 1 from public.profiles where id = student and is_moderator) then
    raise exception 'Ученик должен быть модератором';
  end if;
  if exists (select 1 from public.mentorships where student_id = student and ended_at is null) then
    raise exception 'У него уже есть наставник';
  end if;

  insert into public.mentorships (mentor_id, student_id) values (auth.uid(), student);
  select display_name into who from public.profiles where id = auth.uid();
  perform public.notify_user(student, 'modaction', 'У вас появился наставник',
    coalesce(who, 'Старший модератор') || ' будет смотреть ваши решения и подсказывать',
    jsonb_build_object('mentor', auth.uid()));
  perform public.log_action('mentor.take', jsonb_build_object('student', student));
  return jsonb_build_object('ok', true);
end;
$$;


--
-- Name: message_react(bigint, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.message_react(target bigint, glyph text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  room bigint;
begin
  if auth.uid() is null then raise exception 'Нужен вход'; end if;
  select chat_id into room from public.messages where id = target;
  if room is null then raise exception 'Сообщение не найдено'; end if;
  if not exists (select 1 from public.chat_members where chat_id = room and user_id = auth.uid()) then
    raise exception 'Это не ваш чат';
  end if;
  if coalesce(trim(glyph), '') = '' then
    delete from public.message_reactions where message_id = target and user_id = auth.uid();
    return jsonb_build_object('ok', true, 'glyph', null);
  end if;
  if glyph not in ('heart', 'smile', 'sad', 'fire', 'ok', 'wave') then raise exception 'Такой реакции нет'; end if;
  insert into public.message_reactions (message_id, user_id, glyph)
  values (target, auth.uid(), glyph)
  on conflict (message_id, user_id) do update set glyph = excluded.glyph, created_at = now();
  return jsonb_build_object('ok', true, 'glyph', glyph);
end;
$$;


--
-- Name: mod_ban_device(text, integer, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.mod_ban_device(fp text, minutes integer, reason text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
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


--
-- Name: mod_close_report(bigint, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.mod_close_report(target bigint, new_status text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
begin
  if not public.viewer_is_moderator() then raise exception 'Только для модераторов'; end if;
  if new_status not in ('closed', 'rejected') then raise exception 'Неизвестный статус'; end if;
  update public.reports
     set status = new_status, handled_by = auth.uid(), handled_at = now()
   where id = target;
end;
$$;


--
-- Name: mod_punish(uuid, text, integer, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.mod_punish(target uuid, kind text, minutes integer, reason text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
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


--
-- Name: mod_remove_post(bigint, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.mod_remove_post(target bigint, reason text, proof text DEFAULT NULL::text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  author uuid;
  title text;
begin
  if not public.viewer_is_moderator() then raise exception 'Только для модераторов'; end if;
  if coalesce(trim(reason), '') = '' then raise exception 'Нужна причина'; end if;
  if coalesce(trim(proof), '') = '' then raise exception 'Приложите снимок нарушения, без него снять запись нельзя'; end if;

  select author_id into author from public.posts where id = target;
  if author is null then raise exception 'Пост не найден'; end if;

  update public.posts
     set removed = true, removed_by = auth.uid(), removed_reason = reason,
         removed_at = now(), removed_proof = proof
   where id = target;

  insert into public.punishments (actor_id, user_id, kind, reason, post_id)
  values (auth.uid(), author, 'post_removed', reason, target);

  perform public.notify_user(author, 'removed', 'Ваша запись снята с публикации', reason,
    jsonb_build_object('post', target));

  select display_name into title from public.profiles where id = auth.uid();
  perform public.notify_admins('modaction', 'Модератор снял запись',
    coalesce(title, 'Модератор') || ': ' || reason,
    jsonb_build_object('post', target, 'mod', auth.uid()), auth.uid());

  perform public.log_action('post.remove', jsonb_build_object('post', target, 'reason', reason));
end;
$$;


--
-- Name: mod_thanks(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.mod_thanks(target uuid) RETURNS jsonb
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select jsonb_build_object(
    'total', (select count(*) from public.thanks where mod_id = target),
    'week', (select count(*) from public.thanks where mod_id = target and created_at > now() - interval '7 days'),
    'mine', exists (select 1 from public.thanks where mod_id = target and from_id = auth.uid()
                    and created_at > now() - interval '7 days')
  );
$$;


--
-- Name: mod_unban_device(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.mod_unban_device(fp text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
begin
  if not public.viewer_is_admin() then raise exception 'Снять блокировку устройства может только админ'; end if;
  update public.device_bans
     set lifted_at = now(), lifted_by = auth.uid()
   where device_id = fp and lifted_at is null;
  perform public.log_action('device.unban', jsonb_build_object('device', fp));
  return jsonb_build_object('ok', true);
end;
$$;


--
-- Name: mod_user_info(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.mod_user_info(target uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
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


--
-- Name: month_recap(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.month_recap() RETURNS jsonb
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select jsonb_build_object(
    'posts', (select count(*) from public.posts
       where author_id = auth.uid() and not removed and created_at >= date_trunc('month', now())),
    'likes', (select count(*) from public.likes l join public.posts p on p.id = l.post_id
       where p.author_id = auth.uid() and l.created_at >= date_trunc('month', now())),
    'answers', (select count(*) from public.comments
       where author_id = auth.uid() and not removed and created_at >= date_trunc('month', now())),
    'friends', (select count(*) from public.follows where follower_id = auth.uid()),
    'gifts', (select count(*) from public.gifts where owner_id = auth.uid() and not sold),
    'streak', (select coalesce(best_streak, 0) from public.profiles where id = auth.uid()),
    'coins', (select coalesce(coins, 0) from public.profiles where id = auth.uid()),
    'month', extract(month from (now() at time zone 'Europe/Moscow'))
  );
$$;


--
-- Name: mood_map(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.mood_map() RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  result jsonb;
begin
  select coalesce(jsonb_agg(row order by (row->>'people')::int desc), '[]'::jsonb) into result
  from (
    select jsonb_build_object(
      'country', d.country,
      'people', count(distinct du.user_id),
      'mood', (
        select p.mood from public.posts p
        join public.device_users x on x.user_id = p.author_id
        join public.devices dd on dd.id = x.device_id and dd.country = d.country
        where p.created_at > now() - interval '3 days' and not p.removed
        group by p.mood order by count(*) desc limit 1
      )
    ) as row
    from public.devices d
    join public.device_users du on du.device_id = d.id
    where d.country <> '' and du.last_seen > now() - interval '14 days'
    group by d.country
    having count(distinct du.user_id) > 0
  ) rows;
  return result;
end;
$$;


--
-- Name: mood_twins(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.mood_twins() RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  mine text;
begin
  select mood into mine from public.posts
   where author_id = auth.uid() and not removed and created_at > now() - interval '14 days'
   group by mood order by count(*) desc limit 1;
  if mine is null then select mood into mine from public.profiles where id = auth.uid(); end if;
  if mine is null then return jsonb_build_object('mood', null, 'people', '[]'::jsonb); end if;

  return jsonb_build_object('mood', mine, 'people', coalesce((
    select jsonb_agg(row_to_json(t)) from (
      select p.id, p.username, p.display_name as "displayName", p.avatar, p.hue, p.mood,
             count(x.id) as posts
      from public.profiles p
      join public.posts x on x.author_id = p.id and not x.removed and x.created_at > now() - interval '14 days'
      where p.id <> auth.uid()
        and p.banned_until is null
        and x.mood = mine
        and not exists (select 1 from public.follows f where f.follower_id = auth.uid() and f.target_id = p.id)
      group by p.id
      order by count(x.id) desc
      limit 8
    ) t
  ), '[]'::jsonb));
end;
$$;


--
-- Name: my_appeals(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.my_appeals() RETURNS jsonb
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', a.id,
    'punishment', a.punishment_id,
    'kind', p.kind,
    'reason', p.reason,
    'body', a.body,
    'status', a.status,
    'answer', a.answer,
    'createdAt', a.created_at
  ) order by a.created_at desc), '[]'::jsonb)
  from public.appeals a join public.punishments p on p.id = a.punishment_id
  where a.user_id = auth.uid();
$$;


--
-- Name: my_badges(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.my_badges() RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  me uuid := auth.uid();
  earned text[] := '{}';
  posts integer;
  gifts integer;
  letters integer;
  camp integer;
  caps integer;
  who public.profiles;
begin
  if me is null then return '[]'::jsonb; end if;
  select * into who from public.profiles where id = me;
  select count(*) into posts from public.posts where author_id = me and not removed;
  select count(*) into gifts from public.gifts where owner_id = me and not sold;
  select count(*) into letters from public.letters where author_id = me;
  select count(*) into camp from public.campfire_messages where author_id = me;
  select count(*) into caps from public.capsules where user_id = me;

  if posts >= 1 then earned := array_append(earned, 'first_post'); end if;
  if posts >= 25 then earned := array_append(earned, 'writer'); end if;
  if who.streak_days >= 7 then earned := array_append(earned, 'week'); end if;
  if who.best_streak >= 30 then earned := array_append(earned, 'month'); end if;
  if gifts >= 1 then earned := array_append(earned, 'gifted'); end if;
  if gifts >= 10 then earned := array_append(earned, 'collector'); end if;
  if letters >= 1 then earned := array_append(earned, 'letter'); end if;
  if camp >= 10 then earned := array_append(earned, 'campfire'); end if;
  if caps >= 1 then earned := array_append(earned, 'capsule'); end if;
  if exists (select 1 from public.letters where to_id = me and reply is not null) then earned := array_append(earned, 'answered'); end if;
  if who.is_moderator then earned := array_append(earned, 'shield'); end if;
  if who.coins >= 1000 then earned := array_append(earned, 'rich'); end if;

  insert into public.badges (user_id, code)
  select me, code from unnest(earned) as code
  on conflict do nothing;

  return coalesce((select jsonb_agg(jsonb_build_object('code', code, 'earnedAt', earned_at) order by earned_at)
                     from public.badges where user_id = me), '[]'::jsonb);
end;
$$;


--
-- Name: my_billing(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.my_billing() RETURNS json
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select json_build_object(
    'telegram', (select tg_name from public.tg_links where user_id = auth.uid()),
    'payments', coalesce((
      select json_agg(json_build_object('stars', stars, 'days', days, 'at', created_at) order by created_at desc)
      from (select * from public.payments where user_id = auth.uid() order by created_at desc limit 10) p
    ), '[]'::json)
  );
$$;


--
-- Name: my_blocks(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.my_blocks() RETURNS jsonb
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'id', p.id, 'username', p.username, 'display_name', p.display_name,
    'avatar', p.avatar, 'hue', p.hue, 'createdAt', b.created_at
  ) ORDER BY b.created_at DESC), '[]'::jsonb)
  FROM public.blocks b
  JOIN public.profiles p ON p.id = b.blocked_id
  WHERE b.blocker_id = auth.uid();
$$;


--
-- Name: my_daily_quests(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.my_daily_quests() RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE
  me uuid := auth.uid();
  today date := CURRENT_DATE;
  quest_defs jsonb := '[
    {"key":"post","target":1,"reward":20,"label":"Написать пост"},
    {"key":"comment","target":3,"reward":15,"label":"Ответить 3 раза в комментариях"},
    {"key":"game","target":1,"reward":10,"label":"Сыграть в любую игру"},
    {"key":"chat","target":1,"reward":15,"label":"Написать в чат"},
    {"key":"journal","target":1,"reward":25,"label":"Сделать запись в дневнике"}
  ]'::jsonb;
  q jsonb;
BEGIN
  SET LOCAL row_security = off;
  IF me IS NULL THEN RAISE EXCEPTION 'Нужен вход' USING ERRCODE = '401'; END IF;

  IF NOT EXISTS (SELECT 1 FROM public.daily_quests WHERE user_id = me AND day = today AND quest_type = 'daily') THEN
    FOR q IN SELECT * FROM jsonb_array_elements(quest_defs) ORDER BY random() LIMIT 3
    LOOP
      INSERT INTO public.daily_quests (user_id, day, week_start, quest_key, target, reward, quest_type)
        VALUES (me, today, NULL, q->>'key', (q->>'target')::int, (q->>'reward')::int, 'daily')
        ON CONFLICT (user_id, day, week_start, quest_key) DO NOTHING;
    END LOOP;
  END IF;

  RETURN coalesce(jsonb_agg(jsonb_build_object(
    'id', dq.id, 'key', dq.quest_key, 'progress', dq.progress,
    'target', dq.target, 'reward', dq.reward,
    'completed', dq.completed, 'claimed', dq.claimed,
    'type', dq.quest_type,
    'label', CASE dq.quest_key
      WHEN 'post' THEN 'Написать пост'
      WHEN 'comment' THEN 'Ответить ' || dq.target || ' раза в комментариях'
      WHEN 'game' THEN 'Сыграть в любую игру'
      WHEN 'chat' THEN 'Написать в чат'
      WHEN 'journal' THEN 'Сделать запись в дневнике'
      WHEN 'like' THEN 'Поставить ' || dq.target || ' лайков'
      WHEN 'contact' THEN 'Добавить ' || dq.target || ' контакт'
      WHEN 'story' THEN 'Опубликовать историю'
    END
  ) ORDER BY dq.id), '[]'::jsonb)
  FROM public.daily_quests dq WHERE dq.user_id = me AND dq.day = today AND dq.quest_type = 'daily';
END;
$$;


--
-- Name: my_feed(timestamp with time zone, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.my_feed(before timestamp with time zone DEFAULT NULL::timestamp with time zone, size integer DEFAULT 12) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  result jsonb;
begin
  if auth.uid() is null then return '[]'::jsonb; end if;
  select coalesce(jsonb_agg(row order by (row->>'created_at') desc), '[]'::jsonb) into result
  from (
    select to_jsonb(p) as row
    from public.posts p
    where not p.removed
      and (p.author_id = auth.uid()
           or p.author_id in (select target_id from public.follows where follower_id = auth.uid()))
      and (before is null or p.created_at < before)
    order by p.created_at desc
    limit least(40, greatest(4, size))
  ) rows;
  return result;
end;
$$;


--
-- Name: my_friends(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.my_friends() RETURNS jsonb
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'id', p.id, 'username', p.username, 'displayName', p.display_name,
    'avatar', p.avatar, 'hue', p.hue, 'isVerified', p.is_verified,
    'status', f.status
  ) ORDER BY p.username), '[]'::jsonb)
  FROM public.friendships f
  JOIN public.profiles p ON p.id = CASE WHEN f.requester_id = auth.uid() THEN f.addressee_id ELSE f.requester_id END
  WHERE (f.requester_id = auth.uid() OR f.addressee_id = auth.uid()) AND f.status = 'accepted';
$$;


--
-- Name: my_letters(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.my_letters() RETURNS jsonb
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', l.id, 'body', l.body, 'reply', l.reply,
    'createdAt', l.created_at, 'takenAt', l.taken_at, 'repliedAt', l.replied_at
  ) order by l.created_at desc), '[]'::jsonb)
  from public.letters l where l.author_id = auth.uid();
$$;


--
-- Name: my_level(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.my_level() RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE me uuid := auth.uid(); p public.profiles%ROWTYPE;
BEGIN
  SET LOCAL row_security = off;
  IF me IS NULL THEN RAISE EXCEPTION 'Нужен вход' USING ERRCODE = '401'; END IF;
  SELECT * INTO p FROM public.profiles WHERE id = me;
  RETURN jsonb_build_object(
    'level', p.level, 'xp', p.xp,
    'xpForNext', p.level * 100, 'xpProgress', p.xp,
    'streak', p.streak_days, 'bestStreak', p.best_streak
  );
END;
$$;


--
-- Name: my_profile_viewers(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.my_profile_viewers() RETURNS jsonb
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'userId', pv.viewer_id, 'username', p.username, 'displayName', p.display_name,
    'avatar', p.avatar, 'hue', p.hue, 'viewedAt', pv.viewed_at
  ) ORDER BY pv.viewed_at DESC), '[]'::jsonb)
  FROM public.profile_views pv
  JOIN public.profiles p ON p.id = pv.viewer_id
  WHERE pv.profile_id = auth.uid() AND pv.viewed_at > now() - interval '7 days'
  LIMIT 50;
$$;


--
-- Name: my_weekly_quests(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.my_weekly_quests() RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE
  me uuid := auth.uid();
  today date := CURRENT_DATE;
  ws date := public.start_of_week(today);
  quest_defs jsonb := '[
    {"key":"post","target":7,"reward":100,"label":"Написать 7 постов за неделю"},
    {"key":"comment","target":20,"reward":80,"label":"Ответить 20 раз в комментариях"},
    {"key":"game","target":10,"reward":60,"label":"Сыграть 10 раз"},
    {"key":"chat","target":15,"reward":70,"label":"Написать 15 сообщений"},
    {"key":"journal","target":5,"reward":150,"label":"5 записей в дневнике"},
    {"key":"like","target":30,"reward":50,"label":"Поставить 30 лайков"}
  ]'::jsonb;
  q jsonb;
BEGIN
  SET LOCAL row_security = off;
  IF me IS NULL THEN RAISE EXCEPTION 'Нужен вход' USING ERRCODE = '401'; END IF;

  IF NOT EXISTS (SELECT 1 FROM public.daily_quests WHERE user_id = me AND week_start = ws AND quest_type = 'weekly') THEN
    FOR q IN SELECT * FROM jsonb_array_elements(quest_defs) ORDER BY random() LIMIT 4
    LOOP
      INSERT INTO public.daily_quests (user_id, day, week_start, quest_key, target, reward, quest_type)
        VALUES (me, today, ws, q->>'key', (q->>'target')::int, (q->>'reward')::int, 'weekly')
        ON CONFLICT (user_id, day, week_start, quest_key) DO NOTHING;
    END LOOP;
  END IF;

  RETURN coalesce(jsonb_agg(jsonb_build_object(
    'id', dq.id, 'key', dq.quest_key, 'progress', dq.progress,
    'target', dq.target, 'reward', dq.reward,
    'completed', dq.completed, 'claimed', dq.claimed,
    'type', 'weekly',
    'label', CASE dq.quest_key
      WHEN 'post' THEN 'Написать ' || dq.target || ' постов за неделю'
      WHEN 'comment' THEN 'Ответить ' || dq.target || ' раз в комментариях'
      WHEN 'game' THEN 'Сыграть ' || dq.target || ' раз'
      WHEN 'chat' THEN 'Написать ' || dq.target || ' сообщений'
      WHEN 'journal' THEN dq.target || ' записей в дневнике'
      WHEN 'like' THEN 'Поставить ' || dq.target || ' лайков'
    END
  ) ORDER BY dq.id), '[]'::jsonb)
  FROM public.daily_quests dq WHERE dq.user_id = me AND dq.week_start = ws AND dq.quest_type = 'weekly';
END;
$$;


--
-- Name: note_about(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.note_about(target uuid) RETURNS jsonb
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select coalesce((select jsonb_build_object('note', note, 'at', updated_at)
                     from public.people_notes
                    where owner_id = auth.uid() and target_id = target), '{"note":""}'::jsonb);
$$;


--
-- Name: note_save(uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.note_save(target uuid, body text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  clean text := left(coalesce(body, ''), 400);
begin
  if auth.uid() is null then raise exception 'Нужен вход'; end if;
  if target = auth.uid() then raise exception 'Это ваш профиль'; end if;
  if trim(clean) = '' then
    delete from public.people_notes where owner_id = auth.uid() and target_id = target;
    return jsonb_build_object('ok', true, 'note', '');
  end if;
  insert into public.people_notes (owner_id, target_id, note, updated_at)
  values (auth.uid(), target, clean, now())
  on conflict (owner_id, target_id) do update set note = excluded.note, updated_at = now();
  return jsonb_build_object('ok', true, 'note', clean);
end;
$$;


--
-- Name: notify_admins(text, text, text, jsonb, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.notify_admins(kind text, title text, body text, meta jsonb DEFAULT '{}'::jsonb, skip uuid DEFAULT NULL::uuid) RETURNS void
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  insert into public.notifications (user_id, kind, title, body, meta)
  select p.id, kind, title, body, coalesce(meta, '{}'::jsonb)
  from public.profiles p
  where p.is_admin and (skip is null or p.id <> skip);
$$;


--
-- Name: notify_new_message(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.notify_new_message() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
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


--
-- Name: notify_new_post(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.notify_new_post() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
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


--
-- Name: notify_new_report(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.notify_new_report() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
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


--
-- Name: notify_staff(text, text, text, jsonb, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.notify_staff(kind text, title text, body text, meta jsonb DEFAULT '{}'::jsonb, skip uuid DEFAULT NULL::uuid) RETURNS void
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  insert into public.notifications (user_id, kind, title, body, meta)
  select p.id, kind, title, body, coalesce(meta, '{}'::jsonb)
  from public.profiles p
  where (p.is_moderator or p.is_admin)
    and (skip is null or p.id <> skip)
    and coalesce(p.banned_until, to_timestamp(0)) < now();
$$;


--
-- Name: notify_user(uuid, text, text, text, jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.notify_user(target uuid, kind text, title text, body text, meta jsonb DEFAULT '{}'::jsonb) RETURNS void
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  insert into public.notifications (user_id, kind, title, body, meta)
  select target, kind, title, body, coalesce(meta, '{}'::jsonb)
  where target is not null;
$$;


--
-- Name: open_dm(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.open_dm(peer uuid) RETURNS bigint
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
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


--
-- Name: pending_friend_requests(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.pending_friend_requests() RETURNS jsonb
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'id', p.id, 'username', p.username, 'displayName', p.display_name,
    'avatar', p.avatar, 'hue', p.hue
  ) ORDER BY f.created_at DESC), '[]'::jsonb)
  FROM public.friendships f
  JOIN public.profiles p ON p.id = f.requester_id
  WHERE f.addressee_id = auth.uid() AND f.status = 'pending';
$$;


--
-- Name: pin_gift(bigint, boolean); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.pin_gift(target bigint, on_shelf boolean) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  shown integer;
begin
  if not exists (select 1 from public.gifts where id = target and owner_id = auth.uid() and not sold) then
    raise exception 'Подарок не найден';
  end if;
  if on_shelf then
    select count(*) into shown from public.gifts where owner_id = auth.uid() and pinned and not sold;
    if shown >= 6 then raise exception 'На витрине помещается шесть подарков'; end if;
  end if;
  perform set_config('spokum.privileged', 'on', true);
  update public.gifts set pinned = on_shelf where id = target;
  return jsonb_build_object('ok', true);
end;
$$;


--
-- Name: pin_post(bigint); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.pin_post(p_post_id bigint) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE me uuid := auth.uid(); post_author uuid;
BEGIN
  SET LOCAL row_security = off;
  SELECT author_id INTO post_author FROM public.posts WHERE id = p_post_id;
  IF post_author IS NULL THEN RAISE EXCEPTION 'Пост не найден' USING ERRCODE = '404'; END IF;
  IF post_author != me THEN RAISE EXCEPTION 'Можно закреплять только свои посты' USING ERRCODE = '403'; END IF;
  UPDATE public.posts SET is_pinned = false WHERE author_id = me AND is_pinned = true AND id != p_post_id;
  UPDATE public.posts SET is_pinned = NOT is_pinned WHERE id = p_post_id AND author_id = me;
  RETURN jsonb_build_object('ok', true);
END;
$$;


--
-- Name: pin_post(bigint, boolean); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.pin_post(target bigint, on_top boolean) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
begin
  if not exists (select 1 from public.posts where id = target and author_id = auth.uid()) then
    raise exception 'Это не ваша запись';
  end if;
  update public.posts set pinned = false where author_id = auth.uid() and pinned;
  if on_top then
    update public.posts set pinned = true where id = target;
  end if;
  return jsonb_build_object('ok', true);
end;
$$;


--
-- Name: place_pixel(bigint, integer, integer, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.place_pixel(p_battle_id bigint, p_x integer, p_y integer, p_color text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE
  me uuid := auth.uid();
  cd record;
  max_pixels integer := 3;
  cooldown_secs integer := 120;
BEGIN
  SET LOCAL row_security = off;
  IF me IS NULL THEN RAISE EXCEPTION 'Нужен вход' USING ERRCODE = '401'; END IF;
  IF NOT public.viewer_can_write() THEN RAISE EXCEPTION 'Нельзя сейчас' USING ERRCODE = '403'; END IF;
  
  SELECT * INTO cd FROM public.pixel_cooldowns WHERE user_id = me AND battle_id = p_battle_id;
  IF cd.cooldown_until IS NOT NULL AND cd.cooldown_until > now() THEN
    RAISE EXCEPTION 'Подождите до %', cd.cooldown_until USING ERRCODE = '429';
  END IF;

  INSERT INTO public.pixel_cells (battle_id, x, y, color, user_id)
    VALUES (p_battle_id, p_x, p_y, p_color, me)
    ON CONFLICT (battle_id, x, y) DO UPDATE SET color = p_color, user_id = me, placed_at = now();

  IF cd.user_id IS NULL THEN
    INSERT INTO public.pixel_cooldowns (user_id, battle_id, pixels_placed) VALUES (me, p_battle_id, 1);
  ELSE
    UPDATE public.pixel_cooldowns SET pixels_placed = pixels_placed + 1 WHERE user_id = me AND battle_id = p_battle_id;
    cd.pixels_placed := cd.pixels_placed + 1;
    IF cd.pixels_placed >= max_pixels THEN
      UPDATE public.pixel_cooldowns SET cooldown_until = now() + (cooldown_secs || ' seconds')::interval, pixels_placed = 0 WHERE user_id = me AND battle_id = p_battle_id;
      RETURN jsonb_build_object('ok', true, 'cooldown', cooldown_secs);
    END IF;
  END IF;
  
  RETURN jsonb_build_object('ok', true, 'remaining', max_pixels - COALESCE(cd.pixels_placed, 1));
END;
$$;


--
-- Name: poll_result(bigint); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.poll_result(target bigint) RETURNS jsonb
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select jsonb_build_object(
    'total', (select count(*) from public.poll_votes where post_id = target),
    'mine', (select choice from public.poll_votes where post_id = target and user_id = auth.uid()),
    'counts', coalesce((select jsonb_object_agg(choice::text, n)
                          from (select choice, count(*) as n from public.poll_votes where post_id = target group by choice) rows), '{}'::jsonb)
  );
$$;


--
-- Name: poll_vote(bigint, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.poll_vote(target bigint, choice integer) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  options jsonb;
begin
  if not public.viewer_can_write() then raise exception 'Сейчас нельзя'; end if;
  select poll->'options' into options from public.posts where id = target and not removed;
  if options is null then raise exception 'Это не опрос'; end if;
  if choice < 0 or choice >= jsonb_array_length(options) then raise exception 'Такого варианта нет'; end if;

  insert into public.poll_votes (post_id, user_id, choice)
  values (target, auth.uid(), choice)
  on conflict (post_id, user_id) do update set choice = excluded.choice, created_at = now();

  return public.poll_result(target);
end;
$$;


--
-- Name: post_reactions(bigint); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.post_reactions(target bigint) RETURNS jsonb
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select coalesce(jsonb_object_agg(kind, n), '{}'::jsonb)
  from (select kind, count(*) as n from public.likes where post_id = target group by kind) rows;
$$;


--
-- Name: protect_login_name(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.protect_login_name() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
begin
  if coalesce(current_setting('spokum.privileged', true), '') = 'on' then
    return new;
  end if;
  new.login_name := old.login_name;
  return new;
end;
$$;


--
-- Name: protect_profile(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.protect_profile() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
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
  new.is_beta := old.is_beta;
  new.coins := old.coins;
  return new;
end;
$$;


--
-- Name: purge_call_signals(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.purge_call_signals() RETURNS void
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  delete from public.call_signals where created_at < now() - interval '2 minutes';
$$;


--
-- Name: purge_expired_stories(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.purge_expired_stories() RETURNS void
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  delete from public.stories where expires_at < now();
$$;


--
-- Name: rank_name(integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.rank_name(rank integer) RETURNS text
    LANGUAGE sql IMMUTABLE
    AS $$
  select case coalesce(rank, 0)
    when 0 then 'Стажёр'
    when 1 then 'Младший модератор'
    when 2 then 'Модератор'
    when 3 then 'Старший модератор'
    when 4 then 'Ведущий модератор'
    when 5 then 'Начальник модераторов'
    else 'Стажёр' end;
$$;


--
-- Name: react(bigint, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.react(target bigint, want text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  same boolean;
begin
  if not public.viewer_can_write() then raise exception 'Сейчас нельзя'; end if;
  if want not in ('heart', 'hug', 'same', 'hold', 'calm') then raise exception 'Неизвестная реакция'; end if;

  select l.kind = want into same from public.likes l where l.post_id = target and l.user_id = auth.uid();

  if same is null then
    insert into public.likes (post_id, user_id, kind) values (target, auth.uid(), want);
  elsif same then
    delete from public.likes where post_id = target and user_id = auth.uid();
  else
    update public.likes set kind = want where post_id = target and user_id = auth.uid();
  end if;

  return jsonb_build_object(
    'total', (select count(*) from public.likes where post_id = target),
    'mine', (select l.kind from public.likes l where l.post_id = target and l.user_id = auth.uid())
  );
end;
$$;


--
-- Name: record_profile_view(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.record_profile_view(p_profile_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE me uuid := auth.uid();
BEGIN
  SET LOCAL row_security = off;
  IF me IS NULL OR me = p_profile_id THEN RETURN; END IF;
  INSERT INTO public.profile_views (profile_id, viewer_id) VALUES (p_profile_id, me);
END;
$$;


--
-- Name: recovery_make(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.recovery_make() RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'extensions'
    AS $$
declare
  fresh text;
  codes text[] := '{}';
  i integer;
begin
  if auth.uid() is null then raise exception 'Нужен вход'; end if;
  delete from public.recovery_codes where user_id = auth.uid();
  for i in 1..3 loop
    fresh := upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 12));
    fresh := substr(fresh, 1, 4) || '-' || substr(fresh, 5, 4) || '-' || substr(fresh, 9, 4);
    codes := array_append(codes, fresh);
    insert into public.recovery_codes (user_id, code_hash)
    values (auth.uid(), encode(digest(fresh, 'sha256'), 'hex'));
  end loop;
  return jsonb_build_object('codes', to_jsonb(codes));
end;
$$;


--
-- Name: recovery_state(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.recovery_state() RETURNS jsonb
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'extensions'
    AS $$
  select jsonb_build_object(
    'total', count(*) filter (where used_at is null),
    'madeAt', coalesce(max(created_at), null)
  )
  from public.recovery_codes where user_id = auth.uid();
$$;


--
-- Name: recovery_use(text, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.recovery_use(login text, code text, fresh_password text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'extensions', 'auth'
    AS $$
declare
  target uuid;
  handle text;
  clean text;
  tries integer;
  hit bigint;
begin
  clean := upper(regexp_replace(coalesce(code, ''), '[^A-Za-z0-9]', '', 'g'));
  if length(clean) <> 12 then raise exception 'Код не подходит'; end if;
  if length(coalesce(fresh_password, '')) < 8 then raise exception 'Пароль минимум 8 символов'; end if;

  select p.id, coalesce(p.login_name, p.username) into target, handle
    from public.usernames u
    join public.profiles p on p.id = u.user_id
   where u.username = lower(regexp_replace(coalesce(login, ''), '^@', ''))
   limit 1;
  if target is null then raise exception 'Такого аккаунта нет'; end if;

  select count(*) into tries from public.recovery_tries
   where user_id = target and at > now() - interval '1 hour';
  if tries >= 8 then raise exception 'Слишком много попыток, подождите час'; end if;
  insert into public.recovery_tries (user_id) values (target);

  select id into hit from public.recovery_codes
   where user_id = target
     and used_at is null
     and code_hash = encode(digest(substr(clean, 1, 4) || '-' || substr(clean, 5, 4) || '-' || substr(clean, 9, 4), 'sha256'), 'hex')
   limit 1;
  if hit is null then raise exception 'Код не подходит'; end if;

  update public.recovery_codes set used_at = now() where id = hit;
  update auth.users
     set encrypted_password = crypt(fresh_password, gen_salt('bf')),
         updated_at = now()
   where id = target;
  delete from public.recovery_tries where user_id = target;

  return jsonb_build_object('ok', true, 'login', handle);
end;
$$;


--
-- Name: redeem_promo(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.redeem_promo(p_code text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE
  me uuid := auth.uid();
  promo public.promocodes%ROWTYPE;
  already_used boolean;
  coins_added integer := 0;
  days_added integer := 0;
BEGIN
  SET LOCAL row_security = off;
  SET LOCAL spokum.privileged = on;  -- обходит protect_profile триггер
  IF me IS NULL THEN RAISE EXCEPTION 'Нужен вход' USING ERRCODE = '401'; END IF;
  IF NOT public.viewer_can_write() THEN RAISE EXCEPTION 'Нельзя сейчас' USING ERRCODE = '403'; END IF;

  SELECT * INTO promo FROM public.promocodes WHERE code = upper(trim(p_code)) AND disabled = false;
  IF NOT FOUND THEN RAISE EXCEPTION 'Промокод не найден' USING ERRCODE = '404'; END IF;

  IF promo.expires_at IS NOT NULL AND promo.expires_at < now() THEN
    RAISE EXCEPTION 'Срок действия промокода истёк' USING ERRCODE = '410';
  END IF;

  IF promo.max_uses > 0 AND promo.used_count >= promo.max_uses THEN
    RAISE EXCEPTION 'Лимит активаций исчерпан' USING ERRCODE = '410';
  END IF;

  SELECT EXISTS(SELECT 1 FROM public.promocode_uses WHERE user_id = me AND promocode_id = promo.id) INTO already_used;
  IF already_used THEN RAISE EXCEPTION 'Вы уже активировали этот промокод' USING ERRCODE = '409'; END IF;

  IF promo.reward_type IN ('coins', 'coins_premium') AND promo.reward_amount > 0 THEN
    UPDATE public.profiles SET coins = coins + promo.reward_amount WHERE id = me;
    coins_added := promo.reward_amount;
    INSERT INTO public.coin_log (user_id, amount, reason) VALUES (me, promo.reward_amount, 'Промокод ' || promo.code);
  END IF;

  IF promo.reward_type IN ('premium', 'coins_premium') AND promo.reward_days > 0 THEN
    UPDATE public.profiles
      SET premium_until = GREATEST(COALESCE(premium_until, now()), now()) + (promo.reward_days || ' days')::interval,
          premium_reason = 'Промокод ' || promo.code
      WHERE id = me;
    days_added := promo.reward_days;
  END IF;

  INSERT INTO public.promocode_uses (user_id, promocode_id) VALUES (me, promo.id);
  UPDATE public.promocodes SET used_count = used_count + 1 WHERE id = promo.id;
  PERFORM public.log_action('promo.redeem', jsonb_build_object('code', promo.code, 'coins', coins_added, 'days', days_added));

  RETURN jsonb_build_object('ok', true, 'coins', coins_added, 'days', days_added, 'code', promo.code);
END;
$$;


--
-- Name: reminder_drop(bigint); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.reminder_drop(target bigint) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
begin
  delete from public.reminders where id = target and user_id = auth.uid();
  return jsonb_build_object('ok', true);
end;
$$;


--
-- Name: reminder_make(text, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.reminder_make(body text, minutes integer) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  clean text := left(coalesce(body, ''), 200);
  wait integer := least(43200, greatest(5, coalesce(minutes, 60)));
  fresh bigint;
begin
  if auth.uid() is null then raise exception 'Нужен вход'; end if;
  if trim(clean) = '' then raise exception 'Напишите, о чём напомнить'; end if;
  if (select count(*) from public.reminders where user_id = auth.uid() and not done) >= 20 then
    raise exception 'Больше двадцати напоминаний сразу не получится';
  end if;
  insert into public.reminders (user_id, body, ring_at)
  values (auth.uid(), clean, now() + (wait || ' minutes')::interval)
  returning id into fresh;
  return jsonb_build_object('ok', true, 'id', fresh, 'at', now() + (wait || ' minutes')::interval);
end;
$$;


--
-- Name: reminders_mine(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.reminders_mine() RETURNS jsonb
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', id, 'body', body, 'at', ring_at, 'done', done) order by ring_at), '[]'::jsonb)
  from public.reminders
  where user_id = auth.uid() and (not done or ring_at > now() - interval '2 days');
$$;


--
-- Name: reminders_ring(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.reminders_ring() RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  rang integer := 0;
  row record;
begin
  if auth.uid() is null then return jsonb_build_object('rang', 0); end if;
  for row in
    select id, body from public.reminders
     where user_id = auth.uid() and not done and ring_at <= now()
     limit 20
  loop
    perform public.notify_user(auth.uid(), 'reminder', 'Напоминание', row.body,
      jsonb_build_object('reminder', row.id));
    update public.reminders set done = true where id = row.id;
    rang := rang + 1;
  end loop;
  return jsonb_build_object('rang', rang);
end;
$$;


--
-- Name: remove_friend(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.remove_friend(p_target uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE me uuid := auth.uid();
BEGIN
  IF me IS NULL THEN RAISE EXCEPTION 'Нужен вход' USING ERRCODE = '401'; END IF;
  DELETE FROM public.friendships WHERE (requester_id = me AND addressee_id = p_target) OR (requester_id = p_target AND addressee_id = me);
  RETURN jsonb_build_object('ok', true);
END;
$$;


--
-- Name: remove_wishlist_item(bigint); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.remove_wishlist_item(p_id bigint) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE me uuid := auth.uid();
BEGIN
  IF me IS NULL THEN RAISE EXCEPTION 'Нужен вход' USING ERRCODE = '401'; END IF;
  DELETE FROM public.wishlist WHERE id = p_id AND user_id = me;
  RETURN jsonb_build_object('ok', true);
END;
$$;


--
-- Name: repost(bigint, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.repost(target bigint, note text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  source public.posts;
  fresh bigint;
  who text;
begin
  if not public.viewer_can_write() then raise exception 'Сейчас нельзя'; end if;
  select * into source from public.posts where id = target and not removed;
  if source.id is null then raise exception 'Запись не найдена'; end if;
  if source.repost_of is not null then
    select * into source from public.posts where id = source.repost_of and not removed;
    if source.id is null then raise exception 'Исходная запись пропала'; end if;
  end if;
  if exists (select 1 from public.posts where author_id = auth.uid() and repost_of = source.id) then
    raise exception 'Вы это уже репостнули';
  end if;

  insert into public.posts (author_id, body, mood, kind, media, video, poster, duration, sound, repost_of)
  values (auth.uid(), left(coalesce(note, ''), 500), source.mood, source.kind, source.media,
          source.video, source.poster, source.duration, source.sound, source.id)
  returning id into fresh;

  select display_name into who from public.profiles where id = auth.uid();
  if source.author_id <> auth.uid() then
    perform public.notify_user(source.author_id, 'newpost', 'Ваш ролик репостнули',
      coalesce(who, 'Кто-то') || ' поделился вашей записью',
      jsonb_build_object('post', fresh, 'from', auth.uid()));
  end if;

  return jsonb_build_object('ok', true, 'post', fresh);
end;
$$;


--
-- Name: resolve_login(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.resolve_login(target text) RETURNS text
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select coalesce(p.login_name, p.username)
    from public.usernames u
    join public.profiles p on p.id = u.user_id
   where u.username = lower(regexp_replace(coalesce(target, ''), '^@', ''))
   limit 1;
$$;


--
-- Name: save_custom_theme(jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.save_custom_theme(p_theme jsonb) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE me uuid := auth.uid();
BEGIN
  IF me IS NULL THEN RAISE EXCEPTION 'Нужен вход' USING ERRCODE = '401'; END IF;
  IF NOT public.viewer_is_premium() THEN RAISE EXCEPTION 'Только для премиум' USING ERRCODE = '403'; END IF;
  -- Разрешаем только нужные поля, не больше
  UPDATE public.profiles SET custom_theme = p_theme WHERE id = me;
  RETURN jsonb_build_object('ok', true, 'theme', p_theme);
END;
$$;


--
-- Name: search_all(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.search_all(p_query text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE
  q text := trim(p_query);
BEGIN
  RETURN jsonb_build_object(
    'users', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', p.id, 'username', p.username, 'displayName', p.display_name,
        'avatar', p.avatar, 'hue', p.hue, 'isVerified', p.is_verified
      ) ORDER BY p.username)
      FROM (SELECT * FROM public.profiles WHERE username ILIKE '%' || q || '%' OR display_name ILIKE '%' || q || '%' LIMIT 20) p
    ), '[]'::jsonb),
    'posts', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', pp.id, 'body', pp.body, 'mood', pp.mood, 'createdAt', pp.created_at,
        'author', jsonb_build_object('username', au.username, 'displayName', au.display_name, 'avatar', au.avatar, 'hue', au.hue)
      ) ORDER BY pp.created_at DESC)
      FROM (SELECT * FROM public.posts WHERE body ILIKE '%' || q || '%' AND NOT removed AND is_draft = false ORDER BY created_at DESC LIMIT 20) pp
      JOIN public.profiles au ON au.id = pp.author_id
    ), '[]'::jsonb),
    'groups', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', g.id, 'name', g.name, 'slug', g.slug, 'members', (SELECT count(*) FROM public.group_members WHERE group_id = g.id)
      ) ORDER BY g.name)
      FROM (SELECT * FROM public.groups WHERE NOT is_private AND name ILIKE '%' || q || '%' LIMIT 10) g
    ), '[]'::jsonb)
  );
END;
$$;


--
-- Name: season_now(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.season_now() RETURNS text
    LANGUAGE sql IMMUTABLE
    SET search_path TO 'public'
    AS $$
  select case
    when extract(month from (now() at time zone 'Europe/Moscow')) in (9, 10, 11) then 'autumn'
    when extract(month from (now() at time zone 'Europe/Moscow')) in (12, 1, 2) then 'winter'
    when extract(month from (now() at time zone 'Europe/Moscow')) in (3, 4, 5) then 'spring'
    else 'summer'
  end;
$$;


--
-- Name: season_state(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.season_state() RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  now_season text := public.season_now();
  mine integer;
  all_kinds integer;
begin
  -- Считаем только подарки нынешнего сезона: прошлогодние не должны мешать
  -- собрать осеннюю коллекцию (иначе «1 из 5» висело бы вечно).
  select count(distinct g.type_id) into mine
    from public.gifts g join public.gift_types t on t.id = g.type_id
   where g.owner_id = auth.uid() and not g.sold and t.season = now_season;
  select count(*) into all_kinds from public.gift_types where season = now_season;
  return jsonb_build_object(
    'season', now_season,
    'title', case now_season
      when 'autumn' then 'Осень в СпокУме'
      when 'winter' then 'Зима в СпокУме'
      when 'spring' then 'Весна в СпокУме'
      else 'Лето в СпокУме' end,
    'text', case now_season
      when 'autumn' then 'Сезонные подарки: жёлудь, кленовый лист, плед и какао. Останутся у вас навсегда'
      when 'winter' then 'Зимние подарки появятся в декабре'
      when 'spring' then 'Весенние подарки появятся в марте'
      else 'Летние подарки появятся в июне' end,
    'collected', coalesce(mine, 0),
    'total', coalesce(all_kinds, 0)
  );
end;
$$;


--
-- Name: sell_gift(bigint); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sell_gift(target bigint) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  row public.gifts;
  kind public.gift_types;
  pay integer;
  fee integer;
  boss uuid;
  purse integer;
begin
  select * into row from public.gifts where id = target;
  if row.id is null then raise exception 'Подарок не найден'; end if;
  if row.owner_id <> auth.uid() then raise exception 'Это не ваш подарок'; end if;
  if row.sold then raise exception 'Подарок уже продан'; end if;

  select * into kind from public.gift_types where id = row.type_id;
  if coalesce(kind.price, 0) <= 0 then raise exception 'Такой подарок продать нельзя'; end if;
  pay := greatest(1, (kind.price * 70) / 100);
  fee := greatest(1, (kind.price * 15) / 100);

  perform set_config('spokum.privileged', 'on', true);
  update public.gifts set sold = true, pinned = false where id = target;
  update public.profiles set coins = coins + pay where id = auth.uid() returning coins into purse;
  insert into public.coin_log (user_id, amount, reason) values (auth.uid(), pay, 'Продажа: ' || kind.title);

  select id into boss from public.profiles where username = 'vanya8';
  if boss is not null then
    update public.profiles set coins = coins + fee where id = boss;
    insert into public.coin_log (user_id, amount, reason) values (boss, fee, 'Комиссия с продажи ' || kind.title);
  end if;

  return jsonb_build_object('ok', true, 'paid', pay, 'fee', fee, 'coins', purse);
end;
$$;


--
-- Name: send_friend_request(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.send_friend_request(p_target uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE me uuid := auth.uid(); existing text;
BEGIN
  IF me IS NULL THEN RAISE EXCEPTION 'Нужен вход' USING ERRCODE = '401'; END IF;
  IF me = p_target THEN RAISE EXCEPTION 'Нельзя добавить себя' USING ERRCODE = '400'; END IF;
  SELECT status INTO existing FROM public.friendships WHERE (requester_id = me AND addressee_id = p_target) OR (requester_id = p_target AND addressee_id = me);
  IF existing = 'accepted' THEN RAISE EXCEPTION 'Уже друзья' USING ERRCODE = '409'; END IF;
  IF existing = 'pending' THEN RAISE EXCEPTION 'Заявка уже отправлена' USING ERRCODE = '409'; END IF;
  INSERT INTO public.friendships (requester_id, addressee_id, status) VALUES (me, p_target, 'pending') ON CONFLICT DO NOTHING;
  RETURN jsonb_build_object('ok', true);
END;
$$;


--
-- Name: send_post(bigint, bigint, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.send_post(chat bigint, target bigint, note text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  source public.posts;
  fresh bigint;
begin
  if not public.viewer_can_write() then raise exception 'Сейчас нельзя'; end if;
  if not public.is_chat_member(chat) then raise exception 'Вы не в этом чате'; end if;
  select * into source from public.posts where id = target and not removed;
  if source.id is null then raise exception 'Запись не найдена'; end if;

  insert into public.messages (chat_id, author_id, kind, body, media, duration, post_id)
  values (chat, auth.uid(),
          case when source.video is not null then 'video' else 'post' end,
          left(coalesce(note, ''), 500),
          coalesce(source.video, source.poster, source.image), source.duration, source.id)
  returning id into fresh;

  return jsonb_build_object('ok', true, 'message', fresh);
end;
$$;


--
-- Name: set_main_username(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.set_main_username(target text) RETURNS text
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
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


--
-- Name: set_pin_code(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.set_pin_code(p_code text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE me uuid := auth.uid();
BEGIN
  SET LOCAL row_security = off;
  SET LOCAL spokum.privileged = on;
  IF me IS NULL THEN RAISE EXCEPTION 'Нужен вход' USING ERRCODE = '401'; END IF;
  IF p_code IS NULL OR length(p_code) < 4 OR length(p_code) > 8 THEN
    RAISE EXCEPTION 'Код 4-8 символов' USING ERRCODE = '400';
  END IF;
  UPDATE public.profiles SET pin_code = p_code WHERE id = me;
  RETURN jsonb_build_object('ok', true);
END;
$$;


--
-- Name: set_shelf(jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.set_shelf(rows jsonb) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
begin
  if auth.uid() is null then raise exception 'Нужен вход'; end if;
  if jsonb_array_length(coalesce(rows, '[]'::jsonb)) > 12 then raise exception 'Не больше двенадцати полок'; end if;
  perform set_config('spokum.privileged', 'on', true);
  update public.profiles set shelf = coalesce(rows, '[]'::jsonb) where id = auth.uid();
  perform set_config('spokum.privileged', 'off', true);
  return jsonb_build_object('ok', true);
end;
$$;


--
-- Name: spin_wheel(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.spin_wheel() RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE
  me uuid := auth.uid();
  today date := CURRENT_DATE;
  already boolean;
  prize_type text;
  prize_amount integer;
  roll integer;
BEGIN
  SET LOCAL row_security = off;
  SET LOCAL spokum.privileged = on;
  IF me IS NULL THEN RAISE EXCEPTION 'Нужен вход' USING ERRCODE = '401'; END IF;
  SELECT EXISTS(SELECT 1 FROM public.daily_spins WHERE user_id = me AND day = today) INTO already;
  IF already THEN RAISE EXCEPTION 'Сегодня уже крутили' USING ERRCODE = '409'; END IF;
  roll := floor(random() * 100)::int;
  IF roll < 5 THEN
    prize_type := 'premium'; prize_amount := 3;
    UPDATE public.profiles SET premium_until = GREATEST(COALESCE(premium_until, now()), now()) + interval '3 days' WHERE id = me;
  ELSIF roll < 20 THEN
    prize_type := 'coins'; prize_amount := 100;
    UPDATE public.profiles SET coins = coins + 100 WHERE id = me;
    INSERT INTO public.coin_log (user_id, amount, reason) VALUES (me, 100, 'Колесо фортуны');
  ELSIF roll < 50 THEN
    prize_type := 'coins'; prize_amount := 50;
    UPDATE public.profiles SET coins = coins + 50 WHERE id = me;
    INSERT INTO public.coin_log (user_id, amount, reason) VALUES (me, 50, 'Колесо фортуны');
  ELSIF roll < 80 THEN
    prize_type := 'coins'; prize_amount := 20;
    UPDATE public.profiles SET coins = coins + 20 WHERE id = me;
    INSERT INTO public.coin_log (user_id, amount, reason) VALUES (me, 20, 'Колесо фортуны');
  ELSE
    prize_type := 'coins'; prize_amount := 10;
    UPDATE public.profiles SET coins = coins + 10 WHERE id = me;
    INSERT INTO public.coin_log (user_id, amount, reason) VALUES (me, 10, 'Колесо фортуны');
  END IF;
  INSERT INTO public.daily_spins (user_id, day, reward_type, reward_amount) VALUES (me, today, prize_type, prize_amount);
  RETURN jsonb_build_object('ok', true, 'type', prize_type, 'amount', prize_amount);
END;
$$;


--
-- Name: start_of_week(date); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.start_of_week(d date DEFAULT CURRENT_DATE) RETURNS date
    LANGUAGE sql IMMUTABLE
    AS $$
  SELECT (d - ((extract(dow from d)::int - 1) % 7))::date;
$$;


--
-- Name: start_pixel_battle(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.start_pixel_battle() RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE me uuid := auth.uid(); new_id bigint;
BEGIN
  SET LOCAL row_security = off;
  IF me IS NULL THEN RAISE EXCEPTION 'Нужен вход' USING ERRCODE = '401'; END IF;
  IF NOT public.viewer_is_admin() THEN RAISE EXCEPTION 'Только админ' USING ERRCODE = '403'; END IF;
  UPDATE public.pixel_battles SET active = false WHERE active;
  INSERT INTO public.pixel_battles (active, starts_at, ends_at) VALUES (true, now(), now() + interval '3 days') RETURNING id INTO new_id;
  PERFORM public.notify_admins('pixel_battle', 'Начался пиксель-батл!', 'Захватывай холст', jsonb_build_object('id', new_id));
  RETURN jsonb_build_object('ok', true, 'id', new_id);
END;
$$;


--
-- Name: summer_recap(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.summer_recap() RETURNS jsonb
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select jsonb_build_object(
    'posts', (select count(*) from public.posts
       where author_id = auth.uid() and not removed and created_at >= timestamptz '2026-06-01 00:00:00+03'),
    'likes', (select count(*) from public.likes l
       join public.posts p on p.id = l.post_id
       where p.author_id = auth.uid() and l.created_at >= timestamptz '2026-06-01 00:00:00+03'),
    'answers', (select count(*) from public.comments
       where author_id = auth.uid() and not removed and created_at >= timestamptz '2026-06-01 00:00:00+03'),
    'friends', (select count(*) from public.follows where follower_id = auth.uid()),
    'gifts', (select count(*) from public.gifts where owner_id = auth.uid() and not sold),
    'streak', (select coalesce(best_streak, 0) from public.profiles where id = auth.uid()),
    'coins', (select coalesce(coins, 0) from public.profiles where id = auth.uid())
  );
$$;


--
-- Name: thank_mod(uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.thank_mod(target uuid, note text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  total integer;
  who text;
begin
  if not public.viewer_can_write() then raise exception 'Сейчас нельзя'; end if;
  if not exists (select 1 from public.profiles where id = target and is_moderator) then
    raise exception 'Это не модератор';
  end if;
  if target = auth.uid() then raise exception 'Себя благодарить нельзя'; end if;
  if exists (select 1 from public.thanks where from_id = auth.uid() and mod_id = target
             and created_at > now() - interval '7 days') then
    raise exception 'Вы уже благодарили этого модератора на этой неделе';
  end if;

  insert into public.thanks (from_id, mod_id, note) values (auth.uid(), target, left(coalesce(note, ''), 200));
  select count(*) into total from public.thanks where mod_id = target;
  select display_name into who from public.profiles where id = auth.uid();

  perform public.notify_user(target, 'modaction', 'Вас поблагодарили',
    coalesce(nullif(trim(note), ''), 'Спасибо за работу'), jsonb_build_object('from', auth.uid()));

  if total % 5 = 0 then
    perform set_config('spokum.privileged', 'on', true);
    update public.profiles
       set premium_until = greatest(coalesce(premium_until, now()), now()) + interval '3 days',
           premium_reason = 'Благодарности от людей'
     where id = target;
    perform public.notify_user(target, 'premium', 'Премиум за работу',
      'Пять благодарностей подряд. Три дня премиума ваши', jsonb_build_object('thanks', total));
  end if;

  return jsonb_build_object('ok', true, 'total', total);
end;
$$;


--
-- Name: today_challenge(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.today_challenge() RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE
  today date := CURRENT_DATE;
  dc public.daily_challenges%ROWTYPE;
  me uuid := auth.uid();
  completed boolean := false;
  prog integer := 0;
  targ integer := 1;
BEGIN
  SET LOCAL row_security = off;
  SELECT * INTO dc FROM public.daily_challenges WHERE day = today;
  IF NOT FOUND THEN
    INSERT INTO public.daily_challenges (day, title, description, reward)
      VALUES (today,
        'Челлендж дня',
        'Выполните все ежедневные задания — и награда ваша',
        50)
      RETURNING * INTO dc;
  END IF;
  IF me IS NOT NULL THEN
    SELECT COALESCE(sum(dq.progress), 0), COALESCE(sum(dq.target), 1) INTO prog, targ
      FROM public.daily_quests dq WHERE dq.user_id = me AND dq.day = today AND dq.quest_type = 'daily';
    SELECT EXISTS(SELECT 1 FROM public.daily_challenge_completions WHERE user_id = me AND challenge_id = dc.id) INTO completed;
  END IF;
  RETURN jsonb_build_object(
    'id', dc.id, 'day', dc.day, 'title', dc.title,
    'description', dc.description, 'reward', dc.reward,
    'completed', completed,
    'progress', prog, 'target', GREATEST(targ, 1)
  );
END;
$$;


--
-- Name: today_quote(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.today_quote() RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE
  today date := CURRENT_DATE;
  q public.daily_quotes%ROWTYPE;
  pool text[] := ARRAY[
    'Тише едешь — дальше будешь',
    'Лучший момент начать — сейчас',
    'Дыши. Это пройдёт',
    'Ты достаточно хорош таким, какой есть',
    'Маленькие шаги — тоже движение',
    'Не сравнивай своё начало с чужой серединой',
    'Отдых — это не лень',
    'Сегодня можно не спешить',
    'Ты не обязан быть всем для всех',
    'Говори себе мягко'
  ];
BEGIN
  SELECT * INTO q FROM public.daily_quotes WHERE day = today;
  IF NOT FOUND THEN
    INSERT INTO public.daily_quotes (day, text, author)
      VALUES (today, pool[1 + (extract(doy from today)::int % array_length(pool, 1))], 'СпокУм')
      RETURNING * INTO q;
  END IF;
  RETURN jsonb_build_object('id', q.id, 'text', q.text, 'author', q.author, 'day', q.day);
END;
$$;


--
-- Name: touch_device(text, jsonb, boolean); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.touch_device(fp text, info jsonb, fresh boolean DEFAULT false) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
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


--
-- Name: touch_presence(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.touch_presence() RETURNS void
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  update public.profiles set last_seen = now() where id = auth.uid();
$$;


--
-- Name: touch_streak(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.touch_streak() RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE
  me uuid := auth.uid();
  p public.profiles%ROWTYPE;
  streak integer;
  best integer;
BEGIN
  SET LOCAL row_security = off;
  SET LOCAL spokum.privileged = on;
  IF me IS NULL THEN RAISE EXCEPTION 'Нужен вход' USING ERRCODE = '401'; END IF;
  SELECT * INTO p FROM public.profiles WHERE id = me;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false); END IF;

  IF p.streak_day = CURRENT_DATE THEN
    RETURN jsonb_build_object('ok', true, 'streak', p.streak_days, 'best', p.best_streak, 'already', true);
  END IF;

  IF p.streak_day = CURRENT_DATE - 1 THEN
    streak := p.streak_days + 1;
  ELSIF p.streak_day IS NULL OR p.streak_day < CURRENT_DATE - 1 THEN
    streak := 1;
  ELSE
    streak := p.streak_days;
  END IF;

  best := GREATEST(p.best_streak, streak);
  UPDATE public.profiles
    SET streak_days = streak, streak_day = CURRENT_DATE, best_streak = best
    WHERE id = me;
  -- Награда за стрик (каждые 7 дней +100 монет)
  IF streak % 7 = 0 THEN
    UPDATE public.profiles SET coins = coins + 100 WHERE id = me;
    INSERT INTO public.coin_log (user_id, amount, reason) VALUES (me, 100, 'Награда за стрик ' || streak || ' дней');
  END IF;
  RETURN jsonb_build_object('ok', true, 'streak', streak, 'best', best, 'reward', streak % 7 = 0);
END;
$$;


--
-- Name: tournament_leaderboard(bigint); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.tournament_leaderboard(p_tour_id bigint) RETURNS jsonb
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'userId', gs.user_id, 'username', p.username, 'displayName', p.display_name,
    'avatar', p.avatar, 'hue', p.hue, 'score', max_score
  ) ORDER BY max_score DESC), '[]'::jsonb)
  FROM (
    SELECT user_id, MAX(score) AS max_score
    FROM public.game_scores
    WHERE created_at >= (SELECT starts_at FROM public.tournaments WHERE id = p_tour_id)
      AND created_at <= (SELECT ends_at FROM public.tournaments WHERE id = p_tour_id)
      AND game = (SELECT game_id FROM public.tournaments WHERE id = p_tour_id)
    GROUP BY user_id
  ) gs
  JOIN public.profiles p ON p.id = gs.user_id
  LIMIT 50;
$$;


--
-- Name: unblock_user(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.unblock_user(p_target uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE me uuid := auth.uid();
BEGIN
  IF me IS NULL THEN RAISE EXCEPTION 'Нужен вход' USING ERRCODE = '401'; END IF;
  DELETE FROM public.blocks WHERE blocker_id = me AND blocked_id = p_target;
  RETURN jsonb_build_object('ok', true);
END;
$$;


--
-- Name: username_limit(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.username_limit() RETURNS integer
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select case when public.viewer_is_premium() then 8 else 3 end;
$$;


--
-- Name: viewer_can_write(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.viewer_can_write() RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select coalesce((
    select (banned_until is null or banned_until < now())
       and (muted_until is null or muted_until < now())
    from public.profiles where id = auth.uid()
  ), false);
$$;


--
-- Name: viewer_is_admin(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.viewer_is_admin() RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select coalesce((select is_admin from public.profiles where id = auth.uid()), false);
$$;


--
-- Name: viewer_is_beta(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.viewer_is_beta() RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select coalesce((select is_beta or username = 'silver' from public.profiles where id = auth.uid()), false);
$$;


--
-- Name: viewer_is_moderator(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.viewer_is_moderator() RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select coalesce((select is_moderator or is_admin from public.profiles where id = auth.uid()), false);
$$;


--
-- Name: viewer_is_premium(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.viewer_is_premium() RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select coalesce((select premium_until > now() from public.profiles where id = auth.uid()), false);
$$;


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: ai_chats; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ai_chats (
    id bigint NOT NULL,
    user_id uuid NOT NULL,
    messages jsonb DEFAULT '[]'::jsonb NOT NULL,
    tokens_used integer DEFAULT 0 NOT NULL,
    tokens_reset_at date DEFAULT CURRENT_DATE NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: ai_chats_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.ai_chats ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.ai_chats_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: announcements; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.announcements (
    id bigint NOT NULL,
    title text DEFAULT ''::text NOT NULL,
    body text DEFAULT ''::text NOT NULL,
    tone text DEFAULT 'info'::text NOT NULL,
    author_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    until timestamp with time zone DEFAULT (now() + '7 days'::interval) NOT NULL
);


--
-- Name: announcements_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.announcements ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.announcements_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: appeals; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.appeals (
    id bigint NOT NULL,
    punishment_id bigint NOT NULL,
    user_id uuid NOT NULL,
    body text NOT NULL,
    status text DEFAULT 'open'::text NOT NULL,
    answer text DEFAULT ''::text NOT NULL,
    judge_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    closed_at timestamp with time zone
);


--
-- Name: appeals_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.appeals ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.appeals_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: audit; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.audit (
    id bigint NOT NULL,
    actor_id uuid,
    action text NOT NULL,
    meta jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: audit_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.audit ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.audit_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: badges; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.badges (
    user_id uuid NOT NULL,
    code text NOT NULL,
    earned_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: blocks; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.blocks (
    blocker_id uuid NOT NULL,
    blocked_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT blocks_check CHECK ((blocker_id <> blocked_id))
);


--
-- Name: breaths; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.breaths (
    user_id uuid NOT NULL,
    started_at timestamp with time zone DEFAULT now() NOT NULL,
    minutes integer DEFAULT 0 NOT NULL
);


--
-- Name: call_signals; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.call_signals (
    id bigint NOT NULL,
    chat_id bigint NOT NULL,
    from_id uuid NOT NULL,
    to_id uuid NOT NULL,
    kind text NOT NULL,
    payload jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: call_signals_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.call_signals ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.call_signals_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: campfire_messages; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.campfire_messages (
    id bigint NOT NULL,
    room_id bigint NOT NULL,
    author_id uuid,
    alias text NOT NULL,
    body text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: campfire_messages_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.campfire_messages ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.campfire_messages_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: campfire_rooms; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.campfire_rooms (
    id bigint NOT NULL,
    title text DEFAULT 'Костёр'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    closes_at timestamp with time zone DEFAULT (now() + '01:00:00'::interval) NOT NULL
);


--
-- Name: campfire_rooms_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.campfire_rooms ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.campfire_rooms_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: campfire_seats; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.campfire_seats (
    room_id bigint NOT NULL,
    user_id uuid NOT NULL,
    alias text NOT NULL,
    joined_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: capsules; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.capsules (
    id bigint NOT NULL,
    user_id uuid NOT NULL,
    body text NOT NULL,
    open_at timestamp with time zone NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    opened_at timestamp with time zone
);


--
-- Name: capsules_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.capsules ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.capsules_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: chat_members; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.chat_members (
    chat_id bigint NOT NULL,
    user_id uuid NOT NULL,
    role text DEFAULT 'member'::text NOT NULL,
    read_at timestamp with time zone DEFAULT to_timestamp((0)::double precision) NOT NULL
);


--
-- Name: chats; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.chats (
    id bigint NOT NULL,
    kind text DEFAULT 'dm'::text NOT NULL,
    title text DEFAULT ''::text NOT NULL,
    hue integer DEFAULT 220 NOT NULL,
    owner_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT chat_kind CHECK ((kind = ANY (ARRAY['dm'::text, 'group'::text, 'channel'::text])))
);


--
-- Name: chats_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.chats ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.chats_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: coin_log; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.coin_log (
    id bigint NOT NULL,
    user_id uuid NOT NULL,
    amount integer NOT NULL,
    reason text DEFAULT ''::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: coin_log_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.coin_log ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.coin_log_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: comments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.comments (
    id bigint NOT NULL,
    post_id bigint NOT NULL,
    author_id uuid NOT NULL,
    body text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    removed boolean DEFAULT false NOT NULL,
    removed_by uuid,
    removed_reason text DEFAULT ''::text NOT NULL,
    removed_auto boolean DEFAULT false NOT NULL,
    reply_to_id bigint,
    reply_to_user uuid
);


--
-- Name: comments_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.comments ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.comments_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: confessions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.confessions (
    id bigint NOT NULL,
    author_id uuid NOT NULL,
    body text NOT NULL,
    mood text DEFAULT 'calm'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    removed boolean DEFAULT false NOT NULL
);


--
-- Name: confessions_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.confessions ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.confessions_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: contacts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.contacts (
    user_id uuid NOT NULL,
    contact_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: daily_challenge_completions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.daily_challenge_completions (
    user_id uuid NOT NULL,
    challenge_id bigint NOT NULL,
    completed_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: daily_challenges; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.daily_challenges (
    id bigint NOT NULL,
    day date DEFAULT CURRENT_DATE NOT NULL,
    title text NOT NULL,
    description text NOT NULL,
    reward integer DEFAULT 50 NOT NULL
);


--
-- Name: daily_challenges_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.daily_challenges ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.daily_challenges_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: daily_quests; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.daily_quests (
    id bigint NOT NULL,
    user_id uuid NOT NULL,
    day date DEFAULT CURRENT_DATE NOT NULL,
    quest_key text NOT NULL,
    progress integer DEFAULT 0 NOT NULL,
    target integer DEFAULT 1 NOT NULL,
    reward integer DEFAULT 10 NOT NULL,
    completed boolean DEFAULT false NOT NULL,
    claimed boolean DEFAULT false NOT NULL,
    quest_type text DEFAULT 'daily'::text NOT NULL,
    week_start date
);


--
-- Name: daily_quests_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.daily_quests ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.daily_quests_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: daily_quotes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.daily_quotes (
    id bigint NOT NULL,
    day date DEFAULT CURRENT_DATE NOT NULL,
    text text NOT NULL,
    author text DEFAULT ''::text NOT NULL
);


--
-- Name: daily_quotes_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.daily_quotes ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.daily_quotes_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: daily_spins; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.daily_spins (
    user_id uuid NOT NULL,
    day date DEFAULT CURRENT_DATE NOT NULL,
    reward_type text NOT NULL,
    reward_amount integer DEFAULT 0 NOT NULL,
    spun_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: device_bans; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.device_bans (
    id bigint NOT NULL,
    device_id text NOT NULL,
    until timestamp with time zone,
    reason text DEFAULT ''::text NOT NULL,
    actor_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    lifted_at timestamp with time zone,
    lifted_by uuid
);


--
-- Name: device_bans_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.device_bans ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.device_bans_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: device_users; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.device_users (
    device_id text NOT NULL,
    user_id uuid NOT NULL,
    first_seen timestamp with time zone DEFAULT now() NOT NULL,
    last_seen timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: devices; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.devices (
    id text NOT NULL,
    label text DEFAULT ''::text NOT NULL,
    platform text DEFAULT ''::text NOT NULL,
    country text DEFAULT ''::text NOT NULL,
    app text DEFAULT 'web'::text NOT NULL,
    first_seen timestamp with time zone DEFAULT now() NOT NULL,
    last_seen timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: event_claims; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.event_claims (
    event_id text NOT NULL,
    user_id uuid NOT NULL,
    claimed_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: event_progress; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.event_progress (
    event_id bigint NOT NULL,
    user_id uuid NOT NULL,
    progress integer DEFAULT 0 NOT NULL,
    target integer DEFAULT 10 NOT NULL,
    claimed boolean DEFAULT false NOT NULL
);


--
-- Name: follows; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.follows (
    follower_id uuid NOT NULL,
    target_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: friendships; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.friendships (
    requester_id uuid NOT NULL,
    addressee_id uuid NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: game_scores; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.game_scores (
    id bigint NOT NULL,
    user_id uuid NOT NULL,
    game text NOT NULL,
    score integer NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: game_scores_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.game_scores ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.game_scores_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: gift_types; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.gift_types (
    id text NOT NULL,
    title text NOT NULL,
    price integer DEFAULT 50 NOT NULL,
    rarity text DEFAULT 'common'::text NOT NULL,
    art text DEFAULT 'spark'::text NOT NULL,
    hue integer DEFAULT 220 NOT NULL,
    sort integer DEFAULT 0 NOT NULL,
    season text DEFAULT ''::text NOT NULL,
    is_limited boolean DEFAULT false NOT NULL,
    limited_count integer DEFAULT 0 NOT NULL,
    limited_sold integer DEFAULT 0 NOT NULL
);


--
-- Name: gifts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.gifts (
    id bigint NOT NULL,
    type_id text NOT NULL,
    owner_id uuid NOT NULL,
    from_id uuid,
    note text DEFAULT ''::text NOT NULL,
    pinned boolean DEFAULT false NOT NULL,
    sold boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: gifts_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.gifts ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.gifts_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: gratitude_entries; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.gratitude_entries (
    id bigint NOT NULL,
    author_id uuid NOT NULL,
    body text NOT NULL,
    anonymous boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: gratitude_entries_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.gratitude_entries ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.gratitude_entries_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: group_members; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.group_members (
    group_id bigint NOT NULL,
    user_id uuid NOT NULL,
    role text DEFAULT 'member'::text NOT NULL,
    joined_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: groups; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.groups (
    id bigint NOT NULL,
    name text NOT NULL,
    slug text NOT NULL,
    description text DEFAULT ''::text NOT NULL,
    hue integer DEFAULT 220 NOT NULL,
    owner_id uuid NOT NULL,
    is_private boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: groups_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.groups ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.groups_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: guard_config; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.guard_config (
    id integer DEFAULT 1 NOT NULL,
    live boolean DEFAULT true NOT NULL,
    hide_at integer DEFAULT 4 NOT NULL,
    mass_at integer DEFAULT 4 NOT NULL,
    watch_links boolean DEFAULT true NOT NULL,
    watch_caps boolean DEFAULT true NOT NULL,
    watch_flood boolean DEFAULT true NOT NULL,
    CONSTRAINT guard_config_one CHECK ((id = 1))
);


--
-- Name: guard_hits; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.guard_hits (
    id bigint NOT NULL,
    source text DEFAULT 'filter'::text NOT NULL,
    target_kind text NOT NULL,
    target_id bigint NOT NULL,
    user_id uuid,
    score integer DEFAULT 0 NOT NULL,
    verdict jsonb DEFAULT '{}'::jsonb NOT NULL,
    action text DEFAULT 'flagged'::text NOT NULL,
    body text DEFAULT ''::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    undone boolean DEFAULT false NOT NULL,
    undone_by uuid,
    undone_at timestamp with time zone,
    kept boolean DEFAULT false NOT NULL
);


--
-- Name: guard_hits_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.guard_hits ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.guard_hits_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: guard_words; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.guard_words (
    id bigint NOT NULL,
    word text NOT NULL,
    kind text DEFAULT 'insult'::text NOT NULL,
    weight integer DEFAULT 3 NOT NULL,
    live boolean DEFAULT true NOT NULL,
    added_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT guard_word_kind CHECK ((kind = ANY (ARRAY['insult'::text, 'threat'::text, 'spam'::text, 'link'::text])))
);


--
-- Name: guard_words_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.guard_words ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.guard_words_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: invite_uses; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.invite_uses (
    id bigint NOT NULL,
    code text NOT NULL,
    owner_id uuid NOT NULL,
    guest_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: invite_uses_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.invite_uses ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.invite_uses_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: invites; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.invites (
    code text NOT NULL,
    owner_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: journal; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.journal (
    id bigint NOT NULL,
    user_id uuid NOT NULL,
    day date NOT NULL,
    body text DEFAULT ''::text NOT NULL,
    mood text,
    word text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: journal_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.journal ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.journal_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: letters; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.letters (
    id bigint NOT NULL,
    author_id uuid NOT NULL,
    body text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    to_id uuid,
    taken_at timestamp with time zone,
    reply text,
    replied_at timestamp with time zone
);


--
-- Name: letters_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.letters ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.letters_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: likes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.likes (
    post_id bigint NOT NULL,
    user_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    kind text DEFAULT 'heart'::text NOT NULL
);


--
-- Name: link_codes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.link_codes (
    code text NOT NULL,
    user_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    expires_at timestamp with time zone DEFAULT (now() + '00:20:00'::interval) NOT NULL,
    used_at timestamp with time zone
);


--
-- Name: mentor_reviews; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.mentor_reviews (
    id bigint NOT NULL,
    mentor_id uuid NOT NULL,
    student_id uuid NOT NULL,
    punishment_id bigint,
    verdict text NOT NULL,
    note text DEFAULT ''::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: mentor_reviews_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.mentor_reviews ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.mentor_reviews_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: mentorships; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.mentorships (
    id bigint NOT NULL,
    mentor_id uuid NOT NULL,
    student_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    ended_at timestamp with time zone
);


--
-- Name: mentorships_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.mentorships ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.mentorships_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: message_reactions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.message_reactions (
    message_id bigint NOT NULL,
    user_id uuid NOT NULL,
    glyph text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: messages; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.messages (
    id bigint NOT NULL,
    chat_id bigint NOT NULL,
    author_id uuid,
    kind text DEFAULT 'text'::text NOT NULL,
    body text DEFAULT ''::text NOT NULL,
    media text,
    duration integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    removed boolean DEFAULT false NOT NULL,
    post_id bigint,
    reply_to_id bigint
);


--
-- Name: messages_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.messages ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.messages_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: mod_strikes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.mod_strikes (
    id bigint NOT NULL,
    moderator_id uuid NOT NULL,
    admin_id uuid,
    reason text DEFAULT ''::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: mod_strikes_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.mod_strikes ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.mod_strikes_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: notifications; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.notifications (
    id bigint NOT NULL,
    user_id uuid NOT NULL,
    kind text NOT NULL,
    title text DEFAULT ''::text NOT NULL,
    body text DEFAULT ''::text NOT NULL,
    meta jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    read_at timestamp with time zone
);


--
-- Name: notifications_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.notifications ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.notifications_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: payments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.payments (
    id bigint NOT NULL,
    user_id uuid,
    tg_id bigint,
    charge_id text,
    stars integer DEFAULT 0 NOT NULL,
    days integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    refunded_at timestamp with time zone
);


--
-- Name: payments_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.payments ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.payments_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: people_notes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.people_notes (
    owner_id uuid NOT NULL,
    target_id uuid NOT NULL,
    note text DEFAULT ''::text NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: pixel_battles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.pixel_battles (
    id bigint NOT NULL,
    active boolean DEFAULT false NOT NULL,
    starts_at timestamp with time zone DEFAULT now() NOT NULL,
    ends_at timestamp with time zone DEFAULT (now() + '3 days'::interval) NOT NULL,
    width integer DEFAULT 80 NOT NULL,
    height integer DEFAULT 50 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: pixel_battles_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.pixel_battles ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.pixel_battles_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: pixel_cells; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.pixel_cells (
    battle_id bigint NOT NULL,
    x integer NOT NULL,
    y integer NOT NULL,
    color text DEFAULT '#1a1d22'::text NOT NULL,
    user_id uuid,
    placed_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: pixel_cooldowns; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.pixel_cooldowns (
    user_id uuid NOT NULL,
    battle_id bigint NOT NULL,
    pixels_placed integer DEFAULT 0 NOT NULL,
    cooldown_until timestamp with time zone
);


--
-- Name: poll_votes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.poll_votes (
    post_id bigint NOT NULL,
    user_id uuid NOT NULL,
    choice integer NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: posts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.posts (
    id bigint NOT NULL,
    author_id uuid NOT NULL,
    body text DEFAULT ''::text NOT NULL,
    image text,
    mood text DEFAULT 'calm'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    removed boolean DEFAULT false NOT NULL,
    removed_by uuid,
    removed_reason text DEFAULT ''::text NOT NULL,
    removed_at timestamp with time zone,
    kind text DEFAULT 'text'::text NOT NULL,
    media jsonb DEFAULT '[]'::jsonb NOT NULL,
    video text,
    poster text,
    duration integer DEFAULT 0 NOT NULL,
    views integer DEFAULT 0 NOT NULL,
    sound text,
    repost_of bigint,
    removed_proof text,
    poll jsonb,
    pinned boolean DEFAULT false NOT NULL,
    publish_at timestamp with time zone DEFAULT now() NOT NULL,
    removed_auto boolean DEFAULT false NOT NULL,
    group_id bigint,
    is_pinned boolean DEFAULT false NOT NULL,
    is_draft boolean DEFAULT false NOT NULL
);


--
-- Name: posts_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.posts ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.posts_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: profile_views; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.profile_views (
    id bigint NOT NULL,
    profile_id uuid NOT NULL,
    viewer_id uuid,
    viewed_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: profile_views_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.profile_views ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.profile_views_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: profiles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.profiles (
    id uuid NOT NULL,
    username text NOT NULL,
    display_name text DEFAULT ''::text NOT NULL,
    bio text DEFAULT ''::text NOT NULL,
    hue integer DEFAULT 220 NOT NULL,
    avatar text,
    mood text DEFAULT 'calm'::text NOT NULL,
    theme text DEFAULT 'calm'::text NOT NULL,
    accent text DEFAULT 'mint'::text NOT NULL,
    is_admin boolean DEFAULT false NOT NULL,
    is_moderator boolean DEFAULT false NOT NULL,
    is_developer boolean DEFAULT false NOT NULL,
    is_verified boolean DEFAULT false NOT NULL,
    banned_until timestamp with time zone,
    muted_until timestamp with time zone,
    ban_reason text DEFAULT ''::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    last_seen timestamp with time zone DEFAULT now() NOT NULL,
    premium_until timestamp with time zone,
    pins jsonb DEFAULT '[]'::jsonb NOT NULL,
    status_icon text,
    banner text,
    day_word text,
    day_word_at timestamp with time zone,
    share_word boolean DEFAULT false NOT NULL,
    premium_reason text DEFAULT ''::text NOT NULL,
    premium_granted_at timestamp with time zone,
    mod_rank smallint DEFAULT 0 NOT NULL,
    login_name text,
    notify_posts boolean DEFAULT true NOT NULL,
    is_beta boolean DEFAULT false NOT NULL,
    coins integer DEFAULT 0 NOT NULL,
    streak_days integer DEFAULT 0 NOT NULL,
    streak_day date,
    best_streak integer DEFAULT 0 NOT NULL,
    shelf jsonb DEFAULT '[]'::jsonb NOT NULL,
    custom_theme jsonb DEFAULT '{}'::jsonb NOT NULL,
    ui_version text DEFAULT 'v1'::text NOT NULL,
    xp integer DEFAULT 0 NOT NULL,
    level integer DEFAULT 1 NOT NULL,
    pin_code text,
    CONSTRAINT ui_version_chk CHECK ((ui_version = ANY (ARRAY['v1'::text, 'v2'::text]))),
    CONSTRAINT username_format CHECK ((username ~ '^[a-z0-9_]{3,20}$'::text))
);


--
-- Name: promocode_uses; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.promocode_uses (
    id bigint NOT NULL,
    user_id uuid NOT NULL,
    promocode_id bigint NOT NULL,
    used_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: promocode_uses_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.promocode_uses ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.promocode_uses_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: promocodes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.promocodes (
    id bigint NOT NULL,
    code text NOT NULL,
    reward_type text NOT NULL,
    reward_amount integer NOT NULL,
    reward_days integer DEFAULT 0 NOT NULL,
    max_uses integer DEFAULT 0 NOT NULL,
    used_count integer DEFAULT 0 NOT NULL,
    expires_at timestamp with time zone,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    disabled boolean DEFAULT false NOT NULL,
    CONSTRAINT promocodes_reward_type_check CHECK ((reward_type = ANY (ARRAY['coins'::text, 'premium'::text, 'coins_premium'::text])))
);


--
-- Name: promocodes_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.promocodes ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.promocodes_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: punishments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.punishments (
    id bigint NOT NULL,
    actor_id uuid,
    user_id uuid NOT NULL,
    kind text NOT NULL,
    minutes integer DEFAULT 0 NOT NULL,
    reason text DEFAULT ''::text NOT NULL,
    post_id bigint,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    reverted boolean DEFAULT false NOT NULL,
    reverted_by uuid
);


--
-- Name: punishments_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.punishments ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.punishments_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: recovery_codes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.recovery_codes (
    id bigint NOT NULL,
    user_id uuid NOT NULL,
    code_hash text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    used_at timestamp with time zone
);


--
-- Name: recovery_codes_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.recovery_codes_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: recovery_codes_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.recovery_codes_id_seq OWNED BY public.recovery_codes.id;


--
-- Name: recovery_tries; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.recovery_tries (
    id bigint NOT NULL,
    user_id uuid,
    at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: recovery_tries_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.recovery_tries_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: recovery_tries_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.recovery_tries_id_seq OWNED BY public.recovery_tries.id;


--
-- Name: reminders; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.reminders (
    id bigint NOT NULL,
    user_id uuid NOT NULL,
    body text DEFAULT ''::text NOT NULL,
    ring_at timestamp with time zone NOT NULL,
    done boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: reminders_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.reminders ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.reminders_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: reports; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.reports (
    id bigint NOT NULL,
    reporter_id uuid NOT NULL,
    target_kind text NOT NULL,
    target_id text NOT NULL,
    target_user uuid,
    reason text NOT NULL,
    image text,
    status text DEFAULT 'open'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    handled_by uuid,
    handled_at timestamp with time zone
);


--
-- Name: reports_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.reports ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.reports_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: season_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.season_events (
    id bigint NOT NULL,
    name text NOT NULL,
    description text DEFAULT ''::text NOT NULL,
    starts_at timestamp with time zone DEFAULT now() NOT NULL,
    ends_at timestamp with time zone NOT NULL,
    active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: season_events_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.season_events ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.season_events_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: stickers; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.stickers (
    id bigint NOT NULL,
    owner_id uuid NOT NULL,
    image text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: stickers_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.stickers ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.stickers_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: stories; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.stories (
    id bigint NOT NULL,
    author_id uuid NOT NULL,
    kind text DEFAULT 'video'::text NOT NULL,
    media text NOT NULL,
    storage_path text,
    caption text DEFAULT ''::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    expires_at timestamp with time zone DEFAULT (now() + '24:00:00'::interval) NOT NULL
);


--
-- Name: stories_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.stories ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.stories_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: tg_links; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tg_links (
    tg_id bigint NOT NULL,
    user_id uuid NOT NULL,
    tg_name text DEFAULT ''::text NOT NULL,
    linked_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: thanks; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.thanks (
    id bigint NOT NULL,
    from_id uuid NOT NULL,
    mod_id uuid NOT NULL,
    note text DEFAULT ''::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: thanks_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.thanks ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.thanks_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: tournaments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tournaments (
    id bigint NOT NULL,
    game_id text NOT NULL,
    title text NOT NULL,
    starts_at timestamp with time zone DEFAULT now() NOT NULL,
    ends_at timestamp with time zone NOT NULL,
    prize_1 integer DEFAULT 500 NOT NULL,
    prize_2 integer DEFAULT 300 NOT NULL,
    prize_3 integer DEFAULT 150 NOT NULL,
    active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: tournaments_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.tournaments ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.tournaments_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: usernames; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.usernames (
    username text NOT NULL,
    user_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: wishlist; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.wishlist (
    id bigint NOT NULL,
    user_id uuid NOT NULL,
    title text NOT NULL,
    link text,
    granted_by uuid,
    granted_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: wishlist_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.wishlist ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.wishlist_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: recovery_codes id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.recovery_codes ALTER COLUMN id SET DEFAULT nextval('public.recovery_codes_id_seq'::regclass);


--
-- Name: recovery_tries id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.recovery_tries ALTER COLUMN id SET DEFAULT nextval('public.recovery_tries_id_seq'::regclass);


--
-- Name: ai_chats ai_chats_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ai_chats
    ADD CONSTRAINT ai_chats_pkey PRIMARY KEY (id);


--
-- Name: announcements announcements_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.announcements
    ADD CONSTRAINT announcements_pkey PRIMARY KEY (id);


--
-- Name: appeals appeals_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.appeals
    ADD CONSTRAINT appeals_pkey PRIMARY KEY (id);


--
-- Name: audit audit_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.audit
    ADD CONSTRAINT audit_pkey PRIMARY KEY (id);


--
-- Name: badges badges_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.badges
    ADD CONSTRAINT badges_pkey PRIMARY KEY (user_id, code);


--
-- Name: blocks blocks_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.blocks
    ADD CONSTRAINT blocks_pkey PRIMARY KEY (blocker_id, blocked_id);


--
-- Name: breaths breaths_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.breaths
    ADD CONSTRAINT breaths_pkey PRIMARY KEY (user_id);


--
-- Name: call_signals call_signals_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.call_signals
    ADD CONSTRAINT call_signals_pkey PRIMARY KEY (id);


--
-- Name: campfire_messages campfire_messages_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.campfire_messages
    ADD CONSTRAINT campfire_messages_pkey PRIMARY KEY (id);


--
-- Name: campfire_rooms campfire_rooms_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.campfire_rooms
    ADD CONSTRAINT campfire_rooms_pkey PRIMARY KEY (id);


--
-- Name: campfire_seats campfire_seats_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.campfire_seats
    ADD CONSTRAINT campfire_seats_pkey PRIMARY KEY (room_id, user_id);


--
-- Name: capsules capsules_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.capsules
    ADD CONSTRAINT capsules_pkey PRIMARY KEY (id);


--
-- Name: chat_members chat_members_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chat_members
    ADD CONSTRAINT chat_members_pkey PRIMARY KEY (chat_id, user_id);


--
-- Name: chats chats_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chats
    ADD CONSTRAINT chats_pkey PRIMARY KEY (id);


--
-- Name: coin_log coin_log_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.coin_log
    ADD CONSTRAINT coin_log_pkey PRIMARY KEY (id);


--
-- Name: comments comments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.comments
    ADD CONSTRAINT comments_pkey PRIMARY KEY (id);


--
-- Name: confessions confessions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.confessions
    ADD CONSTRAINT confessions_pkey PRIMARY KEY (id);


--
-- Name: contacts contacts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contacts
    ADD CONSTRAINT contacts_pkey PRIMARY KEY (user_id, contact_id);


--
-- Name: daily_challenge_completions daily_challenge_completions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.daily_challenge_completions
    ADD CONSTRAINT daily_challenge_completions_pkey PRIMARY KEY (user_id, challenge_id);


--
-- Name: daily_challenges daily_challenges_day_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.daily_challenges
    ADD CONSTRAINT daily_challenges_day_key UNIQUE (day);


--
-- Name: daily_challenges daily_challenges_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.daily_challenges
    ADD CONSTRAINT daily_challenges_pkey PRIMARY KEY (id);


--
-- Name: daily_quests daily_quests_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.daily_quests
    ADD CONSTRAINT daily_quests_pkey PRIMARY KEY (id);


--
-- Name: daily_quotes daily_quotes_day_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.daily_quotes
    ADD CONSTRAINT daily_quotes_day_key UNIQUE (day);


--
-- Name: daily_quotes daily_quotes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.daily_quotes
    ADD CONSTRAINT daily_quotes_pkey PRIMARY KEY (id);


--
-- Name: daily_spins daily_spins_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.daily_spins
    ADD CONSTRAINT daily_spins_pkey PRIMARY KEY (user_id, day);


--
-- Name: device_bans device_bans_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.device_bans
    ADD CONSTRAINT device_bans_pkey PRIMARY KEY (id);


--
-- Name: device_users device_users_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.device_users
    ADD CONSTRAINT device_users_pkey PRIMARY KEY (device_id, user_id);


--
-- Name: devices devices_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.devices
    ADD CONSTRAINT devices_pkey PRIMARY KEY (id);


--
-- Name: daily_quests dq_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.daily_quests
    ADD CONSTRAINT dq_unique UNIQUE (user_id, day, week_start, quest_key);


--
-- Name: event_claims event_claims_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.event_claims
    ADD CONSTRAINT event_claims_pkey PRIMARY KEY (event_id, user_id);


--
-- Name: event_progress event_progress_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.event_progress
    ADD CONSTRAINT event_progress_pkey PRIMARY KEY (event_id, user_id);


--
-- Name: follows follows_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.follows
    ADD CONSTRAINT follows_pkey PRIMARY KEY (follower_id, target_id);


--
-- Name: friendships friendships_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.friendships
    ADD CONSTRAINT friendships_pkey PRIMARY KEY (requester_id, addressee_id);


--
-- Name: game_scores game_scores_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.game_scores
    ADD CONSTRAINT game_scores_pkey PRIMARY KEY (id);


--
-- Name: gift_types gift_types_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gift_types
    ADD CONSTRAINT gift_types_pkey PRIMARY KEY (id);


--
-- Name: gifts gifts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gifts
    ADD CONSTRAINT gifts_pkey PRIMARY KEY (id);


--
-- Name: gratitude_entries gratitude_entries_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gratitude_entries
    ADD CONSTRAINT gratitude_entries_pkey PRIMARY KEY (id);


--
-- Name: group_members group_members_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.group_members
    ADD CONSTRAINT group_members_pkey PRIMARY KEY (group_id, user_id);


--
-- Name: groups groups_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.groups
    ADD CONSTRAINT groups_pkey PRIMARY KEY (id);


--
-- Name: groups groups_slug_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.groups
    ADD CONSTRAINT groups_slug_key UNIQUE (slug);


--
-- Name: guard_config guard_config_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.guard_config
    ADD CONSTRAINT guard_config_pkey PRIMARY KEY (id);


--
-- Name: guard_hits guard_hits_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.guard_hits
    ADD CONSTRAINT guard_hits_pkey PRIMARY KEY (id);


--
-- Name: guard_words guard_words_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.guard_words
    ADD CONSTRAINT guard_words_pkey PRIMARY KEY (id);


--
-- Name: guard_words guard_words_word_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.guard_words
    ADD CONSTRAINT guard_words_word_key UNIQUE (word);


--
-- Name: invite_uses invite_uses_guest_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.invite_uses
    ADD CONSTRAINT invite_uses_guest_id_key UNIQUE (guest_id);


--
-- Name: invite_uses invite_uses_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.invite_uses
    ADD CONSTRAINT invite_uses_pkey PRIMARY KEY (id);


--
-- Name: invites invites_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.invites
    ADD CONSTRAINT invites_pkey PRIMARY KEY (code);


--
-- Name: journal journal_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.journal
    ADD CONSTRAINT journal_pkey PRIMARY KEY (id);


--
-- Name: journal journal_user_id_day_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.journal
    ADD CONSTRAINT journal_user_id_day_key UNIQUE (user_id, day);


--
-- Name: letters letters_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.letters
    ADD CONSTRAINT letters_pkey PRIMARY KEY (id);


--
-- Name: likes likes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.likes
    ADD CONSTRAINT likes_pkey PRIMARY KEY (post_id, user_id);


--
-- Name: link_codes link_codes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.link_codes
    ADD CONSTRAINT link_codes_pkey PRIMARY KEY (code);


--
-- Name: mentor_reviews mentor_reviews_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mentor_reviews
    ADD CONSTRAINT mentor_reviews_pkey PRIMARY KEY (id);


--
-- Name: mentorships mentorships_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mentorships
    ADD CONSTRAINT mentorships_pkey PRIMARY KEY (id);


--
-- Name: message_reactions message_reactions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.message_reactions
    ADD CONSTRAINT message_reactions_pkey PRIMARY KEY (message_id, user_id);


--
-- Name: messages messages_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.messages
    ADD CONSTRAINT messages_pkey PRIMARY KEY (id);


--
-- Name: mod_strikes mod_strikes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mod_strikes
    ADD CONSTRAINT mod_strikes_pkey PRIMARY KEY (id);


--
-- Name: notifications notifications_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT notifications_pkey PRIMARY KEY (id);


--
-- Name: payments payments_charge_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payments
    ADD CONSTRAINT payments_charge_id_key UNIQUE (charge_id);


--
-- Name: payments payments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payments
    ADD CONSTRAINT payments_pkey PRIMARY KEY (id);


--
-- Name: people_notes people_notes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.people_notes
    ADD CONSTRAINT people_notes_pkey PRIMARY KEY (owner_id, target_id);


--
-- Name: pixel_battles pixel_battles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pixel_battles
    ADD CONSTRAINT pixel_battles_pkey PRIMARY KEY (id);


--
-- Name: pixel_cells pixel_cells_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pixel_cells
    ADD CONSTRAINT pixel_cells_pkey PRIMARY KEY (battle_id, x, y);


--
-- Name: pixel_cooldowns pixel_cooldowns_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pixel_cooldowns
    ADD CONSTRAINT pixel_cooldowns_pkey PRIMARY KEY (user_id, battle_id);


--
-- Name: poll_votes poll_votes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.poll_votes
    ADD CONSTRAINT poll_votes_pkey PRIMARY KEY (post_id, user_id);


--
-- Name: posts posts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.posts
    ADD CONSTRAINT posts_pkey PRIMARY KEY (id);


--
-- Name: profile_views profile_views_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profile_views
    ADD CONSTRAINT profile_views_pkey PRIMARY KEY (id);


--
-- Name: profiles profiles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_pkey PRIMARY KEY (id);


--
-- Name: profiles profiles_username_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_username_key UNIQUE (username);


--
-- Name: promocode_uses promocode_uses_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.promocode_uses
    ADD CONSTRAINT promocode_uses_pkey PRIMARY KEY (id);


--
-- Name: promocode_uses promocode_uses_user_id_promocode_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.promocode_uses
    ADD CONSTRAINT promocode_uses_user_id_promocode_id_key UNIQUE (user_id, promocode_id);


--
-- Name: promocodes promocodes_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.promocodes
    ADD CONSTRAINT promocodes_code_key UNIQUE (code);


--
-- Name: promocodes promocodes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.promocodes
    ADD CONSTRAINT promocodes_pkey PRIMARY KEY (id);


--
-- Name: punishments punishments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.punishments
    ADD CONSTRAINT punishments_pkey PRIMARY KEY (id);


--
-- Name: recovery_codes recovery_codes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.recovery_codes
    ADD CONSTRAINT recovery_codes_pkey PRIMARY KEY (id);


--
-- Name: recovery_tries recovery_tries_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.recovery_tries
    ADD CONSTRAINT recovery_tries_pkey PRIMARY KEY (id);


--
-- Name: reminders reminders_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reminders
    ADD CONSTRAINT reminders_pkey PRIMARY KEY (id);


--
-- Name: reports reports_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reports
    ADD CONSTRAINT reports_pkey PRIMARY KEY (id);


--
-- Name: season_events season_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.season_events
    ADD CONSTRAINT season_events_pkey PRIMARY KEY (id);


--
-- Name: stickers stickers_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stickers
    ADD CONSTRAINT stickers_pkey PRIMARY KEY (id);


--
-- Name: stories stories_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stories
    ADD CONSTRAINT stories_pkey PRIMARY KEY (id);


--
-- Name: tg_links tg_links_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tg_links
    ADD CONSTRAINT tg_links_pkey PRIMARY KEY (tg_id);


--
-- Name: thanks thanks_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.thanks
    ADD CONSTRAINT thanks_pkey PRIMARY KEY (id);


--
-- Name: tournaments tournaments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tournaments
    ADD CONSTRAINT tournaments_pkey PRIMARY KEY (id);


--
-- Name: usernames usernames_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.usernames
    ADD CONSTRAINT usernames_pkey PRIMARY KEY (username);


--
-- Name: wishlist wishlist_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.wishlist
    ADD CONSTRAINT wishlist_pkey PRIMARY KEY (id);


--
-- Name: announcements_until_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX announcements_until_idx ON public.announcements USING btree (until DESC);


--
-- Name: appeals_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX appeals_status ON public.appeals USING btree (status, created_at DESC);


--
-- Name: call_signals_to_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX call_signals_to_idx ON public.call_signals USING btree (to_id, created_at DESC);


--
-- Name: campfire_messages_room_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX campfire_messages_room_idx ON public.campfire_messages USING btree (room_id, id DESC);


--
-- Name: capsules_user_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX capsules_user_idx ON public.capsules USING btree (user_id, open_at);


--
-- Name: chat_members_user_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX chat_members_user_idx ON public.chat_members USING btree (user_id);


--
-- Name: coin_log_user_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX coin_log_user_idx ON public.coin_log USING btree (user_id, created_at DESC);


--
-- Name: comments_post_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX comments_post_idx ON public.comments USING btree (post_id);


--
-- Name: device_bans_device_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX device_bans_device_idx ON public.device_bans USING btree (device_id, created_at DESC);


--
-- Name: device_users_user_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX device_users_user_idx ON public.device_users USING btree (user_id, last_seen DESC);


--
-- Name: follows_target_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX follows_target_idx ON public.follows USING btree (target_id);


--
-- Name: game_scores_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX game_scores_idx ON public.game_scores USING btree (game, score DESC);


--
-- Name: gifts_owner_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX gifts_owner_idx ON public.gifts USING btree (owner_id, created_at DESC);


--
-- Name: guard_hits_fresh_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX guard_hits_fresh_idx ON public.guard_hits USING btree (created_at DESC);


--
-- Name: guard_hits_target_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX guard_hits_target_idx ON public.guard_hits USING btree (target_kind, target_id);


--
-- Name: idx_blocks_blocked; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_blocks_blocked ON public.blocks USING btree (blocked_id);


--
-- Name: idx_conf_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_conf_created ON public.confessions USING btree (created_at DESC);


--
-- Name: idx_dq_user_day; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_dq_user_day ON public.daily_quests USING btree (user_id, day);


--
-- Name: idx_dq_week; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_dq_week ON public.daily_quests USING btree (user_id, week_start);


--
-- Name: idx_friend_addressee; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_friend_addressee ON public.friendships USING btree (addressee_id, status);


--
-- Name: idx_gm_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_gm_user ON public.group_members USING btree (user_id);


--
-- Name: idx_gratitude_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_gratitude_created ON public.gratitude_entries USING btree (created_at DESC);


--
-- Name: idx_groups_slug; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_groups_slug ON public.groups USING btree (slug);


--
-- Name: idx_pixel_battle; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_pixel_battle ON public.pixel_cells USING btree (battle_id);


--
-- Name: idx_promocodes_code; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_promocodes_code ON public.promocodes USING btree (code);


--
-- Name: idx_promouse_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_promouse_user ON public.promocode_uses USING btree (user_id);


--
-- Name: idx_pv_profile; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_pv_profile ON public.profile_views USING btree (profile_id, viewed_at DESC);


--
-- Name: idx_tour_active; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_tour_active ON public.tournaments USING btree (active, ends_at);


--
-- Name: idx_wish_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_wish_user ON public.wishlist USING btree (user_id, created_at DESC);


--
-- Name: invites_owner; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX invites_owner ON public.invites USING btree (owner_id);


--
-- Name: journal_user_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX journal_user_idx ON public.journal USING btree (user_id, day DESC);


--
-- Name: letters_author_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX letters_author_idx ON public.letters USING btree (author_id, created_at DESC);


--
-- Name: letters_free_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX letters_free_idx ON public.letters USING btree (taken_at) WHERE (taken_at IS NULL);


--
-- Name: link_codes_user_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX link_codes_user_idx ON public.link_codes USING btree (user_id, created_at DESC);


--
-- Name: mentor_reviews_student_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX mentor_reviews_student_idx ON public.mentor_reviews USING btree (student_id, created_at DESC);


--
-- Name: mentorships_active_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX mentorships_active_idx ON public.mentorships USING btree (student_id) WHERE (ended_at IS NULL);


--
-- Name: messages_chat_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX messages_chat_idx ON public.messages USING btree (chat_id, id DESC);


--
-- Name: notifications_unread_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX notifications_unread_idx ON public.notifications USING btree (user_id) WHERE (read_at IS NULL);


--
-- Name: notifications_user_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX notifications_user_idx ON public.notifications USING btree (user_id, created_at DESC);


--
-- Name: payments_user_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX payments_user_idx ON public.payments USING btree (user_id, created_at DESC);


--
-- Name: posts_author_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX posts_author_idx ON public.posts USING btree (author_id);


--
-- Name: posts_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX posts_created_idx ON public.posts USING btree (created_at DESC);


--
-- Name: posts_kind_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX posts_kind_idx ON public.posts USING btree (kind, created_at DESC);


--
-- Name: posts_publish_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX posts_publish_at ON public.posts USING btree (publish_at DESC);


--
-- Name: recovery_codes_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX recovery_codes_user ON public.recovery_codes USING btree (user_id);


--
-- Name: recovery_tries_when; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX recovery_tries_when ON public.recovery_tries USING btree (user_id, at DESC);


--
-- Name: reminders_due_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX reminders_due_idx ON public.reminders USING btree (user_id, done, ring_at);


--
-- Name: stickers_owner_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX stickers_owner_idx ON public.stickers USING btree (owner_id);


--
-- Name: stories_author_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX stories_author_idx ON public.stories USING btree (author_id, expires_at DESC);


--
-- Name: tg_links_user_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX tg_links_user_idx ON public.tg_links USING btree (user_id);


--
-- Name: thanks_mod_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX thanks_mod_idx ON public.thanks USING btree (mod_id, created_at DESC);


--
-- Name: usernames_user_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX usernames_user_idx ON public.usernames USING btree (user_id, created_at);


--
-- Name: comments comments_guard_note; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER comments_guard_note AFTER INSERT ON public.comments FOR EACH ROW EXECUTE FUNCTION public.guard_comments_note();


--
-- Name: comments comments_guard_watch; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER comments_guard_watch BEFORE INSERT ON public.comments FOR EACH ROW EXECUTE FUNCTION public.guard_comments();


--
-- Name: messages messages_notify; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER messages_notify AFTER INSERT ON public.messages FOR EACH ROW EXECUTE FUNCTION public.notify_new_message();


--
-- Name: posts posts_guard_fresh; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER posts_guard_fresh BEFORE INSERT ON public.posts FOR EACH ROW EXECUTE FUNCTION public.guard_fresh_author();


--
-- Name: posts posts_guard_note; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER posts_guard_note AFTER INSERT ON public.posts FOR EACH ROW EXECUTE FUNCTION public.guard_posts_note();


--
-- Name: posts posts_guard_watch; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER posts_guard_watch BEFORE INSERT ON public.posts FOR EACH ROW EXECUTE FUNCTION public.guard_posts();


--
-- Name: posts posts_notify; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER posts_notify AFTER INSERT ON public.posts FOR EACH ROW EXECUTE FUNCTION public.notify_new_post();


--
-- Name: profiles profiles_protect; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER profiles_protect BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.protect_profile();


--
-- Name: profiles profiles_protect_login; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER profiles_protect_login BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.protect_login_name();


--
-- Name: reports reports_guard_mass; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER reports_guard_mass AFTER INSERT ON public.reports FOR EACH ROW EXECUTE FUNCTION public.guard_mass();


--
-- Name: reports reports_notify; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER reports_notify AFTER INSERT ON public.reports FOR EACH ROW EXECUTE FUNCTION public.notify_new_report();


--
-- Name: ai_chats ai_chats_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ai_chats
    ADD CONSTRAINT ai_chats_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: announcements announcements_author_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.announcements
    ADD CONSTRAINT announcements_author_id_fkey FOREIGN KEY (author_id) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: appeals appeals_judge_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.appeals
    ADD CONSTRAINT appeals_judge_id_fkey FOREIGN KEY (judge_id) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: appeals appeals_punishment_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.appeals
    ADD CONSTRAINT appeals_punishment_id_fkey FOREIGN KEY (punishment_id) REFERENCES public.punishments(id) ON DELETE CASCADE;


--
-- Name: appeals appeals_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.appeals
    ADD CONSTRAINT appeals_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: audit audit_actor_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.audit
    ADD CONSTRAINT audit_actor_id_fkey FOREIGN KEY (actor_id) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: badges badges_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.badges
    ADD CONSTRAINT badges_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: blocks blocks_blocked_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.blocks
    ADD CONSTRAINT blocks_blocked_id_fkey FOREIGN KEY (blocked_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: blocks blocks_blocker_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.blocks
    ADD CONSTRAINT blocks_blocker_id_fkey FOREIGN KEY (blocker_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: breaths breaths_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.breaths
    ADD CONSTRAINT breaths_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: call_signals call_signals_chat_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.call_signals
    ADD CONSTRAINT call_signals_chat_id_fkey FOREIGN KEY (chat_id) REFERENCES public.chats(id) ON DELETE CASCADE;


--
-- Name: call_signals call_signals_from_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.call_signals
    ADD CONSTRAINT call_signals_from_id_fkey FOREIGN KEY (from_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: call_signals call_signals_to_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.call_signals
    ADD CONSTRAINT call_signals_to_id_fkey FOREIGN KEY (to_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: campfire_messages campfire_messages_author_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.campfire_messages
    ADD CONSTRAINT campfire_messages_author_id_fkey FOREIGN KEY (author_id) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: campfire_messages campfire_messages_room_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.campfire_messages
    ADD CONSTRAINT campfire_messages_room_id_fkey FOREIGN KEY (room_id) REFERENCES public.campfire_rooms(id) ON DELETE CASCADE;


--
-- Name: campfire_seats campfire_seats_room_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.campfire_seats
    ADD CONSTRAINT campfire_seats_room_id_fkey FOREIGN KEY (room_id) REFERENCES public.campfire_rooms(id) ON DELETE CASCADE;


--
-- Name: campfire_seats campfire_seats_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.campfire_seats
    ADD CONSTRAINT campfire_seats_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: capsules capsules_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.capsules
    ADD CONSTRAINT capsules_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: chat_members chat_members_chat_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chat_members
    ADD CONSTRAINT chat_members_chat_id_fkey FOREIGN KEY (chat_id) REFERENCES public.chats(id) ON DELETE CASCADE;


--
-- Name: chat_members chat_members_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chat_members
    ADD CONSTRAINT chat_members_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: chats chats_owner_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chats
    ADD CONSTRAINT chats_owner_id_fkey FOREIGN KEY (owner_id) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: coin_log coin_log_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.coin_log
    ADD CONSTRAINT coin_log_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: comments comments_author_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.comments
    ADD CONSTRAINT comments_author_id_fkey FOREIGN KEY (author_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: comments comments_post_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.comments
    ADD CONSTRAINT comments_post_id_fkey FOREIGN KEY (post_id) REFERENCES public.posts(id) ON DELETE CASCADE;


--
-- Name: comments comments_removed_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.comments
    ADD CONSTRAINT comments_removed_by_fkey FOREIGN KEY (removed_by) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: comments comments_reply_to_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.comments
    ADD CONSTRAINT comments_reply_to_id_fkey FOREIGN KEY (reply_to_id) REFERENCES public.comments(id) ON DELETE SET NULL;


--
-- Name: comments comments_reply_to_user_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.comments
    ADD CONSTRAINT comments_reply_to_user_fkey FOREIGN KEY (reply_to_user) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: confessions confessions_author_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.confessions
    ADD CONSTRAINT confessions_author_id_fkey FOREIGN KEY (author_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: contacts contacts_contact_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contacts
    ADD CONSTRAINT contacts_contact_id_fkey FOREIGN KEY (contact_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: contacts contacts_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contacts
    ADD CONSTRAINT contacts_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: daily_challenge_completions daily_challenge_completions_challenge_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.daily_challenge_completions
    ADD CONSTRAINT daily_challenge_completions_challenge_id_fkey FOREIGN KEY (challenge_id) REFERENCES public.daily_challenges(id) ON DELETE CASCADE;


--
-- Name: daily_challenge_completions daily_challenge_completions_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.daily_challenge_completions
    ADD CONSTRAINT daily_challenge_completions_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: daily_quests daily_quests_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.daily_quests
    ADD CONSTRAINT daily_quests_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: daily_spins daily_spins_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.daily_spins
    ADD CONSTRAINT daily_spins_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: device_bans device_bans_actor_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.device_bans
    ADD CONSTRAINT device_bans_actor_id_fkey FOREIGN KEY (actor_id) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: device_bans device_bans_device_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.device_bans
    ADD CONSTRAINT device_bans_device_id_fkey FOREIGN KEY (device_id) REFERENCES public.devices(id) ON DELETE CASCADE;


--
-- Name: device_bans device_bans_lifted_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.device_bans
    ADD CONSTRAINT device_bans_lifted_by_fkey FOREIGN KEY (lifted_by) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: device_users device_users_device_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.device_users
    ADD CONSTRAINT device_users_device_id_fkey FOREIGN KEY (device_id) REFERENCES public.devices(id) ON DELETE CASCADE;


--
-- Name: device_users device_users_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.device_users
    ADD CONSTRAINT device_users_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: event_claims event_claims_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.event_claims
    ADD CONSTRAINT event_claims_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: event_progress event_progress_event_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.event_progress
    ADD CONSTRAINT event_progress_event_id_fkey FOREIGN KEY (event_id) REFERENCES public.season_events(id) ON DELETE CASCADE;


--
-- Name: event_progress event_progress_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.event_progress
    ADD CONSTRAINT event_progress_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: follows follows_follower_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.follows
    ADD CONSTRAINT follows_follower_id_fkey FOREIGN KEY (follower_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: follows follows_target_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.follows
    ADD CONSTRAINT follows_target_id_fkey FOREIGN KEY (target_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: friendships friendships_addressee_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.friendships
    ADD CONSTRAINT friendships_addressee_id_fkey FOREIGN KEY (addressee_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: friendships friendships_requester_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.friendships
    ADD CONSTRAINT friendships_requester_id_fkey FOREIGN KEY (requester_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: game_scores game_scores_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.game_scores
    ADD CONSTRAINT game_scores_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: gifts gifts_from_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gifts
    ADD CONSTRAINT gifts_from_id_fkey FOREIGN KEY (from_id) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: gifts gifts_owner_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gifts
    ADD CONSTRAINT gifts_owner_id_fkey FOREIGN KEY (owner_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: gifts gifts_type_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gifts
    ADD CONSTRAINT gifts_type_id_fkey FOREIGN KEY (type_id) REFERENCES public.gift_types(id) ON DELETE CASCADE;


--
-- Name: gratitude_entries gratitude_entries_author_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gratitude_entries
    ADD CONSTRAINT gratitude_entries_author_id_fkey FOREIGN KEY (author_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: group_members group_members_group_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.group_members
    ADD CONSTRAINT group_members_group_id_fkey FOREIGN KEY (group_id) REFERENCES public.groups(id) ON DELETE CASCADE;


--
-- Name: group_members group_members_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.group_members
    ADD CONSTRAINT group_members_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: groups groups_owner_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.groups
    ADD CONSTRAINT groups_owner_id_fkey FOREIGN KEY (owner_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: guard_hits guard_hits_undone_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.guard_hits
    ADD CONSTRAINT guard_hits_undone_by_fkey FOREIGN KEY (undone_by) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: guard_hits guard_hits_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.guard_hits
    ADD CONSTRAINT guard_hits_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: guard_words guard_words_added_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.guard_words
    ADD CONSTRAINT guard_words_added_by_fkey FOREIGN KEY (added_by) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: invite_uses invite_uses_code_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.invite_uses
    ADD CONSTRAINT invite_uses_code_fkey FOREIGN KEY (code) REFERENCES public.invites(code) ON DELETE CASCADE;


--
-- Name: invite_uses invite_uses_guest_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.invite_uses
    ADD CONSTRAINT invite_uses_guest_id_fkey FOREIGN KEY (guest_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: invite_uses invite_uses_owner_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.invite_uses
    ADD CONSTRAINT invite_uses_owner_id_fkey FOREIGN KEY (owner_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: invites invites_owner_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.invites
    ADD CONSTRAINT invites_owner_id_fkey FOREIGN KEY (owner_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: journal journal_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.journal
    ADD CONSTRAINT journal_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: letters letters_author_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.letters
    ADD CONSTRAINT letters_author_id_fkey FOREIGN KEY (author_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: letters letters_to_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.letters
    ADD CONSTRAINT letters_to_id_fkey FOREIGN KEY (to_id) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: likes likes_post_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.likes
    ADD CONSTRAINT likes_post_id_fkey FOREIGN KEY (post_id) REFERENCES public.posts(id) ON DELETE CASCADE;


--
-- Name: likes likes_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.likes
    ADD CONSTRAINT likes_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: link_codes link_codes_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.link_codes
    ADD CONSTRAINT link_codes_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: mentor_reviews mentor_reviews_mentor_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mentor_reviews
    ADD CONSTRAINT mentor_reviews_mentor_id_fkey FOREIGN KEY (mentor_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: mentor_reviews mentor_reviews_punishment_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mentor_reviews
    ADD CONSTRAINT mentor_reviews_punishment_id_fkey FOREIGN KEY (punishment_id) REFERENCES public.punishments(id) ON DELETE CASCADE;


--
-- Name: mentor_reviews mentor_reviews_student_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mentor_reviews
    ADD CONSTRAINT mentor_reviews_student_id_fkey FOREIGN KEY (student_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: mentorships mentorships_mentor_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mentorships
    ADD CONSTRAINT mentorships_mentor_id_fkey FOREIGN KEY (mentor_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: mentorships mentorships_student_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mentorships
    ADD CONSTRAINT mentorships_student_id_fkey FOREIGN KEY (student_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: message_reactions message_reactions_message_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.message_reactions
    ADD CONSTRAINT message_reactions_message_id_fkey FOREIGN KEY (message_id) REFERENCES public.messages(id) ON DELETE CASCADE;


--
-- Name: message_reactions message_reactions_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.message_reactions
    ADD CONSTRAINT message_reactions_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: messages messages_author_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.messages
    ADD CONSTRAINT messages_author_id_fkey FOREIGN KEY (author_id) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: messages messages_chat_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.messages
    ADD CONSTRAINT messages_chat_id_fkey FOREIGN KEY (chat_id) REFERENCES public.chats(id) ON DELETE CASCADE;


--
-- Name: messages messages_post_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.messages
    ADD CONSTRAINT messages_post_id_fkey FOREIGN KEY (post_id) REFERENCES public.posts(id) ON DELETE SET NULL;


--
-- Name: messages messages_reply_to_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.messages
    ADD CONSTRAINT messages_reply_to_id_fkey FOREIGN KEY (reply_to_id) REFERENCES public.messages(id) ON DELETE SET NULL;


--
-- Name: mod_strikes mod_strikes_admin_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mod_strikes
    ADD CONSTRAINT mod_strikes_admin_id_fkey FOREIGN KEY (admin_id) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: mod_strikes mod_strikes_moderator_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mod_strikes
    ADD CONSTRAINT mod_strikes_moderator_id_fkey FOREIGN KEY (moderator_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: notifications notifications_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT notifications_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: payments payments_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payments
    ADD CONSTRAINT payments_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: people_notes people_notes_owner_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.people_notes
    ADD CONSTRAINT people_notes_owner_id_fkey FOREIGN KEY (owner_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: people_notes people_notes_target_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.people_notes
    ADD CONSTRAINT people_notes_target_id_fkey FOREIGN KEY (target_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: pixel_cells pixel_cells_battle_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pixel_cells
    ADD CONSTRAINT pixel_cells_battle_id_fkey FOREIGN KEY (battle_id) REFERENCES public.pixel_battles(id) ON DELETE CASCADE;


--
-- Name: pixel_cells pixel_cells_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pixel_cells
    ADD CONSTRAINT pixel_cells_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: pixel_cooldowns pixel_cooldowns_battle_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pixel_cooldowns
    ADD CONSTRAINT pixel_cooldowns_battle_id_fkey FOREIGN KEY (battle_id) REFERENCES public.pixel_battles(id) ON DELETE CASCADE;


--
-- Name: pixel_cooldowns pixel_cooldowns_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pixel_cooldowns
    ADD CONSTRAINT pixel_cooldowns_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: poll_votes poll_votes_post_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.poll_votes
    ADD CONSTRAINT poll_votes_post_id_fkey FOREIGN KEY (post_id) REFERENCES public.posts(id) ON DELETE CASCADE;


--
-- Name: poll_votes poll_votes_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.poll_votes
    ADD CONSTRAINT poll_votes_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: posts posts_author_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.posts
    ADD CONSTRAINT posts_author_id_fkey FOREIGN KEY (author_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: posts posts_group_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.posts
    ADD CONSTRAINT posts_group_id_fkey FOREIGN KEY (group_id) REFERENCES public.groups(id) ON DELETE CASCADE;


--
-- Name: posts posts_removed_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.posts
    ADD CONSTRAINT posts_removed_by_fkey FOREIGN KEY (removed_by) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: posts posts_repost_of_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.posts
    ADD CONSTRAINT posts_repost_of_fkey FOREIGN KEY (repost_of) REFERENCES public.posts(id) ON DELETE SET NULL;


--
-- Name: profile_views profile_views_profile_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profile_views
    ADD CONSTRAINT profile_views_profile_id_fkey FOREIGN KEY (profile_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: profile_views profile_views_viewer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profile_views
    ADD CONSTRAINT profile_views_viewer_id_fkey FOREIGN KEY (viewer_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: profiles profiles_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: promocode_uses promocode_uses_promocode_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.promocode_uses
    ADD CONSTRAINT promocode_uses_promocode_id_fkey FOREIGN KEY (promocode_id) REFERENCES public.promocodes(id) ON DELETE CASCADE;


--
-- Name: promocode_uses promocode_uses_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.promocode_uses
    ADD CONSTRAINT promocode_uses_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: promocodes promocodes_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.promocodes
    ADD CONSTRAINT promocodes_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: punishments punishments_actor_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.punishments
    ADD CONSTRAINT punishments_actor_id_fkey FOREIGN KEY (actor_id) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: punishments punishments_post_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.punishments
    ADD CONSTRAINT punishments_post_id_fkey FOREIGN KEY (post_id) REFERENCES public.posts(id) ON DELETE SET NULL;


--
-- Name: punishments punishments_reverted_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.punishments
    ADD CONSTRAINT punishments_reverted_by_fkey FOREIGN KEY (reverted_by) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: punishments punishments_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.punishments
    ADD CONSTRAINT punishments_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: recovery_codes recovery_codes_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.recovery_codes
    ADD CONSTRAINT recovery_codes_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: recovery_tries recovery_tries_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.recovery_tries
    ADD CONSTRAINT recovery_tries_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: reminders reminders_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reminders
    ADD CONSTRAINT reminders_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: reports reports_handled_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reports
    ADD CONSTRAINT reports_handled_by_fkey FOREIGN KEY (handled_by) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: reports reports_reporter_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reports
    ADD CONSTRAINT reports_reporter_id_fkey FOREIGN KEY (reporter_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: reports reports_target_user_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reports
    ADD CONSTRAINT reports_target_user_fkey FOREIGN KEY (target_user) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: stickers stickers_owner_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stickers
    ADD CONSTRAINT stickers_owner_id_fkey FOREIGN KEY (owner_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: stories stories_author_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stories
    ADD CONSTRAINT stories_author_id_fkey FOREIGN KEY (author_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: tg_links tg_links_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tg_links
    ADD CONSTRAINT tg_links_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: thanks thanks_from_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.thanks
    ADD CONSTRAINT thanks_from_id_fkey FOREIGN KEY (from_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: thanks thanks_mod_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.thanks
    ADD CONSTRAINT thanks_mod_id_fkey FOREIGN KEY (mod_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: usernames usernames_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.usernames
    ADD CONSTRAINT usernames_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: wishlist wishlist_granted_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.wishlist
    ADD CONSTRAINT wishlist_granted_by_fkey FOREIGN KEY (granted_by) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: wishlist wishlist_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.wishlist
    ADD CONSTRAINT wishlist_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: ai_chats ai_chat_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ai_chat_own ON public.ai_chats USING ((user_id = auth.uid())) WITH CHECK ((user_id = auth.uid()));


--
-- Name: ai_chats; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.ai_chats ENABLE ROW LEVEL SECURITY;

--
-- Name: announcements; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.announcements ENABLE ROW LEVEL SECURITY;

--
-- Name: announcements announcements_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY announcements_delete ON public.announcements FOR DELETE USING (public.viewer_is_admin());


--
-- Name: announcements announcements_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY announcements_read ON public.announcements FOR SELECT USING (true);


--
-- Name: announcements announcements_write; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY announcements_write ON public.announcements FOR INSERT WITH CHECK ((public.viewer_is_admin() AND (author_id = auth.uid())));


--
-- Name: appeals; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.appeals ENABLE ROW LEVEL SECURITY;

--
-- Name: appeals appeals_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY appeals_own ON public.appeals FOR SELECT USING (((user_id = auth.uid()) OR public.viewer_is_moderator()));


--
-- Name: audit; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.audit ENABLE ROW LEVEL SECURITY;

--
-- Name: audit audit_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY audit_read ON public.audit FOR SELECT USING (public.viewer_is_admin());


--
-- Name: badges; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.badges ENABLE ROW LEVEL SECURITY;

--
-- Name: badges badges_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY badges_read ON public.badges FOR SELECT USING (true);


--
-- Name: blocks; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.blocks ENABLE ROW LEVEL SECURITY;

--
-- Name: blocks blocks_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY blocks_delete ON public.blocks FOR DELETE USING ((blocker_id = auth.uid()));


--
-- Name: blocks blocks_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY blocks_insert ON public.blocks FOR INSERT WITH CHECK (((blocker_id = auth.uid()) AND public.viewer_can_write()));


--
-- Name: blocks blocks_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY blocks_read ON public.blocks FOR SELECT USING (((blocker_id = auth.uid()) OR (blocked_id = auth.uid())));


--
-- Name: breaths; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.breaths ENABLE ROW LEVEL SECURITY;

--
-- Name: breaths breaths_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY breaths_read ON public.breaths FOR SELECT USING (true);


--
-- Name: call_signals; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.call_signals ENABLE ROW LEVEL SECURITY;

--
-- Name: call_signals call_signals_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY call_signals_delete ON public.call_signals FOR DELETE USING (((to_id = auth.uid()) OR (from_id = auth.uid())));


--
-- Name: call_signals call_signals_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY call_signals_insert ON public.call_signals FOR INSERT WITH CHECK (((from_id = auth.uid()) AND public.is_chat_member(chat_id)));


--
-- Name: call_signals call_signals_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY call_signals_read ON public.call_signals FOR SELECT USING (((to_id = auth.uid()) OR (from_id = auth.uid())));


--
-- Name: campfire_messages; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.campfire_messages ENABLE ROW LEVEL SECURITY;

--
-- Name: campfire_messages campfire_messages_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY campfire_messages_read ON public.campfire_messages FOR SELECT USING ((public.viewer_is_moderator() OR (EXISTS ( SELECT 1
   FROM public.campfire_seats s
  WHERE ((s.room_id = s.room_id) AND (s.user_id = auth.uid()))))));


--
-- Name: campfire_rooms; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.campfire_rooms ENABLE ROW LEVEL SECURITY;

--
-- Name: campfire_rooms campfire_rooms_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY campfire_rooms_read ON public.campfire_rooms FOR SELECT USING (true);


--
-- Name: campfire_seats; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.campfire_seats ENABLE ROW LEVEL SECURITY;

--
-- Name: campfire_seats campfire_seats_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY campfire_seats_own ON public.campfire_seats FOR SELECT USING ((user_id = auth.uid()));


--
-- Name: capsules; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.capsules ENABLE ROW LEVEL SECURITY;

--
-- Name: capsules capsules_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY capsules_own ON public.capsules USING ((user_id = auth.uid())) WITH CHECK ((user_id = auth.uid()));


--
-- Name: pixel_cooldowns cd_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY cd_insert ON public.pixel_cooldowns FOR INSERT WITH CHECK ((user_id = auth.uid()));


--
-- Name: pixel_cooldowns cd_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY cd_read ON public.pixel_cooldowns FOR SELECT USING ((user_id = auth.uid()));


--
-- Name: pixel_cooldowns cd_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY cd_update ON public.pixel_cooldowns FOR UPDATE USING ((user_id = auth.uid()));


--
-- Name: chat_members; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.chat_members ENABLE ROW LEVEL SECURITY;

--
-- Name: chat_members chat_members_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY chat_members_insert ON public.chat_members FOR INSERT WITH CHECK (((user_id = auth.uid()) OR (public.chat_role(chat_id) = 'owner'::text)));


--
-- Name: chat_members chat_members_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY chat_members_read ON public.chat_members FOR SELECT USING (public.is_chat_member(chat_id));


--
-- Name: chat_members chat_members_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY chat_members_update ON public.chat_members FOR UPDATE USING ((user_id = auth.uid())) WITH CHECK ((user_id = auth.uid()));


--
-- Name: chats; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.chats ENABLE ROW LEVEL SECURITY;

--
-- Name: chats chats_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY chats_insert ON public.chats FOR INSERT WITH CHECK (((owner_id = auth.uid()) AND public.viewer_can_write()));


--
-- Name: chats chats_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY chats_read ON public.chats FOR SELECT USING (((owner_id = auth.uid()) OR public.is_chat_member(id)));


--
-- Name: coin_log; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.coin_log ENABLE ROW LEVEL SECURITY;

--
-- Name: coin_log coin_log_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY coin_log_own ON public.coin_log FOR SELECT USING (((user_id = auth.uid()) OR public.viewer_is_admin()));


--
-- Name: comments; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.comments ENABLE ROW LEVEL SECURITY;

--
-- Name: comments comments_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY comments_delete ON public.comments FOR DELETE USING (((author_id = auth.uid()) OR public.viewer_is_moderator()));


--
-- Name: comments comments_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY comments_insert ON public.comments FOR INSERT WITH CHECK (((author_id = auth.uid()) AND public.viewer_can_write()));


--
-- Name: comments comments_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY comments_read ON public.comments FOR SELECT USING (true);


--
-- Name: confessions conf_delete_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY conf_delete_own ON public.confessions FOR DELETE USING ((author_id = auth.uid()));


--
-- Name: confessions conf_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY conf_insert ON public.confessions FOR INSERT WITH CHECK (((author_id = auth.uid()) AND public.viewer_can_write() AND ((length(body) >= 1) AND (length(body) <= 1000))));


--
-- Name: confessions conf_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY conf_read ON public.confessions FOR SELECT USING ((NOT removed));


--
-- Name: confessions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.confessions ENABLE ROW LEVEL SECURITY;

--
-- Name: contacts; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.contacts ENABLE ROW LEVEL SECURITY;

--
-- Name: contacts contacts_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY contacts_own ON public.contacts USING ((user_id = auth.uid())) WITH CHECK ((user_id = auth.uid()));


--
-- Name: daily_challenge_completions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.daily_challenge_completions ENABLE ROW LEVEL SECURITY;

--
-- Name: daily_challenges; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.daily_challenges ENABLE ROW LEVEL SECURITY;

--
-- Name: daily_quests; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.daily_quests ENABLE ROW LEVEL SECURITY;

--
-- Name: daily_quotes; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.daily_quotes ENABLE ROW LEVEL SECURITY;

--
-- Name: daily_spins; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.daily_spins ENABLE ROW LEVEL SECURITY;

--
-- Name: daily_challenges dc_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY dc_read ON public.daily_challenges FOR SELECT USING (true);


--
-- Name: daily_challenge_completions dcc_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY dcc_insert ON public.daily_challenge_completions FOR INSERT WITH CHECK ((user_id = auth.uid()));


--
-- Name: daily_challenge_completions dcc_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY dcc_read ON public.daily_challenge_completions FOR SELECT USING ((user_id = auth.uid()));


--
-- Name: device_bans; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.device_bans ENABLE ROW LEVEL SECURITY;

--
-- Name: device_bans device_bans_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY device_bans_read ON public.device_bans FOR SELECT USING (public.viewer_is_moderator());


--
-- Name: device_users; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.device_users ENABLE ROW LEVEL SECURITY;

--
-- Name: device_users device_users_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY device_users_read ON public.device_users FOR SELECT USING (public.viewer_is_moderator());


--
-- Name: devices; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.devices ENABLE ROW LEVEL SECURITY;

--
-- Name: devices devices_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY devices_read ON public.devices FOR SELECT USING (public.viewer_is_moderator());


--
-- Name: daily_quests dq_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY dq_own ON public.daily_quests USING ((user_id = auth.uid())) WITH CHECK ((user_id = auth.uid()));


--
-- Name: daily_quotes dq_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY dq_read ON public.daily_quotes FOR SELECT USING (true);


--
-- Name: event_progress ep_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ep_insert ON public.event_progress FOR INSERT WITH CHECK ((user_id = auth.uid()));


--
-- Name: event_progress ep_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ep_read ON public.event_progress FOR SELECT USING ((user_id = auth.uid()));


--
-- Name: event_claims; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.event_claims ENABLE ROW LEVEL SECURITY;

--
-- Name: event_claims event_claims_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY event_claims_own ON public.event_claims FOR SELECT USING ((user_id = auth.uid()));


--
-- Name: event_progress; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.event_progress ENABLE ROW LEVEL SECURITY;

--
-- Name: follows; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.follows ENABLE ROW LEVEL SECURITY;

--
-- Name: follows follows_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY follows_own ON public.follows USING ((follower_id = auth.uid())) WITH CHECK ((follower_id = auth.uid()));


--
-- Name: follows follows_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY follows_read ON public.follows FOR SELECT USING (true);


--
-- Name: friendships friends_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY friends_insert ON public.friendships FOR INSERT WITH CHECK (((requester_id = auth.uid()) AND public.viewer_can_write()));


--
-- Name: friendships friends_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY friends_read ON public.friendships FOR SELECT USING (((requester_id = auth.uid()) OR (addressee_id = auth.uid())));


--
-- Name: friendships friends_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY friends_update ON public.friendships FOR UPDATE USING (((requester_id = auth.uid()) OR (addressee_id = auth.uid())));


--
-- Name: friendships; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.friendships ENABLE ROW LEVEL SECURITY;

--
-- Name: game_scores; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.game_scores ENABLE ROW LEVEL SECURITY;

--
-- Name: gift_types; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.gift_types ENABLE ROW LEVEL SECURITY;

--
-- Name: gift_types gift_types_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY gift_types_read ON public.gift_types FOR SELECT USING (true);


--
-- Name: gifts; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.gifts ENABLE ROW LEVEL SECURITY;

--
-- Name: gifts gifts_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY gifts_read ON public.gifts FOR SELECT USING ((NOT sold));


--
-- Name: group_members gm_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY gm_delete ON public.group_members FOR DELETE USING (((user_id = auth.uid()) OR (EXISTS ( SELECT 1
   FROM public.groups
  WHERE ((groups.id = group_members.group_id) AND (groups.owner_id = auth.uid()))))));


--
-- Name: group_members gm_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY gm_insert ON public.group_members FOR INSERT WITH CHECK (((user_id = auth.uid()) AND public.viewer_can_write()));


--
-- Name: group_members gm_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY gm_read ON public.group_members FOR SELECT USING (true);


--
-- Name: gratitude_entries; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.gratitude_entries ENABLE ROW LEVEL SECURITY;

--
-- Name: gratitude_entries gratitude_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY gratitude_insert ON public.gratitude_entries FOR INSERT WITH CHECK (((author_id = auth.uid()) AND public.viewer_can_write() AND ((length(body) >= 1) AND (length(body) <= 500))));


--
-- Name: gratitude_entries gratitude_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY gratitude_read ON public.gratitude_entries FOR SELECT USING (true);


--
-- Name: group_members; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.group_members ENABLE ROW LEVEL SECURITY;

--
-- Name: groups; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.groups ENABLE ROW LEVEL SECURITY;

--
-- Name: groups groups_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY groups_insert ON public.groups FOR INSERT WITH CHECK (((owner_id = auth.uid()) AND public.viewer_can_write()));


--
-- Name: groups groups_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY groups_read ON public.groups FOR SELECT USING (((NOT is_private) OR (EXISTS ( SELECT 1
   FROM public.group_members
  WHERE ((group_members.group_id = groups.id) AND (group_members.user_id = auth.uid()))))));


--
-- Name: groups groups_update_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY groups_update_own ON public.groups FOR UPDATE USING ((owner_id = auth.uid()));


--
-- Name: guard_config; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.guard_config ENABLE ROW LEVEL SECURITY;

--
-- Name: guard_hits; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.guard_hits ENABLE ROW LEVEL SECURITY;

--
-- Name: guard_words; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.guard_words ENABLE ROW LEVEL SECURITY;

--
-- Name: invite_uses; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.invite_uses ENABLE ROW LEVEL SECURITY;

--
-- Name: invite_uses invite_uses_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY invite_uses_own ON public.invite_uses FOR SELECT USING (((owner_id = auth.uid()) OR (guest_id = auth.uid())));


--
-- Name: invites; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.invites ENABLE ROW LEVEL SECURITY;

--
-- Name: invites invites_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY invites_own ON public.invites FOR SELECT USING ((owner_id = auth.uid()));


--
-- Name: journal; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.journal ENABLE ROW LEVEL SECURITY;

--
-- Name: journal journal_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY journal_own ON public.journal USING ((user_id = auth.uid())) WITH CHECK ((user_id = auth.uid()));


--
-- Name: letters; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.letters ENABLE ROW LEVEL SECURITY;

--
-- Name: letters letters_mine; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY letters_mine ON public.letters FOR SELECT USING (((author_id = auth.uid()) OR (to_id = auth.uid()) OR public.viewer_is_moderator()));


--
-- Name: likes; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.likes ENABLE ROW LEVEL SECURITY;

--
-- Name: likes likes_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY likes_read ON public.likes FOR SELECT USING (true);


--
-- Name: likes likes_remove; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY likes_remove ON public.likes FOR DELETE USING ((user_id = auth.uid()));


--
-- Name: likes likes_write; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY likes_write ON public.likes FOR INSERT WITH CHECK (((user_id = auth.uid()) AND public.viewer_can_write()));


--
-- Name: link_codes; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.link_codes ENABLE ROW LEVEL SECURITY;

--
-- Name: mentor_reviews; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.mentor_reviews ENABLE ROW LEVEL SECURITY;

--
-- Name: mentor_reviews mentor_reviews_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY mentor_reviews_read ON public.mentor_reviews FOR SELECT USING (((student_id = auth.uid()) OR (mentor_id = auth.uid()) OR public.viewer_is_admin()));


--
-- Name: mentorships; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.mentorships ENABLE ROW LEVEL SECURITY;

--
-- Name: mentorships mentorships_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY mentorships_read ON public.mentorships FOR SELECT USING (public.viewer_is_moderator());


--
-- Name: message_reactions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.message_reactions ENABLE ROW LEVEL SECURITY;

--
-- Name: message_reactions message_reactions_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY message_reactions_read ON public.message_reactions FOR SELECT USING ((EXISTS ( SELECT 1
   FROM (public.messages m
     JOIN public.chat_members cm ON ((cm.chat_id = m.chat_id)))
  WHERE ((m.id = message_reactions.message_id) AND (cm.user_id = auth.uid())))));


--
-- Name: messages; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

--
-- Name: messages messages_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY messages_insert ON public.messages FOR INSERT WITH CHECK (((author_id = auth.uid()) AND public.viewer_can_write() AND public.is_chat_member(chat_id) AND ((( SELECT chats.kind
   FROM public.chats
  WHERE (chats.id = messages.chat_id)) <> 'channel'::text) OR (public.chat_role(chat_id) = 'owner'::text))));


--
-- Name: messages messages_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY messages_read ON public.messages FOR SELECT USING (((removed = false) AND public.is_chat_member(chat_id)));


--
-- Name: mod_strikes; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.mod_strikes ENABLE ROW LEVEL SECURITY;

--
-- Name: notifications; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

--
-- Name: notifications notifications_drop; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY notifications_drop ON public.notifications FOR DELETE USING ((user_id = auth.uid()));


--
-- Name: notifications notifications_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY notifications_own ON public.notifications FOR SELECT USING ((user_id = auth.uid()));


--
-- Name: notifications notifications_touch; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY notifications_touch ON public.notifications FOR UPDATE USING ((user_id = auth.uid()));


--
-- Name: payments; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;

--
-- Name: payments payments_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY payments_own ON public.payments FOR SELECT USING (((user_id = auth.uid()) OR public.viewer_is_admin()));


--
-- Name: pixel_battles pb_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY pb_read ON public.pixel_battles FOR SELECT USING (true);


--
-- Name: pixel_cells pc_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY pc_insert ON public.pixel_cells FOR INSERT WITH CHECK (((user_id = auth.uid()) AND public.viewer_can_write()));


--
-- Name: pixel_cells pc_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY pc_read ON public.pixel_cells FOR SELECT USING (true);


--
-- Name: pixel_cells pc_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY pc_update ON public.pixel_cells FOR UPDATE USING (true);


--
-- Name: people_notes; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.people_notes ENABLE ROW LEVEL SECURITY;

--
-- Name: people_notes people_notes_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY people_notes_own ON public.people_notes FOR SELECT USING ((owner_id = auth.uid()));


--
-- Name: pixel_battles; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.pixel_battles ENABLE ROW LEVEL SECURITY;

--
-- Name: pixel_cells; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.pixel_cells ENABLE ROW LEVEL SECURITY;

--
-- Name: pixel_cooldowns; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.pixel_cooldowns ENABLE ROW LEVEL SECURITY;

--
-- Name: poll_votes; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.poll_votes ENABLE ROW LEVEL SECURITY;

--
-- Name: poll_votes poll_votes_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY poll_votes_read ON public.poll_votes FOR SELECT USING (true);


--
-- Name: posts; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.posts ENABLE ROW LEVEL SECURITY;

--
-- Name: posts posts_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY posts_delete ON public.posts FOR DELETE USING (((author_id = auth.uid()) OR public.viewer_is_admin()));


--
-- Name: posts posts_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY posts_insert ON public.posts FOR INSERT WITH CHECK (((author_id = auth.uid()) AND public.viewer_can_write()));


--
-- Name: posts posts_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY posts_read ON public.posts FOR SELECT USING (((removed = false) OR (author_id = auth.uid()) OR public.viewer_is_moderator()));


--
-- Name: profile_views; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.profile_views ENABLE ROW LEVEL SECURITY;

--
-- Name: profiles; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

--
-- Name: profiles profiles_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY profiles_read ON public.profiles FOR SELECT USING (true);


--
-- Name: profiles profiles_update_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY profiles_update_own ON public.profiles FOR UPDATE USING (((id = auth.uid()) OR public.viewer_is_admin())) WITH CHECK (((id = auth.uid()) OR public.viewer_is_admin()));


--
-- Name: promocode_uses; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.promocode_uses ENABLE ROW LEVEL SECURITY;

--
-- Name: promocodes; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.promocodes ENABLE ROW LEVEL SECURITY;

--
-- Name: promocodes promocodes_admin_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY promocodes_admin_read ON public.promocodes FOR SELECT USING (public.viewer_is_admin());


--
-- Name: promocodes promocodes_admin_write; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY promocodes_admin_write ON public.promocodes USING (public.viewer_is_admin()) WITH CHECK (public.viewer_is_admin());


--
-- Name: promocode_uses promouse_insert_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY promouse_insert_own ON public.promocode_uses FOR INSERT WITH CHECK ((user_id = auth.uid()));


--
-- Name: promocode_uses promouse_read_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY promouse_read_own ON public.promocode_uses FOR SELECT USING (((user_id = auth.uid()) OR public.viewer_is_admin()));


--
-- Name: punishments; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.punishments ENABLE ROW LEVEL SECURITY;

--
-- Name: punishments punishments_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY punishments_read ON public.punishments FOR SELECT USING (((user_id = auth.uid()) OR public.viewer_is_moderator()));


--
-- Name: profile_views pv_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY pv_insert ON public.profile_views FOR INSERT WITH CHECK (((viewer_id = auth.uid()) OR (viewer_id IS NULL)));


--
-- Name: profile_views pv_read_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY pv_read_own ON public.profile_views FOR SELECT USING ((profile_id = auth.uid()));


--
-- Name: recovery_codes; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.recovery_codes ENABLE ROW LEVEL SECURITY;

--
-- Name: recovery_codes recovery_codes_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY recovery_codes_own ON public.recovery_codes FOR SELECT USING ((user_id = auth.uid()));


--
-- Name: recovery_tries; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.recovery_tries ENABLE ROW LEVEL SECURITY;

--
-- Name: reminders; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.reminders ENABLE ROW LEVEL SECURITY;

--
-- Name: reminders reminders_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY reminders_own ON public.reminders FOR SELECT USING ((user_id = auth.uid()));


--
-- Name: reports; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.reports ENABLE ROW LEVEL SECURITY;

--
-- Name: reports reports_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY reports_insert ON public.reports FOR INSERT WITH CHECK ((reporter_id = auth.uid()));


--
-- Name: reports reports_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY reports_read ON public.reports FOR SELECT USING (((reporter_id = auth.uid()) OR public.viewer_is_moderator()));


--
-- Name: game_scores scores_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY scores_insert ON public.game_scores FOR INSERT WITH CHECK ((user_id = auth.uid()));


--
-- Name: game_scores scores_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY scores_read ON public.game_scores FOR SELECT USING (true);


--
-- Name: season_events se_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY se_read ON public.season_events FOR SELECT USING (true);


--
-- Name: season_events; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.season_events ENABLE ROW LEVEL SECURITY;

--
-- Name: daily_spins spin_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY spin_insert ON public.daily_spins FOR INSERT WITH CHECK ((user_id = auth.uid()));


--
-- Name: daily_spins spin_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY spin_read ON public.daily_spins FOR SELECT USING ((user_id = auth.uid()));


--
-- Name: stickers; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.stickers ENABLE ROW LEVEL SECURITY;

--
-- Name: stickers stickers_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY stickers_delete ON public.stickers FOR DELETE USING ((owner_id = auth.uid()));


--
-- Name: stickers stickers_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY stickers_insert ON public.stickers FOR INSERT WITH CHECK (((owner_id = auth.uid()) AND public.viewer_is_premium()));


--
-- Name: stickers stickers_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY stickers_read ON public.stickers FOR SELECT USING ((owner_id = auth.uid()));


--
-- Name: stories; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.stories ENABLE ROW LEVEL SECURITY;

--
-- Name: stories stories_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY stories_delete ON public.stories FOR DELETE USING (((author_id = auth.uid()) OR public.viewer_is_moderator()));


--
-- Name: stories stories_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY stories_insert ON public.stories FOR INSERT WITH CHECK (((author_id = auth.uid()) AND public.viewer_is_premium() AND public.viewer_can_write()));


--
-- Name: stories stories_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY stories_read ON public.stories FOR SELECT USING ((expires_at > now()));


--
-- Name: mod_strikes strikes_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY strikes_read ON public.mod_strikes FOR SELECT USING (((moderator_id = auth.uid()) OR public.viewer_is_admin()));


--
-- Name: tg_links; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.tg_links ENABLE ROW LEVEL SECURITY;

--
-- Name: tg_links tg_links_forget; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tg_links_forget ON public.tg_links FOR DELETE USING ((user_id = auth.uid()));


--
-- Name: tg_links tg_links_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tg_links_own ON public.tg_links FOR SELECT USING (((user_id = auth.uid()) OR public.viewer_is_admin()));


--
-- Name: thanks; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.thanks ENABLE ROW LEVEL SECURITY;

--
-- Name: thanks thanks_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY thanks_read ON public.thanks FOR SELECT USING (true);


--
-- Name: tournaments tour_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tour_read ON public.tournaments FOR SELECT USING (true);


--
-- Name: tournaments; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.tournaments ENABLE ROW LEVEL SECURITY;

--
-- Name: usernames; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.usernames ENABLE ROW LEVEL SECURITY;

--
-- Name: usernames usernames_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY usernames_read ON public.usernames FOR SELECT USING (true);


--
-- Name: wishlist wish_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY wish_delete ON public.wishlist FOR DELETE USING ((user_id = auth.uid()));


--
-- Name: wishlist wish_grant; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY wish_grant ON public.wishlist FOR UPDATE USING (true) WITH CHECK (true);


--
-- Name: wishlist wish_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY wish_insert ON public.wishlist FOR INSERT WITH CHECK (((user_id = auth.uid()) AND public.viewer_can_write()));


--
-- Name: wishlist wish_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY wish_read ON public.wishlist FOR SELECT USING (true);


--
-- Name: wishlist; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.wishlist ENABLE ROW LEVEL SECURITY;

--
-- Name: SCHEMA public; Type: ACL; Schema: -; Owner: -
--

GRANT USAGE ON SCHEMA public TO postgres;
GRANT USAGE ON SCHEMA public TO anon;
GRANT USAGE ON SCHEMA public TO authenticated;
GRANT USAGE ON SCHEMA public TO service_role;


--
-- Name: FUNCTION accept_friend(p_requester uuid); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.accept_friend(p_requester uuid) TO anon;
GRANT ALL ON FUNCTION public.accept_friend(p_requester uuid) TO authenticated;
GRANT ALL ON FUNCTION public.accept_friend(p_requester uuid) TO service_role;


--
-- Name: FUNCTION active_events(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.active_events() TO anon;
GRANT ALL ON FUNCTION public.active_events() TO authenticated;
GRANT ALL ON FUNCTION public.active_events() TO service_role;


--
-- Name: FUNCTION active_pixel_battle(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.active_pixel_battle() TO anon;
GRANT ALL ON FUNCTION public.active_pixel_battle() TO authenticated;
GRANT ALL ON FUNCTION public.active_pixel_battle() TO service_role;


--
-- Name: FUNCTION active_tournaments(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.active_tournaments() TO anon;
GRANT ALL ON FUNCTION public.active_tournaments() TO authenticated;
GRANT ALL ON FUNCTION public.active_tournaments() TO service_role;


--
-- Name: FUNCTION add_confession(p_body text, p_mood text); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.add_confession(p_body text, p_mood text) TO anon;
GRANT ALL ON FUNCTION public.add_confession(p_body text, p_mood text) TO authenticated;
GRANT ALL ON FUNCTION public.add_confession(p_body text, p_mood text) TO service_role;


--
-- Name: FUNCTION add_username(wanted text); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.add_username(wanted text) TO anon;
GRANT ALL ON FUNCTION public.add_username(wanted text) TO authenticated;
GRANT ALL ON FUNCTION public.add_username(wanted text) TO service_role;


--
-- Name: FUNCTION add_wishlist_item(p_title text, p_link text); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.add_wishlist_item(p_title text, p_link text) TO anon;
GRANT ALL ON FUNCTION public.add_wishlist_item(p_title text, p_link text) TO authenticated;
GRANT ALL ON FUNCTION public.add_wishlist_item(p_title text, p_link text) TO service_role;


--
-- Name: FUNCTION add_xp(p_amount integer); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.add_xp(p_amount integer) TO anon;
GRANT ALL ON FUNCTION public.add_xp(p_amount integer) TO authenticated;
GRANT ALL ON FUNCTION public.add_xp(p_amount integer) TO service_role;


--
-- Name: FUNCTION admin_create_promo(p_code text, p_reward_type text, p_reward_amount integer, p_reward_days integer, p_max_uses integer, p_expires_at timestamp with time zone); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.admin_create_promo(p_code text, p_reward_type text, p_reward_amount integer, p_reward_days integer, p_max_uses integer, p_expires_at timestamp with time zone) TO anon;
GRANT ALL ON FUNCTION public.admin_create_promo(p_code text, p_reward_type text, p_reward_amount integer, p_reward_days integer, p_max_uses integer, p_expires_at timestamp with time zone) TO authenticated;
GRANT ALL ON FUNCTION public.admin_create_promo(p_code text, p_reward_type text, p_reward_amount integer, p_reward_days integer, p_max_uses integer, p_expires_at timestamp with time zone) TO service_role;


--
-- Name: FUNCTION admin_create_tournament(p_game_id text, p_title text, p_ends_at timestamp with time zone, p_prize_1 integer, p_prize_2 integer, p_prize_3 integer); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.admin_create_tournament(p_game_id text, p_title text, p_ends_at timestamp with time zone, p_prize_1 integer, p_prize_2 integer, p_prize_3 integer) TO anon;
GRANT ALL ON FUNCTION public.admin_create_tournament(p_game_id text, p_title text, p_ends_at timestamp with time zone, p_prize_1 integer, p_prize_2 integer, p_prize_3 integer) TO authenticated;
GRANT ALL ON FUNCTION public.admin_create_tournament(p_game_id text, p_title text, p_ends_at timestamp with time zone, p_prize_1 integer, p_prize_2 integer, p_prize_3 integer) TO service_role;


--
-- Name: FUNCTION admin_delete_promo(p_id bigint); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.admin_delete_promo(p_id bigint) TO anon;
GRANT ALL ON FUNCTION public.admin_delete_promo(p_id bigint) TO authenticated;
GRANT ALL ON FUNCTION public.admin_delete_promo(p_id bigint) TO service_role;


--
-- Name: FUNCTION admin_delete_user(target uuid); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.admin_delete_user(target uuid) TO anon;
GRANT ALL ON FUNCTION public.admin_delete_user(target uuid) TO authenticated;
GRANT ALL ON FUNCTION public.admin_delete_user(target uuid) TO service_role;


--
-- Name: FUNCTION admin_give_coins(target uuid, amount integer); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.admin_give_coins(target uuid, amount integer) FROM PUBLIC;
GRANT ALL ON FUNCTION public.admin_give_coins(target uuid, amount integer) TO authenticated;
GRANT ALL ON FUNCTION public.admin_give_coins(target uuid, amount integer) TO service_role;


--
-- Name: FUNCTION admin_grant_premium(target uuid, days integer, reason text); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.admin_grant_premium(target uuid, days integer, reason text) TO anon;
GRANT ALL ON FUNCTION public.admin_grant_premium(target uuid, days integer, reason text) TO authenticated;
GRANT ALL ON FUNCTION public.admin_grant_premium(target uuid, days integer, reason text) TO service_role;


--
-- Name: FUNCTION admin_health(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.admin_health() TO anon;
GRANT ALL ON FUNCTION public.admin_health() TO authenticated;
GRANT ALL ON FUNCTION public.admin_health() TO service_role;


--
-- Name: FUNCTION admin_list_promos(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.admin_list_promos() TO anon;
GRANT ALL ON FUNCTION public.admin_list_promos() TO authenticated;
GRANT ALL ON FUNCTION public.admin_list_promos() TO service_role;


--
-- Name: FUNCTION admin_mod_team(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.admin_mod_team() FROM PUBLIC;
GRANT ALL ON FUNCTION public.admin_mod_team() TO authenticated;
GRANT ALL ON FUNCTION public.admin_mod_team() TO service_role;


--
-- Name: FUNCTION admin_praise(target uuid, note text, purse integer); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.admin_praise(target uuid, note text, purse integer) TO anon;
GRANT ALL ON FUNCTION public.admin_praise(target uuid, note text, purse integer) TO authenticated;
GRANT ALL ON FUNCTION public.admin_praise(target uuid, note text, purse integer) TO service_role;


--
-- Name: FUNCTION admin_praise_pick(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.admin_praise_pick() TO anon;
GRANT ALL ON FUNCTION public.admin_praise_pick() TO authenticated;
GRANT ALL ON FUNCTION public.admin_praise_pick() TO service_role;


--
-- Name: FUNCTION admin_quiet_call(body text); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.admin_quiet_call(body text) TO anon;
GRANT ALL ON FUNCTION public.admin_quiet_call(body text) TO authenticated;
GRANT ALL ON FUNCTION public.admin_quiet_call(body text) TO service_role;


--
-- Name: FUNCTION admin_rename(target uuid, name text); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.admin_rename(target uuid, name text) TO anon;
GRANT ALL ON FUNCTION public.admin_rename(target uuid, name text) TO authenticated;
GRANT ALL ON FUNCTION public.admin_rename(target uuid, name text) TO service_role;


--
-- Name: FUNCTION admin_reset_look(target uuid); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.admin_reset_look(target uuid) TO anon;
GRANT ALL ON FUNCTION public.admin_reset_look(target uuid) TO authenticated;
GRANT ALL ON FUNCTION public.admin_reset_look(target uuid) TO service_role;


--
-- Name: FUNCTION admin_revert(target bigint, strike boolean, reason text); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.admin_revert(target bigint, strike boolean, reason text) TO anon;
GRANT ALL ON FUNCTION public.admin_revert(target bigint, strike boolean, reason text) TO authenticated;
GRANT ALL ON FUNCTION public.admin_revert(target bigint, strike boolean, reason text) TO service_role;


--
-- Name: FUNCTION admin_revoke_premium(target uuid); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.admin_revoke_premium(target uuid) TO anon;
GRANT ALL ON FUNCTION public.admin_revoke_premium(target uuid) TO authenticated;
GRANT ALL ON FUNCTION public.admin_revoke_premium(target uuid) TO service_role;


--
-- Name: FUNCTION admin_set_beta(target uuid, on_beta boolean); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.admin_set_beta(target uuid, on_beta boolean) FROM PUBLIC;
GRANT ALL ON FUNCTION public.admin_set_beta(target uuid, on_beta boolean) TO authenticated;
GRANT ALL ON FUNCTION public.admin_set_beta(target uuid, on_beta boolean) TO service_role;


--
-- Name: FUNCTION admin_set_challenge(p_title text, p_description text, p_reward integer); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.admin_set_challenge(p_title text, p_description text, p_reward integer) TO anon;
GRANT ALL ON FUNCTION public.admin_set_challenge(p_title text, p_description text, p_reward integer) TO authenticated;
GRANT ALL ON FUNCTION public.admin_set_challenge(p_title text, p_description text, p_reward integer) TO service_role;


--
-- Name: FUNCTION admin_set_flags(target uuid, flags jsonb); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.admin_set_flags(target uuid, flags jsonb) TO anon;
GRANT ALL ON FUNCTION public.admin_set_flags(target uuid, flags jsonb) TO authenticated;
GRANT ALL ON FUNCTION public.admin_set_flags(target uuid, flags jsonb) TO service_role;


--
-- Name: FUNCTION admin_set_rank(target uuid, rank integer); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.admin_set_rank(target uuid, rank integer) FROM PUBLIC;
GRANT ALL ON FUNCTION public.admin_set_rank(target uuid, rank integer) TO authenticated;
GRANT ALL ON FUNCTION public.admin_set_rank(target uuid, rank integer) TO service_role;


--
-- Name: FUNCTION admin_set_state(target uuid, action text, minutes integer, reason text); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.admin_set_state(target uuid, action text, minutes integer, reason text) TO anon;
GRANT ALL ON FUNCTION public.admin_set_state(target uuid, action text, minutes integer, reason text) TO authenticated;
GRANT ALL ON FUNCTION public.admin_set_state(target uuid, action text, minutes integer, reason text) TO service_role;


--
-- Name: FUNCTION admin_stats(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.admin_stats() TO anon;
GRANT ALL ON FUNCTION public.admin_stats() TO authenticated;
GRANT ALL ON FUNCTION public.admin_stats() TO service_role;


--
-- Name: FUNCTION admin_toggle_promo(p_id bigint, p_disabled boolean); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.admin_toggle_promo(p_id bigint, p_disabled boolean) TO anon;
GRANT ALL ON FUNCTION public.admin_toggle_promo(p_id bigint, p_disabled boolean) TO authenticated;
GRANT ALL ON FUNCTION public.admin_toggle_promo(p_id bigint, p_disabled boolean) TO service_role;


--
-- Name: FUNCTION admin_users(search text); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.admin_users(search text) TO anon;
GRANT ALL ON FUNCTION public.admin_users(search text) TO authenticated;
GRANT ALL ON FUNCTION public.admin_users(search text) TO service_role;


--
-- Name: FUNCTION admin_wipe_posts(target uuid); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.admin_wipe_posts(target uuid) TO anon;
GRANT ALL ON FUNCTION public.admin_wipe_posts(target uuid) TO authenticated;
GRANT ALL ON FUNCTION public.admin_wipe_posts(target uuid) TO service_role;


--
-- Name: FUNCTION am_i_blocked(p_target uuid); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.am_i_blocked(p_target uuid) TO anon;
GRANT ALL ON FUNCTION public.am_i_blocked(p_target uuid) TO authenticated;
GRANT ALL ON FUNCTION public.am_i_blocked(p_target uuid) TO service_role;


--
-- Name: FUNCTION appeal_judge(target bigint, verdict text, note text); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.appeal_judge(target bigint, verdict text, note text) TO anon;
GRANT ALL ON FUNCTION public.appeal_judge(target bigint, verdict text, note text) TO authenticated;
GRANT ALL ON FUNCTION public.appeal_judge(target bigint, verdict text, note text) TO service_role;


--
-- Name: FUNCTION appeal_queue(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.appeal_queue() TO anon;
GRANT ALL ON FUNCTION public.appeal_queue() TO authenticated;
GRANT ALL ON FUNCTION public.appeal_queue() TO service_role;


--
-- Name: FUNCTION appeal_send(target bigint, body text); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.appeal_send(target bigint, body text) TO anon;
GRANT ALL ON FUNCTION public.appeal_send(target bigint, body text) TO authenticated;
GRANT ALL ON FUNCTION public.appeal_send(target bigint, body text) TO service_role;


--
-- Name: FUNCTION block_user(p_target uuid); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.block_user(p_target uuid) TO anon;
GRANT ALL ON FUNCTION public.block_user(p_target uuid) TO authenticated;
GRANT ALL ON FUNCTION public.block_user(p_target uuid) TO service_role;


--
-- Name: FUNCTION bot_bind(code text, tg bigint, tg_name text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.bot_bind(code text, tg bigint, tg_name text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.bot_bind(code text, tg bigint, tg_name text) TO service_role;


--
-- Name: FUNCTION bot_grant_premium(tg bigint, days integer, stars integer, charge text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.bot_grant_premium(tg bigint, days integer, stars integer, charge text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.bot_grant_premium(tg bigint, days integer, stars integer, charge text) TO service_role;


--
-- Name: FUNCTION bot_stats(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.bot_stats() FROM PUBLIC;
GRANT ALL ON FUNCTION public.bot_stats() TO service_role;


--
-- Name: FUNCTION bot_unbind(tg bigint); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.bot_unbind(tg bigint) FROM PUBLIC;
GRANT ALL ON FUNCTION public.bot_unbind(tg bigint) TO service_role;


--
-- Name: FUNCTION bot_whoami(tg bigint); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.bot_whoami(tg bigint) FROM PUBLIC;
GRANT ALL ON FUNCTION public.bot_whoami(tg bigint) TO service_role;


--
-- Name: FUNCTION breathe_in(minutes integer); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.breathe_in(minutes integer) TO anon;
GRANT ALL ON FUNCTION public.breathe_in(minutes integer) TO authenticated;
GRANT ALL ON FUNCTION public.breathe_in(minutes integer) TO service_role;


--
-- Name: FUNCTION breathe_out(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.breathe_out() TO anon;
GRANT ALL ON FUNCTION public.breathe_out() TO authenticated;
GRANT ALL ON FUNCTION public.breathe_out() TO service_role;


--
-- Name: FUNCTION bump_daily_quest(p_quest_key text, p_amount integer); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.bump_daily_quest(p_quest_key text, p_amount integer) TO anon;
GRANT ALL ON FUNCTION public.bump_daily_quest(p_quest_key text, p_amount integer) TO authenticated;
GRANT ALL ON FUNCTION public.bump_daily_quest(p_quest_key text, p_amount integer) TO service_role;


--
-- Name: FUNCTION bump_post_views(target bigint); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.bump_post_views(target bigint) TO anon;
GRANT ALL ON FUNCTION public.bump_post_views(target bigint) TO authenticated;
GRANT ALL ON FUNCTION public.bump_post_views(target bigint) TO service_role;


--
-- Name: FUNCTION buy_gift(gift text, target uuid, note text); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.buy_gift(gift text, target uuid, note text) TO anon;
GRANT ALL ON FUNCTION public.buy_gift(gift text, target uuid, note text) TO authenticated;
GRANT ALL ON FUNCTION public.buy_gift(gift text, target uuid, note text) TO service_role;


--
-- Name: FUNCTION campfire_join(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.campfire_join() FROM PUBLIC;
GRANT ALL ON FUNCTION public.campfire_join() TO service_role;


--
-- Name: FUNCTION campfire_leave(room bigint); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.campfire_leave(room bigint) FROM PUBLIC;
GRANT ALL ON FUNCTION public.campfire_leave(room bigint) TO service_role;


--
-- Name: FUNCTION campfire_read(room bigint, after bigint); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.campfire_read(room bigint, after bigint) FROM PUBLIC;
GRANT ALL ON FUNCTION public.campfire_read(room bigint, after bigint) TO service_role;


--
-- Name: FUNCTION campfire_say(room bigint, body text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.campfire_say(room bigint, body text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.campfire_say(room bigint, body text) TO service_role;


--
-- Name: FUNCTION can_spin_today(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.can_spin_today() TO anon;
GRANT ALL ON FUNCTION public.can_spin_today() TO authenticated;
GRANT ALL ON FUNCTION public.can_spin_today() TO service_role;


--
-- Name: FUNCTION capsule_add(body text, days integer); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.capsule_add(body text, days integer) TO anon;
GRANT ALL ON FUNCTION public.capsule_add(body text, days integer) TO authenticated;
GRANT ALL ON FUNCTION public.capsule_add(body text, days integer) TO service_role;


--
-- Name: FUNCTION capsule_check(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.capsule_check() TO anon;
GRANT ALL ON FUNCTION public.capsule_check() TO authenticated;
GRANT ALL ON FUNCTION public.capsule_check() TO service_role;


--
-- Name: FUNCTION chat_reactions(room bigint); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.chat_reactions(room bigint) TO anon;
GRANT ALL ON FUNCTION public.chat_reactions(room bigint) TO authenticated;
GRANT ALL ON FUNCTION public.chat_reactions(room bigint) TO service_role;


--
-- Name: FUNCTION chat_role(target_chat bigint); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.chat_role(target_chat bigint) TO anon;
GRANT ALL ON FUNCTION public.chat_role(target_chat bigint) TO authenticated;
GRANT ALL ON FUNCTION public.chat_role(target_chat bigint) TO service_role;


--
-- Name: FUNCTION claim_daily_quest(p_id bigint); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.claim_daily_quest(p_id bigint) TO anon;
GRANT ALL ON FUNCTION public.claim_daily_quest(p_id bigint) TO authenticated;
GRANT ALL ON FUNCTION public.claim_daily_quest(p_id bigint) TO service_role;


--
-- Name: FUNCTION clear_notifications(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.clear_notifications() TO anon;
GRANT ALL ON FUNCTION public.clear_notifications() TO authenticated;
GRANT ALL ON FUNCTION public.clear_notifications() TO service_role;


--
-- Name: FUNCTION complete_today_challenge(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.complete_today_challenge() TO anon;
GRANT ALL ON FUNCTION public.complete_today_challenge() TO authenticated;
GRANT ALL ON FUNCTION public.complete_today_challenge() TO service_role;


--
-- Name: FUNCTION confessions_list(p_limit integer, p_offset integer); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.confessions_list(p_limit integer, p_offset integer) TO anon;
GRANT ALL ON FUNCTION public.confessions_list(p_limit integer, p_offset integer) TO authenticated;
GRANT ALL ON FUNCTION public.confessions_list(p_limit integer, p_offset integer) TO service_role;


--
-- Name: FUNCTION create_group(p_name text, p_description text, p_is_private boolean); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.create_group(p_name text, p_description text, p_is_private boolean) TO anon;
GRANT ALL ON FUNCTION public.create_group(p_name text, p_description text, p_is_private boolean) TO authenticated;
GRANT ALL ON FUNCTION public.create_group(p_name text, p_description text, p_is_private boolean) TO service_role;


--
-- Name: FUNCTION delete_comment(target bigint, reason text); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.delete_comment(target bigint, reason text) TO anon;
GRANT ALL ON FUNCTION public.delete_comment(target bigint, reason text) TO authenticated;
GRANT ALL ON FUNCTION public.delete_comment(target bigint, reason text) TO service_role;


--
-- Name: FUNCTION delete_confession(p_id bigint); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.delete_confession(p_id bigint) TO anon;
GRANT ALL ON FUNCTION public.delete_confession(p_id bigint) TO authenticated;
GRANT ALL ON FUNCTION public.delete_confession(p_id bigint) TO service_role;


--
-- Name: FUNCTION delete_my_comment(p_id bigint); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.delete_my_comment(p_id bigint) TO anon;
GRANT ALL ON FUNCTION public.delete_my_comment(p_id bigint) TO authenticated;
GRANT ALL ON FUNCTION public.delete_my_comment(p_id bigint) TO service_role;


--
-- Name: FUNCTION delete_my_message(p_id bigint); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.delete_my_message(p_id bigint) TO anon;
GRANT ALL ON FUNCTION public.delete_my_message(p_id bigint) TO authenticated;
GRANT ALL ON FUNCTION public.delete_my_message(p_id bigint) TO service_role;


--
-- Name: FUNCTION device_ban_state(fp text); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.device_ban_state(fp text) TO anon;
GRANT ALL ON FUNCTION public.device_ban_state(fp text) TO authenticated;
GRANT ALL ON FUNCTION public.device_ban_state(fp text) TO service_role;


--
-- Name: FUNCTION disable_pin_code(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.disable_pin_code() TO anon;
GRANT ALL ON FUNCTION public.disable_pin_code() TO authenticated;
GRANT ALL ON FUNCTION public.disable_pin_code() TO service_role;


--
-- Name: FUNCTION drop_username(target text); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.drop_username(target text) TO anon;
GRANT ALL ON FUNCTION public.drop_username(target text) TO authenticated;
GRANT ALL ON FUNCTION public.drop_username(target text) TO service_role;


--
-- Name: FUNCTION event_claim(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.event_claim() TO anon;
GRANT ALL ON FUNCTION public.event_claim() TO authenticated;
GRANT ALL ON FUNCTION public.event_claim() TO service_role;


--
-- Name: FUNCTION event_state(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.event_state() TO anon;
GRANT ALL ON FUNCTION public.event_state() TO authenticated;
GRANT ALL ON FUNCTION public.event_state() TO service_role;


--
-- Name: FUNCTION feed_reels(size integer, seen bigint[]); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.feed_reels(size integer, seen bigint[]) TO anon;
GRANT ALL ON FUNCTION public.feed_reels(size integer, seen bigint[]) TO authenticated;
GRANT ALL ON FUNCTION public.feed_reels(size integer, seen bigint[]) TO service_role;


--
-- Name: FUNCTION find_by_username(needle text); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.find_by_username(needle text) TO anon;
GRANT ALL ON FUNCTION public.find_by_username(needle text) TO authenticated;
GRANT ALL ON FUNCTION public.find_by_username(needle text) TO service_role;


--
-- Name: FUNCTION follow(target uuid, on_follow boolean); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.follow(target uuid, on_follow boolean) TO anon;
GRANT ALL ON FUNCTION public.follow(target uuid, on_follow boolean) TO authenticated;
GRANT ALL ON FUNCTION public.follow(target uuid, on_follow boolean) TO service_role;


--
-- Name: FUNCTION follow_state(target uuid); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.follow_state(target uuid) TO anon;
GRANT ALL ON FUNCTION public.follow_state(target uuid) TO authenticated;
GRANT ALL ON FUNCTION public.follow_state(target uuid) TO service_role;


--
-- Name: FUNCTION get_pixel_info(p_battle_id bigint, p_x integer, p_y integer); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.get_pixel_info(p_battle_id bigint, p_x integer, p_y integer) TO anon;
GRANT ALL ON FUNCTION public.get_pixel_info(p_battle_id bigint, p_x integer, p_y integer) TO authenticated;
GRANT ALL ON FUNCTION public.get_pixel_info(p_battle_id bigint, p_x integer, p_y integer) TO service_role;


--
-- Name: FUNCTION get_wishlist(p_user_id uuid); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.get_wishlist(p_user_id uuid) TO anon;
GRANT ALL ON FUNCTION public.get_wishlist(p_user_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.get_wishlist(p_user_id uuid) TO service_role;


--
-- Name: FUNCTION grant_coins(amount integer, reason text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.grant_coins(amount integer, reason text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.grant_coins(amount integer, reason text) TO authenticated;
GRANT ALL ON FUNCTION public.grant_coins(amount integer, reason text) TO service_role;


--
-- Name: FUNCTION gratitude_add(p_body text, p_anonymous boolean); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.gratitude_add(p_body text, p_anonymous boolean) TO anon;
GRANT ALL ON FUNCTION public.gratitude_add(p_body text, p_anonymous boolean) TO authenticated;
GRANT ALL ON FUNCTION public.gratitude_add(p_body text, p_anonymous boolean) TO service_role;


--
-- Name: FUNCTION gratitude_list(p_limit integer, p_offset integer); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.gratitude_list(p_limit integer, p_offset integer) TO anon;
GRANT ALL ON FUNCTION public.gratitude_list(p_limit integer, p_offset integer) TO authenticated;
GRANT ALL ON FUNCTION public.gratitude_list(p_limit integer, p_offset integer) TO service_role;


--
-- Name: FUNCTION guard_comments(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.guard_comments() TO anon;
GRANT ALL ON FUNCTION public.guard_comments() TO authenticated;
GRANT ALL ON FUNCTION public.guard_comments() TO service_role;


--
-- Name: FUNCTION guard_comments_note(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.guard_comments_note() TO anon;
GRANT ALL ON FUNCTION public.guard_comments_note() TO authenticated;
GRANT ALL ON FUNCTION public.guard_comments_note() TO service_role;


--
-- Name: FUNCTION guard_config_read(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.guard_config_read() TO anon;
GRANT ALL ON FUNCTION public.guard_config_read() TO authenticated;
GRANT ALL ON FUNCTION public.guard_config_read() TO service_role;


--
-- Name: FUNCTION guard_config_write(patch jsonb); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.guard_config_write(patch jsonb) TO anon;
GRANT ALL ON FUNCTION public.guard_config_write(patch jsonb) TO authenticated;
GRANT ALL ON FUNCTION public.guard_config_write(patch jsonb) TO service_role;


--
-- Name: FUNCTION guard_fresh_author(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.guard_fresh_author() TO anon;
GRANT ALL ON FUNCTION public.guard_fresh_author() TO authenticated;
GRANT ALL ON FUNCTION public.guard_fresh_author() TO service_role;


--
-- Name: FUNCTION guard_keep(target bigint); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.guard_keep(target bigint) TO anon;
GRANT ALL ON FUNCTION public.guard_keep(target bigint) TO authenticated;
GRANT ALL ON FUNCTION public.guard_keep(target bigint) TO service_role;


--
-- Name: FUNCTION guard_look(kind text, src text, author uuid); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.guard_look(kind text, src text, author uuid) TO anon;
GRANT ALL ON FUNCTION public.guard_look(kind text, src text, author uuid) TO authenticated;
GRANT ALL ON FUNCTION public.guard_look(kind text, src text, author uuid) TO service_role;


--
-- Name: FUNCTION guard_mass(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.guard_mass() TO anon;
GRANT ALL ON FUNCTION public.guard_mass() TO authenticated;
GRANT ALL ON FUNCTION public.guard_mass() TO service_role;


--
-- Name: FUNCTION guard_norm(src text); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.guard_norm(src text) TO anon;
GRANT ALL ON FUNCTION public.guard_norm(src text) TO authenticated;
GRANT ALL ON FUNCTION public.guard_norm(src text) TO service_role;


--
-- Name: FUNCTION guard_posts(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.guard_posts() TO anon;
GRANT ALL ON FUNCTION public.guard_posts() TO authenticated;
GRANT ALL ON FUNCTION public.guard_posts() TO service_role;


--
-- Name: FUNCTION guard_posts_note(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.guard_posts_note() TO anon;
GRANT ALL ON FUNCTION public.guard_posts_note() TO authenticated;
GRANT ALL ON FUNCTION public.guard_posts_note() TO service_role;


--
-- Name: FUNCTION guard_queue(size integer, mode text); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.guard_queue(size integer, mode text) TO anon;
GRANT ALL ON FUNCTION public.guard_queue(size integer, mode text) TO authenticated;
GRANT ALL ON FUNCTION public.guard_queue(size integer, mode text) TO service_role;


--
-- Name: FUNCTION guard_reason(verdict jsonb); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.guard_reason(verdict jsonb) TO anon;
GRANT ALL ON FUNCTION public.guard_reason(verdict jsonb) TO authenticated;
GRANT ALL ON FUNCTION public.guard_reason(verdict jsonb) TO service_role;


--
-- Name: FUNCTION guard_scan(src text); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.guard_scan(src text) TO anon;
GRANT ALL ON FUNCTION public.guard_scan(src text) TO authenticated;
GRANT ALL ON FUNCTION public.guard_scan(src text) TO service_role;


--
-- Name: FUNCTION guard_stats(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.guard_stats() TO anon;
GRANT ALL ON FUNCTION public.guard_stats() TO authenticated;
GRANT ALL ON FUNCTION public.guard_stats() TO service_role;


--
-- Name: FUNCTION guard_try(src text); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.guard_try(src text) TO anon;
GRANT ALL ON FUNCTION public.guard_try(src text) TO authenticated;
GRANT ALL ON FUNCTION public.guard_try(src text) TO service_role;


--
-- Name: FUNCTION guard_undo(target bigint); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.guard_undo(target bigint) TO anon;
GRANT ALL ON FUNCTION public.guard_undo(target bigint) TO authenticated;
GRANT ALL ON FUNCTION public.guard_undo(target bigint) TO service_role;


--
-- Name: FUNCTION guard_word_add(src text, kind text, weight integer); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.guard_word_add(src text, kind text, weight integer) TO anon;
GRANT ALL ON FUNCTION public.guard_word_add(src text, kind text, weight integer) TO authenticated;
GRANT ALL ON FUNCTION public.guard_word_add(src text, kind text, weight integer) TO service_role;


--
-- Name: FUNCTION guard_word_drop(target bigint); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.guard_word_drop(target bigint) TO anon;
GRANT ALL ON FUNCTION public.guard_word_drop(target bigint) TO authenticated;
GRANT ALL ON FUNCTION public.guard_word_drop(target bigint) TO service_role;


--
-- Name: FUNCTION guard_words_all(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.guard_words_all() TO anon;
GRANT ALL ON FUNCTION public.guard_words_all() TO authenticated;
GRANT ALL ON FUNCTION public.guard_words_all() TO service_role;


--
-- Name: FUNCTION handle_new_user(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.handle_new_user() TO anon;
GRANT ALL ON FUNCTION public.handle_new_user() TO authenticated;
GRANT ALL ON FUNCTION public.handle_new_user() TO service_role;


--
-- Name: FUNCTION invite_mine(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.invite_mine() TO anon;
GRANT ALL ON FUNCTION public.invite_mine() TO authenticated;
GRANT ALL ON FUNCTION public.invite_mine() TO service_role;


--
-- Name: FUNCTION invite_use(code text); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.invite_use(code text) TO anon;
GRANT ALL ON FUNCTION public.invite_use(code text) TO authenticated;
GRANT ALL ON FUNCTION public.invite_use(code text) TO service_role;


--
-- Name: FUNCTION is_chat_member(target_chat bigint); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.is_chat_member(target_chat bigint) TO anon;
GRANT ALL ON FUNCTION public.is_chat_member(target_chat bigint) TO authenticated;
GRANT ALL ON FUNCTION public.is_chat_member(target_chat bigint) TO service_role;


--
-- Name: FUNCTION join_group(p_group_id bigint); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.join_group(p_group_id bigint) TO anon;
GRANT ALL ON FUNCTION public.join_group(p_group_id bigint) TO authenticated;
GRANT ALL ON FUNCTION public.join_group(p_group_id bigint) TO service_role;


--
-- Name: FUNCTION leave_group(p_group_id bigint); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.leave_group(p_group_id bigint) TO anon;
GRANT ALL ON FUNCTION public.leave_group(p_group_id bigint) TO authenticated;
GRANT ALL ON FUNCTION public.leave_group(p_group_id bigint) TO service_role;


--
-- Name: FUNCTION letter_reply(target bigint, answer text); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.letter_reply(target bigint, answer text) TO anon;
GRANT ALL ON FUNCTION public.letter_reply(target bigint, answer text) TO authenticated;
GRANT ALL ON FUNCTION public.letter_reply(target bigint, answer text) TO service_role;


--
-- Name: FUNCTION letter_send(body text); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.letter_send(body text) TO anon;
GRANT ALL ON FUNCTION public.letter_send(body text) TO authenticated;
GRANT ALL ON FUNCTION public.letter_send(body text) TO service_role;


--
-- Name: FUNCTION letter_take(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.letter_take() TO anon;
GRANT ALL ON FUNCTION public.letter_take() TO authenticated;
GRANT ALL ON FUNCTION public.letter_take() TO service_role;


--
-- Name: FUNCTION level_leaderboard(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.level_leaderboard() TO anon;
GRANT ALL ON FUNCTION public.level_leaderboard() TO authenticated;
GRANT ALL ON FUNCTION public.level_leaderboard() TO service_role;


--
-- Name: FUNCTION list_groups(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.list_groups() TO anon;
GRANT ALL ON FUNCTION public.list_groups() TO authenticated;
GRANT ALL ON FUNCTION public.list_groups() TO service_role;


--
-- Name: FUNCTION log_action(action text, meta jsonb); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.log_action(action text, meta jsonb) TO anon;
GRANT ALL ON FUNCTION public.log_action(action text, meta jsonb) TO authenticated;
GRANT ALL ON FUNCTION public.log_action(action text, meta jsonb) TO service_role;


--
-- Name: FUNCTION make_link_code(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.make_link_code() TO anon;
GRANT ALL ON FUNCTION public.make_link_code() TO authenticated;
GRANT ALL ON FUNCTION public.make_link_code() TO service_role;


--
-- Name: FUNCTION mark_notifications(ids bigint[]); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.mark_notifications(ids bigint[]) TO anon;
GRANT ALL ON FUNCTION public.mark_notifications(ids bigint[]) TO authenticated;
GRANT ALL ON FUNCTION public.mark_notifications(ids bigint[]) TO service_role;


--
-- Name: FUNCTION mentor_board(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.mentor_board() TO anon;
GRANT ALL ON FUNCTION public.mentor_board() TO authenticated;
GRANT ALL ON FUNCTION public.mentor_board() TO service_role;


--
-- Name: FUNCTION mentor_drop(student uuid); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.mentor_drop(student uuid) TO anon;
GRANT ALL ON FUNCTION public.mentor_drop(student uuid) TO authenticated;
GRANT ALL ON FUNCTION public.mentor_drop(student uuid) TO service_role;


--
-- Name: FUNCTION mentor_feed(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.mentor_feed() TO anon;
GRANT ALL ON FUNCTION public.mentor_feed() TO authenticated;
GRANT ALL ON FUNCTION public.mentor_feed() TO service_role;


--
-- Name: FUNCTION mentor_review(target bigint, verdict text, note text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.mentor_review(target bigint, verdict text, note text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.mentor_review(target bigint, verdict text, note text) TO authenticated;
GRANT ALL ON FUNCTION public.mentor_review(target bigint, verdict text, note text) TO service_role;


--
-- Name: FUNCTION mentor_take(student uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.mentor_take(student uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.mentor_take(student uuid) TO authenticated;
GRANT ALL ON FUNCTION public.mentor_take(student uuid) TO service_role;


--
-- Name: FUNCTION message_react(target bigint, glyph text); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.message_react(target bigint, glyph text) TO anon;
GRANT ALL ON FUNCTION public.message_react(target bigint, glyph text) TO authenticated;
GRANT ALL ON FUNCTION public.message_react(target bigint, glyph text) TO service_role;


--
-- Name: FUNCTION mod_ban_device(fp text, minutes integer, reason text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.mod_ban_device(fp text, minutes integer, reason text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.mod_ban_device(fp text, minutes integer, reason text) TO authenticated;
GRANT ALL ON FUNCTION public.mod_ban_device(fp text, minutes integer, reason text) TO service_role;


--
-- Name: FUNCTION mod_close_report(target bigint, new_status text); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.mod_close_report(target bigint, new_status text) TO anon;
GRANT ALL ON FUNCTION public.mod_close_report(target bigint, new_status text) TO authenticated;
GRANT ALL ON FUNCTION public.mod_close_report(target bigint, new_status text) TO service_role;


--
-- Name: FUNCTION mod_punish(target uuid, kind text, minutes integer, reason text); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.mod_punish(target uuid, kind text, minutes integer, reason text) TO anon;
GRANT ALL ON FUNCTION public.mod_punish(target uuid, kind text, minutes integer, reason text) TO authenticated;
GRANT ALL ON FUNCTION public.mod_punish(target uuid, kind text, minutes integer, reason text) TO service_role;


--
-- Name: FUNCTION mod_remove_post(target bigint, reason text, proof text); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.mod_remove_post(target bigint, reason text, proof text) TO anon;
GRANT ALL ON FUNCTION public.mod_remove_post(target bigint, reason text, proof text) TO authenticated;
GRANT ALL ON FUNCTION public.mod_remove_post(target bigint, reason text, proof text) TO service_role;


--
-- Name: FUNCTION mod_thanks(target uuid); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.mod_thanks(target uuid) TO anon;
GRANT ALL ON FUNCTION public.mod_thanks(target uuid) TO authenticated;
GRANT ALL ON FUNCTION public.mod_thanks(target uuid) TO service_role;


--
-- Name: FUNCTION mod_unban_device(fp text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.mod_unban_device(fp text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.mod_unban_device(fp text) TO authenticated;
GRANT ALL ON FUNCTION public.mod_unban_device(fp text) TO service_role;


--
-- Name: FUNCTION mod_user_info(target uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.mod_user_info(target uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.mod_user_info(target uuid) TO authenticated;
GRANT ALL ON FUNCTION public.mod_user_info(target uuid) TO service_role;


--
-- Name: FUNCTION month_recap(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.month_recap() TO anon;
GRANT ALL ON FUNCTION public.month_recap() TO authenticated;
GRANT ALL ON FUNCTION public.month_recap() TO service_role;


--
-- Name: FUNCTION mood_map(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.mood_map() TO anon;
GRANT ALL ON FUNCTION public.mood_map() TO authenticated;
GRANT ALL ON FUNCTION public.mood_map() TO service_role;


--
-- Name: FUNCTION mood_twins(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.mood_twins() TO anon;
GRANT ALL ON FUNCTION public.mood_twins() TO authenticated;
GRANT ALL ON FUNCTION public.mood_twins() TO service_role;


--
-- Name: FUNCTION my_appeals(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.my_appeals() TO anon;
GRANT ALL ON FUNCTION public.my_appeals() TO authenticated;
GRANT ALL ON FUNCTION public.my_appeals() TO service_role;


--
-- Name: FUNCTION my_badges(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.my_badges() TO anon;
GRANT ALL ON FUNCTION public.my_badges() TO authenticated;
GRANT ALL ON FUNCTION public.my_badges() TO service_role;


--
-- Name: FUNCTION my_billing(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.my_billing() TO anon;
GRANT ALL ON FUNCTION public.my_billing() TO authenticated;
GRANT ALL ON FUNCTION public.my_billing() TO service_role;


--
-- Name: FUNCTION my_blocks(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.my_blocks() TO anon;
GRANT ALL ON FUNCTION public.my_blocks() TO authenticated;
GRANT ALL ON FUNCTION public.my_blocks() TO service_role;


--
-- Name: FUNCTION my_daily_quests(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.my_daily_quests() TO anon;
GRANT ALL ON FUNCTION public.my_daily_quests() TO authenticated;
GRANT ALL ON FUNCTION public.my_daily_quests() TO service_role;


--
-- Name: FUNCTION my_feed(before timestamp with time zone, size integer); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.my_feed(before timestamp with time zone, size integer) TO anon;
GRANT ALL ON FUNCTION public.my_feed(before timestamp with time zone, size integer) TO authenticated;
GRANT ALL ON FUNCTION public.my_feed(before timestamp with time zone, size integer) TO service_role;


--
-- Name: FUNCTION my_friends(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.my_friends() TO anon;
GRANT ALL ON FUNCTION public.my_friends() TO authenticated;
GRANT ALL ON FUNCTION public.my_friends() TO service_role;


--
-- Name: FUNCTION my_letters(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.my_letters() TO anon;
GRANT ALL ON FUNCTION public.my_letters() TO authenticated;
GRANT ALL ON FUNCTION public.my_letters() TO service_role;


--
-- Name: FUNCTION my_level(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.my_level() TO anon;
GRANT ALL ON FUNCTION public.my_level() TO authenticated;
GRANT ALL ON FUNCTION public.my_level() TO service_role;


--
-- Name: FUNCTION my_profile_viewers(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.my_profile_viewers() TO anon;
GRANT ALL ON FUNCTION public.my_profile_viewers() TO authenticated;
GRANT ALL ON FUNCTION public.my_profile_viewers() TO service_role;


--
-- Name: FUNCTION my_weekly_quests(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.my_weekly_quests() TO anon;
GRANT ALL ON FUNCTION public.my_weekly_quests() TO authenticated;
GRANT ALL ON FUNCTION public.my_weekly_quests() TO service_role;


--
-- Name: FUNCTION note_about(target uuid); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.note_about(target uuid) TO anon;
GRANT ALL ON FUNCTION public.note_about(target uuid) TO authenticated;
GRANT ALL ON FUNCTION public.note_about(target uuid) TO service_role;


--
-- Name: FUNCTION note_save(target uuid, body text); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.note_save(target uuid, body text) TO anon;
GRANT ALL ON FUNCTION public.note_save(target uuid, body text) TO authenticated;
GRANT ALL ON FUNCTION public.note_save(target uuid, body text) TO service_role;


--
-- Name: FUNCTION notify_admins(kind text, title text, body text, meta jsonb, skip uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.notify_admins(kind text, title text, body text, meta jsonb, skip uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.notify_admins(kind text, title text, body text, meta jsonb, skip uuid) TO service_role;


--
-- Name: FUNCTION notify_new_message(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.notify_new_message() TO anon;
GRANT ALL ON FUNCTION public.notify_new_message() TO authenticated;
GRANT ALL ON FUNCTION public.notify_new_message() TO service_role;


--
-- Name: FUNCTION notify_new_post(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.notify_new_post() TO anon;
GRANT ALL ON FUNCTION public.notify_new_post() TO authenticated;
GRANT ALL ON FUNCTION public.notify_new_post() TO service_role;


--
-- Name: FUNCTION notify_new_report(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.notify_new_report() TO anon;
GRANT ALL ON FUNCTION public.notify_new_report() TO authenticated;
GRANT ALL ON FUNCTION public.notify_new_report() TO service_role;


--
-- Name: FUNCTION notify_staff(kind text, title text, body text, meta jsonb, skip uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.notify_staff(kind text, title text, body text, meta jsonb, skip uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.notify_staff(kind text, title text, body text, meta jsonb, skip uuid) TO service_role;


--
-- Name: FUNCTION notify_user(target uuid, kind text, title text, body text, meta jsonb); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.notify_user(target uuid, kind text, title text, body text, meta jsonb) FROM PUBLIC;
GRANT ALL ON FUNCTION public.notify_user(target uuid, kind text, title text, body text, meta jsonb) TO service_role;


--
-- Name: FUNCTION open_dm(peer uuid); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.open_dm(peer uuid) TO anon;
GRANT ALL ON FUNCTION public.open_dm(peer uuid) TO authenticated;
GRANT ALL ON FUNCTION public.open_dm(peer uuid) TO service_role;


--
-- Name: FUNCTION pending_friend_requests(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.pending_friend_requests() TO anon;
GRANT ALL ON FUNCTION public.pending_friend_requests() TO authenticated;
GRANT ALL ON FUNCTION public.pending_friend_requests() TO service_role;


--
-- Name: FUNCTION pin_gift(target bigint, on_shelf boolean); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.pin_gift(target bigint, on_shelf boolean) TO anon;
GRANT ALL ON FUNCTION public.pin_gift(target bigint, on_shelf boolean) TO authenticated;
GRANT ALL ON FUNCTION public.pin_gift(target bigint, on_shelf boolean) TO service_role;


--
-- Name: FUNCTION pin_post(p_post_id bigint); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.pin_post(p_post_id bigint) TO anon;
GRANT ALL ON FUNCTION public.pin_post(p_post_id bigint) TO authenticated;
GRANT ALL ON FUNCTION public.pin_post(p_post_id bigint) TO service_role;


--
-- Name: FUNCTION pin_post(target bigint, on_top boolean); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.pin_post(target bigint, on_top boolean) TO anon;
GRANT ALL ON FUNCTION public.pin_post(target bigint, on_top boolean) TO authenticated;
GRANT ALL ON FUNCTION public.pin_post(target bigint, on_top boolean) TO service_role;


--
-- Name: FUNCTION place_pixel(p_battle_id bigint, p_x integer, p_y integer, p_color text); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.place_pixel(p_battle_id bigint, p_x integer, p_y integer, p_color text) TO anon;
GRANT ALL ON FUNCTION public.place_pixel(p_battle_id bigint, p_x integer, p_y integer, p_color text) TO authenticated;
GRANT ALL ON FUNCTION public.place_pixel(p_battle_id bigint, p_x integer, p_y integer, p_color text) TO service_role;


--
-- Name: FUNCTION poll_result(target bigint); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.poll_result(target bigint) TO anon;
GRANT ALL ON FUNCTION public.poll_result(target bigint) TO authenticated;
GRANT ALL ON FUNCTION public.poll_result(target bigint) TO service_role;


--
-- Name: FUNCTION poll_vote(target bigint, choice integer); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.poll_vote(target bigint, choice integer) TO anon;
GRANT ALL ON FUNCTION public.poll_vote(target bigint, choice integer) TO authenticated;
GRANT ALL ON FUNCTION public.poll_vote(target bigint, choice integer) TO service_role;


--
-- Name: FUNCTION post_reactions(target bigint); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.post_reactions(target bigint) TO anon;
GRANT ALL ON FUNCTION public.post_reactions(target bigint) TO authenticated;
GRANT ALL ON FUNCTION public.post_reactions(target bigint) TO service_role;


--
-- Name: FUNCTION protect_login_name(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.protect_login_name() TO anon;
GRANT ALL ON FUNCTION public.protect_login_name() TO authenticated;
GRANT ALL ON FUNCTION public.protect_login_name() TO service_role;


--
-- Name: FUNCTION protect_profile(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.protect_profile() TO anon;
GRANT ALL ON FUNCTION public.protect_profile() TO authenticated;
GRANT ALL ON FUNCTION public.protect_profile() TO service_role;


--
-- Name: FUNCTION purge_call_signals(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.purge_call_signals() TO anon;
GRANT ALL ON FUNCTION public.purge_call_signals() TO authenticated;
GRANT ALL ON FUNCTION public.purge_call_signals() TO service_role;


--
-- Name: FUNCTION purge_expired_stories(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.purge_expired_stories() TO anon;
GRANT ALL ON FUNCTION public.purge_expired_stories() TO authenticated;
GRANT ALL ON FUNCTION public.purge_expired_stories() TO service_role;


--
-- Name: FUNCTION rank_name(rank integer); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.rank_name(rank integer) TO anon;
GRANT ALL ON FUNCTION public.rank_name(rank integer) TO authenticated;
GRANT ALL ON FUNCTION public.rank_name(rank integer) TO service_role;


--
-- Name: FUNCTION react(target bigint, want text); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.react(target bigint, want text) TO anon;
GRANT ALL ON FUNCTION public.react(target bigint, want text) TO authenticated;
GRANT ALL ON FUNCTION public.react(target bigint, want text) TO service_role;


--
-- Name: FUNCTION record_profile_view(p_profile_id uuid); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.record_profile_view(p_profile_id uuid) TO anon;
GRANT ALL ON FUNCTION public.record_profile_view(p_profile_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.record_profile_view(p_profile_id uuid) TO service_role;


--
-- Name: FUNCTION recovery_make(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.recovery_make() FROM PUBLIC;
GRANT ALL ON FUNCTION public.recovery_make() TO authenticated;
GRANT ALL ON FUNCTION public.recovery_make() TO service_role;


--
-- Name: FUNCTION recovery_state(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.recovery_state() TO anon;
GRANT ALL ON FUNCTION public.recovery_state() TO authenticated;
GRANT ALL ON FUNCTION public.recovery_state() TO service_role;


--
-- Name: FUNCTION recovery_use(login text, code text, fresh_password text); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.recovery_use(login text, code text, fresh_password text) TO anon;
GRANT ALL ON FUNCTION public.recovery_use(login text, code text, fresh_password text) TO authenticated;
GRANT ALL ON FUNCTION public.recovery_use(login text, code text, fresh_password text) TO service_role;


--
-- Name: FUNCTION redeem_promo(p_code text); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.redeem_promo(p_code text) TO anon;
GRANT ALL ON FUNCTION public.redeem_promo(p_code text) TO authenticated;
GRANT ALL ON FUNCTION public.redeem_promo(p_code text) TO service_role;


--
-- Name: FUNCTION reminder_drop(target bigint); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.reminder_drop(target bigint) TO anon;
GRANT ALL ON FUNCTION public.reminder_drop(target bigint) TO authenticated;
GRANT ALL ON FUNCTION public.reminder_drop(target bigint) TO service_role;


--
-- Name: FUNCTION reminder_make(body text, minutes integer); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.reminder_make(body text, minutes integer) TO anon;
GRANT ALL ON FUNCTION public.reminder_make(body text, minutes integer) TO authenticated;
GRANT ALL ON FUNCTION public.reminder_make(body text, minutes integer) TO service_role;


--
-- Name: FUNCTION reminders_mine(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.reminders_mine() TO anon;
GRANT ALL ON FUNCTION public.reminders_mine() TO authenticated;
GRANT ALL ON FUNCTION public.reminders_mine() TO service_role;


--
-- Name: FUNCTION reminders_ring(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.reminders_ring() TO anon;
GRANT ALL ON FUNCTION public.reminders_ring() TO authenticated;
GRANT ALL ON FUNCTION public.reminders_ring() TO service_role;


--
-- Name: FUNCTION remove_friend(p_target uuid); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.remove_friend(p_target uuid) TO anon;
GRANT ALL ON FUNCTION public.remove_friend(p_target uuid) TO authenticated;
GRANT ALL ON FUNCTION public.remove_friend(p_target uuid) TO service_role;


--
-- Name: FUNCTION remove_wishlist_item(p_id bigint); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.remove_wishlist_item(p_id bigint) TO anon;
GRANT ALL ON FUNCTION public.remove_wishlist_item(p_id bigint) TO authenticated;
GRANT ALL ON FUNCTION public.remove_wishlist_item(p_id bigint) TO service_role;


--
-- Name: FUNCTION repost(target bigint, note text); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.repost(target bigint, note text) TO anon;
GRANT ALL ON FUNCTION public.repost(target bigint, note text) TO authenticated;
GRANT ALL ON FUNCTION public.repost(target bigint, note text) TO service_role;


--
-- Name: FUNCTION resolve_login(target text); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.resolve_login(target text) TO anon;
GRANT ALL ON FUNCTION public.resolve_login(target text) TO authenticated;
GRANT ALL ON FUNCTION public.resolve_login(target text) TO service_role;


--
-- Name: FUNCTION save_custom_theme(p_theme jsonb); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.save_custom_theme(p_theme jsonb) TO anon;
GRANT ALL ON FUNCTION public.save_custom_theme(p_theme jsonb) TO authenticated;
GRANT ALL ON FUNCTION public.save_custom_theme(p_theme jsonb) TO service_role;


--
-- Name: FUNCTION search_all(p_query text); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.search_all(p_query text) TO anon;
GRANT ALL ON FUNCTION public.search_all(p_query text) TO authenticated;
GRANT ALL ON FUNCTION public.search_all(p_query text) TO service_role;


--
-- Name: FUNCTION season_now(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.season_now() TO anon;
GRANT ALL ON FUNCTION public.season_now() TO authenticated;
GRANT ALL ON FUNCTION public.season_now() TO service_role;


--
-- Name: FUNCTION season_state(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.season_state() TO anon;
GRANT ALL ON FUNCTION public.season_state() TO authenticated;
GRANT ALL ON FUNCTION public.season_state() TO service_role;


--
-- Name: FUNCTION sell_gift(target bigint); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.sell_gift(target bigint) TO anon;
GRANT ALL ON FUNCTION public.sell_gift(target bigint) TO authenticated;
GRANT ALL ON FUNCTION public.sell_gift(target bigint) TO service_role;


--
-- Name: FUNCTION send_friend_request(p_target uuid); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.send_friend_request(p_target uuid) TO anon;
GRANT ALL ON FUNCTION public.send_friend_request(p_target uuid) TO authenticated;
GRANT ALL ON FUNCTION public.send_friend_request(p_target uuid) TO service_role;


--
-- Name: FUNCTION send_post(chat bigint, target bigint, note text); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.send_post(chat bigint, target bigint, note text) TO anon;
GRANT ALL ON FUNCTION public.send_post(chat bigint, target bigint, note text) TO authenticated;
GRANT ALL ON FUNCTION public.send_post(chat bigint, target bigint, note text) TO service_role;


--
-- Name: FUNCTION set_main_username(target text); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.set_main_username(target text) TO anon;
GRANT ALL ON FUNCTION public.set_main_username(target text) TO authenticated;
GRANT ALL ON FUNCTION public.set_main_username(target text) TO service_role;


--
-- Name: FUNCTION set_pin_code(p_code text); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.set_pin_code(p_code text) TO anon;
GRANT ALL ON FUNCTION public.set_pin_code(p_code text) TO authenticated;
GRANT ALL ON FUNCTION public.set_pin_code(p_code text) TO service_role;


--
-- Name: FUNCTION set_shelf(rows jsonb); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.set_shelf(rows jsonb) TO anon;
GRANT ALL ON FUNCTION public.set_shelf(rows jsonb) TO authenticated;
GRANT ALL ON FUNCTION public.set_shelf(rows jsonb) TO service_role;


--
-- Name: FUNCTION spin_wheel(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.spin_wheel() TO anon;
GRANT ALL ON FUNCTION public.spin_wheel() TO authenticated;
GRANT ALL ON FUNCTION public.spin_wheel() TO service_role;


--
-- Name: FUNCTION start_of_week(d date); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.start_of_week(d date) TO anon;
GRANT ALL ON FUNCTION public.start_of_week(d date) TO authenticated;
GRANT ALL ON FUNCTION public.start_of_week(d date) TO service_role;


--
-- Name: FUNCTION start_pixel_battle(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.start_pixel_battle() TO anon;
GRANT ALL ON FUNCTION public.start_pixel_battle() TO authenticated;
GRANT ALL ON FUNCTION public.start_pixel_battle() TO service_role;


--
-- Name: FUNCTION summer_recap(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.summer_recap() TO anon;
GRANT ALL ON FUNCTION public.summer_recap() TO authenticated;
GRANT ALL ON FUNCTION public.summer_recap() TO service_role;


--
-- Name: FUNCTION thank_mod(target uuid, note text); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.thank_mod(target uuid, note text) TO anon;
GRANT ALL ON FUNCTION public.thank_mod(target uuid, note text) TO authenticated;
GRANT ALL ON FUNCTION public.thank_mod(target uuid, note text) TO service_role;


--
-- Name: FUNCTION today_challenge(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.today_challenge() TO anon;
GRANT ALL ON FUNCTION public.today_challenge() TO authenticated;
GRANT ALL ON FUNCTION public.today_challenge() TO service_role;


--
-- Name: FUNCTION today_quote(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.today_quote() TO anon;
GRANT ALL ON FUNCTION public.today_quote() TO authenticated;
GRANT ALL ON FUNCTION public.today_quote() TO service_role;


--
-- Name: FUNCTION touch_device(fp text, info jsonb, fresh boolean); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.touch_device(fp text, info jsonb, fresh boolean) FROM PUBLIC;
GRANT ALL ON FUNCTION public.touch_device(fp text, info jsonb, fresh boolean) TO authenticated;
GRANT ALL ON FUNCTION public.touch_device(fp text, info jsonb, fresh boolean) TO service_role;


--
-- Name: FUNCTION touch_presence(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.touch_presence() TO anon;
GRANT ALL ON FUNCTION public.touch_presence() TO authenticated;
GRANT ALL ON FUNCTION public.touch_presence() TO service_role;


--
-- Name: FUNCTION touch_streak(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.touch_streak() TO anon;
GRANT ALL ON FUNCTION public.touch_streak() TO authenticated;
GRANT ALL ON FUNCTION public.touch_streak() TO service_role;


--
-- Name: FUNCTION tournament_leaderboard(p_tour_id bigint); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.tournament_leaderboard(p_tour_id bigint) TO anon;
GRANT ALL ON FUNCTION public.tournament_leaderboard(p_tour_id bigint) TO authenticated;
GRANT ALL ON FUNCTION public.tournament_leaderboard(p_tour_id bigint) TO service_role;


--
-- Name: FUNCTION unblock_user(p_target uuid); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.unblock_user(p_target uuid) TO anon;
GRANT ALL ON FUNCTION public.unblock_user(p_target uuid) TO authenticated;
GRANT ALL ON FUNCTION public.unblock_user(p_target uuid) TO service_role;


--
-- Name: FUNCTION username_limit(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.username_limit() TO anon;
GRANT ALL ON FUNCTION public.username_limit() TO authenticated;
GRANT ALL ON FUNCTION public.username_limit() TO service_role;


--
-- Name: FUNCTION viewer_can_write(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.viewer_can_write() TO anon;
GRANT ALL ON FUNCTION public.viewer_can_write() TO authenticated;
GRANT ALL ON FUNCTION public.viewer_can_write() TO service_role;


--
-- Name: FUNCTION viewer_is_admin(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.viewer_is_admin() TO anon;
GRANT ALL ON FUNCTION public.viewer_is_admin() TO authenticated;
GRANT ALL ON FUNCTION public.viewer_is_admin() TO service_role;


--
-- Name: FUNCTION viewer_is_beta(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.viewer_is_beta() TO anon;
GRANT ALL ON FUNCTION public.viewer_is_beta() TO authenticated;
GRANT ALL ON FUNCTION public.viewer_is_beta() TO service_role;


--
-- Name: FUNCTION viewer_is_moderator(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.viewer_is_moderator() TO anon;
GRANT ALL ON FUNCTION public.viewer_is_moderator() TO authenticated;
GRANT ALL ON FUNCTION public.viewer_is_moderator() TO service_role;


--
-- Name: FUNCTION viewer_is_premium(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.viewer_is_premium() TO anon;
GRANT ALL ON FUNCTION public.viewer_is_premium() TO authenticated;
GRANT ALL ON FUNCTION public.viewer_is_premium() TO service_role;


--
-- Name: TABLE ai_chats; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.ai_chats TO anon;
GRANT ALL ON TABLE public.ai_chats TO authenticated;
GRANT ALL ON TABLE public.ai_chats TO service_role;


--
-- Name: SEQUENCE ai_chats_id_seq; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON SEQUENCE public.ai_chats_id_seq TO anon;
GRANT ALL ON SEQUENCE public.ai_chats_id_seq TO authenticated;
GRANT ALL ON SEQUENCE public.ai_chats_id_seq TO service_role;


--
-- Name: TABLE announcements; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.announcements TO anon;
GRANT ALL ON TABLE public.announcements TO authenticated;
GRANT ALL ON TABLE public.announcements TO service_role;


--
-- Name: SEQUENCE announcements_id_seq; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON SEQUENCE public.announcements_id_seq TO anon;
GRANT ALL ON SEQUENCE public.announcements_id_seq TO authenticated;
GRANT ALL ON SEQUENCE public.announcements_id_seq TO service_role;


--
-- Name: TABLE appeals; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.appeals TO anon;
GRANT ALL ON TABLE public.appeals TO authenticated;
GRANT ALL ON TABLE public.appeals TO service_role;


--
-- Name: SEQUENCE appeals_id_seq; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON SEQUENCE public.appeals_id_seq TO anon;
GRANT ALL ON SEQUENCE public.appeals_id_seq TO authenticated;
GRANT ALL ON SEQUENCE public.appeals_id_seq TO service_role;


--
-- Name: TABLE audit; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.audit TO anon;
GRANT ALL ON TABLE public.audit TO authenticated;
GRANT ALL ON TABLE public.audit TO service_role;


--
-- Name: SEQUENCE audit_id_seq; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON SEQUENCE public.audit_id_seq TO anon;
GRANT ALL ON SEQUENCE public.audit_id_seq TO authenticated;
GRANT ALL ON SEQUENCE public.audit_id_seq TO service_role;


--
-- Name: TABLE badges; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.badges TO anon;
GRANT ALL ON TABLE public.badges TO authenticated;
GRANT ALL ON TABLE public.badges TO service_role;


--
-- Name: TABLE blocks; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.blocks TO anon;
GRANT ALL ON TABLE public.blocks TO authenticated;
GRANT ALL ON TABLE public.blocks TO service_role;


--
-- Name: TABLE breaths; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.breaths TO anon;
GRANT ALL ON TABLE public.breaths TO authenticated;
GRANT ALL ON TABLE public.breaths TO service_role;


--
-- Name: TABLE call_signals; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.call_signals TO anon;
GRANT ALL ON TABLE public.call_signals TO authenticated;
GRANT ALL ON TABLE public.call_signals TO service_role;


--
-- Name: SEQUENCE call_signals_id_seq; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON SEQUENCE public.call_signals_id_seq TO anon;
GRANT ALL ON SEQUENCE public.call_signals_id_seq TO authenticated;
GRANT ALL ON SEQUENCE public.call_signals_id_seq TO service_role;


--
-- Name: TABLE campfire_messages; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.campfire_messages TO anon;
GRANT ALL ON TABLE public.campfire_messages TO authenticated;
GRANT ALL ON TABLE public.campfire_messages TO service_role;


--
-- Name: SEQUENCE campfire_messages_id_seq; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON SEQUENCE public.campfire_messages_id_seq TO anon;
GRANT ALL ON SEQUENCE public.campfire_messages_id_seq TO authenticated;
GRANT ALL ON SEQUENCE public.campfire_messages_id_seq TO service_role;


--
-- Name: TABLE campfire_rooms; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.campfire_rooms TO anon;
GRANT ALL ON TABLE public.campfire_rooms TO authenticated;
GRANT ALL ON TABLE public.campfire_rooms TO service_role;


--
-- Name: SEQUENCE campfire_rooms_id_seq; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON SEQUENCE public.campfire_rooms_id_seq TO anon;
GRANT ALL ON SEQUENCE public.campfire_rooms_id_seq TO authenticated;
GRANT ALL ON SEQUENCE public.campfire_rooms_id_seq TO service_role;


--
-- Name: TABLE campfire_seats; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.campfire_seats TO anon;
GRANT ALL ON TABLE public.campfire_seats TO authenticated;
GRANT ALL ON TABLE public.campfire_seats TO service_role;


--
-- Name: TABLE capsules; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.capsules TO anon;
GRANT ALL ON TABLE public.capsules TO authenticated;
GRANT ALL ON TABLE public.capsules TO service_role;


--
-- Name: SEQUENCE capsules_id_seq; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON SEQUENCE public.capsules_id_seq TO anon;
GRANT ALL ON SEQUENCE public.capsules_id_seq TO authenticated;
GRANT ALL ON SEQUENCE public.capsules_id_seq TO service_role;


--
-- Name: TABLE chat_members; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.chat_members TO anon;
GRANT ALL ON TABLE public.chat_members TO authenticated;
GRANT ALL ON TABLE public.chat_members TO service_role;


--
-- Name: TABLE chats; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.chats TO anon;
GRANT ALL ON TABLE public.chats TO authenticated;
GRANT ALL ON TABLE public.chats TO service_role;


--
-- Name: SEQUENCE chats_id_seq; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON SEQUENCE public.chats_id_seq TO anon;
GRANT ALL ON SEQUENCE public.chats_id_seq TO authenticated;
GRANT ALL ON SEQUENCE public.chats_id_seq TO service_role;


--
-- Name: TABLE coin_log; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.coin_log TO anon;
GRANT ALL ON TABLE public.coin_log TO authenticated;
GRANT ALL ON TABLE public.coin_log TO service_role;


--
-- Name: SEQUENCE coin_log_id_seq; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON SEQUENCE public.coin_log_id_seq TO anon;
GRANT ALL ON SEQUENCE public.coin_log_id_seq TO authenticated;
GRANT ALL ON SEQUENCE public.coin_log_id_seq TO service_role;


--
-- Name: TABLE comments; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.comments TO anon;
GRANT ALL ON TABLE public.comments TO authenticated;
GRANT ALL ON TABLE public.comments TO service_role;


--
-- Name: SEQUENCE comments_id_seq; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON SEQUENCE public.comments_id_seq TO anon;
GRANT ALL ON SEQUENCE public.comments_id_seq TO authenticated;
GRANT ALL ON SEQUENCE public.comments_id_seq TO service_role;


--
-- Name: TABLE confessions; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.confessions TO anon;
GRANT ALL ON TABLE public.confessions TO authenticated;
GRANT ALL ON TABLE public.confessions TO service_role;


--
-- Name: SEQUENCE confessions_id_seq; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON SEQUENCE public.confessions_id_seq TO anon;
GRANT ALL ON SEQUENCE public.confessions_id_seq TO authenticated;
GRANT ALL ON SEQUENCE public.confessions_id_seq TO service_role;


--
-- Name: TABLE contacts; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.contacts TO anon;
GRANT ALL ON TABLE public.contacts TO authenticated;
GRANT ALL ON TABLE public.contacts TO service_role;


--
-- Name: TABLE daily_challenge_completions; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.daily_challenge_completions TO anon;
GRANT ALL ON TABLE public.daily_challenge_completions TO authenticated;
GRANT ALL ON TABLE public.daily_challenge_completions TO service_role;


--
-- Name: TABLE daily_challenges; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.daily_challenges TO anon;
GRANT ALL ON TABLE public.daily_challenges TO authenticated;
GRANT ALL ON TABLE public.daily_challenges TO service_role;


--
-- Name: SEQUENCE daily_challenges_id_seq; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON SEQUENCE public.daily_challenges_id_seq TO anon;
GRANT ALL ON SEQUENCE public.daily_challenges_id_seq TO authenticated;
GRANT ALL ON SEQUENCE public.daily_challenges_id_seq TO service_role;


--
-- Name: TABLE daily_quests; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.daily_quests TO anon;
GRANT ALL ON TABLE public.daily_quests TO authenticated;
GRANT ALL ON TABLE public.daily_quests TO service_role;


--
-- Name: SEQUENCE daily_quests_id_seq; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON SEQUENCE public.daily_quests_id_seq TO anon;
GRANT ALL ON SEQUENCE public.daily_quests_id_seq TO authenticated;
GRANT ALL ON SEQUENCE public.daily_quests_id_seq TO service_role;


--
-- Name: TABLE daily_quotes; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.daily_quotes TO anon;
GRANT ALL ON TABLE public.daily_quotes TO authenticated;
GRANT ALL ON TABLE public.daily_quotes TO service_role;


--
-- Name: SEQUENCE daily_quotes_id_seq; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON SEQUENCE public.daily_quotes_id_seq TO anon;
GRANT ALL ON SEQUENCE public.daily_quotes_id_seq TO authenticated;
GRANT ALL ON SEQUENCE public.daily_quotes_id_seq TO service_role;


--
-- Name: TABLE daily_spins; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.daily_spins TO anon;
GRANT ALL ON TABLE public.daily_spins TO authenticated;
GRANT ALL ON TABLE public.daily_spins TO service_role;


--
-- Name: TABLE device_bans; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.device_bans TO anon;
GRANT ALL ON TABLE public.device_bans TO authenticated;
GRANT ALL ON TABLE public.device_bans TO service_role;


--
-- Name: SEQUENCE device_bans_id_seq; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON SEQUENCE public.device_bans_id_seq TO anon;
GRANT ALL ON SEQUENCE public.device_bans_id_seq TO authenticated;
GRANT ALL ON SEQUENCE public.device_bans_id_seq TO service_role;


--
-- Name: TABLE device_users; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.device_users TO anon;
GRANT ALL ON TABLE public.device_users TO authenticated;
GRANT ALL ON TABLE public.device_users TO service_role;


--
-- Name: TABLE devices; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.devices TO anon;
GRANT ALL ON TABLE public.devices TO authenticated;
GRANT ALL ON TABLE public.devices TO service_role;


--
-- Name: TABLE event_claims; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.event_claims TO anon;
GRANT ALL ON TABLE public.event_claims TO authenticated;
GRANT ALL ON TABLE public.event_claims TO service_role;


--
-- Name: TABLE event_progress; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.event_progress TO anon;
GRANT ALL ON TABLE public.event_progress TO authenticated;
GRANT ALL ON TABLE public.event_progress TO service_role;


--
-- Name: TABLE follows; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.follows TO anon;
GRANT ALL ON TABLE public.follows TO authenticated;
GRANT ALL ON TABLE public.follows TO service_role;


--
-- Name: TABLE friendships; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.friendships TO anon;
GRANT ALL ON TABLE public.friendships TO authenticated;
GRANT ALL ON TABLE public.friendships TO service_role;


--
-- Name: TABLE game_scores; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.game_scores TO anon;
GRANT ALL ON TABLE public.game_scores TO authenticated;
GRANT ALL ON TABLE public.game_scores TO service_role;


--
-- Name: SEQUENCE game_scores_id_seq; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON SEQUENCE public.game_scores_id_seq TO anon;
GRANT ALL ON SEQUENCE public.game_scores_id_seq TO authenticated;
GRANT ALL ON SEQUENCE public.game_scores_id_seq TO service_role;


--
-- Name: TABLE gift_types; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.gift_types TO anon;
GRANT ALL ON TABLE public.gift_types TO authenticated;
GRANT ALL ON TABLE public.gift_types TO service_role;


--
-- Name: TABLE gifts; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.gifts TO anon;
GRANT ALL ON TABLE public.gifts TO authenticated;
GRANT ALL ON TABLE public.gifts TO service_role;


--
-- Name: SEQUENCE gifts_id_seq; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON SEQUENCE public.gifts_id_seq TO anon;
GRANT ALL ON SEQUENCE public.gifts_id_seq TO authenticated;
GRANT ALL ON SEQUENCE public.gifts_id_seq TO service_role;


--
-- Name: TABLE gratitude_entries; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.gratitude_entries TO anon;
GRANT ALL ON TABLE public.gratitude_entries TO authenticated;
GRANT ALL ON TABLE public.gratitude_entries TO service_role;


--
-- Name: SEQUENCE gratitude_entries_id_seq; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON SEQUENCE public.gratitude_entries_id_seq TO anon;
GRANT ALL ON SEQUENCE public.gratitude_entries_id_seq TO authenticated;
GRANT ALL ON SEQUENCE public.gratitude_entries_id_seq TO service_role;


--
-- Name: TABLE group_members; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.group_members TO anon;
GRANT ALL ON TABLE public.group_members TO authenticated;
GRANT ALL ON TABLE public.group_members TO service_role;


--
-- Name: TABLE groups; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.groups TO anon;
GRANT ALL ON TABLE public.groups TO authenticated;
GRANT ALL ON TABLE public.groups TO service_role;


--
-- Name: SEQUENCE groups_id_seq; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON SEQUENCE public.groups_id_seq TO anon;
GRANT ALL ON SEQUENCE public.groups_id_seq TO authenticated;
GRANT ALL ON SEQUENCE public.groups_id_seq TO service_role;


--
-- Name: TABLE guard_config; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.guard_config TO anon;
GRANT ALL ON TABLE public.guard_config TO authenticated;
GRANT ALL ON TABLE public.guard_config TO service_role;


--
-- Name: TABLE guard_hits; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.guard_hits TO anon;
GRANT ALL ON TABLE public.guard_hits TO authenticated;
GRANT ALL ON TABLE public.guard_hits TO service_role;


--
-- Name: SEQUENCE guard_hits_id_seq; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON SEQUENCE public.guard_hits_id_seq TO anon;
GRANT ALL ON SEQUENCE public.guard_hits_id_seq TO authenticated;
GRANT ALL ON SEQUENCE public.guard_hits_id_seq TO service_role;


--
-- Name: TABLE guard_words; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.guard_words TO anon;
GRANT ALL ON TABLE public.guard_words TO authenticated;
GRANT ALL ON TABLE public.guard_words TO service_role;


--
-- Name: SEQUENCE guard_words_id_seq; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON SEQUENCE public.guard_words_id_seq TO anon;
GRANT ALL ON SEQUENCE public.guard_words_id_seq TO authenticated;
GRANT ALL ON SEQUENCE public.guard_words_id_seq TO service_role;


--
-- Name: TABLE invite_uses; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.invite_uses TO anon;
GRANT ALL ON TABLE public.invite_uses TO authenticated;
GRANT ALL ON TABLE public.invite_uses TO service_role;


--
-- Name: SEQUENCE invite_uses_id_seq; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON SEQUENCE public.invite_uses_id_seq TO anon;
GRANT ALL ON SEQUENCE public.invite_uses_id_seq TO authenticated;
GRANT ALL ON SEQUENCE public.invite_uses_id_seq TO service_role;


--
-- Name: TABLE invites; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.invites TO anon;
GRANT ALL ON TABLE public.invites TO authenticated;
GRANT ALL ON TABLE public.invites TO service_role;


--
-- Name: TABLE journal; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.journal TO anon;
GRANT ALL ON TABLE public.journal TO authenticated;
GRANT ALL ON TABLE public.journal TO service_role;


--
-- Name: SEQUENCE journal_id_seq; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON SEQUENCE public.journal_id_seq TO anon;
GRANT ALL ON SEQUENCE public.journal_id_seq TO authenticated;
GRANT ALL ON SEQUENCE public.journal_id_seq TO service_role;


--
-- Name: TABLE letters; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.letters TO anon;
GRANT ALL ON TABLE public.letters TO authenticated;
GRANT ALL ON TABLE public.letters TO service_role;


--
-- Name: SEQUENCE letters_id_seq; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON SEQUENCE public.letters_id_seq TO anon;
GRANT ALL ON SEQUENCE public.letters_id_seq TO authenticated;
GRANT ALL ON SEQUENCE public.letters_id_seq TO service_role;


--
-- Name: TABLE likes; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.likes TO anon;
GRANT ALL ON TABLE public.likes TO authenticated;
GRANT ALL ON TABLE public.likes TO service_role;


--
-- Name: TABLE link_codes; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.link_codes TO anon;
GRANT ALL ON TABLE public.link_codes TO authenticated;
GRANT ALL ON TABLE public.link_codes TO service_role;


--
-- Name: TABLE mentor_reviews; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.mentor_reviews TO anon;
GRANT ALL ON TABLE public.mentor_reviews TO authenticated;
GRANT ALL ON TABLE public.mentor_reviews TO service_role;


--
-- Name: SEQUENCE mentor_reviews_id_seq; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON SEQUENCE public.mentor_reviews_id_seq TO anon;
GRANT ALL ON SEQUENCE public.mentor_reviews_id_seq TO authenticated;
GRANT ALL ON SEQUENCE public.mentor_reviews_id_seq TO service_role;


--
-- Name: TABLE mentorships; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.mentorships TO anon;
GRANT ALL ON TABLE public.mentorships TO authenticated;
GRANT ALL ON TABLE public.mentorships TO service_role;


--
-- Name: SEQUENCE mentorships_id_seq; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON SEQUENCE public.mentorships_id_seq TO anon;
GRANT ALL ON SEQUENCE public.mentorships_id_seq TO authenticated;
GRANT ALL ON SEQUENCE public.mentorships_id_seq TO service_role;


--
-- Name: TABLE message_reactions; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.message_reactions TO anon;
GRANT ALL ON TABLE public.message_reactions TO authenticated;
GRANT ALL ON TABLE public.message_reactions TO service_role;


--
-- Name: TABLE messages; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.messages TO anon;
GRANT ALL ON TABLE public.messages TO authenticated;
GRANT ALL ON TABLE public.messages TO service_role;


--
-- Name: SEQUENCE messages_id_seq; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON SEQUENCE public.messages_id_seq TO anon;
GRANT ALL ON SEQUENCE public.messages_id_seq TO authenticated;
GRANT ALL ON SEQUENCE public.messages_id_seq TO service_role;


--
-- Name: TABLE mod_strikes; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.mod_strikes TO anon;
GRANT ALL ON TABLE public.mod_strikes TO authenticated;
GRANT ALL ON TABLE public.mod_strikes TO service_role;


--
-- Name: SEQUENCE mod_strikes_id_seq; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON SEQUENCE public.mod_strikes_id_seq TO anon;
GRANT ALL ON SEQUENCE public.mod_strikes_id_seq TO authenticated;
GRANT ALL ON SEQUENCE public.mod_strikes_id_seq TO service_role;


--
-- Name: TABLE notifications; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.notifications TO anon;
GRANT ALL ON TABLE public.notifications TO authenticated;
GRANT ALL ON TABLE public.notifications TO service_role;


--
-- Name: SEQUENCE notifications_id_seq; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON SEQUENCE public.notifications_id_seq TO anon;
GRANT ALL ON SEQUENCE public.notifications_id_seq TO authenticated;
GRANT ALL ON SEQUENCE public.notifications_id_seq TO service_role;


--
-- Name: TABLE payments; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.payments TO anon;
GRANT ALL ON TABLE public.payments TO authenticated;
GRANT ALL ON TABLE public.payments TO service_role;


--
-- Name: SEQUENCE payments_id_seq; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON SEQUENCE public.payments_id_seq TO anon;
GRANT ALL ON SEQUENCE public.payments_id_seq TO authenticated;
GRANT ALL ON SEQUENCE public.payments_id_seq TO service_role;


--
-- Name: TABLE people_notes; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.people_notes TO anon;
GRANT ALL ON TABLE public.people_notes TO authenticated;
GRANT ALL ON TABLE public.people_notes TO service_role;


--
-- Name: TABLE pixel_battles; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.pixel_battles TO anon;
GRANT ALL ON TABLE public.pixel_battles TO authenticated;
GRANT ALL ON TABLE public.pixel_battles TO service_role;


--
-- Name: SEQUENCE pixel_battles_id_seq; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON SEQUENCE public.pixel_battles_id_seq TO anon;
GRANT ALL ON SEQUENCE public.pixel_battles_id_seq TO authenticated;
GRANT ALL ON SEQUENCE public.pixel_battles_id_seq TO service_role;


--
-- Name: TABLE pixel_cells; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.pixel_cells TO anon;
GRANT ALL ON TABLE public.pixel_cells TO authenticated;
GRANT ALL ON TABLE public.pixel_cells TO service_role;


--
-- Name: TABLE pixel_cooldowns; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.pixel_cooldowns TO anon;
GRANT ALL ON TABLE public.pixel_cooldowns TO authenticated;
GRANT ALL ON TABLE public.pixel_cooldowns TO service_role;


--
-- Name: TABLE poll_votes; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.poll_votes TO anon;
GRANT ALL ON TABLE public.poll_votes TO authenticated;
GRANT ALL ON TABLE public.poll_votes TO service_role;


--
-- Name: TABLE posts; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.posts TO anon;
GRANT ALL ON TABLE public.posts TO authenticated;
GRANT ALL ON TABLE public.posts TO service_role;


--
-- Name: SEQUENCE posts_id_seq; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON SEQUENCE public.posts_id_seq TO anon;
GRANT ALL ON SEQUENCE public.posts_id_seq TO authenticated;
GRANT ALL ON SEQUENCE public.posts_id_seq TO service_role;


--
-- Name: TABLE profile_views; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.profile_views TO anon;
GRANT ALL ON TABLE public.profile_views TO authenticated;
GRANT ALL ON TABLE public.profile_views TO service_role;


--
-- Name: SEQUENCE profile_views_id_seq; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON SEQUENCE public.profile_views_id_seq TO anon;
GRANT ALL ON SEQUENCE public.profile_views_id_seq TO authenticated;
GRANT ALL ON SEQUENCE public.profile_views_id_seq TO service_role;


--
-- Name: TABLE profiles; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.profiles TO anon;
GRANT ALL ON TABLE public.profiles TO authenticated;
GRANT ALL ON TABLE public.profiles TO service_role;


--
-- Name: TABLE promocode_uses; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.promocode_uses TO anon;
GRANT ALL ON TABLE public.promocode_uses TO authenticated;
GRANT ALL ON TABLE public.promocode_uses TO service_role;


--
-- Name: SEQUENCE promocode_uses_id_seq; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON SEQUENCE public.promocode_uses_id_seq TO anon;
GRANT ALL ON SEQUENCE public.promocode_uses_id_seq TO authenticated;
GRANT ALL ON SEQUENCE public.promocode_uses_id_seq TO service_role;


--
-- Name: TABLE promocodes; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.promocodes TO anon;
GRANT ALL ON TABLE public.promocodes TO authenticated;
GRANT ALL ON TABLE public.promocodes TO service_role;


--
-- Name: SEQUENCE promocodes_id_seq; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON SEQUENCE public.promocodes_id_seq TO anon;
GRANT ALL ON SEQUENCE public.promocodes_id_seq TO authenticated;
GRANT ALL ON SEQUENCE public.promocodes_id_seq TO service_role;


--
-- Name: TABLE punishments; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.punishments TO anon;
GRANT ALL ON TABLE public.punishments TO authenticated;
GRANT ALL ON TABLE public.punishments TO service_role;


--
-- Name: SEQUENCE punishments_id_seq; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON SEQUENCE public.punishments_id_seq TO anon;
GRANT ALL ON SEQUENCE public.punishments_id_seq TO authenticated;
GRANT ALL ON SEQUENCE public.punishments_id_seq TO service_role;


--
-- Name: TABLE recovery_codes; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.recovery_codes TO anon;
GRANT ALL ON TABLE public.recovery_codes TO authenticated;
GRANT ALL ON TABLE public.recovery_codes TO service_role;


--
-- Name: SEQUENCE recovery_codes_id_seq; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON SEQUENCE public.recovery_codes_id_seq TO anon;
GRANT ALL ON SEQUENCE public.recovery_codes_id_seq TO authenticated;
GRANT ALL ON SEQUENCE public.recovery_codes_id_seq TO service_role;


--
-- Name: TABLE recovery_tries; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.recovery_tries TO anon;
GRANT ALL ON TABLE public.recovery_tries TO authenticated;
GRANT ALL ON TABLE public.recovery_tries TO service_role;


--
-- Name: SEQUENCE recovery_tries_id_seq; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON SEQUENCE public.recovery_tries_id_seq TO anon;
GRANT ALL ON SEQUENCE public.recovery_tries_id_seq TO authenticated;
GRANT ALL ON SEQUENCE public.recovery_tries_id_seq TO service_role;


--
-- Name: TABLE reminders; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.reminders TO anon;
GRANT ALL ON TABLE public.reminders TO authenticated;
GRANT ALL ON TABLE public.reminders TO service_role;


--
-- Name: SEQUENCE reminders_id_seq; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON SEQUENCE public.reminders_id_seq TO anon;
GRANT ALL ON SEQUENCE public.reminders_id_seq TO authenticated;
GRANT ALL ON SEQUENCE public.reminders_id_seq TO service_role;


--
-- Name: TABLE reports; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.reports TO anon;
GRANT ALL ON TABLE public.reports TO authenticated;
GRANT ALL ON TABLE public.reports TO service_role;


--
-- Name: SEQUENCE reports_id_seq; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON SEQUENCE public.reports_id_seq TO anon;
GRANT ALL ON SEQUENCE public.reports_id_seq TO authenticated;
GRANT ALL ON SEQUENCE public.reports_id_seq TO service_role;


--
-- Name: TABLE season_events; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.season_events TO anon;
GRANT ALL ON TABLE public.season_events TO authenticated;
GRANT ALL ON TABLE public.season_events TO service_role;


--
-- Name: SEQUENCE season_events_id_seq; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON SEQUENCE public.season_events_id_seq TO anon;
GRANT ALL ON SEQUENCE public.season_events_id_seq TO authenticated;
GRANT ALL ON SEQUENCE public.season_events_id_seq TO service_role;


--
-- Name: TABLE stickers; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.stickers TO anon;
GRANT ALL ON TABLE public.stickers TO authenticated;
GRANT ALL ON TABLE public.stickers TO service_role;


--
-- Name: SEQUENCE stickers_id_seq; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON SEQUENCE public.stickers_id_seq TO anon;
GRANT ALL ON SEQUENCE public.stickers_id_seq TO authenticated;
GRANT ALL ON SEQUENCE public.stickers_id_seq TO service_role;


--
-- Name: TABLE stories; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.stories TO anon;
GRANT ALL ON TABLE public.stories TO authenticated;
GRANT ALL ON TABLE public.stories TO service_role;


--
-- Name: SEQUENCE stories_id_seq; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON SEQUENCE public.stories_id_seq TO anon;
GRANT ALL ON SEQUENCE public.stories_id_seq TO authenticated;
GRANT ALL ON SEQUENCE public.stories_id_seq TO service_role;


--
-- Name: TABLE tg_links; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.tg_links TO anon;
GRANT ALL ON TABLE public.tg_links TO authenticated;
GRANT ALL ON TABLE public.tg_links TO service_role;


--
-- Name: TABLE thanks; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.thanks TO anon;
GRANT ALL ON TABLE public.thanks TO authenticated;
GRANT ALL ON TABLE public.thanks TO service_role;


--
-- Name: SEQUENCE thanks_id_seq; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON SEQUENCE public.thanks_id_seq TO anon;
GRANT ALL ON SEQUENCE public.thanks_id_seq TO authenticated;
GRANT ALL ON SEQUENCE public.thanks_id_seq TO service_role;


--
-- Name: TABLE tournaments; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.tournaments TO anon;
GRANT ALL ON TABLE public.tournaments TO authenticated;
GRANT ALL ON TABLE public.tournaments TO service_role;


--
-- Name: SEQUENCE tournaments_id_seq; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON SEQUENCE public.tournaments_id_seq TO anon;
GRANT ALL ON SEQUENCE public.tournaments_id_seq TO authenticated;
GRANT ALL ON SEQUENCE public.tournaments_id_seq TO service_role;


--
-- Name: TABLE usernames; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.usernames TO anon;
GRANT ALL ON TABLE public.usernames TO authenticated;
GRANT ALL ON TABLE public.usernames TO service_role;


--
-- Name: TABLE wishlist; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.wishlist TO anon;
GRANT ALL ON TABLE public.wishlist TO authenticated;
GRANT ALL ON TABLE public.wishlist TO service_role;


--
-- Name: SEQUENCE wishlist_id_seq; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON SEQUENCE public.wishlist_id_seq TO anon;
GRANT ALL ON SEQUENCE public.wishlist_id_seq TO authenticated;
GRANT ALL ON SEQUENCE public.wishlist_id_seq TO service_role;


--
-- Name: DEFAULT PRIVILEGES FOR SEQUENCES; Type: DEFAULT ACL; Schema: public; Owner: -
--

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON SEQUENCES TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON SEQUENCES TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON SEQUENCES TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON SEQUENCES TO service_role;


--
-- Name: DEFAULT PRIVILEGES FOR SEQUENCES; Type: DEFAULT ACL; Schema: public; Owner: -
--

ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON SEQUENCES TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON SEQUENCES TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON SEQUENCES TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON SEQUENCES TO service_role;


--
-- Name: DEFAULT PRIVILEGES FOR FUNCTIONS; Type: DEFAULT ACL; Schema: public; Owner: -
--

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON FUNCTIONS TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON FUNCTIONS TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON FUNCTIONS TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON FUNCTIONS TO service_role;


--
-- Name: DEFAULT PRIVILEGES FOR FUNCTIONS; Type: DEFAULT ACL; Schema: public; Owner: -
--

ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON FUNCTIONS TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON FUNCTIONS TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON FUNCTIONS TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON FUNCTIONS TO service_role;


--
-- Name: DEFAULT PRIVILEGES FOR TABLES; Type: DEFAULT ACL; Schema: public; Owner: -
--

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON TABLES TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON TABLES TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON TABLES TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON TABLES TO service_role;


--
-- Name: DEFAULT PRIVILEGES FOR TABLES; Type: DEFAULT ACL; Schema: public; Owner: -
--

ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON TABLES TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON TABLES TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON TABLES TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON TABLES TO service_role;


--
-- PostgreSQL database dump complete
--

\unrestrict xpgImm9wbHjE9uimu2xSH77rDmgawF9xGvz29xrNqEsM1EqMxRB1Z0DOmdYC1nf

