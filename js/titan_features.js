/* =========================================
   TITAN OS - SPORT/RPG FEATURE CORE
   Local-first helpers. No server authority here.
   ========================================= */

(function() {
    const DAY_MS = 24 * 60 * 60 * 1000;
    const NOTE_LIMIT_STD = 180;
    const NOTE_LIMIT_ELITE = 600;
    const TAGS = {
        technique: { label: 'Technique', icon: 'ri-compass-3-line', load: 0.85 },
        endurance: { label: 'Endurance', icon: 'ri-road-map-line', load: 1 },
        force: { label: 'Force', icon: 'ri-armchair-line', load: 1.1 },
        recovery: { label: 'Recuperation', icon: 'ri-heart-pulse-line', load: 0.45 },
        test: { label: 'Test', icon: 'ri-speed-up-line', load: 1.2 },
        competition: { label: 'Competition', icon: 'ri-medal-line', load: 1.25 }
    };

    function catalogSport({ label, unit = 'min', xp = 8, cat = 'team', icon = 'ri-flashlight-line', formType = 'duration', balanceProfile = 'generic', official = '', group = '', programs = [], aliases = [], graphs = [], headline = '' }) {
        return {
            label,
            unit,
            xp,
            cat,
            icon,
            formType,
            balanceProfile,
            trackingSummary: {
                headline: headline || `${label}: duree, intensite et donnees propres a la discipline.`,
                graphs,
                aliases,
                programs,
                officialLabel: official || label,
                disciplineGroup: group || cat
            }
        };
    }

    const INNOVATION_SPORTS = {
        padel: { label: 'Padel', unit: 'min', xp: 8, cat: 'team', icon: 'ri-ping-pong-line', formType: 'duration', balanceProfile: 'racket' },
        basketball: { label: 'Basketball', unit: 'min', xp: 8, cat: 'team', icon: 'ri-basketball-line', formType: 'duration', balanceProfile: 'team' },
        volleyball: { label: 'Volleyball', unit: 'min', xp: 7, cat: 'team', icon: 'ri-volleyball-line', formType: 'duration', balanceProfile: 'team' },
        cricket: { label: 'Cricket', unit: 'min', xp: 7, cat: 'team', icon: 'ri-baseball-line', formType: 'duration', balanceProfile: 'team' },
        dance: { label: 'Danse', unit: 'min', xp: 6, cat: 'mobility', icon: 'ri-music-2-line', formType: 'duration', balanceProfile: 'skill' },
        pickleball: { label: 'Pickleball', unit: 'min', xp: 7, cat: 'team', icon: 'ri-ping-pong-line', formType: 'duration', balanceProfile: 'racket' },
        gravel: { label: 'Gravel', unit: 'km', xp: 12, cat: 'outdoor', icon: 'ri-riding-line', formType: 'gps', balanceProfile: 'cycling' },
        ski_touring: { label: 'Ski rando', unit: 'km', xp: 13, cat: 'outdoor', icon: 'ri-mountain-line', formType: 'gps', balanceProfile: 'glide' },
        trekking: { label: 'Randonnee longue', unit: 'km', xp: 10, cat: 'outdoor', icon: 'ri-route-line', formType: 'gps', balanceProfile: 'hiking' },
        bouldering: { label: 'Escalade bloc', unit: 'min', xp: 8, cat: 'skill', icon: 'ri-landscape-line', formType: 'duration', balanceProfile: 'climbing' },
        climbing_route: { label: 'Escalade voie', unit: 'min', xp: 8, cat: 'skill', icon: 'ri-landscape-line', formType: 'duration', balanceProfile: 'climbing' },
        rowing_machine: { label: 'Rameur', unit: 'min', xp: 9, cat: 'cardio', icon: 'ri-ship-line', formType: 'duration', balanceProfile: 'rowing' },
        kayak: { label: 'Kayak', unit: 'km', xp: 10, cat: 'outdoor', icon: 'ri-ship-2-line', formType: 'gps', balanceProfile: 'water' },
        paddle: { label: 'Paddle', unit: 'km', xp: 8, cat: 'outdoor', icon: 'ri-sailboat-line', formType: 'gps', balanceProfile: 'water' },
        yoga_mobility: { label: 'Yoga mobilite', unit: 'min', xp: 5, cat: 'mobility', icon: 'ri-mental-health-line', formType: 'duration', balanceProfile: 'mobility' },
        hiit: { label: 'HIIT', unit: 'min', xp: 9, cat: 'crossfit', icon: 'ri-flashlight-line', formType: 'duration', balanceProfile: 'mixed' },
        hyrox: { label: 'Hyrox', unit: 'min', xp: 10, cat: 'crossfit', icon: 'ri-fire-line', formType: 'duration', balanceProfile: 'mixed' },
        duathlon: { label: 'Duathlon', unit: 'km', xp: 52, cat: 'endurance', icon: 'ri-route-line', formType: 'gps_full', balanceProfile: 'mixed' },
        aquathlon: { label: 'Aquathlon', unit: 'km', xp: 48, cat: 'endurance', icon: 'ri-drop-line', formType: 'gps_simple', balanceProfile: 'mixed' },
        swimrun: { label: 'Swimrun', unit: 'km', xp: 58, cat: 'outdoor', icon: 'ri-route-line', formType: 'gps_full', balanceProfile: 'mixed' },
        obstacle_course: { label: 'Course obstacles', unit: 'km', xp: 65, cat: 'cardio', icon: 'ri-speed-up-line', formType: 'gps_full', balanceProfile: 'mixed' },
        rucking: { label: 'Rucking', unit: 'km', xp: 58, cat: 'outdoor', icon: 'ri-walk-line', formType: 'gps_full', balanceProfile: 'hiking' },
        stair_climbing: { label: 'Montee escaliers', unit: 'min', xp: 12, cat: 'cardio', icon: 'ri-stairs-line', formType: 'duration', balanceProfile: 'speed' },
        handbike: { label: 'Handbike', unit: 'km', xp: 38, cat: 'endurance', icon: 'ri-riding-line', formType: 'gps_full', balanceProfile: 'cycling' },
        wheelchair_basketball: { label: 'Basket fauteuil', unit: 'min', xp: 8, cat: 'team', icon: 'ri-basketball-line', formType: 'duration', balanceProfile: 'team' },
        para_swimming: { label: 'Para natation', unit: 'm', xp: 0.5, cat: 'endurance', icon: 'ri-drop-line', formType: 'duration', balanceProfile: 'swimming' },
        para_athletics: { label: 'Para athletisme', unit: 'min', xp: 10, cat: 'cardio', icon: 'ri-run-line', formType: 'duration', balanceProfile: 'running' },
        dragon_boat: { label: 'Dragon boat', unit: 'km', xp: 45, cat: 'team', icon: 'ri-ship-line', formType: 'gps_full', balanceProfile: 'water' },
        netball: { label: 'Netball', unit: 'min', xp: 8, cat: 'team', icon: 'ri-basketball-line', formType: 'duration', balanceProfile: 'team' },
        korfball: { label: 'Korfball', unit: 'min', xp: 8, cat: 'team', icon: 'ri-team-line', formType: 'duration', balanceProfile: 'team' },
        floorball: { label: 'Floorball', unit: 'min', xp: 10, cat: 'team', icon: 'ri-meteor-line', formType: 'duration', balanceProfile: 'team' },
        inline_hockey: { label: 'Roller hockey', unit: 'min', xp: 11, cat: 'team', icon: 'ri-skateboard-line', formType: 'duration', balanceProfile: 'team' },
        roller_derby: { label: 'Roller derby', unit: 'min', xp: 12, cat: 'team', icon: 'ri-skateboard-line', formType: 'duration', balanceProfile: 'team' },
        lifesaving_sport: { label: 'Sauvetage sportif', unit: 'min', xp: 10, cat: 'mixed', icon: 'ri-lifebuoy-line', formType: 'duration', balanceProfile: 'water' },
        freediving: { label: 'Apnee', unit: 'min', xp: 4, cat: 'skill', icon: 'ri-drop-line', formType: 'duration', balanceProfile: 'water' },
        snorkeling: { label: 'Snorkeling', unit: 'min', xp: 4, cat: 'zen', icon: 'ri-drop-line', formType: 'duration', balanceProfile: 'water' },
        roller_ski: { label: 'Ski-roues', unit: 'km', xp: 55, cat: 'endurance', icon: 'ri-road-map-line', formType: 'gps_full', balanceProfile: 'glide' }
    };

    const OLYMPIC_CATALOG_SPORTS = {
        basketball_3x3: catalogSport({ label: 'Basketball 3x3', cat: 'team', icon: 'ri-basketball-line', balanceProfile: 'team', official: '3x3 Basketball', group: 'Basketball', programs: ['olympic_summer_2028'], aliases: ['3x3', 'streetball'], graphs: ['score_for', 'score_against', 'decisive_actions'], headline: 'Format court: score, roles, actions decisives et pression.' }),
        archery: catalogSport({ label: 'Tir a l arc', xp: 5, cat: 'skill', icon: 'ri-focus-3-line', balanceProfile: 'precision', official: 'Archery', group: 'Precision', programs: ['olympic_summer_2028'], aliases: ['archery', 'arc'], graphs: ['attempts', 'successful_actions', 'accuracy'], headline: 'Precision: vollee, reussites, pourcentage et serie sous pression.' }),
        artistic_gymnastics: catalogSport({ label: 'Gym artistique', cat: 'skill', icon: 'ri-medal-line', balanceProfile: 'skill', official: 'Artistic Gymnastics', group: 'Gymnastics', programs: ['olympic_summer_2028'], aliases: ['gym artistique', 'gymnastique artistique'], graphs: ['combo_count', 'execution_quality', 'successful_actions'], headline: 'Routine, execution, difficultes propres et sequences maitrisees.' }),
        artistic_swimming: catalogSport({ label: 'Natation artistique', xp: 7, cat: 'skill', icon: 'ri-drop-line', balanceProfile: 'swimming', official: 'Artistic Swimming', group: 'Aquatics', programs: ['olympic_summer_2028'], aliases: ['synchronisee', 'synchro'], graphs: ['execution_quality', 'combo_count', 'mobility_work'], headline: 'Synchronisation, routine, souffle, mobilite et qualite technique.' }),
        athletics: catalogSport({ label: 'Athletisme', unit: 'min', xp: 10, cat: 'cardio', icon: 'ri-run-line', balanceProfile: 'running', official: 'Athletics', group: 'Athletics', programs: ['olympic_summer_2028'], aliases: ['track and field', 'piste', 'stade'], graphs: ['intervals', 'avg_hr', 'cadence'], headline: 'Piste, route, sauts ou lancers: intensite, repetitions et qualite.' }),
        badminton: catalogSport({ label: 'Badminton', xp: 8, cat: 'cardio', icon: 'ri-ping-pong-line', balanceProfile: 'racket', official: 'Badminton', group: 'Racket', programs: ['olympic_summer_2028'], aliases: ['bad'], graphs: ['sets_won', 'aces', 'unforced_errors'], headline: 'Raquette rapide: sets, points directs, fautes et qualite des echanges.' }),
        baseball: catalogSport({ label: 'Baseball', xp: 7, cat: 'team', icon: 'ri-baseball-line', balanceProfile: 'team', official: 'Baseball', group: 'Baseball/Softball', programs: ['olympic_summer_2028'], aliases: ['batting', 'pitching'], graphs: ['score_for', 'score_against', 'decisive_actions'], headline: 'Batting, defense, score, presence terrain et actions decisives.' }),
        basketball: catalogSport({ label: 'Basketball', xp: 8, cat: 'team', icon: 'ri-basketball-line', balanceProfile: 'team', official: 'Basketball', group: 'Basketball', programs: ['olympic_summer_2028'], aliases: ['basket'], graphs: ['score_for', 'score_against', 'decisive_actions'], headline: 'Scoring, creation, defense, rebond et pertes sous controle.' }),
        beach_volleyball: catalogSport({ label: 'Beach volley', xp: 8, cat: 'team', icon: 'ri-volleyball-line', balanceProfile: 'team', official: 'Beach Volleyball', group: 'Volleyball', programs: ['olympic_summer_2028'], aliases: ['beach volley', 'volley plage'], graphs: ['score_for', 'score_against', 'decisive_actions'], headline: 'Jeu sur sable: service, reception, attaque, bloc et regularite.' }),
        bmx_freestyle: catalogSport({ label: 'BMX freestyle', xp: 9, cat: 'skill', icon: 'ri-riding-line', balanceProfile: 'glide', official: 'BMX Freestyle', group: 'Cycling', programs: ['olympic_summer_2028'], aliases: ['bmx park'], graphs: ['tricks', 'fall_count', 'execution_quality'], headline: 'Runs, figures propres, amplitude, fluidite et chutes.' }),
        bmx_racing: catalogSport({ label: 'BMX racing', unit: 'min', xp: 10, cat: 'cardio', icon: 'ri-riding-line', balanceProfile: 'cycling', official: 'BMX Racing', group: 'Cycling', programs: ['olympic_summer_2028'], aliases: ['bmx race'], graphs: ['sprints', 'cadence', 'execution_quality'], headline: 'Depart, sprints, tours, technique de piste et explosivite.' }),
        boxing: catalogSport({ label: 'Boxe', xp: 12, cat: 'combat', icon: 'ri-boxing-line', balanceProfile: 'combat', official: 'Boxing', group: 'Combat', programs: ['olympic_summer_2028'], aliases: ['boxe anglaise'], graphs: ['rounds', 'significant_strikes', 'execution_quality'], headline: 'Rounds, technique, sparring, frappes propres et controle.' }),
        canoe_slalom: catalogSport({ label: 'Canoe slalom', unit: 'min', xp: 10, cat: 'skill', icon: 'ri-ship-2-line', balanceProfile: 'water', official: 'Canoe Slalom', group: 'Canoe', programs: ['olympic_summer_2028'], aliases: ['kayak slalom', 'canoe-kayak slalom'], graphs: ['tech_drills', 'falls', 'execution_quality'], headline: 'Portes, eau vive, penalites, technique et autonomie.' }),
        canoe_sprint: catalogSport({ label: 'Canoe sprint', unit: 'km', xp: 35, cat: 'cardio', icon: 'ri-ship-line', formType: 'gps_full', balanceProfile: 'water', official: 'Canoe Sprint', group: 'Canoe', programs: ['olympic_summer_2028'], aliases: ['kayak sprint', 'canoe-kayak sprint'], graphs: ['tech_drills', 'avg_power', 'cadence'], headline: 'Distance, cadence, puissance, technique et tenue d effort.' }),
        sport_climbing: catalogSport({ label: 'Escalade sportive', xp: 8, cat: 'skill', icon: 'ri-landscape-line', balanceProfile: 'climbing', official: 'Climbing', group: 'Sport Climbing', programs: ['olympic_summer_2028'], aliases: ['sport climbing', 'escalade'], graphs: ['attempts', 'successful_routes', 'fall_count'], headline: 'Bloc, voie ou vitesse: essais, niveau, reussites et chutes.' }),
        cricket: catalogSport({ label: 'Cricket', xp: 7, cat: 'team', icon: 'ri-baseball-line', balanceProfile: 'team', official: 'Cricket', group: 'Cricket', programs: ['olympic_summer_2028'], aliases: ['t20'], graphs: ['score_for', 'score_against', 'decisive_actions'], headline: 'Runs, wickets, catches, role et temps de jeu.' }),
        cycling_road: catalogSport({ label: 'Cyclisme route', unit: 'km', xp: 40, cat: 'endurance', icon: 'ri-riding-line', formType: 'gps_full', balanceProfile: 'cycling', official: 'Cycling Road', group: 'Cycling', programs: ['olympic_summer_2028'], aliases: ['velo route', 'road cycling'], graphs: ['avg_power', 'cadence', 'elevation'], headline: 'Distance, D+, puissance, cadence, terrain et duree active.' }),
        cycling_track: catalogSport({ label: 'Cyclisme piste', unit: 'min', xp: 11, cat: 'cardio', icon: 'ri-timer-flash-line', balanceProfile: 'cycling', official: 'Cycling Track', group: 'Cycling', programs: ['olympic_summer_2028'], aliases: ['piste', 'track cycling'], graphs: ['sprints', 'cadence', 'avg_power'], headline: 'Tours de piste, cadence, sprints, puissance et explosivite.' }),
        springboard_diving: catalogSport({ label: 'Plongeon', xp: 7, cat: 'skill', icon: 'ri-drop-line', balanceProfile: 'skill', official: 'Diving', group: 'Aquatics', programs: ['olympic_summer_2028'], aliases: ['diving', 'plongeon olympique'], graphs: ['execution_quality', 'successful_actions', 'attempts'], headline: 'Essais, hauteur, execution, entree dans l eau et regularite.' }),
        equestrian: catalogSport({ label: 'Equitation', xp: 7, cat: 'skill', icon: 'ri-horse-line', balanceProfile: 'skill', official: 'Equestrian', group: 'Equestrian', programs: ['olympic_summer_2028'], aliases: ['dressage', 'jumping', 'eventing'], graphs: ['execution_quality', 'successful_actions', 'fall_count'], headline: 'Dressage, saut ou complet: precision, controle, fautes et temps.' }),
        fencing: catalogSport({ label: 'Escrime', xp: 9, cat: 'combat', icon: 'ri-sword-line', balanceProfile: 'combat', official: 'Fencing', group: 'Combat', programs: ['olympic_summer_2028'], aliases: ['epee', 'fleuret', 'sabre'], graphs: ['attempts', 'successful_actions', 'accuracy'], headline: 'Touches, precision, assauts, deplacements et decision.' }),
        flag_football: catalogSport({ label: 'Flag football', xp: 9, cat: 'team', icon: 'ri-flag-line', balanceProfile: 'team', official: 'Flag Football', group: 'Football', programs: ['olympic_summer_2028'], aliases: ['flag', 'football americain sans contact'], graphs: ['score_for', 'score_against', 'decisive_actions'], headline: 'Routes, flags, score, role, actions offensives et defensives.' }),
        football: catalogSport({ label: 'Football', xp: 9, cat: 'team', icon: 'ri-football-line', balanceProfile: 'football', official: 'Football (Soccer)', group: 'Football', programs: ['olympic_summer_2028'], aliases: ['soccer'], graphs: ['goals', 'assists', 'successful_tackles'], headline: 'Poste, temps joue, buts, passes, defense et gardien.' }),
        golf: catalogSport({ label: 'Golf', xp: 5, cat: 'skill', icon: 'ri-flag-line', balanceProfile: 'precision', official: 'Golf', group: 'Precision', programs: ['olympic_summer_2028'], aliases: ['putting', 'drive'], graphs: ['attempts', 'successful_actions', 'accuracy'], headline: 'Trous, precision, coups utiles, pression et regularite.' }),
        handball: catalogSport({ label: 'Handball', xp: 10, cat: 'team', icon: 'ri-hand-heart-line', balanceProfile: 'team', official: 'Handball', group: 'Team', programs: ['olympic_summer_2028'], aliases: ['hand'], graphs: ['score_for', 'score_against', 'decisive_actions'], headline: 'Role, score, tirs, defense, duels et actions decisives.' }),
        field_hockey: catalogSport({ label: 'Hockey sur gazon', xp: 10, cat: 'team', icon: 'ri-meteor-line', balanceProfile: 'team', official: 'Hockey', group: 'Team', programs: ['olympic_summer_2028'], aliases: ['hockey', 'field hockey'], graphs: ['score_for', 'score_against', 'decisive_actions'], headline: 'Role, score, passes, defense, pressing et decisions.' }),
        judo: catalogSport({ label: 'Judo', xp: 10, cat: 'combat', icon: 'ri-boxing-line', balanceProfile: 'combat', official: 'Judo', group: 'Combat', programs: ['olympic_summer_2028'], aliases: ['ippon'], graphs: ['rounds', 'takedowns', 'execution_quality'], headline: 'Randori, technique, projections, controle et intensite.' }),
        lacrosse_sixes: catalogSport({ label: 'Lacrosse sixes', xp: 10, cat: 'team', icon: 'ri-team-line', balanceProfile: 'team', official: 'Lacrosse', group: 'Team', programs: ['olympic_summer_2028'], aliases: ['lacrosse'], graphs: ['score_for', 'score_against', 'decisive_actions'], headline: 'Format sixes: vitesse, score, transitions et actions decisives.' }),
        modern_pentathlon: catalogSport({ label: 'Pentathlon moderne', xp: 12, cat: 'mixed', icon: 'ri-compass-3-line', balanceProfile: 'mixed', official: 'Modern Pentathlon', group: 'Multisport', programs: ['olympic_summer_2028'], aliases: ['pentathlon'], graphs: ['rounds', 'score', 'execution_quality'], headline: 'Multisport: effort mixte, precision, course, obstacles et score.' }),
        mountain_bike: catalogSport({ label: 'VTT', unit: 'km', xp: 60, cat: 'outdoor', icon: 'ri-riding-line', formType: 'gps_full', balanceProfile: 'cycling', official: 'Mountain Bike', group: 'Cycling', programs: ['olympic_summer_2028'], aliases: ['mtb', 'vtt', 'vtt olympique'], graphs: ['elevation', 'technical_sections', 'descents', 'avg_power'], headline: 'Terrain, D+, pilotage, relances et temps utile.' }),
        open_water_swimming: catalogSport({ label: 'Nage eau libre', unit: 'm', xp: 0.6, cat: 'endurance', icon: 'ri-drop-line', formType: 'gps_simple', balanceProfile: 'swimming', official: 'Open Water Swimming', group: 'Aquatics', programs: ['olympic_summer_2028'], aliases: ['marathon swimming', 'eau libre'], graphs: ['stroke', 'swolf', 'avg_hr'], headline: 'Distance, conditions, rythme, nage dominante et orientation.' }),
        rhythmic_gymnastics: catalogSport({ label: 'Gym rythmique', xp: 7, cat: 'skill', icon: 'ri-rhythm-line', balanceProfile: 'skill', official: 'Rhythmic Gymnastics', group: 'Gymnastics', programs: ['olympic_summer_2028'], aliases: ['gr', 'ruban', 'cerceau'], graphs: ['combo_count', 'execution_quality', 'mobility_work'], headline: 'Routine, engin, coordination, mobilite et execution.' }),
        rowing: catalogSport({ label: 'Aviron', unit: 'km', xp: 60, cat: 'endurance', icon: 'ri-ship-line', formType: 'gps_full', balanceProfile: 'water', official: 'Rowing', group: 'Rowing', programs: ['olympic_summer_2028'], aliases: ['rame', 'rowing'], graphs: ['stroke_rate', 'avg_power', 'split_500m'], headline: 'Distance, cadence, split, puissance et efficacite.' }),
        coastal_rowing: catalogSport({ label: 'Aviron coastal', unit: 'km', xp: 55, cat: 'outdoor', icon: 'ri-ship-2-line', formType: 'gps_full', balanceProfile: 'water', official: 'Rowing Coastal Beach Sprints', group: 'Rowing', programs: ['olympic_summer_2028'], aliases: ['beach sprints', 'coastal rowing'], graphs: ['stroke_rate', 'water_state', 'avg_power'], headline: 'Beach sprints: distance, mer, cadence, relance et technique.' }),
        rugby_sevens: catalogSport({ label: 'Rugby a 7', xp: 12, cat: 'team', icon: 'ri-football-line', balanceProfile: 'team', official: 'Rugby Sevens', group: 'Team', programs: ['olympic_summer_2028'], aliases: ['sevens', 'rugby'], graphs: ['score_for', 'score_against', 'decisive_actions'], headline: 'Format rapide: score, appuis, contacts, defense et actions decisives.' }),
        sailing: catalogSport({ label: 'Voile', xp: 6, cat: 'skill', icon: 'ri-sailboat-line', balanceProfile: 'water', official: 'Sailing', group: 'Water', programs: ['olympic_summer_2028'], aliases: ['sailing'], graphs: ['water_state', 'execution_quality', 'autonomy'], headline: 'Vent, eau, autonomie, technique, manoeuvres et decision.' }),
        shooting: catalogSport({ label: 'Tir sportif', xp: 4, cat: 'skill', icon: 'ri-focus-3-line', balanceProfile: 'precision', official: 'Shooting', group: 'Precision', programs: ['olympic_summer_2028'], aliases: ['shooting', 'rifle', 'pistol'], graphs: ['attempts', 'successful_actions', 'accuracy'], headline: 'Tentatives, reussites, precision et serie sous pression.' }),
        skateboarding: catalogSport({ label: 'Skateboard', xp: 8, cat: 'skill', icon: 'ri-skateboard-line', balanceProfile: 'glide', official: 'Skateboarding', group: 'Urban', programs: ['olympic_summer_2028'], aliases: ['skate'], graphs: ['tricks', 'fall_count', 'execution_quality'], headline: 'Runs, tricks propres, chutes, flow et qualite d execution.' }),
        softball: catalogSport({ label: 'Softball', xp: 7, cat: 'team', icon: 'ri-baseball-line', balanceProfile: 'team', official: 'Softball', group: 'Baseball/Softball', programs: ['olympic_summer_2028'], aliases: ['pitching', 'batting'], graphs: ['score_for', 'score_against', 'decisive_actions'], headline: 'Batting, defense, score, presence terrain et actions decisives.' }),
        squash: catalogSport({ label: 'Squash', xp: 12, cat: 'cardio', icon: 'ri-ping-pong-line', balanceProfile: 'racket', official: 'Squash', group: 'Racket', programs: ['olympic_summer_2028'], aliases: ['squash'], graphs: ['sets_won', 'aces', 'unforced_errors'], headline: 'Jeu intense: sets, points directs, erreurs et qualite des echanges.' }),
        surfing: catalogSport({ label: 'Surf', xp: 8, cat: 'skill', icon: 'ri-surround-sound-line', balanceProfile: 'water', official: 'Surfing', group: 'Water', programs: ['olympic_summer_2028'], aliases: ['surfing'], graphs: ['water_state', 'falls', 'execution_quality'], headline: 'Vagues, conditions, vagues prises, chutes et qualite technique.' }),
        swimming: catalogSport({ label: 'Natation', unit: 'm', xp: 0.5, cat: 'endurance', icon: 'ri-drop-line', balanceProfile: 'swimming', official: 'Swimming', group: 'Aquatics', programs: ['olympic_summer_2028'], aliases: ['piscine', 'swim'], graphs: ['stroke', 'swolf', 'drills'], headline: 'Distance, nage, bassin, educatifs, rythme et efficacite.' }),
        table_tennis: catalogSport({ label: 'Tennis de table', xp: 6, cat: 'skill', icon: 'ri-ping-pong-line', balanceProfile: 'racket', official: 'Table Tennis', group: 'Racket', programs: ['olympic_summer_2028'], aliases: ['ping pong', 'ping-pong'], graphs: ['sets_won', 'aces', 'unforced_errors'], headline: 'Sets, points directs, rythme, fautes et precision.' }),
        taekwondo: catalogSport({ label: 'Taekwondo', xp: 10, cat: 'combat', icon: 'ri-boxing-line', balanceProfile: 'combat', official: 'Taekwondo', group: 'Combat', programs: ['olympic_summer_2028'], aliases: ['tkd'], graphs: ['rounds', 'significant_strikes', 'execution_quality'], headline: 'Rounds, coups propres, technique, mobilite et controle.' }),
        tennis: catalogSport({ label: 'Tennis', xp: 9, cat: 'cardio', icon: 'ri-ping-pong-line', balanceProfile: 'racket', official: 'Tennis', group: 'Racket', programs: ['olympic_summer_2028'], aliases: ['simple', 'double'], graphs: ['sets_won', 'aces', 'unforced_errors'], headline: 'Sets, services, points directs, fautes et qualite des echanges.' }),
        trampoline_gymnastics: catalogSport({ label: 'Trampoline', xp: 8, cat: 'skill', icon: 'ri-bubble-chart-line', balanceProfile: 'skill', official: 'Trampoline Gymnastics', group: 'Gymnastics', programs: ['olympic_summer_2028'], aliases: ['trampoline gymnastics'], graphs: ['combo_count', 'execution_quality', 'fall_count'], headline: 'Routine, figures, hauteur, execution et receptions.' }),
        triathlon: catalogSport({ label: 'Triathlon', unit: 'km', xp: 65, cat: 'endurance', icon: 'ri-route-line', formType: 'gps_full', balanceProfile: 'mixed', official: 'Triathlon', group: 'Multisport', programs: ['olympic_summer_2028'], aliases: ['swim bike run'], graphs: ['avg_hr', 'cadence', 'elevation'], headline: 'Natation, velo, course: distance, transitions, duree et intensite.' }),
        volleyball: catalogSport({ label: 'Volleyball', xp: 7, cat: 'team', icon: 'ri-volleyball-line', balanceProfile: 'team', official: 'Volleyball', group: 'Volleyball', programs: ['olympic_summer_2028'], aliases: ['volley'], graphs: ['score_for', 'score_against', 'decisive_actions'], headline: 'Service, reception, attaque, bloc, score et fautes.' }),
        water_polo: catalogSport({ label: 'Water-polo', xp: 11, cat: 'team', icon: 'ri-drop-line', balanceProfile: 'team', official: 'Water Polo', group: 'Aquatics', programs: ['olympic_summer_2028'], aliases: ['water polo'], graphs: ['score_for', 'score_against', 'decisive_actions'], headline: 'Temps de jeu, score, tirs, defense, nage et intensite.' }),
        weightlifting: catalogSport({ label: 'Halterophilie', unit: 'kg', xp: 12, cat: 'force', icon: 'ri-bar-chart-horizontal-fill', formType: 'builder_gym', balanceProfile: 'strength', official: 'Weightlifting', group: 'Strength', programs: ['olympic_summer_2028'], aliases: ['weightlifting', 'haltero'], graphs: ['top_set_weight', 'record_attempt', 'execution_quality'], headline: 'Arrache/epaule-jete, top set, technique, charge et tentative record.' }),
        wrestling: catalogSport({ label: 'Lutte', xp: 12, cat: 'combat', icon: 'ri-boxing-line', balanceProfile: 'combat', official: 'Wrestling', group: 'Combat', programs: ['olympic_summer_2028'], aliases: ['greco roman', 'freestyle wrestling'], graphs: ['rounds', 'takedowns', 'execution_quality'], headline: 'Lutte libre ou greco-romaine: rounds, projections, controle et intensite.' }),
        alpine_skiing: catalogSport({ label: 'Ski alpin', unit: 'km', xp: 20, cat: 'outdoor', icon: 'ri-snowflake-line', formType: 'gps_full', balanceProfile: 'glide', official: 'Alpine Skiing', group: 'Winter', programs: ['olympic_winter_2026'], aliases: ['ski', 'slalom', 'descente'], graphs: ['runs', 'surface_state', 'fall_count'], headline: 'Descentes, neige, vitesse, surface, D- utile et chutes.' }),
        biathlon: catalogSport({ label: 'Biathlon', unit: 'km', xp: 58, cat: 'outdoor', icon: 'ri-focus-3-line', formType: 'gps_full', balanceProfile: 'glide', official: 'Biathlon', group: 'Winter', programs: ['olympic_winter_2026'], aliases: ['ski tir'], graphs: ['accuracy', 'avg_hr', 'elevation'], headline: 'Ski de fond + tir: distance, rythme, precision et recuperation.' }),
        bobsleigh: catalogSport({ label: 'Bobsleigh', xp: 8, cat: 'skill', icon: 'ri-snowy-line', balanceProfile: 'glide', official: 'Bobsleigh', group: 'Winter', programs: ['olympic_winter_2026'], aliases: ['bob'], graphs: ['runs', 'execution_quality', 'fall_count'], headline: 'Poussees, trajectoires, runs, vitesse et execution.' }),
        cross_country_skiing: catalogSport({ label: 'Ski de fond', unit: 'km', xp: 60, cat: 'outdoor', icon: 'ri-snowy-line', formType: 'gps_full', balanceProfile: 'glide', official: 'Cross-Country Skiing', group: 'Winter', programs: ['olympic_winter_2026'], aliases: ['cross country ski', 'nordic ski'], graphs: ['avg_hr', 'cadence', 'elevation'], headline: 'Distance, D+, rythme, style classique/skating et endurance.' }),
        curling: catalogSport({ label: 'Curling', xp: 5, cat: 'skill', icon: 'ri-snowy-line', balanceProfile: 'precision', official: 'Curling', group: 'Winter', programs: ['olympic_winter_2026'], aliases: ['curl'], graphs: ['attempts', 'successful_actions', 'accuracy'], headline: 'Lancers, balayage, precision, strategie et serie sous pression.' }),
        figure_skating: catalogSport({ label: 'Patinage artistique', xp: 8, cat: 'skill', icon: 'ri-snowy-line', balanceProfile: 'glide', official: 'Figure Skating', group: 'Winter', programs: ['olympic_winter_2026'], aliases: ['figure skating'], graphs: ['combo_count', 'execution_quality', 'fall_count'], headline: 'Programme, sauts, pirouettes, execution et chutes.' }),
        freestyle_skiing: catalogSport({ label: 'Ski freestyle', unit: 'min', xp: 10, cat: 'skill', icon: 'ri-snowflake-line', balanceProfile: 'glide', official: 'Freestyle Skiing', group: 'Winter', programs: ['olympic_winter_2026'], aliases: ['moguls', 'aerials', 'slopestyle'], graphs: ['tricks', 'runs', 'fall_count'], headline: 'Runs, modules, figures, reception, surface et chutes.' }),
        ice_hockey: catalogSport({ label: 'Hockey sur glace', xp: 12, cat: 'team', icon: 'ri-snowy-line', balanceProfile: 'team', official: 'Ice Hockey', group: 'Winter', programs: ['olympic_winter_2026'], aliases: ['hockey glace'], graphs: ['score_for', 'score_against', 'decisive_actions'], headline: 'Temps de jeu, poste, score, transitions, defense et intensite.' }),
        luge: catalogSport({ label: 'Luge', xp: 7, cat: 'skill', icon: 'ri-snowy-line', balanceProfile: 'glide', official: 'Luge', group: 'Winter', programs: ['olympic_winter_2026'], aliases: ['luge'], graphs: ['runs', 'execution_quality', 'fall_count'], headline: 'Runs, trajectoire, depart, vitesse et regularite technique.' }),
        nordic_combined: catalogSport({ label: 'Combine nordique', unit: 'km', xp: 62, cat: 'outdoor', icon: 'ri-snowy-line', formType: 'gps_full', balanceProfile: 'glide', official: 'Nordic Combined', group: 'Winter', programs: ['olympic_winter_2026'], aliases: ['nordic combined'], graphs: ['avg_hr', 'runs', 'elevation'], headline: 'Saut a ski + fond: distance, sauts, rythme et transition.' }),
        short_track_speed_skating: catalogSport({ label: 'Short track', xp: 11, cat: 'cardio', icon: 'ri-timer-flash-line', balanceProfile: 'glide', official: 'Short Track Speed Skating', group: 'Winter', programs: ['olympic_winter_2026'], aliases: ['short track speed skating'], graphs: ['sprints', 'cadence', 'fall_count'], headline: 'Tours courts, vitesse, depassements, appuis et chutes.' }),
        skeleton: catalogSport({ label: 'Skeleton', xp: 8, cat: 'skill', icon: 'ri-snowy-line', balanceProfile: 'glide', official: 'Skeleton', group: 'Winter', programs: ['olympic_winter_2026'], aliases: ['skeleton'], graphs: ['runs', 'execution_quality', 'fall_count'], headline: 'Depart, trajectoire, runs, vitesse et precision.' }),
        ski_jumping: catalogSport({ label: 'Saut a ski', xp: 8, cat: 'skill', icon: 'ri-flight-takeoff-line', balanceProfile: 'glide', official: 'Ski Jumping', group: 'Winter', programs: ['olympic_winter_2026'], aliases: ['ski jumping'], graphs: ['attempts', 'execution_quality', 'fall_count'], headline: 'Sauts, reception, controle aerien, engagement et regularite.' }),
        ski_mountaineering: catalogSport({ label: 'Ski alpinisme', unit: 'km', xp: 65, cat: 'outdoor', icon: 'ri-mountain-line', formType: 'gps_full', balanceProfile: 'glide', official: 'Ski Mountaineering', group: 'Winter', programs: ['olympic_winter_2026'], aliases: ['skimo', 'ski rando'], graphs: ['elevation', 'avg_hr', 'surface_state'], headline: 'Montee, D+, transition, neige, descente et autonomie.' }),
        snowboard: catalogSport({ label: 'Snowboard', unit: 'km', xp: 20, cat: 'outdoor', icon: 'ri-snowy-line', formType: 'gps_full', balanceProfile: 'glide', official: 'Snowboard', group: 'Winter', programs: ['olympic_winter_2026'], aliases: ['snow'], graphs: ['runs', 'tricks', 'fall_count'], headline: 'Runs, neige, figures, surface, descente et chutes.' }),
        speed_skating: catalogSport({ label: 'Patinage de vitesse', xp: 10, cat: 'cardio', icon: 'ri-timer-flash-line', balanceProfile: 'glide', official: 'Speed Skating', group: 'Winter', programs: ['olympic_winter_2026'], aliases: ['speed skating'], graphs: ['sprints', 'cadence', 'avg_hr'], headline: 'Tours, vitesse, cadence, appuis, rythme et puissance.' })
    };

    const BROAD_CATALOG_SPORTS = Object.fromEntries([
        ['acrobatic_gymnastics', catalogSport({ label: 'Gym acrobatique', cat: 'skill', icon: 'ri-medal-line', balanceProfile: 'skill', group: 'Gymnastics', programs: ['broad_catalog_v82'], aliases: ['acrobatic gymnastics', 'acro sport'], graphs: ['combo_count', 'execution_quality', 'fall_count'], headline: 'Portes, equilibre, routine, execution et securite.' })],
        ['aerobic_gymnastics', catalogSport({ label: 'Gym aerobic', xp: 8, cat: 'cardio', icon: 'ri-heart-pulse-line', balanceProfile: 'skill', group: 'Gymnastics', programs: ['broad_catalog_v82'], aliases: ['aerobic gymnastics'], graphs: ['combo_count', 'avg_hr', 'execution_quality'], headline: 'Routine, cardio, coordination, rythme et execution.' })],
        ['adventure_racing', catalogSport({ label: 'Raid aventure', unit: 'km', xp: 70, cat: 'outdoor', icon: 'ri-route-line', formType: 'gps_full', balanceProfile: 'mixed', group: 'Multisport outdoor', programs: ['broad_catalog_v82'], aliases: ['adventure race', 'raid multisport'], graphs: ['elevation', 'navigation', 'avg_hr'], headline: 'Distance, orientation, D+, transitions et autonomie.' })],
        ['arnis_eskrima', catalogSport({ label: 'Arnis / Eskrima', xp: 9, cat: 'combat', icon: 'ri-sword-line', balanceProfile: 'combat', group: 'Combat', programs: ['broad_catalog_v82'], aliases: ['kali', 'escrima', 'arnis'], graphs: ['rounds', 'successful_actions', 'execution_quality'], headline: 'Armes, angles, precision, rounds et controle.' })],
        ['arm_wrestling', catalogSport({ label: 'Bras de fer sportif', xp: 8, cat: 'force', icon: 'ri-hand-heart-line', balanceProfile: 'strength', group: 'Strength', programs: ['broad_catalog_v82'], aliases: ['armwrestling'], graphs: ['attempts', 'successful_actions', 'top_set_weight'], headline: 'Prises, rounds, force specifique et controle.' })],
        ['artistic_cycling', catalogSport({ label: 'Cyclisme artistique', xp: 7, cat: 'skill', icon: 'ri-riding-line', balanceProfile: 'cycling', group: 'Cycling', programs: ['broad_catalog_v82'], aliases: ['artistic cycling'], graphs: ['combo_count', 'execution_quality', 'fall_count'], headline: 'Figures, equilibre, routine et precision.' })],
        ['australian_rules_football', catalogSport({ label: 'Football australien', xp: 11, cat: 'team', icon: 'ri-football-line', balanceProfile: 'team', group: 'Team field', programs: ['broad_catalog_v82'], aliases: ['aussie rules', 'afl'], graphs: ['score_for', 'score_against', 'decisive_actions'], headline: 'Temps de jeu, courses, contacts, score et actions.' })],
        ['bandy', catalogSport({ label: 'Bandy', xp: 10, cat: 'team', icon: 'ri-snowy-line', balanceProfile: 'team', group: 'Ice team', programs: ['broad_catalog_v82'], aliases: ['hockey russe'], graphs: ['score_for', 'score_against', 'decisive_actions'], headline: 'Patinage, passes, tirs, transitions et score.' })],
        ['beach_handball', catalogSport({ label: 'Beach handball', xp: 9, cat: 'team', icon: 'ri-hand-heart-line', balanceProfile: 'team', group: 'Beach team', programs: ['broad_catalog_v82'], aliases: ['handball plage'], graphs: ['score_for', 'score_against', 'decisive_actions'], headline: 'Sable, rotations, score, tirs spectaculaires et defense.' })],
        ['beach_soccer', catalogSport({ label: 'Beach soccer', xp: 9, cat: 'team', icon: 'ri-football-line', balanceProfile: 'football', group: 'Beach team', programs: ['broad_catalog_v82'], aliases: ['football plage'], graphs: ['goals', 'assists', 'successful_tackles'], headline: 'Sable, score, frappes, reprises et intensite.' })],
        ['beach_tennis', catalogSport({ label: 'Beach tennis', xp: 8, cat: 'cardio', icon: 'ri-ping-pong-line', balanceProfile: 'racket', group: 'Racket', programs: ['broad_catalog_v82'], aliases: ['tennis plage'], graphs: ['sets_won', 'aces', 'unforced_errors'], headline: 'Sets, services, volees, fautes et deplacements sable.' })],
        ['billiards_pool', catalogSport({ label: 'Billard pool', xp: 4, cat: 'skill', icon: 'ri-focus-3-line', balanceProfile: 'precision', group: 'Precision', programs: ['broad_catalog_v82'], aliases: ['pool', 'billard americain'], graphs: ['attempts', 'successful_actions', 'accuracy'], headline: 'Parties, precision, placements et serie sous pression.' })],
        ['blind_football', catalogSport({ label: 'Cecifoot', xp: 8, cat: 'team', icon: 'ri-football-line', balanceProfile: 'football', group: 'Para team', programs: ['broad_catalog_v82'], aliases: ['blind football', 'football aveugle'], graphs: ['goals', 'assists', 'successful_tackles'], headline: 'Orientation, passes, tirs, defense et communication.' })],
        ['bocce', catalogSport({ label: 'Bocce', xp: 4, cat: 'skill', icon: 'ri-focus-3-line', balanceProfile: 'precision', group: 'Precision', programs: ['broad_catalog_v82'], aliases: ['bocce volo'], graphs: ['attempts', 'successful_actions', 'accuracy'], headline: 'Lancers, precision, points, regularite et tactique.' })],
        ['boccia', catalogSport({ label: 'Boccia', xp: 4, cat: 'skill', icon: 'ri-focus-3-line', balanceProfile: 'precision', group: 'Para precision', programs: ['broad_catalog_v82'], aliases: ['boccia paralympique'], graphs: ['attempts', 'successful_actions', 'accuracy'], headline: 'Lancers, precision, strategie, score et controle.' })],
        ['bodyboarding', catalogSport({ label: 'Bodyboard', xp: 7, cat: 'outdoor', icon: 'ri-sailboat-line', balanceProfile: 'water', group: 'Board water', programs: ['broad_catalog_v82'], aliases: ['bodyboard'], graphs: ['water_state', 'runs', 'fall_count'], headline: 'Vagues, conditions, runs, chutes et engagement.' })],
        ['breakdance', catalogSport({ label: 'Breaking', xp: 9, cat: 'skill', icon: 'ri-music-2-line', balanceProfile: 'skill', group: 'Dance sport', programs: ['broad_catalog_v82'], aliases: ['breakdance', 'breaking'], graphs: ['combo_count', 'execution_quality', 'mobility_work'], headline: 'Rounds, combos, musicalite, puissance et execution.' })],
        ['camogie', catalogSport({ label: 'Camogie', xp: 10, cat: 'team', icon: 'ri-team-line', balanceProfile: 'team', group: 'Gaelic sports', programs: ['broad_catalog_v82'], aliases: ['camogie'], graphs: ['score_for', 'score_against', 'decisive_actions'], headline: 'Crosse, courses, score, defense et actions decisives.' })],
        ['canoe_polo', catalogSport({ label: 'Canoe polo', xp: 10, cat: 'team', icon: 'ri-ship-2-line', balanceProfile: 'water', group: 'Water team', programs: ['broad_catalog_v82'], aliases: ['kayak polo'], graphs: ['score_for', 'score_against', 'decisive_actions'], headline: 'Bateau, passes, tirs, defense et transitions.' })],
        ['cheerleading', catalogSport({ label: 'Cheerleading', xp: 9, cat: 'skill', icon: 'ri-team-line', balanceProfile: 'skill', group: 'Acrobatics', programs: ['broad_catalog_v82'], aliases: ['cheer'], graphs: ['combo_count', 'execution_quality', 'fall_count'], headline: 'Stunts, tumbling, routine, synchro et securite.' })],
        ['croquet', catalogSport({ label: 'Croquet', xp: 4, cat: 'skill', icon: 'ri-focus-3-line', balanceProfile: 'precision', group: 'Precision', programs: ['broad_catalog_v82'], aliases: ['croquet'], graphs: ['attempts', 'successful_actions', 'accuracy'], headline: 'Coups, precision, strategie, placements et score.' })],
        ['cycle_ball', catalogSport({ label: 'Cycle-ball', xp: 8, cat: 'team', icon: 'ri-riding-line', balanceProfile: 'cycling', group: 'Cycling', programs: ['broad_catalog_v82'], aliases: ['cycle ball', 'radball'], graphs: ['score_for', 'score_against', 'decisive_actions'], headline: 'Velo, passes, tirs, equilibre et score.' })],
        ['cycle_polo', catalogSport({ label: 'Cycle polo', xp: 9, cat: 'team', icon: 'ri-riding-line', balanceProfile: 'cycling', group: 'Cycling team', programs: ['broad_catalog_v82'], aliases: ['bike polo'], graphs: ['score_for', 'score_against', 'decisive_actions'], headline: 'Velo, maillet, passes, tirs et transitions.' })],
        ['cyclocross', catalogSport({ label: 'Cyclo-cross', unit: 'km', xp: 45, cat: 'outdoor', icon: 'ri-riding-line', formType: 'gps_full', balanceProfile: 'cycling', group: 'Cycling', programs: ['broad_catalog_v82'], aliases: ['cyclocross', 'cx'], graphs: ['elevation', 'technical_sections', 'avg_power'], headline: 'Tours, terrain, relances, portages et intensite.' })],
        ['disc_golf', catalogSport({ label: 'Disc golf', xp: 5, cat: 'skill', icon: 'ri-focus-3-line', balanceProfile: 'precision', group: 'Precision', programs: ['broad_catalog_v82'], aliases: ['frisbee golf'], graphs: ['attempts', 'successful_actions', 'accuracy'], headline: 'Lancers, precision, score, placements et vent.' })],
        ['dodgeball', catalogSport({ label: 'Dodgeball', xp: 8, cat: 'team', icon: 'ri-team-line', balanceProfile: 'team', group: 'Team court', programs: ['broad_catalog_v82'], aliases: ['balle au prisonnier sportive'], graphs: ['score_for', 'score_against', 'decisive_actions'], headline: 'Manches, esquives, tirs, captures et score.' })],
        ['dressage', catalogSport({ label: 'Dressage', xp: 6, cat: 'skill', icon: 'ri-horse-line', balanceProfile: 'skill', group: 'Equestrian', programs: ['broad_catalog_v82'], aliases: ['dressage cheval'], graphs: ['execution_quality', 'successful_actions', 'errors'], headline: 'Reprise, precision, controle, transitions et fautes.' })],
        ['eventing', catalogSport({ label: 'Concours complet', xp: 8, cat: 'skill', icon: 'ri-horse-line', balanceProfile: 'skill', group: 'Equestrian', programs: ['broad_catalog_v82'], aliases: ['eventing', 'cce'], graphs: ['execution_quality', 'fall_count', 'errors'], headline: 'Dressage, cross, saut, controle et fautes.' })],
        ['fell_running', catalogSport({ label: 'Course en montagne', unit: 'km', xp: 62, cat: 'outdoor', icon: 'ri-mountain-line', formType: 'gps_full', balanceProfile: 'trail', group: 'Running', programs: ['broad_catalog_v82'], aliases: ['mountain running', 'fell running'], graphs: ['elevation', 'avg_hr', 'technical_sections'], headline: 'D+, technicite, rythme, descentes et endurance.' })],
        ['finswimming', catalogSport({ label: 'Nage avec palmes', unit: 'm', xp: 0.55, cat: 'endurance', icon: 'ri-drop-line', balanceProfile: 'swimming', group: 'Aquatics', programs: ['broad_catalog_v82'], aliases: ['finswim', 'palmes'], graphs: ['stroke', 'swolf', 'avg_hr'], headline: 'Distance, technique, rythme et souffle.' })],
        ['freestyle_wrestling', catalogSport({ label: 'Lutte libre', xp: 12, cat: 'combat', icon: 'ri-boxing-line', balanceProfile: 'combat', group: 'Combat', programs: ['broad_catalog_v82'], aliases: ['freestyle wrestling'], graphs: ['rounds', 'takedowns', 'execution_quality'], headline: 'Rounds, projections, controle et intensite.' })],
        ['futnet', catalogSport({ label: 'Futnet', xp: 8, cat: 'team', icon: 'ri-football-line', balanceProfile: 'team', group: 'Net team', programs: ['broad_catalog_v82'], aliases: ['tennis ballon'], graphs: ['score_for', 'score_against', 'decisive_actions'], headline: 'Touches, filet, score, precision et coordination.' })],
        ['gaelic_football', catalogSport({ label: 'Football gaelique', xp: 10, cat: 'team', icon: 'ri-football-line', balanceProfile: 'team', group: 'Gaelic sports', programs: ['broad_catalog_v82'], aliases: ['gaelic football'], graphs: ['score_for', 'score_against', 'decisive_actions'], headline: 'Courses, passes, tirs, score et contacts.' })],
        ['goalball', catalogSport({ label: 'Goalball', xp: 7, cat: 'team', icon: 'ri-team-line', balanceProfile: 'team', group: 'Para team', programs: ['broad_catalog_v82'], aliases: ['goal ball'], graphs: ['score_for', 'score_against', 'decisive_actions'], headline: 'Lancers, defense, orientation sonore et score.' })],
        ['grappling', catalogSport({ label: 'Grappling', xp: 10, cat: 'combat', icon: 'ri-boxing-line', balanceProfile: 'combat', group: 'Combat', programs: ['broad_catalog_v82'], aliases: ['submission grappling', 'no gi'], graphs: ['rounds', 'takedowns', 'submissions'], headline: 'Rounds, controles, projections, soumissions et intensite.' })],
        ['greco_roman_wrestling', catalogSport({ label: 'Lutte greco-romaine', xp: 12, cat: 'combat', icon: 'ri-boxing-line', balanceProfile: 'combat', group: 'Combat', programs: ['broad_catalog_v82'], aliases: ['greco roman wrestling'], graphs: ['rounds', 'takedowns', 'execution_quality'], headline: 'Projections haut du corps, controle et rounds.' })],
        ['grip_sport', catalogSport({ label: 'Grip sport', xp: 6, cat: 'force', icon: 'ri-hand-heart-line', balanceProfile: 'strength', group: 'Strength', programs: ['broad_catalog_v82'], aliases: ['grip strength'], graphs: ['attempts', 'successful_actions', 'top_set_weight'], headline: 'Pinces, holds, temps, charge et progression.' })],
        ['hapkido', catalogSport({ label: 'Hapkido', xp: 8, cat: 'combat', icon: 'ri-boxing-line', balanceProfile: 'combat', group: 'Combat', programs: ['broad_catalog_v82'], aliases: ['hapkido'], graphs: ['rounds', 'successful_actions', 'execution_quality'], headline: 'Techniques, projections, controles et precision.' })],
        ['highland_games', catalogSport({ label: 'Highland games', xp: 9, cat: 'force', icon: 'ri-medal-line', balanceProfile: 'strength', group: 'Strength throws', programs: ['broad_catalog_v82'], aliases: ['lancers ecossais'], graphs: ['attempts', 'successful_actions', 'top_set_weight'], headline: 'Lancers lourds, essais, technique et puissance.' })],
        ['horse_racing', catalogSport({ label: 'Course hippique', xp: 5, cat: 'skill', icon: 'ri-horse-line', balanceProfile: 'skill', group: 'Equestrian', programs: ['broad_catalog_v82'], aliases: ['horse racing', 'hippisme'], graphs: ['execution_quality', 'successful_actions', 'speed'], headline: 'Monte, controle, rythme, tactique et securite.' })],
        ['hurling', catalogSport({ label: 'Hurling', xp: 11, cat: 'team', icon: 'ri-team-line', balanceProfile: 'team', group: 'Gaelic sports', programs: ['broad_catalog_v82'], aliases: ['hurling'], graphs: ['score_for', 'score_against', 'decisive_actions'], headline: 'Crosse, vitesse, tirs, defense et score.' })],
        ['ice_climbing', catalogSport({ label: 'Cascade de glace', xp: 9, cat: 'skill', icon: 'ri-snowy-line', balanceProfile: 'climbing', group: 'Climbing', programs: ['broad_catalog_v82'], aliases: ['ice climbing', 'escalade glace'], graphs: ['attempts', 'successful_routes', 'fall_count'], headline: 'Voie, cotation, essais, securite et conditions.' })],
        ['inline_speed_skating', catalogSport({ label: 'Roller vitesse', unit: 'km', xp: 35, cat: 'endurance', icon: 'ri-skateboard-line', formType: 'gps_full', balanceProfile: 'glide', group: 'Skating', programs: ['broad_catalog_v82'], aliases: ['inline speed skating'], graphs: ['cadence', 'sprints', 'avg_hr'], headline: 'Distance, cadence, peloton, sprints et allure.' })],
        ['kabaddi', catalogSport({ label: 'Kabaddi', xp: 10, cat: 'team', icon: 'ri-team-line', balanceProfile: 'team', group: 'Team contact', programs: ['broad_catalog_v82'], aliases: ['kabaddi'], graphs: ['score_for', 'score_against', 'decisive_actions'], headline: 'Raids, touches, defense, souffle et score.' })],
        ['karting', catalogSport({ label: 'Karting', xp: 5, cat: 'skill', icon: 'ri-roadster-line', balanceProfile: 'skill', group: 'Motorsport', programs: ['broad_catalog_v82'], aliases: ['kart'], graphs: ['laps', 'best_time', 'execution_quality'], headline: 'Tours, trajectoires, temps, regularite et precision.' })],
        ['kho_kho', catalogSport({ label: 'Kho kho', xp: 9, cat: 'team', icon: 'ri-team-line', balanceProfile: 'team', group: 'Team tag', programs: ['broad_catalog_v82'], aliases: ['kho-kho'], graphs: ['score_for', 'score_against', 'decisive_actions'], headline: 'Poursuites, esquives, relais, vitesse et score.' })],
        ['motocross', catalogSport({ label: 'Motocross', xp: 8, cat: 'outdoor', icon: 'ri-riding-line', balanceProfile: 'skill', group: 'Motorsport', programs: ['broad_catalog_v82'], aliases: ['mx'], graphs: ['laps', 'technical_sections', 'fall_count'], headline: 'Tours, terrain, sauts, technique et engagement.' })],
        ['outrigger_canoe', catalogSport({ label: 'Pirogue vaa', unit: 'km', xp: 45, cat: 'outdoor', icon: 'ri-ship-line', formType: 'gps_full', balanceProfile: 'water', group: 'Paddle water', programs: ['broad_catalog_v82'], aliases: ['outrigger canoe', 'vaa'], graphs: ['stroke_rate', 'water_state', 'avg_power'], headline: 'Distance, cadence, equipage, eau et endurance.' })],
        ['para_cycling', catalogSport({ label: 'Para cyclisme', unit: 'km', xp: 36, cat: 'endurance', icon: 'ri-riding-line', formType: 'gps_full', balanceProfile: 'cycling', group: 'Para cycling', programs: ['broad_catalog_v82'], aliases: ['para cycling'], graphs: ['avg_power', 'cadence', 'avg_hr'], headline: 'Distance, cadence, puissance, rythme et endurance.' })],
        ['para_powerlifting', catalogSport({ label: 'Para powerlifting', unit: 'kg', xp: 10, cat: 'force', icon: 'ri-bar-chart-horizontal-fill', formType: 'builder_gym', balanceProfile: 'strength', group: 'Para strength', programs: ['broad_catalog_v82'], aliases: ['developpe couche handisport'], graphs: ['top_set_weight', 'record_attempt', 'execution_quality'], headline: 'Charge, series, top set, technique et tentative.' })],
        ['petanque', catalogSport({ label: 'Petanque', xp: 4, cat: 'skill', icon: 'ri-focus-3-line', balanceProfile: 'precision', group: 'Precision', programs: ['broad_catalog_v82'], aliases: ['boules', 'jeu provencal'], graphs: ['attempts', 'successful_actions', 'accuracy'], headline: 'Menes, tirs, points, precision et tactique.' })],
        ['platform_tennis', catalogSport({ label: 'Platform tennis', xp: 7, cat: 'cardio', icon: 'ri-ping-pong-line', balanceProfile: 'racket', group: 'Racket', programs: ['broad_catalog_v82'], aliases: ['paddle tennis'], graphs: ['sets_won', 'aces', 'unforced_errors'], headline: 'Sets, filet, rebonds, fautes et endurance.' })],
        ['polo', catalogSport({ label: 'Polo', xp: 8, cat: 'team', icon: 'ri-horse-line', balanceProfile: 'team', group: 'Equestrian team', programs: ['broad_catalog_v82'], aliases: ['polo equestre'], graphs: ['score_for', 'score_against', 'decisive_actions'], headline: 'Chukkas, monte, passes, tirs, score et controle.' })],
        ['race_walking', catalogSport({ label: 'Marche athletique', unit: 'km', xp: 28, cat: 'endurance', icon: 'ri-walk-line', formType: 'gps_full', balanceProfile: 'running', group: 'Athletics', programs: ['broad_catalog_v82'], aliases: ['race walking', 'marche sportive'], graphs: ['cadence', 'avg_hr', 'pace'], headline: 'Distance, cadence, allure, technique et endurance.' })],
        ['racketlon', catalogSport({ label: 'Racketlon', xp: 10, cat: 'cardio', icon: 'ri-ping-pong-line', balanceProfile: 'racket', group: 'Racket', programs: ['broad_catalog_v82'], aliases: ['racketlon'], graphs: ['sets_won', 'aces', 'unforced_errors'], headline: 'Quatre raquettes, sets, transitions et regularite.' })],
        ['racquetball', catalogSport({ label: 'Racquetball', xp: 10, cat: 'cardio', icon: 'ri-ping-pong-line', balanceProfile: 'racket', group: 'Racket', programs: ['broad_catalog_v82'], aliases: ['racquet ball'], graphs: ['sets_won', 'aces', 'unforced_errors'], headline: 'Sets, points directs, murs, fautes et intensite.' })],
        ['rafting', catalogSport({ label: 'Rafting', unit: 'km', xp: 35, cat: 'outdoor', icon: 'ri-ship-2-line', formType: 'gps_full', balanceProfile: 'water', group: 'Outdoor water', programs: ['broad_catalog_v82'], aliases: ['raft'], graphs: ['water_state', 'technical_sections', 'successful_actions'], headline: 'Distance, rapide, equipage, eau et securite.' })],
        ['real_tennis', catalogSport({ label: 'Jeu de paume', xp: 6, cat: 'skill', icon: 'ri-ping-pong-line', balanceProfile: 'racket', group: 'Racket', programs: ['broad_catalog_v82'], aliases: ['real tennis', 'court tennis'], graphs: ['sets_won', 'aces', 'unforced_errors'], headline: 'Sets, murs, precision, placements et score.' })],
        ['ringette', catalogSport({ label: 'Ringette', xp: 9, cat: 'team', icon: 'ri-snowy-line', balanceProfile: 'team', group: 'Ice team', programs: ['broad_catalog_v82'], aliases: ['ringette'], graphs: ['score_for', 'score_against', 'decisive_actions'], headline: 'Patinage, passes, tirs, defense et score.' })],
        ['rogaining', catalogSport({ label: 'Rogaining', unit: 'km', xp: 60, cat: 'outdoor', icon: 'ri-compass-3-line', formType: 'gps_full', balanceProfile: 'hiking', group: 'Navigation', programs: ['broad_catalog_v82'], aliases: ['orientation longue'], graphs: ['navigation', 'elevation', 'avg_hr'], headline: 'Orientation longue, balises, distance, D+ et autonomie.' })],
        ['sambo', catalogSport({ label: 'Sambo', xp: 10, cat: 'combat', icon: 'ri-boxing-line', balanceProfile: 'combat', group: 'Combat', programs: ['broad_catalog_v82'], aliases: ['combat sambo'], graphs: ['rounds', 'takedowns', 'submissions'], headline: 'Projections, controle, soumissions, rounds et intensite.' })],
        ['sepak_takraw', catalogSport({ label: 'Sepak takraw', xp: 9, cat: 'team', icon: 'ri-football-line', balanceProfile: 'team', group: 'Net team', programs: ['broad_catalog_v82'], aliases: ['takraw'], graphs: ['score_for', 'score_against', 'decisive_actions'], headline: 'Filet, acrobaties, touches, score et coordination.' })],
        ['show_jumping', catalogSport({ label: 'Saut d obstacles', xp: 7, cat: 'skill', icon: 'ri-horse-line', balanceProfile: 'skill', group: 'Equestrian', programs: ['broad_catalog_v82'], aliases: ['jumping', 'cso'], graphs: ['execution_quality', 'successful_actions', 'errors'], headline: 'Parcours, barres, refus, chrono et controle.' })],
        ['sitting_volleyball', catalogSport({ label: 'Volley assis', xp: 7, cat: 'team', icon: 'ri-volleyball-line', balanceProfile: 'team', group: 'Para team', programs: ['broad_catalog_v82'], aliases: ['sitting volleyball'], graphs: ['score_for', 'score_against', 'decisive_actions'], headline: 'Score, reception, attaque, bloc et placement.' })],
        ['skimboarding', catalogSport({ label: 'Skimboard', xp: 7, cat: 'outdoor', icon: 'ri-sailboat-line', balanceProfile: 'water', group: 'Board water', programs: ['broad_catalog_v82'], aliases: ['skimboard'], graphs: ['water_state', 'runs', 'fall_count'], headline: 'Runs, vagues, equilibre, tricks et chutes.' })],
        ['ski_orienteering', catalogSport({ label: 'Orientation a ski', unit: 'km', xp: 58, cat: 'outdoor', icon: 'ri-compass-3-line', formType: 'gps_full', balanceProfile: 'glide', group: 'Winter navigation', programs: ['broad_catalog_v82'], aliases: ['ski-o', 'ski orientation'], graphs: ['navigation', 'elevation', 'avg_hr'], headline: 'Distance, balises, D+, trace et navigation.' })],
        ['snooker', catalogSport({ label: 'Snooker', xp: 4, cat: 'skill', icon: 'ri-focus-3-line', balanceProfile: 'precision', group: 'Precision', programs: ['broad_catalog_v82'], aliases: ['billard anglais'], graphs: ['attempts', 'successful_actions', 'accuracy'], headline: 'Frames, precision, placements, serie et strategie.' })],
        ['speed_skiing', catalogSport({ label: 'Kilometre lance', xp: 7, cat: 'outdoor', icon: 'ri-speed-up-line', balanceProfile: 'glide', group: 'Winter speed', programs: ['broad_catalog_v82'], aliases: ['speed skiing'], graphs: ['runs', 'best_time', 'execution_quality'], headline: 'Runs, vitesse, ligne, engagement et securite.' })],
        ['sumo', catalogSport({ label: 'Sumo', xp: 8, cat: 'combat', icon: 'ri-boxing-line', balanceProfile: 'combat', group: 'Combat', programs: ['broad_catalog_v82'], aliases: ['sumo wrestling'], graphs: ['rounds', 'takedowns', 'execution_quality'], headline: 'Combats, poussee, equilibre, sorties et controle.' })],
        ['surfski', catalogSport({ label: 'Surfski', unit: 'km', xp: 45, cat: 'outdoor', icon: 'ri-ship-2-line', formType: 'gps_full', balanceProfile: 'water', group: 'Paddle water', programs: ['broad_catalog_v82'], aliases: ['surf ski'], graphs: ['stroke_rate', 'water_state', 'avg_power'], headline: 'Distance, houle, cadence, navigation et endurance.' })],
        ['tchoukball', catalogSport({ label: 'Tchoukball', xp: 8, cat: 'team', icon: 'ri-team-line', balanceProfile: 'team', group: 'Team court', programs: ['broad_catalog_v82'], aliases: ['tchouk'], graphs: ['score_for', 'score_against', 'decisive_actions'], headline: 'Tirs, receptions, placement, score et fair-play.' })],
        ['telemark_skiing', catalogSport({ label: 'Ski telemark', unit: 'km', xp: 28, cat: 'outdoor', icon: 'ri-snowflake-line', formType: 'gps_full', balanceProfile: 'glide', group: 'Winter', programs: ['broad_catalog_v82'], aliases: ['telemark'], graphs: ['runs', 'surface_state', 'fall_count'], headline: 'Descentes, virages, surface, engagement et technique.' })],
        ['tug_of_war', catalogSport({ label: 'Tir a la corde', xp: 8, cat: 'force', icon: 'ri-team-line', balanceProfile: 'strength', group: 'Strength team', programs: ['broad_catalog_v82'], aliases: ['tug of war'], graphs: ['rounds', 'successful_actions', 'execution_quality'], headline: 'Manches, force collective, ancrage et coordination.' })],
        ['underwater_hockey', catalogSport({ label: 'Hockey subaquatique', xp: 10, cat: 'team', icon: 'ri-drop-line', balanceProfile: 'water', group: 'Underwater team', programs: ['broad_catalog_v82'], aliases: ['octopush'], graphs: ['score_for', 'score_against', 'decisive_actions'], headline: 'Apnee, passes, palmes, score et defense.' })],
        ['underwater_rugby', catalogSport({ label: 'Rugby subaquatique', xp: 11, cat: 'team', icon: 'ri-drop-line', balanceProfile: 'water', group: 'Underwater team', programs: ['broad_catalog_v82'], aliases: ['underwater rugby'], graphs: ['score_for', 'score_against', 'decisive_actions'], headline: 'Apnee, contacts, passes, score et placements.' })],
        ['water_skiing', catalogSport({ label: 'Ski nautique', xp: 8, cat: 'outdoor', icon: 'ri-sailboat-line', balanceProfile: 'water', group: 'Tow water', programs: ['broad_catalog_v82'], aliases: ['waterski'], graphs: ['runs', 'tricks', 'fall_count'], headline: 'Runs, slalom, figures, chutes et conditions.' })],
        ['wheelchair_rugby', catalogSport({ label: 'Rugby fauteuil', xp: 9, cat: 'team', icon: 'ri-team-line', balanceProfile: 'team', group: 'Para team', programs: ['broad_catalog_v82'], aliases: ['murderball'], graphs: ['score_for', 'score_against', 'decisive_actions'], headline: 'Temps de jeu, contacts, score et actions decisives.' })],
        ['wheelchair_tennis', catalogSport({ label: 'Tennis fauteuil', xp: 8, cat: 'cardio', icon: 'ri-ping-pong-line', balanceProfile: 'racket', group: 'Para racket', programs: ['broad_catalog_v82'], aliases: ['wheelchair tennis'], graphs: ['sets_won', 'aces', 'unforced_errors'], headline: 'Sets, services, fautes, mobilite et endurance.' })],
        ['wushu', catalogSport({ label: 'Wushu', xp: 9, cat: 'combat', icon: 'ri-boxing-line', balanceProfile: 'combat', group: 'Combat', programs: ['broad_catalog_v82'], aliases: ['kung fu sportif', 'taolu', 'sanda'], graphs: ['rounds', 'combo_count', 'execution_quality'], headline: 'Taolu ou sanda, routines, rounds, vitesse et precision.' })]
    ]);

    const NON_SPORT_CATALOG_IDS = new Set([
        'diy',
        'moving',
        'sauna',
        'meditation',
        'vr_fitness',
        'stroller_walk',
        'hobby_horsing',
        'hobbyhorse',
        'quidditch'
    ]);

    Object.assign(INNOVATION_SPORTS, OLYMPIC_CATALOG_SPORTS, BROAD_CATALOG_SPORTS);

    const FEATURE_CATALOG = {
        free: [
            { id: 'segments', label: 'Segments TITAN', icon: 'ri-route-line', detail: 'Records personnels sur traces GPX.' },
            { id: 'heatmap', label: 'Heatmap privee', icon: 'ri-map-pin-range-line', detail: 'Zones les plus pratiquees, privees par defaut.' },
            { id: 'cloud_snapshot', label: 'Sauvegarde cloud', icon: 'ri-cloud-line', detail: 'Progression sauvegardee via Supabase.' },
            { id: 'smart_tags', label: 'Etiquettes de seance', icon: 'ri-price-tag-3-line', detail: 'Technique, endurance, force, recuperation, test, competition.' },
            { id: 'variety', label: 'Spectre sportif', icon: 'ri-radar-line', detail: 'Equilibre endurance, force, mobilite, technique.' },
            { id: 'records', label: 'Records par sport', icon: 'ri-trophy-line', detail: 'PR par distance, volume, duree, denivele et XP.' },
            { id: 'goals', label: 'Objectifs multi-sports', icon: 'ri-focus-3-line', detail: 'Semaine, mois, variety et discipline dominante.' },
            { id: 'smart_brief', label: 'Brief du jour', icon: 'ri-sparkling-2-line', detail: 'Une action claire au lieu de noyer sous les graphes.' },
            { id: 'sport_depth', label: 'Fiches enrichies', icon: 'ri-database-2-line', detail: 'Mesures adaptees au sport selectionne.' },
            { id: 'olympic_catalog', label: 'Catalogue JO', icon: 'ri-medal-line', detail: 'Sports ete LA28 et hiver Milano Cortina couverts.' },
            { id: 'post_summary', label: 'Resume post-seance', icon: 'ri-file-chart-line', detail: 'Charge, loot, records et prochain cap.' },
            { id: 'recovery', label: 'Recuperation simple', icon: 'ri-heart-pulse-line', detail: 'RPE, sommeil et charge recente.' },
            { id: 'week_compare', label: 'Comparaison semaine', icon: 'ri-bar-chart-grouped-line', detail: 'XP, charge, sessions et dynamique.' }
        ],
        premium: [
            { id: 'adaptive_coach', label: 'Coach du jour', icon: 'ri-brain-line', detail: 'Seance conseillee selon charge, recuperation et objectifs.' },
            { id: 'micro_cycle', label: 'Micro-cycle Elite', icon: 'ri-calendar-2-line', detail: 'Plan 5 jours lisible, sans t enfermer dans un programme rigide.' },
            { id: 'live_segments', label: 'Live Segments perso', icon: 'ri-timer-flash-line', detail: 'Watchlist de segments GPX a battre.' },
            { id: 'route_planner', label: 'Planificateur routes', icon: 'ri-map-2-line', detail: 'Idees de parcours selon distance, D+ et historique.' },
            { id: 'advanced_load', label: 'Charge lisible', icon: 'ri-pulse-line', detail: 'Court terme, fond habituel, forme et regularite.' },
            { id: 'weakness_scan', label: 'Scan des faiblesses', icon: 'ri-compass-3-line', detail: 'Repere ce que les apps classiques ratent: routine, diversite, recuperation.' },
            { id: 'monthly_report', label: 'Rapport mensuel Elite', icon: 'ri-article-line', detail: 'Bilan tactique du cycle en cours.' },
            { id: 'elite_comfort', label: 'Confort premium', icon: 'ri-shield-star-line', detail: 'Archives longues, cosmetiques et aucune publicite automatique.' }
        ]
    };

    const APP_DIFFERENTIATION = [
        {
            id: 'strava',
            app: 'Strava',
            strength: 'Segments, routes, heatmaps et energie sociale.',
            weakness: 'Peut pousser a la comparaison permanente et reste tres centre GPS/endurance.',
            titan: 'Garde les segments personnels, mais les rend prives, contextualises et relies au RPG.'
        },
        {
            id: 'trainingpeaks',
            app: 'TrainingPeaks',
            strength: 'Plans structures, coach, charge et metriques d endurance tres solides.',
            weakness: 'Peut devenir intimidant pour un sportif hybride ou casual.',
            titan: 'Transforme la charge en prochaine action simple, avec une lecture multisport plus ludique.'
        },
        {
            id: 'whoop',
            app: 'WHOOP',
            strength: 'Recuperation, sommeil, strain, stress et habitudes tres presents.',
            weakness: 'Depend fortement du wearable et peut devenir difficile a lire.',
            titan: 'Utilise des signaux declares et l historique sport pour rester utile sans materiel obligatoire.'
        },
        {
            id: 'garmin',
            app: 'Garmin Connect',
            strength: 'Donnees device, badges, courses, plans et metriques de performance riches.',
            weakness: 'Tres puissant, mais parfois fragmente et dependant de l ecosysteme Garmin.',
            titan: 'Reste lisible dans le navigateur, avec progression cloud et sports JO/insolites au meme endroit.'
        }
    ];

    const DATA_DICTIONARY = [
        { id: 'session', label: 'Trace sportive', icon: 'ri-edit-box-line', source: 'Formulaire Sport OS', meaning: 'Une seance enregistree avec discipline, valeur principale, duree, intensite et details utiles.', impact: 'Alimente XP, credits, charge, radar, records, coach, journal et aventure.' },
        { id: 'xp', label: 'XP', icon: 'ri-flashlight-line', source: 'Calcul serveur pour les comptes connectes', meaning: 'Score de progression donne par l effort reel, borne par les plafonds anti-abus.', impact: 'Fait monter le niveau et sert de signal de progression, pas de diagnostic medical.' },
        { id: 'credits', label: 'Credits', icon: 'ri-coin-line', source: 'Recompense encadree par semaine', meaning: 'Monnaie interne volontairement lente pour boutique, chat, guilde et actions sociales.', impact: 'Cree des choix sans rendre l achat de puissance obligatoire.' },
        { id: 'load', label: 'Charge', icon: 'ri-pulse-line', source: 'Duree x RPE x tags', meaning: 'Estimation simple de l effort recent. Plus la duree et le ressenti montent, plus la charge monte.', impact: 'Influence recuperation, fraicheur, coach, surcharge et retour au calme.' },
        { id: 'freshness', label: 'Fraicheur', icon: 'ri-heart-pulse-line', source: 'Charge 48h/7j + sommeil/nutrition declares', meaning: 'Indice de disponibilite du jour. Bas = prudence, haut = fenetre plus propre.', impact: 'Le coach reduit l intensite conseillee quand le signal est faible.' },
        { id: 'radar', label: 'Radar physique', icon: 'ri-radar-line', source: '90 derniers jours de traces', meaning: 'Synthese endurance, force, mobilite, technique, regularite, recuperation, explosivite et polyvalence.', impact: 'Fait evoluer classe, reputation, metier de campagne, boss et roles de guilde.' },
        { id: 'discipline_goal', label: 'Parcours discipline', icon: 'ri-focus-3-line', source: 'Historique par sport', meaning: 'Objectif propre a chaque sport: traces, meilleur pic, prochain seuil et action suivante.', impact: 'Transforme chaque pratique en chemin lisible, pas seulement en compteur global.' },
        { id: 'plateau', label: 'Plateau', icon: 'ri-speed-up-line', source: 'Comparaison des seances recentes similaires', meaning: 'Signal faible quand la moyenne recente ne progresse plus malgre assez de donnees.', impact: 'Propose variation, deload, technique ou reprise progressive au lieu de forcer.' },
        { id: 'context_record', label: 'Record contextualise', icon: 'ri-trophy-line', source: 'Historique filtre par contexte', meaning: 'Meilleur effort 30 jours, meilleure seance courte, retour apres absence, semaine reguliere.', impact: 'Valorise des progres que le record brut ne voit pas.' },
        { id: 'self_duel', label: 'Duel contre soi', icon: 'ri-mirror-line', source: 'Derniere trace vs trace comparable precedente', meaning: 'Compare une seance recente a une ancienne du meme sport ou format proche.', impact: 'Donne une competition personnelle sans classement public obligatoire.' },
        { id: 'smart_brief', label: 'Brief du jour', icon: 'ri-sparkling-2-line', source: 'Profil, charge, objectifs et historique', meaning: 'Lecture courte qui dit quoi faire, pourquoi, et quelle faiblesse classique eviter.', impact: 'Reduit la surcharge de graphes: une decision claire avant les details.' },
        { id: 'competitor_gap', label: 'Positionnement', icon: 'ri-compass-3-line', source: 'Lecture produit inspiree des grandes apps sport', meaning: 'Identifie ce que TITAN reprend, simplifie ou refuse: comparaison sociale, donnees opaques, device obligatoire, trop de chiffres bruts.', impact: 'Aide a garder un ADN propre: complet, original, mais respirable.' },
        { id: 'boss_mechanic', label: 'Mecanique boss', icon: 'ri-sword-line', source: 'Faiblesse, phase, preparation 14j et radar', meaning: 'Un boss reagit mieux a certains types de preparation sportive.', impact: 'Relie RPG et entrainement reel sans transformer les boss en simples sacs a PV.' },
        { id: 'journal', label: 'Journal d aventure', icon: 'ri-book-read-line', source: 'Evenements automatiques', meaning: 'Chronique des records, retours, signaux coach, classes, metiers et victoires.', impact: 'Raconte la progression personnelle sans exposer les donnees publiquement.' },
        { id: 'elite', label: 'Elite', icon: 'ri-vip-crown-2-line', source: 'Statut abonnement', meaning: 'Ajoute profondeur, analyses longues, plans et cosmetiques pour 5 euros.', impact: 'Ne doit pas donner de recompense critique injuste ni bloquer le suivi gratuit.' }
    ];

    const TITLES = [
        { id: 'title-recruit', label: 'Recrue Titan', icon: 'ri-shield-line', test: () => true },
        { id: 'title-regular', label: 'Operateur Regulier', icon: 'ri-calendar-check-line', test: s => s.sessions >= 10 },
        { id: 'title-hybrid', label: 'Spectre Hybride', icon: 'ri-radar-line', test: s => s.varietyScore >= 72 },
        { id: 'title-record', label: 'Briseur de Repere', icon: 'ri-speed-up-line', test: s => s.records >= 3 },
        { id: 'title-hunter', label: 'Chasseur de Menaces', icon: 'ri-sword-line', test: s => s.defeated >= 10 },
        { id: 'title-boss', label: 'Briseur Alpha', icon: 'ri-vip-diamond-line', test: s => s.bossKills >= 3 }
    ];

    const ZONES = [
        { id: 'zone-01', name: 'Citadelle Basse', range: [1, 4], desc: 'Secteurs d initiation, menaces instables.' },
        { id: 'zone-02', name: 'Anneau Ferrite', range: [5, 9], desc: 'Couloirs industriels et signaux parasites.' },
        { id: 'zone-03', name: 'Faille Cinetique', range: [10, 16], desc: 'Territoire de chasse des entites rapides.' },
        { id: 'zone-04', name: 'Noyau Helios', range: [17, 99], desc: 'Theatre des menaces Alpha longue duree.' }
    ];

    const QUALITY_KEYS = ['endurance', 'force', 'mobility', 'technique', 'regularity', 'recovery', 'explosivity', 'versatility'];
    const QUALITY_META = {
        endurance: { label: 'Endurance', icon: 'ri-road-map-line', color: '#38bdf8' },
        force: { label: 'Force', icon: 'ri-boxing-line', color: '#fb7185' },
        mobility: { label: 'Mobilite', icon: 'ri-body-scan-line', color: '#a78bfa' },
        technique: { label: 'Technique', icon: 'ri-compass-3-line', color: '#9ee7ff' },
        regularity: { label: 'Regularite', icon: 'ri-calendar-check-line', color: '#10b981' },
        recovery: { label: 'Recuperation', icon: 'ri-heart-pulse-line', color: '#4ade80' },
        explosivity: { label: 'Explosivite', icon: 'ri-flashlight-line', color: '#7edcff' },
        versatility: { label: 'Polyvalence', icon: 'ri-radar-line', color: '#22d3ee' }
    };

    const ARCHETYPES = {
        recruit: { id: 'recruit', label: 'Recrue Titan', icon: 'ri-shield-line', subclass: 'En calibrage' },
        vanguard: { id: 'vanguard', label: 'Vanguard', icon: 'ri-shield-star-line', subclass: 'Force reguliere' },
        ghost_runner: { id: 'ghost_runner', label: 'Ghost Runner', icon: 'ri-run-line', subclass: 'Endurance constante' },
        iron_monk: { id: 'iron_monk', label: 'Iron Monk', icon: 'ri-mental-health-line', subclass: 'Recuperation disciplinee' },
        storm_striker: { id: 'storm_striker', label: 'Storm Striker', icon: 'ri-flashlight-fill', subclass: 'Impact explosif' },
        pathfinder: { id: 'pathfinder', label: 'Pathfinder', icon: 'ri-route-line', subclass: 'Terrain long' },
        architect: { id: 'architect', label: 'Architect', icon: 'ri-node-tree', subclass: 'Polyvalence tactique' },
        revenant: { id: 'revenant', label: 'Revenant', icon: 'ri-restart-line', subclass: 'Retour actif' },
        bastion: { id: 'bastion', label: 'Bastion', icon: 'ri-safe-2-line', subclass: 'Force sous controle' },
        velocity_blade: { id: 'velocity_blade', label: 'Velocity Blade', icon: 'ri-speed-up-line', subclass: 'Vitesse tranchee' }
    };

    const BOSS_MECHANICS = {
        force: { id: 'fortress_breaker', label: 'Brise-forteresse', brief: 'Demande force ou full body recent pour ouvrir la garde.', requiredFamily: 'force', bonus: 1.16, penalty: 0.9 },
        cardio: { id: 'long_war', label: 'Guerre longue', brief: 'Repond mieux au volume cardio et a la constance.', requiredFamily: 'cardio', bonus: 1.14, penalty: 0.92 },
        outdoor: { id: 'terrain_hunt', label: 'Chasse terrain', brief: 'Les traces outdoor et les sorties longues stabilisent la fenetre.', requiredFamily: 'outdoor', bonus: 1.14, penalty: 0.92 },
        recovery: { id: 'fatigue_hazard', label: 'Noyau toxique', brief: 'Attaquer en surcharge ferme la faille. Recuperation conseillee.', requiredFamily: 'recovery', bonus: 1.18, penalty: 0.86 },
        technique: { id: 'tactical_shell', label: 'Coque tactique', brief: 'Les seances techniques, precision ou combat ciblent mieux ses failles.', requiredFamily: 'technique', bonus: 1.15, penalty: 0.91 }
    };

    const TALENT_CONSTELLATIONS = [
        { id: 'body', label: 'Corps', icon: 'ri-boxing-line', theme: '#fb7185', examples: ['Surcharge Controlee', 'Bastion Progressif', 'Ancrage Lourd'] },
        { id: 'breath', label: 'Souffle', icon: 'ri-windy-line', theme: '#38bdf8', examples: ['Guerre Longue', 'Seuil Calme', 'Retour Aerobie'] },
        { id: 'technique', label: 'Technique', icon: 'ri-compass-3-line', theme: '#9ee7ff', examples: ['Lame Patiente', 'Precision Fatale', 'Lecture Terrain'] },
        { id: 'recovery', label: 'Recuperation', icon: 'ri-heart-pulse-line', theme: '#4ade80', examples: ['Serment du Repos', 'Bouclier Deload', 'Fenetre Claire'] },
        { id: 'command', label: 'Commandement', icon: 'ri-team-line', theme: '#a78bfa', examples: ['Architecte du Cycle', 'Ordre de Raid', 'Ancre de Retour'] }
    ];

    const CAMPAIGN_PROFESSIONS = [
        { id: 'cartographer', label: 'Cartographe d effort', icon: 'ri-route-line', clue: 'exploration, endurance, sorties longues' },
        { id: 'forgewarden', label: 'Forgeron du cycle', icon: 'ri-hammer-line', clue: 'force, construction lente, regularite' },
        { id: 'watchkeeper', label: 'Veilleur de recuperation', icon: 'ri-heart-pulse-line', clue: 'recuperation, prudence, protection de streak' },
        { id: 'cadence_architect', label: 'Architecte de cadence', icon: 'ri-node-tree', clue: 'polyvalence, semaine equilibree, planification' },
        { id: 'impact_engineer', label: 'Ingenieur d impact', icon: 'ri-flashlight-line', clue: 'explosivite, intensite courte, combat' },
        { id: 'threshold_chronicler', label: 'Chroniqueur du seuil', icon: 'ri-book-read-line', clue: 'records, plateau, analyse, journal' },
        { id: 'relay_strategist', label: 'Stratege de relais', icon: 'ri-team-line', clue: 'guilde, role collectif, objectifs partages' }
    ];

    const GUILD_ROLES = [
        { id: 'anchor', label: 'Ancre', icon: 'ri-anchor-line', hint: 'regularite et recuperation' },
        { id: 'scout', label: 'Eclaireur', icon: 'ri-route-line', hint: 'outdoor et endurance' },
        { id: 'breaker', label: 'Briseur', icon: 'ri-boxing-line', hint: 'force et impact' },
        { id: 'caller', label: 'Cadenceur', icon: 'ri-timer-flash-line', hint: 'polyvalence et rythme' }
    ];

    function parseDate(value) {
        const d = new Date(value);
        return Number.isFinite(d.getTime()) ? d : new Date();
    }

    function startOfDay(d = new Date()) {
        return new Date(d.getFullYear(), d.getMonth(), d.getDate());
    }

    function weekStart(d = new Date()) {
        const day = d.getDay() || 7;
        const start = startOfDay(d);
        start.setDate(start.getDate() - day + 1);
        return start;
    }

    function clamp(value, min, max) {
        return Math.max(min, Math.min(max, value));
    }

    function sportConfig(sportKey) {
        return (window.SPORTS_CONFIG && window.SPORTS_CONFIG[sportKey]) ? window.SPORTS_CONFIG[sportKey] : {};
    }

    function sportLabel(sportKey) {
        return sportConfig(sportKey).label || sportKey || 'Discipline';
    }

    function ensureInnovationSports(config = window.SPORTS_CONFIG) {
        if (!config || typeof config !== 'object') return config;
        NON_SPORT_CATALOG_IDS.forEach(id => {
            if (Object.prototype.hasOwnProperty.call(config, id)) delete config[id];
        });
        Object.entries(INNOVATION_SPORTS).forEach(([id, sport]) => {
            if (!config[id]) {
                config[id] = Object.assign({
                    extraFields: [],
                    xpRules: {},
                    validationRules: {},
                    trackingSummary: {}
                }, sport);
            } else {
                config[id] = Object.assign({
                    extraFields: [],
                    xpRules: {},
                    validationRules: {},
                    trackingSummary: {}
                }, sport, config[id]);
            }
        });
        return config;
    }

    function getSportFamily(logOrKey) {
        const key = typeof logOrKey === 'string' ? logOrKey : logOrKey?.sport;
        const cat = (sportConfig(key).cat || logOrKey?.cat || '').toLowerCase();
        const profile = String(sportConfig(key).balanceProfile || '').toLowerCase();
        if (cat.includes('muscu') || cat.includes('force') || cat.includes('strength')) return 'force';
        if (cat.includes('cardio') || cat.includes('crossfit')) return 'cardio';
        if (cat.includes('outdoor') || cat.includes('gps')) return 'outdoor';
        if (cat.includes('mobil') || cat.includes('health') || cat.includes('recovery')) return 'recovery';
        if (profile === 'climbing' || profile === 'skill' || profile === 'racket' || profile === 'team') return 'skill';
        return 'general';
    }

    function getDuration(log) {
        const det = log?.details || {};
        const fromVal2 = parseFloat(det.val2);
        if (Number.isFinite(fromVal2) && fromVal2 > 0) return fromVal2;
        if (log?.unit === 'min') return parseFloat(log.val) || 0;
        if (log?.unit === 'h') return (parseFloat(log.val) || 0) * 60;
        return Math.max(12, Math.min(90, (parseFloat(log?.xp) || 80) / 6));
    }

    function getSessionLoad(log) {
        const det = log?.details || {};
        const rpe = parseInt(det.bio?.rpe || 5, 10);
        const duration = getDuration(log);
        const tags = Array.isArray(det.tags) ? det.tags : [];
        const tagMult = tags.reduce((mult, tag) => mult * (TAGS[tag]?.load || 1), 1);
        return Math.max(1, Math.round(duration * clamp(rpe || 5, 1, 10) * tagMult));
    }

    function notesLimit(user = window.state?.user) {
        return user && user.is_elite === true ? NOTE_LIMIT_ELITE : NOTE_LIMIT_STD;
    }

    function sanitizeNote(note, user) {
        const limit = notesLimit(user);
        return String(note || '').replace(/\s+/g, ' ').trim().slice(0, limit);
    }

    function sanitizeTags(tags) {
        const list = Array.isArray(tags) ? tags : [];
        return list.filter(tag => Object.prototype.hasOwnProperty.call(TAGS, tag)).slice(0, 3);
    }

    function toNumber(value, fallback = 0) {
        const n = parseFloat(String(value ?? '').replace(',', '.'));
        return Number.isFinite(n) ? n : fallback;
    }

    function textBlob(key = '', conf = {}) {
        return `${key} ${conf.label || ''} ${conf.cat || ''} ${conf.formType || ''}`.toLowerCase();
    }

    function hasAny(text, terms) {
        return terms.some(term => text.includes(term));
    }

    function inferSportProfile(key = '', conf = {}) {
        const text = textBlob(key, conf);
        const id = String(key || '').toLowerCase();
        if (INNOVATION_SPORTS[id]?.balanceProfile) return INNOVATION_SPORTS[id].balanceProfile;
        if (id === 'soccer' || id === 'futsal' || hasAny(text, ['football', 'futsal', 'soccer'])) return 'football';
        if (hasAny(text, ['velo', 'cycling', 'bike', 'vtt', 'gravel', 'bmx', 'spinning', 'velotaf'])) return 'cycling';
        if (hasAny(text, ['trail'])) return 'trail';
        if (hasAny(text, ['course', 'running', 'jog', 'sprint', 'tapis', 'haies', 'orientation'])) return 'running';
        if (hasAny(text, ['randon', 'marche', 'trek', 'raquettes', 'alpinisme', 'via ferrata'])) return 'hiking';
        if (hasAny(text, ['natation', 'nage', 'swim', 'water polo'])) return 'swimming';
        if (hasAny(text, ['tennis', 'badminton', 'padel', 'squash', 'ping', 'pickleball'])) return 'racket';
        if (hasAny(text, ['basket', 'handball', 'rugby', 'volley', 'hockey', 'baseball', 'softball', 'cricket', 'lacrosse', 'ultimate', 'flag football', 'football americain'])) return 'team';
        if (hasAny(text, ['boxe', 'mma', 'judo', 'karate', 'kick', 'muay', 'savate', 'lutte', 'combat', 'krav', 'kendo', 'aikido', 'bjj', 'taekwondo', 'kung fu', 'escrime'])) return 'combat';
        if (hasAny(text, ['escalade', 'bloc', 'voie', 'grimpe', 'climb', 'boulder', 'bouldering'])) return 'climbing';
        if (hasAny(text, ['muscu', 'force', 'pompes', 'tractions', 'squat', 'dips', 'haltero', 'powerlifting', 'strongman', 'kettlebell', 'street workout', 'gainage', 'abdos', 'sandbag'])) return 'strength';
        if (hasAny(text, ['crossfit', 'hiit', 'tabata', 'circuit', 'trx', 'pentathlon', 'triathlon'])) return 'mixed';
        if (hasAny(text, ['yoga', 'pilates', 'stretching', 'qigong', 'tai chi', 'meditation', 'sauna'])) return 'mobility';
        if (hasAny(text, ['kayak', 'canoe', 'aviron', 'rowing', 'paddle', 'surf', 'kitesurf', 'wakeboard', 'windsurf', 'voile', 'plongee', 'plongeon'])) return 'water';
        if (hasAny(text, ['ski', 'snowboard', 'patinage', 'roller', 'skate', 'bobsleigh', 'luge', 'skeleton', 'short track'])) return 'glide';
        if (hasAny(text, ['danse', 'zumba', 'salsa', 'ballet', 'hip-hop', 'pole dance', 'cirque', 'parkour', 'gymnastique'])) return 'skill';
        if (hasAny(text, ['tir', 'shooting', 'archery', 'arc', 'golf', 'bowling', 'flechettes', 'curling'])) return 'precision';
        if (String(conf.formType || '').includes('gps')) return 'outdoor';
        return 'generic';
    }

    function sportFieldTemplates(profile) {
        const common = [
            { id: 'session_type', label: 'Type de seance', type: 'select', options: ['Technique', 'Endurance', 'Intensite', 'Recuperation', 'Competition'], xpWeight: 3 },
            { id: 'execution_quality', label: 'Qualite execution', type: 'select', options: ['Basse', 'Correcte', 'Bonne', 'Excellente'], xpWeight: 4 },
            { id: 'successful_actions', label: 'Actions reussies', type: 'number', min: 0, max: 500, step: 1, xpWeight: 0.35, xpCap: 35 }
        ];

        const byProfile = {
            football: [
                { id: 'position', label: 'Poste', type: 'select', options: ['Gardien', 'Defenseur', 'Milieu', 'Attaquant'] },
                { id: 'minutes_played', label: 'Temps joue', type: 'number', min: 0, max: 130, step: 1, unit: 'min' },
                { id: 'goals', label: 'Buts', type: 'number', min: 0, max: 20, step: 1, xpWeight: 10, xpCap: 45, visibleWhen: { field: 'position', in: ['Milieu', 'Attaquant'] } },
                { id: 'assists', label: 'Passes decisives', type: 'number', min: 0, max: 20, step: 1, xpWeight: 7, xpCap: 35, visibleWhen: { field: 'position', in: ['Milieu', 'Attaquant'] } },
                { id: 'shots_on_target', label: 'Tirs cadres', type: 'number', min: 0, max: 30, step: 1, xpWeight: 2, xpCap: 24, visibleWhen: { field: 'position', in: ['Milieu', 'Attaquant'] } },
                { id: 'successful_tackles', label: 'Tacles/interceptions', type: 'number', min: 0, max: 80, step: 1, xpWeight: 1.2, xpCap: 32, visibleWhen: { field: 'position', in: ['Defenseur', 'Milieu'] } },
                { id: 'saves', label: 'Arrets', type: 'number', min: 0, max: 50, step: 1, xpWeight: 2.5, xpCap: 40, visibleWhen: { field: 'position', equals: 'Gardien' } },
                { id: 'clean_sheet', label: 'Clean sheet', type: 'checkbox', xpWeight: 18, visibleWhen: { field: 'position', equals: 'Gardien' } }
            ],
            cycling: [
                { id: 'bike_type', label: 'Type de velo', type: 'select', options: ['Route', 'VTT', 'Gravel', 'Home trainer', 'Velotaf'] },
                { id: 'route_profile', label: 'Profil parcours', type: 'select', options: ['Plat', 'Vallonne', 'Cote', 'Montagne'] },
                { id: 'avg_power', label: 'Puissance moyenne', type: 'number', min: 0, max: 700, step: 1, unit: 'W', xpWeight: 0.03, xpCap: 18 },
                { id: 'cadence', label: 'Cadence', type: 'number', min: 30, max: 170, step: 1, unit: 'rpm' },
                { id: 'sprints', label: 'Sprints', type: 'number', min: 0, max: 60, step: 1, xpWeight: 2, xpCap: 24 }
            ],
            running: [
                { id: 'session_type', label: 'Type de seance', type: 'select', options: ['Endurance', 'Tempo', 'Fractionne', 'Cote', 'Recuperation'], xpWeight: 3 },
                { id: 'surface', label: 'Surface', type: 'select', options: ['Route', 'Piste', 'Chemin', 'Tapis'] },
                { id: 'intervals', label: 'Repetitions', type: 'number', min: 0, max: 80, step: 1, xpWeight: 1.6, xpCap: 28 },
                { id: 'avg_hr', label: 'FC moyenne', type: 'number', min: 60, max: 230, step: 1, unit: 'bpm' },
                { id: 'cadence', label: 'Cadence', type: 'number', min: 80, max: 230, step: 1, unit: 'ppm' }
            ],
            trail: [
                { id: 'technicality', label: 'Technicite', type: 'select', options: ['Roulant', 'Sentier', 'Technique', 'Alpin'], xpWeight: 5 },
                { id: 'surface', label: 'Terrain', type: 'select', options: ['Sec', 'Boue', 'Rocaille', 'Neige'] },
                { id: 'downhill_focus', label: 'Descente travaillee', type: 'checkbox', xpWeight: 10 },
                { id: 'fueling_count', label: 'Ravitaillements', type: 'number', min: 0, max: 20, step: 1, xpWeight: 2, xpCap: 18 },
                { id: 'avg_hr', label: 'FC moyenne', type: 'number', min: 60, max: 230, step: 1, unit: 'bpm' }
            ],
            hiking: [
                { id: 'pack_weight', label: 'Sac porte', type: 'number', min: 0, max: 35, step: 0.5, unit: 'kg', xpWeight: 0.9, xpCap: 18 },
                { id: 'technicality', label: 'Technicite', type: 'select', options: ['Facile', 'Sentier', 'Technique', 'Alpin'], xpWeight: 4 },
                { id: 'surface', label: 'Terrain dominant', type: 'select', options: ['Route', 'Sentier', 'Boue', 'Neige', 'Rocaille'] },
                { id: 'navigation', label: 'Navigation autonome', type: 'checkbox', xpWeight: 12 },
                { id: 'pause_count', label: 'Pauses longues', type: 'number', min: 0, max: 20, step: 1 }
            ],
            swimming: [
                { id: 'stroke', label: 'Nage dominante', type: 'select', options: ['Crawl', 'Brasse', 'Dos', 'Papillon', 'Mixte'] },
                { id: 'pool_length', label: 'Longueur bassin', type: 'select', options: ['25m', '50m', 'Eau libre'] },
                { id: 'drills', label: 'Educatifs', type: 'number', min: 0, max: 40, step: 1, xpWeight: 2, xpCap: 20 },
                { id: 'breath_pattern', label: 'Respiration', type: 'select', options: ['2 temps', '3 temps', '5 temps', 'Hypoxie'] },
                { id: 'swolf', label: 'SWOLF', type: 'number', min: 10, max: 120, step: 1 }
            ],
            racket: [
                { id: 'match_result', label: 'Resultat', type: 'select', options: ['Victoire', 'Defaite', 'Nul', 'Entrainement'], xpWeight: 4 },
                { id: 'sets_won', label: 'Sets gagnes', type: 'number', min: 0, max: 10, step: 1, xpWeight: 5, xpCap: 22 },
                { id: 'aces', label: 'Aces / points directs', type: 'number', min: 0, max: 80, step: 1, xpWeight: 1, xpCap: 24 },
                { id: 'unforced_errors', label: 'Fautes directes', type: 'number', min: 0, max: 120, step: 1 },
                { id: 'rally_quality', label: 'Qualite echanges', type: 'select', options: ['Basse', 'Stable', 'Haute', 'Elite'] }
            ],
            team: [
                { id: 'role', label: 'Role', type: 'select', options: ['Defense', 'Milieu', 'Attaque', 'Polyvalent', 'Gardien'] },
                { id: 'score_for', label: 'Score equipe', type: 'number', min: 0, max: 200, step: 1 },
                { id: 'score_against', label: 'Score adverse', type: 'number', min: 0, max: 200, step: 1 },
                { id: 'decisive_actions', label: 'Actions decisives', type: 'number', min: 0, max: 80, step: 1, xpWeight: 2.5, xpCap: 30 },
                { id: 'defensive_actions', label: 'Actions defensives', type: 'number', min: 0, max: 120, step: 1, xpWeight: 1, xpCap: 28 }
            ],
            combat: [
                { id: 'discipline_mode', label: 'Travail', type: 'select', options: ['Technique', 'Sparring', 'Sac', 'Pao', 'Sol', 'Competition'], xpWeight: 4 },
                { id: 'rounds', label: 'Rounds', type: 'number', min: 0, max: 40, step: 1, xpWeight: 2.4, xpCap: 32 },
                { id: 'significant_strikes', label: 'Frappes propres', type: 'number', min: 0, max: 500, step: 1, xpWeight: 0.12, xpCap: 28 },
                { id: 'takedowns', label: 'Projections/takedowns', type: 'number', min: 0, max: 80, step: 1, xpWeight: 1.4, xpCap: 28 },
                { id: 'submissions', label: 'Soumissions', type: 'number', min: 0, max: 50, step: 1, xpWeight: 1.6, xpCap: 26 }
            ],
            strength: [
                { id: 'focus', label: 'Focus', type: 'select', options: ['Haut du corps', 'Bas du corps', 'Full body', 'Core', 'Tirage', 'Poussee'] },
                { id: 'muscle_group', label: 'Groupe principal', type: 'select', options: ['Pectoraux', 'Dos', 'Jambes', 'Epaules', 'Bras', 'Core', 'Full body'] },
                { id: 'top_set_weight', label: 'Top set', type: 'number', min: 0, max: 500, step: 0.5, unit: 'kg', xpWeight: 0.08, xpCap: 24 },
                { id: 'rest_seconds', label: 'Repos moyen', type: 'number', min: 0, max: 600, step: 5, unit: 's' },
                { id: 'failure_sets', label: 'Series a l echec', type: 'number', min: 0, max: 30, step: 1, xpWeight: 2, xpCap: 24 },
                { id: 'tempo', label: 'Tempo controle', type: 'select', options: ['Normal', 'Lent', 'Explosif', 'Pause'] },
                { id: 'mobility_prep', label: 'Echauffement mobilite', type: 'checkbox', xpWeight: 8 },
                { id: 'record_attempt', label: 'Tentative record', type: 'checkbox', xpWeight: 8 }
            ],
            climbing: [
                { id: 'climb_type', label: 'Format', type: 'select', options: ['Bloc', 'Voie', 'Moulinette', 'Tete', 'Pan', 'Exterieur'], xpWeight: 3 },
                { id: 'max_attempted', label: 'Niveau max tente', type: 'text', placeholder: 'Ex: 6b, 7A, V5' },
                { id: 'max_done', label: 'Niveau max reussi', type: 'text', placeholder: 'Ex: 6a+, 6C, V4' },
                { id: 'attempts', label: 'Essais utiles', type: 'number', min: 0, max: 120, step: 1, xpWeight: 0.7, xpCap: 24 },
                { id: 'successful_routes', label: 'Blocs / voies reussis', type: 'number', min: 0, max: 80, step: 1, xpWeight: 1.4, xpCap: 30 },
                { id: 'style', label: 'Style dominant', type: 'select', options: ['Dalle', 'Vertical', 'Devers', 'Physique', 'Technique', 'Coordination'], xpWeight: 3 },
                { id: 'fall_count', label: 'Chutes', type: 'number', min: 0, max: 80, step: 1 }
            ],
            mixed: [
                { id: 'format', label: 'Format', type: 'select', options: ['AMRAP', 'EMOM', 'For time', 'Circuit', 'Tabata'], xpWeight: 4 },
                { id: 'rounds', label: 'Rounds', type: 'number', min: 0, max: 60, step: 1, xpWeight: 1.8, xpCap: 28 },
                { id: 'movements', label: 'Mouvements', type: 'number', min: 1, max: 30, step: 1, xpWeight: 1.3, xpCap: 22 },
                { id: 'rx', label: 'Format RX', type: 'checkbox', xpWeight: 14 },
                { id: 'score', label: 'Score', type: 'number', min: 0, max: 10000, step: 1 }
            ],
            mobility: [
                { id: 'focus_area', label: 'Zone cible', type: 'select', options: ['Hanches', 'Dos', 'Epaules', 'Chevilles', 'Full body'] },
                { id: 'hold_seconds', label: 'Maintiens longs', type: 'number', min: 0, max: 3600, step: 5, unit: 's', xpWeight: 0.012, xpCap: 18 },
                { id: 'breathing', label: 'Respiration guidee', type: 'checkbox', xpWeight: 6 },
                { id: 'pain_before', label: 'Douleur avant', type: 'number', min: 0, max: 10, step: 1 },
                { id: 'pain_after', label: 'Douleur apres', type: 'number', min: 0, max: 10, step: 1 }
            ],
            water: [
                { id: 'water_state', label: 'Etat eau/vent', type: 'select', options: ['Calme', 'Clapot', 'Vagues', 'Fort'] },
                { id: 'tech_drills', label: 'Drills techniques', type: 'number', min: 0, max: 60, step: 1, xpWeight: 1.2, xpCap: 22 },
                { id: 'falls', label: 'Chutes', type: 'number', min: 0, max: 80, step: 1 },
                { id: 'autonomy', label: 'Autonomie complete', type: 'checkbox', xpWeight: 10 }
            ],
            glide: [
                { id: 'surface_state', label: 'Etat surface', type: 'select', options: ['Facile', 'Variable', 'Glace', 'Poudreuse', 'Park'] },
                { id: 'runs', label: 'Descentes / runs', type: 'number', min: 0, max: 80, step: 1, xpWeight: 1.1, xpCap: 24 },
                { id: 'tricks', label: 'Figures propres', type: 'number', min: 0, max: 80, step: 1, xpWeight: 1.6, xpCap: 26 },
                { id: 'fall_count', label: 'Chutes', type: 'number', min: 0, max: 80, step: 1 }
            ],
            skill: [
                { id: 'routine_type', label: 'Format', type: 'select', options: ['Technique', 'Routine', 'Impro', 'Renfo', 'Spectacle'] },
                { id: 'combo_count', label: 'Combos / sequences', type: 'number', min: 0, max: 120, step: 1, xpWeight: 0.9, xpCap: 24 },
                { id: 'precision', label: 'Precision', type: 'select', options: ['Basse', 'Correcte', 'Bonne', 'Excellente'], xpWeight: 3 },
                { id: 'mobility_work', label: 'Mobilite travaillee', type: 'checkbox', xpWeight: 8 }
            ],
            precision: [
                { id: 'attempts', label: 'Tentatives', type: 'number', min: 0, max: 500, step: 1 },
                { id: 'successful_actions', label: 'Reussites', type: 'number', min: 0, max: 500, step: 1, xpWeight: 0.28, xpCap: 28 },
                { id: 'accuracy', label: 'Precision', type: 'number', min: 0, max: 100, step: 1, unit: '%', xpWeight: 0.12, xpCap: 12 },
                { id: 'pressure_set', label: 'Serie sous pression', type: 'checkbox', xpWeight: 8 }
            ]
        };

        return byProfile[profile] || common;
    }

    function eliteFieldTemplates(profile) {
        const base = [
            { id: 'elite_objective', label: 'Elite: objectif micro-cycle', type: 'select', options: ['Base', 'Technique', 'Charge', 'Deload', 'Test'], eliteOnly: true },
            { id: 'elite_quality_score', label: 'Elite: qualite percue', type: 'number', min: 1, max: 10, step: 1, xpWeight: 1.2, xpCap: 10, eliteOnly: true },
            { id: 'elite_recovery_note', label: 'Elite: signal recup', type: 'select', options: ['Normal', 'Fatigue locale', 'Corps lourd', 'Tres frais'], eliteOnly: true }
        ];
        const specific = {
            football: [{ id: 'elite_duels_won', label: 'Elite: duels gagnes', type: 'number', min: 0, max: 80, step: 1, xpWeight: 0.35, xpCap: 10, eliteOnly: true }],
            cycling: [{ id: 'elite_wind', label: 'Elite: vent dominant', type: 'select', options: ['Neutre', 'Face', 'Dos', 'Laterale'], eliteOnly: true }],
            running: [{ id: 'elite_zone_target', label: 'Elite: zone cible tenue', type: 'checkbox', xpWeight: 8, eliteOnly: true }],
            trail: [{ id: 'elite_descent_quality', label: 'Elite: descente propre', type: 'checkbox', xpWeight: 8, eliteOnly: true }],
            strength: [{ id: 'elite_rir', label: 'Elite: RIR moyen', type: 'number', min: 0, max: 8, step: 1, eliteOnly: true }],
            climbing: [{ id: 'elite_crux', label: 'Elite: crux identifie', type: 'select', options: ['Lecture', 'Pieds', 'Gainage', 'Doigts', 'Coordination'], eliteOnly: true }],
            combat: [{ id: 'elite_control', label: 'Elite: controle sparring', type: 'select', options: ['Subi', 'Stable', 'Dominant', 'Technique'], eliteOnly: true }],
            swimming: [{ id: 'elite_pace_control', label: 'Elite: allure tenue', type: 'checkbox', xpWeight: 8, eliteOnly: true }]
        };
        return base.concat(specific[profile] || []);
    }

    function mergeFields(baseFields, extraFields) {
        const seen = new Set();
        return []
            .concat(Array.isArray(baseFields) ? baseFields : [])
            .concat(Array.isArray(extraFields) ? extraFields : [])
            .filter(field => {
                if (!field || !field.id || seen.has(field.id)) return false;
                seen.add(field.id);
                return true;
            });
    }

    function enhanceSportConfig(key, conf) {
        if (!conf || typeof conf !== 'object') return conf;
        const profile = conf.balanceProfile && conf.balanceProfile !== 'generic'
            ? conf.balanceProfile
            : inferSportProfile(key, conf);
        const generated = sportFieldTemplates(profile);
        const hasSpecificFields = Array.isArray(conf.extraFields) && conf.extraFields.length > 0 && conf.balanceProfile && conf.balanceProfile !== 'generic';
        conf.balanceProfile = profile;
        conf.extraFields = mergeFields(hasSpecificFields ? conf.extraFields : generated, eliteFieldTemplates(profile));
        conf.xpRules = Object.assign({}, conf.xpRules || {}, categoryDefaults(Object.assign({}, conf, { balanceProfile: profile })));
        return conf;
    }

    function enhanceSportsConfig(config = window.SPORTS_CONFIG) {
        if (!config || typeof config !== 'object') return config;
        ensureInnovationSports(config);
        Object.keys(config).forEach(key => enhanceSportConfig(key, config[key]));
        return config;
    }

    function fieldIsVisible(field, extras = {}) {
        const rule = field?.visibleWhen || field?.visible_if || field?.showWhen || null;
        if (!rule || !rule.field) return true;
        const current = extras[rule.field];
        if (Array.isArray(rule.in)) return rule.in.map(String).includes(String(current));
        if (Array.isArray(rule.values)) return rule.values.map(String).includes(String(current));
        if (Object.prototype.hasOwnProperty.call(rule, 'equals')) return String(current) === String(rule.equals);
        if (Object.prototype.hasOwnProperty.call(rule, 'not')) return String(current) !== String(rule.not);
        return true;
    }

    function normalizeExtraFields(fields) {
        return Array.isArray(fields) ? fields
            .filter(field => field && field.id)
            .map(field => ({
                id: String(field.id).replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 48),
                label: String(field.label || field.id).slice(0, 80),
                type: ['number', 'select', 'text', 'checkbox'].includes(field.type) ? field.type : 'text',
                options: Array.isArray(field.options) ? field.options.map(opt => String(opt).slice(0, 60)).slice(0, 18) : [],
                placeholder: String(field.placeholder || '').slice(0, 80),
                min: Number.isFinite(parseFloat(field.min)) ? parseFloat(field.min) : null,
                max: Number.isFinite(parseFloat(field.max)) ? parseFloat(field.max) : null,
                step: field.step || null,
                unit: String(field.unit || '').slice(0, 16),
                xpWeight: Number.isFinite(parseFloat(field.xpWeight)) ? parseFloat(field.xpWeight) : 0,
                xpCap: Number.isFinite(parseFloat(field.xpCap)) ? parseFloat(field.xpCap) : null,
                eliteOnly: field.eliteOnly === true || field.elite_only === true,
                visibleWhen: field.visibleWhen || field.visible_if || field.showWhen || null,
                chart: field.chart !== false && (field.chart === true || field.track === true || field.type === 'number'),
                aggregate: ['sum', 'avg', 'max', 'min'].includes(field.aggregate) ? field.aggregate : 'avg',
                higherIsBetter: field.higherIsBetter !== false && field.higher_is_better !== false,
                priority: Number.isFinite(parseInt(field.priority, 10)) ? parseInt(field.priority, 10) : 50,
                group: String(field.group || '').slice(0, 40),
                coachHint: String(field.coachHint || field.coach_hint || '').replace(/\s+/g, ' ').trim().slice(0, 180)
            }))
            .filter(field => !field.eliteOnly || window.state?.user?.is_elite === true) : [];
    }

    function sanitizeExtras(extras, sportKey) {
        const clean = {};
        const conf = sportConfig(sportKey);
        const fields = normalizeExtraFields(conf.extraFields);
        const raw = extras && typeof extras === 'object' ? extras : {};

        fields.forEach(field => {
            if (!Object.prototype.hasOwnProperty.call(raw, field.id)) return;
            if (!fieldIsVisible(field, Object.assign({}, raw, clean))) return;

            const value = raw[field.id];
            if (field.type === 'number') {
                let n = toNumber(value, NaN);
                if (!Number.isFinite(n)) return;
                if (field.min !== null) n = Math.max(field.min, n);
                if (field.max !== null) n = Math.min(field.max, n);
                clean[field.id] = Number(n.toFixed(2));
                return;
            }

            if (field.type === 'select') {
                const str = String(value || '').slice(0, 60);
                if (field.options.length && !field.options.includes(str)) return;
                clean[field.id] = str;
                return;
            }

            if (field.type === 'checkbox') {
                clean[field.id] = value === true || value === 'true' || value === 'on' || value === '1';
                return;
            }

            clean[field.id] = String(value || '').replace(/\s+/g, ' ').trim().slice(0, 120);
        });

        if (raw.terrain) clean.terrain = String(raw.terrain).replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 32);
        return clean;
    }

    function sanitizeExercises(exercises) {
        if (!Array.isArray(exercises)) return [];
        return exercises.slice(0, 80).map(ex => {
            const setRows = Array.isArray(ex?.setRows) ? ex.setRows.slice(0, 30).map(set => ({
                weight: Math.max(0, Math.min(toNumber(set?.weight, 0), 1000)),
                reps: Math.max(1, Math.min(parseInt(set?.reps || 0, 10) || 1, 500)),
                rir: Math.max(0, Math.min(parseInt(set?.rir || 0, 10) || 0, 10))
            })) : [];
            const sets = setRows.length || Math.max(0, Math.min(parseInt(ex?.sets || 0, 10) || 0, 100));
            const totalReps = setRows.length ? setRows.reduce((sum, set) => sum + set.reps, 0) : Math.max(0, Math.min(parseInt(ex?.totalReps || 0, 10) || 0, 50000));
            const volume = setRows.length ? setRows.reduce((sum, set) => sum + (set.weight * set.reps), 0) : Math.max(0, Math.min(toNumber(ex?.volume, 0), 10000000));
            return {
                name: String(ex?.name || '').replace(/\s+/g, ' ').trim().slice(0, 80),
                weight: Math.max(0, Math.min(toNumber(ex?.weight, 0), 1000)),
                sets,
                reps: Math.max(0, Math.min(parseInt(ex?.reps || 0, 10) || 0, 500)),
                rir: Math.max(0, Math.min(parseInt(ex?.rir || 0, 10) || 0, 10)),
                totalReps,
                volume,
                setRows,
                notes: String(ex?.notes || '').replace(/\s+/g, ' ').trim().slice(0, 180)
            };
        }).filter(ex => ex.name && ex.sets > 0 && ex.reps > 0);
    }

    function limitPath(path, user) {
        if (!Array.isArray(path)) return path;
        const maxPoints = user && user.is_elite === true ? 900 : 320;
        if (path.length <= maxPoints) return path;
        const step = Math.ceil(path.length / maxPoints);
        return path.filter((_, idx) => idx % step === 0).slice(0, maxPoints);
    }

    function sanitizeSessionDetails(details, user = window.state?.user, sportKey = '') {
        if (!details || typeof details !== 'object') return {};
        details.val1 = Math.max(0, Math.min(toNumber(details.val1, 0), 1000000));
        details.val2 = Math.max(0, Math.min(toNumber(details.val2, 0), 2880));
        details.elevation = Math.max(0, Math.min(toNumber(details.elevation, 0), 12000));
        details.exercises = sanitizeExercises(details.exercises);
        const performedAt = new Date(details.performedAt || '');
        details.performedAt = Number.isFinite(performedAt.getTime()) && performedAt.getTime() <= Date.now() + 60000
            ? performedAt.toISOString()
            : '';
        details.note = sanitizeNote(details.note, user);
        details.tags = sanitizeTags(details.tags);
        details.extras = sanitizeExtras(details.extras, sportKey);
        details.gpxPath = limitPath(details.gpxPath, user);
        if (details.gpxStats) {
            details.gpxStats = {
                pace: details.gpxStats.pace || '',
                speed: details.gpxStats.speed || '',
                points: Math.min(parseInt(details.gpxStats.points || 0, 10), user?.is_elite ? 900 : 320),
                rawPoints: Math.min(parseInt(details.gpxStats.rawPoints || 0, 10), 25000),
                cleanPoints: Math.min(parseInt(details.gpxStats.cleanPoints || 0, 10), 25000),
                ignoredPoints: Math.min(parseInt(details.gpxStats.ignoredPoints || 0, 10), 25000),
                movingMinutes: Math.max(0, Math.min(toNumber(details.gpxStats.movingMinutes, 0), 1440)),
                elapsedMinutes: Math.max(0, Math.min(toNumber(details.gpxStats.elapsedMinutes, 0), 1440)),
                ascent: Math.max(0, Math.min(toNumber(details.gpxStats.ascent, 0), 12000)),
                descent: Math.max(0, Math.min(toNumber(details.gpxStats.descent, 0), 12000))
            };
        }
        return details;
    }

    function metricReading(value) {
        const n = parseFloat(String(value ?? '').replace(',', '.'));
        return Number.isFinite(n) ? n : null;
    }

    function metricDisplay(value, unit = '', digits = 1) {
        if (typeof value === 'boolean') return value ? 'Oui' : 'Non';
        if (typeof value === 'string') return value;
        if (!Number.isFinite(Number(value))) return '--';
        const rendered = Number(value).toLocaleString('fr-FR', { maximumFractionDigits: digits });
        return unit ? `${rendered} ${unit}` : rendered;
    }

    function metricDuration(log) {
        const det = log?.details || {};
        const moving = metricReading(det.gpxStats?.movingMinutes);
        if (moving && moving > 0) return moving;
        const val2 = metricReading(det.val2);
        if (val2 && val2 > 0) return val2;
        if (log?.unit === 'min') return metricReading(log.val) || 0;
        if (log?.unit === 'h') return (metricReading(log.val) || 0) * 60;
        return 0;
    }

    function metricPaceMinutes(value) {
        const match = String(value || '').match(/(\d+):(\d+)/);
        if (!match) return null;
        return Number(match[1]) + Number(match[2]) / 60;
    }

    function sessionMetricDefinitions(sportKey) {
        const conf = sportConfig(sportKey);
        const base = [
            { id: 'xp', label: 'XP', unit: 'XP', type: 'number', source: 'xp', chart: true, aggregate: 'sum', higherIsBetter: true, priority: 5 },
            { id: 'load', label: 'Charge', unit: '', type: 'number', source: 'load', chart: true, aggregate: 'avg', higherIsBetter: false, priority: 8 },
            { id: 'duration', label: 'Duree', unit: 'min', type: 'number', source: 'duration', chart: true, aggregate: 'sum', higherIsBetter: true, priority: 10 },
            { id: 'distance', label: 'Distance', unit: 'km', type: 'number', source: 'distance', chart: true, aggregate: 'sum', higherIsBetter: true, priority: 12 },
            { id: 'elevation', label: 'Denivele', unit: 'm', type: 'number', source: 'elevation', chart: true, aggregate: 'sum', higherIsBetter: true, priority: 18 },
            { id: 'rpe', label: 'RPE', unit: '/10', type: 'number', source: 'rpe', chart: true, aggregate: 'avg', higherIsBetter: false, priority: 20 },
            { id: 'pace', label: 'Allure', unit: 'min/km', type: 'number', source: 'pace', chart: true, aggregate: 'min', higherIsBetter: false, priority: 24 }
        ];
        const extras = normalizeExtraFields(conf.extraFields).map(field => ({
            id: `extra:${field.id}`,
            fieldId: field.id,
            label: field.label,
            unit: field.unit,
            type: field.type,
            source: 'extra',
            chart: field.chart,
            aggregate: field.aggregate,
            higherIsBetter: field.higherIsBetter,
            priority: field.priority,
            group: field.group,
            coachHint: field.coachHint
        }));
        return base.concat(extras);
    }

    function readSessionMetric(log, definition) {
        const det = log?.details || {};
        if (!definition) return { present: false, value: null, numeric: null, display: '--' };

        let value = null;
        let present = false;
        if (definition.source === 'extra') {
            const extras = det.extras && typeof det.extras === 'object' ? det.extras : {};
            present = Object.prototype.hasOwnProperty.call(extras, definition.fieldId) && extras[definition.fieldId] !== '';
            value = present ? extras[definition.fieldId] : null;
        } else if (definition.source === 'xp') {
            value = metricReading(log?.xp);
            present = value !== null;
        } else if (definition.source === 'load') {
            value = metricReading(det.load);
            if (!value && log) value = getSessionLoad(log);
            present = value !== null && value > 0;
        } else if (definition.source === 'duration') {
            value = metricDuration(log);
            present = value > 0;
        } else if (definition.source === 'distance') {
            value = log?.unit === 'km' ? metricReading(log.val) : metricReading(det.val1);
            present = value !== null && value > 0 && (log?.unit === 'km' || det.val1 !== undefined);
        } else if (definition.source === 'elevation') {
            value = metricReading(det.gpxStats?.ascent);
            if (!value) value = metricReading(det.elevation);
            present = value !== null && value > 0;
        } else if (definition.source === 'rpe') {
            value = metricReading(det.bio?.rpe);
            present = value !== null && value > 0;
        } else if (definition.source === 'pace') {
            value = metricPaceMinutes(det.gpxStats?.pace);
            const duration = metricDuration(log);
            const distance = log?.unit === 'km' ? metricReading(log.val) : metricReading(det.val1);
            if (!value && duration > 0 && distance > 0) value = duration / distance;
            present = value !== null && value > 0;
        }

        const numeric = definition.type === 'number' ? metricReading(value) : null;
        return {
            definition,
            present,
            value,
            numeric,
            display: present ? metricDisplay(definition.type === 'number' ? numeric : value, definition.unit, definition.id === 'pace' ? 2 : 1) : '--'
        };
    }

    function collectSessionMetrics(log, options = {}) {
        return sessionMetricDefinitions(log?.sport)
            .map(definition => readSessionMetric(log, definition))
            .filter(metric => metric.present)
            .filter(metric => !options.chartable || metric.definition.chart === true)
            .filter(metric => !options.numericOnly || metric.numeric !== null)
            .sort((a, b) => (a.definition.priority || 50) - (b.definition.priority || 50));
    }

    function sessionMetricTrends(log, history = window.state?.history || []) {
        const sessionTime = parseDate(log?.date).getTime();
        const previous = history
            .filter(item => item && item.sport === log?.sport && item !== log)
            .filter(item => parseDate(item.date).getTime() <= sessionTime)
            .sort((a, b) => parseDate(b.date) - parseDate(a.date))
            .slice(0, 8);

        return collectSessionMetrics(log, { chartable: true, numericOnly: true })
            .map(metric => {
                const series = previous
                    .map(item => readSessionMetric(item, metric.definition))
                    .filter(item => item.present && item.numeric !== null)
                    .map(item => item.numeric);
                if (!series.length) return null;
                const average = series.reduce((sum, value) => sum + value, 0) / series.length;
                const delta = metric.numeric - average;
                const usefulDelta = metric.definition.higherIsBetter === false ? -delta : delta;
                return Object.assign({}, metric, {
                    average,
                    delta,
                    count: series.length,
                    status: usefulDelta > 0 ? 'up' : (usefulDelta < 0 ? 'down' : 'flat')
                });
            })
            .filter(Boolean)
            .sort((a, b) => (a.definition.priority || 50) - (b.definition.priority || 50));
    }

    function sessionCoachingReadout(log, history = window.state?.history || []) {
        const det = log?.details || {};
        const trends = sessionMetricTrends(log, history);
        const lead = trends.find(item => item.count >= 2) || trends[0] || null;
        const recovery = recoverySnapshot(history);
        const fields = normalizeExtraFields(sportConfig(log?.sport).extraFields);
        const extras = det.extras || {};
        const missingTracked = fields
            .filter(field => field.chart === true && !Object.prototype.hasOwnProperty.call(extras, field.id))
            .slice(0, 2);
        const bullets = [];

        if (lead) {
            const delta = Math.abs(lead.delta);
            const direction = lead.status === 'up' ? 'au-dessus' : (lead.status === 'down' ? 'sous' : 'au niveau');
            bullets.push(`${lead.definition.label}: ${lead.display}, ${direction} de la moyenne des ${lead.count} dernieres traces (${metricDisplay(delta, lead.definition.unit, lead.definition.id === 'pace' ? 2 : 1)} d ecart).`);
        }
        if (recovery.restRecommended || Number(det.bio?.rpe || 0) >= 8) {
            bullets.push(recovery.restRecommended
                ? `Charge recente haute: la recuperation est ${recovery.status.toLowerCase()}, protege la prochaine seance intense.`
                : 'RPE eleve: compare la prochaine seance sur la qualite d execution avant de monter le volume.');
        }
        if (missingTracked.length) {
            bullets.push(`Pour les graphes de ce sport, ajoute ${missingTracked.map(field => field.label.toLowerCase()).join(' et ')} a la prochaine trace.`);
        }
        if (!det.bio?.rpe) {
            bullets.push('Ajoute un RPE pour relier performance, charge et recuperation.');
        }
        const coach = window.state?.user?.coachSnapshot;
        if (coach?.nextCap) bullets.push(`Cap suivant: ${coach.nextCap}`);

        return {
            headline: lead?.status === 'up'
                ? 'Progression mesurable'
                : (recovery.restRecommended ? 'Charge a proteger' : 'Trace exploitable'),
            bullets: bullets.slice(0, 4),
            trends: trends.slice(0, 4),
            trackedCount: collectSessionMetrics(log, { chartable: true, numericOnly: true }).length
        };
    }

    function recoverySnapshot(history = window.state?.history || []) {
        const now = new Date();
        const last48 = history.filter(log => now - parseDate(log.date) <= 2 * DAY_MS);
        const last7 = history.filter(log => now - parseDate(log.date) <= 7 * DAY_MS);
        const load48 = last48.reduce((sum, log) => sum + getSessionLoad(log), 0);
        const load7 = last7.reduce((sum, log) => sum + getSessionLoad(log), 0);
        const lastBio = [...history].reverse().find(log => log.details?.bio)?.details?.bio || {};
        const sleep = parseInt(lastBio.sleep || 3, 10);
        const nutrition = parseInt(lastBio.nutrition || 3, 10);
        let score = 100 - Math.round(load48 / 14) - Math.round(load7 / 90);
        if (sleep <= 2) score -= 12;
        if (nutrition <= 2) score -= 6;
        if (sleep >= 5) score += 5;
        score = clamp(score, 0, 100);
        let status = 'FRAIS';
        let color = '#4ade80';
        let desc = 'Fenetre propre. Tu peux pousser si la technique reste solide.';
        let penaltyMultiplier = 1;
        if (score < 65) {
            status = 'SOUS TENSION';
            color = '#9ee7ff';
            desc = 'Charge elevee. Une seance controlee garde la progression nette.';
        }
        if (score < 42) {
            status = 'CRITIQUE';
            color = '#ef4444';
            desc = 'Surcharge detectee. TITAN reduit legerement la recompense pour privilegier la recuperation.';
            penaltyMultiplier = 0.82;
        }
        if (score < 25) {
            penaltyMultiplier = 0.7;
        }
        return { score, status, color, desc, load48, load7, penaltyMultiplier, restRecommended: score < 42 };
    }

    function weekComparison(history = window.state?.history || []) {
        const currentStart = weekStart();
        const previousStart = new Date(currentStart.getTime() - 7 * DAY_MS);
        const current = history.filter(log => parseDate(log.date) >= currentStart);
        const previous = history.filter(log => parseDate(log.date) >= previousStart && parseDate(log.date) < currentStart);
        const sum = logs => ({
            sessions: logs.length,
            xp: logs.reduce((acc, log) => acc + (parseFloat(log.xp) || 0), 0),
            load: logs.reduce((acc, log) => acc + getSessionLoad(log), 0)
        });
        const c = sum(current);
        const p = sum(previous);
        return {
            current: c,
            previous: p,
            xpDelta: c.xp - p.xp,
            loadDelta: c.load - p.load,
            sessionDelta: c.sessions - p.sessions
        };
    }

    function varietyMatrix(history = window.state?.history || []) {
        const last28 = history.filter(log => new Date() - parseDate(log.date) <= 28 * DAY_MS);
        const families = {};
        last28.forEach(log => {
            const family = getSportFamily(log);
            families[family] = (families[family] || 0) + getSessionLoad(log);
        });
        const values = Object.values(families);
        const total = values.reduce((a, b) => a + b, 0);
        const activeFamilies = values.filter(v => v > 0).length;
        let balance = 0;
        if (total > 0 && activeFamilies > 0) {
            const ideal = total / activeFamilies;
            const drift = values.reduce((acc, v) => acc + Math.abs(v - ideal), 0) / total;
            balance = clamp(100 - Math.round(drift * 75), 0, 100);
        }
        const score = clamp(Math.round((activeFamilies * 18) + (balance * 0.55)), 0, 100);
        let label = 'Monocorde';
        if (score >= 40) label = 'Stable';
        if (score >= 68) label = 'Polyvalent';
        if (score >= 84) label = 'Spectre hybride';
        return { score, label, families, totalLoad: total, activeFamilies };
    }

    function favoriteSports(limit = 4, history = window.state?.history || []) {
        const counts = {};
        history.forEach(log => { counts[log.sport] = (counts[log.sport] || 0) + 1; });
        return Object.entries(counts)
            .sort((a, b) => b[1] - a[1])
            .slice(0, limit)
            .map(([sport, count]) => ({ sport, count, label: sportLabel(sport), icon: sportConfig(sport).icon || 'ri-flashlight-line' }));
    }

    function emptyQualityVector() {
        return QUALITY_KEYS.reduce((acc, key) => {
            acc[key] = 0;
            return acc;
        }, {});
    }

    function addQuality(vector, key, amount) {
        if (!Object.prototype.hasOwnProperty.call(vector, key)) return;
        vector[key] += Math.max(0, Number(amount) || 0);
    }

    function qualityWeights(log = {}) {
        const vector = emptyQualityVector();
        const family = getSportFamily(log);
        const profile = inferSportProfile(log.sport, sportConfig(log.sport));
        const tags = Array.isArray(log.details?.tags) ? log.details.tags : [];
        const rpe = parseInt(log.details?.bio?.rpe || 5, 10);

        addQuality(vector, 'regularity', 0.8);
        if (family === 'cardio') addQuality(vector, 'endurance', 1.35);
        if (family === 'force') addQuality(vector, 'force', 1.45);
        if (family === 'outdoor') {
            addQuality(vector, 'endurance', 1.05);
            addQuality(vector, 'versatility', 0.45);
        }
        if (family === 'recovery') {
            addQuality(vector, 'recovery', 1.35);
            addQuality(vector, 'mobility', 0.85);
        }

        if (['combat', 'racket', 'team', 'football', 'skill', 'precision'].includes(profile)) addQuality(vector, 'technique', 1.05);
        if (['running', 'trail', 'cycling', 'swimming', 'hiking', 'outdoor'].includes(profile)) addQuality(vector, 'endurance', 0.65);
        if (['strength', 'mixed', 'combat'].includes(profile)) addQuality(vector, 'force', 0.75);
        if (['running', 'combat', 'team', 'football', 'mixed', 'glide'].includes(profile)) addQuality(vector, 'explosivity', 0.55);
        if (['mobility', 'skill', 'water', 'glide'].includes(profile)) addQuality(vector, 'mobility', 0.55);

        if (tags.includes('technique')) addQuality(vector, 'technique', 0.85);
        if (tags.includes('endurance')) addQuality(vector, 'endurance', 0.75);
        if (tags.includes('force')) addQuality(vector, 'force', 0.75);
        if (tags.includes('recovery')) addQuality(vector, 'recovery', 1.15);
        if (tags.includes('test') || tags.includes('competition')) addQuality(vector, 'explosivity', 0.7);
        if (rpe >= 8) addQuality(vector, 'explosivity', 0.35);

        return vector;
    }

    function physicalRadar(history = window.state?.history || []) {
        const vector = emptyQualityVector();
        const now = new Date();
        const relevant = history
            .filter(log => now - parseDate(log.date) <= 90 * DAY_MS)
            .slice(-180);

        relevant.forEach(log => {
            const weights = qualityWeights(log);
            const ageDays = Math.max(0, (now - parseDate(log.date)) / DAY_MS);
            const recency = clamp(1 - (ageDays / 120), 0.35, 1);
            const load = Math.max(8, getSessionLoad(log));
            const impact = clamp(Math.sqrt(load) * 2.5, 6, 46) * recency;
            QUALITY_KEYS.forEach(key => addQuality(vector, key, weights[key] * impact));
        });

        const sportCount = new Set(relevant.map(log => log.sport).filter(Boolean)).size;
        const familyCount = new Set(relevant.map(log => getSportFamily(log)).filter(Boolean)).size;
        addQuality(vector, 'versatility', (sportCount * 10) + (familyCount * 7));

        const activeDays = new Set(relevant.map(log => String(log.date || '').slice(0, 10))).size;
        addQuality(vector, 'regularity', activeDays * 7);

        const axes = QUALITY_KEYS.map(key => {
            const raw = vector[key] || 0;
            return Object.assign({
                id: key,
                score: clamp(Math.round(Math.sqrt(raw) * 9), 0, 100),
                raw: Math.round(raw)
            }, QUALITY_META[key]);
        });
        const dominant = axes.slice().sort((a, b) => b.score - a.score)[0] || null;
        const weak = axes.slice().sort((a, b) => a.score - b.score)[0] || null;
        return {
            axes,
            dominant,
            weak,
            updatedAt: new Date().toISOString(),
            sampleSize: relevant.length,
            score: axes.length ? Math.round(axes.reduce((sum, axis) => sum + axis.score, 0) / axes.length) : 0
        };
    }

    function topQualityContributions(log) {
        const weights = qualityWeights(log);
        return Object.entries(weights)
            .filter(([, value]) => value > 0)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 3)
            .map(([id, weight]) => Object.assign({ id, weight: Number(weight.toFixed(2)) }, QUALITY_META[id]));
    }

    function buildDisciplineGoal(sport, history = window.state?.history || []) {
        const logs = history.filter(log => log.sport === sport);
        const label = sportLabel(sport);
        const total = logs.length;
        const bestXp = logs.reduce((max, log) => Math.max(max, parseFloat(log.xp) || 0), 0);
        const last = logs[logs.length - 1] || null;
        const thresholds = [3, 5, 10, 25, 50, 100, 200];
        const nextCount = thresholds.find(target => total < target) || (Math.ceil((total + 1) / 100) * 100);
        const progress = clamp(Math.round((total / nextCount) * 100), 0, 100);
        const lastSummary = last?.details?.summary || '';
        let nextAction = `Atteindre ${nextCount} seance(s) en ${label}.`;
        if (bestXp > 0 && total >= 3) nextAction = `Tenter une seance plus propre que ton pic a ${Math.round(bestXp)} XP.`;
        if (lastSummary && /recuperation|controlee/i.test(lastSummary)) nextAction = `Reprendre ${label} sans forcer, puis viser la regularite.`;
        return {
            sport,
            label,
            total,
            bestXp: Math.round(bestXp),
            nextCount,
            progress,
            nextAction,
            updatedAt: new Date().toISOString()
        };
    }

    function syncDisciplineGoals(history = window.state?.history || []) {
        const goals = {};
        const sports = [...new Set(history.map(log => log.sport).filter(Boolean))].slice(-24);
        sports.forEach(sport => {
            goals[sport] = buildDisciplineGoal(sport, history);
        });
        if (window.state?.user) window.state.user.disciplineGoals = goals;
        return goals;
    }

    function detectTrainingImbalances(history = window.state?.history || []) {
        const now = new Date();
        const last28 = history.filter(log => now - parseDate(log.date) <= 28 * DAY_MS);
        const last14 = history.filter(log => now - parseDate(log.date) <= 14 * DAY_MS);
        const last10 = history.filter(log => now - parseDate(log.date) <= 10 * DAY_MS);
        const alerts = [];
        if (!last28.length) return alerts;

        const recoveryLogs = last10.filter(log => getSportFamily(log) === 'recovery' || (log.details?.tags || []).includes('recovery'));
        if (!recoveryLogs.length && last10.length >= 4) {
            alerts.push({ id: 'recovery_gap', severity: 'warn', label: 'Recuperation absente', detail: 'Aucune trace de recuperation recente malgre plusieurs seances.' });
        }

        const familyLoad = {};
        last28.forEach(log => { familyLoad[getSportFamily(log)] = (familyLoad[getSportFamily(log)] || 0) + getSessionLoad(log); });
        const totalLoad = Object.values(familyLoad).reduce((sum, value) => sum + value, 0);
        const dominantFamily = Object.entries(familyLoad).sort((a, b) => b[1] - a[1])[0];
        if (dominantFamily && totalLoad > 0 && dominantFamily[1] / totalLoad > 0.78 && last28.length >= 5) {
            alerts.push({ id: 'monotony', severity: 'info', label: 'Risque de monotonie', detail: `${weaknessLabel(dominantFamily[0])} domine presque tout le bloc 28j.` });
        }

        const last3 = last14.slice(-3);
        const avgRpe = last3.reduce((sum, log) => sum + (parseInt(log.details?.bio?.rpe || 0, 10) || 0), 0) / Math.max(1, last3.length);
        if (last3.length >= 3 && avgRpe >= 8) {
            alerts.push({ id: 'high_intensity_stack', severity: 'warn', label: 'Intensite empilee', detail: 'Trois traces recentes signalent une intensite haute.' });
        }

        const techniqueRecent = last14.some(log => (log.details?.tags || []).includes('technique') || ['combat', 'racket', 'team', 'football', 'skill', 'precision'].includes(inferSportProfile(log.sport, sportConfig(log.sport))));
        if (!techniqueRecent && last14.length >= 4) {
            alerts.push({ id: 'technique_gap', severity: 'info', label: 'Technique peu visible', detail: 'Ajoute une seance technique ou precision pour equilibrer le signal.' });
        }

        return alerts.slice(0, window.state?.user?.is_elite ? 6 : 3);
    }

    function deriveArchetype(radar = physicalRadar(), history = window.state?.history || []) {
        const scores = Object.fromEntries((radar.axes || []).map(axis => [axis.id, axis.score]));
        const now = new Date();
        const lastGapDays = history.length ? Math.floor((now - parseDate(history[history.length - 1].date)) / DAY_MS) : 999;
        let picked = ARCHETYPES.recruit;
        let reason = 'Ajoute quelques traces pour stabiliser ta classe.';

        if (history.length >= 1 && lastGapDays >= 14) {
            picked = ARCHETYPES.revenant;
            reason = 'Retour apres une coupure detectee.';
        } else if ((scores.force || 0) >= 58 && (scores.recovery || 0) >= 46) {
            picked = ARCHETYPES.bastion;
            reason = 'Force solide avec controle de la recuperation.';
        } else if ((scores.force || 0) >= 56 && (scores.regularity || 0) >= 48) {
            picked = ARCHETYPES.vanguard;
            reason = 'Force et regularite dominent ton profil.';
        } else if ((scores.endurance || 0) >= 58 && (scores.regularity || 0) >= 45) {
            picked = ARCHETYPES.ghost_runner;
            reason = 'Endurance recurrente et rythme stable.';
        } else if ((scores.mobility || 0) >= 48 && (scores.recovery || 0) >= 48) {
            picked = ARCHETYPES.iron_monk;
            reason = 'Mobilite et recuperation structurent ta progression.';
        } else if ((scores.explosivity || 0) >= 55 && (scores.technique || 0) >= 38) {
            picked = ARCHETYPES.storm_striker;
            reason = 'Impact rapide, intensite et technique ressortent.';
        } else if ((scores.endurance || 0) >= 48 && favoriteSports(1, history)[0] && ['trail', 'hiking', 'cycling', 'running', 'outdoor'].includes(inferSportProfile(favoriteSports(1, history)[0].sport, sportConfig(favoriteSports(1, history)[0].sport)))) {
            picked = ARCHETYPES.pathfinder;
            reason = 'Le terrain et les efforts longs reviennent souvent.';
        } else if ((scores.versatility || 0) >= 55 || (scores.technique || 0) >= 50) {
            picked = ARCHETYPES.architect;
            reason = 'Profil varie, technique et adaptable.';
        } else if ((scores.explosivity || 0) >= 50 && (scores.endurance || 0) >= 42) {
            picked = ARCHETYPES.velocity_blade;
            reason = 'Vitesse et endurance se croisent.';
        }

        const second = (radar.axes || [])
            .filter(axis => axis.score >= 35 && axis.id !== radar.dominant?.id)
            .sort((a, b) => b.score - a.score)[0];
        return Object.assign({}, picked, {
            subclass: second ? `${picked.subclass} / ${second.label}` : picked.subclass,
            reason,
            dominantQuality: radar.dominant?.id || null,
            updatedAt: new Date().toISOString()
        });
    }

    function deriveReputation(radar = physicalRadar(), history = window.state?.history || []) {
        const scores = Object.fromEntries((radar.axes || []).map(axis => [axis.id, axis.score]));
        const bestiary = window.state?.game?.bestiary || {};
        const bossKills = Object.values(bestiary).filter(entry => entry.type === 'BOSS' && entry.defeated).length;
        const guildId = window.state?.user?.guild_id || null;
        const traits = [];
        if ((scores.regularity || 0) >= 45) traits.push('Regulier');
        if ((scores.versatility || 0) >= 50) traits.push('Hybride');
        if ((scores.endurance || 0) >= 55) traits.push('Endurant');
        if ((scores.explosivity || 0) >= 50) traits.push('Sprinter');
        if ((scores.technique || 0) >= 45) traits.push('Technicien');
        if ((scores.recovery || 0) >= 45) traits.push('Recuperateur');
        if (bossKills > 0) traits.push('Chasseur Alpha');
        if (guildId) traits.push('Pilier de Guilde');
        if (history.length >= 12 && traits.length < 2) traits.push('Tenace');
        if (!traits.length) traits.push('En construction');
        const primary = traits[0];
        return {
            primary,
            traits: traits.slice(1, 3),
            score: radar.score || 0,
            bossKills,
            updatedAt: new Date().toISOString()
        };
    }

    function deriveCampaignProfession(radar = physicalRadar(), history = window.state?.history || []) {
        const scores = Object.fromEntries((radar.axes || []).map(axis => [axis.id, axis.score]));
        const records = Object.values(window.state?.user?.records || {}).reduce((sum, sportRecords) => sum + Object.keys(sportRecords || {}).length, 0);
        const hasGuild = !!(window.state?.user?.guild_id || window.state?.social?.guild?.id);
        const profile = {
            cartographer: (scores.endurance || 0) + (scores.versatility || 0) * 0.35,
            forgewarden: (scores.force || 0) + (scores.regularity || 0) * 0.45,
            watchkeeper: (scores.recovery || 0) + Math.max(0, 60 - (scores.explosivity || 0)) * 0.25,
            cadence_architect: (scores.versatility || 0) + (scores.regularity || 0) * 0.55,
            impact_engineer: (scores.explosivity || 0) + (scores.technique || 0) * 0.35,
            threshold_chronicler: records * 12 + Math.min(history.length, 18),
            relay_strategist: hasGuild ? 85 + (scores.regularity || 0) * 0.2 : 0
        };
        const picked = CAMPAIGN_PROFESSIONS
            .map(job => Object.assign({}, job, { score: Math.round(profile[job.id] || 0) }))
            .sort((a, b) => b.score - a.score)[0] || CAMPAIGN_PROFESSIONS[0];
        const secondary = CAMPAIGN_PROFESSIONS
            .filter(job => job.id !== picked.id)
            .map(job => Object.assign({}, job, { score: Math.round(profile[job.id] || 0) }))
            .sort((a, b) => b.score - a.score)[0] || null;
        return {
            id: picked.id,
            label: picked.label,
            icon: picked.icon,
            clue: picked.clue,
            score: picked.score,
            secondary: secondary ? { id: secondary.id, label: secondary.label, icon: secondary.icon } : null,
            updatedAt: new Date().toISOString()
        };
    }

    function deriveGuildRole(radar = physicalRadar()) {
        const scores = Object.fromEntries((radar.axes || []).map(axis => [axis.id, axis.score]));
        const roleScores = {
            anchor: (scores.regularity || 0) + (scores.recovery || 0),
            scout: (scores.endurance || 0) + (scores.versatility || 0) * 0.5,
            breaker: (scores.force || 0) + (scores.explosivity || 0) * 0.65,
            caller: (scores.versatility || 0) + (scores.technique || 0) * 0.45
        };
        const role = GUILD_ROLES
            .map(item => Object.assign({}, item, { score: Math.round(roleScores[item.id] || 0) }))
            .sort((a, b) => b.score - a.score)[0] || GUILD_ROLES[0];
        return Object.assign({ updatedAt: new Date().toISOString() }, role);
    }

    function buildFreshnessScore(history = window.state?.history || []) {
        const recovery = recoverySnapshot(history);
        const since = Date.now() - 7 * DAY_MS;
        const recent = history.filter(log => parseDate(log.date).getTime() >= since);
        const load = recent.reduce((sum, log) => sum + getSessionLoad(log), 0);
        const densityPenalty = Math.min(24, Math.floor(load / 180));
        const painPenalty = Math.max(0, 70 - (recovery.score || 70)) * 0.45;
        const score = clamp(Math.round((recovery.score || 70) - densityPenalty - painPenalty + Math.min(8, recent.length)), 5, 98);
        const status = score >= 76 ? 'PRET' : (score >= 55 ? 'STABLE' : (score >= 38 ? 'PRUDENT' : 'RECUPERATION'));
        const color = score >= 76 ? '#58d68d' : (score >= 55 ? '#d7e8f2' : '#ee6c6c');
        return {
            score,
            status,
            color,
            load,
            recoveryScore: recovery.score,
            advice: score < 45 ? 'Garde une action courte ou recuperation.' : (score < 65 ? 'Avance proprement, evite le test max.' : 'Fenetre correcte pour progresser.'),
            updatedAt: new Date().toISOString()
        };
    }

    function buildLoadCalendar(history = window.state?.history || []) {
        const today = startOfDay(new Date());
        return Array.from({ length: 7 }).map((_, index) => {
            const d = new Date(today);
            d.setDate(today.getDate() - (6 - index));
            const key = d.toISOString().slice(0, 10);
            const logs = history.filter(log => String(log.date || '').slice(0, 10) === key);
            const load = logs.reduce((sum, log) => sum + getSessionLoad(log), 0);
            const label = load <= 0 ? 'Repos' : (load < 260 ? 'Leger' : (load < 620 ? 'Normal' : 'Intense'));
            return { date: key, day: d.toLocaleDateString('fr-FR', { weekday: 'short' }), load, label, sessions: logs.length };
        });
    }

    function detectReturnPlan(history = window.state?.history || []) {
        if (!history.length) return null;
        const last = history.slice().sort((a, b) => parseDate(b.date) - parseDate(a.date))[0];
        const daysAway = Math.floor((Date.now() - parseDate(last.date).getTime()) / DAY_MS);
        if (daysAway < 5) return null;
        const fav = favoriteSports(1, history)[0];
        return {
            daysAway,
            label: 'Retour propre',
            sport: fav?.sport || '',
            action: fav?.sport ? `Reprendre ${sportLabel(fav.sport)} en version courte.` : 'Faire une seance courte de reprise.',
            note: 'TITAN privilegie une reprise douce plutot qu une punition de streak.',
            href: fav?.sport ? `training.html?sport=${encodeURIComponent(fav.sport)}` : 'training.html',
            updatedAt: new Date().toISOString()
        };
    }

    function buildPersonalRivals(history = window.state?.history || []) {
        const bySport = {};
        history.forEach(log => {
            if (!log.sport) return;
            if (!bySport[log.sport]) bySport[log.sport] = [];
            bySport[log.sport].push(log);
        });
        return Object.keys(bySport).map(sport => {
            const logs = bySport[sport].slice().sort((a, b) => parseDate(b.date) - parseDate(a.date));
            const latest = logs[0];
            const previous = logs.slice(1).find(log => Math.abs(getDuration(log) - getDuration(latest)) <= 20) || logs[1];
            if (!latest || !previous) return null;
            const delta = Math.round((parseFloat(latest.xp) || 0) - (parseFloat(previous.xp) || 0));
            return {
                sport,
                label: sportLabel(sport),
                delta,
                status: delta >= 0 ? 'gagne' : 'a reprendre',
                latestDate: latest.date,
                previousDate: previous.date
            };
        }).filter(Boolean).sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta)).slice(0, 5);
    }

    function average(values = []) {
        const nums = values.map(value => toNumber(value, NaN)).filter(Number.isFinite);
        return nums.length ? nums.reduce((sum, value) => sum + value, 0) / nums.length : 0;
    }

    function detectPlateau(history = window.state?.history || []) {
        const fav = favoriteSports(1, history)[0];
        const sportLogs = fav
            ? history.filter(log => log.sport === fav.sport)
            : history.slice();
        const sorted = sportLogs
            .filter(log => parseDate(log.date).getTime() > 0)
            .sort((a, b) => parseDate(a.date) - parseDate(b.date));
        if (sorted.length < 8) {
            return {
                status: 'calibration',
                label: 'Plateau non mesurable',
                detail: 'Il faut au moins 8 traces comparables pour lire un plateau proprement.',
                action: 'Continue a poser des traces simples et regulieres.',
                sport: fav?.sport || null,
                delta: null
            };
        }

        const recent = sorted.slice(-4);
        const previous = sorted.slice(-8, -4);
        const recentXp = average(recent.map(log => log.xp));
        const previousXp = average(previous.map(log => log.xp));
        const recentLoad = average(recent.map(getSessionLoad));
        const previousLoad = average(previous.map(getSessionLoad));
        const xpDelta = previousXp ? ((recentXp - previousXp) / previousXp) * 100 : 0;
        const loadDelta = previousLoad ? ((recentLoad - previousLoad) / previousLoad) * 100 : 0;
        const stale = xpDelta < 4 && loadDelta >= -8 && sorted.length >= 8;
        let label = stale ? 'Plateau possible' : 'Progression lisible';
        let detail = stale
            ? `${sportLabel(fav?.sport || recent[0]?.sport)} progresse peu sur les 4 dernieres traces comparables.`
            : `${sportLabel(fav?.sport || recent[0]?.sport)} reste dans une dynamique exploitable.`;
        let action = stale
            ? 'Change une variable: technique, recuperation, format court, terrain ou volume legerement different.'
            : 'Continue le cycle, puis recontrole apres 2 traces.';
        if (stale && loadDelta > 18) {
            detail = 'La charge monte mais le rendement ne suit pas encore.';
            action = 'Deload court ou seance technique avant de rajouter du volume.';
        }
        return {
            status: stale ? 'watch' : 'ok',
            label,
            detail,
            action,
            sport: fav?.sport || recent[0]?.sport || null,
            recentXp: Math.round(recentXp),
            previousXp: Math.round(previousXp),
            xpDelta: Number(xpDelta.toFixed(1)),
            loadDelta: Number(loadDelta.toFixed(1)),
            updatedAt: new Date().toISOString()
        };
    }

    function bestWeekRecord(history = window.state?.history || []) {
        const weeks = {};
        history.forEach(log => {
            const date = parseDate(log.date);
            const start = weekStart(date);
            const key = start.toISOString().slice(0, 10);
            if (!weeks[key]) weeks[key] = { key, start, sessions: 0, xp: 0, load: 0 };
            weeks[key].sessions += 1;
            weeks[key].xp += toNumber(log.xp, 0);
            weeks[key].load += getSessionLoad(log);
        });
        return Object.values(weeks)
            .filter(week => week.sessions > 0)
            .sort((a, b) => (b.sessions - a.sessions) || (b.xp - a.xp))[0] || null;
    }

    function buildContextualRecords(history = window.state?.history || []) {
        const sorted = history
            .filter(log => parseDate(log.date).getTime() > 0)
            .sort((a, b) => parseDate(a.date) - parseDate(b.date));
        if (!sorted.length) return [];
        const now = Date.now();
        const last30 = sorted.filter(log => now - parseDate(log.date).getTime() <= 30 * DAY_MS);
        const bestBy = (logs, scoreFn) => logs.slice().sort((a, b) => scoreFn(b) - scoreFn(a))[0] || null;
        const records = [];
        const best30 = bestBy(last30.length ? last30 : sorted, log => toNumber(log.xp, 0));
        if (best30) {
            records.push({
                id: 'best_30d',
                label: 'Meilleur effort 30j',
                value: Math.round(toNumber(best30.xp, 0)),
                unit: 'XP',
                detail: `${sportLabel(best30.sport)} garde le meilleur signal recent.`,
                date: best30.date
            });
        }
        const short = bestBy(sorted.filter(log => getDuration(log) > 0 && getDuration(log) <= 30), log => toNumber(log.xp, 0));
        if (short) {
            records.push({
                id: 'short_quality',
                label: 'Meilleure seance courte',
                value: Math.round(toNumber(short.xp, 0)),
                unit: 'XP',
                detail: `${sportLabel(short.sport)} en ${Math.round(getDuration(short))} min ou moins.`,
                date: short.date
            });
        }
        let comeback = null;
        for (let i = 1; i < sorted.length; i++) {
            const gap = Math.floor((parseDate(sorted[i].date) - parseDate(sorted[i - 1].date)) / DAY_MS);
            if (gap >= 5 && (!comeback || toNumber(sorted[i].xp, 0) > toNumber(comeback.xp, 0))) {
                comeback = Object.assign({ gap }, sorted[i]);
            }
        }
        if (comeback) {
            records.push({
                id: 'comeback',
                label: 'Meilleur retour',
                value: Math.round(toNumber(comeback.xp, 0)),
                unit: 'XP',
                detail: `Retour apres ${comeback.gap} jours sans trace.`,
                date: comeback.date
            });
        }
        const week = bestWeekRecord(sorted);
        if (week) {
            records.push({
                id: 'regular_week',
                label: 'Semaine la plus reguliere',
                value: week.sessions,
                unit: 'seances',
                detail: `${Math.round(week.xp)} XP cumules sur la semaine.`,
                date: week.key
            });
        }
        const recovery = bestBy(sorted.filter(log => getSportFamily(log) === 'recovery' || (log.details?.tags || []).includes('recovery')), log => getSessionLoad(log) + toNumber(log.xp, 0) * 0.25);
        if (recovery) {
            records.push({
                id: 'recovery_best',
                label: 'Meilleur effort recuperation',
                value: Math.round(toNumber(recovery.xp, 0)),
                unit: 'XP',
                detail: `${sportLabel(recovery.sport)} a protege le cycle.`,
                date: recovery.date
            });
        }
        return records.slice(0, window.state?.user?.is_elite ? 8 : 5);
    }

    function buildCooldownGuide(log = null, history = window.state?.history || []) {
        const target = log || history.slice().sort((a, b) => parseDate(b.date) - parseDate(a.date))[0] || null;
        const recovery = recoverySnapshot(history);
        const load = target ? getSessionLoad(target) : 0;
        const rpe = parseInt(target?.details?.bio?.rpe || 0, 10);
        const high = load >= 520 || rpe >= 8 || recovery.score < 45;
        const medium = load >= 260 || rpe >= 6 || recovery.score < 65;
        const duration = high ? 10 : (medium ? 7 : 4);
        const steps = [
            high ? 'Respiration calme 2 min puis marche lente.' : 'Redescente progressive 2 min.',
            target && getSportFamily(target) === 'force' ? 'Mobilite douce des zones travaillees.' : 'Mobilite hanches, chevilles, dos et epaules.',
            high ? 'Note sommeil, douleur ou fatigue demain.' : 'Note le ressenti pour calibrer la prochaine trace.'
        ];
        return {
            label: high ? 'Retour au calme prioritaire' : (medium ? 'Retour au calme conseille' : 'Retour simple'),
            duration,
            steps,
            load,
            recoveryScore: recovery.score,
            detail: high ? 'La charge ou le RPE demande de proteger la prochaine seance.' : 'Une routine courte suffit pour garder le rythme.',
            updatedAt: new Date().toISOString()
        };
    }

    function buildRegularityBadges(history = window.state?.history || []) {
        const sorted = history.slice().sort((a, b) => parseDate(a.date) - parseDate(b.date));
        const week = weekComparison(history);
        const variety = varietyMatrix(history);
        const recovery = recoverySnapshot(history);
        const badges = [];
        if (week.current.sessions >= Math.max(3, parseInt(window.state?.user?.weeklyGoalSessions || 3, 10))) {
            badges.push({ id: 'week_done', label: 'Semaine verrouillee', detail: `${week.current.sessions} seances cette semaine.` });
        }
        if (variety.score >= 68) badges.push({ id: 'variety', label: 'Semaine hybride', detail: `Spectre ${variety.label.toLowerCase()} a ${variety.score}/100.` });
        if (recovery.score >= 70 && week.current.sessions >= 2) badges.push({ id: 'clean_load', label: 'Charge propre', detail: `Fraicheur ${recovery.score}/100 malgre le bloc.` });
        for (let i = 1; i < sorted.length; i++) {
            const gap = Math.floor((parseDate(sorted[i].date) - parseDate(sorted[i - 1].date)) / DAY_MS);
            if (gap >= 5) {
                badges.push({ id: 'return', label: 'Retour actif', detail: `Trace posee apres ${gap} jours de pause.` });
                break;
            }
        }
        if (!badges.length) badges.push({ id: 'calibration', label: 'En rodage', detail: 'Quelques traces de plus debloqueront des badges plus precis.' });
        return badges.slice(0, 4);
    }

    function buildSelfCompetition(history = window.state?.history || []) {
        const rivals = buildPersonalRivals(history);
        const lead = rivals[0] || null;
        const contextual = buildContextualRecords(history);
        if (!lead) {
            return {
                label: 'Duel a calibrer',
                detail: 'Refais deux traces du meme sport ou format proche pour creer un adversaire personnel.',
                status: 'calibration',
                records: contextual.slice(0, 2)
            };
        }
        return {
            label: lead.delta >= 0 ? 'Moi precedent battu' : 'Revanche disponible',
            detail: `${lead.label}: ${lead.delta >= 0 ? '+' : ''}${lead.delta} XP vs trace comparable.`,
            status: lead.delta >= 0 ? 'won' : 'open',
            sport: lead.sport,
            delta: lead.delta,
            records: contextual.slice(0, 3),
            updatedAt: new Date().toISOString()
        };
    }

    function buildMonthlyReport(history = window.state?.history || [], user = window.state?.user || {}) {
        const monthKey = new Date().toISOString().slice(0, 7);
        const monthLogs = history.filter(log => String(log.date || '').slice(0, 7) === monthKey);
        const xp = monthLogs.reduce((sum, log) => sum + (parseFloat(log.xp) || 0), 0);
        const radar = physicalRadar(monthLogs.length ? monthLogs : history);
        const best = monthLogs.slice().sort((a, b) => (parseFloat(b.xp) || 0) - (parseFloat(a.xp) || 0))[0] || null;
        return {
            month: monthKey,
            sessions: monthLogs.length,
            xp: Math.round(xp),
            bestSession: best ? { sport: best.sport, label: sportLabel(best.sport), xp: Math.round(parseFloat(best.xp) || 0), date: best.date } : null,
            classLabel: user.archetype?.label || deriveArchetype(radar).label,
            reputation: user.reputation?.primary || deriveReputation(radar, history).primary,
            freshness: buildFreshnessScore(history),
            nextCycle: radar.weak ? `Renforcer ${radar.weak.label.toLowerCase()} sans forcer.` : 'Continuer le cycle propre.',
            updatedAt: new Date().toISOString()
        };
    }

    function pathPoint(point) {
        if (Array.isArray(point)) return { lat: toNumber(point[0], NaN), lon: toNumber(point[1], NaN) };
        return { lat: toNumber(point?.lat, NaN), lon: toNumber(point?.lon ?? point?.lng, NaN) };
    }

    function pathDistanceKm(path = []) {
        let total = 0;
        for (let i = 1; i < path.length; i++) {
            const a = pathPoint(path[i - 1]);
            const b = pathPoint(path[i]);
            if (!Number.isFinite(a.lat) || !Number.isFinite(a.lon) || !Number.isFinite(b.lat) || !Number.isFinite(b.lon)) continue;
            const lat1 = a.lat * Math.PI / 180;
            const lat2 = b.lat * Math.PI / 180;
            const dLat = (b.lat - a.lat) * Math.PI / 180;
            const dLon = (b.lon - a.lon) * Math.PI / 180;
            const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
            total += 6371 * 2 * Math.atan2(Math.sqrt(Math.min(1, Math.max(0, h))), Math.sqrt(1 - Math.min(1, Math.max(0, h))));
        }
        return total;
    }

    function sessionDistance(log) {
        const det = log?.details || {};
        const direct = log?.unit === 'km' ? toNumber(log.val, 0) : toNumber(det.val1, 0);
        if (direct > 0) return direct;
        if (Array.isArray(det.gpxPath) && det.gpxPath.length > 1) return pathDistanceKm(det.gpxPath);
        return 0;
    }

    function sessionPaceMinutes(log) {
        const raw = metricPaceMinutes(log?.details?.gpxStats?.pace);
        if (raw) return raw;
        const distance = sessionDistance(log);
        const duration = metricDuration(log);
        return distance > 0 && duration > 0 ? duration / distance : 0;
    }

    function routeSignature(log) {
        const path = log?.details?.gpxPath;
        if (!Array.isArray(path) || path.length < 2) return null;
        const start = pathPoint(path[0]);
        const end = pathPoint(path[path.length - 1]);
        if (!Number.isFinite(start.lat) || !Number.isFinite(start.lon) || !Number.isFinite(end.lat) || !Number.isFinite(end.lon)) return null;
        const distance = sessionDistance(log);
        const bucket = Math.max(1, Math.round(distance));
        const round = value => (Math.round(value * 50) / 50).toFixed(2);
        return `${round(start.lat)},${round(start.lon)}>${round(end.lat)},${round(end.lon)}:${bucket}`;
    }

    function buildPersonalSegments(history = window.state?.history || []) {
        const buckets = {};
        history.forEach(log => {
            const sig = routeSignature(log);
            if (!sig) return;
            const distance = sessionDistance(log);
            const duration = metricDuration(log);
            if (distance < 0.4 || duration <= 0) return;
            if (!buckets[sig]) {
                buckets[sig] = {
                    id: sig,
                    sport: log.sport,
                    label: `${sportLabel(log.sport)} ${distance.toFixed(distance >= 10 ? 0 : 1)} km`,
                    sessions: 0,
                    distance,
                    bestPace: 0,
                    bestDuration: 0,
                    bestDate: null,
                    lastDate: null,
                    xp: 0
                };
            }
            const pace = sessionPaceMinutes(log);
            const bucket = buckets[sig];
            bucket.sessions += 1;
            bucket.xp += toNumber(log.xp, 0);
            bucket.lastDate = !bucket.lastDate || parseDate(log.date) > parseDate(bucket.lastDate) ? log.date : bucket.lastDate;
            if (!bucket.bestDuration || duration < bucket.bestDuration) {
                bucket.bestDuration = duration;
                bucket.bestPace = pace;
                bucket.bestDate = log.date;
                bucket.sport = log.sport;
            }
        });
        return Object.values(buckets)
            .sort((a, b) => (b.sessions - a.sessions) || (b.xp - a.xp))
            .slice(0, window.state?.user?.is_elite ? 12 : 5);
    }

    function buildPersonalHeatmap(history = window.state?.history || []) {
        const cells = {};
        history.forEach(log => {
            const path = log?.details?.gpxPath;
            if (!Array.isArray(path) || path.length < 2) return;
            const step = Math.max(1, Math.ceil(path.length / 80));
            for (let i = 0; i < path.length; i += step) {
                const p = pathPoint(path[i]);
                if (!Number.isFinite(p.lat) || !Number.isFinite(p.lon)) continue;
                const lat = (Math.round(p.lat * 50) / 50).toFixed(2);
                const lon = (Math.round(p.lon * 50) / 50).toFixed(2);
                const key = `${lat},${lon}`;
                if (!cells[key]) cells[key] = { id: key, lat: Number(lat), lon: Number(lon), hits: 0, sports: {}, lastDate: null };
                cells[key].hits += 1;
                cells[key].sports[log.sport] = (cells[key].sports[log.sport] || 0) + 1;
                cells[key].lastDate = !cells[key].lastDate || parseDate(log.date) > parseDate(cells[key].lastDate) ? log.date : cells[key].lastDate;
            }
        });
        const topCells = Object.values(cells).sort((a, b) => b.hits - a.hits).slice(0, 9).map(cell => {
            const topSport = Object.entries(cell.sports).sort((a, b) => b[1] - a[1])[0]?.[0] || '';
            return Object.assign({}, cell, { label: topSport ? sportLabel(topSport) : 'Zone active' });
        });
        return {
            cells: topCells,
            totalCells: Object.keys(cells).length,
            coverage: topCells.reduce((sum, cell) => sum + cell.hits, 0),
            privateByDefault: true
        };
    }

    function buildSmartGoals(history = window.state?.history || [], user = window.state?.user || {}) {
        const now = new Date();
        const weekLogs = history.filter(log => parseDate(log.date) >= weekStart(now));
        const monthKey = now.toISOString().slice(0, 7);
        const monthLogs = history.filter(log => String(log.date || '').slice(0, 7) === monthKey);
        const weeklyTarget = Math.max(1, parseInt(user.weeklyGoalSessions || 3, 10));
        const monthMinutes = monthLogs.reduce((sum, log) => sum + metricDuration(log), 0);
        const monthDistance = monthLogs.reduce((sum, log) => sum + sessionDistance(log), 0);
        const variety = varietyMatrix(history);
        const recovery = recoverySnapshot(history);
        const fav = favoriteSports(1, history)[0];
        return [
            { id: 'weekly_sessions', label: 'Semaine active', value: weekLogs.length, target: weeklyTarget, unit: 'seances', progress: clamp(Math.round((weekLogs.length / weeklyTarget) * 100), 0, 100) },
            { id: 'monthly_minutes', label: 'Temps mensuel', value: Math.round(monthMinutes), target: Math.max(300, Math.ceil(monthMinutes / 300) * 300 || 300), unit: 'min', progress: clamp(Math.round((monthMinutes / Math.max(300, Math.ceil(monthMinutes / 300) * 300 || 300)) * 100), 0, 100) },
            { id: 'monthly_distance', label: 'Distance mensuelle', value: Number(monthDistance.toFixed(1)), target: Math.max(20, Math.ceil(monthDistance / 20) * 20 || 20), unit: 'km', progress: clamp(Math.round((monthDistance / Math.max(20, Math.ceil(monthDistance / 20) * 20 || 20)) * 100), 0, 100) },
            { id: 'variety', label: 'Spectre', value: variety.score, target: 72, unit: '/100', progress: clamp(Math.round((variety.score / 72) * 100), 0, 100) },
            { id: 'recovery', label: 'Recuperation', value: recovery.score, target: 65, unit: '/100', progress: clamp(Math.round((recovery.score / 65) * 100), 0, 100) },
            { id: 'discipline', label: fav ? fav.label : 'Discipline', value: fav?.count || 0, target: fav ? buildDisciplineGoal(fav.sport, history).nextCount : 3, unit: 'traces', progress: fav ? buildDisciplineGoal(fav.sport, history).progress : 0 }
        ];
    }

    function buildAdvancedLoad(history = window.state?.history || []) {
        const now = Date.now();
        const inDays = days => history.filter(log => now - parseDate(log.date).getTime() <= days * DAY_MS);
        const load = logs => logs.reduce((sum, log) => sum + getSessionLoad(log), 0);
        const acute = load(inDays(7));
        const chronic = Math.round(load(inDays(42)) / 6);
        const form = chronic - acute;
        const monotony = (() => {
            const days = buildLoadCalendar(history).map(day => day.load);
            const avg = days.reduce((sum, value) => sum + value, 0) / Math.max(1, days.length);
            const variance = days.reduce((sum, value) => sum + Math.pow(value - avg, 2), 0) / Math.max(1, days.length);
            const sd = Math.sqrt(variance);
            return sd > 0 ? Number((avg / sd).toFixed(2)) : 0;
        })();
        const ratio = chronic > 0 ? Number((acute / chronic).toFixed(2)) : 0;
        let status = 'Stable';
        if (ratio > 1.45 || acute > chronic + 800) status = 'Surcharge';
        else if (ratio < 0.65 && chronic > 0) status = 'Sous-charge';
        else if (form > 320) status = 'Frais';
        return { acute, chronic, form, ratio, monotony, status, updatedAt: new Date().toISOString() };
    }

    function buildRoutePlanner(history = window.state?.history || []) {
        const heatmap = buildPersonalHeatmap(history);
        const segments = buildPersonalSegments(history);
        const fav = favoriteSports(1, history)[0];
        const baseSport = fav?.sport || segments[0]?.sport || 'running';
        const baseLabel = sportLabel(baseSport);
        const baseProfile = inferSportProfile(baseSport, sportConfig(baseSport));
        const routeSport = ['running', 'trail', 'cycling', 'hiking', 'outdoor', 'water', 'glide'].includes(baseProfile) || sportConfig(baseSport).formType === 'gps' || sportConfig(baseSport).unit === 'km';
        const avgDistance = (() => {
            const distances = history.map(sessionDistance).filter(value => value > 0);
            if (!distances.length) return 5;
            return distances.reduce((sum, value) => sum + value, 0) / distances.length;
        })();
        if (!routeSport) {
            const avgMinutes = Math.max(25, Math.round((history.map(metricDuration).filter(value => value > 0).reduce((sum, value, _, arr) => sum + value / Math.max(1, arr.length), 0)) || 45));
            return [
                { id: 'short_block', label: 'Bloc court', sport: baseSport, distance: null, duration: Math.max(15, Math.round(avgMinutes * 0.7)), elevation: 'indoor', reason: `Version courte ${baseLabel}, utile recuperation.` },
                { id: 'quality_block', label: 'Bloc qualite', sport: baseSport, distance: null, duration: avgMinutes, elevation: 'indoor', reason: 'Meme discipline, objectif execution propre.' },
                { id: 'progressive_block', label: 'Bloc progression', sport: baseSport, distance: null, duration: Math.round(avgMinutes * 1.12), elevation: 'indoor', reason: 'Progression douce sans changer le format.' }
            ];
        }
        return [
            { id: 'easy_loop', label: 'Boucle propre', sport: baseSport, distance: Math.max(2, Number((avgDistance * 0.72).toFixed(1))), elevation: 'faible', reason: `Version courte ${baseLabel}, utile recuperation.` },
            { id: 'progressive_route', label: 'Progression controlee', sport: baseSport, distance: Math.max(3, Number((avgDistance * 1.08).toFixed(1))), elevation: 'modere', reason: 'Un peu plus long sans changer de discipline.' },
            { id: 'heatmap_route', label: heatmap.cells[0] ? 'Zone chaude' : 'Route a creer', sport: baseSport, distance: segments[0]?.distance ? Number(segments[0].distance.toFixed(1)) : Math.max(4, Number(avgDistance.toFixed(1))), elevation: segments[0] ? 'connu' : 'libre', reason: heatmap.cells[0] ? `Repasser par ${heatmap.cells[0].label}.` : 'Importe un GPX pour calibrer les zones.' }
        ];
    }

    function buildLiveSegmentPreview(history = window.state?.history || []) {
        return buildPersonalSegments(history).slice(0, 5).map(segment => ({
            id: segment.id,
            label: segment.label,
            sport: segment.sport,
            bestPace: segment.bestPace ? formatPace(1, segment.bestPace) : '--',
            bestDuration: Math.round(segment.bestDuration || 0),
            sessions: segment.sessions,
            cue: segment.sessions >= 2 ? 'A battre' : 'Reference posee'
        }));
    }

    function buildAthleteProfile(history = window.state?.history || [], user = window.state?.user || {}) {
        const radar = physicalRadar(history);
        const variety = varietyMatrix(history);
        const recovery = recoverySnapshot(history);
        const archetype = user.archetype || deriveArchetype(radar, history);
        const scores = Object.fromEntries((radar.axes || []).map(axis => [axis.id, axis.score]));
        let label = archetype.label || 'Recrue Titan';
        if ((scores.endurance || 0) >= 58 && (scores.force || 0) >= 48) label = 'Hybride endurant';
        else if ((scores.force || 0) >= 60) label = 'Puissant controle';
        else if ((scores.endurance || 0) >= 60) label = 'Endurant';
        else if ((scores.technique || 0) >= 56) label = 'Technicien';
        else if ((scores.recovery || 0) >= 56) label = 'Recuperateur';
        else if (variety.score >= 72) label = 'Profil hybride';
        const strengths = (radar.axes || []).slice().sort((a, b) => b.score - a.score).slice(0, 3);
        const weak = radar.weak || null;
        return {
            label,
            archetype,
            strengths,
            weak,
            variety,
            recovery,
            summary: `${label} // ${strengths.map(item => item.label).join(' + ') || 'en rodage'} // ${recovery.status}`,
            updatedAt: new Date().toISOString()
        };
    }

    function buildSmartSportBrief(history = window.state?.history || [], user = window.state?.user || {}) {
        const profile = buildAthleteProfile(history, user);
        const load = buildAdvancedLoad(history);
        const goals = buildSmartGoals(history, user);
        const fav = favoriteSports(1, history)[0];
        const recovery = recoverySnapshot(history);
        const variety = varietyMatrix(history);
        const isElite = user.is_elite === true;
        const preferredSport = fav?.label || 'ton sport principal';
        const lowVariety = variety.score < 48 && history.length >= 6;
        const loadRisk = load.status === 'Surcharge' || recovery.score < 45;
        const competitor = loadRisk
            ? APP_DIFFERENTIATION.find(item => item.id === 'whoop')
            : (lowVariety ? APP_DIFFERENTIATION.find(item => item.id === 'strava') : APP_DIFFERENTIATION.find(item => item.id === 'trainingpeaks'));
        const nextGoal = goals.find(goal => Number(goal.progress || 0) < 100) || goals[0];
        const freePromise = 'Gratuit: journal complet, sports JO, XP, cloud, objectifs, recuperation simple et progression lisible.';
        const elitePromise = 'Elite 5 euros: plans 5 jours, charge lisible, rapports, segments/routes profonds, archives et confort visuel.';
        const action = loadRisk
            ? 'Baisser la charge et proteger la prochaine seance utile.'
            : (lowVariety ? 'Ajouter une discipline courte pour eviter le mono-signal.' : (nextGoal ? `Pousser ${nextGoal.label.toLowerCase()} sans complexifier.` : `Poser une trace propre en ${preferredSport}.`));
        return {
            status: loadRisk ? 'prudence' : (lowVariety ? 'diversifier' : 'progresser'),
            competitor,
            freePromise,
            elitePromise,
            readout: [
                {
                    id: 'titan_edge',
                    icon: 'ri-compass-3-line',
                    label: 'Angle TITAN',
                    value: profile.label || 'Profil hybride',
                    detail: `Multisport clair, progression RPG et donnees privees par defaut autour de ${preferredSport}.`
                },
                {
                    id: 'app_gap',
                    icon: 'ri-search-eye-line',
                    label: `Faiblesse ${competitor?.app || 'apps sport'}`,
                    value: competitor?.app || 'Trop de donnees',
                    detail: competitor?.weakness || 'Trop de donnees peuvent masquer la prochaine action.'
                },
                {
                    id: 'next_move',
                    icon: 'ri-focus-3-line',
                    label: isElite ? 'Cap Elite' : 'Cap gratuit',
                    value: isElite ? 'Cycle lisible' : 'Base complete',
                    detail: isElite ? `Plan court: ${action}` : `${action} Elite ajoute la profondeur, pas la puissance.`
                }
            ],
            pricing: {
                free: freePromise,
                elite: elitePromise,
                monthlyPrice: 5
            },
            updatedAt: new Date().toISOString()
        };
    }

    function buildCoachRecommendation(history = window.state?.history || [], user = window.state?.user || {}) {
        const objective = todayObjective();
        const radar = physicalRadar(history);
        const alerts = detectTrainingImbalances(history);
        const fav = favoriteSports(1, history)[0];
        const goals = syncDisciplineGoals(history);
        const goal = fav ? goals[fav.sport] : null;
        const freshness = buildFreshnessScore(history);
        const returnPlan = detectReturnPlan(history);
        const loadCalendar = buildLoadCalendar(history);
        const plateau = detectPlateau(history);
        const selfCompetition = buildSelfCompetition(history);
        const contextualRecords = buildContextualRecords(history);
        const cooldown = buildCooldownGuide(null, history);
        const regularityBadges = buildRegularityBadges(history);
        const smartBrief = buildSmartSportBrief(history, user);
        let today = objective.label;
        let reason = objective.planned ? 'Seance planifiee detectee.' : 'Suggestion basee sur ton historique.';
        let avoid = 'Aucun signal rouge.';
        let nextCap = goal?.nextAction || 'Poser une trace propre pour calibrer le coach.';
        const recovery = objective.recovery;

        if (returnPlan) {
            today = returnPlan.label;
            reason = `${returnPlan.daysAway} jours sans trace: reprendre proprement.`;
            avoid = 'Evite de compenser en une seule grosse seance.';
            nextCap = returnPlan.action;
        } else if (recovery.restRecommended || freshness.score < 42) {
            today = 'Recuperation active';
            reason = freshness.score < 42 ? 'Score de fraicheur bas: proteger la suite du bloc.' : 'Charge recente haute: proteger la suite du bloc.';
            avoid = 'Evite les tests max et les seances tres intenses aujourd hui.';
        } else if (alerts[0]?.id === 'recovery_gap') {
            today = 'Mobilite ou recuperation';
            reason = 'La recuperation est absente du signal recent.';
            avoid = 'Evite d ajouter une grosse charge sans check corporel.';
        } else if (radar.weak && radar.weak.score < 28 && history.length >= 5) {
            today = radar.weak.label;
            reason = `Qualite faible detectee: ${radar.weak.label}.`;
            nextCap = `Faire progresser ${radar.weak.label.toLowerCase()} sans chercher le record.`;
        } else if (plateau.status === 'watch') {
            today = 'Variation controlee';
            reason = plateau.detail;
            avoid = 'Evite de refaire exactement le meme format si tu sens que ca stagne.';
            nextCap = plateau.action;
        }

        const result = {
            today,
            reason,
            avoid,
            nextCap,
            recovery,
            freshness,
            returnPlan,
            loadCalendar,
            plateau,
            selfCompetition,
            contextualRecords,
            cooldown,
            regularityBadges,
            smartBrief,
            primaryAlert: alerts[0] || null,
            alerts,
            radar,
            href: objective.href,
            updatedAt: new Date().toISOString()
        };

        if (user.is_elite === true) {
            result.elitePlan = [
                { day: 'J+1', focus: alerts[0]?.id === 'monotony' ? 'Variete' : today, note: 'Ajuste selon temps disponible.' },
                { day: 'J+2', focus: radar.weak?.label || 'Technique', note: 'Bloc court, qualite propre.' },
                { day: 'J+3', focus: recovery.score < 65 ? 'Recuperation' : 'Progression', note: 'Recontrole charge avant intensite.' },
                { day: 'J+4', focus: 'Fenetre libre', note: 'Option 10/20/45 min selon energie.' },
                { day: 'J+5', focus: radar.dominant?.label || 'Point fort', note: 'Consolider sans depasser le plafond hebdo.' }
            ];
            result.elitePlan.push({ day: 'Bilan', focus: smartBrief.status === 'prudence' ? 'Deload prudent' : 'Avantage TITAN', note: smartBrief.competitor?.titan || 'Transformer les donnees en action lisible.' });
            result.similarSessions = buildPersonalRivals(history).slice(0, 3);
            result.monthlyReport = buildMonthlyReport(history, user);
        }

        if (window.state?.user) {
            window.state.user.coachSnapshot = result;
            window.state.user.freshnessScore = freshness;
            window.state.user.returnPlan = returnPlan;
            window.state.user.loadCalendar = loadCalendar;
            window.state.user.personalRivals = buildPersonalRivals(history);
            window.state.user.contextualRecords = contextualRecords;
            window.state.user.plateauSignal = plateau;
            window.state.user.cooldownGuide = cooldown;
            window.state.user.regularityBadges = regularityBadges;
            window.state.user.smartSportBrief = smartBrief;
            if (user.is_elite === true) {
                const report = result.monthlyReport || buildMonthlyReport(history, user);
                if (!Array.isArray(window.state.user.monthlyReports)) window.state.user.monthlyReports = [];
                const idx = window.state.user.monthlyReports.findIndex(item => item.month === report.month);
                if (idx >= 0) window.state.user.monthlyReports[idx] = report;
                else window.state.user.monthlyReports.unshift(report);
                window.state.user.monthlyReports = window.state.user.monthlyReports.slice(0, 18);
            }
        }
        return result;
    }

    function appendAdventureJournalEntry(type, title, body, meta = {}) {
        if (!window.state?.user) return null;
        if (!Array.isArray(window.state.user.adventureJournal)) window.state.user.adventureJournal = [];
        const today = new Date().toISOString().slice(0, 10);
        const signature = `${today}:${type}:${title}`;
        if (window.state.user.adventureJournal.some(entry => entry.signature === signature)) return null;
        const entry = {
            id: `${Date.now()}_${Math.floor(Math.random() * 1000)}`,
            signature,
            type,
            title: String(title || 'Signal archive').slice(0, 80),
            body: String(body || '').slice(0, window.state.user.is_elite ? 520 : 220),
            meta,
            date: new Date().toISOString()
        };
        window.state.user.adventureJournal.unshift(entry);
        window.state.user.adventureJournal = window.state.user.adventureJournal.slice(0, window.state.user.is_elite ? 140 : 60);
        return entry;
    }

    function updateProgressionIdentity(log, titanResult = {}) {
        if (!window.state?.user) return {};
        const previousClass = window.state.user.archetype?.id || null;
        const previousProfession = window.state.user.campaignProfession?.id || null;
        const radar = physicalRadar();
        const qualities = topQualityContributions(log);
        window.state.user.physicalQualities = radar;
        syncDisciplineGoals();
        const archetype = deriveArchetype(radar);
        const reputation = deriveReputation(radar);
        const profession = deriveCampaignProfession(radar);
        const guildRole = deriveGuildRole(radar);
        const coach = buildCoachRecommendation();
        window.state.user.archetype = archetype;
        window.state.user.reputation = reputation;
        window.state.user.campaignProfession = profession;
        window.state.user.guildRole = guildRole;

        if (previousClass && previousClass !== archetype.id) {
            appendAdventureJournalEntry('class_shift', 'Classe recalibree', `${archetype.label} emerge: ${archetype.reason}`, { archetype: archetype.id });
        }
        if (previousProfession && previousProfession !== profession.id) {
            appendAdventureJournalEntry('profession', 'Metier de campagne', `${profession.label}: ${profession.clue}.`, { profession: profession.id });
        }
        if ((titanResult.records || []).length) {
            appendAdventureJournalEntry('record', 'Record detecte', `${sportLabel(log.sport)} a laisse une nouvelle marque: ${titanResult.records[0].label}.`, { sport: log.sport });
        }
        const plateau = detectPlateau();
        if (plateau.status === 'watch') {
            appendAdventureJournalEntry('plateau', 'Plateau possible', `${plateau.detail} ${plateau.action}`, { sport: plateau.sport });
        }
        if (coach.primaryAlert) {
            appendAdventureJournalEntry('coach_signal', 'Signal coach', `${coach.primaryAlert.label}: ${coach.primaryAlert.detail}`, { alert: coach.primaryAlert.id });
        }

        return { radar, qualities, archetype, reputation, profession, guildRole, coach };
    }

    function dayKey(d = new Date()) {
        return ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'][d.getDay()];
    }

    function todayObjective() {
        const user = window.state?.user || {};
        const planned = user.schedule?.[dayKey()]?.sport || null;
        const recovery = recoverySnapshot();
        const fav = favoriteSports(1)[0];
        const sport = planned || fav?.sport || '';
        return {
            sport,
            label: sport ? sportLabel(sport) : 'Choisir une discipline',
            planned: !!planned,
            recovery,
            href: sport ? `training.html?sport=${encodeURIComponent(sport)}` : 'training.html'
        };
    }

    function buildSessionSummary(log, analysis = {}) {
        const det = log.details || {};
        const rpe = parseInt(det.bio?.rpe || 0, 10);
        const tags = det.tags || [];
        const parts = [];
        if (analysis.penaltyMultiplier && analysis.penaltyMultiplier < 1) parts.push('charge limitee pour proteger la recuperation');
        if (tags.includes('recovery')) parts.push('seance de regeneration utile au cycle');
        if (tags.includes('test') || tags.includes('competition')) parts.push('trace haute pression archivee');
        if (rpe >= 8) parts.push('intensite forte');
        else if (rpe > 0 && rpe <= 4) parts.push('intensite controlee');
        if (log.unit === 'km' && det.val2 > 0) parts.push(`allure moyenne ${formatPace(log.val, det.val2)}`);
        if (det.elevation > 0) parts.push(`denivele +${Math.round(det.elevation)} m`);
        if (!parts.length) parts.push('session propre ajoutee au protocole');
        return parts.join(' // ');
    }

    function formatPace(dist, minutes) {
        const km = parseFloat(dist);
        const min = parseFloat(minutes);
        if (!km || !min) return '--';
        const pace = min / km;
        const mm = Math.floor(pace);
        const ss = Math.round((pace - mm) * 60).toString().padStart(2, '0');
        return `${mm}:${ss}/km`;
    }

    function analyzeSession(sportKey, dataInput, numericValue) {
        const recovery = recoverySnapshot();
        const plannedBoost = dataInput?.isPlanned ? 1.08 : 1;
        const penaltyMultiplier = dataInput?.tags?.includes('recovery') ? Math.max(recovery.penaltyMultiplier, 0.92) : recovery.penaltyMultiplier;
        return {
            recovery,
            plannedBoost,
            penaltyMultiplier,
            overloadPenalty: penaltyMultiplier < 1,
            sportFamily: getSportFamily(sportKey),
            numericValue
        };
    }

    function softCap(value, cap = 900, hardness = 18) {
        if (value <= cap) return value;
        return cap + Math.sqrt(value - cap) * hardness;
    }

    function categoryDefaults(conf = {}) {
        const cat = String(conf.cat || '').toLowerCase();
        const formType = String(conf.formType || '').toLowerCase();
        const unit = String(conf.unit || '').toLowerCase();
        const profile = String(conf.balanceProfile || inferSportProfile('', conf)).toLowerCase();
        const profiles = {
            football: { baseScale: 0.34, durationCoeff: 0.10, elevationCoeff: 0, intensityCoeff: 0.007, extraCap: 0.18, softCap: 520, hardMax: 980, capHardness: 10 },
            team: { baseScale: 0.32, durationCoeff: 0.10, elevationCoeff: 0, intensityCoeff: 0.007, extraCap: 0.17, softCap: 520, hardMax: 980, capHardness: 10 },
            cycling: { baseScale: 0.25, durationCoeff: 0.035, elevationCoeff: 3.25, gradeCoeff: 3.6, terrainCoeff: 0.07, intensityCoeff: 0.007, extraCap: 0.16, softCap: 580, hardMax: 980, capHardness: 10 },
            running: { baseScale: 0.22, durationCoeff: 0.045, elevationCoeff: 2.05, gradeCoeff: 2.7, terrainCoeff: 0.06, intensityCoeff: 0.008, extraCap: 0.16, softCap: 560, hardMax: 950, capHardness: 10 },
            trail: { baseScale: 0.22, durationCoeff: 0.045, elevationCoeff: 2.65, gradeCoeff: 3.1, terrainCoeff: 0.09, intensityCoeff: 0.008, extraCap: 0.18, softCap: 620, hardMax: 1050, capHardness: 11 },
            hiking: { baseScale: 0.21, durationCoeff: 0.04, elevationCoeff: 2.55, gradeCoeff: 2.8, terrainCoeff: 0.08, intensityCoeff: 0.006, extraCap: 0.18, softCap: 580, hardMax: 980, capHardness: 10 },
            outdoor: { baseScale: 0.23, durationCoeff: 0.04, elevationCoeff: 2.2, gradeCoeff: 2.6, terrainCoeff: 0.07, intensityCoeff: 0.007, extraCap: 0.17, softCap: 580, hardMax: 980, capHardness: 10 },
            swimming: { baseScale: 0.28, durationCoeff: 0.045, elevationCoeff: 0, intensityCoeff: 0.007, extraCap: 0.16, softCap: 620, hardMax: 1120, capHardness: 11 },
            racket: { baseScale: 0.32, durationCoeff: 0.10, elevationCoeff: 0, intensityCoeff: 0.008, extraCap: 0.18, softCap: 560, hardMax: 1050, capHardness: 10 },
            combat: { baseScale: 0.32, durationCoeff: 0.11, elevationCoeff: 0, intensityCoeff: 0.008, extraCap: 0.18, softCap: 580, hardMax: 1080, capHardness: 10 },
            strength: { baseScale: unit === 'kg' ? 0.045 : 0.34, durationCoeff: 0.04, elevationCoeff: 0, intensityCoeff: 0.007, extraCap: 0.16, softCap: 520, hardMax: 900, capHardness: 10 },
            climbing: { baseScale: 0.30, durationCoeff: 0.075, elevationCoeff: 0, intensityCoeff: 0.007, extraCap: 0.18, softCap: 500, hardMax: 900, capHardness: 9 },
            mixed: { baseScale: 0.30, durationCoeff: 0.08, elevationCoeff: 0, intensityCoeff: 0.008, extraCap: 0.18, softCap: 540, hardMax: 920, capHardness: 10 },
            mobility: { baseScale: 0.28, durationCoeff: 0.06, elevationCoeff: 0, intensityCoeff: 0.004, extraCap: 0.12, softCap: 260, hardMax: 480, capHardness: 8 },
            precision: { baseScale: 0.30, durationCoeff: 0.05, elevationCoeff: 0, intensityCoeff: 0.004, extraCap: 0.14, softCap: 280, hardMax: 520, capHardness: 8 },
            skill: { baseScale: 0.30, durationCoeff: 0.07, elevationCoeff: 0, intensityCoeff: 0.006, extraCap: 0.16, softCap: 480, hardMax: 900, capHardness: 9 },
            water: { baseScale: 0.24, durationCoeff: 0.05, elevationCoeff: 0, terrainCoeff: 0.08, intensityCoeff: 0.007, extraCap: 0.17, softCap: 590, hardMax: 1120, capHardness: 10 },
            glide: { baseScale: 0.25, durationCoeff: 0.05, elevationCoeff: 1.5, gradeCoeff: 1.8, terrainCoeff: 0.08, intensityCoeff: 0.007, extraCap: 0.17, softCap: 590, hardMax: 1120, capHardness: 10 }
        };
        if (profiles[profile]) return profiles[profile];
        if (formType.includes('gym') || cat.includes('muscu') || cat.includes('force')) {
            return { baseScale: unit === 'kg' ? 0.045 : 0.34, durationCoeff: 0.04, elevationCoeff: 0, intensityCoeff: 0.007, extraCap: 0.16, softCap: 520, hardMax: 900, capHardness: 10 };
        }
        if (cat.includes('outdoor') || formType.includes('gps')) {
            return { baseScale: 0.23, durationCoeff: 0.04, elevationCoeff: 2.2, gradeCoeff: 2.6, terrainCoeff: 0.07, intensityCoeff: 0.007, extraCap: 0.17, softCap: 580, hardMax: 980, capHardness: 10 };
        }
        if (unit === 'km') {
            return { baseScale: 0.24, durationCoeff: 0.04, elevationCoeff: 1.8, gradeCoeff: 2.3, terrainCoeff: 0.06, intensityCoeff: 0.007, extraCap: 0.16, softCap: 560, hardMax: 950, capHardness: 10 };
        }
        if (cat.includes('combat') || cat.includes('team') || cat.includes('skill')) {
            return { baseScale: 0.32, durationCoeff: 0.10, elevationCoeff: 0, intensityCoeff: 0.007, extraCap: 0.18, softCap: 540, hardMax: 1020, capHardness: 10 };
        }
        if (cat.includes('mobil') || cat.includes('health') || cat.includes('recovery')) {
            return { baseScale: 0.28, durationCoeff: 0.06, elevationCoeff: 0, intensityCoeff: 0.004, extraCap: 0.12, softCap: 260, hardMax: 480, capHardness: 8 };
        }
        return { baseScale: unit === 'min' ? 0.30 : 0.24, durationCoeff: 0.05, elevationCoeff: 0.8, gradeCoeff: 1.8, terrainCoeff: 0.05, intensityCoeff: 0.006, extraCap: 0.15, softCap: 460, hardMax: 820, capHardness: 9 };
    }

    function getXpRules(conf = {}) {
        return Object.assign(categoryDefaults(conf), conf.xpRules || {});
    }

    function extraFieldBonus(conf, details, baseXp) {
        const fields = normalizeExtraFields(conf.extraFields);
        const extras = details.extras || {};
        const rawCap = Math.max(0, parseFloat(getXpRules(conf).extraCap || 0.22));
        const cap = Math.max(35, baseXp * rawCap);
        let bonus = 0;

        fields.forEach(field => {
            // Les champs TITAN+ enrichissent l'analyse, jamais la récompense.
            if (field.eliteOnly || !field.xpWeight || !fieldIsVisible(field, extras)) return;
            const value = extras[field.id];
            let amount = 0;
            if (field.type === 'number') {
                amount = Math.max(0, toNumber(value, 0) * field.xpWeight);
                amount = field.xpCap !== null ? Math.min(amount, field.xpCap) : amount;
            } else if (field.type === 'select' && field.xpWeight > 0 && value) {
                amount = field.xpWeight;
            } else if (field.type === 'checkbox' && value === true) {
                amount = field.xpWeight;
            }
            bonus += amount;
        });

        return Math.min(bonus, cap);
    }

    function terrainDifficultyMultiplier(terrain = '', rules = {}) {
        const value = String(terrain || '').toLowerCase();
        if (!value) return 1;
        const coeff = parseFloat(rules.terrainCoeff) || 0.05;
        if (hasAny(value, ['mountain', 'montagne', 'snow', 'neige', 'mud', 'boue', 'rock', 'rocaille', 'technique'])) return 1 + coeff * 2.5;
        if (hasAny(value, ['trail', 'sentier', 'gravel', 'sand', 'sable', 'wind', 'vent'])) return 1 + coeff * 1.5;
        if (hasAny(value, ['flat', 'plat', 'road', 'route', 'indoor'])) return 1;
        return 1 + coeff;
    }

    function progressionThrottleMultiplier(projectedXp) {
        const daily = Math.max(0, parseFloat(window.state?.user?.dailyXp || 0));
        let mult = 1;
        if (daily > 1000) mult = 0.38;
        else if (daily > 700) mult = 0.52;
        else if (daily > 450) mult = 0.68;
        else if (daily > 280) mult = 0.84;

        const weekAgo = Date.now() - 7 * DAY_MS;
        const weeklyXp = (window.state?.history || [])
            .filter(log => parseDate(log.date).getTime() >= weekAgo)
            .reduce((sum, log) => sum + (parseFloat(log.xp) || 0), 0);
        if (weeklyXp > 5200) mult *= 0.82;
        else if (weeklyXp > 3600) mult *= 0.92;

        if (projectedXp > 900) mult *= 0.9;
        return clamp(mult, 0.32, 1);
    }

    function isEliteUser() {
        if (typeof window.titanIsElite === 'function') return window.titanIsElite(window.state?.user);
        return window.state?.user?.is_elite === true;
    }

    function logCredits(log) {
        const details = log?.details || {};
        const reward = details.serverReward || details.rewardMeta || {};
        return Math.max(0, toNumber(reward.credits ?? reward.requestedCredits, Math.floor(toNumber(log?.xp, 0) * 0.16)));
    }

    function weeklyRewardUsage() {
        const start = weekStart().getTime();
        return (window.state?.history || [])
            .filter(log => parseDate(log.date).getTime() >= start)
            .reduce((acc, log) => {
                acc.xp += Math.max(0, toNumber(log.xp, 0));
                acc.credits += logCredits(log);
                return acc;
            }, { xp: 0, credits: 0 });
    }

    function localEconomyCaps() {
        const economy = window.TITAN_ECONOMY || {};
        return {
            xp: Math.floor(toNumber(economy.weeklyXpCap, 9600)),
            credits: Math.floor(toNumber(economy.weeklyCreditCap, 1800))
        };
    }

    function effortBaseXp(conf, unit, profile, numericValue, duration, elevation) {
        const formType = String(conf.formType || '').toLowerCase();
        const cat = String(conf.cat || '').toLowerCase();
        const value = Math.max(0, numericValue);
        if (unit === 'kg' || formType.includes('gym') || profile === 'strength' || cat.includes('force') || cat.includes('muscu')) {
            return Math.sqrt(Math.min(value, 300000)) * 3.15 + Math.min(duration, 120) * 0.75;
        }
        if (unit === 'km') {
            const km = Math.min(value, 250);
            const distCoeff = profile === 'cycling' ? 19 : (profile === 'hiking' ? 24 : (profile === 'trail' ? 36 : 32));
            const ascentCoeff = profile === 'trail' || profile === 'hiking' ? 0.105 : 0.075;
            return km * distCoeff + Math.min(duration, 600) * 0.55 + Math.min(elevation, 6000) * ascentCoeff;
        }
        if (unit === 'min') {
            const minuteCoeff = (profile === 'mobility' || profile === 'precision') ? 3.1 : 4.65;
            return Math.min(value, 720) * minuteCoeff;
        }
        if (['football', 'team', 'racket', 'combat', 'mixed'].includes(profile)) {
            return Math.min(duration || value, 240) * 4.2 + Math.min(value, 500) * 0.42;
        }
        return Math.min(value, 10000) * 6 + Math.min(duration, 180) * 0.6;
    }

    function computeSessionRewards(sportKey, dataInput, numericValue, analysis = {}) {
        const conf = sportConfig(sportKey);
        const rules = getXpRules(conf);
        const unit = String(conf.unit || '').toLowerCase();
        const details = dataInput && typeof dataInput === 'object' ? dataInput : {};
        const profile = conf.balanceProfile || inferSportProfile(sportKey, conf);
        const duration = Math.max(0, toNumber(details.gpxStats?.movingMinutes, toNumber(details.val2, unit === 'min' ? numericValue : 0)));
        const elevation = Math.max(0, toNumber(details.gpxStats?.ascent, toNumber(details.elevation, 0)));
        const rpe = clamp(parseInt(details.bio?.rpe || 5, 10) || 5, 1, 10);
        const baseXp = Math.max(1, effortBaseXp(conf, unit, profile, numericValue, duration, elevation));

        const extrasBonus = extraFieldBonus(conf, details, baseXp);
        const intensityMultiplier = clamp(1 + Math.max(0, rpe - 5) * 0.025, 1, 1.13);
        const terrainMultiplier = terrainDifficultyMultiplier(details.extras?.terrain || details.extras?.surface || details.extras?.technicality, rules);
        const plannedBoost = clamp(analysis.plannedBoost || 1, 1, 1.04);
        const penaltyMultiplier = clamp(analysis.penaltyMultiplier || 1, 0.32, 1.05);
        const talentMultiplier = clamp(analysis.talentMultiplier || 1, 1, 1.12);
        const creditMultiplier = clamp(analysis.creditMultiplier || 1, 1, 1.18);

        let xp = (baseXp + extrasBonus) * intensityMultiplier * terrainMultiplier * plannedBoost * penaltyMultiplier * talentMultiplier;
        xp *= progressionThrottleMultiplier(xp);
        xp = softCap(xp, parseFloat(rules.softCap) || 850, parseFloat(rules.capHardness) || 18);
        xp = Math.min(xp, parseFloat(rules.hardMax) || 900);
        const requestedXp = Math.max(1, Math.floor(xp));
        const creditRatio = 0.16;
        const requestedCredits = Math.min(90, Math.max(0, Math.floor(requestedXp * creditRatio * creditMultiplier)));
        const caps = localEconomyCaps();
        const usage = weeklyRewardUsage();
        const weeklyXpRemaining = Math.max(0, caps.xp - usage.xp);
        const weeklyCreditsRemaining = Math.max(0, caps.credits - usage.credits);
        const finalXp = Math.min(requestedXp, weeklyXpRemaining);
        const finalCredits = Math.min(requestedCredits, weeklyCreditsRemaining);
        return {
            xp: finalXp,
            credits: finalCredits,
            requestedXp,
            requestedCredits,
            weeklyCapped: finalXp < requestedXp || finalCredits < requestedCredits,
            weeklyXpRemaining: Math.max(0, weeklyXpRemaining - finalXp),
            weeklyCreditsRemaining: Math.max(0, weeklyCreditsRemaining - finalCredits),
            creditRatio,
            baseXp: Math.round(baseXp),
            extrasBonus: Math.round(extrasBonus),
            rules,
            balanceProfile: profile,
            rulesVersion: 'sport-balance-v69-local'
        };
    }

    function recordCandidates(log) {
        const det = log.details || {};
        const candidates = [
            { key: 'xp', label: 'XP sur une seance', value: parseFloat(log.xp) || 0, unit: 'XP' }
        ];
        if (log.unit) candidates.push({ key: `val_${log.unit}`, label: `Meilleure valeur (${log.unit})`, value: parseFloat(log.val) || 0, unit: log.unit });
        if (det.val2) candidates.push({ key: 'duration', label: 'Duree', value: parseFloat(det.val2) || 0, unit: 'min' });
        if (det.elevation) candidates.push({ key: 'elevation', label: 'Denivele', value: parseFloat(det.elevation) || 0, unit: 'm' });
        return candidates.filter(c => c.value > 0);
    }

    function ensureCollections() {
        const user = window.state.user;
        if (!user.records) user.records = {};
        if (!user.disciplineBadges) user.disciplineBadges = {};
        if (!user.unlockedTitles) user.unlockedTitles = ['title-recruit'];
        if (!user.activeTitle) user.activeTitle = 'title-recruit';
        if (!window.state.game.bestiary) window.state.game.bestiary = {};
        if (!window.state.game.adventureLog) window.state.game.adventureLog = [];
        if (!window.state.game.zones) window.state.game.zones = {};
    }

    function updateRecords(log) {
        ensureCollections();
        const sport = log.sport;
        if (!window.state.user.records[sport]) window.state.user.records[sport] = {};
        const bucket = window.state.user.records[sport];
        const unlocked = [];
        recordCandidates(log).forEach(candidate => {
            const prev = bucket[candidate.key];
            if (!prev || candidate.value > prev.value) {
                bucket[candidate.key] = {
                    value: candidate.value,
                    unit: candidate.unit,
                    label: candidate.label,
                    date: log.date,
                    logId: log.id
                };
                if (prev) unlocked.push(candidate);
            }
        });
        return unlocked;
    }

    function updateDisciplineBadges(log) {
        ensureCollections();
        const sport = log.sport;
        const count = (window.state.history || []).filter(item => item.sport === sport).length;
        if (!window.state.user.disciplineBadges[sport]) window.state.user.disciplineBadges[sport] = [];
        const bucket = window.state.user.disciplineBadges[sport];
        const thresholds = [3, 5, 10, 25, 50, 100];
        const gained = [];
        thresholds.forEach(target => {
            const id = `${sport}_${target}`;
            if (count >= target && !bucket.includes(id)) {
                bucket.push(id);
                gained.push({ id, sport, target, label: `${sportLabel(sport)} x${target}` });
            }
        });
        return gained;
    }

    function titleStats() {
        const user = window.state?.user || {};
        const records = Object.values(user.records || {}).reduce((sum, sportRecords) => sum + Object.keys(sportRecords || {}).length, 0);
        const bestiary = window.state?.game?.bestiary || {};
        const defeated = Object.values(bestiary).reduce((sum, entry) => sum + (entry.defeats || 0), 0);
        return {
            sessions: (window.state?.history || []).length,
            records,
            defeated,
            bossKills: Math.max(0, (window.state?.game?.bossLevel || 1) - 1),
            varietyScore: varietyMatrix().score
        };
    }

    function getTitleById(id) {
        return TITLES.find(title => title.id === id) || TITLES[0];
    }

    function getActiveTitle(user = window.state?.user) {
        return getTitleById(user?.activeTitle || 'title-recruit');
    }

    function updateTitles() {
        ensureCollections();
        const stats = titleStats();
        const gained = [];
        TITLES.forEach(title => {
            if (title.test(stats) && !window.state.user.unlockedTitles.includes(title.id)) {
                window.state.user.unlockedTitles.push(title.id);
                gained.push(title);
            }
        });
        return gained;
    }

    function afterActivityLogged(log, analysis) {
        ensureCollections();
        log.details = sanitizeSessionDetails(log.details, window.state.user);
        log.details.load = getSessionLoad(log);
        log.details.summary = buildSessionSummary(log, analysis);
        log.details.weekId = window.getCurrentWeekId ? window.getCurrentWeekId(parseDate(log.date)) : '';
        if (log.unit === 'km' && log.details.val2 > 0) {
            log.details.gpxStats = Object.assign({}, log.details.gpxStats || {}, {
                pace: formatPace(log.val, log.details.val2),
                speed: `${(parseFloat(log.val) / (parseFloat(log.details.val2) / 60)).toFixed(1)} km/h`
            });
        }
        const records = updateRecords(log);
        const badges = updateDisciplineBadges(log);
        const titles = updateTitles();
        const identity = updateProgressionIdentity(log, { records, badges, titles });
        const contextualRecords = buildContextualRecords();
        const cooldown = buildCooldownGuide(log);
        const selfCompetition = buildSelfCompetition();
        const plateau = detectPlateau();
        const regularityBadges = buildRegularityBadges();
        return {
            records,
            badges,
            titles,
            summary: log.details.summary,
            identity,
            qualities: identity.qualities || [],
            contextualRecords,
            cooldown,
            selfCompetition,
            plateau,
            regularityBadges
        };
    }

    function enemyRarity(seed, type = 'MOB') {
        if (type === 'BOSS') return { id: 'alpha', label: 'ALPHA', hpMult: 1, rewardMult: 1.2, color: '#ef4444' };
        const n = parseInt(seed, 10) || 1;
        if (n % 11 === 0) return { id: 'elite', label: 'ELITE', hpMult: 1.45, rewardMult: 1.5, color: '#9ee7ff' };
        if (n % 5 === 0) return { id: 'rare', label: 'RARE', hpMult: 1.2, rewardMult: 1.25, color: '#38bdf8' };
        return { id: 'common', label: 'STANDARD', hpMult: 1, rewardMult: 1, color: '#94a3b8' };
    }

    function enemyWeakness(seed, dataWeak) {
        const raw = String(dataWeak || '').toLowerCase();
        if (raw.includes('force') || raw.includes('muscu')) return 'force';
        if (raw.includes('cardio') || raw.includes('endurance')) return 'cardio';
        if (raw.includes('outdoor') || raw.includes('gps') || raw.includes('course')) return 'outdoor';
        if (raw.includes('recup') || raw.includes('mobil')) return 'recovery';
        const pool = ['force', 'cardio', 'outdoor', 'recovery'];
        const n = parseInt(seed, 10) || 1;
        return pool[n % pool.length];
    }

    function weaknessLabel(id) {
        return {
            force: 'FORCE',
            cardio: 'CARDIO',
            outdoor: 'OUTDOOR',
            recovery: 'RECUPERATION',
            technique: 'TECHNIQUE',
            general: 'TOUT'
        }[id] || String(id || 'INCONNU').toUpperCase();
    }

    function getZone(level = window.state?.game?.bossLevel || 1) {
        return ZONES.find(zone => level >= zone.range[0] && level <= zone.range[1]) || ZONES[ZONES.length - 1];
    }

    function bossMechanic(seed, weakness, sourceData = {}) {
        const raw = `${weakness || ''} ${sourceData?.weak || ''} ${sourceData?.name || ''} ${sourceData?.description || sourceData?.desc || ''}`.toLowerCase();
        if (raw.includes('force') || raw.includes('fort') || raw.includes('armure')) return BOSS_MECHANICS.force;
        if (raw.includes('recup') || raw.includes('sommeil') || raw.includes('tox') || raw.includes('fatigue')) return BOSS_MECHANICS.recovery;
        if (raw.includes('outdoor') || raw.includes('terrain') || raw.includes('course') || raw.includes('trail')) return BOSS_MECHANICS.outdoor;
        if (raw.includes('tech') || raw.includes('precision') || raw.includes('combat')) return BOSS_MECHANICS.technique;
        if (raw.includes('cardio') || raw.includes('endurance')) return BOSS_MECHANICS.cardio;
        const pool = [BOSS_MECHANICS.force, BOSS_MECHANICS.cardio, BOSS_MECHANICS.recovery, BOSS_MECHANICS.technique, BOSS_MECHANICS.outdoor];
        const n = parseInt(seed, 10) || 1;
        return pool[n % pool.length];
    }

    function bossPrepStatus(enemy, history = window.state?.history || []) {
        const mechanic = enemy?.mechanic || bossMechanic(enemy?.imageId || enemy?.id || 1, enemy?.weakness, enemy);
        const since = Date.now() - 14 * DAY_MS;
        const recent = history.filter(log => parseDate(log.date).getTime() >= since);
        const required = mechanic.requiredFamily;
        const match = recent.filter(log => {
            const family = getSportFamily(log);
            const profile = inferSportProfile(log.sport, sportConfig(log.sport));
            const tags = log.details?.tags || [];
            if (required === 'technique') return tags.includes('technique') || ['combat', 'racket', 'team', 'football', 'skill', 'precision'].includes(profile);
            return family === required || tags.includes(required);
        });
        const ready = required === 'recovery' ? match.length >= 1 : match.length >= 2;
        return {
            ready,
            count: match.length,
            required,
            label: weaknessLabel(required),
            mechanic
        };
    }

    function selfDuelProfile(radar = physicalRadar()) {
        const strongest = (radar.axes || []).slice().sort((a, b) => b.score - a.score)[0] || { id: 'general', label: 'General', score: 0 };
        const map = {
            force: 'force',
            endurance: 'cardio',
            explosivity: 'force',
            mobility: 'recovery',
            technique: 'technique',
            regularity: 'recovery',
            recovery: 'recovery',
            versatility: 'general'
        };
        return {
            id: 'mirror_10',
            label: 'Duel contre soi-meme',
            strongestQuality: strongest,
            immuneFamily: map[strongest.id] || 'general',
            rule: `Resiste a ton point fort: ${strongest.label}. Il faut varier pour ouvrir la faille.`
        };
    }

    function bossPhasePlan(level = 1, enemy = {}) {
        const lvl = Number(level || window.state?.game?.bossLevel || 1);
        const weakness = enemy.weakness || 'general';
        if (lvl < 5) {
            return [{ index: 1, label: 'Ouverture', threshold: 1, multiplier: 1, note: 'Phase simple.' }];
        }
        const phases = [
            { index: 1, label: 'Blindage', threshold: 1, multiplier: 0.92, note: 'Degats reduits tant que la cible est haute.' },
            { index: 2, label: 'Faille active', threshold: 0.66, multiplier: 1.08, note: `La faiblesse ${weaknessLabel(weakness)} devient plus rentable.` },
            { index: 3, label: 'Dernier seuil', threshold: 0.33, multiplier: 0.96, note: 'La fin demande une trace propre ou une charge stockee.' }
        ];
        if (lvl >= 10) {
            phases.push({ index: 4, label: 'Miroir', threshold: 0.18, multiplier: 0.9, note: 'Le boss copie tes forces dominantes.' });
        }
        return phases;
    }

    function currentBossPhase(enemy) {
        const phases = enemy?.phases || bossPhasePlan(window.state?.game?.bossLevel || 1, enemy || {});
        const ratio = enemy?.maxHp ? Math.max(0, enemy.hp || 0) / enemy.maxHp : 1;
        return phases.slice().reverse().find(phase => ratio <= phase.threshold) || phases[0];
    }

    function hydrateEnemyMeta(enemy, sourceData, imageId, type) {
        if (!enemy) return enemy;
        const rarity = enemy.rarity ? enemy.rarity : enemyRarity(imageId || enemy.imageId || enemy.id, type);
        const weakness = enemy.weakness || enemyWeakness(imageId || enemy.imageId || enemy.id, sourceData?.weak);
        enemy.rarity = rarity;
        enemy.weakness = weakness;
        enemy.zoneId = getZone().id;
        enemy.rewardMult = rarity.rewardMult || 1;
        if (type === 'BOSS' || enemy.type === 'BOSS') {
            enemy.mechanic = bossMechanic(imageId || enemy.imageId || enemy.id, weakness, sourceData);
            enemy.campaignLevel = enemy.campaignLevel || window.state?.game?.bossLevel || 1;
            enemy.phases = bossPhasePlan(enemy.campaignLevel, enemy);
            if (Number(enemy.campaignLevel) === 10) enemy.selfDuel = selfDuelProfile();
        }
        return enemy;
    }

    function combatDamage(baseDamage, enemy) {
        const lastFamily = window.state?.game?.lastTrainingFamily || 'general';
        const weakness = enemy?.weakness || 'general';
        const isWeak = weakness === lastFamily || weakness === 'general';
        let multiplier = isWeak ? 1.2 : 1;
        let prep = null;
        if (enemy?.type === 'BOSS') {
            prep = bossPrepStatus(enemy);
            multiplier *= prep.ready ? (prep.mechanic.bonus || 1.12) : (prep.mechanic.penalty || 0.92);
            const phase = currentBossPhase(enemy);
            multiplier *= phase.multiplier || 1;
            if (enemy.selfDuel && enemy.selfDuel.immuneFamily === lastFamily && lastFamily !== 'general') {
                multiplier *= 0.08;
            } else if (enemy.selfDuel && lastFamily !== enemy.selfDuel.immuneFamily) {
                multiplier *= 1.16;
            }
            if (prep.required === 'recovery') {
                const recovery = recoverySnapshot();
                if (recovery.score < 42) multiplier *= 0.88;
                if (recovery.score >= 70) multiplier *= 1.08;
            }
        }
        return {
            damage: Math.floor(baseDamage * multiplier),
            weakHit: isWeak && weakness !== 'general',
            weakness,
            prep,
            phase: enemy?.type === 'BOSS' ? currentBossPhase(enemy) : null,
            selfDuel: enemy?.selfDuel || null
        };
    }

    function registerCombatVictory(enemy, isBoss, reward) {
        if (!window.state?.game || !enemy) return;
        ensureCollections();
        const campaignLevel = Number(enemy.campaignLevel || window.state.game.bossLevel || 1);
        const enemyType = enemy.type || (isBoss ? 'BOSS' : 'MOB');
        const key = isBoss
            ? `BOSS_${enemy.id || enemy.name || enemy.imageId}_LV${campaignLevel}`
            : `${enemyType}_${enemy.id || enemy.imageId || enemy.name}`;
        const entry = window.state.game.bestiary[key] || {
            key,
            id: enemy.id,
            type: enemyType,
            name: enemy.name || 'Entite inconnue',
            imageId: enemy.imageId,
            imgOverride: enemy.imgOverride,
            weakness: enemy.weakness,
            mechanic: enemy.mechanic || null,
            campaignLevel: isBoss ? campaignLevel : null,
            rarity: enemy.rarity,
            firstSeenAt: new Date().toISOString(),
            defeats: 0,
            encounters: 0,
            totalReward: 0
        };
        entry.encounters = (entry.encounters || 0) + 1;
        entry.defeats = isBoss ? 1 : (entry.defeats || 0) + 1;
        entry.defeated = true;
        entry.lastDefeatedAt = new Date().toISOString();
        entry.weakness = enemy.weakness || entry.weakness;
        entry.mechanic = enemy.mechanic || entry.mechanic;
        entry.phases = enemy.phases || entry.phases || [];
        entry.selfDuel = enemy.selfDuel || entry.selfDuel || null;
        entry.card = {
            title: isBoss ? `Carte unique // Boss ${campaignLevel}` : `Specimen ${entry.rarity?.label || 'standard'}`,
            subtitle: `${weaknessLabel(entry.weakness)} // ${entry.mechanic?.label || entry.rarity?.label || 'Signal inconnu'}`,
            acquiredAt: new Date().toISOString(),
            premiumDetail: window.state.user.is_elite === true
        };
        entry.rarity = enemy.rarity || entry.rarity;
        entry.decidingSport = window.state.game.lastTrainingSport || entry.decidingSport || null;
        entry.totalReward = (entry.totalReward || 0) + Number(reward?.total || 0);
        if (isBoss) entry.title = `Boss niveau ${campaignLevel}`;
        window.state.game.bestiary[key] = entry;
        if (isBoss) {
            if (!Array.isArray(window.state.user.relics)) window.state.user.relics = [];
            const relicId = `relic_boss_${campaignLevel}`;
            if (!window.state.user.relics.some(relic => relic.id === relicId)) {
                window.state.user.relics.unshift({
                    id: relicId,
                    label: `Relique ${entry.name}`,
                    type: 'boss_relic',
                    visualOnly: true,
                    acquiredAt: new Date().toISOString()
                });
                window.state.user.relics = window.state.user.relics.slice(0, window.state.user.is_elite ? 120 : 30);
            }
            window.state.user.campaignSeason = Object.assign({ id: 'season-01', label: 'Cycle Ferrite', progress: 0 }, window.state.user.campaignSeason || {});
            window.state.user.campaignSeason.progress = Math.max(window.state.user.campaignSeason.progress || 0, campaignLevel);
        }
        const zone = getZone(campaignLevel);
        window.state.game.zones[zone.id] = {
            id: zone.id,
            name: zone.name,
            lastClearedAt: new Date().toISOString(),
            victories: (window.state.game.zones[zone.id]?.victories || 0) + 1
        };
        window.state.game.adventureLog.unshift({
            id: Date.now(),
            date: new Date().toISOString(),
            zone: zone.name,
            enemy: entry.name,
            type: entry.type,
            rarity: entry.rarity?.label || 'STANDARD',
            reward: reward?.total || 0
        });
        window.state.game.adventureLog = window.state.game.adventureLog.slice(0, 80);
        updateTitles();
    }

    function htmlEscape(value) {
        return String(value || '').replace(/[&<>"']/g, char => ({
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            "'": '&#39;'
        }[char]));
    }

    window.TITAN_SESSION_TAGS = TAGS;
    window.TITAN_TITLES = TITLES;
    window.TITAN_CAMPAIGN_ZONES = ZONES;
    window.TITAN_QUALITY_META = QUALITY_META;
    window.TITAN_BOSS_MECHANICS = BOSS_MECHANICS;
    window.TITAN_TALENT_CONSTELLATIONS = TALENT_CONSTELLATIONS;
    window.TITAN_CAMPAIGN_PROFESSIONS = CAMPAIGN_PROFESSIONS;
    window.TITAN_GUILD_ROLES = GUILD_ROLES;
    window.TITAN_INNOVATION_SPORTS = INNOVATION_SPORTS;
    window.TITAN_OLYMPIC_CATALOG_SPORTS = OLYMPIC_CATALOG_SPORTS;
    window.TITAN_BROAD_CATALOG_SPORTS = BROAD_CATALOG_SPORTS;
    window.TITAN_NON_SPORT_CATALOG_IDS = Array.from(NON_SPORT_CATALOG_IDS);
    window.TITAN_OLYMPIC_PROGRAMS = {
        olympic_summer_2028: 'LA28 Olympic Games',
        olympic_winter_2026: 'Milano Cortina 2026 Olympic Winter Games'
    };
    window.TITAN_FEATURE_CATALOG = FEATURE_CATALOG;
    window.TITAN_APP_DIFFERENTIATION = APP_DIFFERENTIATION;
    window.TITAN_DATA_DICTIONARY = DATA_DICTIONARY;
    window.titanNotesLimit = notesLimit;
    window.titanSanitizeSessionDetails = sanitizeSessionDetails;
    window.titanNormalizeExtraFields = normalizeExtraFields;
    window.titanExtraFieldIsVisible = fieldIsVisible;
    window.titanEnsureInnovationSports = ensureInnovationSports;
    window.titanEnhanceSportsConfig = enhanceSportsConfig;
    window.titanEnhanceSportConfig = enhanceSportConfig;
    window.titanInferSportProfile = inferSportProfile;
    window.titanComputeSessionRewards = computeSessionRewards;
    window.titanGetSessionLoad = getSessionLoad;
    window.titanGetSessionMetricDefinitions = sessionMetricDefinitions;
    window.titanReadSessionMetric = readSessionMetric;
    window.titanCollectSessionMetrics = collectSessionMetrics;
    window.titanGetSessionMetricTrends = sessionMetricTrends;
    window.titanGetSessionCoachingReadout = sessionCoachingReadout;
    window.titanGetRecoverySnapshot = recoverySnapshot;
    window.titanGetWeekComparison = weekComparison;
    window.titanGetVarietyMatrix = varietyMatrix;
    window.titanGetFavoriteSports = favoriteSports;
    window.titanGetTodayObjective = todayObjective;
    window.titanGetPhysicalRadar = physicalRadar;
    window.titanGetQualityContributions = topQualityContributions;
    window.titanGetDisciplineGoal = buildDisciplineGoal;
    window.titanSyncDisciplineGoals = syncDisciplineGoals;
    window.titanDetectTrainingImbalances = detectTrainingImbalances;
    window.titanGetCoachRecommendation = buildCoachRecommendation;
    window.titanDeriveArchetype = deriveArchetype;
    window.titanDeriveReputation = deriveReputation;
    window.titanDeriveCampaignProfession = deriveCampaignProfession;
    window.titanDeriveGuildRole = deriveGuildRole;
    window.titanBuildFreshnessScore = buildFreshnessScore;
    window.titanBuildLoadCalendar = buildLoadCalendar;
    window.titanDetectReturnPlan = detectReturnPlan;
    window.titanBuildPersonalRivals = buildPersonalRivals;
    window.titanDetectPlateau = detectPlateau;
    window.titanBuildContextualRecords = buildContextualRecords;
    window.titanBuildCooldownGuide = buildCooldownGuide;
    window.titanBuildRegularityBadges = buildRegularityBadges;
    window.titanBuildSelfCompetition = buildSelfCompetition;
    window.titanBuildMonthlyReport = buildMonthlyReport;
    window.titanBuildPersonalSegments = buildPersonalSegments;
    window.titanBuildPersonalHeatmap = buildPersonalHeatmap;
    window.titanBuildSmartGoals = buildSmartGoals;
    window.titanBuildAdvancedLoad = buildAdvancedLoad;
    window.titanBuildRoutePlanner = buildRoutePlanner;
    window.titanBuildLiveSegmentPreview = buildLiveSegmentPreview;
    window.titanBuildAthleteProfile = buildAthleteProfile;
    window.titanBuildSmartSportBrief = buildSmartSportBrief;
    window.titanAppendAdventureJournalEntry = appendAdventureJournalEntry;
    window.titanAnalyzeSession = analyzeSession;
    window.titanAfterActivityLogged = afterActivityLogged;
    window.titanGetTitleStats = titleStats;
    window.titanUpdateTitles = updateTitles;
    window.titanGetTitleById = getTitleById;
    window.titanGetActiveTitle = getActiveTitle;
    window.titanGetEnemyRarity = enemyRarity;
    window.titanGetEnemyWeakness = enemyWeakness;
    window.titanGetBossMechanic = bossMechanic;
    window.titanGetBossPrepStatus = bossPrepStatus;
    window.titanGetBossPhasePlan = bossPhasePlan;
    window.titanGetCurrentBossPhase = currentBossPhase;
    window.titanGetSelfDuelProfile = selfDuelProfile;
    window.titanWeaknessLabel = weaknessLabel;
    window.titanHydrateEnemyMeta = hydrateEnemyMeta;
    window.titanCombatDamage = combatDamage;
    window.titanRegisterCombatVictory = registerCombatVictory;
    window.titanGetCampaignZone = getZone;
    window.titanEscapeHTML = htmlEscape;
    window.titanFormatPace = formatPace;
    ensureInnovationSports(window.SPORTS_CONFIG);
    enhanceSportsConfig(window.SPORTS_CONFIG);
})();
