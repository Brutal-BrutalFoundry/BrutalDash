import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

const host = process.argv[2] || process.env.SUPERBIRD_HOST || 'bridgething.local';
const output = resolve(process.argv[3] || 'device-screenshot.png');

const pages = await fetch(`http://${host}:9222/json/list`).then(async (response) => {
  if (!response.ok) throw new Error(`CDP page list returned HTTP ${response.status}`);
  return response.json();
});
const page = pages.find((candidate) => String(candidate.url).includes('127.0.0.1:8891')) || pages[0];
if (!page?.webSocketDebuggerUrl) throw new Error('no debuggable Car Thing page found');

const socket = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((resolveOpen, rejectOpen) => {
  socket.addEventListener('open', resolveOpen, { once: true });
  socket.addEventListener('error', rejectOpen, { once: true });
});

let sequence = 0;
const pending = new Map();
socket.addEventListener('message', (event) => {
  const message = JSON.parse(String(event.data));
  const request = pending.get(message.id);
  if (!request) return;
  pending.delete(message.id);
  if (message.error) request.reject(new Error(JSON.stringify(message.error)));
  else request.resolve(message.result);
});

function send(method, params = {}) {
  return new Promise((resolveRequest, rejectRequest) => {
    const id = ++sequence;
    pending.set(id, { resolve: resolveRequest, reject: rejectRequest });
    socket.send(JSON.stringify({ id, method, params }));
  });
}

const screenshot = await send('Page.captureScreenshot', { format: 'png', fromSurface: true });
socket.close();
await mkdir(dirname(output), { recursive: true });
await writeFile(output, Buffer.from(screenshot.data, 'base64'));
console.log(output);
