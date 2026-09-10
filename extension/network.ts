export type NetworkRates = {
  downKbps: number | null;
  upKbps: number | null;
};

type IpHelperSymbols = {
  GetIfTable(table: Uint8Array, size: Uint8Array, order: number): number;
};

type IpHelper = { symbols: IpHelperSymbols; close(): void };
type DenoRuntime = {
  build: { os: string };
  dlopen(path: string, symbols: Record<string, unknown>): IpHelper;
};

type InterfaceSample = { received: number; sent: number };

// MIB_IFROW is a fixed 860-byte record on Windows.  The byte offsets below are
// the documented dwIndex, dwType, dwOperStatus, dwInOctets, and dwOutOctets
// fields. GetIfTable's first DWORD is the entry count, followed by aligned rows.
const ERROR_INSUFFICIENT_BUFFER = 122;
const MIB_IFROW_BYTES = 860;
const MIB_IFROW_OFFSET = 4;
const IF_INDEX_OFFSET = 512;
const IF_TYPE_OFFSET = 516;
const IF_OPER_STATUS_OFFSET = 544;
const IF_IN_OCTETS_OFFSET = 552;
const IF_OUT_OCTETS_OFFSET = 576;
const ACTIVE_INTERFACE_STATUSES = new Set([5, 6]); // connected, operational
const EXCLUDED_INTERFACE_TYPES = new Set([24, 131, 144]); // loopback, tunnel, FireWire
const OCTET_COUNTER_MODULUS = 2 ** 32;

let ipHelper: IpHelper | null | undefined;
let previous = new Map<number, InterfaceSample>();
let previousAt = 0;

function runtime(): DenoRuntime | null {
  const candidate = (globalThis as typeof globalThis & { Deno?: DenoRuntime }).Deno;
  return candidate && candidate.build.os === 'windows' ? candidate : null;
}

function api(): IpHelper | null {
  if (ipHelper !== undefined) return ipHelper;
  const deno = runtime();
  if (!deno) return ipHelper = null;
  try {
    ipHelper = deno.dlopen('iphlpapi.dll', {
      GetIfTable: { parameters: ['buffer', 'buffer', 'u8'], result: 'u32' },
    });
  } catch {
    ipHelper = null;
  }
  return ipHelper;
}

function interfaceCounters(helper: IpHelper) {
  // Deno's buffer FFI type intentionally requires a real buffer. The Windows
  // API returns ERROR_INSUFFICIENT_BUFFER and writes the required length when
  // this minimal MIB_IFTABLE buffer is supplied.
  const seed = new Uint8Array(MIB_IFROW_OFFSET);
  const required = new Uint8Array(4);
  new DataView(required.buffer).setUint32(0, seed.byteLength, true);
  const initial = helper.symbols.GetIfTable(seed, required, 0);
  const bytes = new DataView(required.buffer).getUint32(0, true);
  if ((initial !== ERROR_INSUFFICIENT_BUFFER && initial !== 0) || bytes < MIB_IFROW_OFFSET) return null;
  const table = new Uint8Array(bytes);
  if (helper.symbols.GetIfTable(table, required, 0) !== 0) return null;
  const view = new DataView(table.buffer, table.byteOffset, table.byteLength);
  const count = view.getUint32(0, true);
  if (MIB_IFROW_OFFSET + count * MIB_IFROW_BYTES > table.byteLength) return null;
  const result = new Map<number, InterfaceSample>();
  for (let entry = 0; entry < count; entry += 1) {
    const row = MIB_IFROW_OFFSET + entry * MIB_IFROW_BYTES;
    const type = view.getUint32(row + IF_TYPE_OFFSET, true);
    const status = view.getUint32(row + IF_OPER_STATUS_OFFSET, true);
    if (!ACTIVE_INTERFACE_STATUSES.has(status) || EXCLUDED_INTERFACE_TYPES.has(type)) continue;
    result.set(view.getUint32(row + IF_INDEX_OFFSET, true), {
      received: view.getUint32(row + IF_IN_OCTETS_OFFSET, true),
      sent: view.getUint32(row + IF_OUT_OCTETS_OFFSET, true),
    });
  }
  return result;
}

function delta(current: number, before: number) {
  return current >= before ? current - before : current + OCTET_COUNTER_MODULUS - before;
}

/**
 * Reads Windows' own active-interface byte counters. This is lightweight,
 * read-only, and intentionally independent of HWiNFO.
 */
export function readNetworkRates(now = Date.now()): NetworkRates | null {
  try {
    const helper = api();
    if (!helper) return null;
    const current = interfaceCounters(helper);
    if (!current) return null;
    const elapsedSeconds = (now - previousAt) / 1000;
    let receivedDelta = 0;
    let sentDelta = 0;
    let matched = 0;
    if (previousAt > 0 && elapsedSeconds > 0) {
      for (const [index, sample] of current) {
        const before = previous.get(index);
        if (!before) continue;
        matched += 1;
        receivedDelta += delta(sample.received, before.received);
        sentDelta += delta(sample.sent, before.sent);
      }
    }
    previous = current;
    previousAt = now;
    if (!matched) return { downKbps: 0, upKbps: 0 };
    return {
      downKbps: receivedDelta / elapsedSeconds / 1024,
      upKbps: sentDelta / elapsedSeconds / 1024,
    };
  } catch {
    return null;
  }
}
