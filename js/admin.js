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
        { id: 'moderation', label: 'Modération', icon: 'ri-shield-user-line', custom: 'moderation' },
        { id: 'appeals', label: 'Recours', icon: 'ri-scales-2-fill', custom: 'appeals' },
        { id: 'flags', label: 'Drapeaux', icon: 'ri-toggle-line', custom: 'flags' },
        { id: 'consultations', label: 'Votes et idées', icon: 'ri-bar-chart-horizontal-line', custom: 'consultations' },
        { id: 'pioneers', label: 'Pionniers', icon: 'ri-flag-line', custom: 'pioneers' },
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
        // The lookup form has no inline onsubmit (CSP): Enter must not navigate; the button handles the lookup.
        document.addEventListener('submit', (event) => {
            if (event.target.closest && event.target.closest('[data-moderation-lookup]')) event.preventDefault();
        });

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
            else if (item.custom === 'moderation') await renderModeration(force);
            else if (item.custom === 'appeals') await renderAppeals(force);
            else if (item.custom === 'flags') await renderFlags(force);
            else if (item.custom === 'consultations') await renderConsultations(force);
            else if (item.custom === 'pioneers') await renderPioneers(force);
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
                <button class="icon-button" title="Dossier de moderation" aria-label="Dossier de moderation" data-moderation-open="${id}"><i class="ri-shield-user-line"></i></button>
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

        const moderationOpen = event.target.closest('[data-moderation-open]');
        if (moderationOpen) {
            await openModerationCase(moderationOpen.dataset.moderationOpen);
            return;
        }

        if (event.target.closest('[data-moderation-lookup-submit]')) {
            const typed = String(($('[data-moderation-lookup] [name=user]') || {}).value || '').trim();
            if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(typed)) {
                notify('Identifiant invalide', 'Colle l\u2019identifiant complet du compte (format 8-4-4-4-12).', 'warning');
                return;
            }
            await openModerationCase(typed.toLowerCase());
            return;
        }

        const appealDecide = event.target.closest('[data-appeal-decide]');
        if (appealDecide) {
            await decideAppeal(appealDecide.dataset.appealId, appealDecide.dataset.appealDecide === 'accept');
            return;
        }

        const moderationDecide = event.target.closest('[data-moderation-decide]');
        if (moderationDecide) {
            await decideModeration(moderationDecide.dataset.moderationDecide);
            return;
        }

        const sessionExclude = event.target.closest('[data-session-exclude]');
        if (sessionExclude) {
            await excludeSession(sessionExclude.dataset.sessionExclude, sessionExclude.dataset.excluded === 'true');
            return;
        }

        if (event.target.closest('[data-verify-request]')) {
            await requestVerification();
            return;
        }

        const verifyClose = event.target.closest('[data-verify-close]');
        if (verifyClose) {
            await closeVerification(verifyClose.dataset.verifyClose);
            return;
        }

        const pioneerFind = event.target.closest('[data-pioneer-find]');
        if (pioneerFind) { await findPioneers(); return; }
        const pioneerGrant = event.target.closest('[data-pioneer-grant]');
        if (pioneerGrant) { await grantPioneers(); return; }
        const pioneerRevoke = event.target.closest('[data-pioneer-revoke]');
        if (pioneerRevoke) { await revokePioneer(pioneerRevoke.dataset.pioneerRevoke); return; }
        const reportAct = event.target.closest('[data-club-report-act]');
        if (reportAct) { await resolveClubReport(reportAct.dataset.report, reportAct.dataset.clubReportAct); return; }
        const goalCreate = event.target.closest('[data-wg-create]');
        if (goalCreate) { await createWorldGoal(); return; }
        const seasonCreate = event.target.closest('[data-season-create]');
        if (seasonCreate) { await createSeason(); return; }
        const cqCreate = event.target.closest('[data-cq-create]');
        if (cqCreate) { await createCommonQuest(); return; }
        const pollCreate = event.target.closest('[data-poll-create]');
        if (pollCreate) { await createPoll(); return; }
        const pollClose = event.target.closest('[data-poll-close]');
        if (pollClose) { await closePoll(pollClose.dataset.pollClose); return; }
        const ideaSave = event.target.closest('[data-idea-save]');
        if (ideaSave) { await saveIdea(ideaSave.closest('[data-idea-row]')); return; }

        const flagSave = event.target.closest('[data-flag-save]');
        if (flagSave) {
            await saveFlag(flagSave.closest('[data-flag-row]'));
            return;
        }

        const moderationRevert = event.target.closest('[data-moderation-revert]');
        if (moderationRevert) {
            await revertModeration(moderationRevert.dataset.moderationRevert);
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

    // The Content-Security-Policy only lets images come from this site and the project's storage: say so at save time
    // instead of leaving a silently broken picture on a public page.
    const IMAGE_FIELDS = new Set(['image_url', 'cover_image_url']);
    function imageUrlProblem(value) {
        const url = String(value ?? '').trim();
        if (!url) return null;
        const project = String(window.TITAN_SUPABASE_URL || '').replace(/\/+$/, '');
        const own = project && url.startsWith(`${project}/storage/`);
        const local = (url.startsWith('/') && !url.startsWith('//')) || url.startsWith('./') || /^[a-z0-9_-][a-z0-9_./-]*$/i.test(url);
        return own || local ? null : 'Image : utilise un chemin du site (/image/…) ou le stockage du projet ; les autres hôtes sont bloqués par la politique de sécurité.';
    }
    window.titanAdminValidators = { imageUrlProblem };

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
                if (IMAGE_FIELDS.has(field.key)) {
                    const problem = imageUrlProblem(el.value);
                    if (problem) throw new Error(problem);
                }
                payload[field.key] = el.value.trim() === '' ? null : el.value.trim();
            }
        });
        return payload;
    }

    // ---------------------------------------------------------------------------------------------
    // Moderation: review queue, case file and human decisions (titan_moderation_*_v1).
    // Nothing here is automatic. The server decides who may read or act; this screen only displays and asks.
    // ---------------------------------------------------------------------------------------------
    const MODERATION_DECISION_LABELS = {
        dismiss: 'Classé sans suite',
        watch: 'Surveillance',
        suspend: 'Suspension',
        restore: 'Rétablissement',
        revert: 'Annulation'
    };
    const MODERATION_ERRORS = {
        ADMIN_ONLY: 'Cette action est réservée aux administrateurs.',
        REASON_REQUIRED: 'Indique un motif d’au moins 3 caractères.',
        UNKNOWN_DECISION: 'Décision inconnue.',
        CANNOT_MODERATE_SELF: 'Tu ne peux pas modérer ton propre compte.',
        CANNOT_MODERATE_ADMIN: 'Un administrateur ne peut pas être modéré ici.',
        ACCOUNT_NOT_FOUND: 'Ce compte n’existe plus.',
        ALREADY_SUSPENDED: 'Ce compte est déjà suspendu.',
        NOT_SUSPENDED: 'Ce compte n’est pas suspendu (un bannissement ne se lève pas depuis cette file).',
        NOT_LATEST_DECISION: 'Seule la dernière décision d’un compte peut être annulée.',
        NOT_REVERTIBLE: 'Cette décision ne peut pas être annulée.',
        DECISION_NOT_FOUND: 'Décision introuvable.',
        SESSION_NOT_FOUND: 'Cette séance n’existe plus.',
        EXCLUSION_REQUIRED: 'Choisis d’exclure ou de rétablir la séance.',
        MESSAGE_REQUIRED: 'Le message doit faire entre 10 et 500 caractères.',
        REQUEST_ALREADY_OPEN: 'Une demande de vérification est déjà ouverte pour ce joueur.',
        REQUEST_LIMIT: 'Trois demandes ont déjà été envoyées à ce joueur cette semaine.',
        REQUEST_CLOSED: 'Cette demande est déjà close.',
        REQUEST_NOT_FOUND: 'Cette demande n’existe plus.',
        USER_NOT_FOUND: 'Ce compte n’existe plus.',
        ACCOUNT_STATE_CHANGED: 'Le compte a été modifié depuis cette décision par un autre outil : vérifie son état avant de réessayer.'
    };

    function moderationErrorText(error) {
        const message = String((error && error.message) || error || '');
        const code = Object.keys(MODERATION_ERRORS).find((key) => message.includes(key));
        return code ? MODERATION_ERRORS[code] : (message || 'Erreur inconnue.');
    }

    function moderationUnavailable(error) {
        const message = String((error && error.message) || '');
        return error && (error.code === 'PGRST202' || error.code === '42883' || /could not find the function/i.test(message));
    }

    function moderationLevelBadge(level) {
        const labels = { urgent: 'Urgent', review: 'À examiner', watch: 'À surveiller', low: 'Faible' };
        const cls = level === 'urgent' ? 'badge-danger' : (level === 'review' || level === 'watch') ? 'badge-warning' : '';
        return `<span class="status-badge ${cls}">${escapeHtml(labels[level] || level || '-')}</span>`;
    }

    const SESSION_SIGNAL_LABELS = { overlap: 'Chevauchement', speed_jump: 'Vitesse inhabituelle', day_volume: 'Volume du jour', beyond_human: 'Allure au-delà du possible', extraordinary_series: 'Série de performances extraordinaires' };
    function sessionSignalText(signal) {
        const d = signal.detail && typeof signal.detail === 'object' ? signal.detail : {};
        const n = (value) => escapeHtml(value === null || value === undefined || value === '' || !Number.isFinite(Number(value)) ? '?' : Number(value));
        let detail = '';
        if (signal.code === 'overlap') detail = `${n(d.overlapMinutes)} min en commun (${n(Math.round(Number(d.shareOfShorter) * 100))} % de la plus courte)`;
        else if (signal.code === 'speed_jump') detail = `${n(d.kmh)} km/h contre ${n(d.medianKmh)} km/h habituels (${n(d.priorSessions)} séances)`;
        else if (signal.code === 'beyond_human') detail = `${n(d.kmh)} km/h tenus plus de 15 minutes (${escapeHtml(d.sport || '')}) : au-delà des records connus`;
        else if (signal.code === 'extraordinary_series') detail = `${n(d.sessionsInFourteenDays)} séances à plus de 1,5 fois l’allure habituelle en 14 jours`;
        else if (signal.code === 'day_volume') detail = `${n(d.minutesThatDay)} min déclarées ce jour-là`;
        const label = SESSION_SIGNAL_LABELS[signal.code] || signal.code;
        return `<strong>${escapeHtml(label)}</strong> · ${escapeHtml(signal.severity)} · ${n(signal.points)} pt${detail ? ` · ${detail}` : ''}`;
    }

    // Advisory only: this lists sessions whose own history looks inconsistent; nothing is excluded from here.
    // Advisory data must never hold the case file back: a throw, a rejection or a stall becomes a short note.
    async function loadSessionRisk(userId) {
        let timer;
        const timeout = new Promise((resolve) => { timer = setTimeout(() => resolve({ data: null, error: { timedOut: true, message: 'timeout' } }), 8000); });
        try {
            return await Promise.race([Promise.resolve(state.client.rpc('titan_session_risk_v1', { p_user: userId, p_limit: 50 })), timeout]);
        } catch (e) {
            return { data: null, error: (e && typeof e === 'object') ? e : { message: String(e || 'unavailable') } };
        } finally {
            clearTimeout(timer);
        }
    }

    function sessionRiskMarkup(risk, error) {
        try {
            return sessionRiskMarkupUnsafe(risk, error);
        } catch (e) {
            return '<p><small>Analyse des séances illisible : réponse inattendue du serveur.</small></p>';
        }
    }

    function sessionRiskMarkupUnsafe(risk, error) {
        if (error) {
            const why = moderationUnavailable(error)
                ? 'migration 20261019180000_session_risk.sql non appliquée'
                : error.timedOut ? 'délai dépassé' : moderationErrorText(error);
            return `<p><small>Analyse des séances indisponible (${escapeHtml(why)}).</small></p>`;
        }
        if (!risk || !Array.isArray(risk.sessions)) return '<p><small>Analyse des séances illisible : réponse inattendue du serveur.</small></p>';
        const all = risk.sessions.filter((session) => session && typeof session === 'object');
        const flagged = all.filter((session) => session.state && session.state !== 'normal');
        const rule = risk?.rule ? `<p><small>${escapeHtml(risk.rule)}</small></p>` : '';
        const head = `<p><small>${escapeHtml(all.length)} séances analysées, ${escapeHtml(flagged.length)} à examiner ou surveiller.</small></p>`;
        if (!flagged.length) return `${head}${rule}<p>Aucune séance à examiner.</p>`;
        const rows = flagged.map((session) => `
            <tr>
                <td>${escapeHtml(session.sport)} · ${escapeHtml(session.value)} ${escapeHtml(session.unit)}<br><small>${escapeHtml(formatDate(session.date))}</small></td>
                <td>${moderationLevelBadge(session.state === 'critical' ? 'urgent' : session.state)}</td>
                <td>${escapeHtml(session.score)}</td>
                <td>${(Array.isArray(session.signals) ? session.signals.filter((signal) => signal && typeof signal === 'object') : []).map(sessionSignalText).join('<br>')}</td>
                <td>${session.excludedFromRankings ? 'Exclue des classements' : '—'}</td>
                <td>${session.id ? buttonMarkup(session.excludedFromRankings ? 'Rétablir dans les classements' : 'Exclure des classements', session.excludedFromRankings ? 'ri-arrow-go-back-line' : 'ri-forbid-line', 'secondary', `data-session-exclude="${escapeHtml(session.id)}" data-excluded="${session.excludedFromRankings ? 'true' : 'false'}"`) : ''}</td>
            </tr>`).join('');
        return `${head}${rule}${tableShell(`<table class="admin-table" data-session-risk-table aria-label="Séances à examiner"><thead><tr><th>Séance</th><th>État</th><th>Score</th><th>Signaux</th><th>Classement</th><th>Action</th></tr></thead><tbody>${rows}</tbody></table>`)}`;
    }

    function moderationPayloadText(payload) {
        const text = JSON.stringify(payload || {}, null, 2);
        return text.length > 1200 ? `${text.slice(0, 1200)}\n… (tronqué, ${text.length - 1200} caractères de plus)` : text;
    }

    function moderationSignalLine(signal) {
        return `<li><code>${escapeHtml(signal.reason)}</code> · ${escapeHtml(signal.severity)} · ×${escapeHtml(signal.count)} · +${escapeHtml(signal.points)} pt</li>`;
    }

    async function renderModeration() {
        const head = sectionHead('Modération', 'Comptes ayant des signaux ouverts, classés par risque. Aucune action n’est automatique : chaque décision est humaine, motivée et annulable.', [
            buttonMarkup('Actualiser', 'ri-refresh-line', 'secondary', 'data-refresh-current')
        ]) + `
            <form class="panel" data-moderation-lookup>
                <label class="form-field full">
                    <span>Retrouver un dossier par identifiant de compte (par exemple pour annuler une décision d’un compte sorti de la file)</span>
                    <input class="admin-input" name="user" type="text" autocomplete="off" spellcheck="false" placeholder="00000000-0000-0000-0000-000000000000" aria-label="Identifiant du compte">
                </label>
                ${buttonMarkup('Ouvrir le dossier', 'ri-folder-user-line', 'secondary', 'data-moderation-lookup-submit')}
            </form>`;
        const { data, error } = await state.client.rpc('titan_moderation_queue_v1', { p_limit: 100 });
        if (error) {
            let message;
            if (moderationUnavailable(error)) message = 'Le module de modération n’est pas disponible sur ce serveur : applique la migration 20261019150000_moderation_queue.sql.';
            else if (String(error.message || '').includes('ADMIN_ONLY')) message = 'Cette file est réservée aux administrateurs (rôle admin ou super_admin).';
            else throw error;
            $('#admin-view').innerHTML = `${head}<div class="panel empty-state"><p>${escapeHtml(message)}</p></div>`;
            return;
        }
        const entries = Array.isArray(data && data.entries) ? data.entries : [];
        state.rows.moderation = new Map(entries.map((entry) => [String(entry.user_id), entry]));
        if (!entries.length) {
            $('#admin-view').innerHTML = `${head}<div class="panel empty-state"><p>Aucun compte à examiner : aucun signal ouvert ces 30 derniers jours.</p></div>`;
            return;
        }
        const rows = entries.map((entry) => `
            <tr data-moderation-user="${escapeHtml(entry.user_id)}">
                <td><strong>${escapeHtml(entry.username || 'Sans nom')}</strong><br><small>${escapeHtml(shortId(entry.user_id))} · ${badge(entry.status || 'active')}</small></td>
                <td>${moderationLevelBadge(entry.level)}</td>
                <td><strong>${escapeHtml(entry.score)}</strong></td>
                <td><ul class="compact-list">${(entry.signals || []).map(moderationSignalLine).join('')}</ul></td>
                <td>${entry.last_decision ? `${escapeHtml(MODERATION_DECISION_LABELS[entry.last_decision.decision] || entry.last_decision.decision)}<br><small>${escapeHtml(formatDate(entry.last_decision.at))}</small>` : '<small>Aucune</small>'}</td>
                <td>${buttonMarkup('Dossier', 'ri-folder-user-line', 'secondary', `data-moderation-open="${escapeHtml(entry.user_id)}" aria-label="Ouvrir le dossier de ${escapeHtml(entry.username || 'ce compte')}"`)}</td>
            </tr>`).join('');
        $('#admin-view').innerHTML = `
            ${head}
            ${tableShell(`<table class="admin-table" data-moderation-queue aria-label="Comptes à examiner">
                <thead><tr><th>Compte</th><th>Niveau</th><th>Score</th><th>Signaux (raison · gravité · occurrences · points)</th><th>Dernière décision</th><th>Actions</th></tr></thead>
                <tbody>${rows}</tbody></table>`)}
        `;
    }

    // BOT06: a verification request is a message to the player (alert in Titan) with one answer; it changes nothing on the account.
    async function loadVerifications(userId) {
        try {
            const { data, error } = await state.client.rpc('titan_verification_list_v1', { p_status: 'any', p_user: userId, p_limit: 20 });
            if (error) return { available: false, requests: [], error };
            return { available: true, requests: Array.isArray(data && data.requests) ? data.requests.filter((request) => request && typeof request === 'object') : [] };
        } catch (error) {
            return { available: false, requests: [], error };
        }
    }

    const VERIFICATION_STATUS_LABELS = { open: 'En attente de réponse', answered: 'Réponse reçue', closed: 'Close' };

    function verificationMarkup(verifications) {
        if (!verifications.available) return '<p><small>Les demandes de vérification ne sont pas disponibles sur ce serveur.</small></p>';
        if (!verifications.requests.length) return '<p><small>Aucune demande.</small></p>';
        return `<ul class="compact-list">${verifications.requests.map((request) => `
            <li data-verification="${escapeHtml(request.id)}">
                <strong>${escapeHtml(VERIFICATION_STATUS_LABELS[request.status] || request.status)}</strong> · ${escapeHtml(formatDate(request.createdAt))}
                <p>${escapeHtml(request.message)}</p>
                ${request.answer ? `<p><em>Réponse du joueur (${escapeHtml(formatDate(request.answeredAt))}) : ${escapeHtml(request.answer)}</em></p>` : ''}
                ${request.status === 'closed' ? '' : buttonMarkup('Clore', 'ri-check-double-line', 'secondary', `data-verify-close="${escapeHtml(request.id)}"`)}
            </li>`).join('')}</ul>`;
    }

    async function requestVerification() {
        const userId = state.moderationUser;
        if (!userId) return;
        const message = await confirmSensitive({
            title: 'Demander une vérification',
            message: 'Le joueur verra ce message comme une alerte dans Titan et pourra y répondre une fois. Rien n’est décidé et son compte ne change pas. Ne mets pas de donnée de santé.',
            actionLabel: 'Envoyer la demande',
            requireReason: true,
            fieldLabel: 'Message au joueur (10 à 500 caractères)'
        });
        if (!message) {
            await openModerationCase(userId);
            return;
        }
        const { error } = await state.client.rpc('titan_verification_request_v1', { p_user: userId, p_message: message });
        if (error) notify('Demande refusée', moderationErrorText(error), 'danger');
        else notify('Demande envoyée', 'Le joueur la verra dans Titan. L’envoi est consigné dans le journal d’audit.', 'success');
        await openModerationCase(userId);
    }

    async function closeVerification(id) {
        const userId = state.moderationUser;
        if (!id || (!userId && $('#admin-modal').hidden === false)) return;
        const { error } = await state.client.rpc('titan_verification_close_v1', { p_id: Number(id) });
        if (error) notify('Clôture refusée', moderationErrorText(error), 'danger');
        else notify('Demande close', 'La clôture est consignée dans le journal d’audit.', 'success');
        if ($('#admin-modal').hidden && state.currentView === 'appeals') {
            try { await renderAppeals(); } catch (e) { notify('Actualisation impossible', 'La clôture est enregistrée ; actualise la file.', 'warning'); }
            return;
        }
        await openModerationCase(userId);
    }

    async function openModerationCase(userId) {
        const [{ data, error }, risk, verifications] = await Promise.all([
            state.client.rpc('titan_moderation_case_v1', { p_user: userId }),
            loadSessionRisk(userId),
            loadVerifications(userId)
        ]);
        if (error) {
            notify('Dossier indisponible', moderationErrorText(error), 'danger');
            return;
        }
        state.moderationUser = userId;
        const user = data.user || {};
        const banned = user.status === 'banned';
        const suspended = !banned && (user.is_suspended === true || user.status === 'suspended');
        const decisions = Array.isArray(data.decisions) ? data.decisions : [];
        const latest = decisions[0];
        const signals = (data.signals || []).map((signal) => `
            <tr><td><code>${escapeHtml(signal.reason)}</code></td><td>${escapeHtml(signal.severity)}</td><td>${escapeHtml(signal.count)}</td><td>${escapeHtml(signal.points)}</td><td>${escapeHtml(formatDate(signal.last_at))}</td></tr>`).join('');
        const recent = (data.signals_recent || []).map((signal) => `
            <div class="panel">
                <p><strong>${escapeHtml(signal.action_type)}</strong> · ${escapeHtml(signal.severity)} · ${badge(signal.status)} · ${escapeHtml(formatDate(signal.at))}</p>
                <p><code>${escapeHtml(signal.reason)}</code></p>
                <div class="json-preview">${escapeHtml(moderationPayloadText(signal.payload))}</div>
            </div>`).join('') || '<p><small>Aucun signal enregistré.</small></p>';
        const history = decisions.map((decision) => `
            <li>${escapeHtml(MODERATION_DECISION_LABELS[decision.decision] || decision.decision)} · ${escapeHtml(formatDate(decision.at))} · <em>${escapeHtml(decision.reason)}</em></li>`).join('') || '<li><small>Aucune décision.</small></li>';
        const actions = [
            buttonMarkup('Classer sans suite', 'ri-check-double-line', 'secondary', 'data-moderation-decide="dismiss"'),
            buttonMarkup('Surveiller', 'ri-eye-line', 'secondary', 'data-moderation-decide="watch"')
        ];
        // A ban is a decision taken elsewhere: neither suspending nor restoring it makes sense from this file.
        if (!banned) {
            actions.push(suspended
                ? buttonMarkup('Rétablir', 'ri-lock-unlock-line', 'primary', 'data-moderation-decide="restore"')
                : buttonMarkup('Suspendre', 'ri-lock-line', 'danger', 'data-moderation-decide="suspend"'));
        }
        if (verifications.available && !verifications.requests.some((request) => request.status === 'open')) {
            actions.push(buttonMarkup('Demander une vérification', 'ri-question-answer-line', 'secondary', 'data-verify-request'));
        }
        if (latest && latest.decision !== 'revert') {
            actions.push(buttonMarkup('Annuler la dernière décision', 'ri-arrow-go-back-line', 'secondary', `data-moderation-revert="${escapeHtml(latest.id)}"`));
        }
        openModal({
            title: user.username || 'Compte',
            kicker: `Dossier de modération · ${data.level || ''}`,
            body: `
                <div class="panel">
                    <p>Score <strong>${escapeHtml(data.score)}</strong> · ${moderationLevelBadge(data.level)} · statut ${badge(user.status || 'active')}</p>
                    ${banned ? '<p><small>Compte banni : le bannissement se lève hors de cette file. Tu peux toujours classer, surveiller ou annuler une décision.</small></p>' : ''}
                    <p><small>Score = somme, par raison, du poids de la gravité la plus haute (faible 1, moyenne 3, haute 8, critique 20) × min(occurrences, 3). Il ne dépend pas du volume d’entraînement. Seuls les signaux ouverts des 30 derniers jours comptent.</small></p>
                </div>
                <h3>Signaux qui composent le score</h3>
                ${signals ? tableShell(`<table class="admin-table"><thead><tr><th>Raison</th><th>Gravité</th><th>Occurrences</th><th>Points</th><th>Dernier</th></tr></thead><tbody>${signals}</tbody></table>`) : '<p><small>Aucun signal ouvert.</small></p>'}
                <h3>Séances à examiner</h3>
                <div data-session-risk>${sessionRiskMarkup(risk && risk.data, risk && risk.error ? risk.error : (!risk || !risk.data ? { message: 'empty' } : null))}</div>
                <h3>Derniers signaux bruts</h3>
                ${recent}
                <h3>Décisions</h3>
                <ul class="compact-list">${history}</ul>
                <h3>Demandes de vérification</h3>
                <div data-verification-list>${verificationMarkup(verifications)}</div>
            `,
            actions
        });
    }

    // ---------------------------------------------------------------------------------------------
    // Appeals (CHEAT19): players contest an excluded session or a suspension; a human accepts or declines with a note
    // the player can read (titan_appeal_*_v1). Accepting lifts the exclusion / suspension through the audited RPCs.
    // ---------------------------------------------------------------------------------------------
    const APPEAL_ERRORS = {
        ADMIN_ONLY: 'Cette action est réservée aux administrateurs.',
        REASON_REQUIRED: 'Indique une note d’au moins 3 caractères : le joueur la lira.',
        APPEAL_NOT_FOUND: 'Ce recours n’existe plus.',
        APPEAL_CLOSED: 'Ce recours a déjà été traité.',
        CANNOT_MODERATE_SELF: 'Tu ne peux pas traiter ton propre recours.',
        CANNOT_MODERATE_ADMIN: 'Un administrateur ne peut pas être modéré ici.',
        USE_ADMIN_PROFILE_TOOL: 'Un bannissement ou un compte supprimé ne se lève pas depuis cette file : utilise l’outil de profil, ou refuse le recours.',
        STATE_CHANGED: 'Il n’y a plus rien à lever (l’état a changé depuis le dépôt) : refuse le recours avec une note.',
        SESSION_NOT_FOUND: 'Cette séance n’existe plus.'
    };

    function appealErrorText(error) {
        const message = String((error && error.message) || error || '');
        const code = Object.keys(APPEAL_ERRORS).find((key) => message.includes(key));
        return code ? APPEAL_ERRORS[code] : (message || 'Erreur inconnue.');
    }

    async function renderAppeals() {
        const head = sectionHead('Recours et vérifications', 'Contestations déposées par les joueurs. Accepter lève l’exclusion ou la suspension ; refuser garde l’état. Dans les deux cas, ta note est lue par le joueur.', [
            buttonMarkup('Actualiser', 'ri-refresh-line', 'secondary', 'data-refresh-current')
        ]);
        const { data, error } = await state.client.rpc('titan_appeal_list_v1', { p_status: 'open', p_limit: 100 });
        if (error) {
            let message;
            if (moderationUnavailable(error)) message = 'Le module de recours n’est pas disponible sur ce serveur : applique la migration 20261019230000_appeals.sql.';
            else if (String(error.message || '').includes('ADMIN_ONLY')) message = 'Cette file est réservée aux administrateurs (rôle admin ou super_admin).';
            else throw error;
            $('#admin-view').innerHTML = `${head}<div class="panel empty-state"><p>${escapeHtml(message)}</p></div>`;
            return;
        }
        const appeals = Array.isArray(data && data.appeals) ? data.appeals : [];
        const answered = await answeredVerificationsMarkup();
        if (!appeals.length) {
            $('#admin-view').innerHTML = `${head}<div class="panel empty-state"><p>Aucun recours en attente.</p></div>${answered}`;
            return;
        }
        const rows = appeals.map((appeal) => {
            const target = appeal.kind === 'session'
                ? `Séance ${escapeHtml((appeal.session && appeal.session.sport) || '')} du ${escapeHtml(formatDate(appeal.session && appeal.session.date))}${appeal.session && appeal.session.excluded === false ? ' <small>(déjà rétablie)</small>' : ''}`
                : 'Suspension du compte';
            const id = escapeHtml(appeal.id);
            return `
            <tr data-appeal-row="${id}">
                <td><small>${escapeHtml(shortId(appeal.userId))}</small><br><small>${escapeHtml(formatDate(appeal.createdAt))}</small></td>
                <td>${target}</td>
                <td><div class="json-preview">${escapeHtml(appeal.message)}</div></td>
                <td>${buttonMarkup('Accepter', 'ri-check-line', 'primary', `data-appeal-decide="accept" data-appeal-id="${id}" aria-label="Accepter le recours ${id}"`)}
                    ${buttonMarkup('Refuser', 'ri-close-line', 'secondary', `data-appeal-decide="decline" data-appeal-id="${id}" aria-label="Refuser le recours ${id}"`)}</td>
            </tr>`;
        }).join('');
        $('#admin-view').innerHTML = `
            ${head}
            ${tableShell(`<table class="admin-table" data-appeal-queue aria-label="Recours en attente">
                <thead><tr><th>Joueur</th><th>Objet</th><th>Message du joueur</th><th>Décision</th></tr></thead>
                <tbody>${rows}</tbody></table>`)}
            ${answered}
        `;
    }

    // Players' answers to verification requests wait here until an administrator has read them and closes the request.
    async function answeredVerificationsMarkup() {
        let result;
        try { result = await state.client.rpc('titan_verification_list_v1', { p_status: 'answered', p_user: null, p_limit: 100 }); }
        catch (error) { result = { error }; }
        if (result.error) return '<h3>Réponses à des demandes de vérification</h3><p><small>Les demandes de vérification ne sont pas disponibles sur ce serveur.</small></p>';
        const list = Array.isArray(result.data && result.data.requests) ? result.data.requests.filter((request) => request && typeof request === 'object') : [];
        if (!list.length) return '<h3>Réponses à des demandes de vérification</h3><div class="panel empty-state"><p>Aucune réponse à lire.</p></div>';
        const rows = list.map((request) => `
            <tr data-verification="${escapeHtml(request.id)}">
                <td><small>${escapeHtml(shortId(request.userId))}</small><br><small>${escapeHtml(formatDate(request.answeredAt))}</small></td>
                <td><div class="json-preview">${escapeHtml(request.message)}</div></td>
                <td><div class="json-preview">${escapeHtml(request.answer)}</div></td>
                <td>${buttonMarkup('Dossier', 'ri-folder-user-line', 'secondary', `data-moderation-open="${escapeHtml(request.userId)}" aria-label="Ouvrir le dossier de ce joueur"`)}
                    ${buttonMarkup('Clore', 'ri-check-double-line', 'primary', `data-verify-close="${escapeHtml(request.id)}" aria-label="Clore la demande ${escapeHtml(request.id)}"`)}</td>
            </tr>`).join('');
        return `<h3>Réponses à des demandes de vérification</h3>${tableShell(`<table class="admin-table" data-verification-answers aria-label="Réponses de vérification à lire">
            <thead><tr><th>Joueur</th><th>Demande</th><th>Réponse</th><th>Suite</th></tr></thead><tbody>${rows}</tbody></table>`)}`;
    }

    // Feature flags (IDEA10, ADS17): switch an ad network, format, placement or a progressive roll-out on or off without a release.
    // The server returns each flag resolved per player; nothing in the app consumes a flag until a feature asks for one.
    const FLAG_ERRORS = {
        KEY_INVALID: 'Clé invalide : 3 à 49 caractères, minuscules, chiffres, point, tiret ou souligné, en commençant par une lettre.',
        ROLLOUT_INVALID: 'Le pourcentage doit être compris entre 0 et 100.',
        DESCRIPTION_TOO_LONG: 'La description fait au plus 200 caractères.',
        STATE_REQUIRED: 'Choisis activé ou désactivé.',
        FLAG_EXISTS: 'Ce drapeau existe déjà : modifie-le dans la liste.',
        FLAG_CHANGED: 'Ce drapeau a été modifié entre-temps : la liste est actualisée, vérifie puis recommence.',
        ADMIN_ONLY: 'Cette action est réservée aux administrateurs.'
    };

    async function renderFlags() {
        const head = sectionHead('Drapeaux de fonctionnalité', 'Active ou coupe une fonctionnalité sans nouvelle version. Un drapeau désactivé l’emporte sur la valeur par défaut de l’application ; un pourcentage inférieur à 100 ne concerne que des joueurs connectés, toujours les mêmes. Les clés sont publiques : n’y mets rien de sensible. Chaque changement est consigné.', [
            buttonMarkup('Actualiser', 'ri-refresh-line', 'secondary', 'data-refresh-current')
        ]);
        const { data, error } = await state.client.rpc('titan_admin_feature_flags_v1');
        if (error) {
            let message;
            if (moderationUnavailable(error)) message = 'Les drapeaux ne sont pas disponibles sur ce serveur : applique la migration 20261020050000_feature_flags.sql.';
            else if (String(error.message || '').includes('ADMIN_ONLY')) message = 'Cette page est réservée aux administrateurs (rôle admin ou super_admin).';
            else throw error;
            $('#admin-view').innerHTML = `${head}<div class="panel empty-state"><p>${escapeHtml(message)}</p></div>`;
            return;
        }
        const flags = Array.isArray(data && data.flags) ? data.flags.filter((flag) => flag && typeof flag === 'object') : [];
        const row = (flag) => `
            <tr data-flag-row data-flag-key="${escapeHtml(flag.key)}" data-flag-updated="${escapeHtml(flag.updatedAt || '')}">
                <td><code>${escapeHtml(flag.key)}</code><br><small>${escapeHtml(flag.description || '')}</small></td>
                <td><label><input type="checkbox" name="enabled"${flag.enabled ? ' checked' : ''} aria-label="Activé : ${escapeHtml(flag.key)}"> Activé</label></td>
                <td><input class="admin-input" name="rollout" type="number" min="0" max="100" step="1" value="${escapeHtml(flag.rollout)}" aria-label="Pourcentage de joueurs : ${escapeHtml(flag.key)}"> %</td>
                <td>${buttonMarkup('Enregistrer', 'ri-save-line', 'primary', `data-flag-save aria-label="Enregistrer le drapeau ${escapeHtml(flag.key)}"`)}</td>
            </tr>`;
        const create = `
            <tr data-flag-row data-flag-new>
                <td><input class="admin-input" name="key" type="text" autocomplete="off" spellcheck="false" placeholder="ads.web" aria-label="Clé du nouveau drapeau"><br>
                    <input class="admin-input" name="description" type="text" maxlength="200" placeholder="Description (facultatif)" aria-label="Description du nouveau drapeau"></td>
                <td><label><input type="checkbox" name="enabled" aria-label="Activé : nouveau drapeau"> Activé</label></td>
                <td><input class="admin-input" name="rollout" type="number" min="0" max="100" step="1" value="100" aria-label="Pourcentage de joueurs : nouveau drapeau"> %</td>
                <td>${buttonMarkup('Créer', 'ri-add-line', 'secondary', 'data-flag-save aria-label="Créer le drapeau"')}</td>
            </tr>`;
        $('#admin-view').innerHTML = `
            ${head}
            ${tableShell(`<table class="admin-table" data-flag-table aria-label="Drapeaux de fonctionnalité">
                <thead><tr><th>Drapeau</th><th>État</th><th>Joueurs concernés</th><th>Action</th></tr></thead>
                <tbody>${flags.map(row).join('')}${create}</tbody></table>`)}
            ${flags.length ? '' : '<p><small>Aucun drapeau pour l’instant : l’application garde ses valeurs par défaut.</small></p>'}
        `;
    }

    async function saveFlag(row) {
        if (!row) return;
        const isNew = row.hasAttribute('data-flag-new');
        const key = isNew ? String((row.querySelector('[name=key]') || {}).value || '').trim() : row.dataset.flagKey;
        const rolloutText = String((row.querySelector('[name=rollout]') || {}).value || '').trim();
        const rollout = Number(rolloutText);
        if (!key) { notify('Clé requise', FLAG_ERRORS.KEY_INVALID, 'warning'); return; }
        if (rolloutText === '' || !Number.isInteger(rollout) || rollout < 0 || rollout > 100) { notify('Pourcentage invalide', FLAG_ERRORS.ROLLOUT_INVALID, 'warning'); return; }
        const description = isNew ? String((row.querySelector('[name=description]') || {}).value || '').trim() : null;
        const { error } = await state.client.rpc('titan_admin_feature_flag_set_v1', {
            p_key: key,
            p_enabled: Boolean(row.querySelector('[name=enabled]').checked),
            p_rollout: rollout,
            p_description: description || null,
            p_expected_updated_at: isNew ? null : (row.dataset.flagUpdated || null),
            p_create: isNew
        });
        if (error) {
            const message = String((error && error.message) || '');
            const code = Object.keys(FLAG_ERRORS).find((candidate) => message.includes(candidate));
            notify('Drapeau refusé', code ? FLAG_ERRORS[code] : (message || 'Erreur inconnue.'), 'danger');
            if (code === 'FLAG_CHANGED' && state.currentView === 'flags') { try { await renderFlags(); } catch (e) { console.error('[TITAN ADMIN FLAGS]', e); } }
            return;
        }
        notify('Drapeau enregistré', 'Le changement est consigné dans le journal d’audit.', 'success');
        if (state.currentView !== 'flags') return;
        try { await renderFlags(); } catch (e) {
            console.error('[TITAN ADMIN FLAGS]', e);
            notify('Actualisation impossible', 'Le changement est enregistré ; actualise la page.', 'warning');
        }
    }


    // Votes and roadmap (COM-F3, COM-F4): create and close a poll, create or move an idea. Players only ever see the counts after the close.
    const CONSULTATION_ERRORS = {
        ADMIN_REQUIRED: 'Cette action est réservée aux administrateurs.',
        OPTIONS_2_TO_6: 'Un vote a entre deux et six options.',
        POLL_NOT_OPEN_OR_UNKNOWN: 'Ce vote est déjà clos ou n’existe plus.',
        STATUS_UNKNOWN: 'Statut inconnu.',
        ITEM_NOT_FOUND: 'Cette idée n’existe plus : actualise la page.',
        WEEK_MUST_START_MONDAY: 'Une quête commune commence un lundi.',
        WEEK_IN_THE_PAST: 'Cette semaine est déjà passée.',
        SEASON_OVERLAP: 'Cette saison chevauche une autre saison.',
        GOAL_OVERLAP: 'Cet objectif chevauche un autre objectif collectif.',
        BAD_PERIOD: 'La période doit durer de 1 jour à 13 semaines.',
        BAD_LEVELS: 'Les trois paliers doivent être croissants.',
        PERIOD_IN_THE_PAST: 'Cette période est déjà passée.',
        GOAL_STARTED_FROZEN: 'L’objectif a commencé : seul son texte peut changer.',
        SEASON_IN_THE_PAST: 'Cette saison est déjà terminée.',
        SEASON_STARTED_FROZEN: 'La saison a commencé : seules les règles peuvent changer.',
        QUEST_STARTED_FROZEN: 'La semaine a commencé : seul le texte peut changer.'
    };
    const IDEA_STATUS = { wish: 'Souhaité', study: 'À l’étude', planned: 'Planifié', doing: 'En chantier', shipped: 'Livré' };
    const POLL_STATE = { scheduled: 'Programmé', open: 'Ouvert', closed: 'Clos' };
    const consultationError = (error) => {
        const message = String((error && error.message) || '');
        const code = Object.keys(CONSULTATION_ERRORS).find((candidate) => message.includes(candidate));
        return code ? CONSULTATION_ERRORS[code] : (message || 'Erreur inconnue.');
    };
    const localInput = (date) => new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16);

    async function renderConsultations() {
        const head = sectionHead('Votes et idées', 'Un vote est une préférence, jamais une promesse. Les joueurs ne voient le résultat d’un vote qu’une fois clos ; le drapeau « screens.consultations » doit être actif pour que la Communauté les affiche.', [
            buttonMarkup('Actualiser', 'ri-refresh-line', 'secondary', 'data-refresh-current')
        ]);
        const [polls, ideas, quests, seasons, worldGoals, clubReports] = await Promise.all([state.client.rpc('titan_poll_admin_list_v1'), state.client.rpc('titan_roadmap_admin_list_v1'), state.client.rpc('titan_common_quest_admin_list_v1'), state.client.rpc('titan_season_admin_list_v1'), state.client.rpc('titan_world_goal_admin_list_v1'), state.client.rpc('titan_club_reports_admin_list_v1')]);
        const error = polls.error || ideas.error;
        if (error) {
            let message;
            if (moderationUnavailable(error)) message = 'Les votes ne sont pas disponibles sur ce serveur : applique la migration 20261029090000_community_consultations.sql.';
            else if (String(error.message || '').includes('ADMIN_REQUIRED')) message = 'Cette page est réservée aux administrateurs (rôle admin ou super_admin).';
            else throw error;
            $('#admin-view').innerHTML = `${head}<div class="panel empty-state"><p>${escapeHtml(message)}</p></div>`;
            return;
        }
        const now = new Date();
        const pollRows = (Array.isArray(polls.data) ? polls.data : []).map((p) => `
            <tr data-poll-row>
                <td><strong>${escapeHtml(p.title)}</strong><br><small>${escapeHtml(POLL_STATE[p.state] || p.state)} · du ${escapeHtml(new Date(p.opensAt).toLocaleString('fr-FR'))} au ${escapeHtml(new Date(p.closesAt).toLocaleString('fr-FR'))}</small></td>
                <td>${(p.options || []).map((o) => `${escapeHtml(o.label)} : <strong>${Number(o.votes) || 0}</strong>`).join('<br>')}</td>
                <td>${p.state === 'closed' ? '' : buttonMarkup('Clore maintenant', 'ri-stop-circle-line', 'secondary', `data-poll-close="${escapeHtml(p.id)}" aria-label="Clore le vote ${escapeHtml(p.title)}"`)}</td>
            </tr>`).join('');
        const createPollForm = `
            <form class="panel" data-poll-form aria-label="Créer un vote" novalidate>
                <h3>Nouveau vote</h3>
                <p><label>Question <input class="admin-input" name="title" maxlength="120" required></label></p>
                <p><label>Précision (facultatif) <input class="admin-input" name="detail" maxlength="600"></label></p>
                <p><label>Options, une par ligne (2 à 6)<br><textarea class="admin-input" name="options" rows="4" maxlength="600"></textarea></label></p>
                <p><label>Ouverture <input class="admin-input" type="datetime-local" name="opens" value="${escapeHtml(localInput(now))}"></label>
                   <label>Clôture <input class="admin-input" type="datetime-local" name="closes" value="${escapeHtml(localInput(new Date(now.getTime() + 7 * 86400000)))}"></label></p>
                ${buttonMarkup('Créer le vote', 'ri-add-line', 'primary', 'data-poll-create')}
            </form>`;
        const select = (current) => `<select class="admin-input" name="status" aria-label="Statut">${Object.entries(IDEA_STATUS).map(([k, v]) => `<option value="${k}"${k === current ? ' selected' : ''}>${v}</option>`).join('')}</select>`;
        const ideaRow = (i) => `
            <tr data-idea-row data-idea-id="${escapeHtml(i.id)}">
                <td><input class="admin-input" name="title" maxlength="100" value="${escapeHtml(i.title)}" aria-label="Titre"><br><input class="admin-input" name="detail" maxlength="500" value="${escapeHtml(i.detail || '')}" aria-label="Détail"></td>
                <td>${select(i.status)}<br><small>${Number(i.votes) || 0} soutien(s)</small></td>
                <td><input class="admin-input" name="sort" type="number" step="1" value="${Number(i.sortOrder) || 0}" aria-label="Ordre"> <label><input type="checkbox" name="archive"${i.archived ? ' checked' : ''}> Masquée</label></td>
                <td>${buttonMarkup('Enregistrer', 'ri-save-line', 'primary', `data-idea-save aria-label="Enregistrer l’idée ${escapeHtml(i.title)}"`)}</td>
            </tr>`;
        const newIdea = `
            <tr data-idea-row data-idea-new>
                <td><input class="admin-input" name="title" maxlength="100" placeholder="Nouvelle idée" aria-label="Titre de la nouvelle idée"><br><input class="admin-input" name="detail" maxlength="500" placeholder="Détail (facultatif)" aria-label="Détail de la nouvelle idée"></td>
                <td>${select('wish')}</td>
                <td><input class="admin-input" name="sort" type="number" step="1" value="0" aria-label="Ordre"></td>
                <td>${buttonMarkup('Ajouter', 'ri-add-line', 'secondary', 'data-idea-save aria-label="Ajouter l’idée"')}</td>
            </tr>`;
        $('#admin-view').innerHTML = `
            ${head}
            <h3>Votes</h3>
            ${pollRows ? tableShell(`<table class="admin-table" aria-label="Votes"><thead><tr><th>Vote</th><th>Voix par option</th><th>Action</th></tr></thead><tbody>${pollRows}</tbody></table>`) : '<p><small>Aucun vote pour l’instant.</small></p>'}
            ${createPollForm}
            <h3>Quête commune de la semaine</h3>
            ${commonQuestMarkup(quests)}
            <h3>Saisons de 28 jours</h3>
            ${seasonMarkup(seasons)}
            ${worldGoalMarkup(worldGoals)}
            ${clubReportsMarkup(clubReports)}
            <h3>Feuille de route</h3>
            ${tableShell(`<table class="admin-table" aria-label="Feuille de route"><thead><tr><th>Idée</th><th>Statut</th><th>Ordre</th><th>Action</th></tr></thead><tbody>${(Array.isArray(ideas.data) ? ideas.data : []).map(ideaRow).join('')}${newIdea}</tbody></table>`)}
            <p><small>Un statut n’est jamais une date. Passer une idée à « Livré » ferme les soutiens ; la masquer la retire de la liste des joueurs.</small></p>
        `;
    }

    function commonQuestMarkup(result) {
        if (result.error) return `<div class="panel empty-state"><p>${escapeHtml(moderationUnavailable(result.error) ? 'La quête commune n’est pas disponible sur ce serveur : applique la migration 20261029120000_common_quest.sql.' : consultationError(result.error))}</p></div>`;
        const rows = (Array.isArray(result.data) ? result.data : []).map((q) => `<tr><td>${escapeHtml(new Date(q.weekStart).toLocaleDateString('fr-FR'))}</td><td><strong>${escapeHtml(q.title)}</strong><br><small>${escapeHtml(q.detail || '')}</small></td><td>${Number(q.target) || 0} min</td><td>${Number(q.members) || 0}</td></tr>`).join('');
        const monday = new Date(); monday.setDate(monday.getDate() + ((8 - monday.getDay()) % 7 || 7));
        return `${rows ? tableShell(`<table class="admin-table" aria-label="Quêtes communes"><thead><tr><th>Semaine du</th><th>Quête</th><th>Objectif</th><th>Participants</th></tr></thead><tbody>${rows}</tbody></table>`) : '<p><small>Aucune quête commune pour l’instant.</small></p>'}
            <form class="panel" data-cq-form aria-label="Créer une quête commune" novalidate>
                <h3>Nouvelle quête commune</h3>
                <p><label>Semaine commençant le lundi <input class="admin-input" type="date" name="week" value="${escapeHtml(localInput(monday).slice(0, 10))}"></label>
                   <label>Objectif (minutes d’effort de tous) <input class="admin-input" type="number" name="target" min="100" max="1000000" step="50" value="1000"></label></p>
                <p><label>Titre <input class="admin-input" name="title" maxlength="100"></label></p>
                <p><label>Précision (facultatif) <input class="admin-input" name="detail" maxlength="400"></label></p>
                ${buttonMarkup('Créer la quête', 'ri-add-line', 'primary', 'data-cq-create')}
            </form>`;
    }

    const REPORT_REASONS = { spam: 'Spam', harassment: 'Harcèlement', inappropriate: 'Inapproprié', other: 'Autre' };
    function clubReportsMarkup(result) {
        if (result.error) return `<div class="panel empty-state"><p>${escapeHtml(moderationUnavailable(result.error) ? 'Les signalements de clubs ne sont pas disponibles sur ce serveur : applique la migration 20261030100000_club_reports.sql.' : consultationError(result.error))}</p></div>`;
        const list = Array.isArray(result.data) ? result.data : [];
        if (!list.length) return '<h3>Signalements de clubs</h3><p><small>Aucun signalement ouvert.</small></p>';
        const rows = list.map((r) => `<tr><td>${escapeHtml(new Date(r.at).toLocaleDateString('fr-FR'))}</td><td><strong>${escapeHtml(r.club)}</strong><br><small>${r.announcement ? '« ' + escapeHtml(r.announcement) + ' »' : 'Le club lui-même'}</small></td><td>${escapeHtml(REPORT_REASONS[r.reason] || r.reason)}${r.details ? '<br><small>' + escapeHtml(r.details) + '</small>' : ''}<br><small>${Number(r.sameTarget) || 1} signalement(s)</small></td><td>
            ${buttonMarkup('Ignorer', 'ri-close-line', 'secondary', `data-club-report-act="dismiss" data-report="${escapeHtml(r.id)}"`)}
            ${r.announcementId ? buttonMarkup('Retirer l’annonce', 'ri-delete-bin-line', 'secondary', `data-club-report-act="remove_announcement" data-report="${escapeHtml(r.id)}"`) : ''}
            ${buttonMarkup('Archiver le club', 'ri-archive-line', 'danger', `data-club-report-act="archive_club" data-report="${escapeHtml(r.id)}"`)}</td></tr>`).join('');
        return `<h3>Signalements de clubs</h3>${tableShell(`<table class="admin-table" aria-label="Signalements de clubs"><thead><tr><th>Date</th><th>Contenu</th><th>Motif</th><th>Décision</th></tr></thead><tbody>${rows}</tbody></table>`)}`;
    }

    async function resolveClubReport(id, action) {
        const archive = action === 'archive_club';
        const reason = await confirmSensitive({ title: action === 'dismiss' ? 'Ignorer ce signalement' : archive ? 'Archiver ce club' : 'Retirer cette annonce', message: archive ? 'Le club disparaît pour tous ses membres.' : action === 'dismiss' ? 'Le signalement est clos sans autre effet.' : 'L’annonce disparaît pour les membres du club.', actionLabel: 'Confirmer', danger: archive, requireReason: false });
        if (reason === null || reason === false || reason === undefined) return;
        const { error } = await state.client.rpc('titan_club_report_resolve_v1', { p_report: id, p_action: action, p_note: typeof reason === 'string' && reason ? reason : null });
        if (error) notify('Décision refusée', consultationError(error), 'danger'); else notify('Décision enregistrée', 'Le signalement est clos.', 'success');
        if (state.currentView === 'consultations') await renderConsultations();
    }

    function worldGoalMarkup(result) {
        if (result.error) return `<div class="panel empty-state"><p>${escapeHtml(moderationUnavailable(result.error) ? 'L’objectif collectif n’est pas disponible sur ce serveur : applique la migration 20261029170000_world_goal.sql.' : consultationError(result.error))}</p></div>`;
        const fr = (d) => new Date(d).toLocaleDateString('fr-FR');
        const rows = (Array.isArray(result.data) ? result.data : []).map((g) => `<tr><td>${escapeHtml(fr(g.startsOn))} – ${escapeHtml(fr(g.endsOn))}</td><td><strong>${escapeHtml(g.title)}</strong><br><small>${escapeHtml(g.detail || '')}</small></td><td>${(g.levels || []).map((v) => escapeHtml(Number(v).toLocaleString('fr-FR'))).join(' · ')} min</td><td>${Number(g.members) || 0}</td></tr>`).join('');
        const start = new Date(); start.setDate(start.getDate() + 1);
        return `${rows ? tableShell(`<table class="admin-table" aria-label="Objectifs collectifs"><thead><tr><th>Période</th><th>Objectif</th><th>Trois paliers</th><th>Participants</th></tr></thead><tbody>${rows}</tbody></table>`) : '<p><small>Aucun objectif collectif pour l’instant.</small></p>'}
            <form class="panel" data-wg-form aria-label="Créer un objectif collectif" novalidate>
                <h3>Nouvel objectif collectif</h3>
                <p><label>Début <input class="admin-input" type="date" name="starts" value="${escapeHtml(localInput(start).slice(0, 10))}"></label>
                   <label>Durée en semaines (1 à 13) <input class="admin-input" type="number" name="weeks" min="1" max="13" value="4"></label></p>
                <p><label>Palier 1 (min d’effort) <input class="admin-input" type="number" name="l1" min="100" step="50" value="5000"></label>
                   <label>Palier 2 <input class="admin-input" type="number" name="l2" min="150" step="50" value="15000"></label>
                   <label>Palier 3 <input class="admin-input" type="number" name="l3" min="200" step="50" value="40000"></label></p>
                <p><label>Titre <input class="admin-input" name="title" maxlength="100"></label></p>
                <p><label>Précision (facultatif) <input class="admin-input" name="detail" maxlength="400"></label></p>
                ${buttonMarkup('Créer l’objectif', 'ri-add-line', 'primary', 'data-wg-create')}
            </form>`;
    }

    async function createWorldGoal() {
        const form = document.querySelector('[data-wg-form]');
        if (!form) return;
        const value = (name) => String((form.querySelector(`[name=${name}]`) || {}).value || '').trim();
        const starts = value('starts'), weeks = Number(value('weeks')), l1 = Number(value('l1')), l2 = Number(value('l2')), l3 = Number(value('l3'));
        if (value('title').length < 3) { notify('Titre requis', 'Le titre fait au moins trois caractères.', 'warning'); return; }
        if (!/^\d{4}-\d{2}-\d{2}$/.test(starts)) { notify('Début', 'Choisis une date de début.', 'warning'); return; }
        if (!Number.isInteger(weeks) || weeks < 1 || weeks > 13) { notify('Durée', 'Entre 1 et 13 semaines.', 'warning'); return; }
        if (![l1, l2, l3].every(Number.isInteger) || !(l1 >= 100 && l1 < l2 && l2 < l3)) { notify('Paliers', 'Trois paliers croissants, le premier d’au moins 100 minutes.', 'warning'); return; }
        const end = new Date(starts + 'T12:00:00'); end.setDate(end.getDate() + weeks * 7 - 1);
        const ends = `${end.getFullYear()}-${String(end.getMonth() + 1).padStart(2, '0')}-${String(end.getDate()).padStart(2, '0')}`;
        const { error } = await state.client.rpc('titan_world_goal_admin_save_v1', { p_id: null, p_starts: starts, p_ends: ends, p_title: value('title'), p_detail: value('detail') || null, p_level1: l1, p_level2: l2, p_level3: l3 });
        if (error) { notify('Objectif refusé', consultationError(error), 'danger'); return; }
        notify('Objectif créé', 'Il apparaît au QG dès son début si le drapeau « screens.worldgoal » est actif.', 'success');
        if (state.currentView === 'consultations') await renderConsultations();
    }

    function seasonMarkup(result) {
        if (result.error) return `<div class="panel empty-state"><p>${escapeHtml(moderationUnavailable(result.error) ? 'Les saisons ne sont pas disponibles sur ce serveur : applique la migration 20261029140000_seasons.sql.' : consultationError(result.error))}</p></div>`;
        const rows = (Array.isArray(result.data) ? result.data : []).map((x) => `<tr><td>${escapeHtml(new Date(x.startsOn).toLocaleDateString('fr-FR'))} – ${escapeHtml(new Date(x.endsOn).toLocaleDateString('fr-FR'))}</td><td><strong>${escapeHtml(x.name)}</strong><br><small>${escapeHtml(x.rules || '')}</small></td><td>v${Number(x.rulesVersion) || 1}${x.closed ? ' · figée' : ''}</td><td>${Number(x.participants) || 0}</td></tr>`).join('');
        const monday = new Date(); monday.setDate(monday.getDate() + ((8 - monday.getDay()) % 7 || 7));
        return `${rows ? tableShell(`<table class="admin-table" aria-label="Saisons"><thead><tr><th>Période</th><th>Saison</th><th>Règles</th><th>Participants</th></tr></thead><tbody>${rows}</tbody></table>`) : '<p><small>Aucune saison pour l’instant.</small></p>'}
            <form class="panel" data-season-form aria-label="Créer une saison" novalidate>
                <h3>Nouvelle saison</h3>
                <p><label>Quatre semaines à partir du lundi <input class="admin-input" type="date" name="starts" value="${escapeHtml(localInput(monday).slice(0, 10))}"></label></p>
                <p><label>Nom <input class="admin-input" name="name" maxlength="80"></label></p>
                <p><label>Règles en une phrase (facultatif) <input class="admin-input" name="rules" maxlength="600"></label></p>
                ${buttonMarkup('Créer la saison', 'ri-add-line', 'primary', 'data-season-create')}
            </form>`;
    }

    async function createSeason() {
        const form = document.querySelector('[data-season-form]');
        if (!form) return;
        const value = (name) => String((form.querySelector(`[name=${name}]`) || {}).value || '').trim();
        const starts = value('starts');
        if (value('name').length < 3) { notify('Nom requis', 'Le nom fait au moins trois caractères.', 'warning'); return; }
        if (!/^\d{4}-\d{2}-\d{2}$/.test(starts) || new Date(starts + 'T12:00:00').getDay() !== 1) { notify('Début', 'Choisis un lundi.', 'warning'); return; }
        const { error } = await state.client.rpc('titan_season_admin_save_v1', { p_id: null, p_starts: starts, p_name: value('name'), p_rules: value('rules') || null });
        if (error) { notify('Saison refusée', consultationError(error), 'danger'); return; }
        notify('Saison créée', 'Elle apparaît au QG une semaine avant son début si le drapeau « screens.seasons » est actif.', 'success');
        if (state.currentView === 'consultations') await renderConsultations();
    }

    async function createCommonQuest() {
        const form = document.querySelector('[data-cq-form]');
        if (!form) return;
        const value = (name) => String((form.querySelector(`[name=${name}]`) || {}).value || '').trim();
        const week = value('week'), target = Number(value('target'));
        if (value('title').length < 3) { notify('Titre requis', 'Le titre fait au moins trois caractères.', 'warning'); return; }
        if (!/^\d{4}-\d{2}-\d{2}$/.test(week) || new Date(week + 'T12:00:00').getDay() !== 1) { notify('Semaine', 'Choisis un lundi.', 'warning'); return; }
        if (!Number.isInteger(target) || target < 100 || target > 1000000) { notify('Objectif', 'Entre 100 et 1 000 000 minutes.', 'warning'); return; }
        const { error } = await state.client.rpc('titan_common_quest_admin_save_v1', { p_id: null, p_week: week, p_title: value('title'), p_detail: value('detail') || null, p_target: target });
        if (error) { notify('Quête refusée', consultationError(error), 'danger'); return; }
        notify('Quête créée', 'Elle apparaît au QG le lundi si le drapeau « screens.commonquest » est actif.', 'success');
        if (state.currentView === 'consultations') await renderConsultations();
    }

    async function createPoll() {
        const form = document.querySelector('[data-poll-form]');
        if (!form) return;
        const value = (name) => String((form.querySelector(`[name=${name}]`) || {}).value || '').trim();
        const options = value('options').split('\n').map((x) => x.trim()).filter(Boolean);
        const opens = new Date(value('opens')), closes = new Date(value('closes'));
        if (value('title').length < 3) { notify('Question requise', 'La question fait au moins trois caractères.', 'warning'); return; }
        if (options.length < 2 || options.length > 6) { notify('Options', CONSULTATION_ERRORS.OPTIONS_2_TO_6, 'warning'); return; }
        if (!Number.isFinite(opens.getTime()) || !Number.isFinite(closes.getTime()) || closes <= opens || closes - opens > 60 * 86400000) { notify('Dates', 'La clôture suit l’ouverture, au plus 60 jours plus tard.', 'warning'); return; }
        const { error } = await state.client.rpc('titan_poll_admin_save_v1', { p_title: value('title'), p_detail: value('detail') || null, p_options: options, p_opens: opens.toISOString(), p_closes: closes.toISOString() });
        if (error) { notify('Vote refusé', consultationError(error), 'danger'); return; }
        notify('Vote créé', 'Il apparaît dans la Communauté à l’ouverture si le drapeau est actif.', 'success');
        if (state.currentView === 'consultations') await renderConsultations();
    }

    async function closePoll(id) {
        const reason = await confirmSensitive({ title: 'Clore ce vote', message: 'Les votes sont arrêtés et le résultat devient visible des joueurs.', actionLabel: 'Clore', danger: false, requireReason: false });
        if (reason === null || reason === false || reason === undefined) return;
        const { error } = await state.client.rpc('titan_poll_admin_close_v1', { p_poll: id });
        if (error) notify('Clôture refusée', consultationError(error), 'danger'); else notify('Vote clos', 'Le résultat est visible des joueurs.', 'success');
        if (state.currentView === 'consultations') await renderConsultations();
    }

    async function saveIdea(row) {
        if (!row) return;
        const value = (name) => String((row.querySelector(`[name=${name}]`) || {}).value || '').trim();
        if (value('title').length < 3) { notify('Titre requis', 'Le titre fait au moins trois caractères.', 'warning'); return; }
        const sort = Number(value('sort'));
        const { error } = await state.client.rpc('titan_roadmap_admin_save_v1', {
            p_id: row.hasAttribute('data-idea-new') ? null : row.dataset.ideaId,
            p_title: value('title'), p_detail: value('detail') || null, p_status: value('status'),
            p_sort: Number.isInteger(sort) ? sort : 0,
            p_archive: Boolean((row.querySelector('[name=archive]') || {}).checked)
        });
        if (error) { notify('Idée refusée', consultationError(error), 'danger'); return; }
        notify('Idée enregistrée', 'Le changement de statut est gardé dans son historique.', 'success');
        if (state.currentView === 'consultations') await renderConsultations();
    }


    // Pionnier badge (COM-D1): the announced rule lists the candidates, the administrator grants from the list. Never automatic, never bought.
    const PIONEER_ERRORS = {
        ADMIN_REQUIRED: 'Cette action est réservée aux administrateurs.',
        CRITERIA_INVALID: 'Indique une date et au moins une séance.',
        ACCOUNT_NOT_ELIGIBLE: 'Ce compte est suspendu ou n’existe plus.'
    };
    const pioneerError = (error) => {
        const message = String((error && error.message) || '');
        const code = Object.keys(PIONEER_ERRORS).find((candidate) => message.includes(candidate));
        return code ? PIONEER_ERRORS[code] : (message || 'Erreur inconnue.');
    };

    async function renderPioneers() {
        const head = sectionHead('Pionniers', 'Une cohorte fondatrice aux critères annoncés. Le badge est permanent, ne s’achète pas et ne donne ni XP, ni crédits, ni avantage. Tu attribues toi-même depuis la liste : rien n’est automatique.', [
            buttonMarkup('Actualiser', 'ri-refresh-line', 'secondary', 'data-refresh-current')
        ]);
        const { data, error } = await state.client.rpc('titan_pioneer_list_v1');
        if (error) {
            let message;
            if (moderationUnavailable(error)) message = 'Le badge n’est pas disponible sur ce serveur : applique la migration 20261029100000_pioneer_badge.sql.';
            else if (String(error.message || '').includes('ADMIN_REQUIRED')) message = 'Cette page est réservée aux administrateurs (rôle admin ou super_admin).';
            else throw error;
            $('#admin-view').innerHTML = `${head}<div class="panel empty-state"><p>${escapeHtml(message)}</p></div>`;
            return;
        }
        const holders = (Array.isArray(data) ? data : []).map((h) => `
            <tr><td>${escapeHtml(h.username || h.id)}</td><td>${escapeHtml(h.cohort)}</td><td>${escapeHtml(new Date(h.grantedAt).toLocaleDateString('fr-FR'))}</td>
                <td>${buttonMarkup('Retirer', 'ri-close-line', 'secondary', `data-pioneer-revoke="${escapeHtml(h.id)}" aria-label="Retirer le badge de ${escapeHtml(h.username || h.id)}"`)}</td></tr>`).join('');
        $('#admin-view').innerHTML = `
            ${head}
            <form class="panel" data-pioneer-form aria-label="Chercher des candidats" novalidate>
                <h3>Règle annoncée</h3>
                <p><label>Comptes créés avant le <input class="admin-input" type="date" name="before"></label>
                   <label>Au moins <input class="admin-input" type="number" name="sessions" min="1" max="1000" step="1" value="3"> séances confirmées</label>
                   <label>Nom de la cohorte <input class="admin-input" name="cohort" maxlength="40" value="Fondateurs 2026"></label></p>
                ${buttonMarkup('Chercher les candidats', 'ri-search-line', 'primary', 'data-pioneer-find')}
                <div data-pioneer-candidates aria-live="polite"></div>
            </form>
            <h3>Détenteurs</h3>
            ${holders ? tableShell(`<table class="admin-table" aria-label="Détenteurs du badge Pionnier"><thead><tr><th>Compte</th><th>Cohorte</th><th>Depuis</th><th>Action</th></tr></thead><tbody>${holders}</tbody></table>`) : '<p><small>Aucun badge attribué pour l’instant.</small></p>'}
        `;
    }

    async function findPioneers() {
        const form = document.querySelector('[data-pioneer-form]');
        if (!form) return;
        const before = new Date(String((form.querySelector('[name=before]') || {}).value || ''));
        const sessions = Number((form.querySelector('[name=sessions]') || {}).value);
        const box = form.querySelector('[data-pioneer-candidates]');
        if (!Number.isFinite(before.getTime()) || !Number.isInteger(sessions) || sessions < 1) { notify('Critères', PIONEER_ERRORS.CRITERIA_INVALID, 'warning'); return; }
        const { data, error } = await state.client.rpc('titan_pioneer_candidates_v1', { p_before: before.toISOString(), p_min_sessions: sessions });
        if (error) { notify('Recherche refusée', pioneerError(error), 'danger'); return; }
        const list = Array.isArray(data) ? data : [];
        box.innerHTML = list.length
            ? `<ul style="list-style:none;padding:0;margin:8px 0">${list.map((c) => `<li><label><input type="checkbox" name="candidate" value="${escapeHtml(c.id)}"> ${escapeHtml(c.username || c.id)} <small>· créé le ${escapeHtml(new Date(c.createdAt).toLocaleDateString('fr-FR'))} · ${Number(c.sessions) || 0} séances</small></label></li>`).join('')}</ul>
               ${buttonMarkup('Attribuer aux comptes cochés', 'ri-flag-line', 'primary', 'data-pioneer-grant')}${list.length >= 200 ? '<p><small>Liste limitée à 200 comptes : attribue puis relance la recherche.</small></p>' : ''}`
            : '<p><small>Aucun compte ne correspond (ou tous ont déjà le badge).</small></p>';
    }

    async function grantPioneers() {
        const form = document.querySelector('[data-pioneer-form]');
        if (!form) return;
        const ids = [...form.querySelectorAll('[name=candidate]:checked')].map((x) => x.value);
        const cohort = String((form.querySelector('[name=cohort]') || {}).value || '').trim();
        if (!ids.length) { notify('Aucun compte coché', 'Coche les comptes à honorer.', 'warning'); return; }
        if (cohort.length < 3) { notify('Cohorte', 'Le nom de la cohorte fait au moins trois caractères.', 'warning'); return; }
        const ok = await confirmSensitive({ title: 'Attribuer le badge Pionnier', message: `${ids.length} compte(s) recevront le badge « ${cohort} ». Il est permanent et sans avantage.`, actionLabel: 'Attribuer', danger: false, requireReason: false });
        if (ok === null || ok === false || ok === undefined) return;
        let granted = 0, failed = 0;
        for (const id of ids) {
            const { error } = await state.client.rpc('titan_pioneer_grant_v1', { p_user: id, p_cohort: cohort });
            if (error) failed++; else granted++;
        }
        notify('Badge attribué', `${granted} compte(s) honoré(s)${failed ? `, ${failed} refusé(s)` : ''}.`, failed ? 'warning' : 'success');
        if (state.currentView === 'pioneers') await renderPioneers();
    }

    async function revokePioneer(id) {
        const ok = await confirmSensitive({ title: 'Retirer le badge', message: 'Le joueur perd son badge Pionnier. Tu pourras le lui rendre depuis la liste des candidats si la règle le permet.', actionLabel: 'Retirer', danger: true, requireReason: false });
        if (ok === null || ok === false || ok === undefined) return;
        const { error } = await state.client.rpc('titan_pioneer_revoke_v1', { p_user: id });
        if (error) notify('Retrait refusé', pioneerError(error), 'danger'); else notify('Badge retiré', 'Le joueur ne le voit plus.', 'success');
        if (state.currentView === 'pioneers') await renderPioneers();
    }

    async function decideAppeal(appealId, accept) {
        const id = Number(appealId);
        if (!Number.isSafeInteger(id)) return;
        const reason = await moderationAsk(
            accept ? 'Accepter ce recours' : 'Refuser ce recours',
            accept ? 'L’exclusion ou la suspension est levée. Le joueur lira ta note.' : 'L’état reste inchangé. Le joueur lira ta note et pourra redéposer un recours après 7 jours.',
            accept ? 'Accepter' : 'Refuser',
            false);
        if (!reason) return;
        const { error } = await state.client.rpc('titan_appeal_decide_v1', { p_id: id, p_accept: accept, p_note: reason });
        if (error) notify('Décision refusée', appealErrorText(error), 'danger');
        else notify('Recours traité', accept ? 'Accepté' : 'Refusé', 'success');
        // The decision is recorded when this runs: repaint only if the administrator is still on this screen.
        if (state.currentView !== 'appeals') return;
        try { await renderAppeals(); } catch (e) {
            console.error('[TITAN ADMIN APPEALS]', e);
            notify('Actualisation impossible', 'La décision est enregistrée ; actualise la file.', 'warning');
        }
    }

    async function moderationAsk(title, message, actionLabel, danger) {
        const reason = await confirmSensitive({ title, message, actionLabel, danger, requireReason: true });
        return reason || null;
    }

    async function decideModeration(decision) {
        const userId = state.moderationUser;
        const labels = {
            dismiss: ['Classer sans suite', 'Les signaux ouverts de ce compte seront marqués comme examinés. Tu pourras annuler.', false],
            watch: ['Surveiller ce compte', 'Une surveillance est consignée. Elle ne change rien pour le joueur.', false],
            suspend: ['Suspendre ce compte', 'Le joueur ne pourra plus enregistrer de séance ni acheter. Sa progression n’est pas modifiée et tu pourras rétablir le compte.', true],
            restore: ['Rétablir ce compte', 'Le compte retrouve son fonctionnement normal.', false]
        };
        const [title, message, danger] = labels[decision] || [];
        if (!userId || !title) return;
        const reason = await moderationAsk(title, message, title, danger);
        if (!reason) {
            await openModerationCase(userId);
            return;
        }
        const { error } = await state.client.rpc('titan_moderation_decide_v1', { p_user: userId, p_decision: decision, p_reason: reason });
        if (error) notify('Décision refusée', moderationErrorText(error), 'danger');
        else notify('Décision enregistrée', MODERATION_DECISION_LABELS[decision] || decision, 'success');
        await refreshModeration(userId);
    }

    // The decision is already recorded when this runs: a failed refresh must say so, not hide it, and must not
    // repaint a screen the administrator has since left.
    async function refreshModeration(userId) {
        if (state.currentView !== 'moderation') return;
        try {
            await renderModeration();
            await openModerationCase(userId);
        } catch (error) {
            console.error('[TITAN ADMIN MODERATION]', error);
            notify('Actualisation impossible', 'La décision est enregistrée ; actualise la file pour voir son effet.', 'warning');
        }
    }

    // A human decision on one session: it stays visible to its owner, only rankings and competitive rewards skip it.
    async function excludeSession(sessionId, currentlyExcluded) {
        const userId = state.moderationUser;
        if (!userId || !sessionId) return;
        const exclude = !currentlyExcluded;
        const reason = await moderationAsk(
            exclude ? 'Exclure cette séance des classements' : 'Rétablir cette séance dans les classements',
            exclude
                ? 'La séance reste visible du joueur ; elle ne compte plus dans les classements ni les récompenses compétitives le temps de la vérification. Ses XP et crédits déjà acquis ne changent pas. Tu pourras la rétablir.'
                : 'La séance recompte dans les classements et les récompenses compétitives.',
            exclude ? 'Exclure' : 'Rétablir',
            exclude
        );
        if (!reason) {
            await openModerationCase(userId);
            return;
        }
        const { data, error } = await state.client.rpc('titan_session_exclusion_v1', { p_session: sessionId, p_excluded: exclude, p_reason: reason });
        if (error) notify('Action refusée', moderationErrorText(error), 'danger');
        else if (data && data.changed === false) notify('Aucun changement', 'La séance était déjà dans cet état.', 'info');
        else notify(exclude ? 'Séance exclue' : 'Séance rétablie', 'L’action est consignée dans le journal d’audit.', 'success');
        await openModerationCase(userId);
    }

    async function revertModeration(decisionId) {
        const userId = state.moderationUser;
        if (!userId || !decisionId) return;
        const reason = await moderationAsk('Annuler la dernière décision', 'Le compte revient à l’état d’avant cette décision, si rien ne l’a modifié depuis. L’annulation est elle-même consignée.', 'Annuler la décision', false);
        if (!reason) {
            await openModerationCase(userId);
            return;
        }
        const { data, error } = await state.client.rpc('titan_moderation_revert_v1', { p_decision_id: Number(decisionId), p_reason: reason });
        if (error) notify('Annulation refusée', moderationErrorText(error), 'danger');
        else if (data && Number(data.expected) > Number(data.reopened)) notify('Décision annulée en partie', `${data.reopened} signal(aux) rouvert(s) sur ${data.expected} : les autres ont été modifiés ailleurs.`, 'warning');
        else notify('Décision annulée', 'L’annulation est consignée.', 'success');
        await renderModeration();
        await openModerationCase(userId);
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
        if (state.pendingConfirm) {
            const settle = state.pendingConfirm;
            state.pendingConfirm = null;
            settle(false);
        }
        $('#admin-modal').hidden = true;
        $('#modal-body').innerHTML = '';
        $('#modal-actions').innerHTML = '';
    }

    function confirmSensitive({ title, message, actionLabel = 'Confirmer', danger = false, requireReason = false, fieldLabel = 'Raison' }) {
        return new Promise((resolve) => {
            // Closing the dialog any other way (cross, backdrop) is a cancellation, never a pending promise.
            state.pendingConfirm = resolve;
            openModal({
                title,
                kicker: 'Confirmation',
                body: `
                    <div class="panel">
                        <p>${escapeHtml(message)}</p>
                        <label class="form-field full">
                            <span>${escapeHtml(fieldLabel)}</span>
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
            };
            $('[data-confirm-ok]').onclick = () => {
                const reason = $('[data-confirm-reason]').value.trim();
                if (requireReason && !reason) {
                    notify('Raison requise', 'Indique une raison avant de confirmer.', 'warning');
                    return;
                }
                state.pendingConfirm = null;
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
