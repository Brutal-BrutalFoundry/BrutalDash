export function isMediaToggleKey(key: string, code: string, repeat: boolean) {
  return !repeat && (code === "KeyM" || key.toLowerCase() === "m" || code === "Escape" || key === "Escape");
}

export function layoutSlotFromKey(key: string, code: string): number | null {
  const match = /^(?:Digit)?([1-3])$/.exec(code || key);
  return match ? Number(match[1]) - 1 : null;
}

export function isSessionResetButtonKey(key: string, code: string) {
  return code === "Digit4" || key === "4";
}

export function mediaSwipeIntent(startY: number, endY: number, threshold = 42): "open" | "close" | null {
  const distance = endY - startY;
  if (distance <= -threshold) return "open";
  if (distance >= threshold) return "close";
  return null;
}

export function wheelDirection(deltaX: number, deltaY: number, threshold = 10): -1 | 0 | 1 {
  const delta = Math.abs(deltaX) >= Math.abs(deltaY) ? deltaX : deltaY;
  if (Math.abs(delta) < threshold) return 0;
  return delta > 0 ? 1 : -1;
}

export function playbackProgress(
  positionMs: number,
  durationMs: number | null,
  playing: boolean,
  receivedAt: number,
  now: number,
) {
  if (!durationMs || durationMs <= 0) return null;
  const advanced = playing ? Math.max(0, now - receivedAt) : 0;
  return Math.min(100, Math.max(0, ((positionMs + advanced) / durationMs) * 100));
}

export function unavailableMetricMessage(
  metric: string,
  connected: boolean,
  game: string | null,
  telemetryMessage?: string | null,
) {
  if (!connected) return telemetryMessage || "Waiting for telemetry";
  if (metric !== "fps") return "Sensor unavailable";
  return game ? "Waiting for FPS capture" : "Launch a game for FPS";
}
