import { access, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { validate } from '@bridgething/catalog';

const root = resolve(import.meta.dirname, '..');
const catalogPath = resolve(root, 'store', 'catalog.json');
const catalog = validate(JSON.parse(await readFile(catalogPath, 'utf8')));

for (const screenshot of catalog.apps[0].screenshots || []) {
  const filename = new URL(screenshot).pathname.split('/').at(-1);
  await access(resolve(root, 'store', 'screenshots', filename));
}

console.log(`Validated ${catalog.apps.length} app, ${catalog.apps[0].screenshots?.length || 0} screenshots, and ${catalog.apps[0].versions[0].version}.`);
