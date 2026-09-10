import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { cpSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { defineConfig } from 'vite';
import { bridgething, daemonProxy } from './scripts/bridgething.ts';

function packageNativeTools() {
  return {
    name: 'package-native-tools-with-extension',
    apply: 'build' as const,
    closeBundle() {
      const source = resolve('public/vendor/presentmon');
      const bundled = resolve('dist/extension/vendor/presentmon');
      cpSync(source, bundled, { recursive: true });
      patchWindowsGuiSubsystem(resolve(bundled, 'PresentMon.exe'));
      cpSync(resolve('extension/vendor/media-host'), resolve('dist/extension/vendor/media-host'), { recursive: true });
      assertWindowsGuiSubsystem(resolve('dist/extension/vendor/media-host/BrutalDashMediaHost.exe'));
      // The device webapp never executes PresentMon. Keep one copy only, under
      // extension/, which is the directory BridgeThing extracts on desktop.
      rmSync(resolve('dist/vendor'), { recursive: true, force: true });
    },
  };
}

function patchWindowsGuiSubsystem(executable: string) {
  const bytes = readFileSync(executable);
  if (bytes.readUInt16LE(0) !== 0x5a4d) throw new Error('bundled PresentMon is not a Windows PE executable');
  const peOffset = bytes.readUInt32LE(0x3c);
  if (bytes.toString('ascii', peOffset, peOffset + 4) !== 'PE\0\0') throw new Error('bundled PresentMon has no PE signature');
  const optionalHeader = peOffset + 24;
  const magic = bytes.readUInt16LE(optionalHeader);
  if (magic !== 0x10b && magic !== 0x20b) throw new Error('bundled PresentMon has an unsupported PE header');
  const subsystemOffset = optionalHeader + 68;
  const subsystem = bytes.readUInt16LE(subsystemOffset);
  if (subsystem !== 2 && subsystem !== 3) throw new Error(`bundled PresentMon has unexpected subsystem ${subsystem}`);
  // BridgeThing starts the extension without a console. Mark only the shipped
  // copy as a GUI process so Windows does not flash a terminal when FPS capture
  // starts. PresentMon's inherited stdout/stderr pipes continue to carry CSV.
  bytes.writeUInt16LE(2, subsystemOffset);
  writeFileSync(executable, bytes);
}

function assertWindowsGuiSubsystem(executable: string) {
  const bytes = readFileSync(executable);
  if (bytes.readUInt16LE(0) !== 0x5a4d) throw new Error('media helper is not a Windows PE executable');
  const peOffset = bytes.readUInt32LE(0x3c);
  if (bytes.toString('ascii', peOffset, peOffset + 4) !== 'PE\0\0') throw new Error('media helper has no PE signature');
  const subsystem = bytes.readUInt16LE(peOffset + 24 + 68);
  if (subsystem !== 2) throw new Error(`media helper would open a console window (PE subsystem ${subsystem}, expected 2)`);
}

export default defineConfig(async () => ({
  plugins: [react(), tailwindcss(), bridgething(), packageNativeTools()],
  build: {
    target: 'es2022',
    // Source maps help local development but only occupy device storage in a
    // production bundle; keep the shipped dashboard lean.
    sourcemap: false,
  },
  server: {
    host: true,
    proxy: await daemonProxy(),
  },
}));
