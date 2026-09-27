import {verifyBatteryPayload} from './scripts/battery-payload.ts';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { createHash } from 'node:crypto';
import { cpSync, readFileSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';
import { defineConfig } from 'vite';
import { bridgething, daemonProxy } from './scripts/bridgething.ts';

const PAWNIO_INSTALLER_SHA256 = '1F519A22E47187F70A1379A48CA604981C4FCF694F4E65B734AAA74A9FBA3032';
const PRESENTMON_SHA256 = '9BEC3083069F58F911E6A512F4806DB51A27BD096103087BC1D05EF54C80A191';
const PRESENTMON_HOST_SHA256 = '87181A479E96D82ED6A983E4C98C92D2E81105DE9653853913440D6C1F8AC728';
const CPU_HOST_DLL_SHA256 = '67B4FD74AA88FC394D1EB83DF94C10DBA7FACAC7345FDC50D1E7F63DB251E84E';
const MEDIA_HOST_SHA256 = 'B13DF3A2DBD48F5285973F5BCA6CACF5C0B9E292614950B9D0A04E69751FDF2F';

function assertFileSha256(path: string, expected: string, label: string) {
  const actual = createHash('sha256').update(readFileSync(path)).digest('hex').toUpperCase();
  if (actual !== expected) throw new Error(`${label} SHA-256 mismatch: ${actual}`);
}

const CPU_HOST_REQUIRED_FILES = [`BrutalDashCpuHost.dll`, `BrutalDashCpuHost.runtimeconfig.json`, `BrutalDashCpuHost.deps.json`, `coreclr.dll`, `hostfxr.dll`, `hostpolicy.dll`] as const;
function assertMultifileCpuHost(directory: string) { const apphost = readFileSync(resolve(directory, `BrutalDashCpuHost.exe`)); if (apphost.byteLength >= 1_000_000) throw new Error(`bundled CPU helper apphost is unexpectedly large (${apphost.byteLength} bytes); single-file publish is not allowed`); for (const name of CPU_HOST_REQUIRED_FILES) readFileSync(resolve(directory, name)); }

function packageNativeTools() {
  return {
    name: 'package-native-tools-with-extension',
    apply: 'build' as const,
    buildStart() {
      const font = readFileSync(resolve('src/fonts/Inter-Variable.woff2'));
      if (font.toString('ascii', 0, 4) !== 'wOF2') throw new Error('Bundled Inter WOFF2 font is missing or invalid');
    },
    closeBundle() {
      verifyBatteryPayload(resolve('extension/vendor/battery-host'));
      cpSync(resolve('extension/vendor/battery-host'),resolve('dist/extension/vendor/battery-host'),{recursive:true,filter:path=>!/__pycache__|\.pyc$/.test(path)});
      const source = resolve('public/vendor/presentmon');
      const bundled = resolve('dist/extension/vendor/presentmon');
      cpSync(source, bundled, { recursive: true });
      assertFileSha256(resolve(bundled, 'PresentMon.exe'), PRESENTMON_SHA256, 'bundled Intel PresentMon');
      assertFileSha256(resolve(bundled, 'BrutalDashPresentMonHost.exe'), PRESENTMON_HOST_SHA256, 'bundled PresentMon launcher');
      assertWindowsGuiSubsystem(resolve(bundled, 'BrutalDashPresentMonHost.exe'));
      cpSync(resolve('extension/vendor/media-host'), resolve('dist/extension/vendor/media-host'), { recursive: true, filter: path => !/server-test/i.test(path) });
      assertWindowsGuiSubsystem(resolve('dist/extension/vendor/media-host/BrutalDashMediaHost.exe'));
      assertFileSha256(resolve('dist/extension/vendor/media-host/BrutalDashMediaHost.exe'), MEDIA_HOST_SHA256, 'bundled media helper');
      cpSync(resolve('extension/vendor/cpu-host'), resolve('dist/extension/vendor/cpu-host'), { recursive: true, filter: path => !/\.pdb$/i.test(path) });
      assertWindowsGuiSubsystem(resolve('dist/extension/vendor/cpu-host/BrutalDashCpuHost.exe'));
      assertMultifileCpuHost(resolve(`dist/extension/vendor/cpu-host`));
      assertFileSha256(resolve('dist/extension/vendor/cpu-host/BrutalDashCpuHost.dll'), CPU_HOST_DLL_SHA256, 'bundled CPU helper');
      assertFileSha256(resolve('dist/extension/vendor/cpu-host/PawnIO_setup.exe'), PAWNIO_INSTALLER_SHA256, 'bundled PawnIO hardware-access installer');
      // The device webapp never executes PresentMon. Keep one copy only, under
      // extension/, which is the directory BridgeThing extracts on desktop.
      rmSync(resolve('dist/vendor'), { recursive: true, force: true });
    },
  };
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
