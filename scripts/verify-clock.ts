import { pcClockDate, shouldShowClock } from '../src/clock.ts';

const now = Date.UTC(2026, 8, 8, 16, 30, 0);
const checks = [
  shouldShowClock('automatic', now, now - 11_999, false) === false,
  shouldShowClock('automatic', now, now - 12_001, false) === true,
  shouldShowClock('dashboard', now, 0, false) === false,
  shouldShowClock('clock', now, now, false) === true,
  shouldShowClock('clock', now, now, true) === false,
  pcClockDate(now, 240).toISOString() === '2026-09-08T12:30:00.000Z',
];

if (checks.some(result => !result)) {
  console.error(JSON.stringify(checks));
  Deno.exit(1);
}

console.log(JSON.stringify({ passed: checks.length, failed: 0 }));
