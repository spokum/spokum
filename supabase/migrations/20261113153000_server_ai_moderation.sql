CREATE TABLE IF NOT EXISTS public.ai_moderation_settings (
  singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
  enabled boolean NOT NULL DEFAULT false,
  fail_open boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS public.ai_moderation_strikes (
  user_id uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  count integer NOT NULL DEFAULT 0 CHECK (count >= 0),
  last_strike_at timestamptz,
  mute_until timestamptz
);

CREATE TABLE IF NOT EXISTS public.ai_moderation_reports (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  body text NOT NULL,
  context text NOT NULL,
  rule text NOT NULL DEFAULT '',
  reason text NOT NULL DEFAULT '',
  punishment text NOT NULL DEFAULT '',
  user_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  username text NOT NULL DEFAULT '',
  strikes integer NOT NULL DEFAULT 0,
  mute_until timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz,
  resolved_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS public.ai_moderation_approvals (
  token uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  context text NOT NULL,
  text_hash text NOT NULL,
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.ai_moderation_settings (singleton, enabled, fail_open)
VALUES (true, false, true)
ON CONFLICT (singleton) DO NOTHING;

ALTER TABLE public.posts ADD COLUMN IF NOT EXISTS moderation_token uuid;
ALTER TABLE public.comments ADD COLUMN IF NOT EXISTS moderation_token uuid;
ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS moderation_token uuid;

CREATE INDEX IF NOT EXISTS ai_moderation_reports_created_idx
  ON public.ai_moderation_reports (created_at DESC);
CREATE INDEX IF NOT EXISTS ai_moderation_reports_open_idx
  ON public.ai_moderation_reports (resolved_at, created_at DESC);
CREATE INDEX IF NOT EXISTS ai_moderation_approvals_expiry_idx
  ON public.ai_moderation_approvals (expires_at);

ALTER TABLE public.ai_moderation_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_moderation_strikes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_moderation_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_moderation_approvals ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.ai_moderation_settings FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.ai_moderation_strikes FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.ai_moderation_reports FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.ai_moderation_approvals FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.ai_moderation_settings TO service_role;
GRANT ALL ON public.ai_moderation_strikes TO service_role;
GRANT ALL ON public.ai_moderation_reports TO service_role;
GRANT ALL ON public.ai_moderation_approvals TO service_role;

CREATE OR REPLACE FUNCTION public.ai_moderation_assert(
  p_user_id uuid,
  p_context text,
  p_body text,
  p_token uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  moderation_enabled boolean;
  active_mute timestamptz;
  approval public.ai_moderation_approvals;
BEGIN
  SELECT enabled INTO moderation_enabled FROM public.ai_moderation_settings WHERE singleton;
  IF NOT COALESCE(moderation_enabled, false) OR btrim(COALESCE(p_body, '')) = '' THEN
    RETURN;
  END IF;
  IF p_user_id IS NULL OR p_user_id <> auth.uid() THEN
    RAISE EXCEPTION 'Нужен вход для проверки текста' USING ERRCODE = '401';
  END IF;

  SELECT mute_until INTO active_mute FROM public.ai_moderation_strikes WHERE user_id = p_user_id;
  IF active_mute > now() THEN
    RAISE EXCEPTION 'Вы в муте ИИ-модерации до %', active_mute AT TIME ZONE 'Europe/Moscow' USING ERRCODE = '42501';
  END IF;
  IF p_token IS NULL THEN
    RAISE EXCEPTION 'Текст не прошёл проверку ИИ-модерации. Обновите приложение и попробуйте снова' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO approval FROM public.ai_moderation_approvals WHERE token = p_token FOR UPDATE;
  IF approval.token IS NULL OR approval.consumed_at IS NOT NULL THEN
    RAISE EXCEPTION 'Проверка текста уже использована. Отправьте текст ещё раз' USING ERRCODE = '42501';
  END IF;
  IF approval.user_id <> p_user_id OR approval.context <> p_context THEN
    RAISE EXCEPTION 'Проверка текста не подходит для этой публикации' USING ERRCODE = '42501';
  END IF;
  IF approval.expires_at <= now() THEN
    RAISE EXCEPTION 'Проверка текста устарела. Отправьте текст ещё раз' USING ERRCODE = '42501';
  END IF;
  IF approval.text_hash <> encode(extensions.digest(p_body, 'sha256'), 'hex') THEN
    RAISE EXCEPTION 'Текст изменился после проверки ИИ-модерации' USING ERRCODE = '42501';
  END IF;

  UPDATE public.ai_moderation_approvals SET consumed_at = now() WHERE token = p_token;
END;
$$;

CREATE OR REPLACE FUNCTION public.ai_moderation_check_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  content_context text;
BEGIN
  IF TG_TABLE_NAME = 'messages' THEN
    IF NEW.kind <> 'text' THEN RETURN NEW; END IF;
    content_context := 'message';
  ELSIF TG_TABLE_NAME = 'posts' THEN
    IF NEW.repost_of IS NOT NULL THEN content_context := 'repost';
    ELSE content_context := 'post';
    END IF;
  ELSE
    content_context := 'comment';
  END IF;
  PERFORM public.ai_moderation_assert(NEW.author_id, content_context, NEW.body, NEW.moderation_token);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS ai_moderation_check ON public.posts;
CREATE TRIGGER ai_moderation_check
BEFORE INSERT ON public.posts
FOR EACH ROW EXECUTE FUNCTION public.ai_moderation_check_insert();
DROP TRIGGER IF EXISTS ai_moderation_check ON public.comments;
CREATE TRIGGER ai_moderation_check
BEFORE INSERT ON public.comments
FOR EACH ROW EXECUTE FUNCTION public.ai_moderation_check_insert();
DROP TRIGGER IF EXISTS ai_moderation_check ON public.messages;
CREATE TRIGGER ai_moderation_check
BEFORE INSERT ON public.messages
FOR EACH ROW EXECUTE FUNCTION public.ai_moderation_check_insert();

CREATE OR REPLACE FUNCTION public.ai_moderation_record_violation(
  p_user_id uuid,
  p_body text,
  p_context text,
  p_rule text,
  p_reason text,
  p_punishment text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  result public.ai_moderation_strikes;
  author_name text;
BEGIN
  INSERT INTO public.ai_moderation_strikes (user_id, count, last_strike_at, mute_until)
  VALUES (p_user_id, 1, now(), NULL)
  ON CONFLICT (user_id) DO UPDATE SET
    count = public.ai_moderation_strikes.count + 1,
    last_strike_at = now()
  RETURNING * INTO result;

  UPDATE public.ai_moderation_strikes
  SET mute_until = CASE
    WHEN result.count >= 10 THEN GREATEST(COALESCE(result.mute_until, '-infinity'::timestamptz), now() + interval '3 days')
    WHEN result.count >= 5 THEN GREATEST(COALESCE(result.mute_until, '-infinity'::timestamptz), now() + interval '24 hours')
    WHEN result.count >= 3 THEN GREATEST(COALESCE(result.mute_until, '-infinity'::timestamptz), now() + interval '1 hour')
    ELSE result.mute_until
  END
  WHERE user_id = p_user_id
  RETURNING * INTO result;

  SELECT username INTO author_name FROM public.profiles WHERE id = p_user_id;
  INSERT INTO public.ai_moderation_reports (
    body, context, rule, reason, punishment, user_id, username, strikes, mute_until
  ) VALUES (
    left(COALESCE(p_body, ''), 5000), p_context, p_rule, p_reason, p_punishment,
    p_user_id, COALESCE(author_name, ''), result.count, result.mute_until
  );

  RETURN jsonb_build_object(
    'strikes', result.count,
    'muted', result.mute_until > now(),
    'muteUntil', COALESCE(floor(extract(epoch FROM result.mute_until) * 1000)::bigint, 0)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.ai_moderation_state()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  settings public.ai_moderation_settings;
  report_count integer;
BEGIN
  IF auth.uid() IS NULL OR NOT public.viewer_is_admin() THEN
    RAISE EXCEPTION 'Только для админов' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO settings FROM public.ai_moderation_settings WHERE singleton;
  SELECT count(*) INTO report_count FROM public.ai_moderation_reports WHERE resolved_at IS NULL;
  RETURN jsonb_build_object(
    'enabled', COALESCE(settings.enabled, false),
    'failOpen', COALESCE(settings.fail_open, true),
    'reports', report_count
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.ai_moderation_set_enabled(p_enabled boolean)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT public.viewer_is_admin() THEN
    RAISE EXCEPTION 'Только для админов' USING ERRCODE = '42501';
  END IF;
  INSERT INTO public.ai_moderation_settings (singleton, enabled, updated_at, updated_by)
  VALUES (true, COALESCE(p_enabled, false), now(), auth.uid())
  ON CONFLICT (singleton) DO UPDATE SET
    enabled = COALESCE(p_enabled, false), updated_at = now(), updated_by = auth.uid();
  RETURN public.ai_moderation_state();
END;
$$;

CREATE OR REPLACE FUNCTION public.ai_moderation_reports()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT public.viewer_is_admin() THEN
    RAISE EXCEPTION 'Только для админов' USING ERRCODE = '42501';
  END IF;
  RETURN jsonb_build_object('reports', COALESCE((
    SELECT jsonb_agg(report_data)
    FROM (
      SELECT jsonb_build_object(
        'id', r.id,
        'text', r.body,
        'context', r.context,
        'rule', r.rule,
        'reason', r.reason,
        'punishment', r.punishment,
        'timestamp', floor(extract(epoch FROM r.created_at) * 1000)::bigint,
        'userId', r.user_id,
        'username', r.username,
        'strikes', r.strikes,
        'muted', r.mute_until > r.created_at,
        'muteUntil', COALESCE(floor(extract(epoch FROM r.mute_until) * 1000)::bigint, 0),
        'resolved', r.resolved_at IS NOT NULL,
        'resolvedAt', COALESCE(floor(extract(epoch FROM r.resolved_at) * 1000)::bigint, 0)
      ) AS report_data
      FROM public.ai_moderation_reports r
      ORDER BY r.created_at DESC, r.id DESC
      LIMIT 300
    ) rows
  ), '[]'::jsonb));
END;
$$;

CREATE OR REPLACE FUNCTION public.ai_moderation_resolve_report(p_id bigint, p_resolved boolean DEFAULT true)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT public.viewer_is_admin() THEN
    RAISE EXCEPTION 'Только для админов' USING ERRCODE = '42501';
  END IF;
  UPDATE public.ai_moderation_reports
  SET resolved_at = CASE WHEN COALESCE(p_resolved, true) THEN now() ELSE NULL END,
      resolved_by = CASE WHEN COALESCE(p_resolved, true) THEN auth.uid() ELSE NULL END
  WHERE id = p_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Отчёт не найден' USING ERRCODE = '404'; END IF;
  RETURN jsonb_build_object('ok', true);
END;
$$;

CREATE OR REPLACE FUNCTION public.ai_moderation_clear_reports()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT public.viewer_is_admin() THEN
    RAISE EXCEPTION 'Только для админов' USING ERRCODE = '42501';
  END IF;
  DELETE FROM public.ai_moderation_reports;
  RETURN jsonb_build_object('ok', true);
END;
$$;

CREATE OR REPLACE FUNCTION public.repost(target bigint, note text, approval uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  source public.posts;
  fresh bigint;
  who text;
BEGIN
  IF NOT public.viewer_can_write() THEN RAISE EXCEPTION 'Сейчас нельзя'; END IF;
  SELECT * INTO source FROM public.posts WHERE id = target AND NOT removed;
  IF source.id IS NULL THEN RAISE EXCEPTION 'Запись не найдена'; END IF;
  IF source.repost_of IS NOT NULL THEN
    SELECT * INTO source FROM public.posts WHERE id = source.repost_of AND NOT removed;
    IF source.id IS NULL THEN RAISE EXCEPTION 'Исходная запись пропала'; END IF;
  END IF;
  IF EXISTS (SELECT 1 FROM public.posts WHERE author_id = auth.uid() AND repost_of = source.id) THEN
    RAISE EXCEPTION 'Вы это уже репостнули';
  END IF;

  INSERT INTO public.posts (
    author_id, body, mood, kind, media, video, poster, duration, sound, repost_of, moderation_token
  ) VALUES (
    auth.uid(), left(COALESCE(note, ''), 500), source.mood, source.kind, source.media,
    source.video, source.poster, source.duration, source.sound, source.id, approval
  ) RETURNING id INTO fresh;

  SELECT display_name INTO who FROM public.profiles WHERE id = auth.uid();
  IF source.author_id <> auth.uid() THEN
    PERFORM public.notify_user(
      source.author_id, 'newpost', 'Ваш ролик репостнули',
      COALESCE(who, 'Кто-то') || ' поделился вашей записью',
      jsonb_build_object('post', fresh, 'from', auth.uid())
    );
  END IF;
  RETURN jsonb_build_object('ok', true, 'post', fresh);
END;
$$;

CREATE OR REPLACE FUNCTION public.send_post(chat bigint, target bigint, note text, approval uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  source public.posts;
  fresh bigint;
BEGIN
  IF NOT public.viewer_can_write() THEN RAISE EXCEPTION 'Сейчас нельзя'; END IF;
  IF NOT public.is_chat_member(chat) THEN RAISE EXCEPTION 'Вы не в этом чате'; END IF;
  SELECT * INTO source FROM public.posts WHERE id = target AND NOT removed;
  IF source.id IS NULL THEN RAISE EXCEPTION 'Запись не найдена'; END IF;

  PERFORM public.ai_moderation_assert(auth.uid(), 'share', left(COALESCE(note, ''), 500), approval);
  INSERT INTO public.messages (chat_id, author_id, kind, body, media, duration, post_id, moderation_token)
  VALUES (
    chat, auth.uid(), CASE WHEN source.video IS NOT NULL THEN 'video' ELSE 'post' END,
    left(COALESCE(note, ''), 500), COALESCE(source.video, source.poster, source.image),
    source.duration, source.id, approval
  ) RETURNING id INTO fresh;
  RETURN jsonb_build_object('ok', true, 'message', fresh);
END;
$$;

CREATE OR REPLACE FUNCTION public.send_post(chat bigint, target bigint, note text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  RETURN public.send_post(chat, target, note, NULL::uuid);
END;
$$;

REVOKE ALL ON FUNCTION public.ai_moderation_assert(uuid, text, text, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.ai_moderation_check_insert() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.ai_moderation_record_violation(uuid, text, text, text, text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.ai_moderation_state() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.ai_moderation_set_enabled(boolean) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.ai_moderation_reports() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.ai_moderation_resolve_report(bigint, boolean) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.ai_moderation_clear_reports() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.repost(bigint, text, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.send_post(bigint, bigint, text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ai_moderation_record_violation(uuid, text, text, text, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.ai_moderation_state() TO authenticated;
GRANT EXECUTE ON FUNCTION public.ai_moderation_set_enabled(boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.ai_moderation_reports() TO authenticated;
GRANT EXECUTE ON FUNCTION public.ai_moderation_resolve_report(bigint, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.ai_moderation_clear_reports() TO authenticated;
GRANT EXECUTE ON FUNCTION public.repost(bigint, text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.send_post(bigint, bigint, text, uuid) TO authenticated;
