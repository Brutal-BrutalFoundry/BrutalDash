export type DiskIoRates = {
  readMbPerSec: number | null;
  writeMbPerSec: number | null;
};

type PdhSymbols = {
  PdhOpenQueryW(source: null, userData: bigint, query: Uint8Array): number;
  PdhAddEnglishCounterW(query: unknown, path: Uint8Array, userData: bigint, counter: Uint8Array): number;
  PdhCollectQueryData(query: unknown): number;
  PdhGetFormattedCounterArrayW(counter: unknown, format: number, size: Uint8Array, count: Uint8Array, values: unknown): number;
  PdhCloseQuery(query: unknown): number;
};

type Pdh = { symbols: PdhSymbols; close(): void };
type DenoRuntime = {
  build: { os: string; arch: string };
  UnsafePointer: { create(value: bigint): unknown; of(value: Uint8Array): unknown };
  dlopen(path: string, symbols: Record<string, unknown>): Pdh;
};

type Counters = { query: unknown; read: unknown; write: unknown };

const PDH_SUCCESS = 0;
const PDH_MORE_DATA = 0x800007d2;
const PDH_FMT_DOUBLE = 0x00000200;
const COUNTER_VALUE_ITEM_BYTES_64 = 24;
const COUNTER_VALUE_OFFSET_64 = 16;
const MIB = 1024 ** 2;
let pdh: Pdh | null | undefined;
let counters: Counters | null | undefined;

function runtime(): DenoRuntime | null {
  const candidate = (globalThis as typeof globalThis & { Deno?: DenoRuntime }).Deno;
  if (!candidate || candidate.build.os !== 'windows') return null;
  return candidate.build.arch === 'x86_64' || candidate.build.arch === 'aarch64' ? candidate : null;
}

function utf16(value: string) {
  const bytes = new Uint8Array((value.length + 1) * 2);
  const view = new DataView(bytes.buffer);
  for (let index = 0; index < value.length; index += 1) view.setUint16(index * 2, value.charCodeAt(index), true);
  return bytes;
}

function api(): Pdh | null {
  if (pdh !== undefined) return pdh;
  const deno = runtime();
  if (!deno) return pdh = null;
  try {
    pdh = deno.dlopen('pdh.dll', {
      PdhOpenQueryW: { parameters: ['pointer', 'u64', 'buffer'], result: 'u32' },
      PdhAddEnglishCounterW: { parameters: ['pointer', 'buffer', 'u64', 'buffer'], result: 'u32' },
      PdhCollectQueryData: { parameters: ['pointer'], result: 'u32' },
      PdhGetFormattedCounterArrayW: { parameters: ['pointer', 'u32', 'buffer', 'buffer', 'pointer'], result: 'u32' },
      PdhCloseQuery: { parameters: ['pointer'], result: 'u32' },
    });
  } catch {
    pdh = null;
  }
  return pdh;
}

function pointer(runtime: DenoRuntime, buffer: Uint8Array) {
  const value = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength).getBigUint64(0, true);
  return value ? runtime.UnsafePointer.create(value) : null;
}

function addCounter(runtime: DenoRuntime, api: Pdh, query: unknown, path: string) {
  const output = new Uint8Array(8);
  if (api.symbols.PdhAddEnglishCounterW(query, utf16(path), 0n, output) !== PDH_SUCCESS) return null;
  return pointer(runtime, output);
}

function openCounters(): Counters | null {
  if (counters !== undefined) return counters;
  const deno = runtime();
  const library = api();
  if (!deno || !library) return counters = null;
  try {
    const output = new Uint8Array(8);
    if (library.symbols.PdhOpenQueryW(null, 0n, output) !== PDH_SUCCESS) return counters = null;
    const query = pointer(deno, output);
    if (!query) return counters = null;
    const read = addCounter(deno, library, query, '\\PhysicalDisk(_Total)\\Disk Read Bytes/sec');
    const write = addCounter(deno, library, query, '\\PhysicalDisk(_Total)\\Disk Write Bytes/sec');
    if (!read || !write) {
      library.symbols.PdhCloseQuery(query);
      return counters = null;
    }
    // Rate counters only become meaningful after an interval. The dashboard's
    // existing 500 ms poll supplies that interval without extra work.
    library.symbols.PdhCollectQueryData(query);
    return counters = { query, read, write };
  } catch {
    return counters = null;
  }
}

function value(deno: DenoRuntime, library: Pdh, counter: unknown) {
  const size = new Uint8Array(4);
  const count = new Uint8Array(4);
  const first = library.symbols.PdhGetFormattedCounterArrayW(counter, PDH_FMT_DOUBLE, size, count, null);
  if (first !== PDH_MORE_DATA && first !== PDH_SUCCESS) return null;
  const bytes = new DataView(size.buffer).getUint32(0, true);
  const entries = new DataView(count.buffer).getUint32(0, true);
  if (!bytes || !entries || bytes < entries * COUNTER_VALUE_ITEM_BYTES_64) return null;
  const output = new Uint8Array(bytes);
  if (library.symbols.PdhGetFormattedCounterArrayW(counter, PDH_FMT_DOUBLE, size, count, deno.UnsafePointer.of(output)) !== PDH_SUCCESS) return null;
  const view = new DataView(output.buffer, output.byteOffset, output.byteLength);
  const result = view.getFloat64(COUNTER_VALUE_OFFSET_64, true);
  return Number.isFinite(result) && result >= 0 ? result : null;
}

/**
 * Cross-vendor Windows disk transfer rates. `_Total` is the operating system's
 * aggregate physical-disk counter, so it stays useful on PCs without HWiNFO.
 */
export function readDiskIoRates(): DiskIoRates | null {
  try {
    const deno = runtime();
    const library = api();
    const active = openCounters();
    if (!deno || !library || !active || library.symbols.PdhCollectQueryData(active.query) !== PDH_SUCCESS) return null;
    return {
      readMbPerSec: (() => { const bytes = value(deno, library, active.read); return bytes === null ? null : bytes / MIB; })(),
      writeMbPerSec: (() => { const bytes = value(deno, library, active.write); return bytes === null ? null : bytes / MIB; })(),
    };
  } catch {
    return null;
  }
}
