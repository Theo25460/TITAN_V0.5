import { createRequire } from 'node:module';
import { readdir, stat, writeFile } from 'node:fs/promises';
import { basename, extname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const sharp = require('sharp');
const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const imageRoot = join(root, 'image');
const targets = {
  avatar: { maxEdge: 768, quality: 84 },
  boss: { maxEdge: 1280, quality: 84 },
  mob: { maxEdge: 1024, quality: 84 },
};

async function sourceFiles(directory) {
  return (await readdir(directory, { withFileTypes: true }))
    .filter(entry => entry.isFile() && /\.(png|jpe?g)$/i.test(entry.name))
    .map(entry => join(directory, entry.name));
}

function formatMiB(bytes) {
  return `${(bytes / (1024 * 1024)).toFixed(2)} MiB`;
}

const report = [];

for (const [directory, options] of Object.entries(targets)) {
  for (const source of await sourceFiles(join(imageRoot, directory))) {
    const input = await stat(source);
    const output = join(source.slice(0, -extname(source).length) + '.webp');
    const data = await sharp(source, { failOn: 'warning' })
      .rotate()
      .resize({
        width: options.maxEdge,
        height: options.maxEdge,
        fit: 'inside',
        withoutEnlargement: true,
      })
      .webp({
        quality: options.quality,
        alphaQuality: 90,
        effort: 6,
        smartSubsample: true,
      })
      .toBuffer();

    await writeFile(output, data);
    report.push({
      file: relative(root, source).replaceAll('\\', '/'),
      output: basename(output),
      before: input.size,
      after: data.length,
    });
  }
}

const totals = report.reduce((acc, item) => {
  acc.before += item.before;
  acc.after += item.after;
  return acc;
}, { before: 0, after: 0 });

console.log(JSON.stringify({
  files: report.length,
  before: formatMiB(totals.before),
  after: formatMiB(totals.after),
  savedInPublicBuild: formatMiB(totals.before - totals.after),
  largest: report
    .sort((left, right) => right.after - left.after)
    .slice(0, 12)
    .map(item => ({
      file: item.file,
      output: item.output,
      before: formatMiB(item.before),
      after: formatMiB(item.after),
    })),
}, null, 2));
