import { settings, type SettingsContext } from '@bridgething/client/settings';
import { useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';

import {
  cloneLayoutProfiles,
  cloneLayoutSlots,
  dashboardUiRevision,
  defaultLayout,
  defaultPreferences,
  layoutForPreset,
  metricKeys,
  type DashboardPreferences,
  type DashboardState,
  type ClockColorMode,
  type ClockFace,
  type ClockFormat,
  type ClockMode,
  type LayoutItem,
  type LayoutPreset,
  type MetricKey,
  type ThemeName,
  withLayoutProfile,
} from '../src/types';
import './style.css';

const dashboardDocKey = 'dashboard-state';
const dashboardConfigKey = 'dashboardState';
const themes: { value: ThemeName; label: string }[] = [
  { value: 'rog', label: 'ROG Neon' }, { value: 'nvidia', label: 'NVIDIA' },
  { value: 'miami', label: 'Neon Miami' }, { value: 'aurora', label: 'Aurora' },
  { value: 'synthwave', label: 'Synthwave' }, { value: 'arctic', label: 'Arctic' },
  { value: 'amber', label: 'Amber' }, { value: 'oled', label: 'OLED True Black' },
];
const presets: { value: LayoutPreset; label: string }[] = [
  { value: 'four', label: 'Four Big' }, { value: 'rows', label: 'System Rows' },
  { value: 'list', label: 'Readable List' }, { value: 'gaming', label: 'Gaming Focus' },
  { value: 'six', label: 'Balanced Six' }, { value: 'paged', label: 'Two at a Time' },
];
const metricLabels: Record<MetricKey, string> = {
  gpuUsage: 'GPU usage', gpuTemp: 'GPU temperature', gpuHotspot: 'GPU hotspot', gpuClock: 'GPU clock', gpuPower: 'GPU power',
  cpuUsage: 'CPU usage', cpuTemp: 'CPU temperature', cpuClock: 'CPU clock', cpuPower: 'CPU package power',
  ramUsed: 'RAM used / total', ramPercent: 'RAM usage', vramUsed: 'VRAM used / total', vramPercent: 'VRAM usage',
  storageUsed: 'Storage used / total', storagePercent: 'Storage usage', storageFree: 'Storage free',
  storageRead: 'Disk read', storageWrite: 'Disk write', networkDown: 'Download rate', networkUp: 'Upload rate',
  fps: 'FPS', frameTime: 'Frame time', onePercentLow: '1% low FPS',
};

function cloneLayout(layout: LayoutItem[]) {
  return layout.map(item => ({ ...item, details: [...item.details] }));
}

function clonePreferences(preferences: DashboardPreferences): DashboardPreferences {
  return {
    ...defaultPreferences,
    ...preferences,
    enabledMetrics: [...(preferences.enabledMetrics || defaultPreferences.enabledMetrics)],
    gameInclude: [...(preferences.gameInclude || [])],
    gameExclude: [...(preferences.gameExclude || [])],
  };
}

function defaultState(): DashboardState {
  return {
    layout: cloneLayout(defaultLayout),
    preferences: clonePreferences(defaultPreferences),
    layoutSlots: cloneLayoutSlots(),
    layoutProfiles: { four: cloneLayout(defaultLayout) },
    uiRevision: dashboardUiRevision,
  };
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function parseProcessList(value: string) {
  return [...new Set(value.split(/[\n,;]/).map(entry => entry.trim()).filter(Boolean))].slice(0, 100);
}

function parseState(value: string | null | undefined): DashboardState | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value) as Partial<DashboardState>;
    if (!Array.isArray(parsed.layout) || !parsed.preferences || typeof parsed.preferences !== 'object') return null;
    const preferences = parsed.preferences as Partial<DashboardPreferences>;
    if (!themes.some(theme => theme.value === preferences.theme) || !presets.some(preset => preset.value === preferences.layoutPreset)) return null;
    const layout = parsed.layout.slice(0, 18).flatMap((raw, index) => {
      const item = raw as Partial<LayoutItem>;
      if (!metricKeys.includes(item.metric as MetricKey)) return [];
      const details = Array.isArray(item.details)
        ? item.details.filter((metric): metric is MetricKey => metricKeys.includes(metric as MetricKey)).slice(0, 3)
        : [];
      return [{
        id: typeof item.id === 'string' && item.id ? item.id.slice(0, 40) : `card-${index + 1}`,
        metric: item.metric as MetricKey,
        details,
        x: clamp(Math.round(Number(item.x) || 0), 0, 5),
        y: clamp(Math.round(Number(item.y) || 0), 0, 11),
        w: clamp(Math.round(Number(item.w) || 2), 1, 6),
        h: clamp(Math.round(Number(item.h) || 1), 1, 4),
        hidden: Boolean(item.hidden),
        page: clamp(Math.round(Number(item.page) || 0), 0, 2),
      } satisfies LayoutItem];
    });
    if (!layout.length) return null;
    const layoutProfiles = cloneLayoutProfiles(parsed.layoutProfiles);
    layoutProfiles[preferences.layoutPreset as LayoutPreset] = cloneLayout(layout);
    return {
      layout,
      layoutSlots: cloneLayoutSlots(parsed.layoutSlots),
      layoutProfiles,
      preferences: {
        ...clonePreferences(defaultPreferences),
        ...preferences,
        enabledMetrics: Array.isArray(preferences.enabledMetrics)
          ? preferences.enabledMetrics.filter((metric): metric is MetricKey => metricKeys.includes(metric as MetricKey))
          : [...metricKeys],
        clockMode: (["automatic", "dashboard", "clock"] as const).includes(preferences.clockMode as ClockMode) ? preferences.clockMode! : defaultPreferences.clockMode,
        clockFace: (["bold", "foundry", "minimal", "analog-foundry", "analog-minimal"] as const).includes(preferences.clockFace as ClockFace) ? preferences.clockFace! : defaultPreferences.clockFace,
        clockFormat: (["12", "24"] as const).includes(preferences.clockFormat as ClockFormat) ? preferences.clockFormat! : defaultPreferences.clockFormat,
        clockShowDate: typeof preferences.clockShowDate === 'boolean' ? preferences.clockShowDate : defaultPreferences.clockShowDate,
        clockColorMode: (["theme", "custom"] as const).includes(preferences.clockColorMode as ClockColorMode) ? preferences.clockColorMode! : defaultPreferences.clockColorMode,
        clockColor: typeof preferences.clockColor === 'string' && /^#[0-9a-f]{6}$/i.test(preferences.clockColor) ? preferences.clockColor : defaultPreferences.clockColor,
        gameInclude: Array.isArray(preferences.gameInclude) ? preferences.gameInclude.filter((entry): entry is string => typeof entry === 'string').slice(0, 100) : [],
        gameExclude: Array.isArray(preferences.gameExclude) ? preferences.gameExclude.filter((entry): entry is string => typeof entry === 'string').slice(0, 100) : [],
      },
      uiRevision: dashboardUiRevision,
    };
  } catch {
    return null;
  }
}

function NumberControl({ label, value, min, max, onChange, suffix = '' }: {
  label: string; value: number; min: number; max: number; onChange: (value: number) => void; suffix?: string;
}) {
  return <label className="control"><span>{label} <b>{value}{suffix}</b></span><input type="range" min={min} max={max} value={value} onChange={event => onChange(Number(event.target.value))} /></label>;
}

function Settings() {
  const [context, setContext] = useState<SettingsContext | null>(null);
  const [state, setState] = useState<DashboardState>(defaultState);
  const [status, setStatus] = useState('Loading saved dashboard…');
  const importRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let alive = true;
    const apply = (value: string | null | undefined) => {
      const restored = parseState(value);
      if (alive && restored) setState(restored);
      return Boolean(restored);
    };
    void (async () => {
      try {
        const [ctx, document, entries] = await Promise.all([settings.context(), settings.doc.get(dashboardDocKey), settings.config.list()]);
        if (!alive) return;
        setContext(ctx);
        const config = entries.find(entry => entry.key === dashboardConfigKey)?.value;
        apply(document.value) || apply(config);
        setStatus(document.value || config ? 'Loaded saved dashboard' : 'Ready — using the default dashboard');
      } catch (error) {
        if (alive) setStatus(error instanceof Error ? error.message : String(error));
      }
    })();
    const unsubscribe = settings.onDocChanged((key, value) => {
      if (key === dashboardDocKey && apply(value)) setStatus('Loaded a dashboard change from the device');
    });
    return () => { alive = false; unsubscribe(); };
  }, []);

  const layout = state.layout;
  const preferences = state.preferences;
  const encoded = useMemo(() => {
    const layoutProfiles = withLayoutProfile(state.layoutProfiles, state.preferences.layoutPreset, state.layout);
    return JSON.stringify({ ...state, layoutProfiles, uiRevision: dashboardUiRevision });
  }, [state]);

  function setPreference(update: Partial<DashboardPreferences>) {
    setState(current => ({ ...current, preferences: { ...current.preferences, ...update } }));
  }

  function choosePreset(layoutPreset: LayoutPreset) {
    setState(current => {
      const layoutProfiles = withLayoutProfile(current.layoutProfiles, current.preferences.layoutPreset, current.layout);
      return {
        ...current,
        layout: layoutForPreset(layoutProfiles, layoutPreset),
        layoutProfiles,
        preferences: { ...current.preferences, layoutPreset },
      };
    });
  }

  function updateCard(id: string, update: Partial<LayoutItem>) {
    setState(current => ({ ...current, layout: current.layout.map(card => {
      if (card.id !== id) return card;
      const next = { ...card, ...update };
      next.w = clamp(next.w, 1, 6);
      next.h = clamp(next.h, 1, 4);
      next.x = clamp(next.x, 0, 6 - next.w);
      next.y = clamp(next.y, 0, 11);
      next.page = clamp(next.page || 0, 0, 2);
      return next;
    }) }));
  }

  function changeMetric(id: string, metric: MetricKey) {
    updateCard(id, { metric, details: [] });
  }

  function removeCard(id: string) {
    setState(current => current.layout.length <= 1 ? current : { ...current, layout: current.layout.filter(card => card.id !== id) });
  }

  function addCard() {
    setState(current => {
      if (current.layout.length >= 18) return current;
      const id = `card-${Date.now()}`;
      return { ...current, layout: [...current.layout, { id, metric: 'cpuUsage', details: ['cpuTemp'], x: 0, y: 0, w: 2, h: 1, hidden: false, page: 0 }] };
    });
  }

  async function save() {
    setStatus('Saving dashboard to BridgeThing…');
    try {
      await settings.config.set(dashboardConfigKey, encoded);
      await settings.doc.set(dashboardDocKey, encoded);
      setStatus('Saved — the Car Thing will update immediately when BrutalDash is active');
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
    }
  }

  function exportDashboard() {
    const blob = new Blob([encoded], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'brutaldash-layout.json';
    link.click();
    URL.revokeObjectURL(url);
  }

  async function importDashboard(file: File | undefined) {
    if (!file) return;
    try {
      const restored = parseState(await file.text());
      if (!restored) throw new Error('That file is not a BrutalDash layout export.');
      setState(restored);
      setStatus('Imported — press Save dashboard to apply it');
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
    }
  }

  return <main>
    <header>
      <div><p className="eyebrow">BRUTALDASH · BRIDGETHING BETA</p><h1>Customize your dashboard</h1></div>
      <p className="hint">{context ? `${context.name} · ${context.deviceId}` : 'Connecting to BridgeThing…'}</p>
    </header>

    <section>
      <h2>Appearance</h2>
      <div className="grid two">
        <label className="field"><span>Theme preset</span><select value={preferences.theme} onChange={event => setPreference({ theme: event.target.value as ThemeName })}>{themes.map(theme => <option key={theme.value} value={theme.value}>{theme.label}</option>)}</select></label>
        <label className="field"><span>Custom accent</span><span className="color-row"><input type="color" value={preferences.accent} onChange={event => setPreference({ accent: event.target.value })} /><code>{preferences.accent.toUpperCase()}</code></span></label>
      </div>
      <div className="grid three">
        <NumberControl label="Brightness" value={preferences.brightness} min={35} max={120} suffix="%" onChange={brightness => setPreference({ brightness })} />
        <NumberControl label="Glow" value={preferences.glow} min={0} max={100} suffix="%" onChange={glow => setPreference({ glow })} />
        <label className="check"><input type="checkbox" checked={preferences.compact} onChange={event => setPreference({ compact: event.target.checked })} /> Compact layout</label>
      </div>
    </section>

    <section>
      <h2>Disconnected clock</h2>
      <p className="hint">Automatic mode shows a local clock after BrutalDash goes 12 seconds without fresh PC telemetry.</p>
      <div className="grid two">
        <label className="field"><span>Clock behavior</span><select value={preferences.clockMode} onChange={event => setPreference({ clockMode: event.target.value as ClockMode })}><option value="automatic">Automatic when PC disconnects</option><option value="dashboard">Dashboard only</option><option value="clock">Clock only</option></select></label>
        <label className="field"><span>Clock face</span><select value={preferences.clockFace} onChange={event => setPreference({ clockFace: event.target.value as ClockFace })}><option value="bold">Bold Digital</option><option value="foundry">Foundry Digital</option><option value="minimal">OLED Minimal</option><option value="analog-foundry">Foundry Analog</option><option value="analog-minimal">Minimal Analog</option></select></label>
        <label className="field"><span>Time format</span><select value={preferences.clockFormat} onChange={event => setPreference({ clockFormat: event.target.value as ClockFormat })}><option value="12">12-hour</option><option value="24">24-hour</option></select></label>
        <label className="field"><span>Clock colors</span><select value={preferences.clockColorMode} onChange={event => setPreference({ clockColorMode: event.target.value as ClockColorMode })}><option value="theme">Follow dashboard theme</option><option value="custom">Custom color</option></select></label>
        {preferences.clockColorMode === 'custom' && <label className="field"><span>Clock color</span><span className="color-row"><input type="color" value={preferences.clockColor} onChange={event => setPreference({ clockColor: event.target.value })} /><code>{preferences.clockColor.toUpperCase()}</code></span></label>}
        <label className="check"><input type="checkbox" checked={preferences.clockShowDate} onChange={event => setPreference({ clockShowDate: event.target.checked })} /> Show day and date</label>
      </div>
    </section>

    <section>
      <h2>Button 4 — Reset session min/max</h2>
      <p className="hint">Buttons 1–3 save and recall layouts. Press Button 4 to clear the current session’s minimum and maximum readings; the next live sample starts the new range.</p>
    </section>

    <section>
      <h2>Optional HWiNFO integration</h2>
      <p className="hint">BrutalDash attaches automatically when HWiNFO Shared Memory is enabled and Sensor Status is active. Use Sensors-only with Minimize Sensors enabled; do not use Summary-only, which does not start sensor data. Native telemetry remains available without HWiNFO.</p>
    </section>

    <section>
      <h2>Game recognition</h2>
      <p className="hint">Fullscreen standalone games are detected automatically. Add executable names here for unusual or windowed games, or exclude applications that should never appear as games.</p>
      <div className="grid two">
        <label className="field"><span>Always recognize</span><input type="text" value={preferences.gameInclude.join(', ')} placeholder="example.exe, another-game.exe" onChange={event => setPreference({ gameInclude: parseProcessList(event.target.value) })} /></label>
        <label className="field"><span>Never recognize</span><input type="text" value={preferences.gameExclude.join(', ')} placeholder="example.exe" onChange={event => setPreference({ gameExclude: parseProcessList(event.target.value) })} /></label>
      </div>
    </section>

    <section>
      <h2>Layout</h2>
      <p className="hint">Choose a starting layout, then move, resize, hide, or reassign every card below. X/Y use the same six-column grid as the device.</p>
      <label className="field preset"><span>Starting layout</span><select value={preferences.layoutPreset} onChange={event => choosePreset(event.target.value as LayoutPreset)}>{presets.map(preset => <option key={preset.value} value={preset.value}>{preset.label}</option>)}</select></label>
      <div className="cards">
        {layout.map((card, index) => <article className="card" key={card.id}>
          <div className="card-head"><b>Card {index + 1}</b><button className="text-button" type="button" onClick={() => removeCard(card.id)} disabled={layout.length <= 1}>Remove</button></div>
          <div className="grid two">
            <label className="field"><span>Main reading</span><select value={card.metric} onChange={event => changeMetric(card.id, event.target.value as MetricKey)}>{metricKeys.map(metric => <option key={metric} value={metric}>{metricLabels[metric]}</option>)}</select></label>
            <label className="check"><input type="checkbox" checked={card.hidden} onChange={event => updateCard(card.id, { hidden: event.target.checked })} /> Hide this card</label>
          </div>
          <div className="grid four compact-fields">
            <label className="field"><span>X</span><input type="number" min="0" max={6 - card.w} value={card.x} onChange={event => updateCard(card.id, { x: Number(event.target.value) })} /></label>
            <label className="field"><span>Y</span><input type="number" min="0" max="11" value={card.y} onChange={event => updateCard(card.id, { y: Number(event.target.value) })} /></label>
            <label className="field"><span>Width</span><input type="number" min="1" max="6" value={card.w} onChange={event => updateCard(card.id, { w: Number(event.target.value) })} /></label>
            <label className="field"><span>Height</span><input type="number" min="1" max="4" value={card.h} onChange={event => updateCard(card.id, { h: Number(event.target.value) })} /></label>
          </div>
          <div className="details"><span>Secondary readings</span>{[0, 1, 2].map(detailIndex => <select key={detailIndex} value={card.details[detailIndex] || ''} onChange={event => {
            const details = [...card.details];
            if (event.target.value) details[detailIndex] = event.target.value as MetricKey; else details.splice(detailIndex, 1);
            updateCard(card.id, { details: [...new Set(details)].slice(0, 3) });
          }}><option value="">None</option>{metricKeys.filter(metric => metric !== card.metric).map(metric => <option key={metric} value={metric}>{metricLabels[metric]}</option>)}</select>)}</div>
        </article>)}
      </div>
      <button type="button" className="secondary" onClick={addCard} disabled={layout.length >= 18}>Add card</button>
    </section>

    <section>
      <h2>Alerts</h2>
      <div className="grid three">
        <NumberControl label="CPU temperature" value={preferences.cpuAlert} min={60} max={110} suffix="°C" onChange={cpuAlert => setPreference({ cpuAlert })} />
        <NumberControl label="GPU temperature" value={preferences.gpuAlert} min={60} max={110} suffix="°C" onChange={gpuAlert => setPreference({ gpuAlert })} />
        <NumberControl label="RAM usage" value={preferences.ramAlert} min={50} max={100} suffix="%" onChange={ramAlert => setPreference({ ramAlert })} />
      </div>
    </section>

    <footer>
      <input ref={importRef} type="file" accept="application/json,.json" hidden onChange={event => void importDashboard(event.target.files?.[0])} />
      <button type="button" onClick={() => void save()}>Save dashboard</button>
      <button type="button" className="secondary" onClick={exportDashboard}>Export</button>
      <button type="button" className="secondary" onClick={() => importRef.current?.click()}>Import</button>
      <button type="button" className="secondary" onClick={() => settings.done()}>Done</button>
      <p className="status">{status}</p>
    </footer>
  </main>;
}

createRoot(document.getElementById('root')!).render(<Settings />);
