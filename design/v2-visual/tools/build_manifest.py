"""Builds docs/v2/visual-asset-manifest.json: the machine-readable register of A1 bis.
- needs: the catalogue of visual needs (priority, impact, costs, risk, reuse, status);
- screens: every screen of the inventory (main + unmerged branches) with its current assets, defects, what to keep, needs;
- assets: every file produced (objects, SVG, motion, demo, boards), with format, size, bytes, sha256, licence, provenance,
  status and planned location; plus the existing approved art with a keep/flag decision.
Run from the repo root: python3 design/v2-visual/tools/build_manifest.py"""
import json, os, hashlib, glob, re
ROOT = os.getcwd()
V = 'design/v2-visual'
def sha(p): return hashlib.sha256(open(p, 'rb').read()).hexdigest()
def rel(p): return os.path.relpath(p, ROOT)
inv = json.load(open(f'{V}/audit/screens-inventory.json'))
exp = {r['id']: r for r in json.load(open(f'{V}/exports/export-report.json'))}

LIC = 'Original TITAN work produced in this session (procedural geometry / hand-written SVG / CSS). No third-party asset, no AI image generator. Owner: TITAN.'
STATUS_LEVELS = ['planned', 'produced', 'exported', 'demo-integrated', 'device-tested', 'merged', 'published']

NEEDS = {
 'N01': dict(name='Compteur de pas visible au premier écran du QG', priority='P1', impact=5, prodCost=1, runtimeCost=1, risk=2, reuse=3, status='demo-integrated',
            produced=['svg/icons/ic-steps.svg', 'demo/habillage.css (.v2-steps)', 'android/V2Habillage.tsx (V2StepsRow)', 'motion m03'], note='Aujourd’hui replié dans « Autour de ta pratique » (web) ; carte anneau sur Android. Proposition : une ligne du bandeau d’état, 44 px.'),
 'N02': dict(name='Objet posé sur la dalle principale (QG, mission Aventure) — grand écran', priority='P1', impact=4, prodCost=2, runtimeCost=1, risk=2, reuse=4, status='demo-integrated',
            produced=['objects beacon-lit, stopwatch, record-medal, buoy/anvil/veilleur-stone/aurora-beacon-lit'], note='Masqué < 960 px : sur téléphone l’objet repoussait l’action sous la barre d’onglets (régression détectée puis corrigée).'),
 'N03': dict(name='Famille d’états vides illustrés', priority='P1', impact=4, prodCost=2, runtimeCost=1, risk=1, reuse=5, status='demo-integrated',
            produced=['svg/empty-states/*.svg (12)'], note='Remplace le glyphe 24 px ; le texte natif reste. Démontré sur Journal, Records, Progrès (nouvel utilisateur).'),
 'N04': dict(name='Objets sans texte incrusté (coffre, relique, sceau)', priority='P2', impact=3, prodCost=2, runtimeCost=1, risk=2, reuse=3, status='demo-integrated',
            produced=['objects supply-chest, mastery-relic, exploration-seal, record-medal'], note='Les originaux portent « COFFRE DE RAVITAILLEMENT TACTIQUE », « RELIQUE DE MAÎTRISE », « SCEAU DE JALON D’EXPLORATION » : non traduisibles, illisibles à 96 px. Remplacement à arbitrer par le propriétaire (les originaux sont plus riches).'),
 'N05': dict(name='Vitrine des objets gagnés (Profil)', priority='P1', impact=4, prodCost=2, runtimeCost=1, risk=2, reuse=4, status='demo-integrated',
            produced=['demo/habillage.css (.v2-vitrine)', 'android/V2Habillage.tsx (V2Vitrine)'], note='Données de la démonstration = fixtures ; en produit, ne montrer que ce que le serveur confirme.'),
 'N06': dict(name='Objet du résultat de séance (famille sportive ou record)', priority='P1', impact=4, prodCost=1, runtimeCost=1, risk=2, reuse=4, status='demo-integrated',
            produced=['objects running-shoe, dumbbell, climbing-hold, ball, yoga-mat, record-medal', 'motion m04, m08']),
 'N07': dict(name='Identité des quatre mondes (matière, motif, objets-signatures)', priority='P2', impact=4, prodCost=3, runtimeCost=1, risk=2, reuse=4, status='produced',
            produced=['svg/motifs (4)', 'objects veilleur-stone, buoy, sea-chart, anvil, forge-gears, aurora-beacon-lit/dormant, beacon-lit/dormant, camp-tent'], note='Décors et vignettes peintes non produits (voir N15).'),
 'N08': dict(name='États de synchronisation (V1.6.1)', priority='P1', impact=4, prodCost=1, runtimeCost=1, risk=1, reuse=5, status='produced', produced=['svg/icons/ic-sync-*.svg (7)', 'motion m06']),
 'N09': dict(name='Provenance des séances (V1.6.2, V1.6.5)', priority='P1', impact=3, prodCost=1, runtimeCost=1, risk=1, reuse=5, status='produced', produced=['svg/icons/ic-source-*.svg (7)', 'objects gps-watch, logbook']),
 'N10': dict(name='Marqueurs GPS distincts (V1.7.7)', priority='P1', impact=3, prodCost=1, runtimeCost=1, risk=2, reuse=4, status='produced', produced=['svg/icons/ic-gps-*.svg (8)'], note='Forme avant couleur ; style de carte non traité (tuiles non configurées).'),
 'N11': dict(name='États de programme prévu/réalisé/décalé/proposé (V1.7.2, V1.9.1)', priority='P2', impact=3, prodCost=1, runtimeCost=1, risk=1, reuse=5, status='produced', produced=['svg/icons/ic-plan-*.svg (5)']),
 'N12': dict(name='Identité coopération (cordée, relais, club, rendez-vous, confidentialité)', priority='P2', impact=3, prodCost=2, runtimeCost=1, risk=1, reuse=4, status='produced', produced=['objects rope-carabiner, relay-baton, trophy', 'svg/icons/ic-coop-*.svg, ic-privacy-*.svg', 'svg/empty-states no-friend/no-group/no-challenge']),
 'N13': dict(name='Coaching professionnel (repères, états de programme)', priority='P2', impact=3, prodCost=2, runtimeCost=1, risk=1, reuse=3, status='produced', produced=['object stopwatch', 'svg/empty-states/empty-no-coach.svg', 'ic-plan-*']),
 'N14': dict(name='Micro-animations de feedback', priority='P1', impact=3, prodCost=2, runtimeCost=1, risk=2, reuse=4, status='produced', produced=['motion/lab.html m01–m08 + renders', 'Blender turntable record-medal'], note='SVGator : export animé refusé (offre gratuite).'),
 'N15': dict(name='Fonds de TITAN LIVE et scènes du Camp de base', priority='P2', impact=4, prodCost=5, runtimeCost=2, risk=3, reuse=2, status='planned', produced=[], note='Bloqué : peintures = générateur IA exclu ; voie gratuite proposée = paysages 3D Blender (relief, lumière) en vague 3, rendu hors machine du propriétaire.'),
 'N16': dict(name='Image du Camp de base', priority='P2', impact=3, prodCost=3, runtimeCost=1, risk=1, reuse=2, status='produced', produced=['object camp-tent'], note='Objet seul ; scène complète non faite.'),
 'N17': dict(name='Pages d’erreur, hors ligne, introuvable illustrées', priority='P2', impact=3, prodCost=1, runtimeCost=1, risk=1, reuse=5, status='produced', produced=['svg/states/state-error|offline|not-found|refused|locked|success|onboarding.svg']),
 'N18': dict(name='Objets rendus sur Android (aucun aujourd’hui)', priority='P1', impact=4, prodCost=1, runtimeCost=2, risk=2, reuse=5, status='produced', produced=['exports/objects/*.webp', 'android/V2Habillage.tsx'], note='Brouillon non compilé, non testé sur appareil.'),
 'N19': dict(name='Différenciation Champion / Titan / Légende', priority='P2', impact=3, prodCost=4, runtimeCost=1, risk=3, reuse=2, status='planned', produced=[], note='Blasons approuvés en production (df25ecd) conservés. Titan et Légende partagent le motif du château : proposer une silhouette propre à Légende (sommet, couronne) après accord.'),
 'N20': dict(name='Bibliothèque sportive 3D (≈260 sports)', priority='P3', impact=2, prodCost=5, runtimeCost=2, risk=2, reuse=3, status='produced', produced=['objects dumbbell, kettlebell, running-shoe, ball, yoga-mat, climbing-hold (masters de famille)'], note='260 glyphes vectoriels déjà en production (254 dessins propres) ; 60 pictos 3D approuvés issus de planches composites. Aucun remplissage pour atteindre un quota.'),
 'N21': dict(name='Pages publiques : même peinture réutilisée (valley-small × 12)', priority='P3', impact=2, prodCost=2, runtimeCost=1, risk=3, reuse=3, status='planned', produced=['boards/board-objects.webp'], note='Toucher au SEO seulement après B1 (bouclier SEO).'),
 'N22': dict(name='Modules facultatifs du QG : sept rangées identiques', priority='P2', impact=3, prodCost=1, runtimeCost=1, risk=1, reuse=4, status='produced', produced=['objects 64/128 px (logbook, rope-carabiner, exploration-seal, relay-baton, trophy, record-medal)'], note='Intégration proposée : objet 40 px par module, pas de nouvelle rangée.'),
 'N23': dict(name='Gardiens, peintures des mondes, avatars approuvés', priority='P3', impact=1, prodCost=0, runtimeCost=0, risk=1, reuse=5, status='keep', produced=[], note='Conservés. Défaut relevé : arches/ruines génériques dans les peintures ; non remplacées (pas d’alternative supérieure produite).'),
 'N24': dict(name='Carte de partage / story (partage V2)', priority='P3', impact=2, prodCost=2, runtimeCost=1, risk=1, reuse=3, status='planned', produced=[], note='Les objets 512 px sont prêts à servir de visuel de carte.'),
 'N25': dict(name='Entrée, connexion, onboarding', priority='P2', impact=3, prodCost=1, runtimeCost=1, risk=1, reuse=3, status='produced', produced=['svg/states/state-onboarding.svg', 'object titan-crest']),
}

def needs_for(sc):
    i, sp, g = sc['id'], sc.get('space', ''), ' '.join(sc.get('gaps', [])).lower()
    n = set()
    if i.endswith('-qg') or i == 'android-qg': n |= {'N01', 'N02', 'N22'}
    if 'empty' in g or 'text-only' in g or 'aucun' in g or 'no illustration' in g: n.add('N03')
    if any(k in i for k in ('journal', 'records', 'objectifs', 'goals', 'career', 'carriere', 'progres', 'community', 'communaute', 'coaching', 'coach', 'defi', 'events')): n.add('N03')
    if any(k in i for k in ('records', 'atelier', 'carriere', 'career')): n.add('N04')
    if i in ('web-profil', 'android-profil', 'web-carriere', 'android-career'): n.add('N05')
    if any(k in i for k in ('session-result', 'seance-nouvelle', 'android-seance', 'web-seance')): n.add('N06')
    if sp == 'aventure': n |= {'N07'}
    if any(k in i for k in ('aventure', 'adventure', 'world', 'sentiers')): n.add('N02' if i in ('web-aventure', 'android-aventure') else 'N07')
    if any(k in i for k in ('sync', 'pending', 'journal')): n.add('N08')
    if any(k in i for k in ('source', 'garmin', 'health', 'import', 'journal')): n.add('N09')
    if any(k in i for k in ('gps', 'route', 'lieux', 'places', 'sortie', 'parcours', 'live')): n.add('N10')
    if any(k in i for k in ('plan', 'prevoir', 'training-block', 'week-plan', 'coach')): n.add('N11')
    if any(k in i for k in ('cordee', 'club', 'community', 'communaute', 'events', 'defi', 'athlete')): n.add('N12')
    if 'coach' in i: n.add('N13')
    if any(k in i for k in ('qg', 'result', 'records', 'adventure', 'aventure', 'sync', 'pending', 'steps')): n.add('N14')
    if 'live' in i: n.add('N15')
    if 'camp' in i or 'chroniques' in i or 'chronicles' in i: n.add('N16')
    if any(k in i for k in ('error', '404', 'network', 'boundary')): n.add('N17')
    if i in ('android-qg', 'android-progres', 'android-seance', 'android-aventure', 'android-profil', 'android-records', 'android-atelier', 'android-career', 'android-session-result', 'android-world', 'android-camp', 'android-goals', 'android-journal'): n.add('N18')
    if any(k in i for k in ('carriere', 'career', 'profil')): n.add('N19')
    if any(k in i for k in ('sports', 'seance', 'sport')): n.add('N20')
    if sc.get('category') == 'public-seo' or i.startswith('public-'): n = {'N21'}
    if 'guardian' in i or 'gardien' in g: n.add('N23')
    if 'share' in i or 'card' in i: n.add('N24')
    if any(k in i for k in ('login', 'onboarding', 'signup', 'welcome', 'tour', 'forgot', 'update-password')): n.add('N25')
    if sc.get('category') in ('internal', 'admin') or i in ('web-admin', 'web-sys-core-override', 'android-preview-gallery', 'docs-design-captures', 'design-sport-icon-lots', 'design-proposed-gemini-20261117'): n = set()
    return sorted(n)

SIZE = {'N01': '44 px row (web), 48 dp (Android)', 'N02': '148–196 px object (≥960 px only)', 'N03': '160×120 SVG (≤46vw)', 'N04': '96/128 px', 'N05': '80–112 px per object',
        'N06': '72–132 px', 'N07': 'motif tile 320 px as mask; objects 128–256 px', 'N08': '14–18 px icon + word', 'N09': '14 px icon + word', 'N10': '24 px marker', 'N11': '24 px',
        'N12': '64–128 px objects, 24 px icons', 'N13': '96–128 px', 'N14': '120–640 ms', 'N15': '1080 px wide background', 'N16': '256–512 px', 'N17': '160×120 SVG', 'N18': '64–256 px WebP',
        'N19': '256–512 px crest', 'N20': '32–64 px glyph, 160 px 3D', 'N21': '1200×630 hero', 'N22': '40 px object', 'N23': '—', 'N24': '1080×1920 card', 'N25': '160×120 SVG'}

def screen_rows():
    out = []
    for sc in inv['screens']:
        nd = needs_for(sc)
        out.append({'id': sc['id'], 'platform': sc['platform'], 'status': sc['status'], 'space': sc['space'], 'route': sc['route'],
                    'currentAssets': sc.get('visualAssets', [])[:6], 'defects': sc.get('gaps', []), 'states': sc.get('states'),
                    'preserve': [a for a in sc.get('visualAssets', []) if re.search(r'ranks|renaissance|crest|sport-icons|program', a)][:4],
                    'needs': nd, 'integrationPoint': sc.get('sourceFiles', [])[:3], 'targetSize': {k: SIZE[k] for k in nd},
                    'priority': min([NEEDS[k]['priority'] for k in nd], default='—')})
    for br, v in inv['branches'].items():
        for sc in v['screens']:
            sc = dict(sc); sc.setdefault('platform', 'web' if sc['id'].startswith('web') else 'android')
            nd = needs_for(sc)
            out.append({'id': sc['id'], 'platform': sc['platform'], 'status': f'future-unmerged:{br}@{v["sha"][:10]}', 'space': sc.get('space'), 'route': sc.get('route'),
                        'currentAssets': sc.get('visualAssets', sc.get('visuals', []))[:6] if isinstance(sc.get('visualAssets', sc.get('visuals', [])), list) else [],
                        'defects': sc.get('gaps', sc.get('visualGaps', [])), 'needs': nd, 'integrationPoint': sc.get('sourceFiles', [])[:3],
                        'targetSize': {k: SIZE[k] for k in nd}, 'priority': min([NEEDS[k]['priority'] for k in nd], default='—'),
                        'note': 'Prepared for, not integrated: the branch is merged by A2, dressed by B2.'})
    return out

USE = {'record-medal': 'Records (en-tête), Résultat (record), vitrine Profil, QG dalle record', 'trophy': 'Défis, Duo, vitrine', 'week-pennant': 'Semaine tenue (QG, Progrès, vitrine)',
       'beacon-lit': 'QG dalle chapitre, Aventure balise allumée', 'beacon-dormant': 'Balise à venir', 'aurora-beacon-lit': 'Aurores : mécanique « relier les balises »', 'aurora-beacon-dormant': 'Aurores : balise non reliée',
       'buoy': 'Marées : relevé des bouées (indice)', 'sea-chart': 'Marées : carte des courants', 'forge-gears': 'Forges : ordonner les pièces', 'anvil': 'Forges : l’enclume qui chante (issue)',
       'veilleur-stone': 'Vallée : signe du Veilleur', 'camp-tent': 'Camp de base / Chroniques', 'logbook': 'Journal, Chroniques, rendez-vous', 'rope-carabiner': 'Cordée, Grande Cordée, amis',
       'relay-baton': 'Relais de cordée (V1.8.1/1.8.2)', 'stopwatch': 'Coaching, TITAN LIVE, QG dalle séance', 'gps-watch': 'Sources connectées, GPS', 'dumbbell': 'Famille force', 'kettlebell': 'Famille force (variante)',
       'running-shoe': 'Famille endurance', 'ball': 'Famille jeu', 'yoga-mat': 'Famille mobilité', 'climbing-hold': 'Famille technique', 'supply-chest': 'Atelier (proposition sans texte)',
       'mastery-relic': 'Maîtrise (proposition sans texte)', 'exploration-seal': 'Carnet d’exploration (proposition sans texte)', 'titan-crest': 'Identité, entrée, planches', 'titan-crest-amber': 'Record / rareté (identité)'}

def assets():
    out = []
    prod = {}
    for l in open(f'{V}/blender/production-log.jsonl'):
        r = json.loads(l); prod.setdefault(r['id'], []).append(r)
    for oid, r in sorted(exp.items()):
        blend = f'{V}/blender/masters/{oid}.blend'; glb = f'{V}/blender/glb/{oid}.glb'; png = f'{V}/exports/masters-png/{r["master"]}'
        out.append({'id': f'obj.{oid}', 'kind': 'object-3d', 'category': prod.get(oid, [{}])[0].get('family'), 'variant': prod.get(oid, [{}])[0].get('sub'), 'version': 'v1',
                    'use': USE.get(oid), 'status': 'exported', 'licence': LIC,
                    'provenance': {'tool': 'Blender 5.0.1 (bpy, Python 3.11) in the cloud container', 'engine': 'Cycles CPU, 3 threads, adaptive, OIDN denoise', 'samples': [x.get('samples') for x in prod.get(oid, [])],
                                   'script': f'{V}/blender/produce.py + objects/library.py', 'render_s': [x.get('render_s') for x in prod.get(oid, [])]},
                    'master': {'blend': blend if os.path.exists(blend) else None, 'blend_sha256': sha(blend) if os.path.exists(blend) else None,
                               'glb': glb if os.path.exists(glb) else None, 'glb_bytes': os.path.getsize(glb) if os.path.exists(glb) else None,
                               'png': png, 'png_px': r['master_px'], 'png_sha256': sha(png)},
                    'exports': [{'path': f'{V}/exports/objects/{e["file"]}', 'format': 'webp', 'px': e['px'], 'bytes': e['bytes'], 'sha256': e['sha256'],
                                 'budget_ok': e['bytes'] <= (20480 if e['px'] <= 128 else 122880 if e['px'] <= 512 else 204800)} for e in r['exports']],
                    'alpha': 'real alpha, shadow faded to 0 at edges (corners ' + str(r['corner_alpha']) + ')',
                    'plannedLocation': {'web': f'assets/v2/objects/{oid}-{{64,128,256,512}}.webp', 'android': f'mobile/assets/v2/{oid}-{{128,256}}.webp'}})
    for p in sorted(glob.glob(f'{V}/svg/*/*.svg')):
        kind = p.split('/')[-2]
        out.append({'id': f'svg.{os.path.basename(p)[:-4]}', 'kind': {'empty-states': 'empty-state', 'states': 'system-state', 'icons': 'icon', 'motifs': 'world-motif'}[kind], 'version': 'v1',
                    'status': 'demo-integrated' if kind in ('empty-states', 'states') and any(k in p for k in ('no-session', 'no-record', 'no-result')) else 'produced',
                    'path': p, 'format': 'svg', 'bytes': os.path.getsize(p), 'sha256': sha(p), 'budget_ok': os.path.getsize(p) <= 10240, 'licence': LIC,
                    'provenance': f'{V}/svg/src/build_svg.py', 'plannedLocation': {'web': 'inline SVG through a TitanArt helper or /assets/v2/svg/', 'android': 'react-native-svg SvgXml'}})
    for p in sorted(glob.glob(f'{V}/motion/renders/*')):
        out.append({'id': f'motion.{os.path.basename(p)}', 'kind': 'motion-proof', 'path': p, 'bytes': os.path.getsize(p), 'sha256': sha(p), 'status': 'produced', 'licence': LIC,
                    'provenance': f'{V}/motion/lab.html recorded by {V}/tools/record-motion.mjs (Chromium) or Blender turntable.py'})
    for p in [f'{V}/remotion/renders/titan-v2-board.mp4', f'{V}/boards/board-objects.webp', f'{V}/motion/svgator/m02-quest-validated.static-export.svg', f'{V}/threejs/proof/gallery-desktop.png', f'{V}/threejs/proof/gallery-phone.png']:
        out.append({'id': f'deliverable.{os.path.basename(p)}', 'kind': 'deliverable', 'path': p, 'bytes': os.path.getsize(p), 'sha256': sha(p), 'status': 'produced', 'licence': LIC + (' Remotion: free licence for individuals / companies ≤ 3 people (to confirm by the owner).' if 'mp4' in p else '')})
    return out

EXISTING = [
 {'path': 'assets/ranks/*-{256,512}.webp', 'what': '7 crests', 'decision': 'keep', 'why': 'Approved family (steel, teal inlay, gold on the three highest). Titan and Légende share the castle motif: P2 note N19.'},
 {'path': 'assets/renaissance/{valley,archipelago,forge,aurora}*.webp', 'what': '4 world paintings', 'decision': 'keep', 'why': 'Approved; generic arches/ruins noted, no superior replacement produced.'},
 {'path': 'assets/renaissance/guardian-*.webp', 'what': '4 guardians', 'decision': 'keep', 'why': 'Used by V1.5.1–V1.5.3 scenes; approved.'},
 {'path': 'assets/renaissance/{scout,ranger,keeper,artisan,navigator,sentinel}*.webp', 'what': '6 avatars', 'decision': 'keep; 5 full-size files unused', 'why': 'Contemporary explorers, credible; only -s variants are referenced.'},
 {'path': 'assets/objects/{coffre-tactique,relique-maitrise,sceau-exploration}-*.webp', 'what': '3 objects with embedded text', 'decision': 'flag (N04)', 'why': 'Embedded French text: not translatable, unreadable at 96 px. Text-free proposals produced; owner arbitrates.'},
 {'path': 'image/boss, image/avatar, image/mob', 'what': '100 legacy images, 134 MB', 'decision': 'flag: unused by current UI (legacy js/ui.js, state.js)', 'why': 'Shipped in the build; removal is a B1/B2 + SEO decision, not done here.'},
 {'path': 'design/titan-visual-library/global-v2/proposed/*', 'what': 'Drive « Gemini » candidates', 'decision': 'not reused', 'why': 'AI-generated (registry says so); this mission excludes AI imagery.'},
 {'path': 'design/titan-visual-library/sports/lot-01, lot-02', 'what': '60 approved 3D sport pictograms (160 px, from composite boards)', 'decision': 'keep as approved reference', 'why': 'No editable master; not enlarged.'},
 {'path': 'js/app/sport-icons.js', 'what': '257 sport glyphs + 5 family marks', 'decision': 'keep', 'why': 'Production system with rules; the new icons follow its grid and stroke.'},
]

manifest = {
 'schema': 'titan.visual-asset-manifest/1', 'mission': 'A1 bis — Habillage graphique global', 'baseSha': inv['baseSha'],
 'statusLevels': STATUS_LEVELS,
 'note': 'Status is the highest level reached: nothing here is device-tested, merged or published.',
 'needs': NEEDS, 'screens': screen_rows(), 'assets': assets(), 'existingArt': EXISTING,
 'inventoryFacts': {k: inv[k] for k in ('stepCounter', 'ranks', 'avatars', 'worlds', 'sports')},
}
c = {}
for s in manifest['screens']:
    for n in s['needs']: c[n] = c.get(n, 0) + 1
manifest['coverage'] = {'screens': len(manifest['screens']), 'screensWithNeeds': sum(1 for s in manifest['screens'] if s['needs']),
                        'byNeed': dict(sorted(c.items())), 'assets': len(manifest['assets']),
                        'bytes': {'objectsWebp': sum(e['bytes'] for a in manifest['assets'] if a['kind'] == 'object-3d' for e in a['exports']),
                                  'svg': sum(a['bytes'] for a in manifest['assets'] if a['id'].startswith('svg.'))}}
os.makedirs('docs/v2', exist_ok=True)
json.dump(manifest, open('docs/v2/visual-asset-manifest.json', 'w'), ensure_ascii=False, indent=1)
print(json.dumps(manifest['coverage'], ensure_ascii=False))
