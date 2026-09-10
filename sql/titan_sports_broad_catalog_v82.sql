begin;

-- TITAN OS v82 - Broad real-sports catalog and strict cleanup.
-- Safe to rerun. Keeps recognized/practiced sports active and hides chores/recovery-only/non-sport rows.

with non_sports(id, reason) as (
    values
        ('diy', 'manual_chore_not_sport'),
        ('moving', 'manual_chore_not_sport'),
        ('sauna', 'recovery_not_sport'),
        ('meditation', 'mindfulness_not_sport'),
        ('vr_fitness', 'fitness_game_not_sport_catalog'),
        ('stroller_walk', 'daily_life_activity_not_sport_catalog'),
        ('hobby_horsing', 'novelty_not_titan_sport_catalog'),
        ('hobbyhorse', 'novelty_not_titan_sport_catalog'),
        ('quidditch', 'fiction_broom_variant_not_titan_sport_catalog')
)
update public.sports s
set
    is_active = false,
    tracking_summary = coalesce(s.tracking_summary, '{}'::jsonb)
        || jsonb_build_object(
            'catalogType', 'excluded_non_sport',
            'hiddenReason', n.reason,
            'catalogPolish', 'v82'
        ),
    updated_at = now()
from non_sports n
where s.id = n.id;

with polish(id, category, balance_profile, discipline_group, headline, aliases, graphs, sort_order) as (
    values
        ('aquagym', 'mobility', 'swimming', 'Aquatics', 'Aquagym: duree, aisance, respiration, mobilite et intensite douce.', array['aqua gym','aquafitness'], array['stroke','mobility_work','avg_hr'], 928),
        ('ballet', 'skill', 'skill', 'Dance', 'Danse classique: barre, routine, mobilite, sauts et qualite technique.', array['danse classique'], array['combo_count','execution_quality','mobility_work'], 1010),
        ('bowling', 'skill', 'precision', 'Precision', 'Bowling: parties, lancers, strikes, regularite et precision.', array['quilles'], array['attempts','successful_actions','accuracy'], 1030),
        ('canyoning', 'outdoor', 'water', 'Outdoor water', 'Canyoning: progression, eau, rappels, sauts, autonomie et securite.', array['canyon'], array['water_state','technical_sections','successful_actions'], 1040),
        ('circus', 'skill', 'skill', 'Acrobatics', 'Arts acrobatiques: technique, sequence, equilibre, mobilite et repetitions.', array['arts du cirque','acrobaties'], array['combo_count','execution_quality','fall_count'], 1045),
        ('darts', 'skill', 'precision', 'Precision', 'Flechettes: volees, precision, score, regularite et pression.', array['flechettes','darts'], array['attempts','successful_actions','accuracy'], 1050),
        ('diving', 'skill', 'water', 'Aquatics', 'Plongee sous-marine: duree, aisance, profondeur, securite et conditions.', array['scuba','plongee bouteille'], array['water_state','autonomy','execution_quality'], 1060),
        ('hiphop', 'skill', 'skill', 'Dance', 'Hip-hop: choregraphie, freestyle, appuis, rythme et qualite technique.', array['hip hop','street dance'], array['combo_count','execution_quality','mobility_work'], 1080),
        ('ice_skating', 'skill', 'glide', 'Glide', 'Patinage sur glace: appuis, carres, figures, vitesse et chutes.', array['patinage libre'], array['runs','tricks','fall_count'], 1090),
        ('kitesurf', 'outdoor', 'water', 'Board water', 'Kitesurf: vent, eau, runs, figures, autonomie et chutes.', array['kiteboarding'], array['water_state','runs','fall_count'], 1100),
        ('qigong', 'mobility', 'mobility', 'Mind-body', 'Qi Gong: duree, respiration, mobilite, controle et relachement.', array['qi gong'], array['hold_seconds','breathing','mobility_work'], 1120),
        ('salsa', 'skill', 'skill', 'Dance', 'Danse latine: rythme, passes, coordination, endurance et qualite technique.', array['bachata','latine'], array['combo_count','execution_quality','mobility_work'], 1130),
        ('stretching', 'mobility', 'mobility', 'Mobility', 'Stretching: zone cible, maintiens, respiration et evolution de douleur.', array['etirements','mobilite'], array['hold_seconds','pain_before','pain_after'], 1140),
        ('taichi', 'mobility', 'mobility', 'Mind-body', 'Tai Chi: enchainements, equilibre, respiration, controle et mobilite.', array['tai chi','taiji'], array['combo_count','execution_quality','mobility_work'], 1150),
        ('table_tennis', 'cardio', 'racket', 'Racket', 'Tennis de table: sets, points directs, fautes, rythme et precision.', array['ping pong','ping-pong'], array['sets_won','aces','unforced_errors'], 812),
        ('wakeboard', 'outdoor', 'water', 'Board water', 'Wakeboard: runs, figures, receptions, chutes et conditions.', array['wake'], array['runs','tricks','fall_count'], 1160),
        ('windsurf', 'outdoor', 'water', 'Board water', 'Planche a voile: vent, eau, bords, manoeuvres et autonomie.', array['planche a voile','windsurfing'], array['water_state','runs','autonomy'], 1170),
        ('yoga', 'mobility', 'mobility', 'Mind-body', 'Yoga: duree, respiration, mobilite, posture et controle.', array['hatha','vinyasa','ashtanga'], array['hold_seconds','breathing','mobility_work'], 1180)
)
update public.sports s
set
    category = p.category,
    balance_profile = p.balance_profile,
    sort_order = coalesce(nullif(s.sort_order, 0), p.sort_order),
    tracking_summary = coalesce(s.tracking_summary, '{}'::jsonb)
        || jsonb_build_object(
            'headline', p.headline,
            'aliases', to_jsonb(p.aliases),
            'graphs', to_jsonb(p.graphs),
            'disciplineGroup', p.discipline_group,
            'catalogType', 'sport',
            'catalogPolish', 'v82'
        ),
    description = coalesce(nullif(btrim(s.description), ''), p.headline),
    updated_at = now()
from polish p
where s.id = p.id
  and coalesce(s.is_active, true);

with seed(
    id, label, category, icon, unit, xp_multiplier, form_type,
    balance_profile, sort_order, discipline_group, environment,
    intensity, aliases, graphs, headline, description
) as (
    values
        ('acrobatic_gymnastics','Gym acrobatique','skill','ri-medal-line','min',8,'duration','skill',1200,'Gymnastics','indoor','medium',array['acrobatic gymnastics','acro sport'],array['combo_count','execution_quality','fall_count'],'Gym acrobatique: portes, equilibre, routine, execution et securite.','Discipline gymnique en duo/groupe, utile pour technique, force, mobilite et coordination.'),
        ('aerobic_gymnastics','Gym aerobic','cardio','ri-heart-pulse-line','min',8,'duration','skill',1201,'Gymnastics','indoor','high',array['aerobic gymnastics'],array['combo_count','avg_hr','execution_quality'],'Gym aerobic: routine, cardio, coordination, rythme et execution.','Discipline gymnique dynamique, entre endurance, puissance et technique choregraphiee.'),
        ('adventure_racing','Raid aventure','outdoor','ri-route-line','km',70,'gps_full','mixed',1202,'Multisport outdoor','outdoor','high',array['adventure race','raid multisport'],array['elevation','navigation','avg_hr'],'Raid aventure: distance, orientation, D+, transitions et autonomie.','Multisport outdoor combinant endurance, navigation et gestion d equipe.'),
        ('arnis_eskrima','Arnis / Eskrima','combat','ri-sword-line','min',9,'duration','combat',1203,'Combat','indoor','medium',array['kali','escrima','arnis'],array['rounds','successful_actions','execution_quality'],'Arnis/Eskrima: armes, angles, precision, rounds et controle.','Art martial philippin centre sur les armes, le rythme et les deplacements.'),
        ('arm_wrestling','Bras de fer sportif','force','ri-armchair-line','min',8,'duration','strength',1204,'Strength','indoor','high',array['armwrestling'],array['attempts','successful_actions','top_set_weight'],'Bras de fer: prises, rounds, force specifique et controle.','Sport de force specifique avec travail de poignet, tirage et table.'),
        ('artistic_cycling','Cyclisme artistique','skill','ri-riding-line','min',7,'duration','cycling',1205,'Cycling','indoor','medium',array['artistic cycling'],array['combo_count','execution_quality','fall_count'],'Cyclisme artistique: figures, equilibre, routine et precision.','Discipline cycliste indoor centree sur figures, coordination et controle.'),
        ('australian_rules_football','Football australien','team','ri-football-line','min',11,'duration','team',1206,'Team field','outdoor','high',array['aussie rules','afl'],array['score_for','score_against','decisive_actions'],'Football australien: temps de jeu, courses, contacts, score et actions.','Sport collectif de grand terrain, intense et polyvalent.'),
        ('bandy','Bandy','team','ri-snowy-line','min',10,'duration','team',1207,'Ice team','ice','high',array['hockey russe'],array['score_for','score_against','decisive_actions'],'Bandy: patinage, passes, tirs, transitions et score.','Sport collectif sur glace proche du hockey avec balle.'),
        ('beach_handball','Beach handball','team','ri-hand-heart-line','min',9,'duration','team',1208,'Beach team','sand','high',array['handball plage'],array['score_for','score_against','decisive_actions'],'Beach handball: sable, rotations, score, tirs spectaculaires et defense.','Variante de handball sur sable, rapide et explosive.'),
        ('beach_soccer','Beach soccer','team','ri-football-line','min',9,'duration','football',1209,'Beach team','sand','high',array['football plage'],array['goals','assists','successful_tackles'],'Beach soccer: sable, score, frappes, reprises et intensite.','Football sur sable, plus court et tres explosif.'),
        ('beach_tennis','Beach tennis','cardio','ri-ping-pong-line','min',8,'duration','racket',1210,'Racket','sand','medium',array['tennis plage'],array['sets_won','aces','unforced_errors'],'Beach tennis: sets, services, volees, fautes et deplacements sable.','Sport de raquette sur sable, souvent en double.'),
        ('billiards_pool','Billard pool','skill','ri-focus-3-line','min',4,'duration','precision',1211,'Precision','indoor','low',array['pool','billard americain'],array['attempts','successful_actions','accuracy'],'Billard pool: parties, precision, placements et serie sous pression.','Sport de precision sur table avec lecture d angles et controle.'),
        ('blind_football','Cecifoot','team','ri-football-line','min',8,'duration','football',1212,'Para team','indoor','high',array['blind football','football aveugle'],array['goals','assists','successful_tackles'],'Cecifoot: orientation, passes, tirs, defense et communication.','Football adapte, suivi par role, temps de jeu et actions decisives.'),
        ('bocce','Bocce','skill','ri-focus-3-line','min',4,'duration','precision',1213,'Precision','indoor','low',array['bocce volo'],array['attempts','successful_actions','accuracy'],'Bocce: lancers, precision, points, regularite et tactique.','Sport de boules centre sur placement, controle et decision.'),
        ('boccia','Boccia','skill','ri-focus-3-line','min',4,'duration','precision',1214,'Para precision','indoor','low',array['boccia paralympique'],array['attempts','successful_actions','accuracy'],'Boccia: lancers, precision, strategie, score et controle.','Sport de precision paralympique, tres tactique et mesurable.'),
        ('bodyboarding','Bodyboard','outdoor','ri-surfing-line','min',7,'duration','water',1215,'Board water','water','medium',array['bodyboard'],array['water_state','runs','fall_count'],'Bodyboard: vagues, conditions, runs, chutes et engagement.','Sport de glisse aquatique en vagues, proche du surf mais specifique.'),
        ('breakdance','Breaking','skill','ri-music-2-line','min',9,'duration','skill',1216,'Dance sport','indoor','high',array['breakdance','breaking'],array['combo_count','execution_quality','mobility_work'],'Breaking: rounds, combos, musicalite, puissance et execution.','Danse sportive de duel, exigeante en coordination et force.'),
        ('camogie','Camogie','team','ri-team-line','min',10,'duration','team',1217,'Gaelic sports','outdoor','high',array['camogie'],array['score_for','score_against','decisive_actions'],'Camogie: crosse, courses, score, defense et actions decisives.','Sport gaelique collectif, proche du hurling.'),
        ('canoe_polo','Canoe polo','team','ri-ship-2-line','min',10,'duration','water',1218,'Water team','water','high',array['kayak polo'],array['score_for','score_against','decisive_actions'],'Canoe polo: bateau, passes, tirs, defense et transitions.','Sport collectif aquatique en kayak.'),
        ('cheerleading','Cheerleading','skill','ri-team-line','min',9,'duration','skill',1219,'Acrobatics','indoor','high',array['cheer'],array['combo_count','execution_quality','fall_count'],'Cheerleading: stunts, tumbling, routine, synchro et securite.','Discipline sportive collective, acrobatique et choregraphiee.'),
        ('croquet','Croquet','skill','ri-focus-3-line','min',4,'duration','precision',1220,'Precision','outdoor','low',array['croquet'],array['attempts','successful_actions','accuracy'],'Croquet: coups, precision, strategie, placements et score.','Sport de maillet et precision sur gazon.'),
        ('cycle_ball','Cycle-ball','team','ri-riding-line','min',8,'duration','cycling',1221,'Cycling','indoor','medium',array['cycle ball','radball'],array['score_for','score_against','decisive_actions'],'Cycle-ball: velo, passes, tirs, equilibre et score.','Sport cycliste indoor en equipe.'),
        ('cycle_polo','Cycle polo','team','ri-riding-line','min',9,'duration','cycling',1222,'Cycling team','outdoor','medium',array['bike polo'],array['score_for','score_against','decisive_actions'],'Cycle polo: velo, maillet, passes, tirs et transitions.','Sport collectif a velo, tactique et technique.'),
        ('cyclocross','Cyclo-cross','outdoor','ri-riding-line','km',45,'gps_full','cycling',1223,'Cycling','outdoor','high',array['cyclocross','cx'],array['elevation','technical_sections','avg_power'],'Cyclo-cross: tours, terrain, relances, portages et intensite.','Discipline cycliste mixte route/sous-bois avec efforts repetes.'),
        ('disc_golf','Disc golf','skill','ri-disc-line','min',5,'duration','precision',1224,'Precision','outdoor','low',array['frisbee golf'],array['attempts','successful_actions','accuracy'],'Disc golf: lancers, precision, score, placements et vent.','Sport de lancer de disque vers paniers, tres lisible en score.'),
        ('dodgeball','Dodgeball','team','ri-team-line','min',8,'duration','team',1225,'Team court','indoor','high',array['balle au prisonnier sportive'],array['score_for','score_against','decisive_actions'],'Dodgeball: manches, esquives, tirs, captures et score.','Sport collectif rapide base sur esquive, precision et reactions.'),
        ('dressage','Dressage','skill','ri-horse-line','min',6,'duration','skill',1226,'Equestrian','arena','medium',array['dressage cheval'],array['execution_quality','successful_actions','errors'],'Dressage: reprise, precision, controle, transitions et fautes.','Discipline equestre reelle, distincte des pratiques novelty.'),
        ('eventing','Concours complet','skill','ri-horse-line','min',8,'duration','skill',1227,'Equestrian','arena/outdoor','high',array['eventing','cce'],array['execution_quality','fall_count','errors'],'Concours complet: dressage, cross, saut, controle et fautes.','Discipline equestre combinee avec exigences techniques et physiques.'),
        ('fell_running','Course en montagne','outdoor','ri-mountain-line','km',62,'gps_full','trail',1228,'Running','mountain','high',array['mountain running','fell running'],array['elevation','avg_hr','technical_sections'],'Course en montagne: D+, technicite, rythme, descentes et endurance.','Course outdoor de montagne, proche du trail mais plus orientee denivele.'),
        ('finswimming','Nage avec palmes','endurance','ri-drop-line','m',0.55,'duration','swimming',1229,'Aquatics','water','medium',array['finswim','palmes'],array['stroke','swolf','avg_hr'],'Nage avec palmes: distance, technique, rythme et souffle.','Discipline aquatique de vitesse/endurance avec palmes.'),
        ('freestyle_wrestling','Lutte libre','combat','ri-boxing-line','min',12,'duration','combat',1230,'Combat','mat','high',array['freestyle wrestling'],array['rounds','takedowns','execution_quality'],'Lutte libre: rounds, projections, controle et intensite.','Specialite de lutte avec attaques aux jambes autorisees.'),
        ('futnet','Futnet','team','ri-football-line','min',8,'duration','team',1231,'Net team','court','medium',array['tennis ballon'],array['score_for','score_against','decisive_actions'],'Futnet: touches, filet, score, precision et coordination.','Sport collectif au filet joue avec les pieds.'),
        ('gaelic_football','Football gaelique','team','ri-football-line','min',10,'duration','team',1232,'Gaelic sports','outdoor','high',array['gaelic football'],array['score_for','score_against','decisive_actions'],'Football gaelique: courses, passes, tirs, score et contacts.','Sport gaelique collectif de grand terrain.'),
        ('goalball','Goalball','team','ri-team-line','min',7,'duration','team',1233,'Para team','indoor','medium',array['goal ball'],array['score_for','score_against','decisive_actions'],'Goalball: lancers, defense, orientation sonore et score.','Sport paralympique collectif pour athletes deficients visuels.'),
        ('grappling','Grappling','combat','ri-boxing-line','min',10,'duration','combat',1234,'Combat','mat','high',array['submission grappling','no gi'],array['rounds','takedowns','submissions'],'Grappling: rounds, controles, projections, soumissions et intensite.','Sport de combat au sol centre sur controle et soumission.'),
        ('greco_roman_wrestling','Lutte greco-romaine','combat','ri-boxing-line','min',12,'duration','combat',1235,'Combat','mat','high',array['greco roman wrestling'],array['rounds','takedowns','execution_quality'],'Lutte greco-romaine: projections haut du corps, controle et rounds.','Specialite de lutte sans attaques aux jambes.'),
        ('grip_sport','Grip sport','force','ri-hand-heart-line','min',6,'duration','strength',1236,'Strength','indoor','medium',array['grip strength'],array['attempts','successful_actions','top_set_weight'],'Grip sport: pinces, holds, temps, charge et progression.','Sport de force specifique pour mains, doigts et avant-bras.'),
        ('hapkido','Hapkido','combat','ri-boxing-line','min',8,'duration','combat',1237,'Combat','indoor','medium',array['hapkido'],array['rounds','successful_actions','execution_quality'],'Hapkido: techniques, projections, controles et precision.','Art martial coreen avec frappes, cles et projections.'),
        ('highland_games','Highland games','force','ri-medal-line','min',9,'duration','strength',1238,'Strength throws','outdoor','high',array['lancers ecossais'],array['attempts','successful_actions','top_set_weight'],'Highland games: lancers lourds, essais, technique et puissance.','Sports traditionnels de lancers de force.'),
        ('horse_racing','Course hippique','skill','ri-horse-line','min',5,'duration','skill',1239,'Equestrian','track','medium',array['horse racing','hippisme'],array['execution_quality','successful_actions','speed'],'Course hippique: monte, controle, rythme, tactique et securite.','Sport equestre de course, suivi par duree, role et qualite.'),
        ('hurling','Hurling','team','ri-team-line','min',11,'duration','team',1240,'Gaelic sports','outdoor','high',array['hurling'],array['score_for','score_against','decisive_actions'],'Hurling: crosse, vitesse, tirs, defense et score.','Sport gaelique de crosse, tres rapide et physique.'),
        ('ice_climbing','Cascade de glace','skill','ri-snowy-line','min',9,'duration','climbing',1241,'Climbing','ice','high',array['ice climbing','escalade glace'],array['attempts','successful_routes','fall_count'],'Cascade de glace: voie, cotation, essais, securite et conditions.','Discipline d escalade hivernale sur glace.'),
        ('inline_speed_skating','Roller vitesse','endurance','ri-skateboard-line','km',35,'gps_full','glide',1242,'Skating','road/track','high',array['inline speed skating'],array['cadence','sprints','avg_hr'],'Roller vitesse: distance, cadence, peloton, sprints et allure.','Discipline de vitesse/endurance en roller inline.'),
        ('kabaddi','Kabaddi','team','ri-team-line','min',10,'duration','team',1243,'Team contact','indoor','high',array['kabaddi'],array['score_for','score_against','decisive_actions'],'Kabaddi: raids, touches, defense, souffle et score.','Sport collectif de contact avec raids et apnee courte.'),
        ('karting','Karting','skill','ri-steering-2-line','min',5,'duration','skill',1244,'Motorsport','track','medium',array['kart'],array['laps','best_time','execution_quality'],'Karting: tours, trajectoires, temps, regularite et precision.','Sport mecanique reel, suivi sans le confondre avec entrainement cardio.'),
        ('kho_kho','Kho kho','team','ri-team-line','min',9,'duration','team',1245,'Team tag','indoor/outdoor','high',array['kho-kho'],array['score_for','score_against','decisive_actions'],'Kho kho: poursuites, esquives, relais, vitesse et score.','Sport collectif de poursuite tres explosif.'),
        ('motocross','Motocross','outdoor','ri-motorbike-line','min',8,'duration','skill',1246,'Motorsport','track','high',array['mx'],array['laps','technical_sections','fall_count'],'Motocross: tours, terrain, sauts, technique et engagement.','Sport moto tout-terrain exigeant techniquement et physiquement.'),
        ('outrigger_canoe','Pirogue vaa','outdoor','ri-ship-line','km',45,'gps_full','water',1247,'Paddle water','water','high',array['outrigger canoe','vaa'],array['stroke_rate','water_state','avg_power'],'Pirogue/vaa: distance, cadence, equipage, eau et endurance.','Discipline de pagaie en pirogue, individuelle ou collective.'),
        ('para_cycling','Para cyclisme','endurance','ri-riding-line','km',36,'gps_full','cycling',1248,'Para cycling','road/track','medium',array['para cycling'],array['avg_power','cadence','avg_hr'],'Para cyclisme: distance, cadence, puissance, rythme et endurance.','Cyclisme adapte, route/piste/handbike selon pratique.'),
        ('para_powerlifting','Para powerlifting','force','ri-bar-chart-horizontal-fill','kg',10,'builder_gym','strength',1249,'Para strength','indoor','high',array['developpe couche handisport'],array['top_set_weight','record_attempt','execution_quality'],'Para powerlifting: charge, series, top set, technique et tentative.','Discipline de force paralympique centree sur le developpe couche.'),
        ('petanque','Petanque','skill','ri-focus-3-line','min',4,'duration','precision',1250,'Precision','outdoor','low',array['boules','jeu provencal'],array['attempts','successful_actions','accuracy'],'Petanque: menes, tirs, points, precision et tactique.','Sport de boules populaire, mesurable par menes et precision.'),
        ('platform_tennis','Platform tennis','cardio','ri-ping-pong-line','min',7,'duration','racket',1251,'Racket','court','medium',array['paddle tennis'],array['sets_won','aces','unforced_errors'],'Platform tennis: sets, filet, rebonds, fautes et endurance.','Sport de raquette en double sur court ferme.'),
        ('polo','Polo','team','ri-horse-line','min',8,'duration','team',1252,'Equestrian team','field','high',array['polo equestre'],array['score_for','score_against','decisive_actions'],'Polo: chukkas, monte, passes, tirs, score et controle.','Sport equestre collectif avec maillet.'),
        ('race_walking','Marche athletique','endurance','ri-walk-line','km',28,'gps_full','running',1253,'Athletics','road/track','medium',array['race walking','marche sportive'],array['cadence','avg_hr','pace'],'Marche athletique: distance, cadence, allure, technique et endurance.','Discipline athletique codifiee, distincte de la promenade.'),
        ('racketlon','Racketlon','cardio','ri-ping-pong-line','min',10,'duration','racket',1254,'Racket','multi-court','high',array['racketlon'],array['sets_won','aces','unforced_errors'],'Racketlon: quatre raquettes, sets, transitions et regularite.','Multisport de raquette combinant tennis de table, badminton, squash et tennis.'),
        ('racquetball','Racquetball','cardio','ri-ping-pong-line','min',10,'duration','racket',1255,'Racket','indoor','high',array['racquet ball'],array['sets_won','aces','unforced_errors'],'Racquetball: sets, points directs, murs, fautes et intensite.','Sport de raquette indoor rapide.'),
        ('rafting','Rafting','outdoor','ri-ship-2-line','km',35,'gps_full','water',1256,'Outdoor water','water','high',array['raft'],array['water_state','technical_sections','successful_actions'],'Rafting: distance, rapide, equipage, eau et securite.','Sport d eau vive collectif.'),
        ('real_tennis','Jeu de paume','skill','ri-ping-pong-line','min',6,'duration','racket',1257,'Racket','court','medium',array['real tennis','court tennis'],array['sets_won','aces','unforced_errors'],'Jeu de paume: sets, murs, precision, placements et score.','Ancetre sportif du tennis moderne, encore pratique.'),
        ('ringette','Ringette','team','ri-snowy-line','min',9,'duration','team',1258,'Ice team','ice','high',array['ringette'],array['score_for','score_against','decisive_actions'],'Ringette: patinage, passes, tirs, defense et score.','Sport collectif sur glace avec anneau.'),
        ('rogaining','Rogaining','outdoor','ri-compass-3-line','km',60,'gps_full','hiking',1259,'Navigation','outdoor','medium',array['orientation longue'],array['navigation','elevation','avg_hr'],'Rogaining: orientation longue, balises, distance, D+ et autonomie.','Sport d orientation longue distance en equipe.'),
        ('sambo','Sambo','combat','ri-boxing-line','min',10,'duration','combat',1260,'Combat','mat','high',array['combat sambo'],array['rounds','takedowns','submissions'],'Sambo: projections, controle, soumissions, rounds et intensite.','Sport de combat de grappling et self-defense sportive.'),
        ('sepak_takraw','Sepak takraw','team','ri-football-line','min',9,'duration','team',1261,'Net team','court','high',array['takraw'],array['score_for','score_against','decisive_actions'],'Sepak takraw: filet, acrobaties, touches, score et coordination.','Sport collectif au filet joue principalement avec les pieds.'),
        ('show_jumping','Saut d obstacles','skill','ri-horse-line','min',7,'duration','skill',1262,'Equestrian','arena','medium',array['jumping','cso'],array['execution_quality','successful_actions','errors'],'Saut d obstacles: parcours, barres, refus, chrono et controle.','Discipline equestre de franchissement d obstacles.'),
        ('sitting_volleyball','Volley assis','team','ri-volleyball-line','min',7,'duration','team',1263,'Para team','court','medium',array['sitting volleyball'],array['score_for','score_against','decisive_actions'],'Volley assis: score, reception, attaque, bloc et placement.','Variante paralympique du volleyball.'),
        ('skimboarding','Skimboard','outdoor','ri-surfing-line','min',7,'duration','water',1264,'Board water','water','medium',array['skimboard'],array['water_state','runs','fall_count'],'Skimboard: runs, vagues, equilibre, tricks et chutes.','Sport de glisse sur faible profondeur ou shorebreak.'),
        ('ski_orienteering','Orientation a ski','outdoor','ri-compass-3-line','km',58,'gps_full','glide',1265,'Winter navigation','snow','high',array['ski-o','ski orientation'],array['navigation','elevation','avg_hr'],'Orientation a ski: distance, balises, D+, trace et navigation.','Sport d orientation hivernal a ski.'),
        ('snooker','Snooker','skill','ri-focus-3-line','min',4,'duration','precision',1266,'Precision','indoor','low',array['billard anglais'],array['attempts','successful_actions','accuracy'],'Snooker: frames, precision, placements, serie et strategie.','Sport de precision sur table de billard.'),
        ('speed_skiing','Kilometre lance','outdoor','ri-speed-up-line','min',7,'duration','glide',1267,'Winter speed','snow','high',array['speed skiing'],array['runs','best_time','execution_quality'],'Kilometre lance: runs, vitesse, ligne, engagement et securite.','Discipline de vitesse a ski.'),
        ('sumo','Sumo','combat','ri-boxing-line','min',8,'duration','combat',1268,'Combat','ring','high',array['sumo wrestling'],array['rounds','takedowns','execution_quality'],'Sumo: combats, poussee, equilibre, sorties et controle.','Sport de combat traditionnel japonais.'),
        ('surfski','Surfski','outdoor','ri-ship-2-line','km',45,'gps_full','water',1269,'Paddle water','water','high',array['surf ski'],array['stroke_rate','water_state','avg_power'],'Surfski: distance, houle, cadence, navigation et endurance.','Kayak de mer sportif rapide.'),
        ('tchoukball','Tchoukball','team','ri-team-line','min',8,'duration','team',1270,'Team court','indoor','medium',array['tchouk'],array['score_for','score_against','decisive_actions'],'Tchoukball: tirs, receptions, placement, score et fair-play.','Sport collectif sans contact autour de cadres de renvoi.'),
        ('telemark_skiing','Ski telemark','outdoor','ri-snowflake-line','km',28,'gps_full','glide',1271,'Winter','snow','high',array['telemark'],array['runs','surface_state','fall_count'],'Ski telemark: descentes, virages, surface, engagement et technique.','Discipline de ski alpin avec talon libre.'),
        ('tug_of_war','Tir a la corde','force','ri-team-line','min',8,'duration','strength',1272,'Strength team','field','high',array['tug of war'],array['rounds','successful_actions','execution_quality'],'Tir a la corde: manches, force collective, ancrage et coordination.','Sport de force collectif officiel dans de nombreuses federations.'),
        ('underwater_hockey','Hockey subaquatique','team','ri-drop-line','min',10,'duration','water',1273,'Underwater team','water','high',array['octopush'],array['score_for','score_against','decisive_actions'],'Hockey subaquatique: apnee, passes, palmes, score et defense.','Sport collectif subaquatique.'),
        ('underwater_rugby','Rugby subaquatique','team','ri-drop-line','min',11,'duration','water',1274,'Underwater team','water','high',array['underwater rugby'],array['score_for','score_against','decisive_actions'],'Rugby subaquatique: apnee, contacts, passes, score et placements.','Sport collectif subaquatique en trois dimensions.'),
        ('water_skiing','Ski nautique','outdoor','ri-sailboat-line','min',8,'duration','water',1275,'Tow water','water','medium',array['waterski'],array['runs','tricks','fall_count'],'Ski nautique: runs, slalom, figures, chutes et conditions.','Sport nautique tracte, technique et explosif.'),
        ('wheelchair_rugby','Rugby fauteuil','team','ri-team-line','min',9,'duration','team',1276,'Para team','indoor','high',array['murderball'],array['score_for','score_against','decisive_actions'],'Rugby fauteuil: temps de jeu, contacts, score et actions decisives.','Sport paralympique collectif tres intense.'),
        ('wheelchair_tennis','Tennis fauteuil','cardio','ri-ping-pong-line','min',8,'duration','racket',1277,'Para racket','court','medium',array['wheelchair tennis'],array['sets_won','aces','unforced_errors'],'Tennis fauteuil: sets, services, fautes, mobilite et endurance.','Variante handisport du tennis.'),
        ('wushu','Wushu','combat','ri-boxing-line','min',9,'duration','combat',1278,'Combat','indoor','medium',array['kung fu sportif','taolu','sanda'],array['rounds','combo_count','execution_quality'],'Wushu: taolu ou sanda, routines, rounds, vitesse et precision.','Discipline martiale sportive chinoise.')
)
insert into public.sports (
    id, label, category, icon, unit, xp_multiplier, form_type,
    balance_profile, tracking_summary, tracking_version, is_active,
    slug, name, description, required_fields, xp_formula, credits_formula,
    suspicious_rules, sort_order, updated_at
)
select
    id,
    label,
    category,
    icon,
    unit,
    xp_multiplier,
    form_type,
    balance_profile,
    jsonb_build_object(
        'headline', headline,
        'aliases', to_jsonb(aliases),
        'graphs', to_jsonb(graphs),
        'disciplineGroup', discipline_group,
        'environment', environment,
        'intensity', intensity,
        'catalogType', 'sport',
        'catalogTier', 'broad-recognized',
        'catalogPolish', 'v82',
        'searchTokens', to_jsonb(aliases) || jsonb_build_array(label, category, balance_profile, discipline_group, environment)
    ),
    'v82-broad-sports',
    true,
    id,
    label,
    description,
    jsonb_build_object(
        'primary', unit,
        'durationMinutes', case when unit = 'min' then 'primary' else 'recommended' end,
        'specificMetrics', 'recommended',
        'notes', 'optional',
        'rpe', 'recommended'
    ),
    jsonb_build_object(
        'authority', 'server_rpc',
        'basis', 'primary_value_duration_rpe_specific_metrics',
        'unit', unit,
        'multiplier', xp_multiplier,
        'cap', 'weekly_user_cap'
    ),
    jsonb_build_object(
        'authority', 'server_rpc',
        'basis', 'bounded_training_reward',
        'unit', unit,
        'cap', 'weekly_user_cap'
    ),
    jsonb_build_object(
        'review', 'server_side_bounds_apply',
        'maxDurationMinutes', case when form_type like 'gps%' then 720 when category in ('skill','mobility') then 300 else 420 end,
        'maxPrimaryPerSession', case when unit = 'km' then 300 when unit = 'm' then 25000 when unit = 'kg' then 12000 else 720 end,
        'requiresHumanReviewAbove', 'extreme_values'
    ),
    sort_order,
    now()
from seed
on conflict (id) do update
set
    label = excluded.label,
    category = excluded.category,
    icon = excluded.icon,
    unit = excluded.unit,
    xp_multiplier = excluded.xp_multiplier,
    form_type = excluded.form_type,
    balance_profile = excluded.balance_profile,
    tracking_summary = coalesce(public.sports.tracking_summary, '{}'::jsonb) || excluded.tracking_summary,
    tracking_version = excluded.tracking_version,
    is_active = true,
    slug = excluded.slug,
    name = excluded.name,
    description = excluded.description,
    required_fields = case
        when public.sports.required_fields is null or public.sports.required_fields = '{}'::jsonb then excluded.required_fields
        else public.sports.required_fields
    end,
    xp_formula = case
        when public.sports.xp_formula is null or public.sports.xp_formula = '{}'::jsonb then excluded.xp_formula
        else public.sports.xp_formula
    end,
    credits_formula = case
        when public.sports.credits_formula is null or public.sports.credits_formula = '{}'::jsonb then excluded.credits_formula
        else public.sports.credits_formula
    end,
    suspicious_rules = case
        when public.sports.suspicious_rules is null or public.sports.suspicious_rules = '{}'::jsonb then excluded.suspicious_rules
        else public.sports.suspicious_rules
    end,
    sort_order = excluded.sort_order,
    updated_at = now();

update public.sports
set
    slug = coalesce(nullif(slug, ''), id),
    name = coalesce(nullif(name, ''), label),
    description = coalesce(
        nullif(btrim(description), ''),
        nullif(btrim(tracking_summary ->> 'headline'), ''),
        label || ': suivi simple de la duree, de l intensite et du ressenti.'
    ),
    tracking_summary = coalesce(tracking_summary, '{}'::jsonb)
        || jsonb_build_object(
            'headline', coalesce(nullif(btrim(tracking_summary ->> 'headline'), ''), label || ': duree, intensite et ressenti.'),
            'catalogType', case when coalesce(is_active, true) then 'sport' else coalesce(tracking_summary ->> 'catalogType', 'inactive') end,
            'catalogPolish', 'v82'
        ),
    required_fields = case
        when required_fields is null or required_fields = '{}'::jsonb then jsonb_build_object(
            'primary', unit,
            'durationMinutes', case when unit = 'min' then 'primary' else 'recommended' end,
            'specificMetrics', 'recommended',
            'notes', 'optional',
            'rpe', 'recommended'
        )
        else required_fields
    end,
    xp_formula = case
        when xp_formula is null or xp_formula = '{}'::jsonb then jsonb_build_object(
            'authority', 'server_rpc',
            'basis', 'primary_value_duration_and_rpe',
            'unit', unit,
            'multiplier', xp_multiplier,
            'cap', 'weekly_user_cap'
        )
        else xp_formula
    end,
    credits_formula = case
        when credits_formula is null or credits_formula = '{}'::jsonb then jsonb_build_object(
            'authority', 'server_rpc',
            'basis', 'bounded_training_reward',
            'unit', unit,
            'cap', 'weekly_user_cap'
        )
        else credits_formula
    end,
    suspicious_rules = case
        when suspicious_rules is null or suspicious_rules = '{}'::jsonb then jsonb_build_object(
            'review', 'server_side_bounds_apply',
            'maxDurationMinutes', case
                when category in ('mobility','skill') then 300
                when form_type like 'gps%' then 720
                else 420
            end,
            'maxPrimaryPerSession', case
                when unit = 'km' then 300
                when unit = 'm' then 25000
                when unit = 'kg' then 12000
                when unit = 'reps' then 4000
                else 720
            end
        )
        else suspicious_rules
    end,
    updated_at = now()
where coalesce(is_active, true);

grant select on public.sports to anon, authenticated;
notify pgrst, 'reload schema';

commit;
