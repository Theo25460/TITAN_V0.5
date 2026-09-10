import { readFile, readdir, stat, writeFile } from 'node:fs/promises';
import { extname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const imageRoot = join(root, 'image');
const MAX_LONG_EDGE = 1600;
const JPEG_QUALITY = 86;

async function walk(directory) {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const fullPath = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await walk(fullPath));
    else if (/\.(png|jpe?g)$/i.test(entry.name)) files.push(fullPath);
  }
  return files;
}

function formatBytes(value) {
  return `${(value / (1024 * 1024)).toFixed(2)} MB`;
}

async function optimize(file, shouldWrite) {
  const before = await stat(file);
  const metadata = await sharp(file).metadata();
  const width = Number(metadata.width || 0);
  const height = Number(metadata.height || 0);
  const longEdge = Math.max(width, height);
  if (longEdge <= MAX_LONG_EDGE && before.size < 256 * 1024) {
    return {
      file: relative(root, file).replaceAll('\\', '/'),
      dimensions: `${width}x${height}`,
      before: before.size,
      after: before.size,
      changed: false,
    };
  }

  const source = await readFile(file);
  let pipeline = sharp(source, { failOn: 'warning' }).rotate();
  if (longEdge > MAX_LONG_EDGE) {
    pipeline = pipeline.resize({
      width: MAX_LONG_EDGE,
      height: MAX_LONG_EDGE,
      fit: 'inside',
      withoutEnlargement: true,
    });
  }

  const extension = extname(file).toLowerCase();
  pipeline = extension === '.png'
    ? pipeline.png({ compressionLevel: 9, adaptiveFiltering: true })
    : pipeline.jpeg({ quality: JPEG_QUALITY, mozjpeg: true, progressive: true });

  const output = await pipeline.toBuffer();
  if (shouldWrite && output.length < before.size) await writeFile(file, output);

  return {
    file: relative(root, file).replaceAll('\\', '/'),
    dimensions: `${width}x${height}`,
    before: before.size,
    after: Math.min(before.size, output.length),
    changed: output.length < before.size,
  };
}

export async function optimizeImageAssets({ write = false } = {}) {
  const files = await walk(imageRoot);
  const results = [];

  for (const file of files) {
    results.push(await optimize(file, write));
  }

  const totals = results.reduce((acc, item) => {
    acc.before += item.before;
    acc.after += item.after;
    if (item.changed) acc.changed += 1;
    return acc;
  }, { before: 0, after: 0, changed: 0 });

  return {
    mode: write ? 'write' : 'dry-run',
    files: results.length,
    changed: totals.changed,
    before: formatBytes(totals.before),
    after: formatBytes(totals.after),
    saved: formatBytes(totals.before - totals.after),
    largest: results
      .sort((left, right) => right.before - left.before)
      .slice(0, 20)
      .map(item => ({
        file: item.file,
        dimensions: item.dimensions,
        before: formatBytes(item.before),
        after: formatBytes(item.after),
      })),
  };
}

const nodeArgs = globalThis.process?.argv || [];
const invokedDirectly = nodeArgs[1] && resolve(nodeArgs[1]) === fileURLToPath(import.meta.url);
if (invokedDirectly) {
  const report = await optimizeImageAssets({ write: nodeArgs.includes('--write') });
  console.log(JSON.stringify(report, null, 2));
}
