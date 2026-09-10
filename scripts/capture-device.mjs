import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

const host = process.argv[2] || process.env.SUPERBIRD_HOST || 'bridgething.local';
const output = resolve(process.argv[3] || 'device-screenshot.png');
const action = process.argv[4] || '';
const pages = await fetch(`http://${host}:9222/json/list`).then(response => {
  if (!response.ok) throw new Error(`CDP page list returned HTTP ${response.status}`);
  return response.json();
});
const page = pages.find(candidate => String(candidate.url).includes('127.0.0.1:8891')) || pages[0];
if (!page?.webSocketDebuggerUrl) throw new Error('no debuggable Car Thing page found');

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

const wait = milliseconds => new Promise(resolveWait => setTimeout(resolveWait, milliseconds));
async function swipe(x, startY, endY) {
  await send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y: startY }] });
  await send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y: endY }] });
  await send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await wait(250);
}

if (action === '--swipe-cycle') {
  const initial = await send('Runtime.evaluate', { expression: "document.querySelector('.media-drawer.is-open') !== null", returnByValue: true });
  if (initial.result.value) {
    await send('Runtime.evaluate', { expression: "document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',code:'Escape',bubbles:true,cancelable:true}))" });
    await wait(250);
  }
  await swipe(400, 470, 400);
  const opened = await send('Runtime.evaluate', { expression: "document.querySelector('.media-drawer.is-open') !== null", returnByValue: true });
  if (!opened.result.value) throw new Error('swipe up did not open the media bar');
  await swipe(300, 420, 475);
  const closed = await send('Runtime.evaluate', { expression: "document.querySelector('.media-drawer.is-open') === null", returnByValue: true });
  if (!closed.result.value) throw new Error('swipe down did not close the media bar');
  await swipe(400, 470, 400);
}

if (action === '--verify-inputs') {
  await send('Runtime.evaluate', { expression: `(() => {
    if (document.querySelector('.media-drawer.is-open')) {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', bubbles: true, cancelable: true }));
    }
  })()` });
  await wait(300);

  await send('Runtime.evaluate', { expression: "document.dispatchEvent(new KeyboardEvent('keydown',{key:'1',code:'Digit1',bubbles:true,cancelable:true}))" });
  await wait(750);
  const tapEmpty = await send('Runtime.evaluate', { expression: "document.querySelector('.toast')?.textContent || ''", returnByValue: true });
  if (!String(tapEmpty.result.value).includes('Hold button 1')) throw new Error(`keydown-only tap did not resolve: ${tapEmpty.result.value}`);

  for (let index = 0; index < 7; index += 1) {
    await send('Runtime.evaluate', { expression: `document.dispatchEvent(new KeyboardEvent('keydown',{key:'1',code:'Digit1',repeat:${index > 0},bubbles:true,cancelable:true}))` });
    await wait(160);
  }
  const held = await send('Runtime.evaluate', { expression: "document.querySelector('.toast')?.textContent || ''", returnByValue: true });
  if (!String(held.result.value).includes('Layout saved to button 1')) throw new Error(`keydown-only hold did not save: ${held.result.value}`);
  await wait(700);

  await send('Runtime.evaluate', { expression: "document.dispatchEvent(new KeyboardEvent('keydown',{key:'1',code:'Digit1',bubbles:true,cancelable:true}))" });
  await wait(750);
  const recalled = await send('Runtime.evaluate', { expression: "document.querySelector('.toast')?.textContent || ''", returnByValue: true });
  if (recalled.result.value !== 'Layout 1') throw new Error(`keydown-only tap did not recall: ${recalled.result.value}`);
  console.log(JSON.stringify({ presetTap: tapEmpty.result.value, presetHold: held.result.value, presetRecall: recalled.result.value }));
}

if (action === '--verify-motion') {
  await send('Runtime.evaluate', { expression: `(() => {
    if (document.querySelector('.media-drawer.is-open')) {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', bubbles: true, cancelable: true }));
    }
  })()` });
  await wait(300);
  const motion = await send('Runtime.evaluate', {
    expression: `(async () => {
      const sample = () => {
        const grid = document.querySelector('.metrics-grid').getBoundingClientRect();
        const drawer = document.querySelector('.media-drawer').getBoundingClientRect();
        return { at: performance.now(), gridBottom: grid.bottom, gridHeight: grid.height, drawerTop: drawer.top, drawerTransform: getComputedStyle(document.querySelector('.media-drawer')).transform };
      };
      const frames = [sample()];
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', bubbles: true, cancelable: true }));
      for (const delay of [25, 50, 75, 100]) {
        await new Promise(resolve => setTimeout(resolve, delay));
        frames.push(sample());
      }
      return frames;
    })()`,
    awaitPromise: true,
    returnByValue: true,
  });
  const frames = motion.result.value;
  if (!Array.isArray(frames) || frames.length < 5) throw new Error('drawer motion samples missing');
  const moving = frames.slice(2).some((frame, index) => frame.gridHeight < frames[index + 1].gridHeight && frame.drawerTop < frames[index + 1].drawerTop);
  const last = frames.at(-1);
  if (!moving || Math.abs(last.gridBottom - last.drawerTop + 8) > 20) throw new Error(`drawer and grid did not move together: ${JSON.stringify(frames)}`);
  console.log(JSON.stringify({ motion: frames }));
}

const runtime = await send('Runtime.evaluate', {
  expression: `JSON.stringify({
    version: document.querySelector('.version-badge')?.textContent || null,
    mediaOpen: document.querySelector('.media-drawer.is-open') !== null,
    viewport: { width: innerWidth, height: innerHeight },
    body: document.body.innerText.slice(0, 500)
  })`,
  returnByValue: true,
});
const screenshot = await send('Page.captureScreenshot', { format: 'png', fromSurface: true });
socket.close();
await mkdir(dirname(output), { recursive: true });
await writeFile(output, Buffer.from(screenshot.data, 'base64'));
console.log(runtime.result.value);
console.log(output);
