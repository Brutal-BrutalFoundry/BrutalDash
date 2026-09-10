export type NvidiaGpuMetrics = {
  name: string;
  usagePercent: number | null;
  temperatureC: number | null;
  clockMhz: number | null;
  powerWatts: number | null;
  vramUsedGb: number | null;
  vramTotalGb: number | null;
};

type NvmlSymbols = {
  nvmlInit_v2(): number;
  nvmlDeviceGetCount_v2(count: Uint8Array): number;
  nvmlDeviceGetHandleByIndex_v2(index: number, handle: Uint8Array): number;
  nvmlDeviceGetName(handle: unknown, name: Uint8Array, length: number): number;
  nvmlDeviceGetUtilizationRates(handle: unknown, utilization: Uint8Array): number;
  nvmlDeviceGetTemperature(handle: unknown, sensor: number, temperature: Uint8Array): number;
  nvmlDeviceGetClockInfo(handle: unknown, clock: number, value: Uint8Array): number;
  nvmlDeviceGetPowerUsage(handle: unknown, power: Uint8Array): number;
  nvmlDeviceGetMemoryInfo(handle: unknown, memory: Uint8Array): number;
};

type Nvml = { symbols: NvmlSymbols; close(): void };
type DenoRuntime = {
  build: { os: string };
  UnsafePointer: { create(value: bigint): unknown };
  dlopen(path: string, symbols: Record<string, unknown>): Nvml;
};

const NVML_SUCCESS = 0;
const NVML_ERROR_ALREADY_INITIALIZED = 5;
const NVML_TEMPERATURE_GPU = 0;
const NVML_CLOCK_GRAPHICS = 0;
const GIB = 1024 ** 3;
let nvml: Nvml | null | undefined;
let initialized = false;

function runtime(): DenoRuntime | null {
  const candidate = (globalThis as typeof globalThis & { Deno?: DenoRuntime }).Deno;
  return candidate && candidate.build.os === 'windows' ? candidate : null;
}

function api(): Nvml | null {
  if (nvml !== undefined) return nvml;
  const deno = runtime();
  if (!deno) return nvml = null;
  try {
    nvml = deno.dlopen('nvml.dll', {
      nvmlInit_v2: { parameters: [], result: 'u32' },
      nvmlDeviceGetCount_v2: { parameters: ['buffer'], result: 'u32' },
      nvmlDeviceGetHandleByIndex_v2: { parameters: ['u32', 'buffer'], result: 'u32' },
      nvmlDeviceGetName: { parameters: ['pointer', 'buffer', 'u32'], result: 'u32' },
      nvmlDeviceGetUtilizationRates: { parameters: ['pointer', 'buffer'], result: 'u32' },
      nvmlDeviceGetTemperature: { parameters: ['pointer', 'u32', 'buffer'], result: 'u32' },
      nvmlDeviceGetClockInfo: { parameters: ['pointer', 'u32', 'buffer'], result: 'u32' },
      nvmlDeviceGetPowerUsage: { parameters: ['pointer', 'buffer'], result: 'u32' },
      nvmlDeviceGetMemoryInfo: { parameters: ['pointer', 'buffer'], result: 'u32' },
    });
  } catch {
    nvml = null;
  }
  return nvml;
}

function u32(buffer: Uint8Array, offset = 0) {
  return new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength).getUint32(offset, true);
}

function optionalU32(read: (output: Uint8Array) => number) {
  const output = new Uint8Array(4);
  return read(output) === NVML_SUCCESS ? u32(output) : null;
}

function openHandle(runtime: DenoRuntime, api: Nvml, index: number) {
  const raw = new Uint8Array(8);
  if (api.symbols.nvmlDeviceGetHandleByIndex_v2(index, raw) !== NVML_SUCCESS) return null;
  const value = new DataView(raw.buffer).getBigUint64(0, true);
  return value ? runtime.UnsafePointer.create(value) : null;
}

function readDevice(api: Nvml, handle: unknown): NvidiaGpuMetrics | null {
  const nameBuffer = new Uint8Array(96);
  if (api.symbols.nvmlDeviceGetName(handle, nameBuffer, nameBuffer.byteLength) !== NVML_SUCCESS) return null;
  const name = new TextDecoder().decode(nameBuffer).split('\0')[0].trim();
  if (!name) return null;
  const utilization = new Uint8Array(8);
  const usagePercent = api.symbols.nvmlDeviceGetUtilizationRates(handle, utilization) === NVML_SUCCESS ? u32(utilization) : null;
  const memory = new Uint8Array(24);
  const hasMemory = api.symbols.nvmlDeviceGetMemoryInfo(handle, memory) === NVML_SUCCESS;
  return {
    name,
    usagePercent,
    temperatureC: optionalU32(output => api.symbols.nvmlDeviceGetTemperature(handle, NVML_TEMPERATURE_GPU, output)),
    clockMhz: optionalU32(output => api.symbols.nvmlDeviceGetClockInfo(handle, NVML_CLOCK_GRAPHICS, output)),
    powerWatts: (() => {
      const milliwatts = optionalU32(output => api.symbols.nvmlDeviceGetPowerUsage(handle, output));
      return milliwatts === null ? null : milliwatts / 1000;
    })(),
    vramUsedGb: hasMemory ? Number(new DataView(memory.buffer).getBigUint64(16, true)) / GIB : null,
    vramTotalGb: hasMemory ? Number(new DataView(memory.buffer).getBigUint64(0, true)) / GIB : null,
  };
}

/**
 * Direct, read-only NVIDIA driver provider. It replaces per-poll nvidia-smi
 * process launches, but remains optional: non-NVIDIA systems simply return null.
 */
export function readNvidiaGpuMetrics(): NvidiaGpuMetrics | null {
  try {
    const deno = runtime();
    const driver = api();
    if (!deno || !driver) return null;
    if (!initialized) {
      const status = driver.symbols.nvmlInit_v2();
      if (status !== NVML_SUCCESS && status !== NVML_ERROR_ALREADY_INITIALIZED) return null;
      initialized = true;
    }
    const countBuffer = new Uint8Array(4);
    if (driver.symbols.nvmlDeviceGetCount_v2(countBuffer) !== NVML_SUCCESS) return null;
    const count = u32(countBuffer);
    let selected: NvidiaGpuMetrics | null = null;
    for (let index = 0; index < count; index += 1) {
      const handle = openHandle(deno, driver, index);
      if (!handle) continue;
      const metrics = readDevice(driver, handle);
      if (metrics && (selected?.usagePercent ?? -1) < (metrics.usagePercent ?? -1)) selected = metrics;
    }
    return selected;
  } catch {
    return null;
  }
}
