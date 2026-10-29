# V1.1 — matrice des métriques sportives

Catalogue actif lu le 29/10/2026 : **260 sports**. Schémas préparés sur branche, aucune publication. Les colonnes indiquent les champs supplémentaires ; distance, durée, séries et cotations structurées restent dans les formulaires spécialisés. Les champs sont facultatifs. Les anciens IDs sont conservés dans les détails pour compatibilité.

La matrice JSON contient types, unités, bornes, précision et conditions. Cette couverture ne prouve ni la validation métier par 260 athlètes ni la parité Android. Les statistiques existantes consomment `details.extras` et les métadonnées `chart`/`aggregate` ; aucune donnée manquante n’est remplacée par zéro.

| Sport | Groupe | Premières mesures | Autres mesures spécifiques |
| --- | --- | --- | --- |
| Abdos (abs_session) | poids du corps | Repos moyen entre séries (s) ; Meilleur maintien (s) ; Aide | Lest (kg) |
| Gym acrobatique (acrobatic_gymnastics) | gymnastique | Agrès / spécialité ; Enchaînements travaillés ; Réceptions maîtrisées | Chutes / pertes d’engin |
| Raid aventure (adventure_racing) | multisport | Distance courue (km) ; Distance nagée (m) ; Distance à vélo (km) | Temps de transition (s) ; Obstacles franchis |
| Gym aérobic (aerobic_gymnastics) | gymnastique | Agrès / spécialité ; Enchaînements travaillés ; Réceptions maîtrisées | Chutes / pertes d’engin |
| Aïkido (aikido) | arts martiaux | Techniques travaillées ; Rounds travaillés ; Travail | Enchaînements travaillés ; Durée d’un round (s) |
| Ski alpin (alpine_skiing) | ski et snowboard | Descentes ; Dénivelé descendu (m) ; Neige | Figures réussies |
| Alpinisme (alpinism) | montagne | Dénivelé négatif (m) ; Poids du sac (kg) ; Fréquence cardiaque moyenne (bpm) | Terrain ; Altitude maximale (m) |
| Football américain (american_football) | football américain | Temps de jeu effectif (min) ; Touchdowns ; Yards gagnés (yd) | Plaquages / flags ; Interceptions ; Score de ton équipe (points) ; Score adverse (points) |
| Aquagym (aquagym) | fitness aquatique | Matériel ; Temps actif (min) ; Séries | Fréquence cardiaque moyenne (bpm) |
| Aquathlon (aquathlon) | multisport | Distance courue (km) ; Distance nagée (m) ; Distance à vélo (km) | Temps de transition (s) ; Obstacles franchis |
| Tir à l’arc (archery) | tir à l’arc | Flèches tirées ; Distance de tir (m) ; Score moyen par flèche (/10) | Arc |
| Bras de fer sportif (arm_wrestling) | bras de fer | Combats / oppositions ; Victoires ; Bras | Durée moyenne d’opposition (s) |
| Arnis / Eskrima (arnis_eskrima) | armes | Combats / oppositions ; Victoires ; Touches marquées | Touches reçues ; Travail |
| Cyclisme artistique (artistic_cycling) | cyclisme technique | Figures réussies ; Tentatives ; Enchaînements travaillés | Chutes |
| Gym artistique (artistic_gymnastics) | gymnastique | Agrès / spécialité ; Enchaînements travaillés ; Réceptions maîtrisées | Chutes / pertes d’engin |
| Natation artistique (artistic_swimming) | natation artistique | Enchaînements travaillés ; Figures travaillées ; Durée d’un ballet (s) | Formation |
| Athlétisme (athletics) | athlétisme | Discipline ; Essais / répétitions ; Meilleure distance (m) | Meilleur temps (s) |
| Football australien (australian_rules_football) | jeux gaéliques et australiens | Temps de jeu effectif (min) ; Buts marqués ; Points marqués | Duels défensifs gagnés ; Score de ton équipe (points) ; Score adverse (points) |
| Badminton (badminton) | raquettes | Sets gagnés ; Sets perdus ; Points gagnants | Fautes directes ; Échanges joués |
| Danse classique (ballet) | danse | Enchaînements travaillés ; Pas / figures travaillés ; Travail | Temps de pratique active (min) |
| Bandy (bandy) | sports collectifs à buts | Temps de jeu effectif (min) ; Buts marqués ; Passes décisives | Tirs ; Arrêts ; Score de ton équipe (points) ; Score adverse (points) |
| Baseball (baseball) | baseball | Manches jouées ; Coups sûrs ; Points marqués | Passages à la batte ; Retraits sur prises |
| Basketball (basketball) | basket et paniers | Temps de jeu effectif (min) ; Points marqués ; Rebonds | Passes décisives ; Interceptions ; Balles perdues ; Score de ton équipe (points) ; Score adverse (points) |
| Basketball 3x3 (basketball_3x3) | basket et paniers | Temps de jeu effectif (min) ; Points marqués ; Rebonds | Passes décisives ; Interceptions ; Balles perdues ; Score de ton équipe (points) ; Score adverse (points) |
| Beach handball (beach_handball) | handball | Temps de jeu effectif (min) ; Buts marqués ; Tirs | Arrêts ; Passes décisives ; Score de ton équipe (points) ; Score adverse (points) |
| Beach soccer (beach_soccer) | football | Poste ; Temps de jeu effectif (min) ; Buts marqués | Passes décisives ; Arrêts ; Tirs ; Score de ton équipe (points) ; Score adverse (points) |
| Beach tennis (beach_tennis) | tennis | Sets gagnés ; Sets perdus ; Aces | Doubles fautes ; Fautes directes ; Premières balles (%) |
| Beach volley (beach_volleyball) | jeux au filet | Sets gagnés ; Sets perdus ; Attaques gagnantes | Services gagnants ; Contres ; Fautes |
| Biathlon (biathlon) | biathlon | Distance skiée (km) ; Cibles touchées ; Tirs effectués | Tours de pénalité |
| Billard pool (billiards_pool) | billard | Manches jouées ; Manches gagnées ; Meilleure série (points) | Coups de défense |
| Jiu-jitsu brésilien (bjj) | préhension | Combats / oppositions ; Victoires ; Projections / amenées au sol | Sorties de contrôle ; Soumissions réussies ; Durée d’un round (s) |
| Cécifoot (blind_football) | football | Poste ; Temps de jeu effectif (min) ; Buts marqués | Passes décisives ; Arrêts ; Tirs ; Score de ton équipe (points) ; Score adverse (points) |
| BMX dirt (bmx) | cyclisme technique | Figures réussies ; Tentatives ; Enchaînements travaillés | Chutes |
| BMX freestyle (bmx_freestyle) | cyclisme technique | Figures réussies ; Tentatives ; Enchaînements travaillés | Chutes |
| BMX racing (bmx_racing) | BMX course | Manches courues ; Meilleure manche (s) ; Départs travaillés |  |
| Bobsleigh (bobsleigh) | glisse sur piste | Descentes ; Meilleure descente (s) ; Temps de départ (s) |  |
| Bocce (bocce) | boules | Mènes jouées ; Points réussis ; Tirs réussis | Score de ton équipe (points) ; Score adverse (points) |
| Boccia (boccia) | boules | Mènes jouées ; Points réussis ; Tirs réussis | Score de ton équipe (points) ; Score adverse (points) |
| Bodyboard (bodyboarding) | surf | Vagues prises ; Taille des vagues (m) ; Glisses réussies | Figures réussies |
| Poids du corps (bodyweight) | poids du corps | Repos moyen entre séries (s) ; Meilleur maintien (s) ; Aide | Lest (kg) |
| Escalade bloc (bouldering) | escalade | Essais ; Blocs / voies réussis ; Réussites au premier essai | Longueurs grimpées ; Marche d’approche (min) |
| Bowling (bowling) | bowling | Parties jouées ; Meilleur score (points) ; Strikes | Spares |
| Boxe anglaise (boxing) | boxe | Rounds travaillés ; Durée d’un round (s) ; Travail | Combinaisons travaillées ; Fréquence cardiaque moyenne (bpm) |
| Breaking (breakdance) | danse | Enchaînements travaillés ; Pas / figures travaillés ; Travail | Temps de pratique active (min) |
| Camogie (camogie) | jeux gaéliques et australiens | Temps de jeu effectif (min) ; Buts marqués ; Points marqués | Duels défensifs gagnés ; Score de ton équipe (points) ; Score adverse (points) |
| Canoë-polo (canoe_polo) | sports collectifs à buts | Temps de jeu effectif (min) ; Buts marqués ; Passes décisives | Tirs ; Arrêts ; Score de ton équipe (points) ; Score adverse (points) |
| Canoë slalom (canoe_slalom) | eau vive | Rapides / passages ; Portes franchies ; Pénalités (s) | Difficulté |
| Canoë sprint (canoe_sprint) | rame et pagaie | Cadence de coups (coups/min) ; Séries réalisées ; Fréquence cardiaque moyenne (bpm) | Plan d’eau ; Puissance moyenne (W) |
| Canyoning (canyoning) | eau vive | Rapides / passages ; Portes franchies ; Pénalités (s) | Difficulté |
| Capoeira (capoeira) | arts martiaux | Techniques travaillées ; Rounds travaillés ; Travail | Enchaînements travaillés ; Durée d’un round (s) |
| Cheerleading (cheerleading) | gymnastique | Agrès / spécialité ; Enchaînements travaillés ; Réceptions maîtrisées | Chutes / pertes d’engin |
| Arts du cirque (circus) | gymnastique | Agrès / spécialité ; Enchaînements travaillés ; Réceptions maîtrisées | Chutes / pertes d’engin |
| Escalade (mètres grimpés) (climbing) | escalade | Essais ; Blocs / voies réussis ; Réussites au premier essai | Longueurs grimpées ; Marche d’approche (min) |
| Escalade voie (climbing_route) | escalade | Essais ; Blocs / voies réussis ; Réussites au premier essai | Longueurs grimpées ; Marche d’approche (min) |
| Aviron de mer (coastal_rowing) | rame et pagaie | Cadence de coups (coups/min) ; Séries réalisées ; Fréquence cardiaque moyenne (bpm) | Plan d’eau ; Puissance moyenne (W) |
| Cricket (cricket) | cricket | Runs marqués ; Guichets pris ; Séries complètes de six balles | Balles affrontées |
| Croquet (croquet) | précision | Manches jouées ; Coups joués ; Coups réussis | Score de ton équipe (points) ; Score adverse (points) |
| Ski de fond (cross_country_skiing) | ski endurance | Dénivelé positif (m) ; Dénivelé négatif (m) ; Fréquence cardiaque moyenne (bpm) | Technique |
| CrossFit (crossfit) | conditionnement | Rounds travaillés ; Temps de travail actif (min) ; Repos moyen (s) | Répétitions ; Fréquence cardiaque moyenne (bpm) |
| Curling (curling) | précision | Manches jouées ; Coups joués ; Coups réussis | Score de ton équipe (points) ; Score adverse (points) |
| Cycle-ball (cycle_ball) | jeux montés | Temps de jeu effectif (min) ; Buts marqués ; Passes décisives | Périodes jouées ; Score de ton équipe (points) ; Score adverse (points) |
| Cycle polo (cycle_polo) | jeux montés | Temps de jeu effectif (min) ; Buts marqués ; Passes décisives | Périodes jouées ; Score de ton équipe (points) ; Score adverse (points) |
| Vélo (cycling) | cyclisme | Cadence moyenne (tr/min) ; Puissance moyenne (W) ; Dénivelé négatif (m) | Fréquence cardiaque moyenne (bpm) ; Terrain ; Puissance maximale (W) |
| Vélo d’intérieur (cycling_indoor) | cyclisme intérieur | Cadence moyenne (tr/min) ; Puissance moyenne (W) ; Fréquence cardiaque moyenne (bpm) | Résistance machine |
| Cyclisme sur route (cycling_road) | cyclisme | Cadence moyenne (tr/min) ; Puissance moyenne (W) ; Dénivelé négatif (m) | Fréquence cardiaque moyenne (bpm) ; Terrain ; Puissance maximale (W) |
| Cyclisme sur piste (cycling_track) | piste | Tours de piste ; Meilleur tour (s) ; Puissance moyenne (W) | Cadence moyenne (tr/min) ; Épreuve |
| Cyclo-cross (cyclocross) | cyclisme | Cadence moyenne (tr/min) ; Puissance moyenne (W) ; Dénivelé négatif (m) | Fréquence cardiaque moyenne (bpm) ; Terrain ; Puissance maximale (W) |
| Danse (dance) | danse | Enchaînements travaillés ; Pas / figures travaillés ; Travail | Temps de pratique active (min) |
| Fléchettes (darts) | fléchettes | Manches jouées ; Moyenne sur trois fléchettes (points) ; Taux de finition (%) |  |
| Dips (dips) | poids du corps | Repos moyen entre séries (s) ; Meilleur maintien (s) ; Aide | Lest (kg) |
| Disc golf (disc_golf) | golf | Trous joués ; Coups / lancers ; Putts | Pénalités |
| Plongée (diving) | plongée sous-marine | Profondeur maximale (m) ; Temps de fond (min) ; Immersions | Milieu |
| Dodgeball (dodgeball) | jeux collectifs | Temps de jeu effectif (min) ; Points marqués ; Défenses réussies | Score de ton équipe (points) ; Score adverse (points) |
| Bateau-dragon (dragon_boat) | rame et pagaie | Cadence de coups (coups/min) ; Séries réalisées ; Fréquence cardiaque moyenne (bpm) | Plan d’eau ; Puissance moyenne (W) |
| Dressage (dressage) | dressage | Figures / reprises travaillées ; Note de reprise (%) ; Travail |  |
| Duathlon (duathlon) | multisport | Distance courue (km) ; Distance nagée (m) ; Distance à vélo (km) | Temps de transition (s) ; Obstacles franchis |
| Vélo elliptique (elliptical) | conditionnement | Rounds travaillés ; Temps de travail actif (min) ; Repos moyen (s) | Répétitions ; Fréquence cardiaque moyenne (bpm) |
| Équitation (equestrian) | équitation | Travail ; Obstacles franchis ; Points de pénalité (points) | Temps au galop (min) ; Hauteur maximale (cm) |
| Concours complet (eventing) | concours complet | Phase ; Obstacles franchis ; Points de pénalité (points) | Pénalités de temps (points) |
| Marche du fermier (farmers_walk) | portés | Charge par main (kg) ; Distance portée (m) ; Passages | Repos (s) |
| Course en montagne (fell_running) | montagne | Dénivelé négatif (m) ; Poids du sac (kg) ; Fréquence cardiaque moyenne (bpm) | Terrain ; Altitude maximale (m) |
| Escrime (fencing) | armes | Combats / oppositions ; Victoires ; Touches marquées | Touches reçues ; Travail |
| Hockey sur gazon (field_hockey) | sports collectifs à buts | Temps de jeu effectif (min) ; Buts marqués ; Passes décisives | Tirs ; Arrêts ; Score de ton équipe (points) ; Score adverse (points) |
| Patinage artistique (figure_skating) | patinage artistique | Enchaînements travaillés ; Sauts réussis ; Pirouettes | Chutes |
| Nage avec palmes (finswimming) | natation | Nage ; Séries réalisées ; Fréquence de bras (cycles/min) | SWOLF mesuré ; Fréquence cardiaque moyenne (bpm) |
| Cours collectif (fitness_class) | conditionnement | Rounds travaillés ; Temps de travail actif (min) ; Repos moyen (s) | Répétitions ; Fréquence cardiaque moyenne (bpm) |
| Flag football (flag_football) | football américain | Temps de jeu effectif (min) ; Touchdowns ; Yards gagnés (yd) | Plaquages / flags ; Interceptions ; Score de ton équipe (points) ; Score adverse (points) |
| Floorball (floorball) | sports collectifs à buts | Temps de jeu effectif (min) ; Buts marqués ; Passes décisives | Tirs ; Arrêts ; Score de ton équipe (points) ; Score adverse (points) |
| Football (football) | football | Poste ; Temps de jeu effectif (min) ; Buts marqués | Passes décisives ; Arrêts ; Tirs ; Score de ton équipe (points) ; Score adverse (points) |
| Apnée (freediving) | apnée | Discipline ; Profondeur maximale (m) ; Meilleure apnée (s) | Distance dynamique (m) |
| Ski freestyle (freestyle_skiing) | ski et snowboard | Descentes ; Dénivelé descendu (m) ; Neige | Figures réussies |
| Lutte libre (freestyle_wrestling) | préhension | Combats / oppositions ; Victoires ; Projections / amenées au sol | Sorties de contrôle ; Soumissions réussies ; Durée d’un round (s) |
| Futnet (futnet) | jeux au filet | Sets gagnés ; Sets perdus ; Attaques gagnantes | Services gagnants ; Contres ; Fautes |
| Futsal (futsal) | football | Poste ; Temps de jeu effectif (min) ; Buts marqués | Passes décisives ; Arrêts ; Tirs ; Score de ton équipe (points) ; Score adverse (points) |
| Football gaélique (gaelic_football) | jeux gaéliques et australiens | Temps de jeu effectif (min) ; Buts marqués ; Points marqués | Duels défensifs gagnés ; Score de ton équipe (points) ; Score adverse (points) |
| Goalball (goalball) | jeux collectifs | Temps de jeu effectif (min) ; Points marqués ; Défenses réussies | Score de ton équipe (points) ; Score adverse (points) |
| Golf (golf) | golf | Trous joués ; Coups / lancers ; Putts | Pénalités |
| Grappling (grappling) | préhension | Combats / oppositions ; Victoires ; Projections / amenées au sol | Sorties de contrôle ; Soumissions réussies ; Durée d’un round (s) |
| Gravel (gravel) | cyclisme | Cadence moyenne (tr/min) ; Puissance moyenne (W) ; Dénivelé négatif (m) | Fréquence cardiaque moyenne (bpm) ; Terrain ; Puissance maximale (W) |
| Lutte gréco-romaine (greco_roman_wrestling) | préhension | Combats / oppositions ; Victoires ; Projections / amenées au sol | Sorties de contrôle ; Soumissions réussies ; Durée d’un round (s) |
| Grip sport (grip_sport) | préhension | Épreuve ; Essais ; Charge maximale (kg) | Meilleur maintien (s) |
| Gymnastique (gymnastics) | gymnastique | Agrès / spécialité ; Enchaînements travaillés ; Réceptions maîtrisées | Chutes / pertes d’engin |
| Handball (handball) | handball | Temps de jeu effectif (min) ; Buts marqués ; Tirs | Arrêts ; Passes décisives ; Score de ton équipe (points) ; Score adverse (points) |
| Handbike (handbike) | cyclisme | Cadence moyenne (tr/min) ; Puissance moyenne (W) ; Dénivelé négatif (m) | Fréquence cardiaque moyenne (bpm) ; Terrain ; Puissance maximale (W) |
| Hapkido (hapkido) | arts martiaux | Techniques travaillées ; Rounds travaillés ; Travail | Enchaînements travaillés ; Durée d’un round (s) |
| Highland games (highland_games) | force spécifique | Épreuve ; Essais ; Charge maximale (kg) | Distance de l’épreuve (m) ; Meilleur maintien (s) |
| HIIT (hiit) | conditionnement | Rounds travaillés ; Temps de travail actif (min) ; Repos moyen (s) | Répétitions ; Fréquence cardiaque moyenne (bpm) |
| Randonnée (hiking) | montagne | Dénivelé négatif (m) ; Poids du sac (kg) ; Fréquence cardiaque moyenne (bpm) | Terrain ; Altitude maximale (m) |
| Hip-hop (hiphop) | danse | Enchaînements travaillés ; Pas / figures travaillés ; Travail | Temps de pratique active (min) |
| Course hippique (horse_racing) | courses hippiques | Courses / galops travaillés ; Distance de course (m) ; Position finale | Meilleur temps (s) |
| Course de haies (hurdles) | vitesse | Courses réalisées ; Distance d’une répétition (m) ; Meilleur temps (s) | Repos entre courses (s) |
| Hurling (hurling) | jeux gaéliques et australiens | Temps de jeu effectif (min) ; Buts marqués ; Points marqués | Duels défensifs gagnés ; Score de ton équipe (points) ; Score adverse (points) |
| Hyrox (hyrox) | conditionnement | Rounds travaillés ; Temps de travail actif (min) ; Repos moyen (s) | Répétitions ; Fréquence cardiaque moyenne (bpm) |
| Cascade de glace (ice_climbing) | escalade | Essais ; Blocs / voies réussis ; Réussites au premier essai | Longueurs grimpées ; Marche d’approche (min) |
| Hockey sur glace (ice_hockey) | sports collectifs à buts | Temps de jeu effectif (min) ; Buts marqués ; Passes décisives | Tirs ; Arrêts ; Score de ton équipe (points) ; Score adverse (points) |
| Patinage sur glace (ice_skating) | patinage | Tours ; Meilleur tour (s) ; Fractions | Fréquence cardiaque moyenne (bpm) |
| Roller hockey (inline_hockey) | sports collectifs à buts | Temps de jeu effectif (min) ; Buts marqués ; Passes décisives | Tirs ; Arrêts ; Score de ton équipe (points) ; Score adverse (points) |
| Roller de vitesse (inline_speed_skating) | patinage | Tours ; Meilleur tour (s) ; Fractions | Fréquence cardiaque moyenne (bpm) |
| Judo (judo) | préhension | Combats / oppositions ; Victoires ; Projections / amenées au sol | Sorties de contrôle ; Soumissions réussies ; Durée d’un round (s) |
| Kabaddi (kabaddi) | jeux collectifs | Temps de jeu effectif (min) ; Points marqués ; Défenses réussies | Score de ton équipe (points) ; Score adverse (points) |
| Karaté (karate) | arts martiaux | Techniques travaillées ; Rounds travaillés ; Travail | Enchaînements travaillés ; Durée d’un round (s) |
| Karting (karting) | sports mécaniques | Tours ; Meilleur tour (s) ; Session | Position finale |
| Kayak (kayak) | rame et pagaie | Cadence de coups (coups/min) ; Séries réalisées ; Fréquence cardiaque moyenne (bpm) | Plan d’eau ; Puissance moyenne (W) |
| Kendo (kendo) | armes | Combats / oppositions ; Victoires ; Touches marquées | Touches reçues ; Travail |
| Kettlebell (kettlebell) | musculation | Repos moyen entre séries (s) ; Objectif de séance ; Séries d’échauffement | Tempo d’une répétition (s) |
| Kho kho (kho_kho) | jeux collectifs | Temps de jeu effectif (min) ; Points marqués ; Défenses réussies | Score de ton équipe (points) ; Score adverse (points) |
| Kickboxing (kickboxing) | boxe | Rounds travaillés ; Durée d’un round (s) ; Travail | Combinaisons travaillées ; Fréquence cardiaque moyenne (bpm) |
| Kitesurf (kitesurf) | voile | Vent moyen (nds) ; Distance nautique (NM) ; Manœuvres réussies | Temps en glisse (min) |
| Korfball (korfball) | basket et paniers | Temps de jeu effectif (min) ; Points marqués ; Rebonds | Passes décisives ; Interceptions ; Balles perdues ; Score de ton équipe (points) ; Score adverse (points) |
| Krav-maga (krav_maga) | arts martiaux | Techniques travaillées ; Rounds travaillés ; Travail | Enchaînements travaillés ; Durée d’un round (s) |
| Kung-fu (kung_fu) | arts martiaux | Techniques travaillées ; Rounds travaillés ; Travail | Enchaînements travaillés ; Durée d’un round (s) |
| Lacrosse (lacrosse) | sports collectifs à buts | Temps de jeu effectif (min) ; Buts marqués ; Passes décisives | Tirs ; Arrêts ; Score de ton équipe (points) ; Score adverse (points) |
| Lacrosse sixes (lacrosse_sixes) | sports collectifs à buts | Temps de jeu effectif (min) ; Buts marqués ; Passes décisives | Tirs ; Arrêts ; Score de ton équipe (points) ; Score adverse (points) |
| Sauvetage sportif (lifesaving_sport) | sauvetage sportif | Épreuve ; Distance nagée (m) ; Distance de remorquage (m) | Répétitions |
| Luge (luge) | glisse sur piste | Descentes ; Meilleure descente (s) ; Temps de départ (s) |  |
| MMA (mma) | MMA | Rounds travaillés ; Durée d’un round (s) ; Travail | Amenées au sol ; Soumissions réussies |
| Pentathlon moderne (modern_pentathlon) | pentathlon | Distance courue (km) ; Distance nagée (m) ; Assauts d’escrime | Cibles touchées ; Temps sur obstacles (s) |
| Motocross (motocross) | sports mécaniques | Tours ; Meilleur tour (s) ; Session | Position finale |
| VTT (mountain_bike) | cyclisme | Cadence moyenne (tr/min) ; Puissance moyenne (W) ; Dénivelé négatif (m) | Fréquence cardiaque moyenne (bpm) ; Terrain ; Puissance maximale (W) |
| Musculation (muscu_builder) | musculation | Repos moyen entre séries (s) ; Objectif de séance ; Séries d’échauffement | Tempo d’une répétition (s) |
| Musculation en salle (muscu_gym) | musculation | Repos moyen entre séries (s) ; Objectif de séance ; Séries d’échauffement | Tempo d’une répétition (s) |
| Musculation à la maison (muscu_home) | musculation | Repos moyen entre séries (s) ; Objectif de séance ; Séries d’échauffement | Tempo d’une répétition (s) |
| Netball (netball) | basket et paniers | Temps de jeu effectif (min) ; Points marqués ; Rebonds | Passes décisives ; Interceptions ; Balles perdues ; Score de ton équipe (points) ; Score adverse (points) |
| Combiné nordique (nordic_combined) | combiné nordique | Distance skiée (km) ; Sauts réalisés ; Meilleur saut (m) | Note de style (points) |
| Marche nordique (nordic_walk) | course et marche | Cadence de pas (pas/min) ; Fréquence cardiaque moyenne (bpm) ; Fractions réalisées | Temps des fractions (min) ; Récupération entre fractions (min) |
| Course à obstacles (obstacle_course) | course à obstacles | Obstacles franchis ; Obstacles non franchis ; Distance de portage (m) | Dénivelé positif (m) ; Fréquence cardiaque moyenne (bpm) |
| Nage en eau libre (open_water_swimming) | natation | Nage ; Séries réalisées ; Fréquence de bras (cycles/min) | SWOLF mesuré ; Fréquence cardiaque moyenne (bpm) |
| Course d’orientation (orienteering) | orientation | Balises trouvées ; Balises manquées ; Erreurs de navigation | Dénivelé positif (m) ; Fréquence cardiaque moyenne (bpm) |
| Pirogue va’a (outrigger_canoe) | rame et pagaie | Cadence de coups (coups/min) ; Séries réalisées ; Fréquence cardiaque moyenne (bpm) | Plan d’eau ; Puissance moyenne (W) |
| Paddle (paddle) | rame et pagaie | Cadence de coups (coups/min) ; Séries réalisées ; Fréquence cardiaque moyenne (bpm) | Plan d’eau ; Puissance moyenne (W) |
| Padel (padel) | tennis | Sets gagnés ; Sets perdus ; Aces | Doubles fautes ; Fautes directes ; Premières balles (%) |
| Para-athlétisme (para_athletics) | athlétisme | Discipline ; Essais / répétitions ; Meilleure distance (m) | Meilleur temps (s) |
| Para-cyclisme (para_cycling) | cyclisme | Cadence moyenne (tr/min) ; Puissance moyenne (W) ; Dénivelé négatif (m) | Fréquence cardiaque moyenne (bpm) ; Terrain ; Puissance maximale (W) |
| Para powerlifting (para_powerlifting) | musculation | Repos moyen entre séries (s) ; Objectif de séance ; Séries d’échauffement | Tempo d’une répétition (s) |
| Para-natation (para_swimming) | natation | Nage ; Séries réalisées ; Fréquence de bras (cycles/min) | SWOLF mesuré ; Fréquence cardiaque moyenne (bpm) |
| Parapente (paragliding) | sports aériens | Vols / sauts ; Temps en vol (min) ; Altitude maximale (m) | Atterrissages maîtrisés |
| Parkour (parkour) | franchissement | Figures / franchissements réussis ; Tentatives ; Réceptions maîtrisées | Enchaînements complets |
| Pétanque (petanque) | boules | Mènes jouées ; Points réussis ; Tirs réussis | Score de ton équipe (points) ; Score adverse (points) |
| Pickleball (pickleball) | raquettes | Sets gagnés ; Sets perdus ; Points gagnants | Fautes directes ; Échanges joués |
| Pilates (pilates) | mobilité | Zone / travail ; Mouvements travaillés ; Durée des maintiens (s) | Matériel |
| Gainage (plank) | poids du corps | Repos moyen entre séries (s) ; Meilleur maintien (s) ; Aide | Lest (kg) |
| Platform tennis (platform_tennis) | tennis | Sets gagnés ; Sets perdus ; Aces | Doubles fautes ; Fautes directes ; Premières balles (%) |
| Pole dance (pole_dance) | danse | Enchaînements travaillés ; Pas / figures travaillés ; Travail | Temps de pratique active (min) |
| Polo (polo) | jeux montés | Temps de jeu effectif (min) ; Buts marqués ; Passes décisives | Périodes jouées ; Score de ton équipe (points) ; Score adverse (points) |
| Pompes (pompes) | poids du corps | Repos moyen entre séries (s) ; Meilleur maintien (s) ; Aide | Lest (kg) |
| Force athlétique (powerlifting) | musculation | Repos moyen entre séries (s) ; Objectif de séance ; Séries d’échauffement | Tempo d’une répétition (s) |
| Qi Gong (qigong) | mobilité | Zone / travail ; Mouvements travaillés ; Durée des maintiens (s) | Matériel |
| Marche athlétique (race_walking) | course et marche | Cadence de pas (pas/min) ; Fréquence cardiaque moyenne (bpm) ; Fractions réalisées | Temps des fractions (min) ; Récupération entre fractions (min) |
| Racketlon (racketlon) | raquettes | Sets gagnés ; Sets perdus ; Points gagnants | Fautes directes ; Échanges joués |
| Racquetball (racquetball) | raquettes | Sets gagnés ; Sets perdus ; Points gagnants | Fautes directes ; Échanges joués |
| Rafting (rafting) | eau vive | Rapides / passages ; Portes franchies ; Pénalités (s) | Difficulté |
| Jeu de paume (real_tennis) | tennis | Sets gagnés ; Sets perdus ; Aces | Doubles fautes ; Fautes directes ; Premières balles (%) |
| Gym rythmique (rhythmic_gymnastics) | gymnastique | Agrès / spécialité ; Enchaînements travaillés ; Réceptions maîtrisées | Chutes / pertes d’engin |
| Ringette (ringette) | sports collectifs à buts | Temps de jeu effectif (min) ; Buts marqués ; Passes décisives | Tirs ; Arrêts ; Score de ton équipe (points) ; Score adverse (points) |
| Rogaining (rogaining) | orientation | Balises trouvées ; Balises manquées ; Erreurs de navigation | Dénivelé positif (m) ; Fréquence cardiaque moyenne (bpm) |
| Roller (roller) | patinage | Tours ; Meilleur tour (s) ; Fractions | Fréquence cardiaque moyenne (bpm) |
| Roller derby (roller_derby) | roller derby | Jams joués ; Points marqués ; Pénalités | Temps de jeu effectif (min) |
| Ski-roues (roller_ski) | ski endurance | Dénivelé positif (m) ; Dénivelé négatif (m) ; Fréquence cardiaque moyenne (bpm) | Technique |
| Corde à sauter (rope_jump) | conditionnement | Rounds travaillés ; Temps de travail actif (min) ; Repos moyen (s) | Répétitions ; Fréquence cardiaque moyenne (bpm) |
| Aviron (rowing) | rame et pagaie | Cadence de coups (coups/min) ; Séries réalisées ; Fréquence cardiaque moyenne (bpm) | Plan d’eau ; Puissance moyenne (W) |
| Rameur (rowing_machine) | rame et pagaie | Cadence de coups (coups/min) ; Séries réalisées ; Fréquence cardiaque moyenne (bpm) | Plan d’eau ; Puissance moyenne (W) |
| Rucking (rucking) | montagne | Dénivelé négatif (m) ; Poids du sac (kg) ; Fréquence cardiaque moyenne (bpm) | Terrain ; Altitude maximale (m) |
| Rugby (rugby) | rugby | Temps de jeu effectif (min) ; Essais marqués ; Plaquages | Transformations ; Score de ton équipe (points) ; Score adverse (points) |
| Rugby à 7 (rugby_sevens) | rugby | Temps de jeu effectif (min) ; Essais marqués ; Plaquages | Transformations ; Score de ton équipe (points) ; Score adverse (points) |
| Course à pied (running) | course et marche | Cadence de pas (pas/min) ; Fréquence cardiaque moyenne (bpm) ; Fractions réalisées | Temps des fractions (min) ; Récupération entre fractions (min) |
| Voile (sailing) | voile | Vent moyen (nds) ; Distance nautique (NM) ; Manœuvres réussies | Temps en glisse (min) |
| Danses latines (salsa) | danse | Enchaînements travaillés ; Pas / figures travaillés ; Travail | Temps de pratique active (min) |
| Sambo (sambo) | préhension | Combats / oppositions ; Victoires ; Projections / amenées au sol | Sorties de contrôle ; Soumissions réussies ; Durée d’un round (s) |
| Sac de sable (sandbag) | musculation | Repos moyen entre séries (s) ; Objectif de séance ; Séries d’échauffement | Tempo d’une répétition (s) |
| Savate boxe française (savate) | boxe | Rounds travaillés ; Durée d’un round (s) ; Travail | Combinaisons travaillées ; Fréquence cardiaque moyenne (bpm) |
| Sepak takraw (sepak_takraw) | jeux au filet | Sets gagnés ; Sets perdus ; Attaques gagnantes | Services gagnants ; Contres ; Fautes |
| Tir sportif (shooting) | tir sportif | Tirs effectués ; Distance de tir (m) ; Score de la série (points) | Position |
| Short track (short_track_speed_skating) | patinage | Tours ; Meilleur tour (s) ; Fractions | Fréquence cardiaque moyenne (bpm) |
| Saut d’obstacles (show_jumping) | saut d’obstacles | Obstacles franchis ; Points de pénalité (points) ; Hauteur maximale (cm) | Parcours effectués |
| Volley assis (sitting_volleyball) | jeux au filet | Sets gagnés ; Sets perdus ; Attaques gagnantes | Services gagnants ; Contres ; Fautes |
| Skateboard (skateboarding) | franchissement | Figures / franchissements réussis ; Tentatives ; Réceptions maîtrisées | Enchaînements complets |
| Skeleton (skeleton) | glisse sur piste | Descentes ; Meilleure descente (s) ; Temps de départ (s) |  |
| Saut à ski (ski_jumping) | saut à ski | Sauts réalisés ; Meilleur saut (m) ; Note de style (points) |  |
| Ski alpinisme (ski_mountaineering) | ski de randonnée | Dénivelé positif (m) ; Dénivelé négatif (m) ; Poids du sac (kg) | Neige ; Fréquence cardiaque moyenne (bpm) |
| Orientation à ski (ski_orienteering) | orientation | Balises trouvées ; Balises manquées ; Erreurs de navigation | Dénivelé positif (m) ; Fréquence cardiaque moyenne (bpm) |
| Ski de randonnée (ski_touring) | ski de randonnée | Dénivelé positif (m) ; Dénivelé négatif (m) ; Poids du sac (kg) | Neige ; Fréquence cardiaque moyenne (bpm) |
| Skimboard (skimboarding) | surf | Vagues prises ; Taille des vagues (m) ; Glisses réussies | Figures réussies |
| Parachutisme (skydiving) | sports aériens | Vols / sauts ; Temps en vol (min) ; Altitude maximale (m) | Atterrissages maîtrisés |
| Snooker (snooker) | billard | Manches jouées ; Manches gagnées ; Meilleure série (points) | Coups de défense |
| Snorkeling (snorkeling) | randonnée aquatique | Milieu ; Distance observée (m) ; Profondeur maximale (m) |  |
| Snowboard (snowboard) | ski et snowboard | Descentes ; Dénivelé descendu (m) ; Neige | Figures réussies |
| Raquettes (snowshoeing) | montagne | Dénivelé négatif (m) ; Poids du sac (kg) ; Fréquence cardiaque moyenne (bpm) | Terrain ; Altitude maximale (m) |
| Softball (softball) | baseball | Manches jouées ; Coups sûrs ; Points marqués | Passages à la batte ; Retraits sur prises |
| Patinage de vitesse (speed_skating) | patinage | Tours ; Meilleur tour (s) ; Fractions | Fréquence cardiaque moyenne (bpm) |
| Kilomètre lancé (speed_skiing) | ski vitesse | Runs ; Vitesse maximale mesurée (km/h) ; Longueur de la piste (m) |  |
| Spinning (spinning) | cyclisme intérieur | Cadence moyenne (tr/min) ; Puissance moyenne (W) ; Fréquence cardiaque moyenne (bpm) | Résistance machine |
| Escalade sportive (sport_climbing) | escalade | Essais ; Blocs / voies réussis ; Réussites au premier essai | Longueurs grimpées ; Marche d’approche (min) |
| Plongeon (springboard_diving) | plongeon | Plongeons ; Hauteur du plongeoir ; Note moyenne (/10) |  |
| Fractionné (sprint) | vitesse | Courses réalisées ; Distance d’une répétition (m) ; Meilleur temps (s) | Repos entre courses (s) |
| Squash (squash) | raquettes | Sets gagnés ; Sets perdus ; Points gagnants | Fautes directes ; Échanges joués |
| Squats au poids du corps (squat) | poids du corps | Repos moyen entre séries (s) ; Meilleur maintien (s) ; Aide | Lest (kg) |
| Montée d’escaliers (stair_climbing) | conditionnement | Rounds travaillés ; Temps de travail actif (min) ; Repos moyen (s) | Répétitions ; Fréquence cardiaque moyenne (bpm) |
| Street workout (street_workout) | poids du corps | Repos moyen entre séries (s) ; Meilleur maintien (s) ; Aide | Lest (kg) |
| Stretching (stretching) | mobilité | Zone / travail ; Mouvements travaillés ; Durée des maintiens (s) | Matériel |
| Strongman (strongman) | force spécifique | Épreuve ; Essais ; Charge maximale (kg) | Distance de l’épreuve (m) ; Meilleur maintien (s) |
| Sumo (sumo) | préhension | Combats / oppositions ; Victoires ; Projections / amenées au sol | Sorties de contrôle ; Soumissions réussies ; Durée d’un round (s) |
| Surf (surfing) | surf | Vagues prises ; Taille des vagues (m) ; Glisses réussies | Figures réussies |
| Surfski (surfski) | rame et pagaie | Cadence de coups (coups/min) ; Séries réalisées ; Fréquence cardiaque moyenne (bpm) | Plan d’eau ; Puissance moyenne (W) |
| Natation (swimming) | natation | Nage ; Séries réalisées ; Fréquence de bras (cycles/min) | SWOLF mesuré ; Fréquence cardiaque moyenne (bpm) |
| Swimrun (swimrun) | multisport | Distance courue (km) ; Distance nagée (m) ; Distance à vélo (km) | Temps de transition (s) ; Obstacles franchis |
| Tennis de table (table_tennis) | raquettes | Sets gagnés ; Sets perdus ; Points gagnants | Fautes directes ; Échanges joués |
| Taekwondo (taekwondo) | arts martiaux | Techniques travaillées ; Rounds travaillés ; Travail | Enchaînements travaillés ; Durée d’un round (s) |
| Tai Chi (taichi) | mobilité | Zone / travail ; Mouvements travaillés ; Durée des maintiens (s) | Matériel |
| Tchoukball (tchoukball) | handball | Temps de jeu effectif (min) ; Buts marqués ; Tirs | Arrêts ; Passes décisives ; Score de ton équipe (points) ; Score adverse (points) |
| Ski télémark (telemark_skiing) | ski et snowboard | Descentes ; Dénivelé descendu (m) ; Neige | Figures réussies |
| Tennis (tennis) | tennis | Sets gagnés ; Sets perdus ; Aces | Doubles fautes ; Fautes directes ; Premières balles (%) |
| Boxe thaï (thaiboxing) | boxe | Rounds travaillés ; Durée d’un round (s) ; Travail | Combinaisons travaillées ; Fréquence cardiaque moyenne (bpm) |
| Tractions (tractions) | poids du corps | Repos moyen entre séries (s) ; Meilleur maintien (s) ; Aide | Lest (kg) |
| Trail (trail) | montagne | Dénivelé négatif (m) ; Poids du sac (kg) ; Fréquence cardiaque moyenne (bpm) | Terrain ; Altitude maximale (m) |
| Trampoline (trampoline_gymnastics) | gymnastique | Agrès / spécialité ; Enchaînements travaillés ; Réceptions maîtrisées | Chutes / pertes d’engin |
| Tapis de course (treadmill) | course et marche | Cadence de pas (pas/min) ; Fréquence cardiaque moyenne (bpm) ; Fractions réalisées | Temps des fractions (min) ; Récupération entre fractions (min) |
| Trek (trekking) | montagne | Dénivelé négatif (m) ; Poids du sac (kg) ; Fréquence cardiaque moyenne (bpm) | Terrain ; Altitude maximale (m) |
| Triathlon (triathlon) | multisport | Distance courue (km) ; Distance nagée (m) ; Distance à vélo (km) | Temps de transition (s) ; Obstacles franchis |
| TRX (trx) | musculation | Repos moyen entre séries (s) ; Objectif de séance ; Séries d’échauffement | Tempo d’une répétition (s) |
| Tir à la corde (tug_of_war) | tir à la corde | Tirages ; Tirages gagnés ; Taille de ton équipe | Durée moyenne du tirage (s) |
| Ultimate (ultimate) | ultimate | Temps de jeu effectif (min) ; Points marqués ; Passes décisives | Pertes de disque ; Score de ton équipe (points) ; Score adverse (points) |
| Hockey subaquatique (underwater_hockey) | sports collectifs à buts | Temps de jeu effectif (min) ; Buts marqués ; Passes décisives | Tirs ; Arrêts ; Score de ton équipe (points) ; Score adverse (points) |
| Rugby subaquatique (underwater_rugby) | sports collectifs à buts | Temps de jeu effectif (min) ; Buts marqués ; Passes décisives | Tirs ; Arrêts ; Score de ton équipe (points) ; Score adverse (points) |
| Vélotaf (velotaf) | cyclisme | Cadence moyenne (tr/min) ; Puissance moyenne (W) ; Dénivelé négatif (m) | Fréquence cardiaque moyenne (bpm) ; Terrain ; Puissance maximale (W) |
| Via ferrata (via_ferrata) | escalade | Essais ; Blocs / voies réussis ; Réussites au premier essai | Longueurs grimpées ; Marche d’approche (min) |
| Volleyball (volleyball) | jeux au filet | Sets gagnés ; Sets perdus ; Attaques gagnantes | Services gagnants ; Contres ; Fautes |
| Wakeboard (wakeboard) | glisse tractée | Passages ; Figures / portes réussies ; Chutes | Vitesse de traction (km/h) |
| Marche (walking) | course et marche | Cadence de pas (pas/min) ; Fréquence cardiaque moyenne (bpm) ; Fractions réalisées | Temps des fractions (min) ; Récupération entre fractions (min) |
| Water-polo (water_polo) | sports collectifs à buts | Temps de jeu effectif (min) ; Buts marqués ; Passes décisives | Tirs ; Arrêts ; Score de ton équipe (points) ; Score adverse (points) |
| Ski nautique (water_skiing) | glisse tractée | Passages ; Figures / portes réussies ; Chutes | Vitesse de traction (km/h) |
| Haltérophilie (weightlifting) | musculation | Repos moyen entre séries (s) ; Objectif de séance ; Séries d’échauffement | Tempo d’une répétition (s) |
| Basket fauteuil (wheelchair_basketball) | basket et paniers | Temps de jeu effectif (min) ; Points marqués ; Rebonds | Passes décisives ; Interceptions ; Balles perdues ; Score de ton équipe (points) ; Score adverse (points) |
| Rugby fauteuil (wheelchair_rugby) | rugby | Temps de jeu effectif (min) ; Essais marqués ; Plaquages | Transformations ; Score de ton équipe (points) ; Score adverse (points) |
| Tennis fauteuil (wheelchair_tennis) | tennis | Sets gagnés ; Sets perdus ; Aces | Doubles fautes ; Fautes directes ; Premières balles (%) |
| Planche à voile (windsurf) | voile | Vent moyen (nds) ; Distance nautique (NM) ; Manœuvres réussies | Temps en glisse (min) |
| Lutte (wrestling) | préhension | Combats / oppositions ; Victoires ; Projections / amenées au sol | Sorties de contrôle ; Soumissions réussies ; Durée d’un round (s) |
| Wushu (wushu) | arts martiaux | Techniques travaillées ; Rounds travaillés ; Travail | Enchaînements travaillés ; Durée d’un round (s) |
| Yoga (yoga) | yoga | Style ; Postures travaillées ; Travail respiratoire (min) | Zone travaillée |
| Mobilité (yoga_mobility) | mobilité | Zone / travail ; Mouvements travaillés ; Durée des maintiens (s) | Matériel |
| Zumba (zumba) | danse | Enchaînements travaillés ; Pas / figures travaillés ; Travail | Temps de pratique active (min) |
