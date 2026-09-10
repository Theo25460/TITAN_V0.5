import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const target = resolve(root, '.netlify-upload');

function assertInsideRoot(path) {
  const resolved = resolve(path);
  const rel = relative(root, resolved);
  if (!rel || rel.startsWith('..') || rel.includes(`..\\`) || rel.includes('../')) {
    throw new Error(`Refusing staging path outside project root: ${resolved}`);
  }
  return resolved;
}

function copy(name) {
  const source = resolve(root, name);
  const destination = resolve(target, name);
  if (!existsSync(source)) throw new Error(`Missing Netlify upload input: ${name}`);
  cpSync(source, destination, { recursive: true });
}

assertInsideRoot(target);
if (existsSync(target)) rmSync(target, { recursive: true, force: true });
mkdirSync(target, { recursive: true });

for (const entry of ['dist', 'functions', 'netlify.toml', 'pnpm-lock.yaml']) copy(entry);

const packageJson = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8'));
packageJson.scripts = {
  build: 'node -e "console.log(\'Using verified TITAN OS public build\')"'
};
writeFileSync(
  join(target, 'package.json'),
  `${JSON.stringify(packageJson, null, 2)}\n`,
  'utf8'
);

console.log(`TITAN Netlify upload package ready: ${target}`);
