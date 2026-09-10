export type StorageSpace = {
  totalGb: number;
  usedGb: number;
  freeGb: number;
};

type Kernel32Symbols = {
  GetLogicalDriveStringsW(length: number, buffer: Uint8Array): number;
  GetDriveTypeW(rootPath: Uint8Array): number;
  GetDiskFreeSpaceExW(rootPath: Uint8Array, available: Uint8Array, total: Uint8Array, free: Uint8Array): number;
};

type Kernel32 = { symbols: Kernel32Symbols };
type DenoRuntime = {
  build: { os: string };
  dlopen(path: string, symbols: Record<string, unknown>): Kernel32;
};

const DRIVE_FIXED = 3;
const DRIVE_BUFFER_BYTES = 4096;
const GIB = 1024 ** 3;
let kernel32: Kernel32 | null | undefined;

function runtime(): DenoRuntime | null {
  const candidate = (globalThis as typeof globalThis & { Deno?: DenoRuntime }).Deno;
  return candidate && candidate.build.os === 'windows' ? candidate : null;
}

function utf16(value: string) {
  const bytes = new Uint8Array((value.length + 1) * 2);
  const view = new DataView(bytes.buffer);
  for (let index = 0; index < value.length; index += 1) view.setUint16(index * 2, value.charCodeAt(index), true);
  return bytes;
}

function kernel(): Kernel32 | null {
  if (kernel32 !== undefined) return kernel32;
  const deno = runtime();
  if (!deno) return kernel32 = null;
  try {
    kernel32 = deno.dlopen('kernel32.dll', {
      GetLogicalDriveStringsW: { parameters: ['u32', 'buffer'], result: 'u32' },
      GetDriveTypeW: { parameters: ['buffer'], result: 'u32' },
      GetDiskFreeSpaceExW: { parameters: ['buffer', 'buffer', 'buffer', 'buffer'], result: 'u8' },
    });
  } catch {
    kernel32 = null;
  }
  return kernel32;
}

function driveRoots(api: Kernel32): string[] {
  const buffer = new Uint8Array(DRIVE_BUFFER_BYTES);
  const written = api.symbols.GetLogicalDriveStringsW(buffer.byteLength / 2, buffer);
  if (!written || written >= buffer.byteLength / 2) return [];
  const names = new TextDecoder('utf-16le').decode(buffer.subarray(0, written * 2));
  return names.split('\0').filter(Boolean);
}

function size(api: Kernel32, root: string) {
  const available = new Uint8Array(8);
  const total = new Uint8Array(8);
  const free = new Uint8Array(8);
  if (!api.symbols.GetDiskFreeSpaceExW(utf16(root), available, total, free)) return null;
  const totalBytes = new DataView(total.buffer).getBigUint64(0, true);
  const freeBytes = new DataView(free.buffer).getBigUint64(0, true);
  if (totalBytes <= 0n || freeBytes > totalBytes) return null;
  return { totalBytes, freeBytes };
}

/**
 * Returns aggregate capacity for mounted fixed drives. This is intentionally
 * separate from HWiNFO's live transfer-rate stream and can be cached safely.
 */
export function readFixedDriveSpace(): StorageSpace | null {
  try {
    const api = kernel();
    if (!api) return null;
    let totalBytes = 0n;
    let freeBytes = 0n;
    for (const root of driveRoots(api)) {
      if (api.symbols.GetDriveTypeW(utf16(root)) !== DRIVE_FIXED) continue;
      const result = size(api, root);
      if (!result) continue;
      totalBytes += result.totalBytes;
      freeBytes += result.freeBytes;
    }
    if (!totalBytes) return null;
    const totalGb = Number(totalBytes) / GIB;
    const freeGb = Number(freeBytes) / GIB;
    return { totalGb, freeGb, usedGb: totalGb - freeGb };
  } catch {
    return null;
  }
}
