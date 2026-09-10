(function titanAdminControlCenter() {
    'use strict';

    const ADMIN_ROLES = ['user', 'premium', 'moderator', 'admin', 'super_admin'];
    const USER_STATUS = ['active', 'suspended', 'banned', 'deleted'];
    const YES_NO = [
        { value: '', label: 'Tous' },
        { value: 'true', label: 'Oui' },
        { value: 'false', label: 'Non' }
    ];
    const ADMIN_UPSERT_TABLES = new Set([
        'site_settings', 'content_blocks', 'dynamic_pages', 'announcements',
        'lore_chapters', 'creatures', 'mobs', 'bosses', 'shop_items', 'sports',
        'contact_messages', 'bug_reports', 'reports', 'influencers', 'training_logs',
        'contest_entries'
    ]);
    const CATALOG_TABLES = new Set([
        'site_settings', 'content_blocks', 'dynamic_pages', 'announcements',
        'lore_chapters', 'creatures', 'mobs', 'bosses', 'shop_items', 'sports'
    ]);

    const NAV = [
        { id: 'dashboard', label: 'Dashboard', icon: 'ri-dashboard-3-line', custom: 'dashboard' },
        { id: 'users', label: 'Utilisateurs', icon: 'ri-user-3-line', custom: 'users' },
        { id: 'activities', label: 'Activites', icon: 'ri-run-line', table: 'training_logs' },
        { id: 'premium', label: 'Premium', icon: 'ri-vip-crown-2-line', custom: 'premium' },
        { id: 'contest', label: 'Concours', icon: 'ri-trophy-line', custom: 'contest' },
        { id: 'content', label: 'Contenus', icon: 'ri-file-edit-line', table: 'content_blocks' },
        { id: 'pages', label: 'Pages dynamiques', icon: 'ri-pages-line', table: 'dynamic_pages' },
        { id: 'announcements', label: 'Annonces', icon: 'ri-broadcast-line', table: 'announcements' },
        { id: 'lore', label: 'Lore', icon: 'ri-book-open-line', table: 'lore_chapters' },
        { id: 'mobs', label: 'Mobs', icon: 'ri-ghost-line', table: 'mobs' },
        { id: 'bosses', label: 'Boss', icon: 'ri-skull-line', table: 'bosses' },
        { id: 'creatures', label: 'Creatures dyn.', icon: 'ri-skull-2-line', table: 'creatures' },
        { id: 'shop', label: 'Boutique', icon: 'ri-store-3-line', table: 'shop_items' },
        { id: 'sports', label: 'Sports', icon: 'ri-football-line', table: 'sports' },
        { id: 'messages', label: 'Messages', icon: 'ri-mail-line', table: 'contact_messages' },
        { id: 'bugs', label: 'Bugs', icon: 'ri-bug-line', table: 'bug_reports' },
        { id: 'reports', label: 'Signalements', icon: 'ri-alarm-warning-line', table: 'reports' },
        { id: 'analytics', label: 'Analytics', icon: 'ri-line-chart-line', table: 'analytics_events' },
        { id: 'marketing', label: 'Marketing', icon: 'ri-megaphone-line', table: 'influencers' },
        { id: 'settings', label: 'Parametres', icon: 'ri-settings-3-line', table: 'site_settings' },
        { id: 'logs', label: 'Logs', icon: 'ri-file-list-3-line', table: 'admin_logs' },
        { id: 'system', label: 'Systeme', icon: 'ri-heart-pulse-line', custom: 'system' }
    ];

    const TABLES = {
        training_logs: {
            title: 'Activites',
            subtitle: 'Historique sportif, statuts, notes et suspicion.',
            table: 'training_logs',
            pk: 'id',
            order: 'date',
            descending: true,
            create: false,
            archive: { field: 'status', value: 'deleted', action: 'delete_activity' },
            filters: [
                { key: 'status', label: 'Statut', options: ['', 'valid', 'suspicious', 'rejected', 'deleted'] },
                { key: 'is_suspicious', label: 'Suspect', options: YES_NO }
            ],
            columns: [
                { key: 'date', label: 'Date', type: 'date' },
                { key: 'user_id', label: 'Utilisateur', type: 'short' },
                { key: 'sport', label: 'Sport' },
                { key: 'val', label: 'Valeur', type: 'number' },
                { key: 'unit', label: 'Unite' },
                { key: 'xp', label: 'XP', type: 'number' },
                { key: 'status', label: 'Statut', type: 'status' },
                { key: 'is_suspicious', label: 'Suspect', type: 'boolean' }
            ],
            fields: [
                { key: 'status', label: 'Statut', type: 'select', options: ['valid', 'suspicious', 'rejected', 'deleted'] },
                { key: 'is_suspicious', label: 'Activite suspecte', type: 'boolean' },
                { key: 'admin_note', label: 'Note admin', type: 'textarea', full: true }
            ],
            updatedAt: 'reviewed_at',
            updatedBy: 'reviewed_by'
        },
        content_blocks: {
            title: 'Contenus dynamiques',
            subtitle: 'Blocs publics modifies depuis Supabase avec fallback HTML cote site.',
            table: 'content_blocks',
            pk: 'id',
            order: 'sort_order',
            activeField: 'is_active',
            archive: { field: 'is_active', value: false, action: 'disable_content_block' },
            filters: [
                { key: 'page', label: 'Page', options: ['', 'homepage', 'premium', 'contest', 'shop', 'dashboard', 'login', 'faq'] },
                { key: 'is_active', label: 'Actif', options: YES_NO }
            ],
            columns: [
                { key: 'key', label: 'Key', type: 'main', sub: 'page' },
                { key: 'section', label: 'Section' },
                { key: 'title', label: 'Titre' },
                { key: 'is_active', label: 'Actif', type: 'boolean' },
                { key: 'sort_order', label: 'Ordre', type: 'number' },
                { key: 'updated_at', label: 'MAJ', type: 'date' }
            ],
            fields: [
                { key: 'key', label: 'Key', required: true },
                { key: 'page', label: 'Page' },
                { key: 'section', label: 'Section' },
                { key: 'sort_order', label: 'Ordre', type: 'number' },
                { key: 'title', label: 'Titre', full: true },
                { key: 'subtitle', label: 'Sous-titre', full: true },
                { key: 'body', label: 'Corps', type: 'textarea', full: true },
                { key: 'cta_label', label: 'CTA label' },
                { key: 'cta_url', label: 'CTA URL' },
                { key: 'image_url', label: 'Image URL', full: true },
                { key: 'metadata', label: 'Metadata JSON', type: 'json', full: true },
                { key: 'is_active', label: 'Actif', type: 'boolean' }
            ],
            updatedAt: 'updated_at',
            updatedBy: 'updated_by'
        },
        dynamic_pages: {
            title: 'Pages dynamiques',
            subtitle: 'Pages publiques publiees sans redeploiement.',
            table: 'dynamic_pages',
            pk: 'id',
            order: 'updated_at',
            descending: true,
            archive: { field: 'status', value: 'archived', action: 'archive_dynamic_page' },
            filters: [{ key: 'status', label: 'Statut', options: ['', 'draft', 'published', 'archived'] }],
            columns: [
                { key: 'slug', label: 'Slug', type: 'main', sub: 'status' },
                { key: 'title', label: 'Titre' },
                { key: 'is_indexable', label: 'Indexable', type: 'boolean' },
                { key: 'updated_at', label: 'MAJ', type: 'date' },
                { key: 'published_at', label: 'Publie', type: 'date' }
            ],
            fields: [
                { key: 'slug', label: 'Slug', required: true },
                { key: 'status', label: 'Statut', type: 'select', options: ['draft', 'published', 'archived'] },
                { key: 'title', label: 'Titre', required: true, full: true },
                { key: 'meta_title', label: 'Meta title', full: true },
                { key: 'meta_description', label: 'Meta description', type: 'textarea', full: true },
                { key: 'cover_image_url', label: 'Image couverture', full: true },
                { key: 'content', label: 'Contenu HTML', type: 'textarea', full: true },
                { key: 'template', label: 'Template' },
                { key: 'is_indexable', label: 'Indexable', type: 'boolean' }
            ],
            updatedAt: 'updated_at',
            updatedBy: 'updated_by',
            createdBy: 'created_by'
        },
        announcements: {
            title: 'Annonces',
            subtitle: 'Bannieres par emplacement, type, priorite et periode.',
            table: 'announcements',
            pk: 'id',
            order: 'priority',
            descending: true,
            activeField: 'is_active',
            archive: { field: 'is_active', value: false, action: 'disable_announcement' },
            filters: [
                { key: 'placement', label: 'Placement', options: ['', 'all', 'homepage', 'dashboard', 'premium', 'shop', 'login'] },
                { key: 'type', label: 'Type', options: ['', 'info', 'warning', 'success', 'event', 'maintenance', 'premium'] },
                { key: 'is_active', label: 'Actif', options: YES_NO }
            ],
            columns: [
                { key: 'title', label: 'Titre', type: 'main', sub: 'placement' },
                { key: 'type', label: 'Type', type: 'status' },
                { key: 'priority', label: 'Priorite', type: 'number' },
                { key: 'is_active', label: 'Actif', type: 'boolean' },
                { key: 'starts_at', label: 'Debut', type: 'date' },
                { key: 'ends_at', label: 'Fin', type: 'date' }
            ],
            fields: [
                { key: 'title', label: 'Titre', required: true, full: true },
                { key: 'message', label: 'Message', type: 'textarea', required: true, full: true },
                { key: 'type', label: 'Type', type: 'select', options: ['info', 'warning', 'success', 'event', 'maintenance', 'premium'] },
                { key: 'placement', label: 'Placement', type: 'select', options: ['all', 'homepage', 'dashboard', 'premium', 'shop', 'login'] },
                { key: 'priority', label: 'Priorite', type: 'number' },
                { key: 'cta_label', label: 'CTA label' },
                { key: 'cta_url', label: 'CTA URL' },
                { key: 'starts_at', label: 'Debut', type: 'datetime' },
                { key: 'ends_at', label: 'Fin', type: 'datetime' },
                { key: 'is_active', label: 'Actif', type: 'boolean' }
            ],
            updatedAt: 'updated_at',
            createdBy: 'created_by'
        },
        lore_chapters: {
            title: 'Lore',
            subtitle: 'Chapitres Titan, conditions de lecture et publication.',
            table: 'lore_chapters',
            pk: 'id',
            order: 'sort_order',
            archive: { field: 'status', value: 'archived', action: 'archive_lore_chapter' },
            filters: [{ key: 'status', label: 'Statut', options: ['', 'draft', 'published', 'archived'] }],
            columns: [
                { key: 'title', label: 'Titre', type: 'main', sub: 'slug' },
                { key: 'required_level', label: 'Niveau', type: 'number' },
                { key: 'required_premium', label: 'Premium', type: 'boolean' },
                { key: 'status', label: 'Statut', type: 'status' },
                { key: 'sort_order', label: 'Ordre', type: 'number' }
            ],
            fields: [
                { key: 'title', label: 'Titre', required: true, full: true },
                { key: 'slug', label: 'Slug', required: true },
                { key: 'status', label: 'Statut', type: 'select', options: ['draft', 'published', 'archived'] },
                { key: 'excerpt', label: 'Extrait', type: 'textarea', full: true },
                { key: 'content', label: 'Contenu', type: 'textarea', full: true },
                { key: 'image_url', label: 'Image URL', full: true },
                { key: 'required_level', label: 'Niveau requis', type: 'number' },
                { key: 'required_grade', label: 'Grade requis' },
                { key: 'sort_order', label: 'Ordre', type: 'number' },
                { key: 'required_premium', label: 'Premium requis', type: 'boolean' }
            ],
            updatedAt: 'updated_at',
            updatedBy: 'updated_by',
            createdBy: 'created_by'
        },
        mobs: {
            title: 'Mobs',
            subtitle: 'Creatures jouees par la page Aventure et visibles dans les archives mobs.',
            table: 'mobs',
            pk: 'id',
            order: 'id',
            columns: [
                { key: 'id', label: 'ID', type: 'number' },
                { key: 'name', label: 'Nom', type: 'main', sub: 'zone_id' },
                { key: 'rarity', label: 'Rarete', type: 'status' },
                { key: 'weakness', label: 'Faiblesse' },
                { key: 'hp_mult', label: 'HP mult.', type: 'number' },
                { key: 'reward_mult', label: 'Reward mult.', type: 'number' },
                { key: 'created_at', label: 'Creation', type: 'date' }
            ],
            fields: [
                { key: 'id', label: 'ID optionnel', type: 'number' },
                { key: 'name', label: 'Nom', required: true },
                { key: 'rarity', label: 'Rarete', type: 'select', options: ['common', 'rare', 'epic', 'legendary', 'mythic'] },
                { key: 'weakness', label: 'Faiblesse' },
                { key: 'zone_id', label: 'Zone' },
                { key: 'hp_mult', label: 'Multiplicateur HP', type: 'number' },
                { key: 'reward_mult', label: 'Multiplicateur recompense', type: 'number' },
                { key: 'image_url', label: 'Image URL', full: true },
                { key: 'description', label: 'Description', type: 'textarea', full: true },
                { key: 'is_boss', label: 'Mob boss-like', type: 'boolean' }
            ]
        },
        bosses: {
            title: 'Boss',
            subtitle: 'Cibles prioritaires jouees par la page Aventure et visibles dans les archives boss.',
            table: 'bosses',
            pk: 'id',
            order: 'level',
            columns: [
                { key: 'id', label: 'ID', type: 'number' },
                { key: 'name', label: 'Nom', type: 'main', sub: 'zone_id' },
                { key: 'level', label: 'Niveau', type: 'number' },
                { key: 'hp_max', label: 'HP', type: 'number' },
                { key: 'weakness', label: 'Faiblesse' },
                { key: 'reward_credits', label: 'Credits', type: 'number' },
                { key: 'reward_mult', label: 'Reward mult.', type: 'number' }
            ],
            fields: [
                { key: 'id', label: 'ID optionnel', type: 'number' },
                { key: 'name', label: 'Nom', required: true },
                { key: 'level', label: 'Niveau', type: 'number' },
                { key: 'hp_max', label: 'HP max', type: 'number' },
                { key: 'weakness', label: 'Faiblesse' },
                { key: 'zone_id', label: 'Zone' },
                { key: 'reward_credits', label: 'Credits recompense', type: 'number' },
                { key: 'reward_mult', label: 'Multiplicateur recompense', type: 'number' },
                { key: 'image_url', label: 'Image URL', full: true },
                { key: 'description', label: 'Description', type: 'textarea', full: true }
            ]
        },
        creatures: {
            title: 'Creatures dynamiques',
            subtitle: 'Catalogue moderne optionnel. Les mobs/boss du jeu se gerent surtout dans Mobs et Boss.',
            table: 'creatures',
            pk: 'id',
            order: 'sort_order',
            activeField: 'is_active',
            archive: { field: 'is_active', value: false, action: 'disable_creature' },
            filters: [
                { key: 'type', label: 'Type', options: ['', 'mob', 'boss', 'elite', 'event', 'legendary'] },
                { key: 'rarity', label: 'Rarete', options: ['', 'common', 'rare', 'epic', 'legendary', 'mythic'] },
                { key: 'is_active', label: 'Actif', options: YES_NO }
            ],
            columns: [
                { key: 'name', label: 'Nom', type: 'main', sub: 'slug' },
                { key: 'type', label: 'Type', type: 'status' },
                { key: 'rarity', label: 'Rarete', type: 'status' },
                { key: 'required_level', label: 'Niveau', type: 'number' },
                { key: 'required_premium', label: 'Premium', type: 'boolean' },
                { key: 'is_active', label: 'Actif', type: 'boolean' }
            ],
            fields: [
                { key: 'name', label: 'Nom', required: true },
                { key: 'slug', label: 'Slug', required: true },
                { key: 'type', label: 'Type', type: 'select', options: ['mob', 'boss', 'elite', 'event', 'legendary'] },
                { key: 'rarity', label: 'Rarete', type: 'select', options: ['common', 'rare', 'epic', 'legendary', 'mythic'] },
                { key: 'description', label: 'Description', type: 'textarea', full: true },
                { key: 'image_url', label: 'Image URL', full: true },
                { key: 'required_level', label: 'Niveau requis', type: 'number' },
                { key: 'required_grade', label: 'Grade requis' },
                { key: 'event_key', label: 'Event key' },
                { key: 'sort_order', label: 'Ordre', type: 'number' },
                { key: 'required_premium', label: 'Premium requis', type: 'boolean' },
                { key: 'is_active', label: 'Actif', type: 'boolean' }
            ],
            updatedAt: 'updated_at',
            updatedBy: 'updated_by',
            createdBy: 'created_by'
        },
        shop_items: {
            title: 'Boutique',
            subtitle: 'Catalogue, prix, rarete, disponibilite et premium only.',
            table: 'shop_items',
            pk: 'id',
            order: 'name',
            activeField: 'is_active',
            archive: { field: 'is_active', value: false, action: 'disable_shop_item' },
            filters: [
                { key: 'type', label: 'Type', options: ['', 'skin', 'badge', 'boost', 'cosmetic', 'title', 'event_item'] },
                { key: 'is_active', label: 'Actif', options: YES_NO }
            ],
            columns: [
                { key: 'name', label: 'Nom', type: 'main', sub: 'id' },
                { key: 'type', label: 'Type', type: 'status' },
                { key: 'price', label: 'Prix', type: 'number' },
                { key: 'price_credits', label: 'Credits', type: 'number' },
                { key: 'requires_elite', label: 'Elite', type: 'boolean' },
                { key: 'is_active', label: 'Actif', type: 'boolean' }
            ],
            fields: [
                { key: 'id', label: 'ID', required: true },
                { key: 'name', label: 'Nom', required: true },
                { key: 'slug', label: 'Slug' },
                { key: 'type', label: 'Type' },
                { key: 'item_type', label: 'Item type' },
                { key: 'rarity', label: 'Rarete' },
                { key: 'description', label: 'Description', type: 'textarea', full: true },
                { key: 'icon', label: 'Icone' },
                { key: 'image_url', label: 'Image URL' },
                { key: 'price', label: 'Prix app', type: 'number' },
                { key: 'price_credits', label: 'Prix credits', type: 'number' },
                { key: 'required_level', label: 'Niveau requis', type: 'number' },
                { key: 'cooldown_type', label: 'Cooldown type' },
                { key: 'cooldown_max', label: 'Cooldown max', type: 'number' },
                { key: 'starts_at', label: 'Debut', type: 'datetime' },
                { key: 'ends_at', label: 'Fin', type: 'datetime' },
                { key: 'metadata', label: 'Metadata JSON', type: 'json', full: true },
                { key: 'requires_elite', label: 'Elite requis', type: 'boolean' },
                { key: 'required_premium', label: 'Premium requis', type: 'boolean' },
                { key: 'is_active', label: 'Actif', type: 'boolean' }
            ],
            updatedAt: 'updated_at'
        },
        sports: {
            title: 'Sports',
            subtitle: 'Disciplines actives, champs, formules et anti-abus.',
            table: 'sports',
            pk: 'id',
            order: 'sort_order',
            activeField: 'is_active',
            archive: { field: 'is_active', value: false, action: 'disable_sport' },
            filters: [
                { key: 'category', label: 'Categorie', options: ['', 'training', 'endurance', 'strength', 'team', 'combat', 'mobility'] },
                { key: 'is_active', label: 'Actif', options: YES_NO }
            ],
            columns: [
                { key: 'label', label: 'Sport', type: 'main', sub: 'id' },
                { key: 'category', label: 'Categorie', type: 'status' },
                { key: 'unit', label: 'Unite' },
                { key: 'xp_multiplier', label: 'XP mult.', type: 'number' },
                { key: 'is_active', label: 'Actif', type: 'boolean' },
                { key: 'updated_at', label: 'MAJ', type: 'date' }
            ],
            fields: [
                { key: 'id', label: 'ID', required: true },
                { key: 'label', label: 'Label', required: true },
                { key: 'name', label: 'Nom public' },
                { key: 'slug', label: 'Slug' },
                { key: 'category', label: 'Categorie', type: 'select', required: true, options: ['training', 'endurance', 'strength', 'team', 'combat', 'mobility'] },
                { key: 'icon', label: 'Icone' },
                { key: 'unit', label: 'Unite' },
                { key: 'form_type', label: 'Type formulaire', type: 'select', options: ['standard', 'duration', 'distance', 'reps', 'weight', 'score'] },
                { key: 'xp_multiplier', label: 'Multiplicateur XP', type: 'number' },
                { key: 'max_daily_reward', label: 'Max journalier', type: 'number' },
                { key: 'sort_order', label: 'Ordre', type: 'number' },
                { key: 'description', label: 'Description', type: 'textarea', full: true },
                { key: 'extra_fields', label: 'Champs existants JSON', type: 'json', full: true, defaultJson: [] },
                { key: 'required_fields', label: 'Champs requis JSON', type: 'json', full: true },
                { key: 'xp_rules', label: 'Regles XP existantes JSON', type: 'json', full: true },
                { key: 'xp_formula', label: 'Formule XP JSON', type: 'json', full: true },
                { key: 'credits_formula', label: 'Formule credits JSON', type: 'json', full: true },
                { key: 'validation_rules', label: 'Validation existante JSON', type: 'json', full: true },
                { key: 'suspicious_rules', label: 'Anti-abus JSON', type: 'json', full: true },
                { key: 'is_active', label: 'Actif', type: 'boolean' }
            ],
            updatedAt: 'updated_at'
        },
        contact_messages: {
            title: 'Messages',
            subtitle: 'Demandes de contact, priorites, notes et archivage.',
            table: 'contact_messages',
            pk: 'id',
            order: 'created_at',
            descending: true,
            create: false,
            archive: { field: 'status', value: 'archived', action: 'archive_contact_message' },
            filters: [
                { key: 'status', label: 'Statut', options: ['', 'new', 'read', 'in_progress', 'resolved', 'archived'] },
                { key: 'category', label: 'Categorie', options: ['', 'bug', 'partnership', 'question', 'premium', 'other'] }
            ],
            columns: [
                { key: 'subject', label: 'Sujet', type: 'main', sub: 'email' },
                { key: 'category', label: 'Categorie', type: 'status' },
                { key: 'priority', label: 'Priorite', type: 'status' },
                { key: 'status', label: 'Statut', type: 'status' },
                { key: 'created_at', label: 'Date', type: 'date' }
            ],
            fields: [
                { key: 'status', label: 'Statut', type: 'select', options: ['new', 'read', 'in_progress', 'resolved', 'archived'] },
                { key: 'priority', label: 'Priorite', type: 'select', options: ['low', 'normal', 'high', 'urgent'] },
                { key: 'admin_note', label: 'Note interne', type: 'textarea', full: true }
            ],
            updatedAt: 'updated_at'
        },
        bug_reports: {
            title: 'Bugs',
            subtitle: 'Rapports techniques et suivi de correction.',
            table: 'bug_reports',
            pk: 'id',
            order: 'created_at',
            descending: true,
            create: false,
            archive: { field: 'status', value: 'rejected', action: 'reject_bug_report' },
            filters: [
                { key: 'severity', label: 'Gravite', options: ['', 'low', 'medium', 'high', 'critical'] },
                { key: 'status', label: 'Statut', options: ['', 'new', 'confirmed', 'in_progress', 'fixed', 'rejected', 'cannot_reproduce'] }
            ],
            columns: [
                { key: 'title', label: 'Bug', type: 'main', sub: 'page_url' },
                { key: 'severity', label: 'Gravite', type: 'status' },
                { key: 'status', label: 'Statut', type: 'status' },
                { key: 'user_id', label: 'User', type: 'short' },
                { key: 'created_at', label: 'Date', type: 'date' }
            ],
            fields: [
                { key: 'severity', label: 'Gravite', type: 'select', options: ['low', 'medium', 'high', 'critical'] },
                { key: 'status', label: 'Statut', type: 'select', options: ['new', 'confirmed', 'in_progress', 'fixed', 'rejected', 'cannot_reproduce'] },
                { key: 'admin_note', label: 'Note admin', type: 'textarea', full: true }
            ],
            updatedAt: 'updated_at'
        },
        reports: {
            title: 'Signalements',
            subtitle: 'Signalements utilisateurs et notes de moderation.',
            table: 'reports',
            pk: 'id',
            order: 'created_at',
            descending: true,
            create: false,
            archive: { field: 'status', value: 'resolved', action: 'resolve_report' },
            filters: [{ key: 'status', label: 'Statut', options: ['', 'new', 'pending', 'open', 'reviewing', 'resolved', 'dismissed'] }],
            columns: [
                { key: 'reason', label: 'Raison', type: 'main', sub: 'target_type' },
                { key: 'reporter_id', label: 'Reporter', type: 'short' },
                { key: 'reported_user_id', label: 'Signale', type: 'short' },
                { key: 'status', label: 'Statut', type: 'status' },
                { key: 'created_at', label: 'Date', type: 'date' }
            ],
            fields: [
                { key: 'status', label: 'Statut' },
                { key: 'admin_note', label: 'Note admin', type: 'textarea', full: true },
                { key: 'description', label: 'Description', type: 'textarea', full: true }
            ],
            updatedAt: 'updated_at'
        },
        analytics_events: {
            title: 'Analytics',
            subtitle: 'Evenements produit, funnel et sources de trafic.',
            table: 'analytics_events',
            pk: 'id',
            order: 'created_at',
            descending: true,
            create: false,
            edit: false,
            archive: false,
            filters: [{ key: 'event_name', label: 'Evenement', options: ['', 'page_view', 'signup_started', 'signup_completed', 'first_activity_created', 'premium_click', 'shop_opened', 'lore_opened'] }],
            columns: [
                { key: 'event_name', label: 'Evenement', type: 'main', sub: 'page' },
                { key: 'user_id', label: 'User', type: 'short' },
                { key: 'source', label: 'Source' },
                { key: 'referrer', label: 'Referrer', type: 'short' },
                { key: 'created_at', label: 'Date', type: 'date' }
            ],
            fields: []
        },
        influencers: {
            title: 'Marketing / Influenceurs',
            subtitle: 'Prospection, statut, codes et notes partenariat.',
            table: 'influencers',
            pk: 'id',
            order: 'updated_at',
            descending: true,
            archive: { field: 'status', value: 'ended', action: 'archive_influencer' },
            filters: [{ key: 'status', label: 'Statut', options: ['', 'to_contact', 'contacted', 'follow_up', 'interested', 'refused', 'active', 'ended'] }],
            columns: [
                { key: 'name', label: 'Nom', type: 'main', sub: 'platform' },
                { key: 'status', label: 'Statut', type: 'status' },
                { key: 'followers_count', label: 'Abonnes', type: 'number' },
                { key: 'rating', label: 'Note', type: 'number' },
                { key: 'referral_code', label: 'Code' },
                { key: 'premium_granted', label: 'Premium', type: 'boolean' }
            ],
            fields: [
                { key: 'name', label: 'Nom', required: true },
                { key: 'platform', label: 'Plateforme' },
                { key: 'profile_url', label: 'Profil URL', full: true },
                { key: 'contact_email', label: 'Email' },
                { key: 'niche', label: 'Niche' },
                { key: 'followers_count', label: 'Abonnes', type: 'number' },
                { key: 'status', label: 'Statut', type: 'select', options: ['to_contact', 'contacted', 'follow_up', 'interested', 'refused', 'active', 'ended'] },
                { key: 'rating', label: 'Note', type: 'number' },
                { key: 'referral_code', label: 'Code parrainage' },
                { key: 'premium_granted', label: 'Premium offert', type: 'boolean' },
                { key: 'engagement_note', label: 'Engagement', type: 'textarea', full: true },
                { key: 'notes', label: 'Notes', type: 'textarea', full: true }
            ],
            updatedAt: 'updated_at'
        },
        site_settings: {
            title: 'Parametres',
            subtitle: 'Flags publics/prives, economie et modules actifs.',
            table: 'site_settings',
            pk: 'id',
            order: 'category',
            filters: [
                { key: 'category', label: 'Categorie', options: ['', 'system', 'auth', 'premium', 'shop', 'social', 'contest', 'economy'] },
                { key: 'is_public', label: 'Public', options: YES_NO }
            ],
            columns: [
                { key: 'key', label: 'Key', type: 'main', sub: 'category' },
                { key: 'label', label: 'Label' },
                { key: 'value', label: 'Valeur', type: 'json' },
                { key: 'is_public', label: 'Public', type: 'boolean' },
                { key: 'updated_at', label: 'MAJ', type: 'date' }
            ],
            fields: [
                { key: 'key', label: 'Key', required: true },
                { key: 'label', label: 'Label' },
                { key: 'category', label: 'Categorie' },
                { key: 'description', label: 'Description', type: 'textarea', full: true },
                { key: 'value', label: 'Valeur JSON', type: 'json', full: true },
                { key: 'is_public', label: 'Lisible public', type: 'boolean' }
            ],
            updatedAt: 'updated_at',
            updatedBy: 'updated_by'
        },
        admin_logs: {
            title: 'Logs admin',
            subtitle: 'Actions sensibles et historique de moderation.',
            table: 'admin_logs',
            pk: 'id',
            order: 'created_at',
            descending: true,
            create: false,
            edit: false,
            archive: false,
            filters: [{ key: 'target_table', label: 'Table', options: ['', 'profiles', 'content_blocks', 'announcements', 'site_settings', 'contest_draws'] }],
            columns: [
                { key: 'action', label: 'Action', type: 'main', fallback: 'action_type' },
                { key: 'target_table', label: 'Table' },
                { key: 'target_id', label: 'Cible', type: 'short' },
                { key: 'admin_id', label: 'Admin', type: 'short' },
                { key: 'reason', label: 'Raison', type: 'short' },
                { key: 'created_at', label: 'Date', type: 'date' }
            ],
            fields: []
        }
    };

    const state = {
        client: null,
        user: null,
        context: null,
        currentView: 'dashboard',
        filters: {},
        rows: {},
        loading: false,
        lastStats: null
    };

    const $ = (selector, root = document) => root.querySelector(selector);
    const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));

    function escapeHtml(value) {
        return String(value ?? '').replace(/[&<>"']/g, (char) => ({
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            "'": '&#39;'
        }[char]));
    }

    function shortId(value) {
        const text = String(value || '');
        if (!text) return '-';
        if (text.length <= 14) return text;
        return `${text.slice(0, 6)}...${text.slice(-4)}`;
    }

    function formatDate(value) {
        if (!value) return '-';
        const date = new Date(value);
        if (Number.isNaN(date.getTime())) return String(value);
        return date.toLocaleString('fr-FR', {
            day: '2-digit',
            month: '2-digit',
            year: '2-digit',
            hour: '2-digit',
            minute: '2-digit'
        });
    }

    function toDateInput(value) {
        if (!value) return '';
        const date = new Date(value);
        if (Number.isNaN(date.getTime())) return '';
        const offset = date.getTimezoneOffset() * 60000;
        return new Date(date.getTime() - offset).toISOString().slice(0, 16);
    }

    function badge(value, type = 'neutral') {
        const text = value === true ? 'oui' : value === false ? 'non' : (value || '-');
        let cls = 'status-badge';
        const normalized = String(text).toLowerCase();
        if (type === 'boolean') cls += value ? ' badge-success' : ' badge-warning';
        else if (['active', 'published', 'resolved', 'fixed', 'valid', 'success', 'oui'].includes(normalized)) cls += ' badge-success';
        else if (['banned', 'deleted', 'rejected', 'critical', 'danger', 'non'].includes(normalized)) cls += ' badge-danger';
        else if (['suspended', 'suspicious', 'warning', 'draft', 'new', 'pending', 'open', 'in_progress'].includes(normalized)) cls += ' badge-warning';
        else if (['premium', 'admin', 'super_admin', 'elite', 'legendary', 'mythic'].includes(normalized)) cls += ' badge-premium';
        return `<span class="${cls}">${escapeHtml(text)}</span>`;
    }

    function notify(title, message, type = 'info') {
        const stack = $('#admin-toast-stack');
        if (!stack) return;
        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        toast.innerHTML = `<strong>${escapeHtml(title)}</strong><span>${escapeHtml(message || '')}</span>`;
        stack.appendChild(toast);
        setTimeout(() => toast.remove(), 5200);
    }

    function setSyncState(text, type = 'info') {
        const el = $('#admin-sync-state');
        if (!el) return;
        el.textContent = text;
        el.className = `sync-pill ${type === 'error' ? 'badge-danger' : type === 'ok' ? 'badge-success' : ''}`;
    }

    function setGate(message, danger = false) {
        const el = $('#gate-message');
        if (el) {
            el.textContent = message;
            el.style.color = danger ? 'var(--admin-red)' : '';
        }
    }

    function showAlert(message, type = 'info') {
        const alerts = $('#admin-alerts');
        if (!alerts) return;
        alerts.innerHTML = `<div class="alert ${type}">${escapeHtml(message)}</div>`;
    }

    function clearAlerts() {
        const alerts = $('#admin-alerts');
        if (alerts) alerts.innerHTML = '';
    }

    function getNavItem(id = state.currentView) {
        return NAV.find((item) => item.id === id) || NAV[0];
    }

    function setTitle(id) {
        const item = getNavItem(id);
        $('#admin-page-title').textContent = item.label;
        $('#admin-current-path').textContent = `/admin/${item.id}`;
        document.title = `TITAN OS - ${item.label}`;
    }

    function renderNav() {
        const nav = $('#admin-nav');
        nav.innerHTML = NAV.map((item) => `
            <button type="button" data-view="${escapeHtml(item.id)}" class="${item.id === state.currentView ? 'is-active' : ''}">
                <i class="${escapeHtml(item.icon)}" aria-hidden="true"></i>
                <span>${escapeHtml(item.label)}</span>
                <small>${item.table ? 'DB' : 'SYS'}</small>
            </button>
        `).join('');
    }

    async function init() {
        try {
            state.client = typeof window.waitForTitanSupabase === 'function'
                ? await window.waitForTitanSupabase(3000)
                : (typeof window.initTitanSupabaseClient === 'function' ? window.initTitanSupabaseClient() : null);

            if (!state.client || !state.client.auth) {
                setGate('Client Supabase indisponible.', true);
                return;
            }

            // The administration gate validates the user with Supabase Auth
            // instead of trusting only the locally cached session payload.
            const { data: userData, error: userError } = await state.client.auth.getUser();
            if (userError && userError.name !== 'AuthSessionMissingError') throw userError;
            const verifiedUser = userData && userData.user;
            if (!verifiedUser) {
                setGate('Connexion requise. Redirection vers login...');
                setTimeout(() => { window.location.href = 'login.html?next=admin.html'; }, 900);
                return;
            }

            state.user = verifiedUser;
            await checkAdminAccess();
            if (!state.context || !state.context.isAdmin) {
                setGate('Acces refuse. Role admin ou super_admin requis.', true);
                return;
            }

            $('#admin-gate').hidden = true;
            $('#admin-app').hidden = false;
            $('#admin-role-badge').textContent = state.context.role || 'admin';
            state.currentView = getInitialView();
            renderNav();
            bindEvents();
            await renderCurrentView();
            setSyncState('connecte', 'ok');
        } catch (error) {
            console.error('[TITAN ADMIN]', error);
            setGate(error.message || 'Erreur de verification admin.', true);
        }
    }

    async function checkAdminAccess() {
        const rpc = await state.client.rpc('titan_admin_get_context_v1');
        if (!rpc.error && rpc.data) {
            state.context = Object.assign({}, rpc.data, {
                isAdmin: rpc.data.isAdmin === true || rpc.data.is_admin === true
            });
            return rpc.data;
        }

        const profileResult = await state.client
            .from('profiles')
            .select('id,email,username,role,is_admin,is_premium,is_elite,status')
            .eq('id', state.user.id)
            .maybeSingle();

        const adminResult = await state.client
            .from('titan_admins')
            .select('role,active,revoked_at')
            .eq('user_id', state.user.id)
            .maybeSingle();

        const profile = profileResult.data || {};
        const oldAdmin = adminResult.data || {};
        const role = profile.role
            || (oldAdmin.role === 'owner' ? 'super_admin' : oldAdmin.role)
            || (profile.is_admin ? 'admin' : 'user');
        const isAdmin = ['admin', 'super_admin'].includes(role)
            || (oldAdmin.role && oldAdmin.revoked_at === null && oldAdmin.active !== false && ['owner', 'admin'].includes(oldAdmin.role));

        state.context = { isAdmin, role: role === 'owner' ? 'super_admin' : role, profile };
        if (rpc.error) {
            showAlert('RPC admin non disponible. Applique le SQL titan_admin_control_center_v1.sql pour activer toutes les actions.', 'danger');
        }
        return state.context;
    }

    function bindEvents() {
        if (bindEvents.ready) return;
        bindEvents.ready = true;

        $('#admin-refresh').addEventListener('click', () => renderCurrentView(true));
        $('#admin-signout').addEventListener('click', async () => {
            await state.client.auth.signOut();
            window.location.href = 'login.html';
        });
        $('#admin-menu-toggle').addEventListener('click', () => document.body.classList.toggle('admin-menu-open'));
        $('#modal-close').addEventListener('click', closeModal);
        $('#admin-modal').addEventListener('click', (event) => {
            if (event.target.id === 'admin-modal') closeModal();
        });

        document.addEventListener('click', handleDocumentClick);
        document.addEventListener('input', handleFilterInput);
        document.addEventListener('change', handleFilterInput);
        window.addEventListener('hashchange', () => {
            const next = getInitialView();
            if (next !== state.currentView) switchView(next);
        });
    }

    function getInitialView() {
        const raw = (window.location.hash || '').replace(/^#\/?/, '');
        return NAV.some((item) => item.id === raw) ? raw : 'dashboard';
    }

    function switchView(id) {
        if (!NAV.some((item) => item.id === id)) id = 'dashboard';
        state.currentView = id;
        window.location.hash = id;
        document.body.classList.remove('admin-menu-open');
        renderNav();
        renderCurrentView();
    }

    async function renderCurrentView(force = false) {
        clearAlerts();
        setTitle(state.currentView);
        renderNav();
        const item = getNavItem();
        const view = $('#admin-view');
        view.innerHTML = loadingMarkup('Chargement du module...');
        setSyncState('sync');

        try {
            if (item.custom === 'dashboard') await renderDashboard(force);
            else if (item.custom === 'users') await renderUsers(force);
            else if (item.custom === 'premium') await renderPremium(force);
            else if (item.custom === 'contest') await renderContest(force);
            else if (item.custom === 'system') await renderSystem(force);
            else await renderTableSection(item.table, force);
            setSyncState('connecte', 'ok');
        } catch (error) {
            console.error('[TITAN ADMIN VIEW]', error);
            view.innerHTML = errorMarkup(error);
            setSyncState('erreur', 'error');
        }
    }

    function loadingMarkup(text) {
        return `<div class="panel empty-state"><i class="ri-loader-4-line ri-spin"></i><br>${escapeHtml(text)}</div>`;
    }

    function errorMarkup(error) {
        return `
            <div class="panel empty-state">
                <strong>Module indisponible</strong>
                <p>${escapeHtml(error.message || String(error))}</p>
                <button class="admin-btn secondary" type="button" data-refresh-current>
                    <i class="ri-refresh-line"></i><span>Reessayer</span>
                </button>
            </div>
        `;
    }

    async function renderDashboard() {
        const stats = await fetchDashboardStats();
        const [userTrend, activityTrend] = await Promise.all([
            fetchTrend('profiles', 'created_at'),
            fetchTrend('training_logs', 'date')
        ]);

        $('#admin-view').innerHTML = `
            ${sectionHead('Dashboard', 'Vue globale du site, du contenu et des operations sensibles.', [
                buttonMarkup('Exporter utilisateurs', 'ri-download-2-line', 'secondary', 'data-export-table="profiles"'),
                buttonMarkup('Exporter activites', 'ri-download-2-line', 'secondary', 'data-export-table="training_logs"')
            ])}
            <div class="stats-grid">
                ${statCard('Utilisateurs total', stats.users_total, 'Nouveaux aujourd hui: ' + safeNumber(stats.users_today))}
                ${statCard('Inscrits semaine', stats.users_week, 'Actifs 7 jours: ' + safeNumber(stats.active_7d))}
                ${statCard('Activites total', stats.activities_total, 'Aujourd hui: ' + safeNumber(stats.activities_today))}
                ${statCard('Premium total', stats.premium_total, 'Acces actifs et Elite')}
                ${statCard('Messages non lus', stats.messages_unread, 'Contact et support')}
                ${statCard('Bugs ouverts', stats.bugs_open, 'Rapports a traiter')}
                ${statCard('Signalements', stats.reports_open, 'Moderation ouverte')}
                ${statCard('Concours', stats.contest_entries, 'Prochain palier: ' + safeNumber(stats.contest_next_step))}
                ${statCard('Annonces actives', stats.announcements_active, 'Bannieres visibles')}
                ${statCard('Blocs actifs', stats.content_active, 'Contenu dynamique')}
                ${statCard('Pages publiees', stats.pages_published, 'Pages Supabase')}
                ${statCard('Activites suspectes', stats.suspicious_activities, 'A verifier')}
            </div>
            <div class="grid-2">
                ${trendPanel('Inscriptions', userTrend)}
                ${trendPanel('Activites', activityTrend)}
            </div>
        `;
    }

    function safeNumber(value) {
        return Number(value || 0).toLocaleString('fr-FR');
    }

    function statCard(label, value, note) {
        return `
            <article class="stat-card">
                <span>${escapeHtml(label)}</span>
                <strong>${safeNumber(value)}</strong>
                <small>${escapeHtml(note || '')}</small>
            </article>
        `;
    }

    function trendPanel(title, trend) {
        const max = Math.max(1, ...trend.map((item) => item.count));
        return `
            <article class="chart-panel panel">
                <h3>${escapeHtml(title)}</h3>
                <div class="mini-bars">
                    ${trend.map((item) => `
                        <div class="mini-bar">
                            <i style="height:${Math.max(4, Math.round((item.count / max) * 150))}px"></i>
                            <span>${escapeHtml(String(item.count))}</span>
                            <small>${escapeHtml(item.label)}</small>
                        </div>
                    `).join('')}
                </div>
            </article>
        `;
    }

    async function fetchDashboardStats() {
        const rpc = await state.client.rpc('titan_admin_dashboard_v1');
        if (!rpc.error && rpc.data) {
            state.lastStats = rpc.data;
            return rpc.data;
        }

        const pairs = [
            ['users_total', 'profiles'],
            ['activities_total', 'training_logs'],
            ['premium_total', 'profiles'],
            ['messages_unread', 'contact_messages'],
            ['bugs_open', 'bug_reports'],
            ['contest_entries', 'contest_entries'],
            ['content_active', 'content_blocks'],
            ['announcements_active', 'announcements']
        ];
        const output = {};
        await Promise.all(pairs.map(async ([key, table]) => {
            output[key] = await countRows(table);
        }));
        output.users_today = 0;
        output.users_week = 0;
        output.active_7d = 0;
        output.activities_today = 0;
        output.reports_open = await countRows('reports');
        output.contest_next_step = (Math.floor((output.contest_entries || 0) / 50) + 1) * 50;
        output.suspicious_activities = 0;
        output.pages_published = await countRows('dynamic_pages');
        state.lastStats = output;
        return output;
    }

    async function countRows(table) {
        const { count, error } = await state.client.from(table).select('*', { count: 'exact', head: true });
        if (error) return 0;
        return count || 0;
    }

    async function fetchTrend(table, column) {
        const days = Array.from({ length: 7 }, (_, index) => {
            const date = new Date();
            date.setDate(date.getDate() - (6 - index));
            return {
                key: date.toISOString().slice(0, 10),
                label: date.toLocaleDateString('fr-FR', { weekday: 'short' }).replace('.', ''),
                count: 0
            };
        });
        const since = `${days[0].key}T00:00:00.000Z`;
        const { data, error } = await state.client.from(table).select(column).gte(column, since).limit(1000);
        if (error || !Array.isArray(data)) return days;
        data.forEach((row) => {
            const key = String(row[column] || '').slice(0, 10);
            const item = days.find((day) => day.key === key);
            if (item) item.count += 1;
        });
        return days;
    }

    async function renderUsers() {
        const filters = state.filters.users || {};
        const rpc = await state.client.rpc('titan_admin_list_profiles_v1', {
            p_search: filters.search || '',
            p_role: filters.role || '',
            p_status: filters.status || '',
            p_premium: filters.premium || '',
            p_limit: 200,
            p_offset: 0
        });

        let rows = [];
        if (!rpc.error && Array.isArray(rpc.data)) {
            rows = rpc.data;
        } else {
            let query = state.client.from('profiles').select('*').order('created_at', { ascending: false }).limit(200);
            const direct = await query;
            if (direct.error) throw direct.error;
            rows = direct.data || [];
            rows = filterRows(rows, filters);
        }

        state.rows.users = new Map(rows.map((row) => [String(row.id), row]));
        $('#admin-view').innerHTML = `
            ${sectionHead('Utilisateurs', 'Roles, premium, credits, statut et moderation.', [
                buttonMarkup('Exporter CSV', 'ri-download-2-line', 'secondary', 'data-export-section="users"')
            ])}
            <div class="toolbar">
                <div class="filter-row">
                    ${filterInput('users', 'search', 'Rechercher email, pseudo, ID', filters.search)}
                    ${filterSelect('users', 'role', 'Role', ['', ...ADMIN_ROLES], filters.role)}
                    ${filterSelect('users', 'status', 'Statut', ['', ...USER_STATUS], filters.status)}
                    ${filterSelect('users', 'premium', 'Premium', ['', 'premium', 'free'], filters.premium)}
                </div>
            </div>
            ${tableShell(renderTable(rows, [
                { key: 'username', label: 'Pseudo', type: 'main', sub: 'email' },
                { key: 'role', label: 'Role', type: 'status' },
                { key: 'is_premium', label: 'Premium', type: 'boolean' },
                { key: 'level', label: 'Niv.', type: 'number' },
                { key: 'xp', label: 'XP', type: 'number' },
                { key: 'credits', label: 'Credits', type: 'number' },
                { key: 'status', label: 'Statut', type: 'status' },
                { key: 'created_at', label: 'Inscription', type: 'date' },
                { key: 'last_seen_at', label: 'Vu', type: 'date' }
            ], userActions))}
        `;
    }

    function userActions(row) {
        const id = escapeHtml(row.id);
        const premiumAction = row.is_premium || row.is_elite
            ? `<button class="icon-button" title="Retirer premium" data-user-action="revoke-premium" data-user-id="${id}"><i class="ri-vip-crown-line"></i></button>`
            : `<button class="icon-button" title="Premium" data-user-action="grant-premium" data-user-id="${id}"><i class="ri-vip-crown-2-line"></i></button>`;
        const statusAction = row.status === 'active'
            ? `<button class="icon-button" title="Suspendre" data-user-action="suspend" data-user-id="${id}"><i class="ri-pause-circle-line"></i></button>
               <button class="icon-button" title="Bannir" data-user-action="ban" data-user-id="${id}"><i class="ri-forbid-2-line"></i></button>`
            : `<button class="icon-button" title="Reactiver" data-user-action="reactivate" data-user-id="${id}"><i class="ri-checkbox-circle-line"></i></button>`;
        return `
            <div class="table-actions">
                <button class="icon-button" title="Modifier" data-user-action="edit" data-user-id="${id}"><i class="ri-edit-line"></i></button>
                ${premiumAction}
                ${statusAction}
                <button class="icon-button" title="Activites" data-user-action="activities" data-user-id="${id}"><i class="ri-run-line"></i></button>
                <button class="icon-button" title="Logs" data-user-action="logs" data-user-id="${id}"><i class="ri-file-list-3-line"></i></button>
            </div>
        `;
    }

    async function renderPremium() {
        const [profilesRpc, accessRows] = await Promise.all([
            state.client.rpc('titan_admin_list_profiles_v1', {
                p_search: '',
                p_role: '',
                p_status: '',
                p_premium: 'premium',
                p_limit: 100,
                p_offset: 0
            }),
            fetchRows(TABLES.premium_access || premiumAccessConfig())
        ]);
        const profiles = profilesRpc.error ? [] : (profilesRpc.data || []);
        const config = premiumAccessConfig();
        state.rows.premium = new Map(accessRows.map((row) => [String(row.id), row]));
        state.rows.premium_access = new Map(accessRows.map((row) => [String(row.id), row]));
        $('#admin-view').innerHTML = `
            ${sectionHead('Premium', 'Acces Elite, sources, dates et attribution manuelle.', [
                buttonMarkup('Accorder premium', 'ri-vip-crown-2-line', 'primary', 'data-premium-grant-global'),
                buttonMarkup('Exporter CSV', 'ri-download-2-line', 'secondary', 'data-export-section="premium"')
            ])}
            <div class="stats-grid">
                ${statCard('Utilisateurs premium', profiles.length, 'Profiles is_premium ou Elite')}
                ${statCard('Acces historises', accessRows.length, 'Table premium_access')}
                ${statCard('A vie', accessRows.filter((row) => row.is_lifetime).length, 'Lifetime')}
                ${statCard('Admin/source concours', accessRows.filter((row) => ['admin', 'contest'].includes(row.source)).length, 'Sources speciales')}
            </div>
            <div class="grid-2">
                <article class="panel">
                    <h3>Profils premium</h3>
                    ${renderCompactList(profiles, (row) => `${row.username || row.email || shortId(row.id)} - ${row.premium_type || row.role || 'premium'}`)}
                </article>
                <article class="panel">
                    <h3>Derniers acces</h3>
                    ${renderCompactList(accessRows.slice(0, 12), (row) => `${shortId(row.user_id)} - ${row.type || 'premium'} - ${row.source || '-'}`)}
                </article>
            </div>
            ${tableShell(renderTable(accessRows, config.columns, (row) => genericActions(row, 'premium_access', config)))}
        `;
    }

    function premiumAccessConfig() {
        return {
            title: 'Premium',
            table: 'premium_access',
            pk: 'id',
            order: 'created_at',
            descending: true,
            create: false,
            edit: false,
            archive: false,
            columns: [
                { key: 'user_id', label: 'Utilisateur', type: 'short' },
                { key: 'type', label: 'Type', type: 'status' },
                { key: 'source', label: 'Source', type: 'status' },
                { key: 'is_lifetime', label: 'A vie', type: 'boolean' },
                { key: 'starts_at', label: 'Debut', type: 'date' },
                { key: 'ends_at', label: 'Fin', type: 'date' },
                { key: 'reason', label: 'Raison', type: 'short' }
            ],
            fields: []
        };
    }

    async function renderContest() {
        const [entries, draws, settings] = await Promise.all([
            fetchRows({ table: 'contest_entries', order: 'created_at', descending: true, pk: 'id' }),
            fetchRows({ table: 'contest_draws', order: 'draw_number', descending: true, pk: 'id' }),
            state.lastStats ? Promise.resolve(state.lastStats) : fetchDashboardStats()
        ]);
        const eligible = entries.filter((row) => row.is_eligible !== false).length;
        const reached = Math.floor(eligible / 50);
        state.rows.contest_entries = new Map(entries.map((row) => [String(row.id), row]));
        state.rows.contest_draws = new Map(draws.map((row) => [String(row.id), row]));
        $('#admin-view').innerHTML = `
            ${sectionHead('Concours', 'Paliers de 50 inscrits, eligibilite et tirages premium a vie.', [
                buttonMarkup('Lancer tirage', 'ri-shuffle-line', 'primary', 'data-contest-draw'),
                buttonMarkup('Exporter gagnants', 'ri-download-2-line', 'secondary', 'data-export-table="contest_draws"')
            ])}
            <div class="stats-grid">
                ${statCard('Participants eligibles', eligible, 'Concours launch')}
                ${statCard('Paliers atteints', reached, '1 gagnant / 50')}
                ${statCard('Gagnants tires', draws.length, 'Historique')}
                ${statCard('Prochain palier', settings.contest_next_step || ((reached + 1) * 50), 'Objectif inscriptions')}
            </div>
            <div class="grid-2">
                <article class="panel">
                    <h3>Participants</h3>
                    ${renderTable(entries.slice(0, 80), [
                        { key: 'user_id', label: 'User', type: 'short' },
                        { key: 'contest_key', label: 'Concours' },
                        { key: 'is_eligible', label: 'Eligible', type: 'boolean' },
                        { key: 'excluded_reason', label: 'Exclusion', type: 'short' },
                        { key: 'created_at', label: 'Date', type: 'date' }
                    ], (row) => `
                        <div class="table-actions">
                            <button class="icon-button" title="Exclure" data-contest-exclude="${escapeHtml(row.id)}"><i class="ri-forbid-2-line"></i></button>
                        </div>
                    `)}
                </article>
                <article class="panel">
                    <h3>Gagnants</h3>
                    ${renderTable(draws, [
                        { key: 'draw_number', label: 'Tirage', type: 'number' },
                        { key: 'winner_user_id', label: 'Gagnant', type: 'short' },
                        { key: 'total_entries', label: 'Participants', type: 'number' },
                        { key: 'created_at', label: 'Date', type: 'date' }
                    ])}
                </article>
            </div>
        `;
    }

    async function renderSystem() {
        const checks = [
            ['Profils', 'profiles'],
            ['Activites', 'training_logs'],
            ['Messages', 'contact_messages'],
            ['Contenus actifs', 'content_blocks'],
            ['Pages publiees', 'dynamic_pages'],
            ['Mobs', 'mobs'],
            ['Boss', 'bosses'],
            ['Sports', 'sports'],
            ['Bugs', 'bug_reports'],
            ['Logs admin', 'admin_logs']
        ];
        const rows = [];
        for (const [label, table] of checks) {
            rows.push({ label, table, count: await countRows(table) });
        }
        $('#admin-view').innerHTML = `
            ${sectionHead('Systeme', 'Etat des tables, exports et signaux de maintenance.', [
                buttonMarkup('Utilisateurs CSV', 'ri-download-2-line', 'secondary', 'data-export-table="profiles"'),
                buttonMarkup('Activites CSV', 'ri-download-2-line', 'secondary', 'data-export-table="training_logs"'),
                buttonMarkup('Messages CSV', 'ri-download-2-line', 'secondary', 'data-export-table="contact_messages"'),
                buttonMarkup('Gagnants CSV', 'ri-download-2-line', 'secondary', 'data-export-table="contest_draws"')
            ])}
            <div class="health-grid">
                ${rows.map((row) => `
                    <div class="health-row">
                        <div><strong>${escapeHtml(row.label)}</strong><br><span>${escapeHtml(row.table)}</span></div>
                        ${badge(row.count, 'neutral')}
                    </div>
                `).join('')}
            </div>
            <article class="panel">
                <h3>Schema attendu</h3>
                <div class="json-preview">${escapeHtml('Appliquer sql/titan_admin_control_center_v1.sql si un module retourne PGRST205/table not found ou RPC missing.')}</div>
            </article>
        `;
    }

    async function renderTableSection(tableName) {
        const config = TABLES[tableName];
        if (!config) throw new Error(`Configuration absente: ${tableName}`);
        const filters = state.filters[tableName] || {};
        const rows = filterRows(await fetchRows(config), filters, config);
        state.rows[tableName] = new Map(rows.map((row) => [String(getRowKey(row, config)), row]));
        $('#admin-view').innerHTML = `
            ${sectionHead(config.title, config.subtitle, [
                config.create !== false ? buttonMarkup('Ajouter', 'ri-add-line', 'primary', `data-row-action="create" data-table="${escapeHtml(tableName)}"`) : '',
                buttonMarkup('Exporter CSV', 'ri-download-2-line', 'secondary', `data-export-table="${escapeHtml(tableName)}"`)
            ])}
            ${renderToolbar(tableName, config, filters)}
            ${tableShell(renderTable(rows, config.columns, (row) => genericActions(row, tableName, config)))}
        `;
    }

    async function fetchRows(config) {
        let query = state.client.from(config.table).select('*').limit(config.limit || 200);
        if (config.order) query = query.order(config.order, { ascending: !config.descending });
        const { data, error } = await query;
        if (error) throw error;
        return Array.isArray(data) ? data : [];
    }

    function filterRows(rows, filters = {}, config = null) {
        const search = String(filters.search || '').toLowerCase().trim();
        return rows.filter((row) => {
            if (search) {
                const text = JSON.stringify(row).toLowerCase();
                if (!text.includes(search)) return false;
            }
            const fieldFilters = config?.filters || [
                { key: 'role' },
                { key: 'status' },
                { key: 'premium' }
            ];
            for (const filter of fieldFilters) {
                const value = filters[filter.key];
                if (value === undefined || value === null || value === '') continue;
                if (filter.key === 'premium') {
                    const isPremium = row.is_premium === true || row.is_elite === true;
                    if (value === 'premium' && !isPremium) return false;
                    if (value === 'free' && isPremium) return false;
                    continue;
                }
                if (value === 'true' || value === 'false') {
                    if (String(row[filter.key] === true) !== value) return false;
                    continue;
                }
                if (String(row[filter.key] ?? '') !== String(value)) return false;
            }
            return true;
        });
    }

    function renderToolbar(sectionId, config, filters) {
        const controls = [
            filterInput(sectionId, 'search', 'Rechercher', filters.search),
            ...(config.filters || []).map((filter) => filterSelect(sectionId, filter.key, filter.label, filter.options, filters[filter.key]))
        ].join('');
        return `<div class="toolbar"><div class="filter-row">${controls}</div></div>`;
    }

    function filterInput(section, key, placeholder, value = '') {
        return `
            <label class="field">
                <span>${escapeHtml(placeholder)}</span>
                <input class="admin-input" type="search" value="${escapeHtml(value || '')}" data-filter-section="${escapeHtml(section)}" data-filter-key="${escapeHtml(key)}" placeholder="${escapeHtml(placeholder)}">
            </label>
        `;
    }

    function filterSelect(section, key, label, options, value = '') {
        const normalized = (options || []).map((option) => typeof option === 'string' ? { value: option, label: option || 'Tous' } : option);
        return `
            <label class="field">
                <span>${escapeHtml(label)}</span>
                <select class="admin-select" data-filter-section="${escapeHtml(section)}" data-filter-key="${escapeHtml(key)}">
                    ${normalized.map((option) => `<option value="${escapeHtml(option.value)}" ${String(value || '') === String(option.value) ? 'selected' : ''}>${escapeHtml(option.label)}</option>`).join('')}
                </select>
            </label>
        `;
    }

    function sectionHead(title, subtitle, actions = []) {
        return `
            <div class="section-head">
                <div class="section-title">
                    <h2>${escapeHtml(title)}</h2>
                    <p>${escapeHtml(subtitle || '')}</p>
                </div>
                <div class="quick-actions">${actions.filter(Boolean).join('')}</div>
            </div>
        `;
    }

    function buttonMarkup(label, icon, cls = 'secondary', attrs = '') {
        return `<button class="admin-btn ${escapeHtml(cls)}" type="button" ${attrs}><i class="${escapeHtml(icon)}"></i><span>${escapeHtml(label)}</span></button>`;
    }

    function tableShell(table) {
        return `<div class="table-shell"><div class="table-scroll">${table}</div></div>`;
    }

    function renderTable(rows, columns, actionsFn) {
        if (!rows || rows.length === 0) {
            return '<div class="empty-state">Aucune donnee.</div>';
        }
        return `
            <table class="admin-table">
                <thead>
                    <tr>
                        ${columns.map((col) => `<th>${escapeHtml(col.label)}</th>`).join('')}
                        ${actionsFn ? '<th>Actions</th>' : ''}
                    </tr>
                </thead>
                <tbody>
                    ${rows.map((row) => `
                        <tr>
                            ${columns.map((col) => `<td>${renderCell(row, col)}</td>`).join('')}
                            ${actionsFn ? `<td>${actionsFn(row)}</td>` : ''}
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        `;
    }

    function renderCell(row, col) {
        const raw = row[col.key] ?? (col.fallback ? row[col.fallback] : undefined);
        if (col.type === 'main') {
            return `
                <span class="cell-main">
                    <strong>${escapeHtml(raw || '-')}</strong>
                    <small>${escapeHtml(row[col.sub] || '')}</small>
                </span>
            `;
        }
        if (col.type === 'date') return escapeHtml(formatDate(raw));
        if (col.type === 'boolean') return badge(raw === true, 'boolean');
        if (col.type === 'status') return badge(raw);
        if (col.type === 'number') return escapeHtml(safeNumber(raw));
        if (col.type === 'short') return `<span class="mono" title="${escapeHtml(raw || '')}">${escapeHtml(shortId(raw))}</span>`;
        if (col.type === 'json') return `<pre class="json-preview">${escapeHtml(JSON.stringify(raw ?? null, null, 2))}</pre>`;
        if (raw && typeof raw === 'object') return `<pre class="json-preview">${escapeHtml(JSON.stringify(raw, null, 2))}</pre>`;
        return escapeHtml(raw ?? '-');
    }

    function genericActions(row, tableName, config) {
        const key = escapeHtml(String(getRowKey(row, config)));
        const buttons = [];
        if (config.edit !== false) buttons.push(`<button class="icon-button" title="Modifier" data-row-action="edit" data-table="${escapeHtml(tableName)}" data-key="${key}"><i class="ri-edit-line"></i></button>`);
        if (row.body || row.content || row.message || row.description) buttons.push(`<button class="icon-button" title="Apercu" data-row-action="preview" data-table="${escapeHtml(tableName)}" data-key="${key}"><i class="ri-eye-line"></i></button>`);
        if (config.activeField) buttons.push(`<button class="icon-button" title="Activer/desactiver" data-row-action="toggle" data-table="${escapeHtml(tableName)}" data-key="${key}"><i class="ri-toggle-line"></i></button>`);
        if (config.archive) buttons.push(`<button class="icon-button" title="Archiver" data-row-action="archive" data-table="${escapeHtml(tableName)}" data-key="${key}"><i class="ri-inbox-archive-line"></i></button>`);
        return `<div class="table-actions">${buttons.join('')}</div>`;
    }

    function getRowKey(row, config) {
        return row[config.pk || 'id'] ?? row.key ?? row.slug ?? row.id;
    }

    function renderCompactList(rows, labelFn) {
        if (!rows.length) return '<div class="empty-state">Aucun element.</div>';
        return `
            <div class="health-grid">
                ${rows.map((row) => `<div class="health-row"><strong>${escapeHtml(labelFn(row))}</strong><span>${escapeHtml(formatDate(row.created_at || row.updated_at))}</span></div>`).join('')}
            </div>
        `;
    }

    let filterTimer = null;
    function handleFilterInput(event) {
        const section = event.target?.dataset?.filterSection;
        const key = event.target?.dataset?.filterKey;
        if (!section || !key) return;
        state.filters[section] = state.filters[section] || {};
        state.filters[section][key] = event.target.value;
        clearTimeout(filterTimer);
        filterTimer = setTimeout(() => renderCurrentView(), event.type === 'input' ? 260 : 0);
    }

    async function handleDocumentClick(event) {
        const viewButton = event.target.closest('[data-view]');
        if (viewButton) {
            switchView(viewButton.dataset.view);
            return;
        }

        if (event.target.closest('[data-refresh-current]')) {
            renderCurrentView(true);
            return;
        }

        const userAction = event.target.closest('[data-user-action]');
        if (userAction) {
            await handleUserAction(userAction.dataset.userAction, userAction.dataset.userId);
            return;
        }

        const rowAction = event.target.closest('[data-row-action]');
        if (rowAction) {
            await handleRowAction(rowAction.dataset.rowAction, rowAction.dataset.table, rowAction.dataset.key);
            return;
        }

        const exportSection = event.target.closest('[data-export-section]');
        if (exportSection) {
            exportCurrentRows(exportSection.dataset.exportSection);
            return;
        }

        const exportTable = event.target.closest('[data-export-table]');
        if (exportTable) {
            await exportTableRows(exportTable.dataset.exportTable);
            return;
        }

        if (event.target.closest('[data-premium-grant-global]')) {
            openGrantPremiumModal();
            return;
        }

        if (event.target.closest('[data-contest-draw]')) {
            await runContestDraw();
            return;
        }

        const exclude = event.target.closest('[data-contest-exclude]');
        if (exclude) {
            await excludeContestEntry(exclude.dataset.contestExclude);
        }
    }

    async function handleUserAction(action, userId) {
        const row = state.rows.users?.get(String(userId));
        if (!row) return;
        if (action === 'edit') openUserEditor(row);
        if (action === 'grant-premium') openGrantPremiumModal(userId);
        if (action === 'revoke-premium') await revokePremium(userId);
        if (action === 'suspend') await updateUserStatus(userId, 'suspended');
        if (action === 'ban') await updateUserStatus(userId, 'banned');
        if (action === 'reactivate') await updateUserStatus(userId, 'active');
        if (action === 'activities') {
            state.filters.training_logs = { search: userId };
            switchView('activities');
        }
        if (action === 'logs') {
            state.filters.admin_logs = { search: userId };
            switchView('logs');
        }
    }

    async function updateUserStatus(userId, status) {
        const reason = await confirmSensitive({
            title: `Statut ${status}`,
            message: shortId(userId),
            actionLabel: 'Confirmer',
            danger: status !== 'active',
            requireReason: status !== 'active'
        });
        if (reason === false) return;
        const { error } = await state.client.rpc('titan_admin_update_profile_v1', {
            p_user_id: userId,
            p_patch: { status },
            p_reason: reason || `status:${status}`
        });
        if (error) throw error;
        notify('Statut mis a jour', status, 'success');
        renderCurrentView(true);
    }

    async function revokePremium(userId) {
        const reason = await confirmSensitive({
            title: 'Retirer premium',
            message: shortId(userId),
            actionLabel: 'Retirer',
            danger: true,
            requireReason: true
        });
        if (reason === false) return;
        const { error } = await state.client.rpc('titan_admin_revoke_premium_v1', {
            p_user_id: userId,
            p_reason: reason
        });
        if (error) throw error;
        notify('Premium retire', shortId(userId), 'success');
        renderCurrentView(true);
    }

    async function handleRowAction(action, tableName, key) {
        const config = TABLES[tableName] || premiumAccessConfig();
        const row = key ? state.rows[tableName]?.get(String(key)) : null;
        if (action === 'create') {
            openGenericEditor(tableName, null);
            return;
        }
        if (!row) return;
        if (action === 'edit') openGenericEditor(tableName, row);
        if (action === 'preview') openPreview(row);
        if (action === 'toggle') await toggleRow(config, row);
        if (action === 'archive') await archiveRow(config, row);
    }

    function openUserEditor(row) {
        const fields = [
            { key: 'username', label: 'Pseudo' },
            { key: 'email', label: 'Email' },
            { key: 'role', label: 'Role', type: 'select', options: ADMIN_ROLES },
            { key: 'status', label: 'Statut', type: 'select', options: USER_STATUS },
            { key: 'is_premium', label: 'Premium', type: 'boolean' },
            { key: 'premium_type', label: 'Type premium' },
            { key: 'premium_until', label: 'Premium fin', type: 'datetime' },
            { key: 'level', label: 'Niveau', type: 'number' },
            { key: 'xp', label: 'XP', type: 'number' },
            { key: 'credits', label: 'Credits', type: 'number' },
            { key: 'suspension_reason', label: 'Raison suspension', type: 'textarea', full: true },
            { key: 'admin_notes', label: 'Notes admin', type: 'textarea', full: true }
        ];
        openFormModal({
            title: row.username || row.email || shortId(row.id),
            kicker: 'Utilisateur',
            fields,
            row,
            saveLabel: 'Sauvegarder',
            sensitive: true,
            onSave: async (payload, reason) => {
                const { data, error } = await state.client.rpc('titan_admin_update_profile_v1', {
                    p_user_id: row.id,
                    p_patch: payload,
                    p_reason: reason
                });
                if (error) throw error;
                notify('Utilisateur mis a jour', shortId(row.id), 'success');
                return data;
            }
        });
    }

    function openGrantPremiumModal(userId = '') {
        const fields = [
            { key: 'user_id', label: 'User ID', required: true },
            { key: 'type', label: 'Type', value: 'premium' },
            { key: 'source', label: 'Source', type: 'select', options: ['admin', 'contest', 'purchase', 'influencer', 'test', 'compensation'] },
            { key: 'ends_at', label: 'Date de fin', type: 'datetime' },
            { key: 'is_lifetime', label: 'Premium a vie', type: 'boolean' }
        ];
        openFormModal({
            title: 'Accorder premium',
            kicker: 'Premium',
            fields,
            row: { user_id: userId, type: 'premium', source: 'admin' },
            saveLabel: 'Accorder',
            sensitive: true,
            onSave: async (payload, reason) => {
                const { data, error } = await state.client.rpc('titan_admin_grant_premium_v1', {
                    p_user_id: payload.user_id,
                    p_type: payload.type || 'premium',
                    p_source: payload.source || 'admin',
                    p_ends_at: payload.ends_at || null,
                    p_is_lifetime: payload.is_lifetime === true,
                    p_reason: reason
                });
                if (error) throw error;
                notify('Premium accorde', shortId(payload.user_id), 'success');
                return data;
            }
        });
    }

    function openGenericEditor(tableName, row) {
        const config = TABLES[tableName];
        const isCreate = !row;
        openFormModal({
            title: `${isCreate ? 'Ajouter' : 'Modifier'} ${config.title}`,
            kicker: config.table,
            fields: config.fields,
            row: row || {},
            saveLabel: isCreate ? 'Creer' : 'Sauvegarder',
            sensitive: CATALOG_TABLES.has(config.table),
            onSave: async (payload, reason) => {
                const result = await saveAdminRow(config, row, payload, reason);
                notify(isCreate ? 'Element cree' : 'Element mis a jour', config.title, 'success');
                return result;
            }
        });
    }

    async function saveAdminRow(config, row, payload, reason) {
        const isCreate = !row;
        const pk = config.pk || 'id';
        const cleanPayload = normalizeFormPayload(payload, config.fields || [], isCreate);

        if (!isCreate) cleanPayload[pk] = getRowKey(row, config);
        if (config.updatedAt && !cleanPayload[config.updatedAt]) cleanPayload[config.updatedAt] = new Date().toISOString();
        if (config.updatedBy && !cleanPayload[config.updatedBy]) cleanPayload[config.updatedBy] = state.user.id;

        if (ADMIN_UPSERT_TABLES.has(config.table)) {
            const { data, error } = await state.client.rpc('titan_admin_upsert_row_v1', {
                p_table: config.table,
                p_pk: pk,
                p_payload: cleanPayload,
                p_reason: reason || null
            });
            if (error) throw error;
            return data;
        }

        const directPayload = Object.assign({}, cleanPayload);
        if (isCreate && config.createdBy && !directPayload[config.createdBy]) directPayload[config.createdBy] = state.user.id;
        const before = row ? Object.assign({}, row) : null;
        let result;
        if (isCreate) {
            const { data, error } = await state.client.from(config.table).insert(directPayload).select('*').single();
            if (error) throw error;
            result = data;
        } else {
            const { data, error } = await state.client
                .from(config.table)
                .update(directPayload)
                .eq(pk, getRowKey(row, config))
                .select('*')
                .single();
            if (error) throw error;
            result = data;
        }
        await logAdminAction(isCreate ? `create_${config.table}` : `update_${config.table}`, config.table, String(getRowKey(result, config)), before, result, reason);
        return result;
    }

    function normalizeFormPayload(payload, fields, isCreate) {
        const normalized = Object.assign({}, payload);
        const fieldByKey = new Map((fields || []).map((field) => [field.key, field]));
        Object.keys(normalized).forEach((key) => {
            const field = fieldByKey.get(key);
            const value = normalized[key];
            if (value === undefined) {
                delete normalized[key];
                return;
            }
            if (isCreate && !field?.required && field?.type !== 'boolean' && (value === null || value === '')) {
                delete normalized[key];
            }
        });
        return normalized;
    }

    function openPreview(row) {
        const html = row.content || row.body || row.message || row.description || JSON.stringify(row, null, 2);
        openModal({
            title: row.title || row.name || row.key || 'Apercu',
            kicker: 'Preview',
            body: `<div class="panel"><div class="json-preview">${escapeHtml(String(html))}</div></div>`,
            actions: [buttonMarkup('Fermer', 'ri-close-line', 'secondary', 'data-modal-cancel')]
        });
    }

    async function toggleRow(config, row) {
        const field = config.activeField;
        if (!field) return;
        const next = !(row[field] === true);
        const reason = await confirmSensitive({
            title: `${next ? 'Activer' : 'Desactiver'} ${config.title}`,
            message: `Changer ${field} sur ${shortId(getRowKey(row, config))}.`,
            actionLabel: next ? 'Activer' : 'Desactiver'
        });
        if (reason === false) return;
        const payload = { [field]: next };
        await saveAdminRow(config, row, payload, reason);
        notify('Statut modifie', config.title, 'success');
        renderCurrentView(true);
    }

    async function archiveRow(config, row) {
        if (!config.archive) return;
        const reason = await confirmSensitive({
            title: 'Confirmer archivage',
            message: `${config.title} - ${shortId(getRowKey(row, config))}`,
            actionLabel: 'Archiver',
            danger: true,
            requireReason: true
        });
        if (reason === false) return;
        const payload = { [config.archive.field]: config.archive.value };
        await saveAdminRow(config, row, payload, reason);
        notify('Element archive', config.title, 'success');
        renderCurrentView(true);
    }

    async function runContestDraw() {
        const reason = await confirmSensitive({
            title: 'Lancer un tirage',
            message: 'Le gagnant recevra un premium a vie et le tirage sera journalise.',
            actionLabel: 'Lancer',
            danger: true,
            requireReason: true
        });
        if (reason === false) return;
        const { data, error } = await state.client.rpc('titan_admin_run_contest_draw_v1', {
            p_contest_key: 'launch',
            p_reason: reason
        });
        if (error) throw error;
        notify('Tirage termine', `Gagnant: ${shortId(data.winner_user_id)}`, 'success');
        renderCurrentView(true);
    }

    async function excludeContestEntry(entryId) {
        const row = state.rows.contest_entries?.get(String(entryId));
        if (!row) return;
        const reason = await confirmSensitive({
            title: 'Exclure participant',
            message: shortId(row.user_id),
            actionLabel: 'Exclure',
            danger: true,
            requireReason: true
        });
        if (reason === false) return;
        await saveAdminRow(
            { table: 'contest_entries', pk: 'id', fields: [{ key: 'is_eligible', type: 'boolean' }, { key: 'excluded_reason' }] },
            row,
            { is_eligible: false, excluded_reason: reason },
            reason
        );
        notify('Participant exclu', shortId(row.user_id), 'success');
        renderCurrentView(true);
    }

    function openFormModal(options) {
        const body = `
            <form id="admin-edit-form" class="form-grid">
                ${options.fields.map((field) => renderFormField(field, options.row)).join('')}
                ${options.sensitive ? `
                    <label class="form-field full">
                        <span>Raison admin</span>
                        <textarea class="admin-textarea" data-reason placeholder="Raison visible dans les logs"></textarea>
                    </label>
                ` : ''}
            </form>
        `;
        openModal({
            title: options.title,
            kicker: options.kicker,
            body,
            actions: [
                buttonMarkup('Annuler', 'ri-close-line', 'secondary', 'data-modal-cancel'),
                buttonMarkup(options.saveLabel || 'Sauvegarder', 'ri-save-line', 'primary', 'data-modal-save')
            ]
        });
        $('[data-modal-save]').onclick = async () => {
            try {
                const payload = readFormPayload(options.fields);
                const reason = $('[data-reason]')?.value || '';
                if (options.sensitive && !reason.trim()) {
                    notify('Raison obligatoire', 'Indique une raison admin avant de journaliser cette action.', 'warning');
                    return;
                }
                await options.onSave(payload, reason);
                closeModal();
                renderCurrentView(true);
            } catch (error) {
                console.error('[TITAN ADMIN SAVE]', error);
                notify('Sauvegarde impossible', error.message || String(error), 'danger');
            }
        };
    }

    function renderFormField(field, row) {
        const value = row[field.key] ?? field.value ?? '';
        const required = field.required ? 'required' : '';
        const full = field.full || field.type === 'textarea' || field.type === 'json' ? ' full' : '';
        if (field.type === 'boolean') {
            return `
                <label class="form-field${full}">
                    <span>${escapeHtml(field.label)}</span>
                    <span class="checkbox-field">
                        <input type="checkbox" data-field="${escapeHtml(field.key)}" data-type="boolean" ${value === true ? 'checked' : ''}>
                        <small>${escapeHtml(field.label)}</small>
                    </span>
                </label>
            `;
        }
        if (field.type === 'select') {
            return `
                <label class="form-field${full}">
                    <span>${escapeHtml(field.label)}</span>
                    <select class="admin-select" data-field="${escapeHtml(field.key)}" data-type="select" ${required}>
                        ${(field.options || []).map((option) => `<option value="${escapeHtml(option)}" ${String(value || '') === String(option) ? 'selected' : ''}>${escapeHtml(option)}</option>`).join('')}
                    </select>
                </label>
            `;
        }
        if (field.type === 'textarea' || field.type === 'json') {
            const text = field.type === 'json'
                ? JSON.stringify(value && typeof value === 'object' ? value : (value || field.defaultJson || {}), null, 2)
                : String(value || '');
            return `
                <label class="form-field${full}">
                    <span>${escapeHtml(field.label)}</span>
                    <textarea class="admin-textarea" data-field="${escapeHtml(field.key)}" data-type="${field.type}" ${required}>${escapeHtml(text)}</textarea>
                </label>
            `;
        }
        const inputType = field.type === 'number' ? 'number' : field.type === 'datetime' ? 'datetime-local' : 'text';
        const inputValue = field.type === 'datetime' ? toDateInput(value) : value;
        const step = field.type === 'number' ? ` step="${escapeHtml(field.step || 'any')}"` : '';
        return `
            <label class="form-field${full}">
                <span>${escapeHtml(field.label)}</span>
                <input class="admin-input" type="${inputType}"${step} data-field="${escapeHtml(field.key)}" data-type="${escapeHtml(field.type || 'text')}" value="${escapeHtml(inputValue || '')}" ${required}>
            </label>
        `;
    }

    function readFormPayload(fields) {
        const payload = {};
        fields.forEach((field) => {
            const el = $(`[data-field="${CSS.escape(field.key)}"]`);
            if (!el) return;
            const type = el.dataset.type || 'text';
            if (type === 'boolean') payload[field.key] = el.checked;
            else if (type === 'number') payload[field.key] = el.value === '' ? null : Number(el.value);
            else if (type === 'datetime') payload[field.key] = el.value ? new Date(el.value).toISOString() : null;
            else if (type === 'json') {
                const raw = el.value.trim();
                payload[field.key] = raw ? JSON.parse(raw) : {};
            } else {
                payload[field.key] = el.value.trim() === '' ? null : el.value.trim();
            }
        });
        return payload;
    }

    function openModal({ title, kicker = 'TITAN OS', body = '', actions = [] }) {
        $('#modal-title').textContent = title;
        $('#modal-kicker').textContent = kicker;
        $('#modal-body').innerHTML = body;
        $('#modal-actions').innerHTML = actions.join('');
        $('#admin-modal').hidden = false;
        const cancel = $('[data-modal-cancel]');
        if (cancel) cancel.onclick = closeModal;
    }

    function closeModal() {
        $('#admin-modal').hidden = true;
        $('#modal-body').innerHTML = '';
        $('#modal-actions').innerHTML = '';
    }

    function confirmSensitive({ title, message, actionLabel = 'Confirmer', danger = false, requireReason = false }) {
        return new Promise((resolve) => {
            openModal({
                title,
                kicker: 'Confirmation',
                body: `
                    <div class="panel">
                        <p>${escapeHtml(message)}</p>
                        <label class="form-field full">
                            <span>Raison</span>
                            <textarea class="admin-textarea" data-confirm-reason placeholder="${requireReason ? 'Obligatoire' : 'Optionnelle'}"></textarea>
                        </label>
                    </div>
                `,
                actions: [
                    buttonMarkup('Annuler', 'ri-close-line', 'secondary', 'data-confirm-cancel'),
                    buttonMarkup(actionLabel, danger ? 'ri-alarm-warning-line' : 'ri-check-line', danger ? 'danger' : 'primary', 'data-confirm-ok')
                ]
            });
            $('[data-confirm-cancel]').onclick = () => {
                closeModal();
                resolve(false);
            };
            $('[data-confirm-ok]').onclick = () => {
                const reason = $('[data-confirm-reason]').value.trim();
                if (requireReason && !reason) {
                    notify('Raison requise', 'Indique une raison avant de confirmer.', 'warning');
                    return;
                }
                closeModal();
                resolve(reason);
            };
        });
    }

    async function logAdminAction(action, targetTable, targetId, oldValue, newValue, reason) {
        const { error } = await state.client.rpc('titan_admin_write_log_v1', {
            p_action: action,
            p_target_table: targetTable,
            p_target_id: targetId,
            p_old_value: oldValue || null,
            p_new_value: newValue || null,
            p_reason: reason || null
        });
        if (error) {
            console.warn('[TITAN ADMIN LOG]', error);
        }
    }

    function exportCurrentRows(section) {
        const rows = Array.from((state.rows[section] || new Map()).values());
        exportToCSV(rows, `titan_${section}_${dateStamp()}.csv`);
    }

    async function exportTableRows(table) {
        const config = TABLES[table] || { table, order: 'created_at', descending: true };
        const rows = await fetchRows(Object.assign({}, config, { limit: 1000 }));
        exportToCSV(rows, `titan_${table}_${dateStamp()}.csv`);
    }

    function exportToCSV(rows, filename) {
        if (!rows || rows.length === 0) {
            notify('Export vide', 'Aucune donnee a exporter.', 'warning');
            return;
        }
        const headers = Array.from(rows.reduce((set, row) => {
            Object.keys(row || {}).forEach((key) => set.add(key));
            return set;
        }, new Set()));
        const lines = [
            headers.join(','),
            ...rows.map((row) => headers.map((header) => csvCell(row[header])).join(','))
        ];
        const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        link.remove();
        URL.revokeObjectURL(url);
        notify('Export pret', filename, 'success');
    }

    function csvCell(value) {
        const text = value && typeof value === 'object' ? JSON.stringify(value) : String(value ?? '');
        return `"${text.replace(/"/g, '""')}"`;
    }

    function dateStamp() {
        return new Date().toISOString().slice(0, 10);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init, { once: true });
    } else {
        init();
    }
})();
