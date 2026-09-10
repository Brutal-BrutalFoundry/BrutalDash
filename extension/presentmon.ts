export type PresentMonMetrics = {
  fps: number;
  frameTimeMs: number;
  onePercentLowFps: number;
  sampleCount: number;
};

type PresentMonLogger = {
  info(message: string): void;
  warn(message: string): void;
};

type DenoChild = {
  stdout: ReadableStream<Uint8Array>;
  stderr: ReadableStream<Uint8Array>;
  status: Promise<{ success: boolean; code: number }>;
  kill(signal?: string): void;
};

type DenoCommand = {
  spawn(): DenoChild;
};

type DenoRuntime = {
  build: { os: string };
  Command: new (
    command: string,
    options: { args: string[]; stdout: 'piped'; stderr: 'piped' },
  ) => DenoCommand;
};

type FrameSample = {
  receivedAt: number;
  swapChain: string;
  frameTimeMs: number;
};

const SAMPLE_WINDOW_MS = 2_000;
const ALT_TAB_GRACE_MS = 15_000;
const RETRY_DELAY_MS = 5_000;
const SESSION_NAME = 'BrutalDash';

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
    // Installed BridgeThing extensions are extracted under extension/, so the
    // release bundle keeps its private PresentMon copy beside desktop.mjs.
    windowsPath(new URL('./vendor/presentmon/PresentMon.exe', import.meta.url)),
    windowsPath(new URL('../vendor/presentmon/PresentMon.exe', import.meta.url)),
    windowsPath(new URL('../public/vendor/presentmon/PresentMon.exe', import.meta.url)),
    windowsPath(new URL('../../public/vendor/presentmon/PresentMon.exe', import.meta.url)),
  ];
}

function normalizeProcessName(value: string) {
  const name = value.trim().split(/[\\/]/).pop() || '';
  return name && /\.exe$/i.test(name) ? name : name ? `${name}.exe` : '';
}

function parseCsvRow(line: string) {
  const fields: string[] = [];
  let current = '';
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];
    if (character === '"') {
      if (quoted && line[index + 1] === '"') {
        current += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
    } else if (character === ',' && !quoted) {
      fields.push(current);
      current = '';
    } else {
      current += character;
    }
  }
  fields.push(current);
  return fields;
}

function percentile(values: number[], fraction: number) {
  const sorted = [...values].sort((left, right) => left - right);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * fraction) - 1));
  return sorted[index];
}

export function summarizeFrameTimes(frameTimes: number[]): PresentMonMetrics | null {
  const valid = frameTimes.filter(value => Number.isFinite(value) && value >= 0.1 && value <= 1_000);
  if (valid.length < 5) return null;
  const frameTimeMs = valid.reduce((total, value) => total + value, 0) / valid.length;
  const slowFrameMs = percentile(valid, 0.99);
  return {
    fps: 1_000 / frameTimeMs,
    frameTimeMs,
    onePercentLowFps: 1_000 / slowFrameMs,
    sampleCount: valid.length,
  };
}

async function readLines(stream: ReadableStream<Uint8Array>, consume: (line: string) => void) {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let pending = '';
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      pending += decoder.decode(value, { stream: true });
      const lines = pending.split(/\r?\n/);
      pending = lines.pop() || '';
      for (const line of lines) consume(line);
    }
    pending += decoder.decode();
    if (pending) consume(pending);
  } finally {
    reader.releaseLock();
  }
}

/**
 * Owns one process-targeted PresentMon session. It never injects into or
 * controls the target application; it consumes Windows ETW presentation data.
 */
export class PresentMonProvider {
  private child: DenoChild | null = null;
  private target = '';
  private targetSeenAt = 0;
  private retryAt = 0;
  private generation = 0;
  private samples: FrameSample[] = [];
  private header: string[] = [];
  private failureReported = false;

  constructor(private readonly log: PresentMonLogger) {}

  updateTarget(processName: string | null, now = Date.now()) {
    const normalized = processName ? normalizeProcessName(processName) : '';
    if (normalized) {
      this.targetSeenAt = now;
      if (this.target.toLowerCase() !== normalized.toLowerCase()) {
        this.stopCapture();
        this.target = normalized;
        this.failureReported = false;
      }
      if (!this.child && now >= this.retryAt) this.startCapture(normalized);
      return;
    }
    if (this.child && now - this.targetSeenAt > ALT_TAB_GRACE_MS) this.stopCapture();
  }

  snapshot(now = Date.now()): PresentMonMetrics | null {
    const cutoff = now - SAMPLE_WINDOW_MS;
    this.samples = this.samples.filter(sample => sample.receivedAt >= cutoff);
    if (!this.samples.length) return null;
    const bySwapChain = new Map<string, FrameSample[]>();
    for (const sample of this.samples) {
      const group = bySwapChain.get(sample.swapChain) || [];
      group.push(sample);
      bySwapChain.set(sample.swapChain, group);
    }
    const primary = [...bySwapChain.values()].sort((left, right) => right.length - left.length)[0];
    return summarizeFrameTimes(primary.map(sample => sample.frameTimeMs));
  }

  stop() {
    this.target = '';
    this.targetSeenAt = 0;
    this.stopCapture();
  }

  private startCapture(target: string) {
    const deno = runtime();
    if (!deno) return;
    const args = [
      '--process_name', target,
      '--output_stdout',
      '--v1_metrics',
      '--session_name', SESSION_NAME,
      '--stop_existing_session',
      '--no_console_stats',
      '--no_track_input',
    ];
    let child: DenoChild | null = null;
    let lastError: unknown = null;
    for (const executable of executableCandidates()) {
      try {
        child = new deno.Command(executable, { args, stdout: 'piped', stderr: 'piped' }).spawn();
        break;
      } catch (error) {
        lastError = error;
      }
    }
    if (!child) {
      this.retryAt = Date.now() + RETRY_DELAY_MS;
      const reason = lastError instanceof Error ? lastError.message : String(lastError);
      this.logFailure(`PresentMon could not start: ${reason}`);
      return;
    }
    this.child = child;
    this.samples = [];
    this.header = [];
    const generation = ++this.generation;
    void readLines(child.stdout, line => this.consumeCsv(line, generation))
      .catch(error => this.logFailure(`PresentMon output failed: ${error instanceof Error ? error.message : String(error)}`));
    void readLines(child.stderr, line => {
      if (/\berror:/i.test(line)) this.logFailure(line.trim());
    }).catch(() => undefined);
    void child.status.then(status => {
      if (generation !== this.generation) return;
      this.child = null;
      this.retryAt = Date.now() + RETRY_DELAY_MS;
      if (!status.success) this.logFailure(`PresentMon exited with code ${status.code}`);
    }).catch(error => {
      if (generation !== this.generation) return;
      this.child = null;
      this.retryAt = Date.now() + RETRY_DELAY_MS;
      this.logFailure(`PresentMon failed: ${error instanceof Error ? error.message : String(error)}`);
    });
    this.log.info(`Native FPS capture started for ${target}`);
  }

  private consumeCsv(line: string, generation: number) {
    if (generation !== this.generation || !line.trim()) return;
    const fields = parseCsvRow(line);
    if (fields[0] === 'Application') {
      this.header = fields;
      return;
    }
    if (!this.header.length) return;
    const swapChainIndex = this.header.indexOf('SwapChainAddress');
    const frameTimeIndex = this.header.indexOf('msBetweenPresents');
    if (swapChainIndex < 0 || frameTimeIndex < 0) return;
    const frameTimeMs = Number(fields[frameTimeIndex]);
    if (!Number.isFinite(frameTimeMs) || frameTimeMs < 0.1 || frameTimeMs > 1_000) return;
    if (this.failureReported) {
      this.failureReported = false;
      this.log.info(`Native FPS capture recovered for ${this.target}`);
    }
    this.samples.push({
      receivedAt: Date.now(),
      swapChain: fields[swapChainIndex] || 'default',
      frameTimeMs,
    });
    if (this.samples.length > 10_000) this.samples.splice(0, this.samples.length - 10_000);
  }

  private stopCapture() {
    const child = this.child;
    this.child = null;
    this.samples = [];
    this.header = [];
    this.generation += 1;
    if (!child) return;
    try {
      child.kill('SIGTERM');
    } catch {
      // It may already have exited with the target process.
    }
  }

  private logFailure(message: string) {
    if (this.failureReported) return;
    this.failureReported = true;
    this.log.warn(message);
  }
}
