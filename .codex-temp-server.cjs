const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const root = process.cwd();
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8' };
http.createServer((request, response) => {
  const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
  const target = path.resolve(root, pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, ''));
  if (!target.startsWith(root)) return response.writeHead(403).end('Forbidden');
  fs.readFile(target, (error, data) => {
    if (error) return response.writeHead(404).end('Not found');
    response.writeHead(200, { 'Content-Type': types[path.extname(target)] || 'application/octet-stream' });
    response.end(data);
  });
}).listen(8765, '127.0.0.1');
