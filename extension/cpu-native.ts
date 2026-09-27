export type NativeCpuMetrics = {
  cpuTemp: number | null;
  cpuClock: number | null;
  cpuPower: number | null;
  error: string | null;
  receivedAt: number;
};

type Logger = { info(message: string): void; warn(message: string): void };
type Child = {
  stdout: ReadableStream<Uint8Array>;
  stderr: ReadableStream<Uint8Array>;
  status: Promise<{ success: boolean; code: number }>;
  kill(signal?: string): void;
};
type Runtime = {
  build: { os: string };
  Command: new (command: string, options: { args: string[]; stdout: 'piped'; stderr: 'piped' }) => { spawn(): Child };
};

const RETRY_MS = 30_000;
const STALE_MS = 2_000;

function runtime(): Runtime | null {
  const deno = (globalThis as typeof globalThis & { Deno?: Runtime }).Deno;
  return deno?.build.os === 'windows' ? deno : null;
}

function windowsPath(url: URL) {
  return decodeURIComponent(url.pathname).replace(/^\/([A-Za-z]:)/, '$1').replace(/\//g, '\\');
}

function candidates() {
  return [
    windowsPath(new URL('./vendor/cpu-host/BrutalDashCpuHost.exe', import.meta.url)),
    windowsPath(new URL('../vendor/cpu-host/BrutalDashCpuHost.exe', import.meta.url)),
    windowsPath(new URL('../public/vendor/cpu-host/BrutalDashCpuHost.exe', import.meta.url)),
    windowsPath(new URL('../../public/vendor/cpu-host/BrutalDashCpuHost.exe', import.meta.url)),
  ];
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

function finite(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

export class NativeCpuProvider {
  private child: Child | null = null;
  private latest: NativeCpuMetrics | null = null;
  private retryAt = 0;
  private generation = 0;
  private warned = false;
  private active = false;
  private lastSensorError: string | null = null;

  constructor(private readonly log: Logger) {}

  update(cpuName: string | null, now = Date.now()) {
    const supported = Boolean(cpuName && /\bIntel\b|\bAMD\b|Ryzen|Threadripper/i.test(cpuName));
    if (!supported) {
      this.latest = null;
      this.retryAt = 0;
      this.stopHost();
      return;
    }
    if (!this.child && now >= this.retryAt) this.startHost();
  }

  snapshot(now = Date.now()) {
    return this.latest && now - this.latest.receivedAt <= STALE_MS ? this.latest : null;
  }

  stop() {
    this.latest = null;
    this.retryAt = 0;
    this.stopHost();
  }

  private startHost() {
    const deno = runtime();
    if (!deno) return;
    let child: Child | null = null;
    let lastError: unknown = null;
    for (const executable of candidates()) {
      try {
        child = new deno.Command(executable, { args: [], stdout: 'piped', stderr: 'piped' }).spawn();
        break;
      } catch (error) {
        lastError = error;
      }
    }
    if (!child) {
      this.retryAt = Date.now() + RETRY_MS;
      this.fail(`Native CPU helper could not start: ${lastError instanceof Error ? lastError.message : String(lastError)}`);
      return;
    }

    this.child = child;
    const generation = ++this.generation;
    let exitError: string | null = null;
    const outputDone = readLines(child.stdout, line => {
      this.consume(line, generation);
      if (generation === this.generation) exitError = this.latest?.error || null;
    }).catch(error => {
      if (generation === this.generation) this.fail(`Native CPU helper output failed: ${error instanceof Error ? error.message : String(error)}`);
    });
    void readLines(child.stderr, line => {
      if (generation === this.generation && line.trim()) this.fail(`Native CPU helper: ${line.trim()}`);
    }).catch(() => undefined);
    void child.status.then(async status => {
      // Exit notification can precede the final JSON line. That line decides
      // whether to retry promptly or stop after declined/failed provisioning.
      await outputDone;
      if (generation !== this.generation) return;
      this.child = null;
      const error = exitError;
      const stopUntilRestart = error === "native-driver-provisioned-reboot-required" || error === "native-driver-elevation-cancelled" || error === "native-driver-bundle-missing" || error === "native-driver-integrity-failed" || Boolean(error?.startsWith("native-driver-install-failed:"));
      this.retryAt = stopUntilRestart ? Number.POSITIVE_INFINITY : Date.now() + (error === "native-driver-provisioned" ? 1_000 : RETRY_MS);
      if (!status.success) this.fail(`Native CPU helper exited with code ${status.code}`);
    }).catch(error => {
      if (generation !== this.generation) return;
      this.child = null;
      this.retryAt = Date.now() + RETRY_MS;
      this.fail(`Native CPU helper failed: ${error instanceof Error ? error.message : String(error)}`);
    });
  }

  private consume(line: string, generation: number) {
    if (generation !== this.generation || !line.trim()) return;
    let value: Record<string, unknown>;
    try {
      value = JSON.parse(line) as Record<string, unknown>;
    } catch {
      this.fail('Native CPU helper returned malformed JSON');
      return;
    }

    const cpuTemp = finite(value.cpuTemp);
    const cpuClock = finite(value.cpuClock);
    const cpuPower = finite(value.cpuPower);
    const error = typeof value.error === 'string' ? value.error : null;
    this.latest = { cpuTemp, cpuClock, cpuPower, error, receivedAt: Date.now() };
    if (error !== this.lastSensorError) {
      this.lastSensorError = error;
      if (error && cpuTemp === null && (cpuClock !== null || cpuPower !== null)) {
        this.log.warn(`Native CPU temperature unavailable: ${error}`);
      }
    }

    if (cpuTemp !== null || cpuClock !== null || cpuPower !== null) {
      this.warned = false;
      if (!this.active) {
        this.active = true;
        this.log.info(`Native CPU sensors active: ${[cpuTemp !== null ? 'temperature' : null, cpuClock !== null ? 'clock' : null, cpuPower !== null ? 'package power' : null].filter(Boolean).join(', ')}`);
      }
    } else if (error === "native-driver-provisioned") {
      this.warned = false;
      this.active = false;
      this.log.info("Native CPU hardware access provisioned; activating sensors");
    } else if (error === "native-driver-provisioned-reboot-required") {
      this.fail("Native CPU hardware access is ready; Windows must be restarted once to activate it");
    } else if (error === "native-driver-elevation-cancelled") {
      this.fail("Native CPU hardware access could not be enabled because Windows elevation was declined");
    } else if (error === "native-driver-bundle-missing") {
      this.fail("Native CPU hardware-access component is missing from the BrutalDash package");
    } else if (error === "native-driver-integrity-failed") {
      this.fail("Native CPU hardware-access component failed integrity verification");
    } else if (error?.startsWith("native-driver-install-failed:")) {
      this.fail(`Native CPU hardware-access setup failed: ${error.slice("native-driver-install-failed:".length)}`);
    } else if (error === "native-driver-needed") {
      this.fail("Native CPU hardware-access provisioning is disabled by the development test guard");
    } else if (error) {
      this.fail(`Native CPU sensors unavailable: ${error}`);
    }
  }

  private stopHost() {
    const child = this.child;
    this.child = null;
    this.active = false;
    this.generation += 1;
    if (!child) return;
    try { child.kill('SIGTERM'); } catch { /* already exited */ }
  }

  private fail(message: string) {
    if (this.warned) return;
    this.warned = true;
    this.active = false;
    this.log.warn(message);
  }
}
