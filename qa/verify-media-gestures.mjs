const host = process.argv[2] || '10.42.1.146';
const pages = await fetch(`http://${host}:9222/json/list`).then(response => response.json());
const page = pages.find(candidate => String(candidate.url).includes('127.0.0.1:8891')) || pages[0];
if (!page?.webSocketDebuggerUrl) throw new Error('No device page found');

const socket = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((resolve, reject) => {
  socket.addEventListener('open', resolve, { once: true });
  socket.addEventListener('error', reject, { once: true });
});
let id = 0;
const pending = new Map();
socket.addEventListener('message', event => {
  const message = JSON.parse(String(event.data));
  const request = pending.get(message.id);
  if (!request) return;
  pending.delete(message.id);
  message.error ? request.reject(new Error(JSON.stringify(message.error))) : request.resolve(message.result);
});
const send = (method, params = {}) => new Promise((resolve, reject) => {
  const requestId = ++id;
  pending.set(requestId, { resolve, reject });
  socket.send(JSON.stringify({ id: requestId, method, params }));
});
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
const isOpen = async () => Boolean((await send('Runtime.evaluate', {
  expression: "document.querySelector('.media-drawer')?.classList.contains('is-open')",
  returnByValue: true,
})).result.value);
async function swipe(startY, endY) {
  await send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 400, y: startY }] });
  await send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: 400, y: endY }] });
  await send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await wait(280);
}

if (await isOpen()) await swipe(400, 465);
if (await isOpen()) throw new Error('Drawer did not close before gesture test');
for (let cycle = 1; cycle <= 3; cycle++) {
  await swipe(468, 390);
  if (!await isOpen()) throw new Error(`Drawer did not open on cycle ${cycle}`);
  await swipe(400, 465);
  if (await isOpen()) throw new Error(`Drawer did not close on cycle ${cycle}`);
}
socket.close();
console.log(JSON.stringify({ passed: 6, repeatedOpenClose: true }));
