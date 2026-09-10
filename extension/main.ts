import './early-detach';
import { asJson, defineExtension, json, type ExtensionContext } from '@bridgething/extension';
import { readForegroundApp, type ForegroundApp } from './foreground';
import { detectedGame, foregroundPacket, fpsCaptureTarget, gameCandidate, processFileName } from './game';
import { readDiskIoRates } from './disk';
import { readHwInfoSharedMemory, type HwInfoSensor } from './hwinfo';
import { readNativeSystemMetrics, readProcessorName } from './native';
import { readNetworkRates } from './network';
import { readNvidiaGpuMetrics } from './nvidia';
import { PresentMonProvider } from './presentmon';
import { readFixedDriveSpace, type StorageSpace } from './storage';
import { readWindowsGpuMetrics } from './windows-gpu';
import { MetricRangeTracker } from './metric-ranges';
import type { SystemMediaCommand } from './media-controls';
import { adjustActiveMediaVolume, readWindowsMediaSnapshot, sendWindowsMediaCommand } from './media-volume';

import {
  cloneLayoutProfiles,
  cloneLayoutSlots,
  dashboardUiRevision,
  defaultLayout,
  defaultPreferences,
  layoutForPreset,
  metricKeys,
  type DashboardAlert,
  type DashboardPacket,
  type DashboardPreferences,
  type DashboardState,
  type LayoutItem,
  type LayoutProfiles,
  type LayoutPreset,
  type MetricKey,
  type MetricValue,
  type TelemetryMetrics,
  type ThemeName,
} from '../src/types';

type DashboardMessage =
  | { type: 'dashboard:get' }
  | { type: 'dashboard:save'; payload: DashboardState; saveId?: string }
  | { type: 'media:subscribe'; payload: { active: boolean } }
  | { type: 'media:command'; payload: { command: SystemMediaCommand } }
  | { type: 'media:volume'; payload: { delta: number; source: string | null } }
  | { type: 'metrics:reset-ranges' };

// The device needs responsive, near-live telemetry. The in-flight guard below
// prevents a slow HWiNFO read from stacking up behind this 500 ms cadence.
const POLL_INTERVAL_MS = 500;
const STORAGE_REFRESH_MS = 30_000;
const STATE_KEY_PREFIX = 'dashboard-state:';
const metricRanges = new MetricRangeTracker();
const states = new Map<string, DashboardState>();
let latest: Omit<DashboardPacket, 'alerts'> | null = null;
let polling = false;
let timer: ReturnType<typeof setInterval> | undefined;
let storageSpace: StorageSpace | null = null;
let storageCheckedAt = 0;
let hwinfoAvailable: boolean | null = null;
let activePresentMonGroup: string | null = null;
let nativeFps: PresentMonProvider | null = null;
let lastGame: { label: string; processName: string; seenAt: number } | null = null;
let lastMediaVolumeWarningAt = 0;
const mediaSubscribers = new Set<string>();
let mediaTimer: ReturnType<typeof setInterval> | undefined;
let mediaPolling = false;
let mediaArtworkKey = '';
let mediaArtwork: string | null = null;

const GAME_RETENTION_MS = 15_000;

const finite = (value: unknown): number | null =>
  typeof value === 'number' && Number.isFinite(value) ? value : null;
const reading = (value: number | null, unit: string): MetricValue => ({ value, unit, min: null, max: null });
const empty = (unit: string): MetricValue => reading(null, unit);
const themes = new Set<ThemeName>(['rog', 'nvidia', 'miami', 'aurora', 'synthwave', 'arctic', 'amber', 'oled']);
const layoutPresets = new Set<LayoutPreset>(['four', 'rows', 'list', 'gaming', 'six', 'paged']);
const clockModes = new Set(['automatic', 'dashboard', 'clock']);
const clockFaces = new Set(['bold', 'foundry', 'minimal', 'analog-foundry', 'analog-minimal']);
const clockFormats = new Set(['12', '24']);
const clockColorModes = new Set(['theme', 'custom']);

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

function stateKey(deviceId: string) {
  return `${STATE_KEY_PREFIX}${deviceId}`;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function validLayout(layout: unknown): layout is LayoutItem[] {
  return Array.isArray(layout) && layout.every(item => {
    if (!item || typeof item !== 'object') return false;
    const candidate = item as Partial<LayoutItem>;
    return typeof candidate.id === 'string'
      && metricKeys.includes(candidate.metric as MetricKey)
      && Array.isArray(candidate.details)
      && Number.isFinite(candidate.x)
      && Number.isFinite(candidate.y)
      && Number.isFinite(candidate.w)
      && Number.isFinite(candidate.h)
      && typeof candidate.hidden === 'boolean';
  });
}

function validLayoutProfiles(value: unknown): LayoutProfiles {
  if (!value || typeof value !== 'object') return {};
  const profiles: LayoutProfiles = {};
  for (const preset of layoutPresets) {
    const layout = (value as Partial<Record<LayoutPreset, unknown>>)[preset];
    if (validLayout(layout)) profiles[preset] = cloneLayout(layout);
  }
  return profiles;
}

function validState(value: unknown): DashboardState | null {
  if (!value || typeof value !== 'object') return null;
  const candidate = value as Partial<DashboardState>;
  if (!validLayout(candidate.layout) || !candidate.preferences || typeof candidate.preferences !== 'object') return null;
  const preferences = candidate.preferences as Partial<DashboardPreferences>;
  if (!themes.has(preferences.theme as ThemeName) || !layoutPresets.has(preferences.layoutPreset as LayoutPreset)) return null;
  const processList = (input: unknown) => Array.isArray(input)
    ? [...new Set(input.filter((entry): entry is string => typeof entry === 'string').map(normalizeProcessName).filter(Boolean))].slice(0, 100)
    : [];
  const gameInclude = processList(preferences.gameInclude);
  const layout = cloneLayout(candidate.layout);
  const layoutProfiles = validLayoutProfiles(candidate.layoutProfiles);
  // Migrate every earlier saved dashboard into a profile for its active layout.
  // The active layout is authoritative if an old profile and active layout disagree.
  layoutProfiles[preferences.layoutPreset as LayoutPreset] = cloneLayout(layout);
  return {
    layout,
    layoutSlots: cloneLayoutSlots(candidate.layoutSlots),
    layoutProfiles: cloneLayoutProfiles(layoutProfiles),
    preferences: {
      ...clonePreferences(defaultPreferences),
      ...preferences,
      enabledMetrics: Array.isArray(preferences.enabledMetrics)
        ? preferences.enabledMetrics.filter((metric): metric is MetricKey => metricKeys.includes(metric as MetricKey))
        : [...metricKeys],
      clockMode: clockModes.has(preferences.clockMode || '') ? preferences.clockMode! : defaultPreferences.clockMode,
      clockFace: clockFaces.has(preferences.clockFace || '') ? preferences.clockFace! : defaultPreferences.clockFace,
      clockFormat: clockFormats.has(preferences.clockFormat || '') ? preferences.clockFormat! : defaultPreferences.clockFormat,
      clockShowDate: typeof preferences.clockShowDate === 'boolean' ? preferences.clockShowDate : defaultPreferences.clockShowDate,
      clockColorMode: clockColorModes.has(preferences.clockColorMode || '') ? preferences.clockColorMode! : defaultPreferences.clockColorMode,
      clockColor: typeof preferences.clockColor === 'string' && /^#[0-9a-f]{6}$/i.test(preferences.clockColor) ? preferences.clockColor : defaultPreferences.clockColor,
      gameInclude,
      gameExclude: processList(preferences.gameExclude).filter(entry => !gameInclude.includes(entry)),
    },
    uiRevision: dashboardUiRevision,
  };
}

function stateFromConfig(state: DashboardState, config: Readonly<Record<string, string>>, changedKey?: string) {
  if ((!changedKey || changedKey === 'dashboardState') && config.dashboardState) {
    try {
      const restored = validState(JSON.parse(config.dashboardState));
      if (restored) return restored;
    } catch {
      // A manually damaged config value must not erase the last working dashboard.
    }
  }
  if (!changedKey || changedKey === 'dashboardState') return state;
  const preferences = clonePreferences(state.preferences);
  const raw = config[changedKey];
  if (raw === undefined) return state;
  if (changedKey === 'theme' && themes.has(raw as ThemeName)) preferences.theme = raw as ThemeName;
  if (changedKey === 'accent' && /^#[0-9a-f]{6}$/i.test(raw)) preferences.accent = raw;
  if (changedKey === 'brightness') {
    const value = Number(raw);
    if (Number.isFinite(value)) preferences.brightness = clamp(Math.round(value), 35, 120);
  }
  if (changedKey === 'glow') {
    const value = Number(raw);
    if (Number.isFinite(value)) preferences.glow = clamp(Math.round(value), 0, 100);
  }
  if (changedKey === 'compact' && (raw === 'true' || raw === 'false')) preferences.compact = raw === 'true';
  if (changedKey === 'layoutPreset' && layoutPresets.has(raw as LayoutPreset)) {
    preferences.layoutPreset = raw as LayoutPreset;
    return {
      ...state,
      layout: layoutForPreset(state.layoutProfiles, preferences.layoutPreset),
      preferences,
      uiRevision: dashboardUiRevision,
    };
  }
  if (changedKey === 'cpuAlert' || changedKey === 'gpuAlert' || changedKey === 'ramAlert') {
    const value = Number(raw);
    if (Number.isFinite(value)) preferences[changedKey] = clamp(Math.round(value), changedKey === 'ramAlert' ? 50 : 60, changedKey === 'ramAlert' ? 100 : 110);
  }
  return { ...state, preferences, uiRevision: dashboardUiRevision };
}

function sensorName(sensor: HwInfoSensor) {
  return (sensor.nameDefault || sensor.nameCustom || '').trim();
}

function sensorParent(sensor: HwInfoSensor) {
  return (sensor.parentNameDefault || sensor.parentNameCustom || '').trim();
}

function normalizeProcessName(value: string) {
  return value.trim().split(/[\\/]/).pop()?.replace(/\.exe$/i, '').toLowerCase() || '';
}

function sensorCandidates(sensors: HwInfoSensor[], names: string[], parent?: RegExp) {
  for (const name of names) {
    const matches = sensors.filter(sensor =>
      sensorName(sensor).toLowerCase() === name.toLowerCase()
      && (!parent || parent.test(sensorParent(sensor)))
      && finite(sensor.valueNow) !== null,
    );
    if (matches.length) return matches;
  }
  return [] as HwInfoSensor[];
}

function sensorValues(sensors: HwInfoSensor[], names: string[], parent?: RegExp) {
  return sensorCandidates(sensors, names, parent)
    .map(sensor => finite(sensor.valueNow))
    .filter((value): value is number => value !== null);
}

function sensorValue(sensors: HwInfoSensor[], names: string[], parent?: RegExp, mode: 'max' | 'sum' = 'max') {
  const values = sensorValues(sensors, names, parent);
  if (!values.length) return null;
  return mode === 'sum' ? values.reduce((total, value) => total + value, 0) : Math.max(...values);
}

function sensorUnit(sensors: HwInfoSensor[], names: string[], parent?: RegExp) {
  return sensorCandidates(sensors, names, parent)[0]?.unit.trim().toLowerCase() || '';
}

function memoryGb(sensors: HwInfoSensor[], names: string[], parent?: RegExp) {
  const value = sensorValue(sensors, names, parent);
  if (value === null) return null;
  const unit = sensorUnit(sensors, names, parent);
  if (unit.includes('mb')) return value / 1024;
  if (unit.includes('gb')) return value;
  return null;
}

function currentStorageSpace(now: number) {
  if (now - storageCheckedAt >= STORAGE_REFRESH_MS || storageCheckedAt === 0) {
    storageSpace = readFixedDriveSpace();
    storageCheckedAt = now;
  }
  return storageSpace;
}

function presentMonSensorsForProcess(sensors: HwInfoSensor[], processName: string | null) {
  if (!processName) {
    activePresentMonGroup = null;
    return [];
  }
  const fpsNames = ['Framerate Presented (avg)', 'Framerate Displayed (avg)'];
  const groupKey = (sensor: HwInfoSensor) => `${sensor.parentNameCustom}\0${sensor.parentNameDefault}`;
  const isPresentMon = (sensor: HwInfoSensor) => /PresentMon(?:\s*\[[^\]]+\])?/i.test(`${sensor.parentNameCustom} ${sensor.parentNameDefault}`);
  const usable = (group: HwInfoSensor[]) => {
    const value = sensorValue(group, fpsNames);
    return value !== null && value > 0;
  };
  const remember = (group: HwInfoSensor[]) => {
    if (group.length) activePresentMonGroup = groupKey(group[0]);
    return group;
  };
  const available = sensors.filter(isPresentMon);
  const expected = normalizeProcessName(processName || '');
  const processScoped = expected ? available.filter(sensor => {
    const parent = `${sensor.parentNameCustom} ${sensor.parentNameDefault}`;
    const match = parent.match(/PresentMon\s*\[([^\]]+)\]/i);
    return normalizeProcessName(match?.[1] || '') === expected;
  }) : [];
  if (usable(processScoped)) return remember(processScoped);

  // Current HWiNFO publishes one active PresentMon stream under the plain
  // `PresentMon` parent rather than `PresentMon [game.exe]`. It is still live
  // HWiNFO/PresentMon telemetry; use it when no process-scoped stream exists.
  const generic = available.filter(sensor => /^PresentMon$/i.test(sensorParent(sensor)));
  if (usable(generic)) return remember(generic);

  // Alt-Tab can briefly hide the foreground process while HWiNFO keeps or
  // recreates a process-tagged stream. Reacquire the last usable group, then
  // fall back to whichever remaining PresentMon group is actively reporting.
  if (activePresentMonGroup) {
    const previous = available.filter(sensor => groupKey(sensor) === activePresentMonGroup);
    if (usable(previous)) return previous;
  }
  const groups = new Map<string, HwInfoSensor[]>();
  for (const sensor of available) {
    const key = groupKey(sensor);
    const group = groups.get(key) || [];
    group.push(sensor);
    groups.set(key, group);
  }
  const active = [...groups.values()]
    .filter(usable)
    .sort((left, right) => (sensorValue(right, fpsNames) || 0) - (sensorValue(left, fpsNames) || 0))[0];
  return active ? remember(active) : [];
}

function gameFor(app: ForegroundApp | null, hasPresentMonReadings: boolean, preferences: DashboardPreferences, now: number) {
  const label = detectedGame(app, hasPresentMonReadings, preferences);
  if (label && app) {
    lastGame = { label, processName: processFileName(app), seenAt: now };
    return lastGame;
  }
  if (lastGame && now - lastGame.seenAt <= GAME_RETENTION_MS) return lastGame;
  lastGame = null;
  return null;
}

function pollingPreferences(ctx: ExtensionContext) {
  for (const device of ctx.devices) {
    const state = states.get(device.id);
    if (device.active && state) return clonePreferences(state.preferences);
  }
  const preferences = states.values().next().value?.preferences;
  return preferences ? clonePreferences(preferences) : clonePreferences(defaultPreferences);
}

function parentHardwareName(sensors: HwInfoSensor[], kind: 'cpu' | 'gpu') {
  const pattern = kind === 'cpu' ? /CPU \[#\d+\]:\s*([^:]+)/i : /(?:dGPU|GPU) \[#\d+\]:\s*([^:]+)/i;
  for (const sensor of sensors) {
    const match = sensorParent(sensor).match(pattern);
    if (match?.[1]) return match[1].trim();
  }
  return kind === 'cpu' ? 'CPU' : 'GPU';
}

function blankMetrics(): TelemetryMetrics {
  return {
    gpuUsage: empty('%'), gpuTemp: empty('°C'), gpuHotspot: empty('°C'), gpuClock: empty('MHz'), gpuPower: empty('W'),
    cpuUsage: empty('%'), cpuTemp: empty('°C'), cpuClock: empty('MHz'), cpuPower: empty('W'),
    ramUsed: empty('GB'), ramPercent: empty('%'), vramUsed: empty('GB'), vramPercent: empty('%'),
    storageUsed: empty('GB'), storagePercent: empty('%'), storageFree: empty('GB'), storageRead: empty('MB/s'),
    storageWrite: empty('MB/s'), networkDown: empty('KB/s'), networkUp: empty('KB/s'), fps: empty('FPS'),
    frameTime: empty('ms'), onePercentLow: empty('FPS'),
  };
}

function applyRanges(metrics: TelemetryMetrics) {
  metricRanges.apply(metrics);
}

function alerts(metrics: TelemetryMetrics, preferences: DashboardPreferences): DashboardAlert[] {
  const result: DashboardAlert[] = [];
  const temperature = (id: string, label: string, value: number | null, threshold: number) => {
    if (value === null || value < threshold) return;
    result.push({ id, label, value: `${Math.round(value)}°C`, level: value >= threshold + 8 ? 'critical' : 'warning' });
  };
  temperature('cpu-temp', 'CPU TEMP HIGH', metrics.cpuTemp.value, preferences.cpuAlert);
  temperature('gpu-temp', 'GPU TEMP HIGH', metrics.gpuTemp.value, preferences.gpuAlert);
  const ram = metrics.ramPercent.value;
  if (ram !== null && ram >= preferences.ramAlert) {
    result.push({ id: 'ram-usage', label: 'RAM USAGE HIGH', value: `${Math.round(ram)}%`, level: ram >= 98 ? 'critical' : 'warning' });
  }
  return result;
}

function packetFor(state: DashboardState): DashboardPacket {
  if (!latest) {
    return {
      timestamp: Date.now(), clock: new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit' }).format(new Date()), pcTimeOffsetMinutes: new Date().getTimezoneOffset(),
      source: 'native', fpsSource: null, connected: false,
      telemetryMessage: 'Starting BrutalDash telemetry…',
      cpuName: 'Starting telemetry', gpuName: 'Starting telemetry',
      game: null, foreground: null, capacities: { ramGb: null, vramGb: null, storageGb: null }, metrics: blankMetrics(), alerts: [],
    };
  }
  return { ...latest, alerts: latest.connected ? alerts(latest.metrics, state.preferences) : [] };
}

function readSensors() {
  const sensors = readHwInfoSharedMemory();
  if (!sensors.length) throw new Error('HWiNFO shared memory is unavailable');
  return sensors;
}

function nativeFallback(now: number, preferences: DashboardPreferences): Omit<DashboardPacket, 'alerts'> | null {
  const native = readNativeSystemMetrics();
  const storage = currentStorageSpace(now);
  const disk = readDiskIoRates();
  const network = readNetworkRates(now);
  const nvidia = readNvidiaGpuMetrics();
  const windowsGpu = readWindowsGpuMetrics();
  const foreground = readForegroundApp();
  nativeFps?.updateTarget(gameCandidate(foreground, preferences), now);
  const frames = nativeFps?.snapshot(now) || null;
  const game = gameFor(foreground, Boolean(frames), preferences, now);
  if (!native && !storage && !network) return null;
  const metrics = blankMetrics();
  const assign = (key: MetricKey, value: number | null, unit = metrics[key].unit) => {
    if (value !== null) metrics[key] = reading(value, unit);
  };
  assign('cpuUsage', native?.cpuPercent ?? null);
  assign('ramUsed', native?.ramUsedGb ?? null, 'GB');
  assign('ramPercent', native?.ramPercent ?? null);
  assign('storageUsed', storage?.usedGb ?? null, 'GB');
  assign('storageFree', storage?.freeGb ?? null, 'GB');
  assign('storagePercent', storage ? (storage.usedGb / storage.totalGb) * 100 : null, '%');
  assign('storageRead', disk?.readMbPerSec ?? null, 'MB/s');
  assign('storageWrite', disk?.writeMbPerSec ?? null, 'MB/s');
  assign('networkDown', network?.downKbps ?? null, 'KB/s');
  assign('networkUp', network?.upKbps ?? null, 'KB/s');
  assign('gpuUsage', nvidia?.usagePercent ?? windowsGpu?.usagePercent ?? null);
  assign('gpuTemp', nvidia?.temperatureC ?? null, '°C');
  assign('gpuClock', nvidia?.clockMhz ?? null, 'MHz');
  assign('gpuPower', nvidia?.powerWatts ?? null, 'W');
  assign('vramUsed', nvidia?.vramUsedGb ?? windowsGpu?.vramUsedGb ?? null, 'GB');
  const nvidiaVramPercent = nvidia && nvidia.vramUsedGb !== null && nvidia.vramTotalGb !== null && nvidia.vramTotalGb > 0
    ? (nvidia.vramUsedGb / nvidia.vramTotalGb) * 100
    : null;
  assign('vramPercent', nvidiaVramPercent);
  assign('fps', frames?.fps ?? null, 'FPS');
  assign('frameTime', frames?.frameTimeMs ?? null, 'ms');
  assign('onePercentLow', frames?.onePercentLowFps ?? null, 'FPS');
  applyRanges(metrics);
  return {
    timestamp: now,
    clock: new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit' }).format(new Date(now)),
    pcTimeOffsetMinutes: new Date(now).getTimezoneOffset(),
    source: 'native', fpsSource: frames ? 'presentmon' : null, connected: true,
    telemetryMessage: 'Using native telemetry. HWiNFO attaches automatically when Shared Memory and Sensor Status are active; Summary-only does not start sensors.',
    cpuName: readProcessorName() || 'Windows system', gpuName: nvidia?.name || (windowsGpu ? 'Windows GPU' : 'GPU data unavailable'), game: game?.label || null, foreground: foregroundPacket(foreground),
    capacities: { ramGb: native?.ramTotalGb ?? null, vramGb: nvidia?.vramTotalGb ?? null, storageGb: storage?.totalGb ?? null },
    metrics,
  };
}

async function poll(ctx: ExtensionContext) {
  if (polling) return;
  polling = true;
  const preferences = pollingPreferences(ctx);
  try {
    const now = Date.now();
    const sensors = readSensors();
    if (hwinfoAvailable === false) ctx.log.info('HWiNFO shared memory recovered');
    hwinfoAvailable = true;
    const cpu = /CPU \[#\d+\]/i;
    const gpu = /(dGPU|GPU \[#|NVIDIA|AMD Radeon|Intel Arc)/i;
    const metrics = blankMetrics();
    const assign = (key: MetricKey, value: number | null, unit = metrics[key].unit) => {
      if (value !== null) metrics[key] = reading(value, unit);
    };
    assign('cpuUsage', sensorValue(sensors, ['Total CPU Usage', 'Total CPU Utility'], cpu));
    assign('cpuTemp', sensorValue(sensors, ['CPU Package', 'Core Max'], cpu));
    assign('cpuClock', sensorValue(sensors, ['Core Effective Clocks', 'P-core 0 Clock', 'Core Clocks'], cpu));
    assign('cpuPower', sensorValue(sensors, ['CPU Package Power'], cpu));
    assign('gpuUsage', sensorValue(sensors, ['GPU Core Load', 'GPU D3D Usage'], gpu));
    assign('gpuTemp', sensorValue(sensors, ['GPU Temperature'], gpu));
    assign('gpuHotspot', sensorValue(sensors, ['GPU Hot Spot Temperature', 'GPU Hotspot Temperature'], gpu));
    assign('gpuClock', sensorValue(sensors, ['GPU Clock (measured)', 'GPU Clock'], gpu));
    assign('gpuPower', sensorValue(sensors, ['GPU Power', 'GPU ASIC Power', 'GPU Board Power'], gpu));
    const ramUsedGb = memoryGb(sensors, ['Physical Memory Used']);
    const ramAvailableGb = memoryGb(sensors, ['Physical Memory Available']);
    assign('ramUsed', ramUsedGb, 'GB');
    assign('ramPercent', sensorValue(sensors, ['Physical Memory Load']));
    const vramNames = ['GPU Memory Allocated', 'GPU D3D Memory Dedicated', 'GPU Memory Usage'];
    const vramUsedGb = memoryGb(sensors, vramNames, gpu);
    const vramAvailableGb = memoryGb(sensors, ['GPU Memory Available'], gpu);
    assign('vramUsed', vramUsedGb, 'GB');
    assign('vramPercent', vramUsedGb !== null && vramAvailableGb !== null ? (vramUsedGb / (vramUsedGb + vramAvailableGb)) * 100 : null);
    assign('storageRead', sensorValue(sensors, ['Read Rate'], /^Drive:/i, 'sum'));
    assign('storageWrite', sensorValue(sensors, ['Write Rate'], /^Drive:/i, 'sum'));
    const storage = currentStorageSpace(now);
    assign('storageUsed', storage?.usedGb ?? null, 'GB');
    assign('storageFree', storage?.freeGb ?? null, 'GB');
    assign('storagePercent', storage ? (storage.usedGb / storage.totalGb) * 100 : null, '%');
    assign('networkDown', sensorValue(sensors, ['Current DL rate'], /^Network:/i, 'sum'));
    assign('networkUp', sensorValue(sensors, ['Current UP rate'], /^Network:/i, 'sum'));
    const native = readNativeSystemMetrics();
    const network = readNetworkRates(now);
    const disk = readDiskIoRates();
    const nvidia = readNvidiaGpuMetrics();
    const windowsGpu = readWindowsGpuMetrics();
    let usedNativeFallback = false;
    const fill = (key: MetricKey, value: number | null, unit = metrics[key].unit) => {
      if (metrics[key].value === null && value !== null) {
        metrics[key] = reading(value, unit);
        usedNativeFallback = true;
      }
    };
    fill('cpuUsage', native?.cpuPercent ?? null);
    fill('ramUsed', native?.ramUsedGb ?? null, 'GB');
    fill('ramPercent', native?.ramPercent ?? null);
    fill('networkDown', network?.downKbps ?? null, 'KB/s');
    fill('networkUp', network?.upKbps ?? null, 'KB/s');
    fill('storageRead', disk?.readMbPerSec ?? null, 'MB/s');
    fill('storageWrite', disk?.writeMbPerSec ?? null, 'MB/s');
    fill('gpuUsage', nvidia?.usagePercent ?? windowsGpu?.usagePercent ?? null);
    fill('gpuTemp', nvidia?.temperatureC ?? null, '°C');
    fill('gpuClock', nvidia?.clockMhz ?? null, 'MHz');
    fill('gpuPower', nvidia?.powerWatts ?? null, 'W');
    fill('vramUsed', nvidia?.vramUsedGb ?? windowsGpu?.vramUsedGb ?? null, 'GB');
    const fallbackVramPercent = nvidia && nvidia.vramUsedGb !== null && nvidia.vramTotalGb !== null && nvidia.vramTotalGb > 0
      ? (nvidia.vramUsedGb / nvidia.vramTotalGb) * 100
      : null;
    fill('vramPercent', fallbackVramPercent);
    const foreground = readForegroundApp();
    const fpsTarget = fpsCaptureTarget(foreground, preferences, lastGame, now, GAME_RETENTION_MS);
    const presentMonSensors = presentMonSensorsForProcess(sensors, fpsTarget.sensorProcessName);
    assign('fps', sensorValue(presentMonSensors, ['Framerate Presented (avg)', 'Framerate Displayed (avg)']), 'FPS');
    assign('frameTime', sensorValue(presentMonSensors, ['Frame Time Presented (avg)', 'Frame Time Displayed (avg)']), 'ms');
    assign('onePercentLow', sensorValue(presentMonSensors, ['Framerate Presented (1% low)', 'Framerate Displayed (1% low)']), 'FPS');
    nativeFps?.updateTarget(fpsTarget.liveProcessName, now);
    const frames = nativeFps?.snapshot(now) || null;
    const game = gameFor(foreground, presentMonSensors.length > 0 || Boolean(frames), preferences, now);
    if (frames) {
      metrics.fps = reading(frames.fps, 'FPS');
      metrics.frameTime = reading(frames.frameTimeMs, 'ms');
      metrics.onePercentLow = reading(frames.onePercentLowFps, 'FPS');
      usedNativeFallback = true;
    }
    applyRanges(metrics);
    const hwCpuName = parentHardwareName(sensors, 'cpu');
    const hwGpuName = parentHardwareName(sensors, 'gpu');
    latest = {
      timestamp: now, clock: new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit' }).format(new Date(now)), pcTimeOffsetMinutes: new Date(now).getTimezoneOffset(),
      source: usedNativeFallback ? 'hybrid' : 'hwinfo', fpsSource: frames ? 'presentmon' : metrics.fps.value === null ? null : 'hwinfo', connected: true, telemetryMessage: null,
      cpuName: hwCpuName !== 'CPU' ? hwCpuName : readProcessorName() || 'Windows system',
      gpuName: hwGpuName !== 'GPU' ? hwGpuName : nvidia?.name || (windowsGpu ? 'Windows GPU' : 'GPU'), game: game?.label || null, foreground: foregroundPacket(foreground),
      capacities: {
        ramGb: ramUsedGb !== null && ramAvailableGb !== null ? ramUsedGb + ramAvailableGb : native?.ramTotalGb ?? null,
        vramGb: vramUsedGb !== null && vramAvailableGb !== null ? vramUsedGb + vramAvailableGb : nvidia?.vramTotalGb ?? null,
        storageGb: storage?.totalGb ?? null,
      }, metrics,
    };
    for (const device of ctx.devices) {
      const state = states.get(device.id);
      if (device.active && state) device.send(json({ type: 'dashboard:data', payload: packetFor(state) }));
    }
  } catch (error) {
    if (hwinfoAvailable !== false) ctx.log.warn(`HWiNFO shared memory unavailable: ${error instanceof Error ? error.message : String(error)}`);
    hwinfoAvailable = false;
    try {
      const fallback = nativeFallback(Date.now(), preferences);
      if (fallback) {
        latest = fallback;
        for (const device of ctx.devices) {
          const state = states.get(device.id);
          if (device.active && state) device.send(json({ type: 'dashboard:data', payload: packetFor(state) }));
        }
      } else {
        // Keep the last successful timestamp intact. The client can then label the
        // numbers stale instead of presenting a frozen sample as current telemetry.
        latest = latest ? { ...latest, connected: false } : null;
      }
    } catch (fallbackError) {
      ctx.log.error(`Native telemetry fallback failed: ${fallbackError instanceof Error ? fallbackError.message : String(fallbackError)}`);
      latest = latest ? { ...latest, connected: false } : null;
    }
  } finally {
    polling = false;
  }
}

async function loadState(ctx: ExtensionContext, deviceId: string) {
  const saved = await ctx.kv.get<DashboardState>(stateKey(deviceId));
  const restored = validState(saved);
  // The extension KV is the only canonical record once it exists.  A settings
  // page can contain an older dashboardState document, so it must only seed a
  // brand-new installation rather than overwrite the latest saved layout.
  const state = restored || stateFromConfig(defaultState(), ctx.config(deviceId));
  states.set(deviceId, state);
  return state;
}

async function sendState(ctx: ExtensionContext, deviceId: string) {
  const device = ctx.device(deviceId);
  const state = states.get(deviceId) || await loadState(ctx, deviceId);
  device.send(json({ type: 'dashboard:state', payload: state }));
  device.send(json({ type: 'dashboard:data', payload: packetFor(state) }));
}

async function pollMedia(ctx: ExtensionContext) {
  if (mediaPolling || mediaSubscribers.size === 0) return;
  mediaPolling = true;
  try {
    let snapshot = await readWindowsMediaSnapshot(false);
    const artworkKey = snapshot.ok ? `${snapshot.source || ''}\n${snapshot.title || ''}\n${snapshot.artist || ''}` : '';
    if (artworkKey && artworkKey !== mediaArtworkKey) {
      // Deliver text/state immediately. Artwork is a second, bounded message so
      // a thumbnail failure can never hide an otherwise valid media session.
      for (const deviceId of mediaSubscribers) {
        const device = ctx.device(deviceId);
        if (device.active) device.send(json({ type: 'media:data', payload: snapshot }));
      }
      const withArtwork = await readWindowsMediaSnapshot(true);
      if (withArtwork.ok) snapshot = withArtwork;
      mediaArtworkKey = artworkKey;
      mediaArtwork = snapshot.artwork;
    } else if (artworkKey === mediaArtworkKey) {
      snapshot = { ...snapshot, artwork: mediaArtwork };
    } else {
      mediaArtworkKey = '';
      mediaArtwork = null;
    }
    for (const deviceId of mediaSubscribers) {
      const device = ctx.device(deviceId);
      if (device.active) device.send(json({ type: 'media:data', payload: snapshot }));
    }
  } finally {
    mediaPolling = false;
  }
}

defineExtension({
  start(ctx) {
    nativeFps = new PresentMonProvider({
      info: message => ctx.log.info(message),
      warn: message => ctx.log.warn(message),
    });
    ctx.on('device', event => {
      // Existing connections are replayed at startup. Send state when a device
      // connects, and when BrutalDash becomes its active app. Sending while
      // inactive would be dropped by the BridgeThing host.
      if (event.type === 'connected' || (event.type === 'active' && event.device.active)) {
        void sendState(ctx, event.device.id).catch(error => ctx.log.error('state send failed', error));
      }
    });
    ctx.on('message', (device, message) => {
      const payload = asJson<DashboardMessage>(message);
      if (!payload) return;
      if (payload.type === 'media:command') {
        void sendWindowsMediaCommand(payload.payload.command).then(ok => {
          if (!ok) ctx.log.warn('Windows media control unavailable');
          void pollMedia(ctx);
        });
        return;
      }
      if (payload.type === 'media:subscribe') {
        if (payload.payload.active) mediaSubscribers.add(device.id);
        else mediaSubscribers.delete(device.id);
        if (payload.payload.active) void pollMedia(ctx);
        return;
      }
      if (payload.type === 'media:volume') {
        void adjustActiveMediaVolume(payload.payload.delta, payload.payload.source).then(result => {
          // A missing matching PC session is expected when the phone is the
          // only player. Do not fall back to phone or master PC volume.
          if (!result.ok && Date.now() - lastMediaVolumeWarningAt > 5_000) {
            lastMediaVolumeWarningAt = Date.now();
            ctx.log.warn(`PC media volume unavailable: ${result.error || 'no matching media session'}`);
          }
        }).catch(error => ctx.log.warn(`PC media volume failed: ${error instanceof Error ? error.message : String(error)}`));
        return;
      }
      if (payload.type === 'metrics:reset-ranges') {
        metricRanges.clear();
        void sendState(ctx, device.id).catch(error => ctx.log.error('min/max reset state send failed', error));
        return;
      }
      if (payload.type === 'dashboard:get') void sendState(ctx, device.id).catch(error => ctx.log.error('dashboard request failed', error));
      if (payload.type === 'dashboard:save' && payload.payload && Array.isArray(payload.payload.layout) && payload.payload.preferences) {
        const next = validState(payload.payload);
        if (!next) {
          device.send(json({ type: 'dashboard:save-failed', payload: { saveId: payload.saveId, message: 'Dashboard data was invalid' } }));
          return;
        }
        states.set(device.id, next);
        void ctx.kv.set(stateKey(device.id), next)
          .then(() => {
            device.send(json({ type: 'dashboard:saved', payload: { saveId: payload.saveId } }));
            return sendState(ctx, device.id);
          })
          .catch(error => {
            ctx.log.error('dashboard save failed', error);
            device.send(json({ type: 'dashboard:save-failed', payload: { saveId: payload.saveId, message: 'BridgeThing could not write the dashboard' } }));
          });
      }
    });
    ctx.on('config', (device, key, value) => {
      const state = states.get(device.id) || defaultState();
      const config = { ...ctx.config(device) };
      if (value === null) delete config[key];
      else config[key] = value;
      const next = stateFromConfig(state, config, key);
      states.set(device.id, next);
      void ctx.kv.set(stateKey(device.id), next)
        .then(() => sendState(ctx, device.id))
        .catch(error => ctx.log.error('dashboard setting save failed', error));
    });
    void poll(ctx);
    timer = setInterval(() => void poll(ctx), POLL_INTERVAL_MS);
    mediaTimer = setInterval(() => void pollMedia(ctx), 750);
    ctx.log.info(`BrutalDash bridge extension started with ${POLL_INTERVAL_MS}ms telemetry polling`);
  },
  stop() {
    clearInterval(timer);
    clearInterval(mediaTimer);
    mediaSubscribers.clear();
    nativeFps?.stop();
    nativeFps = null;
  },
});
