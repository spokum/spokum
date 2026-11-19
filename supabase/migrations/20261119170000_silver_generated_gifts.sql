-- Generated artwork-backed gift collection for silver only.
INSERT INTO public.gift_types (id, title, price, rarity, art, hue, sort, season, is_limited)
VALUES
  ('silver_wish_capsule', 'Капсула желаний', 1600, 'epic', 'spark', 275, 87, 'silver', false),
  ('silver_meteor_chest', 'Метеоритный ларец', 2600, 'legend', 'comet', 32, 88, 'silver', false),
  ('silver_connection_heart', 'Сердце связи', 1900, 'epic', 'heart', 345, 89, 'silver', false),
  ('silver_aurora_lantern', 'Фонарь северного сияния', 2100, 'epic', 'flame', 165, 90, 'silver', false)
ON CONFLICT (id) DO NOTHING;
