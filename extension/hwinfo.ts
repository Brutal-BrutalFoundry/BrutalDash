export type HwInfoSensor = {
  nameDefault: string;
  nameCustom: string;
  parentNameDefault: string;
  parentNameCustom: string;
  unit: string;
  valueNow: number;
};

type Kernel32Symbols = {
  OpenFileMappingW(access: number, inherit: number, name: Uint8Array): unknown;
  MapViewOfFile(mapping: unknown, access: number, offsetHigh: number, offsetLow: number, bytes: number): unknown;
  UnmapViewOfFile(view: unknown): number;
  CloseHandle(handle: unknown): number;
  OpenMutexW(access: number, inherit: number, name: Uint8Array): unknown;
  WaitForSingleObject(handle: unknown, timeout: number): number;
  ReleaseMutex(handle: unknown): number;
};

type Kernel32 = { symbols: Kernel32Symbols; close(): void };
type DenoRuntime = {
  build: { os: string };
  dlopen(path: string, symbols: Record<string, unknown>): Kernel32;
  UnsafePointerView: new (pointer: unknown) => { getArrayBuffer(length: number): ArrayBuffer };
};

const FILE_MAP_READ = 0x0004;
const SYNCHRONIZE = 0x00100000;
const WAIT_OBJECT_0 = 0;
const WAIT_ABANDONED = 0x80;
const MUTEX_TIMEOUT_MS = 25;
const HEADER_BYTES = 48;
const MAX_SENSORS = 4096;
const MAX_READINGS = 16384;
const MAX_MAPPING_BYTES = 16 * 1024 * 1024;
const SENSOR_NAME_BYTES = 128;
const UNIT_BYTES = 16;
const decoder = new TextDecoder();
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

function readText(bytes: Uint8Array, offset: number, length: number) {
  const end = Math.min(offset + length, bytes.length);
  let zero = offset;
  while (zero < end && bytes[zero] !== 0) zero += 1;
  return decoder.decode(bytes.subarray(offset, zero)).trim();
}

function isPointer(value: unknown): value is object {
  return value !== null && value !== undefined;
}

function checkedEnd(offset: number, size: number, count: number) {
  if (![offset, size, count].every(Number.isSafeInteger) || offset < HEADER_BYTES || size <= 0 || count < 0) return null;
  const end = offset + size * count;
  return Number.isSafeInteger(end) && end <= MAX_MAPPING_BYTES ? end : null;
}

function kernel(): Kernel32 | null {
  if (kernel32 !== undefined) return kernel32;
  const deno = runtime();
  if (!deno) return kernel32 = null;
  try {
    kernel32 = deno.dlopen('kernel32.dll', {
      OpenFileMappingW: { parameters: ['u32', 'u8', 'buffer'], result: 'pointer' },
      MapViewOfFile: { parameters: ['pointer', 'u32', 'u32', 'u32', 'usize'], result: 'pointer' },
      UnmapViewOfFile: { parameters: ['pointer'], result: 'u8' },
      CloseHandle: { parameters: ['pointer'], result: 'u8' },
      OpenMutexW: { parameters: ['u32', 'u8', 'buffer'], result: 'pointer' },
      WaitForSingleObject: { parameters: ['pointer', 'u32'], result: 'u32' },
      ReleaseMutex: { parameters: ['pointer'], result: 'u8' },
    });
  } catch {
    kernel32 = null;
  }
  return kernel32;
}

function snapshot() {
  const deno = runtime();
  const api = kernel();
  if (!deno || !api) return null;
  const mapping = api.symbols.OpenFileMappingW(FILE_MAP_READ, 0, utf16('Global\\HWiNFO_SENS_SM2'));
  if (!isPointer(mapping)) return null;
  const mutex = api.symbols.OpenMutexW(SYNCHRONIZE, 0, utf16('Global\\HWiNFO_SM2_MUTEX'));
  const view = api.symbols.MapViewOfFile(mapping, FILE_MAP_READ, 0, 0, 0);
  let ownsMutex = false;
  try {
    if (!isPointer(view)) return null;
    if (isPointer(mutex)) {
      const wait = api.symbols.WaitForSingleObject(mutex, MUTEX_TIMEOUT_MS);
      if (wait !== WAIT_OBJECT_0 && wait !== WAIT_ABANDONED) return null;
      ownsMutex = true;
    }
    const pointerView = new deno.UnsafePointerView(view);
    const header = pointerView.getArrayBuffer(HEADER_BYTES);
    const fields = new DataView(header);
    const signature = String.fromCharCode(...new Uint8Array(header, 0, 4));
    const sensorEnd = checkedEnd(fields.getUint32(20, true), fields.getUint32(24, true), fields.getUint32(28, true));
    const readingEnd = checkedEnd(fields.getUint32(32, true), fields.getUint32(36, true), fields.getUint32(40, true));
    if (signature !== 'HWiS' || !sensorEnd || !readingEnd) return null;
    // getArrayBuffer is a view over the mapped Windows pages, not an owned copy.
    // It must be copied before the finally block unmaps those pages; otherwise a
    // later parser read can dereference unmapped memory and crash the extension.
    const mapped = new Uint8Array(pointerView.getArrayBuffer(Math.max(HEADER_BYTES, sensorEnd, readingEnd)));
    return mapped.slice().buffer;
  } finally {
    if (ownsMutex && isPointer(mutex)) api.symbols.ReleaseMutex(mutex);
    if (isPointer(mutex)) api.symbols.CloseHandle(mutex);
    if (isPointer(view)) api.symbols.UnmapViewOfFile(view);
    api.symbols.CloseHandle(mapping);
  }
}

export function parseHwInfoSharedMemory(buffer: ArrayBuffer): HwInfoSensor[] {
  try {
    const fields = new DataView(buffer);
    const bytes = new Uint8Array(buffer);
    const signature = String.fromCharCode(...bytes.subarray(0, 4));
    if (signature !== 'HWiS') return [];
    const sensorOffset = fields.getUint32(20, true);
    const sensorSize = fields.getUint32(24, true);
    const sensorCount = fields.getUint32(28, true);
    const readingOffset = fields.getUint32(32, true);
    const readingSize = fields.getUint32(36, true);
    const readingCount = fields.getUint32(40, true);
    const sensorEnd = checkedEnd(sensorOffset, sensorSize, sensorCount);
    const readingEnd = checkedEnd(readingOffset, readingSize, readingCount);
    if (
      sensorCount > MAX_SENSORS
      || readingCount > MAX_READINGS
      || sensorSize < 264
      || readingSize < 316
      || !sensorEnd
      || !readingEnd
      || sensorEnd > buffer.byteLength
      || readingEnd > buffer.byteLength
    ) return [];
    const parents = Array.from({ length: sensorCount }, (_, index) => {
      const offset = sensorOffset + sensorSize * index;
      return {
        original: readText(bytes, offset + 8, SENSOR_NAME_BYTES),
        custom: readText(bytes, offset + 8 + SENSOR_NAME_BYTES, SENSOR_NAME_BYTES),
      };
    });
    const sensors: HwInfoSensor[] = [];
    for (let index = 0; index < readingCount; index += 1) {
      const offset = readingOffset + readingSize * index;
      const parent = parents[fields.getUint32(offset + 4, true)];
      const valueNow = fields.getFloat64(offset + 284, true);
      if (!parent || !Number.isFinite(valueNow)) continue;
      sensors.push({
        nameDefault: readText(bytes, offset + 12, SENSOR_NAME_BYTES),
        nameCustom: readText(bytes, offset + 12 + SENSOR_NAME_BYTES, SENSOR_NAME_BYTES),
        parentNameDefault: parent.original,
        parentNameCustom: parent.custom,
        unit: readText(bytes, offset + 12 + SENSOR_NAME_BYTES * 2, UNIT_BYTES),
        valueNow,
      });
    }
    return sensors;
  } catch {
    return [];
  }
}

export function readHwInfoSharedMemory(): HwInfoSensor[] {
  const buffer = snapshot();
  return buffer ? parseHwInfoSharedMemory(buffer) : [];
}
