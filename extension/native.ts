export type NativeSystemMetrics = {
  cpuPercent: number | null;
  ramUsedGb: number | null;
  ramTotalGb: number | null;
  ramPercent: number | null;
};

type Kernel32Symbols = {
  GetSystemTimes(idle: Uint8Array, kernel: Uint8Array, user: Uint8Array): number;
  GlobalMemoryStatusEx(status: Uint8Array): number;
};

type Advapi32Symbols = {
  RegOpenKeyExW(key: unknown, subKey: Uint8Array, options: number, access: number, result: Uint8Array): number;
  RegQueryValueExW(key: unknown, valueName: Uint8Array, reserved: null, type: Uint8Array, data: Uint8Array, size: Uint8Array): number;
  RegCloseKey(key: unknown): number;
};

type Kernel32 = { symbols: Kernel32Symbols; close(): void };
type Advapi32 = { symbols: Advapi32Symbols; close(): void };
type DenoRuntime = {
  build: { os: string };
  UnsafePointer: { create(value: bigint): unknown };
  dlopen(path: string, symbols: Record<string, unknown>): Kernel32 | Advapi32;
};

type CpuSample = { idle: bigint; total: bigint };

const MEMORY_STATUS_BYTES = 64;
const GIB = 1024 ** 3;
let kernel32: Kernel32 | null | undefined;
let advapi32: Advapi32 | null | undefined;
let previousCpu: CpuSample | null = null;
let processorName: string | null | undefined;

function runtime(): DenoRuntime | null {
  const candidate = (globalThis as typeof globalThis & { Deno?: DenoRuntime }).Deno;
  return candidate && candidate.build.os === 'windows' ? candidate : null;
}

function kernel(): Kernel32 | null {
  if (kernel32 !== undefined) return kernel32;
  const deno = runtime();
  if (!deno) return kernel32 = null;
  try {
    kernel32 = deno.dlopen('kernel32.dll', {
      GetSystemTimes: { parameters: ['buffer', 'buffer', 'buffer'], result: 'u8' },
      GlobalMemoryStatusEx: { parameters: ['buffer'], result: 'u8' },
    }) as Kernel32;
  } catch {
    kernel32 = null;
  }
  return kernel32;
}

function registry(): Advapi32 | null {
  if (advapi32 !== undefined) return advapi32;
  const deno = runtime();
  if (!deno) return advapi32 = null;
  try {
    advapi32 = deno.dlopen('advapi32.dll', {
      RegOpenKeyExW: { parameters: ['pointer', 'buffer', 'u32', 'u32', 'buffer'], result: 'i32' },
      RegQueryValueExW: { parameters: ['pointer', 'buffer', 'pointer', 'buffer', 'buffer', 'buffer'], result: 'i32' },
      RegCloseKey: { parameters: ['pointer'], result: 'i32' },
    }) as Advapi32;
  } catch {
    advapi32 = null;
  }
  return advapi32;
}

function utf16(value: string) {
  const bytes = new Uint8Array((value.length + 1) * 2);
  const view = new DataView(bytes.buffer);
  for (let index = 0; index < value.length; index += 1) view.setUint16(index * 2, value.charCodeAt(index), true);
  return bytes;
}

function fileTime(buffer: Uint8Array) {
  const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);
  return view.getBigUint64(0, true);
}

function cpuPercent(api: Kernel32) {
  const idle = new Uint8Array(8);
  const kernelTime = new Uint8Array(8);
  const user = new Uint8Array(8);
  if (!api.symbols.GetSystemTimes(idle, kernelTime, user)) return null;
  const next = { idle: fileTime(idle), total: fileTime(kernelTime) + fileTime(user) };
  const previous = previousCpu;
  previousCpu = next;
  if (!previous || next.total <= previous.total || next.idle < previous.idle) return null;
  const totalDelta = next.total - previous.total;
  const busyDelta = totalDelta - (next.idle - previous.idle);
  return Math.max(0, Math.min(100, (Number(busyDelta) / Number(totalDelta)) * 100));
}

function memory(api: Kernel32) {
  const status = new Uint8Array(MEMORY_STATUS_BYTES);
  new DataView(status.buffer).setUint32(0, MEMORY_STATUS_BYTES, true);
  if (!api.symbols.GlobalMemoryStatusEx(status)) return null;
  const view = new DataView(status.buffer);
  const totalBytes = view.getBigUint64(8, true);
  const availableBytes = view.getBigUint64(16, true);
  if (!totalBytes || availableBytes > totalBytes) return null;
  const ramTotalGb = Number(totalBytes) / GIB;
  const ramUsedGb = Number(totalBytes - availableBytes) / GIB;
  return { ramUsedGb, ramTotalGb, ramPercent: (ramUsedGb / ramTotalGb) * 100 };
}

/** Reads the stable Windows CPU branding string once, without spawning WMI. */
export function readProcessorName(): string | null {
  if (processorName !== undefined) return processorName;
  const deno = runtime();
  const api = registry();
  if (!deno || !api) return processorName = null;
  try {
    const result = new Uint8Array(8);
    const machine = deno.UnsafePointer.create(0x80000002n);
    const access = 0x20019; // KEY_READ
    if (api.symbols.RegOpenKeyExW(machine, utf16('HARDWARE\\DESCRIPTION\\System\\CentralProcessor\\0'), 0, access, result) !== 0) return processorName = null;
    const keyValue = new DataView(result.buffer).getBigUint64(0, true);
    if (!keyValue) return processorName = null;
    const key = deno.UnsafePointer.create(keyValue);
    try {
      const kind = new Uint8Array(4);
      const data = new Uint8Array(512);
      const size = new Uint8Array(4);
      new DataView(size.buffer).setUint32(0, data.byteLength, true);
      if (api.symbols.RegQueryValueExW(key, utf16('ProcessorNameString'), null, kind, data, size) !== 0) return processorName = null;
      const length = Math.min(new DataView(size.buffer).getUint32(0, true), data.byteLength);
      const name = new TextDecoder('utf-16le').decode(data.subarray(0, length)).replace(/\0.*$/, '').trim();
      return processorName = name || null;
    } finally {
      api.symbols.RegCloseKey(key);
    }
  } catch {
    return processorName = null;
  }
}

/**
 * Low-overhead Windows fallback for core system telemetry. GPU thermals,
 * power, and clocks are deliberately not guessed: those remain HWiNFO data.
 */
export function readNativeSystemMetrics(): NativeSystemMetrics | null {
  try {
    const api = kernel();
    if (!api) return null;
    const ram = memory(api);
    return {
      cpuPercent: cpuPercent(api),
      ramUsedGb: ram?.ramUsedGb ?? null,
      ramTotalGb: ram?.ramTotalGb ?? null,
      ramPercent: ram?.ramPercent ?? null,
    };
  } catch {
    return null;
  }
}
