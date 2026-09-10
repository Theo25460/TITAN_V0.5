/* =========================================
   TITAN OS - SPORT DISCOVERY CORE (V88)
   Recherche, familles et lecture du catalogue.
   ========================================= */

(function initTitanSportDiscovery() {
    const CATEGORY_LABELS = {
        cardio: 'Cardio',
        endurance: 'Endurance',
        force: 'Force',
        muscu: 'Musculation',
        combat: 'Combat',
        team: 'Équipe',
        outdoor: 'Outdoor',
        skill: 'Technique',
        mixed: 'Multisport',
        mobility: 'Mobilité',
        crossfit: 'Conditioning',
        zen: 'Corps & esprit',
        fun: 'Loisir'
    };

    const PROFILE_LABELS = {
        team: 'Équipe',
        water: 'Eau',
        glide: 'Glisse',
        cycling: 'Endurance',
        skill: 'Technique',
        precision: 'Précision',
        combat: 'Combat',
        strength: 'Force',
        racket: 'Raquette',
        mixed: 'Multisport',
        running: 'Endurance',
        swimming: 'Eau',
        mobility: 'Mobilité',
        hiking: 'Endurance'
    };

    const PROFILE_METRICS = {
        team: ['Format', 'Temps joué', 'Score', 'Actions décisives'],
        water: ['Conditions', 'Cadence', 'Technique', 'Chutes'],
        glide: ['Surface', 'Runs', 'Dénivelé', 'Exécution'],
        cycling: ['Dénivelé', 'Vitesse', 'Cadence', 'Puissance'],
        skill: ['Format', 'Difficulté', 'Réussites', 'Exécution'],
        precision: ['Tentatives', 'Réussites', 'Précision', 'Score moyen'],
        combat: ['Format', 'Rounds', 'Actions propres', 'Contrôle'],
        strength: ['Mouvement', 'Séries', 'Répétitions', 'Charge'],
        racket: ['Résultat', 'Sets gagnés', 'Points directs', 'Fautes'],
        mixed: ['Format', 'Rounds', 'Ateliers', 'Temps de travail'],
        running: ['Format', 'Dénivelé', 'Allure', 'FC moyenne'],
        swimming: ['Nage', 'Bassin', 'Allure', 'Cadence'],
        mobility: ['Format', 'Zone', 'Amplitude', 'Respiration'],
        hiking: ['Terrain', 'Dénivelé', 'Poids du sac', 'Technicité'],
        generic: ['Durée', 'Intensité', 'Notes']
    };

    const FAMILIES = [
        { id: 'all', label: 'Tous', icon: 'ri-layout-grid-line', terms: [] },
        { id: 'endurance', label: 'Endurance', icon: 'ri-road-map-line', terms: ['cardio', 'endurance', 'running', 'trail', 'hiking', 'cycling', 'swimming', 'outdoor'] },
        { id: 'force', label: 'Force', icon: 'ri-boxing-line', terms: ['force', 'muscu', 'strength', 'calisthenics', 'weightlifting', 'powerlifting'] },
        { id: 'combat', label: 'Combat', icon: 'ri-boxing-line', terms: ['combat', 'boxing', 'grappling', 'striking', 'weapon', 'judo', 'lutte', 'mma'] },
        { id: 'team', label: 'Équipe', icon: 'ri-team-line', terms: ['team', 'football', 'rugby', 'hockey', 'basket', 'volley', 'handball', 'collectif'] },
        { id: 'racket', label: 'Raquette', icon: 'ri-ping-pong-line', terms: ['racket', 'raquette', 'tennis', 'padel', 'badminton', 'squash', 'pickleball'] },
        { id: 'water', label: 'Eau', icon: 'ri-drop-line', terms: ['water', 'swimming', 'natation', 'kayak', 'surf', 'voile', 'plongee', 'paddle'] },
        { id: 'glide', label: 'Glisse', icon: 'ri-snowy-line', terms: ['glide', 'ski', 'snowboard', 'roller', 'skate', 'patinage', 'cycling'] },
        { id: 'precision', label: 'Précision', icon: 'ri-focus-3-line', terms: ['precision', 'tir', 'arc', 'golf', 'bowling', 'flechettes', 'petanque'] },
        { id: 'mobility', label: 'Mobilité', icon: 'ri-mental-health-line', terms: ['mobility', 'mindbody', 'dance', 'yoga', 'pilates', 'stretching', 'tai chi'] }
    ];

    const FEATURED_SPORTS = [
        ['running', 'Course à pied', 'cardio', 'running', 'km', 'ri-run-line', 'Allure, distance, durée, cadence et fréquence cardiaque.'],
        ['muscu_builder', 'Musculation', 'force', 'strength', 'kg', 'ri-boxing-line', 'Séries, répétitions, charge, volume et records personnels.'],
        ['cycling_road', 'Cyclisme sur route', 'endurance', 'cycling', 'km', 'ri-riding-line', 'Distance, dénivelé, cadence, vitesse et puissance.'],
        ['swimming', 'Natation', 'endurance', 'swimming', 'm', 'ri-drop-line', 'Distance, nage, allure, longueur de bassin et technique.'],
        ['football', 'Football', 'team', 'football', 'min', 'ri-football-line', 'Temps de jeu, poste, buts, passes et duels.'],
        ['padel', 'Padel', 'team', 'racket', 'min', 'ri-ping-pong-line', 'Sets, breaks, jeu au filet, fautes et qualité d’échange.'],
        ['trail', 'Trail', 'outdoor', 'trail', 'km', 'ri-landscape-line', 'Distance, dénivelé, technicité, allure et temps d’effort.'],
        ['boxing', 'Boxe', 'combat', 'combat_striking', 'min', 'ri-boxing-line', 'Rounds, précision, technique, intensité et contrôle.'],
        ['yoga', 'Yoga', 'mobility', 'mindbody', 'min', 'ri-mental-health-line', 'Durée, mobilité, respiration, équilibre et ressenti.'],
        ['climbing_route', 'Escalade', 'skill', 'climbing', 'min', 'ri-landscape-line', 'Niveau, essais, voies réussies, style et chutes.'],
        ['rowing_machine', 'Rameur', 'cardio', 'water', 'min', 'ri-ship-line', 'Split 500 m, cadence, puissance, distance et durée.'],
        ['basketball', 'Basketball', 'team', 'team', 'min', 'ri-basketball-line', 'Temps de jeu, score, rebonds, passes et actions décisives.']
    ].map(([key, label, cat, balanceProfile, unit, icon, description], index) => ({
        key,
        conf: {
            label,
            cat,
            balanceProfile,
            unit,
            icon,
            formType: unit === 'km' ? 'gps_full' : 'duration',
            description,
            extraFields: [],
            trackingSummary: {
                headline: description,
                aliases: [],
                searchTokens: [label, cat, balanceProfile],
                catalogPolish: 'v88-fallback'
            },
            sortOrder: index
        }
    }));    

    const QUERY_EXPANSIONS = {
        paddle: ['padel'],
        padel: ['paddle'],
        courir: ['course', 'running', 'jogging', 'trail'],
        jogging: ['course', 'running'],
        muscu: ['musculation', 'force', 'strength'],
        'se renforcer': ['musculation', 'force', 'calisthenics'],
        foot: ['football', 'futsal'],
        velo: ['cyclisme', 'cycling', 'vtt'],
        recuperer: ['mobilite', 'yoga', 'stretching'],
        'dans l eau': ['water', 'natation', 'swimming', 'paddle'],
        'sport equipe': ['team', 'collectif', 'football', 'basketball']
    };

    function normalize(value) {
        return String(value || '')
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .replace(/[’']/g, ' ')
            .replace(/[_/.-]+/g, ' ')
            .replace(/[^a-zA-Z0-9\s]+/g, ' ')
            .replace(/\s+/g, ' ')
            .trim()
            .toLowerCase();
    }

    function array(value) {
        return Array.isArray(value) ? value : [];
    }

    function safeIcon(value, fallback = 'ri-flashlight-line') {
        const icon = String(value || '').trim();
        return /^ri-[a-z0-9-]+$/i.test(icon) ? icon : fallback;
    }

    function profileKey(conf) {
        const profile = normalize(conf?.balanceProfile || conf?.balance_profile);
        if (['team', 'football', 'rugby', 'hockey team', 'contact team', 'volleyball'].includes(profile)) return 'team';
        if (['water', 'open water', 'rowing'].includes(profile)) return 'water';
        if (['glide', 'mtb'].includes(profile)) return 'glide';
        if (profile === 'cycling') return 'cycling';
        if (['skill', 'gym skill', 'climbing'].includes(profile)) return 'skill';
        if (profile === 'precision') return 'precision';
        if (['combat', 'combat grappling', 'combat striking', 'combat weapon'].includes(profile)) return 'combat';
        if (['strength', 'strength max', 'calisthenics'].includes(profile)) return 'strength';
        if (profile === 'racket') return 'racket';
        if (['mixed', 'mixed conditioning'].includes(profile)) return 'mixed';
        if (['running', 'speed', 'trail', 'mountain endurance'].includes(profile)) return 'running';
        if (profile === 'swimming') return 'swimming';
        if (['mobility', 'mindbody', 'dance'].includes(profile)) return 'mobility';
        if (profile === 'hiking') return 'hiking';
        return profile && PROFILE_LABELS[profile] ? profile : 'generic';
    }

    function categoryLabel(conf) {
        const family = profileKey(conf);
        if (PROFILE_LABELS[family]) return PROFILE_LABELS[family];
        const category = normalize(conf?.cat || conf?.category);
        if (CATEGORY_LABELS[category]) return CATEGORY_LABELS[category];
        const profile = String(conf?.balanceProfile || conf?.balance_profile || '').replace(/_/g, ' ').trim();
        return profile ? profile.charAt(0).toUpperCase() + profile.slice(1) : 'Sport';
    }

    function searchText(conf, key = '') {
        const summary = conf?.trackingSummary || conf?.tracking_summary || {};
        const fields = array(conf?.extraFields || conf?.extra_fields);
        const bits = [
            key,
            conf?.slug,
            conf?.name,
            conf?.label,
            conf?.description,
            conf?.cat,
            conf?.category,
            conf?.balanceProfile,
            conf?.balance_profile,
            conf?.formType,
            conf?.form_type,
            summary.officialLabel,
            summary.disciplineGroup,
            summary.environment,
            summary.intensity,
            summary.catalogTier,
            summary.headline
        ];
        array(summary.aliases).forEach(value => bits.push(value));
        array(summary.programs).forEach(value => bits.push(value));
        array(summary.graphs).forEach(value => bits.push(value));
        array(summary.searchTokens).forEach(value => bits.push(value));
        fields.forEach(field => {
            bits.push(field?.id, field?.label, field?.unit);
            array(field?.options).forEach(option => bits.push(option));
        });
        return normalize(bits.filter(Boolean).join(' '));
    }

    function makeEntry(key, conf) {
        return {
            key: String(key || conf?.id || ''),
            conf,
            search: searchText(conf, key)
        };
    }

    function scoreOne(entry, q) {
        if (!q) return 1;
        const label = normalize(entry?.conf?.label || entry?.conf?.name);
        const key = normalize(entry?.key);
        const summary = entry?.conf?.trackingSummary || entry?.conf?.tracking_summary || {};
        const aliases = array(summary.aliases).map(normalize);
        const queryTokens = q.split(' ').filter(Boolean);
        const searchable = String(entry?.search || searchText(entry?.conf, entry?.key) || '');
        const words = searchable.split(' ').filter(Boolean);

        if (label === q || key === q) return 160;
        if (label.startsWith(q) || key.startsWith(q)) return 125;
        if (aliases.some(alias => alias === q)) return 118;
        if (aliases.some(alias => alias.startsWith(q))) return 108;
        if (queryTokens.length > 1 && queryTokens.every(token => searchable.includes(token))) return 94 + queryTokens.length;
        if (words.some(word => word === q)) return 88;
        if (words.some(word => word.startsWith(q))) return 72;
        if (searchable.includes(q)) return 52;

        const partialHits = queryTokens.filter(token => words.some(word => word.startsWith(token))).length;
        return partialHits === queryTokens.length && partialHits > 0 ? 42 + partialHits : 0;
    }

    function score(entry, query) {
        const q = normalize(query);
        const variants = [q, ...(QUERY_EXPANSIONS[q] || []).map(normalize)];
        return Math.max(...variants.map(variant => scoreOne(entry, variant)));
    }

    function familyMatches(entry, familyId) {
        const family = FAMILIES.find(item => item.id === familyId);
        if (!family || family.id === 'all') return true;
        return family.terms.some(term => entry.search.includes(normalize(term)));
    }

    function fromRows(rows) {
        return array(rows)
            .filter(row => row && row.is_active !== false && row.id && row.label)
            .map(row => makeEntry(row.id, {
                label: row.label,
                name: row.name,
                slug: row.slug,
                description: row.description || row.tracking_summary?.headline || '',
                cat: row.category,
                icon: row.icon,
                unit: row.unit,
                formType: row.form_type,
                balanceProfile: row.balance_profile,
                trackingSummary: row.tracking_summary || {},
                extraFields: array(row.extra_fields),
                sortOrder: Number(row.sort_order || 0)
            }));
    }

    function fromConfig(config) {
        const blocked = new Set(window.TITAN_NON_SPORT_CATALOG_IDS || []);
        return Object.entries(config || {})
            .filter(([key, conf]) => conf && conf.label && !blocked.has(key))
            .map(([key, conf]) => makeEntry(key, conf));
    }

    function metricLabels(conf, limit = 4) {
        const configured = array(conf?.extraFields || conf?.extra_fields)
            .map(field => String(field?.label || field?.id || '').trim())
            .filter(Boolean);
        return (configured.length ? configured : PROFILE_METRICS[profileKey(conf)] || PROFILE_METRICS.generic)
            .slice(0, limit);
    }

    function stats(entries) {
        const list = array(entries);
        return {
            total: list.length,
            categories: new Set(list.map(entry => normalize(entry.conf?.cat || entry.conf?.category)).filter(Boolean)).size,
            withMetrics: list.filter(entry => metricLabels(entry.conf, 1).length > 0).length,
            olympic: list.filter(entry => array(entry.conf?.trackingSummary?.programs).some(program => String(program).startsWith('olympic_'))).length
        };
    }

    window.TITAN_SPORT_CATEGORY_LABELS = CATEGORY_LABELS;
    window.TITAN_SPORT_PROFILE_METRICS = PROFILE_METRICS;
    window.TITAN_SPORT_FAMILIES = FAMILIES;
    window.TITAN_FEATURED_SPORTS = FEATURED_SPORTS;
    window.titanNormalizeSportSearch = normalize;
    window.titanSafeSportIcon = safeIcon;
    window.titanSportCategoryLabel = categoryLabel;
    window.titanSportSearchText = searchText;
    window.titanSportSearchScore = score;
    window.titanSportFamilyMatches = familyMatches;
    window.titanSportEntriesFromRows = fromRows;
    window.titanSportEntriesFromConfig = fromConfig;
    window.titanSportMetricLabels = metricLabels;
    window.titanSportCatalogStats = stats;
})();
