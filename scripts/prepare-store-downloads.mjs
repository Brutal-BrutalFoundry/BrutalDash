import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

// Release assets stay out of Git. Pages receives verified copies at deployment.
const store = new URL('../store/', import.meta.url);
const catalog = JSON.parse(await readFile(new URL('catalog.json', store), 'utf8'));
await mkdir(new URL('downloads/', store), { recursive: true });
for (const app of catalog.apps) {
  for (const version of app.versions) {
    if (!/^\d+\.\d+\.\d+$/.test(version.version)) throw new Error('Unexpected release version');
    const filename = `BrutalDash-${version.version}.zip`;
    const publicUrl = `https://brutal-brutalfoundry.github.io/BrutalDash/downloads/${filename}`;
    if (version.download.url !== publicUrl) throw new Error(`Unexpected catalog URL: ${version.download.url}`);
    const releaseUrl = `https://github.com/Brutal-BrutalFoundry/BrutalDash/releases/download/v${version.version}/${filename}`;
    const response = await fetch(releaseUrl, { signal: AbortSignal.timeout(120000) });
    if (!response.ok) throw new Error(`Release download failed: ${response.status} ${releaseUrl}`);
    const bytes = Buffer.from(await response.arrayBuffer());
    const digest = createHash('sha256').update(bytes).digest('hex');
    if (bytes.length !== version.download.size || digest !== version.download.sha256) {
      throw new Error(`Release integrity mismatch: ${filename}`);
    }
    await writeFile(new URL(`downloads/${filename}`, store), bytes);
    console.log(`Verified ${filename}: ${bytes.length} bytes, ${digest}`);
  }
}
console.log(`Store downloads prepared in ${fileURLToPath(store)}`);
