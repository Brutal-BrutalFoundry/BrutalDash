const host = process.argv[2] || '10.42.1.146';
const captureMs = Number(process.argv[3] || 30_000);
const mode = process.argv[4] || 'blocking';
const pages = await fetch(`http://${host}:9222/json/list`).then(response => response.json());
const page = pages.find(candidate => String(candidate.title).includes('BrutalDash')) || pages[0];
if (!page?.webSocketDebuggerUrl) throw new Error('No BrutalDash debug page found');

const socket = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((resolveOpen, rejectOpen) => {
  socket.addEventListener('open', resolveOpen, { once: true });
  socket.addEventListener('error', rejectOpen, { once: true });
});
let sequence = 0;
const pending = new Map();
socket.addEventListener('message', event => {
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

if (mode === '--read') {
  const result = await send('Runtime.evaluate', { expression: `(() => {
    const capture = window.__brutalDashKeyCapture;
    if (!capture) return '[]';
    document.removeEventListener('keydown', capture.handler, true);
    delete window.__brutalDashKeyCapture;
    return JSON.stringify(capture.events);
  })()`, returnByValue: true });
  socket.close();
  console.log(result.result.value);
  process.exit(0);
}

await send('Runtime.evaluate', { expression: `(() => {
  const prior = window.__brutalDashKeyCapture;
  if (prior) document.removeEventListener('keydown', prior.handler, true);
  const events = [];
  const watched = event => /^(Digit[1-4]|KeyM|Escape)$/.test(event.code);
  const handler = event => {
    if (!watched(event)) return;
    events.push({ at: Math.round(performance.now()), key: event.key, code: event.code, repeat: event.repeat, trusted: event.isTrusted });
    if (${JSON.stringify(mode)} !== '--passive') {
      event.preventDefault();
      event.stopImmediatePropagation();
    }
  };
  window.__brutalDashKeyCapture = { events, handler };
  document.addEventListener('keydown', handler, true);
})()` });

if (mode === '--passive') {
  socket.close();
  console.log('armed');
  process.exit(0);
}

await new Promise(resolve => setTimeout(resolve, captureMs));
const result = await send('Runtime.evaluate', { expression: `(() => {
  const capture = window.__brutalDashKeyCapture;
  if (!capture) return '[]';
  document.removeEventListener('keydown', capture.handler, true);
  delete window.__brutalDashKeyCapture;
  return JSON.stringify(capture.events);
})()`, returnByValue: true });
socket.close();
console.log(result.result.value);
