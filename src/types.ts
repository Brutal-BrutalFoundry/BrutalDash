export type ThemeName =
  | "rog"
  | "nvidia"
  | "miami"
  | "aurora"
  | "synthwave"
  | "arctic"
  | "amber"
  | "oled";

export type LayoutPreset = "four" | "rows" | "list" | "gaming" | "six" | "paged";
export type ClockMode = "automatic" | "dashboard" | "clock";
export type ClockFace = "bold" | "foundry" | "minimal" | "analog-foundry" | "analog-minimal";
export type ClockFormat = "12" | "24";
export type ClockColorMode = "theme" | "custom";

export type MetricKey =
  | "gpuUsage"
  | "gpuTemp"
  | "gpuHotspot"
  | "gpuClock"
  | "gpuPower"
  | "cpuUsage"
  | "cpuTemp"
  | "cpuClock"
  | "cpuPower"
  | "ramUsed"
  | "ramPercent"
  | "vramUsed"
  | "vramPercent"
  | "storageUsed"
  | "storagePercent"
  | "storageFree"
  | "storageRead"
  | "storageWrite"
  | "networkDown"
  | "networkUp"
  | "fps"
  | "frameTime"
  | "onePercentLow";

export type MetricValue = {
  value: number | null;
  unit: string;
  min: number | null;
  max: number | null;
};

export type TelemetryMetrics = Record<MetricKey, MetricValue>;

export type DashboardCapacities = {
  ramGb: number | null;
  vramGb: number | null;
  storageGb: number | null;
};

export type DashboardAlert = {
  id: string;
  level: "warning" | "critical";
  label: string;
  value: string;
};

export type DashboardPacket = {
  timestamp: number;
  clock: string;
  pcTimeOffsetMinutes: number;
  source: "hwinfo" | "native" | "hybrid";
  fpsSource: "presentmon" | "hwinfo" | null;
  connected: boolean;
  telemetryMessage: string | null;
  cpuName: string;
  gpuName: string;
  game: string | null;
  foreground: { processName: string; displayName: string; fullscreen: boolean } | null;
  capacities: DashboardCapacities;
  metrics: TelemetryMetrics;
  alerts: DashboardAlert[];
};

export type LayoutItem = {
  id: string;
  metric: MetricKey;
  details: MetricKey[];
  x: number;
  y: number;
  w: number;
  h: number;
  hidden: boolean;
  page?: number;
};

export type DashboardPreferences = {
  theme: ThemeName;
  accent: string;
  brightness: number;
  glow: number;
  compact: boolean;
  layoutPreset: LayoutPreset;
  enabledMetrics: MetricKey[];
  cpuAlert: number;
  gpuAlert: number;
  ramAlert: number;
  clockMode: ClockMode;
  clockFace: ClockFace;
  clockFormat: ClockFormat;
  clockShowDate: boolean;
  clockColorMode: ClockColorMode;
  clockColor: string;
  gameInclude: string[];
  gameExclude: string[];
};

export type LayoutSlot = {
  layout: LayoutItem[];
  layoutPreset: LayoutPreset;
  compact: boolean;
};

// Each built-in layout is a separately saved workspace.  `layout` remains the
// active workspace for backward compatibility with earlier exported files.
export type LayoutProfiles = Partial<Record<LayoutPreset, LayoutItem[]>>;

export type DashboardState = {
  layout: LayoutItem[];
  preferences: DashboardPreferences;
  layoutSlots?: Array<LayoutSlot | null>;
  layoutProfiles?: LayoutProfiles;
  uiRevision?: number;
};

// Hardware buttons 1-3 are layout slots. Button 4 resets session min/max readings.
export const emptyLayoutSlots = (): Array<LayoutSlot | null> => [null, null, null];

export function cloneLayoutSlots(slots?: Array<LayoutSlot | null>): Array<LayoutSlot | null> {
  return emptyLayoutSlots().map((_, index) => {
    const slot = slots?.[index];
    return slot ? { ...slot, layout: slot.layout.map(item => ({ ...item, details: [...item.details] })) } : null;
  });
}

export type ServerMessage =
  | { type: "dashboard:data"; payload: DashboardPacket }
  | { type: "dashboard:state"; payload: DashboardState }
  | { type: "dashboard:error"; payload: { message: string } };

export type ClientMessage =
  | { type: "dashboard:get"; payload?: null }
  | { type: "dashboard:save"; payload: DashboardState };

export function swapLayoutSlots(layout: LayoutItem[], sourceId: string, targetId: string) {
  if (sourceId === targetId) return layout;
  const source = layout.find(item => item.id === sourceId);
  const target = layout.find(item => item.id === targetId);
  if (!source || !target) return layout;
  const sourceSlot = { x: source.x, y: source.y, w: source.w, h: source.h, page: source.page };
  const targetSlot = { x: target.x, y: target.y, w: target.w, h: target.h, page: target.page };
  return layout.map(item => {
    if (item.id === sourceId) return { ...item, ...targetSlot };
    if (item.id === targetId) return { ...item, ...sourceSlot };
    return item;
  });
}

export const metricKeys: MetricKey[] = [
  "gpuUsage",
  "gpuTemp",
  "gpuHotspot",
  "gpuClock",
  "gpuPower",
  "cpuUsage",
  "cpuTemp",
  "cpuClock",
  "cpuPower",
  "ramUsed",
  "ramPercent",
  "vramUsed",
  "vramPercent",
  "storageUsed",
  "storagePercent",
  "storageFree",
  "storageRead",
  "storageWrite",
  "networkDown",
  "networkUp",
  "fps",
  "frameTime",
  "onePercentLow",
];

const card = (
  id: string,
  metric: MetricKey,
  x: number,
  y: number,
  w: number,
  h: number,
  details: MetricKey[],
  page?: number,
): LayoutItem => ({ id, metric, details, x, y, w, h, hidden: false, page });

export const presetLayouts: Record<LayoutPreset, LayoutItem[]> = {
  four: [
    card("gpu", "gpuUsage", 0, 0, 3, 2, ["gpuTemp", "gpuPower", "vramUsed"]),
    card("cpu", "cpuUsage", 3, 0, 3, 2, ["cpuTemp", "cpuClock", "cpuPower"]),
    card("ram", "ramUsed", 0, 2, 3, 2, ["ramPercent"]),
    card("vram", "vramUsed", 3, 2, 3, 2, ["vramPercent", "gpuUsage"]),
  ],
  rows: [
    card("gpu", "gpuUsage", 0, 0, 6, 1, ["gpuTemp", "gpuPower", "vramUsed"]),
    card("cpu", "cpuUsage", 0, 1, 6, 1, ["cpuTemp", "cpuClock", "cpuPower"]),
    card("ram", "ramUsed", 0, 2, 2, 2, ["ramPercent"]),
    card("storage", "storageRead", 2, 2, 2, 2, ["storageWrite", "storageUsed"]),
    card("network", "networkDown", 4, 2, 2, 2, ["networkUp"]),
  ],
  list: [
    card("gpu", "gpuUsage", 0, 0, 6, 1, ["gpuTemp", "gpuPower", "vramUsed"]),
    card("cpu", "cpuUsage", 0, 1, 6, 1, ["cpuTemp", "cpuClock", "cpuPower"]),
    card("ram", "ramUsed", 0, 2, 6, 1, ["ramPercent"]),
    card("vram", "vramUsed", 0, 3, 6, 1, ["vramPercent", "gpuUsage"]),
    card("storage", "storageRead", 0, 4, 6, 1, ["storageWrite", "storageUsed"]),
    card("network", "networkDown", 0, 5, 6, 1, ["networkUp"]),
  ],
  gaming: [
    card("fps", "fps", 0, 0, 4, 2, ["onePercentLow", "frameTime"]),
    card("gpu", "gpuUsage", 4, 0, 2, 2, ["gpuTemp", "gpuPower"]),
    card("cpu", "cpuUsage", 0, 2, 2, 2, ["cpuTemp", "cpuClock"]),
    card("vram", "vramUsed", 2, 2, 2, 2, ["vramPercent"]),
    card("ram", "ramUsed", 4, 2, 2, 2, ["ramPercent"]),
  ],
  six: [
    card("gpu", "gpuUsage", 0, 0, 2, 2, ["gpuTemp", "gpuPower"]),
    card("cpu", "cpuUsage", 2, 0, 2, 2, ["cpuTemp", "cpuClock"]),
    card("ram", "ramUsed", 4, 0, 2, 2, ["ramPercent"]),
    card("vram", "vramUsed", 0, 2, 2, 2, ["vramPercent"]),
    card("storage", "storageRead", 2, 2, 2, 2, ["storageWrite", "storageUsed"]),
    card("network", "networkDown", 4, 2, 2, 2, ["networkUp"]),
  ],
  paged: [
    card("gpu", "gpuUsage", 0, 0, 3, 4, ["gpuTemp", "gpuPower", "vramUsed"], 0),
    card("cpu", "cpuUsage", 3, 0, 3, 4, ["cpuTemp", "cpuClock", "cpuPower"], 0),
    card("ram", "ramUsed", 0, 0, 3, 4, ["ramPercent"], 1),
    card("vram", "vramUsed", 3, 0, 3, 4, ["vramPercent", "gpuUsage"], 1),
    card("storage", "storageRead", 0, 0, 3, 4, ["storageWrite", "storageUsed"], 2),
    card("network", "networkDown", 3, 0, 3, 4, ["networkUp"], 2),
  ],
};

export function clonePresetLayout(preset: LayoutPreset): LayoutItem[] {
  return presetLayouts[preset].map((item) => ({ ...item, details: [...item.details] }));
}

export function cloneLayoutProfiles(profiles?: LayoutProfiles): LayoutProfiles {
  const cloned: LayoutProfiles = {};
  for (const preset of Object.keys(presetLayouts) as LayoutPreset[]) {
    const layout = profiles?.[preset];
    if (Array.isArray(layout) && layout.length) {
      cloned[preset] = layout.map(item => ({ ...item, details: [...item.details] }));
    }
  }
  return cloned;
}

export function layoutForPreset(profiles: LayoutProfiles | undefined, preset: LayoutPreset): LayoutItem[] {
  const saved = profiles?.[preset];
  return Array.isArray(saved) && saved.length
    ? saved.map(item => ({ ...item, details: [...item.details] }))
    : clonePresetLayout(preset);
}

export function withLayoutProfile(
  profiles: LayoutProfiles | undefined,
  preset: LayoutPreset,
  layout: LayoutItem[],
): LayoutProfiles {
  return { ...cloneLayoutProfiles(profiles), [preset]: layout.map(item => ({ ...item, details: [...item.details] })) };
}

export const dashboardUiRevision = 8;
export const defaultLayout: LayoutItem[] = clonePresetLayout("four");

export const defaultPreferences: DashboardPreferences = {
  theme: "miami",
  accent: "#20f7e5",
  brightness: 100,
  glow: 70,
  compact: false,
  layoutPreset: "four",
  enabledMetrics: [...metricKeys],
  cpuAlert: 90,
  gpuAlert: 85,
  ramAlert: 92,
  clockMode: "automatic",
  clockFace: "foundry",
  clockFormat: "12",
  clockShowDate: true,
  clockColorMode: "theme",
  clockColor: "#20f7e5",
  gameInclude: [],
  gameExclude: [],
};
