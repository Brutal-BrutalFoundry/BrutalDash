export type NetworkQuality = {
  target: string; latencyMs: number | null; lossPercent: number | null;
  samples: number; received: number; updatedAt: number | null; error: string | null;
};
export function validProbeTarget(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{1,3}(\.\d{1,3}){3}$/.test(value)) return false;
  const parts = value.split('.').map(Number);
  return parts.every(n => n >= 0 && n <= 255) && parts[0] > 0 && parts[0] < 224 && value !== '255.255.255.255';
}
