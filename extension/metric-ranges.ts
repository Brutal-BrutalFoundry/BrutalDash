import { metricKeys, type MetricKey, type TelemetryMetrics } from '../src/types';

type Range = { min: number; max: number };

export class MetricRangeTracker {
  private readonly ranges = new Map<MetricKey, Range>();

  apply(metrics: TelemetryMetrics) {
    for (const key of metricKeys) {
      const value = metrics[key].value;
      if (typeof value !== 'number' || !Number.isFinite(value)) continue;
      const range = this.ranges.get(key);
      const next = range ? { min: Math.min(range.min, value), max: Math.max(range.max, value) } : { min: value, max: value };
      this.ranges.set(key, next);
      metrics[key].min = next.min;
      metrics[key].max = next.max;
    }
  }

  clear() {
    this.ranges.clear();
  }
}
