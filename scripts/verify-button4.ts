import { isSessionResetButtonKey, layoutSlotFromKey } from '../src/media.ts';
import { MetricRangeTracker } from '../extension/metric-ranges.ts';
import { metricKeys, type TelemetryMetrics } from '../src/types.ts';

const appSource = await Deno.readTextFile(new URL('../src/App.tsx', import.meta.url));
const extensionSource = await Deno.readTextFile(new URL('../extension/main.ts', import.meta.url));
const settingsSource = await Deno.readTextFile(new URL('../settings/main.tsx', import.meta.url));
const metrics = Object.fromEntries(metricKeys.map(key => [key, { value: null, unit: '', min: null, max: null }])) as TelemetryMetrics;
const ranges = new MetricRangeTracker();
metrics.cpuUsage.value = 54;
ranges.apply(metrics);
const firstRange = metrics.cpuUsage.min === 54 && metrics.cpuUsage.max === 54;
metrics.cpuUsage.value = 19;
ranges.apply(metrics);
const extendedRange = metrics.cpuUsage.min === 19 && metrics.cpuUsage.max === 54;
ranges.clear();
metrics.cpuUsage.value = 37;
metrics.cpuUsage.min = null;
metrics.cpuUsage.max = null;
ranges.apply(metrics);
const resetRange = metrics.cpuUsage.min === 37 && metrics.cpuUsage.max === 37;
const checks = [
  layoutSlotFromKey('1', 'Digit1') === 0,
  layoutSlotFromKey('3', 'Digit3') === 2,
  layoutSlotFromKey('4', 'Digit4') === null,
  isSessionResetButtonKey('4', 'Digit4') === true,
  isSessionResetButtonKey('3', 'Digit3') === false,
  appSource.includes('type: "metrics:reset-ranges"'),
  appSource.includes('Session min/max reset'),
  extensionSource.includes("type: 'metrics:reset-ranges'"),
  extensionSource.includes('metricRanges.clear()'),
  settingsSource.includes('Button 4 — Reset session min/max'),
  firstRange,
  extendedRange,
  resetRange,
  !appSource.includes('playlist:launch'),
  !extensionSource.includes('playlist:launch'),
];

if (checks.some(check => !check)) {
  console.error(JSON.stringify(checks));
  Deno.exit(1);
}
console.log(JSON.stringify({ passed: checks.length, failed: 0 }));
