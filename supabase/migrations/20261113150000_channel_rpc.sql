CREATE OR REPLACE FUNCTION public.search_channels(p_query text DEFAULT '')
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
BEGIN
  RETURN jsonb_build_object('channels', COALESCE((
    SELECT jsonb_agg(channel_data)
    FROM (
      SELECT jsonb_build_object(
        'id', c.id,
        'title', c.title,
        'hue', c.hue,
        'members', (SELECT count(*) FROM public.chat_members cm WHERE cm.chat_id = c.id),
        'joined', auth.uid() IS NOT NULL AND EXISTS (
          SELECT 1 FROM public.chat_members mine WHERE mine.chat_id = c.id AND mine.user_id = auth.uid()
        ),
        'isOwner', auth.uid() IS NOT NULL AND c.owner_id = auth.uid(),
        'owner', CASE WHEN p.id IS NULL THEN NULL ELSE jsonb_build_object(
          'id', p.id, 'username', p.username, 'loginName', COALESCE(p.login_name, p.username),
          'displayName', NULLIF(p.display_name, ''), 'bio', p.bio, 'hue', p.hue,
          'avatar', p.avatar, 'mood', p.mood, 'isAdmin', p.is_admin,
          'isModerator', p.is_moderator, 'isDeveloper', p.is_developer,
          'isVerified', p.is_verified, 'modRank', p.mod_rank, 'isBeta', p.is_beta
        ) END,
        'createdAt', floor(extract(epoch FROM c.created_at) * 1000)::bigint
      ) AS channel_data
      FROM public.chats c
      LEFT JOIN public.profiles p ON p.id = c.owner_id
      WHERE c.kind = 'channel'
        AND (NULLIF(btrim(COALESCE(p_query, '')), '') IS NULL OR c.title ILIKE '%' || btrim(p_query) || '%')
      ORDER BY c.created_at DESC, c.id DESC
      LIMIT 30
    ) found
  ), '[]'::jsonb));
END;
$$;

CREATE OR REPLACE FUNCTION public.recommended_channels()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
BEGIN
  RETURN jsonb_build_object('channels', COALESCE((
    SELECT jsonb_agg(channel_data)
    FROM (
      SELECT jsonb_build_object(
        'id', c.id,
        'title', c.title,
        'hue', c.hue,
        'members', (SELECT count(*) FROM public.chat_members cm WHERE cm.chat_id = c.id),
        'joined', auth.uid() IS NOT NULL AND EXISTS (
          SELECT 1 FROM public.chat_members mine WHERE mine.chat_id = c.id AND mine.user_id = auth.uid()
        ),
        'isOwner', auth.uid() IS NOT NULL AND c.owner_id = auth.uid(),
        'owner', CASE WHEN p.id IS NULL THEN NULL ELSE jsonb_build_object(
          'id', p.id, 'username', p.username, 'loginName', COALESCE(p.login_name, p.username),
          'displayName', NULLIF(p.display_name, ''), 'bio', p.bio, 'hue', p.hue,
          'avatar', p.avatar, 'mood', p.mood, 'isAdmin', p.is_admin,
          'isModerator', p.is_moderator, 'isDeveloper', p.is_developer,
          'isVerified', p.is_verified, 'modRank', p.mod_rank, 'isBeta', p.is_beta
        ) END,
        'createdAt', floor(extract(epoch FROM c.created_at) * 1000)::bigint
      ) AS channel_data,
      EXISTS (
        SELECT 1 FROM public.chat_members mine WHERE mine.chat_id = c.id AND mine.user_id = auth.uid()
      ) AS is_joined,
      (SELECT count(*) FROM public.chat_members cm WHERE cm.chat_id = c.id) AS member_count,
      c.created_at,
      c.id
      FROM public.chats c
      LEFT JOIN public.profiles p ON p.id = c.owner_id
      WHERE c.kind = 'channel'
      ORDER BY is_joined DESC, member_count DESC, c.created_at DESC, c.id DESC
      LIMIT 10
    ) recommended
  ), '[]'::jsonb));
END;
$$;

CREATE OR REPLACE FUNCTION public.follow_channel(p_channel_id bigint)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  me uuid := auth.uid();
BEGIN
  IF me IS NULL THEN RAISE EXCEPTION 'Нужен вход' USING ERRCODE = '401'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.chats WHERE id = p_channel_id AND kind = 'channel') THEN
    RAISE EXCEPTION 'Канал не найден' USING ERRCODE = '404';
  END IF;
  INSERT INTO public.chat_members (chat_id, user_id, role)
  VALUES (p_channel_id, me, 'member')
  ON CONFLICT (chat_id, user_id) DO NOTHING;
  RETURN jsonb_build_object('ok', true);
END;
$$;

CREATE OR REPLACE FUNCTION public.unfollow_channel(p_channel_id bigint)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  me uuid := auth.uid();
BEGIN
  IF me IS NULL THEN RAISE EXCEPTION 'Нужен вход' USING ERRCODE = '401'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.chats WHERE id = p_channel_id AND kind = 'channel') THEN
    RAISE EXCEPTION 'Канал не найден' USING ERRCODE = '404';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.chats c
    LEFT JOIN public.chat_members cm ON cm.chat_id = c.id AND cm.user_id = me
    WHERE c.id = p_channel_id AND (c.owner_id = me OR cm.role = 'owner')
  ) THEN
    RAISE EXCEPTION 'Владелец не может отписаться от своего канала' USING ERRCODE = '403';
  END IF;
  DELETE FROM public.chat_members WHERE chat_id = p_channel_id AND user_id = me;
  RETURN jsonb_build_object('ok', true);
END;
$$;

REVOKE ALL ON FUNCTION public.search_channels(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.recommended_channels() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.follow_channel(bigint) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.unfollow_channel(bigint) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.search_channels(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.recommended_channels() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.follow_channel(bigint) TO authenticated;
GRANT EXECUTE ON FUNCTION public.unfollow_channel(bigint) TO authenticated;
