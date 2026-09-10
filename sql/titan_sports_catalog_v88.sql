-- TITAN OS V88
-- Uniformise la recherche et ajoute des metriques par famille aux sports encore generiques.

begin;

with templates(profile, fields) as (
    values
    ('team', '[
      {"id":"session_type","type":"select","label":"Format","options":["Entrainement","Match","Competition","Technique"],"priority":1},
      {"id":"minutes_played","type":"number","label":"Temps joue","unit":"min","min":0,"max":300,"step":1,"chart":true,"aggregate":"sum","priority":2},
      {"id":"score_for","type":"number","label":"Score equipe","min":0,"max":300,"step":1,"chart":true,"aggregate":"sum","priority":3},
      {"id":"decisive_actions","type":"number","label":"Actions decisives","min":0,"max":100,"step":1,"chart":true,"aggregate":"sum","priority":4},
      {"id":"quality_score","type":"number","label":"Qualite execution","min":1,"max":10,"step":1,"chart":true,"aggregate":"avg","priority":5}
    ]'::jsonb),
    ('water', '[
      {"id":"session_type","type":"select","label":"Format","options":["Technique","Endurance","Intervalles","Competition"],"priority":1},
      {"id":"conditions","type":"select","label":"Conditions","options":["Bassin","Eau calme","Clapot","Vagues","Courant"],"priority":2},
      {"id":"cadence","type":"number","label":"Cadence","min":0,"max":240,"step":1,"chart":true,"aggregate":"avg","priority":3},
      {"id":"technical_quality","type":"number","label":"Qualite technique","min":1,"max":10,"step":1,"chart":true,"aggregate":"avg","priority":4},
      {"id":"falls","type":"number","label":"Chutes / ruptures","min":0,"max":100,"step":1,"chart":true,"aggregate":"sum","higherIsBetter":false,"priority":5}
    ]'::jsonb),
    ('glide', '[
      {"id":"session_type","type":"select","label":"Format","options":["Technique","Endurance","Vitesse","Freeride","Competition"],"priority":1},
      {"id":"surface_state","type":"select","label":"Surface","options":["Seche","Humide","Neige dure","Poudreuse","Glace","Mixte"],"priority":2},
      {"id":"runs","type":"number","label":"Descentes / runs","min":0,"max":200,"step":1,"chart":true,"aggregate":"sum","priority":3},
      {"id":"elevation","type":"number","label":"Denivele positif","unit":"m","min":0,"max":15000,"step":10,"chart":true,"aggregate":"sum","priority":4},
      {"id":"execution_quality","type":"number","label":"Qualite execution","min":1,"max":10,"step":1,"chart":true,"aggregate":"avg","priority":5}
    ]'::jsonb),
    ('cycling', '[
      {"id":"ride_type","type":"select","label":"Format","options":["Endurance","Tempo","Intervalles","Technique","Competition","Transport"],"priority":1},
      {"id":"elevation","type":"number","label":"Denivele positif","unit":"m","min":0,"max":15000,"step":10,"chart":true,"aggregate":"sum","priority":2},
      {"id":"avg_speed","type":"number","label":"Vitesse moyenne","unit":"km/h","min":0,"max":120,"step":0.1,"chart":true,"aggregate":"avg","priority":3},
      {"id":"cadence","type":"number","label":"Cadence","unit":"rpm","min":0,"max":220,"step":1,"chart":true,"aggregate":"avg","priority":4},
      {"id":"avg_power","type":"number","label":"Puissance moyenne","unit":"W","min":0,"max":1200,"step":1,"chart":true,"aggregate":"avg","priority":5}
    ]'::jsonb),
    ('skill', '[
      {"id":"session_type","type":"select","label":"Format","options":["Technique","Routine","Entrainement","Competition"],"priority":1},
      {"id":"difficulty","type":"text","label":"Difficulte / niveau","placeholder":"Ex: niveau, grade ou element travaille","priority":2},
      {"id":"successful_actions","type":"number","label":"Actions reussies","min":0,"max":1000,"step":1,"chart":true,"aggregate":"sum","priority":3},
      {"id":"errors","type":"number","label":"Erreurs majeures","min":0,"max":500,"step":1,"chart":true,"aggregate":"sum","higherIsBetter":false,"priority":4},
      {"id":"quality_score","type":"number","label":"Qualite execution","min":1,"max":10,"step":1,"chart":true,"aggregate":"avg","priority":5}
    ]'::jsonb),
    ('precision', '[
      {"id":"session_type","type":"select","label":"Format","options":["Reglage","Entrainement","Serie","Competition"],"priority":1},
      {"id":"attempts","type":"number","label":"Tentatives","min":0,"max":1000,"step":1,"chart":true,"aggregate":"sum","priority":2},
      {"id":"successful_actions","type":"number","label":"Reussites","min":0,"max":1000,"step":1,"chart":true,"aggregate":"sum","priority":3},
      {"id":"accuracy","type":"number","label":"Precision","unit":"%","min":0,"max":100,"step":0.1,"chart":true,"aggregate":"avg","priority":4},
      {"id":"average_score","type":"number","label":"Score moyen","min":0,"max":1000,"step":0.1,"chart":true,"aggregate":"avg","priority":5}
    ]'::jsonb),
    ('combat', '[
      {"id":"session_type","type":"select","label":"Format","options":["Technique","Sparring","Conditioning","Combat"],"priority":1},
      {"id":"rounds","type":"number","label":"Rounds","min":0,"max":50,"step":1,"chart":true,"aggregate":"sum","priority":2},
      {"id":"successful_actions","type":"number","label":"Actions propres","min":0,"max":500,"step":1,"chart":true,"aggregate":"sum","priority":3},
      {"id":"technical_quality","type":"number","label":"Qualite technique","min":1,"max":10,"step":1,"chart":true,"aggregate":"avg","priority":4},
      {"id":"control_score","type":"number","label":"Controle percu","min":1,"max":10,"step":1,"chart":true,"aggregate":"avg","priority":5}
    ]'::jsonb),
    ('strength', '[
      {"id":"exercise","type":"text","label":"Mouvement principal","placeholder":"Ex: squat, developpe couche","priority":1},
      {"id":"sets","type":"number","label":"Series","min":0,"max":100,"step":1,"chart":true,"aggregate":"sum","priority":2},
      {"id":"reps","type":"number","label":"Repetitions","min":0,"max":2000,"step":1,"chart":true,"aggregate":"sum","priority":3},
      {"id":"top_load","type":"number","label":"Charge maximale","unit":"kg","min":0,"max":1000,"step":0.5,"chart":true,"aggregate":"max","priority":4},
      {"id":"volume","type":"number","label":"Volume total","unit":"kg","min":0,"max":200000,"step":1,"chart":true,"aggregate":"sum","priority":5}
    ]'::jsonb),
    ('racket', '[
      {"id":"match_result","type":"select","label":"Resultat","options":["Victoire","Defaite","Entrainement"],"priority":1},
      {"id":"sets_won","type":"number","label":"Sets gagnes","min":0,"max":20,"step":1,"chart":true,"aggregate":"sum","priority":2},
      {"id":"direct_points","type":"number","label":"Points directs","min":0,"max":300,"step":1,"chart":true,"aggregate":"sum","priority":3},
      {"id":"unforced_errors","type":"number","label":"Fautes directes","min":0,"max":300,"step":1,"chart":true,"aggregate":"sum","higherIsBetter":false,"priority":4},
      {"id":"rally_quality_score","type":"number","label":"Qualite des echanges","min":1,"max":10,"step":1,"chart":true,"aggregate":"avg","priority":5}
    ]'::jsonb),
    ('mixed', '[
      {"id":"session_type","type":"select","label":"Format","options":["Circuit","Intervalles","Technique","Competition","Libre"],"priority":1},
      {"id":"rounds","type":"number","label":"Tours / rounds","min":0,"max":100,"step":1,"chart":true,"aggregate":"sum","priority":2},
      {"id":"stations","type":"number","label":"Ateliers","min":0,"max":100,"step":1,"chart":true,"aggregate":"sum","priority":3},
      {"id":"work_time","type":"number","label":"Temps de travail","unit":"min","min":0,"max":600,"step":1,"chart":true,"aggregate":"sum","priority":4},
      {"id":"execution_quality","type":"number","label":"Qualite execution","min":1,"max":10,"step":1,"chart":true,"aggregate":"avg","priority":5}
    ]'::jsonb),
    ('running', '[
      {"id":"session_type","type":"select","label":"Format","options":["Endurance","Tempo","Fractionne","Cote","Competition"],"priority":1},
      {"id":"elevation","type":"number","label":"Denivele positif","unit":"m","min":0,"max":15000,"step":10,"chart":true,"aggregate":"sum","priority":2},
      {"id":"avg_pace","type":"text","label":"Allure moyenne","placeholder":"Ex: 5:20 /km","priority":3},
      {"id":"avg_hr","type":"number","label":"FC moyenne","unit":"bpm","min":40,"max":230,"step":1,"chart":true,"aggregate":"avg","priority":4},
      {"id":"cadence","type":"number","label":"Cadence","unit":"ppm","min":0,"max":260,"step":1,"chart":true,"aggregate":"avg","priority":5}
    ]'::jsonb),
    ('swimming', '[
      {"id":"stroke","type":"select","label":"Nage","options":["Nage libre","Brasse","Dos","Papillon","4 nages","Technique"],"priority":1},
      {"id":"pool_length","type":"select","label":"Bassin","options":["25 m","50 m","Eau libre"],"priority":2},
      {"id":"avg_pace","type":"text","label":"Allure moyenne","placeholder":"Ex: 1:52 /100 m","priority":3},
      {"id":"stroke_rate","type":"number","label":"Cadence","min":0,"max":160,"step":1,"chart":true,"aggregate":"avg","priority":4},
      {"id":"technical_quality","type":"number","label":"Qualite technique","min":1,"max":10,"step":1,"chart":true,"aggregate":"avg","priority":5}
    ]'::jsonb),
    ('mobility', '[
      {"id":"session_type","type":"select","label":"Format","options":["Mobilite","Souplesse","Respiration","Recuperation","Cours"],"priority":1},
      {"id":"focus_area","type":"text","label":"Zone travaillee","placeholder":"Ex: hanches, epaules, dos","priority":2},
      {"id":"mobility_score","type":"number","label":"Amplitude percue","min":1,"max":10,"step":1,"chart":true,"aggregate":"avg","priority":3},
      {"id":"balance_score","type":"number","label":"Equilibre","min":1,"max":10,"step":1,"chart":true,"aggregate":"avg","priority":4},
      {"id":"breathing_quality","type":"number","label":"Qualite respiration","min":1,"max":10,"step":1,"chart":true,"aggregate":"avg","priority":5}
    ]'::jsonb),
    ('hiking', '[
      {"id":"route_type","type":"select","label":"Terrain","options":["Route","Sentier","Montagne","Mixte","Tapis"],"priority":1},
      {"id":"elevation","type":"number","label":"Denivele positif","unit":"m","min":0,"max":15000,"step":10,"chart":true,"aggregate":"sum","priority":2},
      {"id":"pack_weight","type":"number","label":"Poids du sac","unit":"kg","min":0,"max":80,"step":0.5,"chart":true,"aggregate":"avg","priority":3},
      {"id":"technical_difficulty","type":"number","label":"Technicite","min":1,"max":10,"step":1,"chart":true,"aggregate":"avg","priority":4},
      {"id":"navigation_quality","type":"number","label":"Navigation","min":1,"max":10,"step":1,"chart":true,"aggregate":"avg","priority":5}
    ]'::jsonb)
)
update public.sports s
set extra_fields = t.fields,
    updated_at = now()
from templates t
where s.is_active
  and coalesce(jsonb_array_length(s.extra_fields), 0) = 0
  and t.profile = case
    when s.balance_profile in ('team','football','rugby','hockey_team','contact_team','volleyball') then 'team'
    when s.balance_profile in ('water','open_water') then 'water'
    when s.balance_profile in ('glide','mtb') then 'glide'
    when s.balance_profile = 'cycling' then 'cycling'
    when s.balance_profile in ('skill','gym_skill','climbing') then 'skill'
    when s.balance_profile = 'precision' then 'precision'
    when s.balance_profile in ('combat','combat_grappling','combat_striking','combat_weapon') then 'combat'
    when s.balance_profile in ('strength','strength_max','calisthenics') then 'strength'
    when s.balance_profile = 'racket' then 'racket'
    when s.balance_profile in ('mixed','mixed_conditioning') then 'mixed'
    when s.balance_profile in ('running','speed','trail','mountain_endurance') then 'running'
    when s.balance_profile = 'swimming' then 'swimming'
    when s.balance_profile in ('mobility','mindbody','dance') then 'mobility'
    when s.balance_profile = 'hiking' then 'hiking'
    else 'skill'
  end;

update public.sports s
set tracking_summary = jsonb_set(
        coalesce(s.tracking_summary, '{}'::jsonb),
        '{aliases}',
        (
          select coalesce(jsonb_agg(alias order by alias), '[]'::jsonb)
          from (
            select distinct lower(btrim(value)) as alias
            from unnest(array[
              s.label,
              s.name,
              replace(s.id, '_', ' '),
              replace(coalesce(s.slug, s.id), '_', ' '),
              replace(s.category, '_', ' '),
              replace(s.balance_profile, '_', ' ')
            ]) value
            where value is not null and btrim(value) <> ''
          ) aliases
        ),
        true
    ),
    updated_at = now()
where s.is_active
  and coalesce(s.tracking_summary->'aliases', '[]'::jsonb) = '[]'::jsonb;

update public.sports s
set required_fields = s.required_fields || jsonb_build_object('specificMetrics', 'recommended'),
    tracking_summary = coalesce(s.tracking_summary, '{}'::jsonb) || jsonb_build_object(
      'catalogPolish', 'v88',
      'dataQuality', 'profile-specific',
      'metricCount', coalesce(jsonb_array_length(s.extra_fields), 0),
      'searchTokens', (
        select coalesce(jsonb_agg(token order by token), '[]'::jsonb)
        from (
          select distinct lower(btrim(value)) token
          from (
            select unnest(array[
              s.label,
              s.name,
              replace(s.id, '_', ' '),
              replace(coalesce(s.slug, s.id), '_', ' '),
              replace(s.category, '_', ' '),
              replace(s.balance_profile, '_', ' '),
              s.tracking_summary->>'officialLabel',
              s.tracking_summary->>'disciplineGroup',
              s.tracking_summary->>'environment'
            ]) value
            union all
            select jsonb_array_elements_text(coalesce(s.tracking_summary->'aliases', '[]'::jsonb))
          ) raw_tokens
          where value is not null and btrim(value) <> ''
        ) clean_tokens
      )
    ),
    tracking_version = 'v88-complete-catalog',
    updated_at = now()
where s.is_active;

update public.mobs
set image_url = regexp_replace(image_url, '\.(png|jpe?g)$', '.webp', 'i')
where image_url ~* '\.(png|jpe?g)$';

update public.bosses
set image_url = regexp_replace(image_url, '\.(png|jpe?g)$', '.webp', 'i')
where image_url ~* '\.(png|jpe?g)$';

commit;
