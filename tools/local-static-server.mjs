import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const port = Number(process.env.PORT || 8080);
const host = process.env.HOST || '127.0.0.1';

const types = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.webp': 'image/webp',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon',
    '.webmanifest': 'application/manifest+json'
};

function resolvePath(requestUrl) {
    const url = new URL(requestUrl, `http://${host}:${port}`);
    let pathname = decodeURIComponent(url.pathname);
    if (pathname === '/') pathname = '/index.html';
    if (pathname === '/admin') pathname = '/admin.html';
    if (pathname === '/login') pathname = '/login.html';
    if (pathname === '/dynamic-page') pathname = '/dynamic-page.html';
    if (!path.extname(pathname)) pathname = `${pathname}.html`;
    return path.normalize(path.join(root, pathname));
}

const server = http.createServer((req, res) => {
    const file = resolvePath(req.url || '/');
    if (file !== root && !file.startsWith(root + path.sep)) {
        res.writeHead(403, { 'content-type': 'text/plain; charset=utf-8' });
        res.end('Forbidden');
        return;
    }

    fs.readFile(file, (error, data) => {
        if (error) {
            res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
            res.end('Not found');
            return;
        }

        res.writeHead(200, {
            'cache-control': 'no-store',
            'content-type': types[path.extname(file).toLowerCase()] || 'application/octet-stream'
        });
        res.end(data);
    });
});

server.listen(port, host, () => {
    console.log(`TITAN local server http://${host}:${port}`);
});
