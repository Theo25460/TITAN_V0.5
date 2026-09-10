begin;

-- TITAN OS v73 - Strava-inspired sport catalog expansion.
-- Safe to rerun. Adds new sport rows and lightweight tracking metadata.

alter table if exists public.sports add column if not exists slug text;
alter table if exists public.sports add column if not exists name text;
alter table if exists public.sports add column if not exists description text;
alter table if exists public.sports add column if not exists extra_fields jsonb default '[]'::jsonb;
alter table if exists public.sports add column if not exists tracking_summary jsonb default '{}'::jsonb;
alter table if exists public.sports add column if not exists tracking_version text default 'v73';
alter table if exists public.sports add column if not exists balance_profile text default 'generic';
alter table if exists public.sports add column if not exists sort_order integer not null default 0;
alter table if exists public.sports add column if not exists updated_at timestamptz default now();

with seed(id, label, category, icon, unit, xp_multiplier, form_type, balance_profile, sort_order, description, tracking_summary) as (
  values
    ('padel', 'Padel', 'team', 'ri-ping-pong-line', 'min', 8, 'duration', 'racket', 730, 'Sport de raquette en paire: sets, breaks, points au filet et fautes.', jsonb_build_object('headline','Sets, breaks, points au filet, fautes et pression.', 'graphs', jsonb_build_array('sets_won','break_points','net_points','unforced_errors'))),
    ('basketball', 'Basketball', 'team', 'ri-basketball-line', 'min', 8, 'duration', 'team', 731, 'Sport collectif: points, rebonds, passes, defense et pertes.', jsonb_build_object('headline','Scoring, creation, rebond, defense et pertes.', 'graphs', jsonb_build_array('points','rebounds','assists','turnovers'))),
    ('volleyball', 'Volleyball', 'team', 'ri-volleyball-line', 'min', 7, 'duration', 'team', 732, 'Service, reception, attaque, bloc et fautes.', jsonb_build_object('headline','Service, attaque, bloc, reception et fautes.', 'graphs', jsonb_build_array('kills','aces','blocks','serve_errors'))),
    ('cricket', 'Cricket', 'team', 'ri-baseball-line', 'min', 7, 'duration', 'team', 733, 'Batting, bowling, catches et temps de jeu.', jsonb_build_object('headline','Runs, wickets, catches et temps de jeu.', 'graphs', jsonb_build_array('runs','wickets','catches','minutes_played'))),
    ('dance', 'Danse', 'mobility', 'ri-music-2-line', 'min', 6, 'duration', 'skill', 734, 'Technique, routines, coordination, mobilite et cardio leger.', jsonb_build_object('headline','Routine, coordination, mobilite et qualite technique.', 'graphs', jsonb_build_array('combo_count','execution_quality','mobility_work'))),
    ('pickleball', 'Pickleball', 'team', 'ri-ping-pong-line', 'min', 7, 'duration', 'racket', 735, 'Raquette rapide: sets, points directs, fautes et qualite des echanges.', jsonb_build_object('headline','Sets, points directs, erreurs et echanges.', 'graphs', jsonb_build_array('sets_won','direct_points','unforced_errors'))),
    ('gravel', 'Gravel', 'outdoor', 'ri-riding-line', 'km', 12, 'gps', 'cycling', 736, 'Velo gravel: distance, denivele, terrain, puissance et cadence.', jsonb_build_object('headline','Distance, D+, surface, puissance et cadence.', 'graphs', jsonb_build_array('avg_power','cadence','elevation'))),
    ('ski_touring', 'Ski rando', 'outdoor', 'ri-mountain-line', 'km', 13, 'gps', 'glide', 737, 'Effort montagne: D+, distance, descentes et conditions.', jsonb_build_object('headline','D+, distance, conditions et descentes.', 'graphs', jsonb_build_array('elevation','runs','surface_state'))),
    ('trekking', 'Randonnee longue', 'outdoor', 'ri-route-line', 'km', 10, 'gps', 'hiking', 738, 'Sorties longues: distance, D+, sac, technicite et navigation.', jsonb_build_object('headline','Distance, D+, sac, technicite et navigation.', 'graphs', jsonb_build_array('pack_weight','elevation','navigation'))),
    ('bouldering', 'Escalade bloc', 'skill', 'ri-landscape-line', 'min', 8, 'duration', 'climbing', 739, 'Bloc: essais, niveau max, style, reussites et chutes.', jsonb_build_object('headline','Niveau, essais, sends, style et chutes.', 'graphs', jsonb_build_array('attempts','successful_routes','fall_count'))),
    ('climbing_route', 'Escalade voie', 'skill', 'ri-landscape-line', 'min', 8, 'duration', 'climbing', 740, 'Voie: niveau, essais, style, reussites et chutes.', jsonb_build_object('headline','Niveau, essais, voies reussies et style.', 'graphs', jsonb_build_array('attempts','successful_routes','fall_count'))),
    ('rowing_machine', 'Rameur', 'cardio', 'ri-ship-line', 'min', 9, 'duration', 'water', 741, 'Rameur indoor: split, cadence, puissance et duree.', jsonb_build_object('headline','Split, cadence, puissance et duree.', 'graphs', jsonb_build_array('split_500m','stroke_rate','avg_power'))),
    ('kayak', 'Kayak', 'outdoor', 'ri-ship-2-line', 'km', 10, 'gps', 'water', 742, 'Distance, eau, autonomie, technique et conditions.', jsonb_build_object('headline','Distance, eau, autonomie, technique et conditions.', 'graphs', jsonb_build_array('tech_drills','water_state','falls'))),
    ('paddle', 'Paddle', 'outdoor', 'ri-sailboat-line', 'km', 8, 'gps', 'water', 743, 'Distance, etat de l eau, equilibre et autonomie.', jsonb_build_object('headline','Distance, equilibre, eau et autonomie.', 'graphs', jsonb_build_array('water_state','falls','autonomy'))),
    ('yoga_mobility', 'Yoga mobilite', 'mobility', 'ri-mental-health-line', 'min', 5, 'duration', 'mobility', 744, 'Mobilite, respiration, douleur avant/apres et maintien.', jsonb_build_object('headline','Respiration, zone cible, douleur et maintien.', 'graphs', jsonb_build_array('hold_seconds','pain_before','pain_after'))),
    ('hiit', 'HIIT', 'crossfit', 'ri-flashlight-line', 'min', 9, 'duration', 'mixed', 745, 'Intervalles courts: format, rounds, mouvements, score et RPE.', jsonb_build_object('headline','Format, rounds, mouvements, score et intensite.', 'graphs', jsonb_build_array('rounds','movements','score'))),
    ('hyrox', 'Hyrox', 'crossfit', 'ri-fire-line', 'min', 10, 'duration', 'mixed', 746, 'Course et stations: temps, rounds, mouvements, score et densite.', jsonb_build_object('headline','Course, stations, temps, mouvements et score.', 'graphs', jsonb_build_array('rounds','movements','score')))
)
insert into public.sports (
  id, label, category, icon, unit, xp_multiplier, form_type,
  balance_profile, tracking_summary, tracking_version, is_active,
  slug, name, description, sort_order, updated_at
)
select
  id, label, category, icon, unit, xp_multiplier, form_type,
  balance_profile, tracking_summary, 'v73', true,
  id, label, description, sort_order, now()
from seed
on conflict (id) do update
set label = excluded.label,
    category = excluded.category,
    icon = excluded.icon,
    unit = excluded.unit,
    xp_multiplier = excluded.xp_multiplier,
    form_type = excluded.form_type,
    balance_profile = excluded.balance_profile,
    tracking_summary = excluded.tracking_summary,
    tracking_version = excluded.tracking_version,
    is_active = true,
    slug = coalesce(public.sports.slug, excluded.slug),
    name = coalesce(public.sports.name, excluded.name),
    description = excluded.description,
    sort_order = excluded.sort_order,
    updated_at = now();

grant select on public.sports to anon, authenticated;

commit;
