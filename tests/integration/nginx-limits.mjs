import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

const temporary = await mkdtemp(path.join(tmpdir(), 'jetree-nginx-'));
const upstream = createServer((request, response) => { response.writeHead(401); response.end('{}'); });
await new Promise(resolve => upstream.listen(18090, '127.0.0.1', resolve));
let nginx;
try {
  const config = `pid ${temporary}/nginx.pid;
error_log ${temporary}/error.log;
events { worker_connections 1024; }
http {
  access_log off;
  include ${path.resolve('deploy/nginx/jetree-limits.conf')};
  server {
    listen 127.0.0.1:18089;
    server_name localhost;
    include ${path.resolve('deploy/nginx/jetree-limit-server.conf')};
    location / { proxy_pass http://127.0.0.1:18090; }
  }
}`;
  const configPath = path.join(temporary, 'nginx.conf');
  await writeFile(configPath, config);
  nginx = spawn('nginx', ['-p', temporary + '/', '-c', configPath, '-g', 'daemon off;'], { stdio: 'ignore' });
  let startupError;
  nginx.on('error', error => { startupError = error; });
  const request = (route, method = 'GET') => fetch('http://127.0.0.1:18089' + route, { method, signal: AbortSignal.timeout(5000) });
  for (let attempt = 0; ; attempt++) {
    if (startupError) throw startupError;
    try { await request('/'); break; }
    catch (error) { if (attempt >= 39) throw error; await new Promise(resolve => setTimeout(resolve, 100)); }
  }
  for (const route of ['/api/health', '/api/telegram/worker', '/api/webhook/telegram/synthetic', '/api/tool-connections/oauth/callback']) {
    const statuses = await Promise.all(Array.from({ length: 50 }, async () => (await request(route)).status));
    assert.ok(statuses.every(status => status === 401), `excluded endpoint ${route}`);
  }
  const responses = await Promise.all(Array.from({ length: 60 }, () => request('/api/agents')));
  assert.ok(responses.some(response => response.status === 401));
  const rejected = responses.find(response => response.status === 429);
  assert.ok(rejected, 'general API burst must be limited');
  assert.equal(rejected.headers.get('retry-after'), '60');
  assert.match(rejected.headers.get('content-type'), /application\/json/);
  assert.equal(typeof (await rejected.json()).error, 'string');
  await new Promise(resolve => setTimeout(resolve, 8000));
  const chat = await Promise.all(Array.from({ length: 10 }, () => request('/api/agents/chat', 'POST')));
  assert.ok(chat.some(response => response.status === 401));
  assert.ok(chat.some(response => response.status === 429), 'chat has a tighter limit');
  console.log('PASS real nginx API/chat limits, 429 JSON, Retry-After and excluded delivery/health endpoints');
} finally {
  if (nginx && nginx.exitCode === null && !nginx.killed) {
    const stopped = new Promise(resolve => nginx.once('exit', resolve));
    nginx.kill('SIGTERM');
    await stopped;
  }
  await new Promise(resolve => upstream.close(resolve));
  await rm(temporary, { recursive: true, force: true });
}
