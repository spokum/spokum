-- Restore the complete store catalog and add Silver's private 3D gift set.
INSERT INTO public.gift_types (id, title, price, rarity, art, hue, sort, season, is_limited)
VALUES
  ('leaf', 'Листок', 40, 'common', 'leaf', 140, 50, '', false),
  ('cup', 'Тёплый чай', 60, 'common', 'cup', 30, 51, '', false),
  ('star', 'Звезда', 90, 'common', 'star', 45, 52, '', false),
  ('heart', 'Сердце', 120, 'rare', 'heart', 350, 53, '', false),
  ('moon', 'Луна', 180, 'rare', 'moon', 230, 54, '', false),
  ('wave', 'Волна', 220, 'rare', 'wave', 200, 55, '', false),
  ('flame', 'Огонёк', 300, 'epic', 'flame', 20, 56, '', false),
  ('crystal', 'Кристалл', 450, 'epic', 'crystal', 190, 57, '', false),
  ('crown', 'Корона', 700, 'legend', 'crown', 45, 58, '', false),
  ('comet', 'Комета', 1200, 'legend', 'comet', 265, 59, '', false),
  ('acorn', 'Жёлудь', 70, 'common', 'acorn', 32, 60, 'autumn', false),
  ('maple', 'Кленовый лист', 130, 'rare', 'maple', 18, 61, 'autumn', false),
  ('plaid', 'Тёплый плед', 260, 'epic', 'plaid', 8, 62, 'autumn', false),
  ('cocoa', 'Какао с зефиром', 420, 'epic', 'cocoa', 26, 63, 'autumn', false),
  ('rose', 'Алая роза', 650, 'epic', 'rose', 350, 64, '', true),
  ('trophy', 'Кубок', 1000, 'legend', 'trophy', 45, 65, '', false),
  ('hourglass', 'Песочные часы', 550, 'epic', 'hourglass', 40, 66, '', false),
  ('key', 'Золотой ключ', 380, 'epic', 'key', 50, 67, '', false),
  ('cat', 'Котик', 240, 'rare', 'cat', 30, 68, '', false),
  ('candy', 'Конфета', 50, 'common', 'candy', 320, 69, '', false),
  ('heart_hands', 'Руки с сердцем', 340, 'rare', 'heart_hands', 350, 70, '', true),
  ('icicle', 'Сосулька', 800, 'legend', 'crystal', 190, 71, '', true),
  ('snow_queen', 'Снежная королева', 1500, 'legend', 'crown', 200, 72, '', true),
  ('frost_dragon', 'Морозный дракон', 2000, 'legend', 'dragon', 180, 73, '', true),
  ('winter_rose', 'Зимняя роза', 700, 'epic', 'rose', 340, 74, '', true),
  ('snowball', 'Снежок', 30, 'common', 'star', 200, 75, 'winter', false),
  ('hot_cocoa', 'Горячий какао', 80, 'common', 'cup', 26, 76, 'winter', false),
  ('mitten', 'Варежка', 120, 'rare', 'heart_hands', 350, 77, 'winter', false),
  ('ice_skate', 'Коньки', 200, 'rare', 'star', 190, 78, 'winter', false),
  ('fireplace', 'Камин', 350, 'epic', 'flame', 20, 79, 'winter', false),
  ('christmas_tree', 'Ёлка', 400, 'epic', 'star', 140, 80, 'winter', false),
  ('snowman', 'Снеговик', 250, 'rare', 'star', 200, 81, 'winter', false),
  ('warm_scarf', 'Тёплый шарф', 180, 'rare', 'heart_hands', 10, 82, 'winter', false),
  ('silver_orbit', 'Орбита в ладонях', 1400, 'epic', 'comet', 190, 83, '', false),
  ('silver_moonship', 'Лунный корабль', 2200, 'legend', 'moon', 225, 84, '', false),
  ('silver_nova', 'Мини-сверхновая', 1800, 'epic', 'spark', 285, 85, '', false),
  ('silver_tesseract', 'Тессеракт', 3200, 'legend', 'crystal', 165, 86, '', false)
ON CONFLICT (id) DO NOTHING;

CREATE OR REPLACE FUNCTION public.guard_silver_gift_catalog()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE buyer_username text;
BEGIN
  IF left(NEW.type_id, 7) = 'silver_' THEN
    SELECT username INTO buyer_username
      FROM public.profiles
      WHERE id = NEW.from_id;
    IF lower(coalesce(buyer_username, '')) <> 'silver' OR NEW.owner_id <> NEW.from_id THEN
      RAISE EXCEPTION 'Этот подарок доступен только пользователю silver';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS gifts_silver_catalog_guard ON public.gifts;
CREATE TRIGGER gifts_silver_catalog_guard
BEFORE INSERT ON public.gifts
FOR EACH ROW EXECUTE FUNCTION public.guard_silver_gift_catalog();

