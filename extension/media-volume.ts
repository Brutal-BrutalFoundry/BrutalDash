export type MediaVolumeResult = { ok: boolean; error: string | null; process: string | null; volume: number | null };
export type WindowsMediaSnapshot = {
  ok: boolean; error: string | null; source: string | null; title: string | null;
  artist: string | null; album: string | null; playback: string | null;
  positionMs: number; durationMs: number; artwork: string | null;
};
type Child = {
  stdin: WritableStream<Uint8Array>; stdout: ReadableStream<Uint8Array>;
  status: Promise<{ success: boolean; code: number }>; kill(signal?: string): void;
};
type Runtime = { build: { os: string }; Command: new (path: string, options: {
  args: string[]; stdin: 'piped'; stdout: 'piped'; stderr: 'null';
}) => { spawn(): Child } };
type Session = { child: Child; writer: WritableStreamDefaultWriter<Uint8Array>; reader: ReadableStreamDefaultReader<Uint8Array>; decoder: TextDecoder; buffer: string };
const encoder = new TextEncoder();
const REQUEST_TIMEOUT_MS = 2500;
const RETRY_MS = 5000;
let session: Session | null = null;
let retryAt = 0;
let queue: Promise<unknown> = Promise.resolve();
let queued = 0;
function runtime(): Runtime | null {
  const value = (globalThis as typeof globalThis & { Deno?: Runtime }).Deno;
  return value?.build.os === 'windows' ? value : null;
}
function executableCandidates() {
  return ['./vendor/media-host/', '../vendor/media-host/', '../public/vendor/media-host/'].map(path =>
    decodeURIComponent(new URL(`${path}BrutalDashMediaHost.exe`, import.meta.url).pathname).replace(/^\/([A-Za-z]:)/, '$1').replace(/\//g, '\\'));
}
function stop(current: Session) {
  if (session === current) session = null;
  try { current.child.kill('SIGTERM'); } catch { /* already exited */ }
  void current.reader.cancel().catch(() => undefined).finally(() => { try { current.reader.releaseLock(); } catch {} });
  void current.writer.abort().catch(() => undefined).finally(() => { try { current.writer.releaseLock(); } catch {} });
}
export function stopWindowsMediaSnapshotServer() { if (session) stop(session); }
export async function startWindowsMediaSnapshotServer(): Promise<boolean> {
  if (session) return true;
  const deno = runtime();
  if (!deno || Date.now() < retryAt) return false;
  for (const executable of executableCandidates()) {
    try {
      const child = new deno.Command(executable, { args: ['--server'], stdin: 'piped', stdout: 'piped', stderr: 'null' }).spawn();
      const current = { child, writer: child.stdin.getWriter(), reader: child.stdout.getReader(), decoder: new TextDecoder(), buffer: '' };
      session = current;
      void child.status.then(() => {
        if (session === current) { retryAt = Date.now() + RETRY_MS; stop(current); }
      }).catch(() => { if (session === current) { retryAt = Date.now() + RETRY_MS; stop(current); } });
      return true;
    } catch { /* try the next packaged/development location */ }
  }
  retryAt = Date.now() + RETRY_MS;
  return false;
}
async function line(current: Session): Promise<string> {
  for (;;) {
    const newline = current.buffer.indexOf('\n');
    if (newline >= 0) {
      const value = current.buffer.slice(0, newline).replace(/\r$/, '');
      current.buffer = current.buffer.slice(newline + 1);
      return value;
    }
    const chunk = await current.reader.read();
    if (chunk.done) throw new Error('Windows media helper exited');
    current.buffer += current.decoder.decode(chunk.value, { stream: true });
    if (current.buffer.length > 256 * 1024) throw new Error('Windows media response too large');
  }
}
async function request(command: string): Promise<Record<string, unknown>> {
  // One stream with a bounded backlog: wheel bursts cannot create a process per
  // notch, overlap reads, or accumulate commands indefinitely during a hang.
  if (queued >= 4) return { ok: false, error: 'Windows media helper is busy' };
  queued++;
  const task = queue.then(async () => {
    if (!await startWindowsMediaSnapshotServer() || !session) return { ok: false, error: 'Windows media helper is unavailable' };
    const current = session;
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const response = await Promise.race([
        (async () => { await current.writer.write(encoder.encode(`${command}\n`)); return await line(current); })(),
        new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error('Windows media helper timed out')), REQUEST_TIMEOUT_MS); }),
      ]);
      const parsed: unknown = JSON.parse(response);
      if (!parsed || typeof parsed !== 'object' || typeof (parsed as { ok?: unknown }).ok !== 'boolean') throw new Error('Invalid Windows media response');
      return parsed as Record<string, unknown>;
    } catch (error) {
      retryAt = Date.now() + RETRY_MS;
      stop(current);
      return { ok: false, error: error instanceof Error ? error.message : String(error) };
    } finally { clearTimeout(timer); }
  });
  queue = task.catch(() => undefined);
  try { return await task; } finally { queued--; }
}
const stringOrNull = (value: unknown) => typeof value === 'string' ? value : null;
const finite = (value: unknown) => typeof value === 'number' && Number.isFinite(value) ? value : null;
export async function readWindowsMediaSnapshot(includeArtwork = false): Promise<WindowsMediaSnapshot> {
  const value = await request(includeArtwork ? 'snapshot-artwork' : 'snapshot');
  return { ok: value.ok === true, error: stringOrNull(value.error), source: stringOrNull(value.source), title: stringOrNull(value.title), artist: stringOrNull(value.artist), album: stringOrNull(value.album), playback: stringOrNull(value.playback), positionMs: finite(value.positionMs) ?? 0, durationMs: finite(value.durationMs) ?? 0, artwork: stringOrNull(value.artwork) };
}
export async function sendWindowsMediaCommand(command: 'previous' | 'playPause' | 'next'): Promise<boolean> {
  if (!['previous', 'playPause', 'next'].includes(command)) return false;
  return (await request(`command\t${command}`)).ok === true;
}
/** Changes only the matching app; never falls back to endpoint/master volume or a phone API. */
export async function adjustActiveMediaVolume(delta: number, sourceHint: string | null): Promise<MediaVolumeResult> {
  const hint = typeof sourceHint === 'string' ? sourceHint.trim().slice(0, 120) : '';
  if (!hint || !Number.isFinite(delta) || delta === 0) return { ok: false, error: 'Invalid media volume request', process: null, volume: null };
  const encodedHint = btoa(Array.from(encoder.encode(hint), b => String.fromCharCode(b)).join(''));
  const value = await request(`volume\t${encodedHint}\t${Math.max(-0.2, Math.min(0.2, delta))}`);
  return { ok: value.ok === true, error: stringOrNull(value.error), process: stringOrNull(value.process), volume: finite(value.volume) };
}
