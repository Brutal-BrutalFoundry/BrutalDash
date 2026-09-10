export type SystemMediaCommand = 'previous' | 'playPause' | 'next';

const virtualKeys: Record<SystemMediaCommand, number> = {
  previous: 0xb1,
  playPause: 0xb3,
  next: 0xb0,
};

export function systemMediaVirtualKey(command: SystemMediaCommand): number {
  return virtualKeys[command];
}

type User32 = {
  symbols: { keybd_event(key: number, scan: number, flags: number, extra: bigint): void };
  close(): void;
};

let user32: User32 | null = null;

export function sendSystemMediaCommand(command: SystemMediaCommand): boolean {
  type DenoRuntime = {
    build: { os: string };
    dlopen(path: string, symbols: Record<string, unknown>): unknown;
  };
  const deno = (globalThis as typeof globalThis & { Deno?: DenoRuntime }).Deno;
  if (!deno || deno.build.os !== 'windows') return false;
  try {
    user32 ||= deno.dlopen('user32.dll', {
      keybd_event: { parameters: ['u8', 'u8', 'u32', 'usize'], result: 'void' },
    }) as unknown as User32;
    const key = systemMediaVirtualKey(command);
    user32.symbols.keybd_event(key, 0, 0, 0n);
    user32.symbols.keybd_event(key, 0, 0x0002, 0n);
    return true;
  } catch {
    return false;
  }
}

export function closeSystemMediaControls(): void {
  user32?.close();
  user32 = null;
}
