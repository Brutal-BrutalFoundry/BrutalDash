import { defaultPreferences } from '../src/types.ts';
import { detectedGame, fpsCaptureTarget, gameCandidate } from '../extension/game.ts';
import type { ForegroundApp } from '../extension/foreground.ts';

const app = (input: Partial<ForegroundApp> & Pick<ForegroundApp, 'name'>): ForegroundApp => ({
  pid: 1,
  path: `C:\\Standalone\\${input.name}.exe`,
  title: input.name,
  fullscreen: false,
  ...input,
});

const automatic = { ...defaultPreferences, gameInclude: [], gameExclude: [] };
const checks = [
  gameCandidate(app({ name: 'ChatGPT', fullscreen: true }), automatic) === null,
  detectedGame(app({ name: 'ChatGPT', fullscreen: true }), true, automatic) === null,
  gameCandidate(app({ name: 'SnippingTool', fullscreen: true }), automatic) === null,
  gameCandidate(app({ name: 'HWiNFO64', fullscreen: true }), automatic) === null,
  detectedGame(app({ name: 'PresentMon', fullscreen: true }), true, automatic) === null,
  gameCandidate(app({ name: 'OddLauncher', title: 'My Standalone Game', fullscreen: true }), automatic) === 'OddLauncher.exe',
  detectedGame(app({ name: 'OddLauncher', title: 'My Standalone Game', fullscreen: true }), false, automatic) === null,
  detectedGame(app({ name: 'OddLauncher', title: 'My Standalone Game', fullscreen: true }), true, automatic) === 'My Standalone Game',
  detectedGame(app({ name: 'aces', title: 'aces' }), false, automatic) === 'War Thunder',
  detectedGame(app({ name: 'aces' }), true, { ...automatic, gameExclude: ['aces.exe'] }) === null,
  detectedGame(app({ name: 'StrangeWindow' }), false, { ...automatic, gameInclude: ['StrangeWindow.exe'] }) === 'Strange Window',
  gameCandidate(app({ name: 'OddLauncher', fullscreen: true }), { ...automatic, gameInclude: undefined, gameExclude: undefined } as never) === 'OddLauncher.exe',
  fpsCaptureTarget(app({ name: 'ChatGPT', fullscreen: true }), automatic, null, 20_000, 15_000).sensorProcessName === null,
  fpsCaptureTarget(null, automatic, { processName: 'aces.exe', seenAt: 10_000 }, 20_000, 15_000).sensorProcessName === 'aces.exe',
  fpsCaptureTarget(null, automatic, { processName: 'aces.exe', seenAt: 1_000 }, 20_000, 15_000).sensorProcessName === null,
  fpsCaptureTarget(app({ name: 'aces' }), automatic, null, 20_000, 15_000).liveProcessName === 'aces.exe',
];

if (checks.some(result => !result)) {
  console.error(JSON.stringify(checks));
  Deno.exit(1);
}

console.log(JSON.stringify({ passed: checks.length, failed: 0 }));
