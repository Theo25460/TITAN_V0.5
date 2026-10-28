-- V11-11 (V1.1): extend the pace ceilings (data, not code) to more sports that are powered by the athlete alone, now that a session can
-- exceed 300 km and be logged without any distance. A row says: no human sustains more than max_kmh over min_minutes or more, with the
-- record that justifies it. Sports without a row stay judged only against the player's own history and the volume of the day.
-- Never used to reject a session: the explainable risk score may hold a reward for review (CHEAT15) and nothing else.
-- Motor-assisted or gravity-assisted sports (cycling, skiing downhill, skating) and 'hiking' (pace depends too much on terrain to bound
-- it with one number) are deliberately left out. Additive and idempotent. The caller owns the transaction: never BEGIN/COMMIT here.
-- Rollback: delete from private.titan_sport_limits where sport in ('trail','nordic_walk','race_walking','treadmill','rowing','coastal_rowing','kayak','cross_country_skiing');
insert into private.titan_sport_limits(sport, max_kmh, min_minutes, reference) values
  ('trail', 28, 15, 'Trail and mountain running: below road running records (about 23 km/h over 5-10 km); bound 28 km/h over 15 minutes or more'),
  ('treadmill', 30, 15, 'Treadmill running: same bound as road running, 30 km/h over 15 minutes or more (machine speed alone is declared, not measured)'),
  ('race_walking', 20, 15, 'Race walking: 20 km about 1:16 (15.8 km/h); bound 20 km/h over 15 minutes or more'),
  ('nordic_walk', 14, 15, 'Nordic walking: slower than race walking; bound 14 km/h over 15 minutes or more'),
  ('rowing', 28, 15, 'Rowing: eight 2 000 m about 5:18 (22.6 km/h), single sculls about 18.5 km/h; bound 28 km/h over 15 minutes or more'),
  ('coastal_rowing', 28, 15, 'Coastal rowing: below flat-water crews; bound 28 km/h over 15 minutes or more (generous: current)'),
  ('kayak', 28, 15, 'Flat-water kayak: K4 1 000 m about 2:51 (21 km/h); bound 28 km/h over 15 minutes or more (generous: current)'),
  ('cross_country_skiing', 35, 15, 'Cross-country skiing: race averages about 25 km/h; bound 35 km/h over 15 minutes or more (generous: glide, snow)')
on conflict (sport) do nothing;
