#!/usr/bin/env bun
import { zipSync } from 'fflate';
import {verifyBatteryPayload} from './battery-payload.ts';
import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoDir = resolve(fileURLToPath(new URL('..', import.meta.url)));
const distDir = resolve(repoDir, 'dist');
const manifestPath = join(distDir, 'manifest.json');
const PAWNIO_INSTALLER_SHA256 = '1F519A22E47187F70A1379A48CA604981C4FCF694F4E65B734AAA74A9FBA3032';
const PRESENTMON_SHA256 = '9BEC3083069F58F911E6A512F4806DB51A27BD096103087BC1D05EF54C80A191';
const PRESENTMON_HOST_SHA256 = '87181A479E96D82ED6A983E4C98C92D2E81105DE9653853913440D6C1F8AC728';
const CPU_HOST_DLL_SHA256 = '67B4FD74AA88FC394D1EB83DF94C10DBA7FACAC7345FDC50D1E7F63DB251E84E';
const MEDIA_HOST_SHA256 = 'B13DF3A2DBD48F5285973F5BCA6CACF5C0B9E292614950B9D0A04E69751FDF2F';

if (!existsSync(manifestPath)) {
  console.error(`no manifest.json at ${manifestPath}; run 'bun run build' first`);
  process.exit(1);
}

const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as {
  name?: string;
  version?: string;
  icon?: string;
  settings?: string;
  extension?: { entry?: string };
};
const name = (manifest.name || 'webapp').replace(/[^a-z0-9._-]+/gi, '-');
const version = manifest.version || '0.0.0';

const files: Record<string, Uint8Array> = {};
function walk(dir: string): void {
  for (const entry of readdirSync(dir)) {
    const abs = join(dir, entry);
    if (statSync(abs).isDirectory()) walk(abs);
    else {
      // ZIP entry names are URL-style paths on every platform. Windows' path.relative()
      // returns backslashes, which BridgeThing correctly treats as different filenames.
      const archivePath = relative(distDir, abs).replaceAll('\\', '/');
      files[archivePath] = new Uint8Array(readFileSync(abs));
    }
  }
}
walk(distDir);
verifyBatteryPayload(resolve(distDir,'extension/vendor/battery-host'));

// A successful Vite build can leave an unresolved CSS URL behind. Validate
// local assets too, so a missing font cannot silently ship as system fallback.
for (const [path, bytes] of Object.entries(files)) {
  if (!/\.(?:css|html)$/.test(path)) continue;
  for (const match of new TextDecoder().decode(bytes).matchAll(/url\(["']?([^"')]+)["']?\)/g)) {
    const reference = match[1];
    if (/^(?:data:|https?:|#)/.test(reference)) continue;
    const local = new URL(reference, `https://bundle.invalid/${path}`).pathname.slice(1);
    if (!files[decodeURIComponent(local)]) throw new Error(`${path} references missing asset: ${reference}`);
  }
}
if (!files['licenses/Inter-OFL.txt']) throw new Error('Bundled font license is missing');

const invalidPath = Object.keys(files).find(path => path.includes('\\'));
if (invalidPath) throw new Error(`refusing to package a non-portable ZIP path: ${invalidPath}`);

const referencedFiles = [manifest.icon, manifest.settings, manifest.extension?.entry].filter(
  (path): path is string => Boolean(path),
);
for (const referenced of referencedFiles) {
  if (!files[referenced]) throw new Error(`manifest references a file missing from the ZIP: ${referenced}`);
}

const bridgeThingIconLimit = 64 * 1024;
if (manifest.settings && files[manifest.settings].byteLength > 1024 * 1024) {
  throw new Error('settings page exceeds BridgeThing\'s 1 MiB install limit');
}
if (manifest.icon && files[manifest.icon].byteLength > bridgeThingIconLimit) {
  throw new Error(
    `icon exceeds BridgeThing's 64 KiB limit: ${manifest.icon} is ${files[manifest.icon].byteLength} bytes`,
  );
}

function assertFileSha256(path: string, expected: string, label: string) {
  const file = files[path];
  if (!file) throw new Error(`release is missing ${path}`);
  const actual = createHash('sha256').update(file).digest('hex').toUpperCase();
  if (actual !== expected) throw new Error(`${label} SHA-256 mismatch: ${actual}`);
}

function assertGuiExecutable(path: string, label: string) {
  const executable = files[path];
  if (!executable) throw new Error(`release is missing ${path}`);
  const pe = new DataView(executable.buffer, executable.byteOffset, executable.byteLength);
  if (pe.getUint16(0, true) !== 0x5a4d) throw new Error(`${label} is not a Windows PE executable`);
  const peOffset = pe.getUint32(0x3c, true);
  const subsystem = pe.getUint16(peOffset + 24 + 68, true);
  if (subsystem !== 2) throw new Error(`${label} would open a console window (PE subsystem ${subsystem}, expected 2)`);
}

const CPU_HOST_REQUIRED_FILES = [`BrutalDashCpuHost.dll`, `BrutalDashCpuHost.runtimeconfig.json`, `BrutalDashCpuHost.deps.json`, `coreclr.dll`, `hostfxr.dll`, `hostpolicy.dll`] as const;
function assertMultifileCpuHost(prefix: string) { const apphostPath = `${prefix}/BrutalDashCpuHost.exe`; const apphost = files[apphostPath]; if (!apphost) throw new Error(`release is missing ${apphostPath}`); if (apphost.byteLength >= 1_000_000) throw new Error(`bundled CPU helper apphost is unexpectedly large (${apphost.byteLength} bytes); single-file publish is not allowed`); for (const name of CPU_HOST_REQUIRED_FILES) { const path = `${prefix}/${name}`; if (!files[path]) throw new Error(`release is missing required multi-file CPU runtime member: ${path}`); } }

assertFileSha256('extension/vendor/presentmon/PresentMon.exe', PRESENTMON_SHA256, 'bundled Intel PresentMon');
assertFileSha256('extension/vendor/presentmon/BrutalDashPresentMonHost.exe', PRESENTMON_HOST_SHA256, 'bundled PresentMon launcher');
assertGuiExecutable('extension/vendor/presentmon/BrutalDashPresentMonHost.exe', 'bundled PresentMon launcher');
assertGuiExecutable('extension/vendor/media-host/BrutalDashMediaHost.exe', 'bundled media helper');
assertFileSha256('extension/vendor/media-host/BrutalDashMediaHost.exe', MEDIA_HOST_SHA256, 'bundled media helper');
if (Object.keys(files).some(path => /server-test|\.pdb$/i.test(path))) throw new Error('test/debug payload must not be shipped');
assertGuiExecutable('extension/vendor/cpu-host/BrutalDashCpuHost.exe', 'bundled CPU helper');
assertMultifileCpuHost(`extension/vendor/cpu-host`);
assertFileSha256('extension/vendor/cpu-host/BrutalDashCpuHost.dll', CPU_HOST_DLL_SHA256, 'bundled CPU helper');
assertFileSha256('extension/vendor/cpu-host/PawnIO_setup.exe', PAWNIO_INSTALLER_SHA256, 'bundled PawnIO hardware-access installer');

const outputIndex = process.argv.indexOf('--output');
if (outputIndex >= 0 && !process.argv[outputIndex + 1]) throw new Error('--output requires a path');
const outPath = resolve(repoDir, outputIndex >= 0 ? process.argv[outputIndex + 1] : `${name}-${version}.zip`);
if (existsSync(outPath)) throw new Error(`refusing to overwrite existing release: ${outPath}`);
writeFileSync(outPath, zipSync(files, { level: 9 }));
console.log(`wrote ${relative(process.cwd(), outPath)} (${Object.keys(files).length} files)`);
console.log('share it: anyone with a bridgething Car Thing installs it from the companion app');
