-- Коллекционные номера: уникальный номер закрепляется за аккаунтом,
-- а стоимость списывается атомарно с балансом.
CREATE TABLE IF NOT EXISTS public.collection_numbers (
  number text PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT collection_numbers_format CHECK (number ~ '^\+(666|777|888|555|999)[0-9]{8}$')
);

CREATE INDEX IF NOT EXISTS collection_numbers_user_created_idx
  ON public.collection_numbers (user_id, created_at);

ALTER TABLE public.collection_numbers ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS collection_numbers_public_read ON public.collection_numbers;
CREATE POLICY collection_numbers_public_read
  ON public.collection_numbers FOR SELECT USING (true);

REVOKE ALL ON public.collection_numbers FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.collection_numbers TO anon, authenticated;
GRANT ALL ON public.collection_numbers TO service_role;

CREATE OR REPLACE FUNCTION public.buy_collection_number(p_prefix text, p_digits text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  me uuid := auth.uid();
  clean_prefix text := coalesce(p_prefix, '');
  clean_digits text;
  chosen text;
  purse integer;
BEGIN
  IF me IS NULL THEN
    RAISE EXCEPTION 'Нужен вход';
  END IF;
  IF NOT public.viewer_can_write() THEN
    RAISE EXCEPTION 'Сейчас нельзя';
  END IF;
  IF clean_prefix !~ '^\+(666|777|888|555|999)$' THEN
    RAISE EXCEPTION 'Неизвестный формат номера';
  END IF;

  clean_digits := regexp_replace(coalesce(p_digits, ''), '\D', '', 'g');
  IF clean_digits !~ '^[0-9]{8}$' THEN
    RAISE EXCEPTION 'Введите 8 цифр номера';
  END IF;
  chosen := clean_prefix || clean_digits;

  PERFORM set_config('spokum.privileged', 'on', true);
  SELECT coins INTO purse
    FROM public.profiles
    WHERE id = me
    FOR UPDATE;
  IF purse IS NULL THEN
    RAISE EXCEPTION 'Профиль не найден';
  END IF;
  IF purse < 5000 THEN
    RAISE EXCEPTION 'Не хватает монет: нужно 5000, у вас %', purse;
  END IF;
  IF EXISTS (SELECT 1 FROM public.collection_numbers WHERE number = chosen) THEN
    RAISE EXCEPTION 'Этот номер уже занят';
  END IF;

  UPDATE public.profiles
    SET coins = coins - 5000
    WHERE id = me
    RETURNING coins INTO purse;
  INSERT INTO public.coin_log (user_id, amount, reason)
    VALUES (me, -5000, 'Коллекционный номер ' || chosen);
  INSERT INTO public.collection_numbers (number, user_id)
    VALUES (chosen, me);

  RETURN jsonb_build_object('number', chosen, 'coins', purse);
END;
$$;

REVOKE ALL ON FUNCTION public.buy_collection_number(text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.buy_collection_number(text, text) TO authenticated, service_role;
