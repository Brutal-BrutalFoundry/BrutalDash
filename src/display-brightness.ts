export type DisplayBrightness = { mode: 'auto' | 'manual'; level: number; effectiveLevel: number };
type Hardware = {
  stateGet(): Promise<{ ok: boolean; response?: { state: { brightness: DisplayBrightness } } }>;
  displaySetLevel(value: { level: number }): Promise<void>;
  displaySetMode(value: { mode: 'auto' | 'manual' }): Promise<void>;
};

// Own only the temporary clock override. Serialize wheel and restore writes so
// a delayed wheel command cannot dim the dashboard after telemetry reconnects.
export class ClockBrightnessController {
  private previous: DisplayBrightness | null = null;
  private tail: Promise<void> = Promise.resolve();
  private clockActive = false;
  private desiredLevel: number | null = null;
  private pendingWheel: Promise<void> | null = null;
  constructor(private hardware: Hardware) {}

  private enqueue(action: () => Promise<void>) {
    const next = this.tail.then(action);
    this.tail = next.catch(() => undefined);
    return next;
  }

  setClockActive(active: boolean) {
    this.clockActive = active;
    if (active) return Promise.resolve();
    this.desiredLevel = null;
    return this.enqueue(async () => {
      if (!this.previous) return;
      const previous = this.previous;
      await this.hardware.displaySetLevel({ level: previous.level });
      await this.hardware.displaySetMode({ mode: previous.mode });
      this.previous = null;
    });
  }

  setLevel(level: number) {
    if (!this.clockActive) return Promise.resolve();
    this.desiredLevel = Math.max(0.03, Math.min(1, level));
    if (this.pendingWheel) return this.pendingWheel;
    const work = this.enqueue(async () => {
      if (!this.clockActive || this.desiredLevel === null) return;
      if (!this.previous) {
        const result = await this.hardware.stateGet();
        if (!result.ok || !result.response) throw new Error('Display state unavailable');
        this.previous = { ...result.response.state.brightness };
      }
      while (this.clockActive && this.desiredLevel !== null) {
        const next = this.desiredLevel;
        this.desiredLevel = null;
        await this.hardware.displaySetLevel({ level: next });
        if (this.clockActive) await this.hardware.displaySetMode({ mode: 'manual' });
      }
    });
    this.pendingWheel = work.finally(() => { this.pendingWheel = null; });
    return this.pendingWheel;
  }
}
