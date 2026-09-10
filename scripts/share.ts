#!/usr/bin/env bun
import { zipSync } from 'fflate';
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoDir = resolve(fileURLToPath(new URL('..', import.meta.url)));
const distDir = resolve(repoDir, 'dist');
const manifestPath = join(distDir, 'manifest.json');

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

const invalidPath = Object.keys(files).find(path => path.includes('\\'));
if (invalidPath) throw new Error(`refusing to package a non-portable ZIP path: ${invalidPath}`);

const referencedFiles = [manifest.icon, manifest.settings, manifest.extension?.entry].filter(
  (path): path is string => Boolean(path),
);
for (const referenced of referencedFiles) {
  if (!files[referenced]) throw new Error(`manifest references a file missing from the ZIP: ${referenced}`);
}

const bridgeThingIconLimit = 64 * 1024;
if (manifest.icon && files[manifest.icon].byteLength > bridgeThingIconLimit) {
  throw new Error(
    `icon exceeds BridgeThing's 64 KiB limit: ${manifest.icon} is ${files[manifest.icon].byteLength} bytes`,
  );
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

assertGuiExecutable('extension/vendor/presentmon/PresentMon.exe', 'bundled PresentMon');
assertGuiExecutable('extension/vendor/media-host/BrutalDashMediaHost.exe', 'bundled media helper');

const outPath = resolve(repoDir, `${name}-${version}.zip`);
writeFileSync(outPath, zipSync(files, { level: 9 }));
console.log(`wrote ${relative(process.cwd(), outPath)} (${Object.keys(files).length} files)`);
console.log('share it: anyone with a bridgething Car Thing installs it from the companion app');
