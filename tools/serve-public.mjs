import { appendFileSync, createReadStream, existsSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize, resolve } from 'node:path';

const root = resolve('dist');
const port = Number(process.argv[2] || 4173);
const logFile = resolve('server-preview.log');

function log(message) {
  appendFileSync(logFile, `${new Date().toISOString()} ${message}\n`);
}

process.on('uncaughtException', (error) => {
  log(`uncaught ${error.stack || error.message}`);
  process.exit(1);
});

process.on('unhandledRejection', (error) => {
  log(`unhandled ${error?.stack || error}`);
  process.exit(1);
});

const types = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.txt': 'text/plain; charset=utf-8',
  '.webp': 'image/webp',
  '.xml': 'application/xml; charset=utf-8'
};

function publicPath(urlPath) {
  const clean = decodeURIComponent((urlPath || '/').split('?')[0]);
  const normalized = normalize(clean).replace(/^(\.\.[/\\])+/, '');
  let target = resolve(root, `.${normalized}`);
  if (!target.startsWith(root)) target = join(root, '404.html');
  if (existsSync(target) && statSync(target).isDirectory()) target = join(target, 'index.html');
  if (!existsSync(target) && !extname(target)) target = join(root, `${clean.replace(/^\/+/, '')}.html`);
  if (!existsSync(target)) target = join(root, 'index.html');
  return target;
}

createServer((req, res) => {
  const target = publicPath(req.url);
  const type = types[extname(target).toLowerCase()] || 'application/octet-stream';
  res.writeHead(200, { 'Content-Type': type });
  createReadStream(target).pipe(res);
}).listen(port, '127.0.0.1', () => log(`listening http://127.0.0.1:${port}/`));
