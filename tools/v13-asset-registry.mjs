/** Inventory product image/font sources and code-drawn visuals. Run with --check in CI. */
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { basename, extname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const root = fileURLToPath(new URL('..', import.meta.url));
const assetRoots = ['assets', 'css/fonts', 'docs/play-store', 'image', 'mobile/assets', 'mobile/docs/play-store'];
const file = path => resolve(root, path);
const read = path => readFileSync(file(path), 'utf8');
const digest = bytes => createHash('sha256').update(bytes).digest('hex');

function filesBelow(path) {
  if (!existsSync(file(path))) return [];
  return readdirSync(file(path), { withFileTypes: true }).flatMap(entry => {
    const child = `${path}/${entry.name}`;
    if (entry.isDirectory()) return filesBelow(child);
    if (entry.name.startsWith('.')) return []; // editor writes do not belong in the product inventory
    return [child];
  }).sort();
}

const sourcePaths = [
  ...filesBelow('js'), ...filesBelow('css'), ...filesBelow('mobile/src'),
  ...readdirSync(root).filter(path => /\.(html|json)$/.test(path)),
  'mobile/app.config.ts', 'mobile/App.tsx',
];
const sources = sourcePaths.filter(path => /\.(js|ts|tsx|css|html|json)$/.test(path) && existsSync(file(path)))
  .sort().map(path => ({ path, lines: read(path).split('\n') }));

function dimensions(bytes, path) {
  if (bytes.length >= 24 && bytes.subarray(1, 4).toString() === 'PNG') {
    return [bytes.readUInt32BE(16), bytes.readUInt32BE(20)];
  }
  if (bytes.subarray(0, 4).toString() === 'RIFF' && bytes.subarray(8, 12).toString() === 'WEBP') {
    const kind = bytes.subarray(12, 16).toString();
    if (kind === 'VP8X') return [1 + bytes.readUIntLE(24, 3), 1 + bytes.readUIntLE(27, 3)];
    if (kind === 'VP8 ') return [bytes.readUInt16LE(26) & 16383, bytes.readUInt16LE(28) & 16383];
    if (kind === 'VP8L') {
      const size = bytes.readUInt32LE(21);
      return [(size & 16383) + 1, ((size >>> 14) & 16383) + 1];
    }
  }
  if (bytes[0] === 255 && bytes[1] === 216) {
    let offset = 2;
    while (offset + 8 < bytes.length) {
      if (bytes[offset] !== 255) { offset++; continue; }
      const marker = bytes[offset + 1];
      if ([192, 193, 194, 195, 197, 198, 199, 201, 202, 203, 205, 206, 207].includes(marker)) {
        return [bytes.readUInt16BE(offset + 7), bytes.readUInt16BE(offset + 5)];
      }
      if (marker === 217 || marker === 218) break;
      const length = bytes.readUInt16BE(offset + 2);
      if (length < 2) break;
      offset += 2 + length;
    }
  }
  if (path.endsWith('.svg')) {
    const box = bytes.toString().match(/viewBox=["']\s*[-\d.]+\s+[-\d.]+\s+([\d.]+)\s+([\d.]+)/);
    if (box) return [Number(box[1]), Number(box[2])];
  }
  if (path.endsWith('.ico') && bytes.length > 8) return [bytes[6] || 256, bytes[7] || 256];
  return [null, null];
}

function familyOf(path) {
  const name = basename(path);
  if (path.includes('/play-store/')) return 'store-listing';
  if (/fonts|\.ttf|\.woff/.test(path)) return 'typography';
  if (name.includes('notification')) return 'notifications';
  if (name.startsWith('guardian-')) return 'guardians';
  if (/^(valley|archipelago|forge|aurora)(-|\.)/.test(name)) return 'worlds';
  if (/^(scout|ranger|keeper|artisan|navigator|sentinel)(-|\.)/.test(name) || path.includes('/avatar/')) return 'avatars';
  if (/image\/(boss|mob)\//.test(path)) return 'legacy-encounters';
  if (/plus|coach|\/shop\//.test(path)) return 'subscription';
  if (/hero|og-titan/.test(name)) return 'public-auth-hero';
  if (name.includes('contours')) return 'world-map-decoration';
  return 'brand';
}

function usagesOf(path) {
  const name = basename(path);
  return sources.flatMap(source => {
    const lines = source.lines.flatMap((line, index) => line.includes(path) || line.includes(name) ? [index + 1] : []);
    if (lines.length) return [{ source: source.path, lines, evidence: 'literal' }];
    const dynamic = path.startsWith('assets/renaissance/')
      && /renaissance-catalog|js\/app\/(aventure|profil|shell|atelier)/.test(source.path)
      && source.lines.some(line => /renaissance|TitanCodex/.test(line));
    return dynamic ? [{ source: source.path, lines: [], evidence: 'dynamic-family' }] : [];
  });
}

function cropFor(family) {
  if (family === 'worlds' || family === 'public-auth-hero') return 'cover, protect horizon and focal subject';
  if (family === 'avatars') return 'protect face in square and circular masks';
  if (family === 'guardians') return 'contain, protect full silhouette';
  return 'contain, preserve glyph and proportions';
}

function inventoryAsset(path) {
  const bytes = readFileSync(file(path));
  const [width, height] = dimensions(bytes, path);
  const family = familyOf(path);
  const usage = usagesOf(path);
  const sha256 = digest(bytes);
  const legacy = /image\/(avatar|boss|mob)\//.test(path);
  const original = legacy && /\.(png|jpe?g)$/.test(path) && existsSync(file(path.replace(/\.(png|jpe?g)$/, '.webp')));
  const native = path.startsWith('mobile/');
  let distribution = native ? 'native-bundle-candidate' : 'web-public-build-candidate';
  let decision = 'retain';
  let reason = 'preserve existing artwork and usage';
  if (original) {
    distribution = 'source-only';
    reason = 'retain source original, public builder uses its WebP sibling';
  } else if (family === 'store-listing') {
    distribution = 'store-marketing-reference';
    decision = 'fix';
    reason = 'compare store artwork with current native build before reuse';
  } else if (usage.length === 0) {
    decision = 'fix';
    reason = 'no literal usage found, verify dynamic consumers before archiving';
  }
  return {
    path, family, bytes: bytes.length, sha256, version: `sha256:${sha256}`, format: extname(path).slice(1),
    width, height, ratio: width ? Number((width / height).toFixed(4)) : null,
    source: path.startsWith('mobile/assets/rpg/') ? 'existing bundled reuse of Web artwork' : 'existing repository asset',
    visualOwner: 'not established', usage, platform: native ? 'native' : 'web', distribution,
    expectedDeliveredBytes: original || family === 'store-listing' ? 0 : bytes.length,
    style: legacy ? 'legacy winter and science fiction illustration' : 'Ascension #05070A / #3DD9E8 / #F4BB54',
    crop: cropFor(family), safeArea: 'focal bounds to measure on rendered surfaces',
    background: 'dark #05070A and card surface', colorMode: 'dark intended, system/light contrast pending',
    density: { oneX: 'rendered size pending', twoX: 'rendered size pending', threeX: 'rendered size pending' },
    accessibleAlternative: { status: 'check surrounding label or decorative role', sourceEvidence: usage.map(item => item.source) },
    rpgUsage: ['worlds', 'guardians', 'avatars', 'legacy-encounters', 'world-map-decoration'].includes(family),
    decision, reason, technicalValidation: width ? 'dimensions-read' : 'non-raster or dimensions unavailable',
    visualValidation: 'pending-human-review', capture: null,
  };
}

const assets = [...assetRoots.flatMap(filesBelow), 'favicon.ico'].sort().map(inventoryAsset);
const codeSpecs = [
  ['public-brand', 'public/auth/menu/legal', 'index.html', 'Inline SVG brand and public header'],
  ['icons-web', 'menu/tutorial/notifications/badges/sports/statistics/routines/records/social/shop/gpx/empty/dialogues/subscription/legal', 'js/app/icons.js', 'Shared vector icon catalogue'],
  ['icons-native', 'menu/tutorial/notifications/badges/sports/statistics/routines/records/social/shop/gpx/empty/dialogues/subscription', 'mobile/src/core/icons.generated.ts', 'Native vector icon catalogue'],
  ['sport-families', 'sports', 'js/core/sports.js', 'Sport icon and family mapping'],
  ['onboarding', 'tutorial/auth', 'js/app/onboarding.js', 'Existing icons and portraits'],
  ['shell', 'menu/notifications', 'js/app/shell.js', 'Navigation, avatar and menu'],
  ['crest-web', 'ranks/badges', 'js/app/crest.js', 'Seven heraldic ranks'],
  ['crest-native', 'ranks/badges', 'mobile/src/components/Crest.tsx', 'Seven native heraldic ranks'],
  ['profile', 'badges/avatars', 'js/app/profil.js', 'Earned distinctions and passport'],
  ['world-map-native', 'worlds/beacons/fog', 'mobile/src/components/WorldPathMap.tsx', 'Chapter path and guardian'],
  ['world-web', 'worlds/beacons/guardians', 'js/app/aventure.js', 'Landscapes, guardian and chapters'],
  ['journey-web', 'worlds/fog/beacons', 'js/app/journey.js', 'Trail and discovery views'],
  ['journey-native', 'worlds/fog/beacons', 'mobile/src/components/JourneyCard.tsx', 'Trail and discovery views'],
  ['notification-channels', 'notifications', 'mobile/src/lib/notificationChannels.ts', 'System channels and monochrome mark'],
  ['avatar-native', 'avatars', 'mobile/src/components/Avatar.tsx', 'Portrait map and masks'],
  ['brand-native', 'brand/auth/menu', 'mobile/src/components/Brand.tsx', 'Native bundled mark'],
  ['atelier', 'shop/subscription', 'js/app/atelier.js', 'Cosmetic frames, map and card styles'],
  ['gps-native', 'gpx', 'mobile/src/screens/session/GpsRecordScreen.tsx', 'Native GPS recording'],
  ['stats-records', 'statistics/records', 'js/app/records.js', 'Statistics and record source'],
];
const codeNative = codeSpecs.filter(([, , path]) => existsSync(file(path))).map(([id, families, source, description]) => ({
  id, families: families.split('/'), source, description, bytes: statSync(file(source)).size,
  version: `sha256:${digest(readFileSync(file(source)))}`, resolution: 'vector or layout dependent',
  style: 'Ascension tokens', crop: 'preserve viewBox, optical centre and touch target',
  decision: 'retain', accessibleAlternative: 'verify label and decorative role in context',
  visualValidation: 'pending-human-review', capture: null,
}));

// Read the same offline catalogue and icon lookup that the product runs.
const catalog = vm.createContext({});
for (const path of ['js/app/icons.js', 'js/core/sports-catalog.js', 'js/core/sports.js']) {
  vm.runInContext(read(path), catalog, { filename: path, timeout: 1000 });
}
const icons = Array.from(catalog.TITAN_ICON_NAMES, name => ({
  name, viewBox: '0 0 24 24', strokeWidth: 1.65,
  source: 'js/app/icons.js', sha256: digest(catalog.titanIcon(name)), capture: null,
})).sort((a, b) => a.name.localeCompare(b.name, 'en'));
const sports = Array.from(catalog.TitanSports.all(), ({ id, label, family }) => ({
  id, label, family, icon: catalog.TitanSports.iconOf(id),
})).sort((a, b) => a.id.localeCompare(b.id, 'en'));
const hashes = new Map(assets.map(asset => [asset.path, asset.sha256]));
const comparisons = assets.filter(asset => asset.path.startsWith('mobile/assets/rpg/')).map(asset => {
  const web = asset.path.endsWith('hero-small.webp') ? 'image/editorial/hero-small.webp' : asset.path.replace('mobile/assets/rpg/', 'assets/renaissance/');
  return { native: asset.path, web, byteIdentical: hashes.get(web) === asset.sha256, renderComparison: 'pending', capture: null };
});
const screenCensus = sources.filter(({ path }) => path.endsWith('.html') || /mobile\/src\/screens\/.*\.tsx$|^js\/app\//.test(path))
  .map(({ path }) => ({ source: path, visualValidation: 'pending-human-review', capture: null }));
const data = {
  version: 'V1.3', scope: [...assetRoots, 'favicon.ico'], assets, codeNative, icons, sports, comparisons, screenCensus,
  screenReview: { viewports: [320, 360, 390, 768, 1280], fontScale: 2, states: ['empty', 'populated', 'loading', 'error', 'offline', 'locked', 'acquired'] },
  rankComparison: { levels: [1, 3, 6, 10, 15, 25, 40], sizes: [24, 32, 48, 64, 96, 128, 160], backgrounds: ['dark', 'card', 'avatar', 'sharing', 'Play Store'], status: 'pending-render-comparison', capture: null },
};
const familyTotals = new Map();
for (const asset of assets) {
  if (!familyTotals.has(asset.family)) familyTotals.set(asset.family, { files: 0, repo: 0, delivered: 0 });
  const total = familyTotals.get(asset.family);
  total.files++;
  total.repo += asset.bytes;
  total.delivered += asset.expectedDeliveredBytes;
}
const markdown = [
  '# Registre des assets V1.3',
  `Le JSON couvre ${assets.length} fichiers physiques, ${codeNative.length} familles en code, ${icons.length} glyphes, ${sports.length} entrées sport du catalogue hors ligne et ${screenCensus.length} sources d’écran. Générer avec \`node tools/v13-asset-registry.mjs\` et vérifier avec \`node tools/v13-asset-registry.mjs --check\`.`,
  'Chaque fichier indique sa provenance, version SHA, poids, dimensions et ratio. Les références littérales et les usages par catalogue sont distingués. Le registre précise cadrage, décision, statut visuel et mesures restantes. Les captures Play Store sont incluses. Les captures de recette restent dans les preuves.',
  '## Familles et coûts',
  '| Famille | Fichiers | Octets dépôt | Octets candidats à la distribution |\n|---|---:|---:|---:|\n' + Array.from(familyTotals).sort(([a], [b]) => a.localeCompare(b, 'en')).map(([name, total]) => `| ${name} | ${total.files} | ${total.repo} | ${total.delivered} |`).join('\n'),
  'Le builder public écarte les originaux avatar, mob et boss lorsqu’un WebP existe. Les valeurs de distribution indiquent le coût brut des fichiers candidats. Le poids du bundle natif et le trafic du premier écran requièrent leurs propres mesures.',
  '## Usages construits en code',
  '| Famille | Surfaces | Source |\n|---|---|---|\n' + codeNative.map(entry => `| ${entry.id} | ${entry.families.join(', ')} | \`${entry.source}\` |`).join('\n'),
  '## Comparaison Web / Android',
  '| Android | Web | Octets identiques |\n|---|---|---|\n' + comparisons.map(entry => `| \`${entry.native}\` | \`${entry.web}\` | ${entry.byteIdentical ? 'oui' : 'différence à examiner'} |`).join('\n'),
  '## Inventaire physique',
  'La décision `retain` conserve le fichier. `fix` signale une vérification ou correction de son usage avant retrait. Les licences et propriétaires visuels sont à confirmer lorsque le dépôt ne les établit pas.',
  '| Fichier | Famille | Octets | Dimensions | Décision |\n|---|---|---:|---|---|\n' + assets.map(asset => `| \`${asset.path}\` | ${asset.family} | ${asset.bytes} | ${asset.width ? `${asset.width}×${asset.height}` : 'sans dimension raster'} | ${asset.decision} |`).join('\n'),
  '## Contrôles de rendu restant ouverts',
  '- Comparer les sept blasons à 24/32/48/64/96/128/160 px ou dp. Contrôler silhouette, hiérarchie, contours, contraste, centrage et texte accessible.\n- Préserver horizon, visages et silhouettes des quatre mondes, portraits et gardiens. Contrôler recadrages et densités sur les surfaces réelles.\n- Examiner les icônes de sport par catégorie et le centre optique à petite taille. Le JSON recense les associations du catalogue hors ligne.\n- Vérifier les surfaces à 320/360/390/768/1280, police 200 %, états vides, chargement, erreur et hors ligne. Confirmer clavier et TalkBack selon plateforme.\n- Documenter la recette Samsung et les captures manquantes. Les champs de capture restent vides jusqu’à ce qu’une preuve soit disponible.',
  'Examen des sources dans `docs/V13_ASSET_SOURCE_REVIEW.md`.',
].join('\n\n') + '\n';

for (const [path, content] of [['docs/V13_ASSET_REGISTRY.json', JSON.stringify(data, null, 2) + '\n'], ['docs/V13_ASSET_REGISTRY.md', markdown]]) {
  if (process.argv.includes('--check')) {
    if (!existsSync(file(path)) || read(path) !== content) throw new Error(`${path} is stale. Regenerate the asset registry.`);
  } else {
    writeFileSync(file(path), content);
  }
}
console.log(`${assets.length} assets, ${codeNative.length} code families, ${icons.length} icons, ${sports.length} sports, ${screenCensus.length} screen sources, ${comparisons.filter(entry => entry.byteIdentical).length}/${comparisons.length} native copies match`);
