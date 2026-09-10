export type ForegroundApp = {
  pid: number;
  name: string;
  path: string;
  title: string;
  fullscreen: boolean;
};

type User32Symbols = {
  GetForegroundWindow(): unknown;
  GetWindowThreadProcessId(window: unknown, processId: Uint32Array): number;
  GetWindowTextW(window: unknown, text: Uint8Array, maxCount: number): number;
  GetWindowRect(window: unknown, rect: Uint8Array): number;
  MonitorFromWindow(window: unknown, flags: number): unknown;
  GetMonitorInfoW(monitor: unknown, info: Uint8Array): number;
};

type Kernel32Symbols = {
  OpenProcess(access: number, inherit: number, processId: number): unknown;
  QueryFullProcessImageNameW(process: unknown, flags: number, path: Uint8Array, length: Uint32Array): number;
  CloseHandle(handle: unknown): number;
};

type User32 = { symbols: User32Symbols };
type Kernel32 = { symbols: Kernel32Symbols };
type DenoRuntime = {
  build: { os: string };
  dlopen(path: string, symbols: Record<string, unknown>): User32 | Kernel32;
};

const PROCESS_QUERY_LIMITED_INFORMATION = 0x1000;
const TEXT_BUFFER_CHARS = 1024;
const MONITOR_DEFAULTTONEAREST = 2;
let user32: User32 | null | undefined;
let kernel32: Kernel32 | null | undefined;

function runtime(): DenoRuntime | null {
  const candidate = (globalThis as typeof globalThis & { Deno?: DenoRuntime }).Deno;
  return candidate && candidate.build.os === 'windows' ? candidate : null;
}

function isPointer(value: unknown): value is object | bigint {
  return value !== null && value !== undefined;
}

function text(bytes: Uint8Array, characters?: number) {
  const limit = Math.min(characters === undefined ? bytes.byteLength / 2 : characters, bytes.byteLength / 2);
  return new TextDecoder('utf-16le').decode(bytes.subarray(0, limit * 2)).replace(/\0.*$/, '').trim();
}

function nameFromPath(path: string) {
  return path.split(/[\\/]/).pop()?.replace(/\.exe$/i, '').trim() || '';
}

function apis() {
  if (user32 !== undefined && kernel32 !== undefined) return user32 && kernel32 ? { user32, kernel32 } : null;
  const deno = runtime();
  if (!deno) {
    user32 = null;
    kernel32 = null;
    return null;
  }
  try {
    user32 = deno.dlopen('user32.dll', {
      GetForegroundWindow: { parameters: [], result: 'pointer' },
      GetWindowThreadProcessId: { parameters: ['pointer', 'buffer'], result: 'u32' },
      GetWindowTextW: { parameters: ['pointer', 'buffer', 'i32'], result: 'i32' },
      GetWindowRect: { parameters: ['pointer', 'buffer'], result: 'i32' },
      MonitorFromWindow: { parameters: ['pointer', 'u32'], result: 'pointer' },
      GetMonitorInfoW: { parameters: ['pointer', 'buffer'], result: 'i32' },
    }) as User32;
    kernel32 = deno.dlopen('kernel32.dll', {
      OpenProcess: { parameters: ['u32', 'u8', 'u32'], result: 'pointer' },
      QueryFullProcessImageNameW: { parameters: ['pointer', 'u32', 'buffer', 'buffer'], result: 'u8' },
      CloseHandle: { parameters: ['pointer'], result: 'u8' },
    }) as Kernel32;
  } catch {
    user32 = null;
    kernel32 = null;
  }
  return user32 && kernel32 ? { user32, kernel32 } : null;
}

function isFullscreenWindow(api: User32, window: unknown) {
  const windowRect = new Uint8Array(16);
  if (!api.symbols.GetWindowRect(window, windowRect)) return false;
  const monitor = api.symbols.MonitorFromWindow(window, MONITOR_DEFAULTTONEAREST);
  if (!isPointer(monitor)) return false;
  const monitorInfo = new Uint8Array(40);
  new DataView(monitorInfo.buffer).setUint32(0, monitorInfo.byteLength, true);
  if (!api.symbols.GetMonitorInfoW(monitor, monitorInfo)) return false;
  const windowValues = new Int32Array(windowRect.buffer);
  const monitorValues = new Int32Array(monitorInfo.buffer, 4, 4);
  const tolerance = 8;
  return Math.abs(windowValues[0] - monitorValues[0]) <= tolerance
    && Math.abs(windowValues[1] - monitorValues[1]) <= tolerance
    && Math.abs(windowValues[2] - monitorValues[2]) <= tolerance
    && Math.abs(windowValues[3] - monitorValues[3]) <= tolerance;
}

/** Reads the current foreground window only. It never writes to or controls a process. */
export function readForegroundApp(): ForegroundApp | null {
  try {
    const api = apis();
    if (!api) return null;
    const window = api.user32.symbols.GetForegroundWindow();
    if (!isPointer(window)) return null;
    const processId = new Uint32Array(1);
    api.user32.symbols.GetWindowThreadProcessId(window, processId);
    const pid = processId[0];
    if (!pid) return null;

    const titleBuffer = new Uint8Array(TEXT_BUFFER_CHARS * 2);
    const titleLength = api.user32.symbols.GetWindowTextW(window, titleBuffer, TEXT_BUFFER_CHARS);
    const process = api.kernel32.symbols.OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, 0, pid);
    if (!isPointer(process)) return null;
    try {
      const pathBuffer = new Uint8Array(TEXT_BUFFER_CHARS * 2);
      const pathLength = new Uint32Array([TEXT_BUFFER_CHARS - 1]);
      if (!api.kernel32.symbols.QueryFullProcessImageNameW(process, 0, pathBuffer, pathLength)) return null;
      const path = text(pathBuffer, pathLength[0]);
      const name = nameFromPath(path);
      if (!name) return null;
      return { pid, name, path, title: text(titleBuffer, Math.max(0, titleLength)), fullscreen: isFullscreenWindow(api.user32, window) };
    } finally {
      api.kernel32.symbols.CloseHandle(process);
    }
  } catch {
    return null;
  }
}
