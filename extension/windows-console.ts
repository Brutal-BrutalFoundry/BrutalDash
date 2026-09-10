/**
 * BridgeThing Desktop 0.12.4 starts its Deno extension runtime as a Windows
 * console process. Detach immediately so Windows Terminal does not remain open.
 * BridgeThing's stdin/stdout/stderr pipes are inherited handles and continue to
 * carry the extension protocol after the process leaves the console session.
 */
export function detachBridgeThingConsole(): void {
  type Kernel32 = { symbols: { FreeConsole(): number }; close(): void };
  type DenoRuntime = {
    build: { os: string };
    dlopen(path: string, symbols: Record<string, unknown>): Kernel32;
  };
  const deno = (globalThis as typeof globalThis & { Deno?: DenoRuntime }).Deno;
  if (!deno || deno.build.os !== 'windows') return;

  try {
    const kernel32 = deno.dlopen('kernel32.dll', {
      FreeConsole: { parameters: [], result: 'i32' },
    });
    try {
      kernel32.symbols.FreeConsole();
    } finally {
      kernel32.close();
    }
  } catch {
    // This is a cosmetic compatibility shield. Telemetry must still start if
    // the host already detached the runtime or Windows refuses the call.
  }
}
