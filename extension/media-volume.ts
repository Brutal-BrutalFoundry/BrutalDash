export type MediaVolumeResult = {
  ok: boolean;
  error: string | null;
  process: string | null;
  volume: number | null;
};

export type WindowsMediaSnapshot = {
  ok: boolean;
  error: string | null;
  source: string | null;
  title: string | null;
  artist: string | null;
  album: string | null;
  playback: string | null;
  positionMs: number;
  durationMs: number;
  artwork: string | null;
};

type DenoCommand = {
  output(): Promise<{ success: boolean; code: number; stdout: Uint8Array; stderr: Uint8Array }>;
};

type DenoRuntime = {
  build: { os: string };
  Command: new (command: string, options: { args: string[]; stdout: 'piped'; stderr: 'piped' }) => DenoCommand;
};

const decoder = new TextDecoder();

function runtime(): DenoRuntime | null {
  const candidate = (globalThis as typeof globalThis & { Deno?: DenoRuntime }).Deno;
  return candidate && candidate.build.os === 'windows' ? candidate : null;
}

function windowsPath(url: URL) {
  const decoded = decodeURIComponent(url.pathname).replace(/^\/([A-Za-z]:)/, '$1');
  return decoded.replace(/\//g, '\\');
}

function executableCandidates() {
  return [
    windowsPath(new URL('./vendor/media-host/BrutalDashMediaHost.exe', import.meta.url)),
    windowsPath(new URL('../vendor/media-host/BrutalDashMediaHost.exe', import.meta.url)),
    windowsPath(new URL('../public/vendor/media-host/BrutalDashMediaHost.exe', import.meta.url)),
  ];
}

function unavailable(error: string): MediaVolumeResult {
  return { ok: false, error, process: null, volume: null };
}

function parseResult(stdout: Uint8Array): MediaVolumeResult | null {
  try {
    const parsed = JSON.parse(decoder.decode(stdout)) as Partial<MediaVolumeResult>;
    if (typeof parsed.ok !== 'boolean') return null;
    return {
      ok: parsed.ok,
      error: typeof parsed.error === 'string' ? parsed.error : null,
      process: typeof parsed.process === 'string' ? parsed.process : null,
      volume: typeof parsed.volume === 'number' && Number.isFinite(parsed.volume) ? parsed.volume : null,
    };
  } catch {
    return null;
  }
}

async function invoke(args: string[]): Promise<{ output: Uint8Array; code: number; error: string } | null> {
  const deno = runtime();
  if (!deno) return null;
  for (const executable of executableCandidates()) {
    try {
      const result = await new deno.Command(executable, { args, stdout: 'piped', stderr: 'piped' }).output();
      return { output: result.stdout, code: result.code, error: decoder.decode(result.stderr).trim() };
    } catch { /* try the next packaged/development location */ }
  }
  return null;
}

export async function readWindowsMediaSnapshot(includeArtwork = false): Promise<WindowsMediaSnapshot> {
  const result = await invoke(includeArtwork ? ['--snapshot', '--artwork'] : ['--snapshot']);
  if (!result) return { ok: false, error: 'Windows media helper is unavailable', source: null, title: null, artist: null, album: null, playback: null, positionMs: 0, durationMs: 0, artwork: null };
  try {
    const parsed = JSON.parse(decoder.decode(result.output)) as WindowsMediaSnapshot;
    return parsed;
  } catch {
    return { ok: false, error: result.error || `Windows media helper exited with code ${result.code}`, source: null, title: null, artist: null, album: null, playback: null, positionMs: 0, durationMs: 0, artwork: null };
  }
}

export async function sendWindowsMediaCommand(command: 'previous' | 'playPause' | 'next'): Promise<boolean> {
  const result = await invoke(['--command', command]);
  if (!result) return false;
  try { return Boolean((JSON.parse(decoder.decode(result.output)) as { ok?: unknown }).ok); }
  catch { return false; }
}

/** Test-only helper command: proves Unicode survives the native process pipe. */
export async function verifyUnicodeMediaTransport(): Promise<WindowsMediaSnapshot> {
  const result = await invoke(['--verify-unicode']);
  if (!result) return { ok: false, error: 'Windows media helper is unavailable', source: null, title: null, artist: null, album: null, playback: null, positionMs: 0, durationMs: 0, artwork: null };
  try {
    return JSON.parse(decoder.decode(result.output)) as WindowsMediaSnapshot;
  } catch {
    return { ok: false, error: result.error || `Windows media helper exited with code ${result.code}`, source: null, title: null, artist: null, album: null, playback: null, positionMs: 0, durationMs: 0, artwork: null };
  }
}

/**
 * Changes only the Core Audio session whose process matches the media source
 * hint. It never falls back to endpoint/master volume or a phone API.
 */
export async function adjustActiveMediaVolume(delta: number, sourceHint: string | null): Promise<MediaVolumeResult> {
  const hint = sourceHint?.trim().slice(0, 120) || '';
  if (!runtime()) return unavailable('Windows media volume is unavailable');
  if (!hint) return unavailable('No active media source');
  if (!Number.isFinite(delta) || delta === 0) return unavailable('Invalid media volume request');
  const boundedDelta = Math.max(-0.2, Math.min(0.2, delta));
  let lastError = 'Windows media helper is unavailable';
  const output = await invoke(['--hint', hint, '--delta', String(boundedDelta)]);
  if (output) {
    const parsed = parseResult(output.output);
    if (parsed) return parsed;
    lastError = output.error || `Windows media helper exited with code ${output.code}`;
  }
  return unavailable(lastError);
}
