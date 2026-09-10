import {
  isMediaToggleKey,
  isSessionResetButtonKey,
  layoutSlotFromKey,
  mediaSwipeIntent,
  playbackProgress,
  unavailableMetricMessage,
  wheelDirection,
} from '../src/media.ts';
import { systemMediaVirtualKey } from '../extension/media-controls.ts';

const appSource = await Deno.readTextFile(new URL('../src/App.tsx', import.meta.url));
const extensionSource = await Deno.readTextFile(new URL('../extension/main.ts', import.meta.url));
const volumeSource = await Deno.readTextFile(new URL('../extension/media-volume.ts', import.meta.url));

const checks = [
  isMediaToggleKey('m', 'KeyM', false) === true,
  isMediaToggleKey('M', 'KeyM', false) === true,
  isMediaToggleKey('m', 'KeyM', true) === false,
  isMediaToggleKey('Escape', 'Escape', false) === true,
  isMediaToggleKey('Escape', 'Escape', true) === false,
  layoutSlotFromKey('1', 'Digit1') === 0,
  layoutSlotFromKey('4', 'Digit4') === null,
  isSessionResetButtonKey('4', 'Digit4') === true,
  layoutSlotFromKey('m', 'KeyM') === null,
  mediaSwipeIntent(470, 410) === 'open',
  mediaSwipeIntent(410, 470) === 'close',
  mediaSwipeIntent(470, 445) === null,
  wheelDirection(120, 0) === 1,
  wheelDirection(-120, 0) === -1,
  wheelDirection(0, 120) === 1,
  wheelDirection(4, 2) === 0,
  playbackProgress(30_000, 120_000, false, 1_000, 6_000) === 25,
  playbackProgress(30_000, 120_000, true, 1_000, 6_000) === 29.166666666666668,
  playbackProgress(130_000, 120_000, true, 1_000, 6_000) === 100,
  playbackProgress(30_000, null, true, 1_000, 6_000) === null,
  unavailableMetricMessage('fps', true, null) === 'Launch a game for FPS',
  unavailableMetricMessage('fps', true, 'War Thunder') === 'Waiting for FPS capture',
  unavailableMetricMessage('gpuUsage', true, null) === 'Sensor unavailable',
  unavailableMetricMessage('fps', false, null, 'Starting BrutalDash telemetry…') === 'Starting BrutalDash telemetry…',
  systemMediaVirtualKey('previous') === 0xb1,
  systemMediaVirtualKey('playPause') === 0xb3,
  systemMediaVirtualKey('next') === 0xb0,
  !/client\.player\.(?:pause|resume|skipPrev|skipNext)\b/.test(appSource),
  !/client\.audio\./.test(appSource),
  appSource.includes('type: "media:volume"'),
  extensionSource.includes("type: 'media:volume'"),
  extensionSource.includes("type: 'metrics:reset-ranges'"),
  volumeSource.includes('never falls back to endpoint/master volume or a phone API'),
];

if (checks.some(result => !result)) {
  console.error(JSON.stringify(checks));
  Deno.exit(1);
}

console.log(JSON.stringify({ passed: checks.length, failed: 0 }));
