import type { ClockMode } from './types';

export const CLOCK_DISCONNECT_DELAY_MS = 12_000;

export function shouldShowClock(mode: ClockMode, now: number, lastPacketReceivedAt: number, editorOpen: boolean) {
  if (editorOpen || mode === 'dashboard') return false;
  if (mode === 'clock') return true;
  return now - lastPacketReceivedAt > CLOCK_DISCONNECT_DELAY_MS;
}

/** Converts an epoch timestamp into a UTC-formatted Date carrying PC wall time. */
export function pcClockDate(now: number, pcTimeOffsetMinutes: number) {
  const safeOffset = Number.isFinite(pcTimeOffsetMinutes) ? pcTimeOffsetMinutes : 0;
  return new Date(now - safeOffset * 60_000);
}
