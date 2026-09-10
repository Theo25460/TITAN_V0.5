import { createRequire } from 'node:module';
import { readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
let sharp;
try {
  sharp = require('sharp');
} catch (_) {
  const bundledSharp = resolve(dirname(dirname(process.execPath)), 'node_modules', 'sharp');
  sharp = require(bundledSharp);
}
const root = resolve(fileURLToPath(new URL('..', import.meta.url)));

const background = Buffer.from(`
<svg width="1200" height="630" viewBox="0 0 1200 630" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#07131e"/>
      <stop offset="0.55" stop-color="#081019"/>
      <stop offset="1" stop-color="#03080d"/>
    </linearGradient>
    <linearGradient id="accent" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="#7edcff"/>
      <stop offset="1" stop-color="#67dfbf"/>
    </linearGradient>
    <radialGradient id="glow" cx="0" cy="0" r="1" gradientTransform="translate(1010 80) rotate(130) scale(470 390)">
      <stop offset="0" stop-color="#67dfbf" stop-opacity="0.2"/>
      <stop offset="1" stop-color="#67dfbf" stop-opacity="0"/>
    </radialGradient>
    <pattern id="grid" width="42" height="42" patternUnits="userSpaceOnUse">
      <path d="M42 0H0V42" fill="none" stroke="#7edcff" stroke-opacity="0.05"/>
    </pattern>
    <filter id="shadow" x="-30%" y="-30%" width="160%" height="160%">
      <feDropShadow dx="0" dy="16" stdDeviation="18" flood-color="#000" flood-opacity="0.3"/>
    </filter>
  </defs>
  <rect width="1200" height="630" fill="url(#bg)"/>
  <rect width="1200" height="630" fill="url(#grid)"/>
  <rect width="1200" height="630" fill="url(#glow)"/>
  <rect x="52" y="48" width="1096" height="534" rx="30" fill="#0d1a25" fill-opacity="0.78" stroke="#b3d7e8" stroke-opacity="0.2" filter="url(#shadow)"/>

  <rect x="88" y="84" width="86" height="86" rx="18" fill="#f5fafc" stroke="#7edcff" stroke-opacity="0.7"/>
  <text x="198" y="116" fill="#f4f8fb" font-family="Arial, sans-serif" font-size="30" font-weight="800" letter-spacing="0.5">TITAN OS SPORT</text>
  <text x="198" y="150" fill="#a9bdc9" font-family="Arial, sans-serif" font-size="18" font-weight="600">Suivi sportif · journal multisport · progression</text>

  <text x="88" y="252" fill="#f4f8fb" font-family="Arial, sans-serif" font-size="61" font-weight="800">Le suivi sportif qui donne</text>
  <text x="88" y="326" fill="#f4f8fb" font-family="Arial, sans-serif" font-size="61" font-weight="800">envie de continuer.</text>
  <rect x="88" y="354" width="548" height="8" rx="4" fill="url(#accent)"/>

  <g transform="translate(88 410)">
    <rect width="192" height="62" rx="14" fill="#122331" stroke="#7edcff" stroke-opacity="0.32"/>
    <text x="22" y="38" fill="#e8f7fc" font-family="Arial, sans-serif" font-size="19" font-weight="700">260+ sports</text>
  </g>
  <g transform="translate(294 410)">
    <rect width="206" height="62" rx="14" fill="#122331" stroke="#7edcff" stroke-opacity="0.32"/>
    <text x="22" y="38" fill="#e8f7fc" font-family="Arial, sans-serif" font-size="19" font-weight="700">Journal clair</text>
  </g>
  <g transform="translate(514 410)">
    <rect width="242" height="62" rx="14" fill="#122331" stroke="#67dfbf" stroke-opacity="0.38"/>
    <text x="22" y="38" fill="#e8f7fc" font-family="Arial, sans-serif" font-size="19" font-weight="700">Progression lisible</text>
  </g>

  <g transform="translate(825 210)">
    <circle cx="140" cy="140" r="132" fill="none" stroke="#7edcff" stroke-opacity="0.16" stroke-width="2"/>
    <circle cx="140" cy="140" r="91" fill="none" stroke="#7edcff" stroke-opacity="0.25" stroke-width="2"/>
    <circle cx="140" cy="140" r="48" fill="#7edcff" fill-opacity="0.08" stroke="#67dfbf" stroke-opacity="0.7" stroke-width="3"/>
    <path d="M140 8V272M8 140H272" stroke="#7edcff" stroke-opacity="0.12"/>
    <path d="M140 140L224 72" stroke="url(#accent)" stroke-width="9" stroke-linecap="round"/>
    <circle cx="224" cy="72" r="10" fill="#67dfbf"/>
  </g>

  <text x="88" y="538" fill="#7edcff" font-family="Arial, sans-serif" font-size="22" font-weight="700">titan-app.fr</text>
  <text x="1112" y="538" text-anchor="end" fill="#a9bdc9" font-family="Arial, sans-serif" font-size="17">Gratuit pour commencer</text>
</svg>`);

const logo = await sharp(await readFile(resolve(root, 'image/logo.png')))
  .resize(70, 70, { fit: 'contain' })
  .png()
  .toBuffer();

const output = await sharp(background)
  .composite([{ input: logo, left: 96, top: 92 }])
  .png({ compressionLevel: 9, adaptiveFiltering: true })
  .toBuffer();

await writeFile(resolve(root, 'image/og-titan-os.png'), output);
console.log(`Open Graph image ready: ${output.length} bytes`);
