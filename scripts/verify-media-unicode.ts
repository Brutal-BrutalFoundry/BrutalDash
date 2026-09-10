import { verifyUnicodeMediaTransport } from '../extension/media-volume.ts';

const media = await verifyUnicodeMediaTransport();
const checks = [
  media.ok === true,
  media.title === 'Beyonc\u00e9 \u00d8resund',
  media.artist === '\u041f\u0440\u0438\u0432\u0435\u0442 \u65e5\u672c\u8a9e',
  media.album === '\ud83d\udc97',
];
if (checks.some(check => !check)) {
  console.error(JSON.stringify({ media, checks }));
  Deno.exit(1);
}
console.log(JSON.stringify({ passed: checks.length, failed: 0 }));
