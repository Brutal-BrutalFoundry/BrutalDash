import {DeviceCardSettings,deviceCardOptions} from './DeviceCardSettings';
import { PeripheralCard } from './PeripheralCard';
import {ChoiceSelect} from './ChoiceSelect';
import { BridgethingClient } from "@bridgething/client";
import { memo, useEffect, useMemo, useRef, useState, type ReactNode, type PointerEvent as ReactPointerEvent } from "react";
import packageJson from "../package.json";
import manifest from "../public/manifest.json";
import "./index.css";
import { pcClockDate, shouldShowClock } from "./clock";
import { ClockBrightnessController } from "./display-brightness";
import { daemonUrl } from "./daemon";
import { validProbeTarget } from "./network-quality";
import { displayName, clockLogo } from './branding';
import { BrandingSettings } from './BrandingSettings';
import { installDeviceInputForwarder, isRecordingMirror, recordingClient } from "./recording-mirror";
import {
  isCustomizeKey,
  isMediaToggleKey,
  isRangeResetKey,
  layoutSlotFromKey,
  playbackProgress,
  unavailableMetricMessage,
  wheelDirection,
} from "./media";
import {
  clonePresetLayout,
  upgradeGamingLayout,
  cloneLayoutSlots,
  cloneLayoutProfiles,
  dashboardUiRevision,
  defaultLayout,
  defaultPreferences,
  metricKeys,
  swapLayoutSlots,
  type DashboardPacket,
  type DashboardPreferences,
  type DashboardState,
  type ClockColorMode,
  type ClockFace,
  type ClockFormat,
  type ClockMode,
  type LayoutItem,
  type LayoutSlot,
  type LayoutPreset,
  type MetricKey,
  type ThemeName,
} from "./types";

const appVersion = packageJson.version;
const appVersionLabel = `v${appVersion.replace("-beta.", "-b")}`;
type MediaSnapshot = {
  ok: boolean; error: string | null; source: string | null; title: string | null;
  artist: string | null; album: string | null; playback: string | null;
  positionMs: number; durationMs: number; artwork: string | null; receivedAt: number;
};
type MetricMeta = {
  label: string;
  shortLabel: string;
  group: "devices" | "cpu" | "gpu" | "ram" | "vram" | "storage" | "network" | "fps";
};

const metricMeta: Record<MetricKey, MetricMeta> = {
  peripherals: {label:"Device batteries",shortLabel:"DEVICES",group:"devices"},
  gpuUsage: { label: "GPU Usage", shortLabel: "GPU", group: "gpu" },
  gpuTemp: { label: "GPU Temperature", shortLabel: "GPU TEMP", group: "gpu" },
  gpuHotspot: { label: "GPU Hotspot", shortLabel: "HOTSPOT", group: "gpu" },
  gpuClock: { label: "GPU Clock", shortLabel: "GPU CLOCK", group: "gpu" },
  gpuPower: { label: "GPU Power", shortLabel: "GPU POWER", group: "gpu" },
  cpuUsage: { label: "CPU Usage", shortLabel: "CPU", group: "cpu" },
  cpuTemp: { label: "CPU Temperature", shortLabel: "CPU TEMP", group: "cpu" },
  cpuClock: { label: "CPU Clock", shortLabel: "CPU CLOCK", group: "cpu" },
  cpuPower: { label: "CPU Package Power", shortLabel: "CPU POWER", group: "cpu" },
  ramUsed: { label: "RAM Used / Total", shortLabel: "RAM", group: "ram" },
  ramPercent: { label: "RAM Usage", shortLabel: "RAM LOAD", group: "ram" },
  vramUsed: { label: "VRAM Used / Total", shortLabel: "VRAM", group: "vram" },
  vramPercent: { label: "VRAM Usage", shortLabel: "VRAM LOAD", group: "vram" },
  storageUsed: { label: "Storage Used / Total", shortLabel: "STORAGE", group: "storage" },
  storagePercent: { label: "Storage Usage", shortLabel: "DISK USED", group: "storage" },
  storageFree: { label: "Storage Free", shortLabel: "FREE", group: "storage" },
  storageRead: { label: "Storage Read", shortLabel: "DISK READ", group: "storage" },
  storageWrite: { label: "Storage Write", shortLabel: "DISK WRITE", group: "storage" },
  networkDown: { label: "Download Rate", shortLabel: "NETWORK", group: "network" },
  networkUp: { label: "Upload Rate", shortLabel: "UPLOAD", group: "network" },
  fps: { label: "Frames Per Second", shortLabel: "FPS", group: "fps" },
  frameTime: { label: "Frame Time", shortLabel: "FRAMETIME", group: "fps" },
  onePercentLow: { label: "1% Low FPS", shortLabel: "1% LOW", group: "fps" },
};

const defaultDetails: Partial<Record<MetricKey, MetricKey[]>> = {
  gpuUsage: ["gpuTemp", "gpuPower", "vramUsed"],
  gpuTemp: ["gpuUsage", "gpuHotspot", "gpuPower"],
  gpuHotspot: ["gpuTemp", "gpuUsage"],
  gpuClock: ["gpuUsage", "gpuPower"],
  gpuPower: ["gpuUsage", "gpuTemp"],
  cpuUsage: ["cpuTemp", "cpuClock", "cpuPower"],
  cpuTemp: ["cpuUsage", "cpuClock", "cpuPower"],
  cpuClock: ["cpuUsage", "cpuTemp"],
  cpuPower: ["cpuUsage", "cpuTemp"],
  ramUsed: ["ramPercent"],
  ramPercent: ["ramUsed"],
  vramUsed: ["vramPercent", "gpuUsage"],
  vramPercent: ["vramUsed", "gpuUsage"],
  storageUsed: ["storageFree", "storageRead", "storageWrite"],
  storagePercent: ["storageFree", "storageRead", "storageWrite"],
  storageFree: ["storageUsed", "storageRead", "storageWrite"],
  storageRead: ["storageWrite", "storageFree"],
  storageWrite: ["storageRead", "storageFree"],
  networkDown: ["networkUp"],
  networkUp: ["networkDown"],
  fps: ["onePercentLow", "frameTime"],
  frameTime: ["fps", "onePercentLow"],
  onePercentLow: ["fps", "frameTime"],
};

const themeLabels: Record<ThemeName, string> = {
  rog: "ROG Neon",
  nvidia: "NVIDIA",
  miami: "Neon Miami",
  aurora: "Aurora",
  synthwave: "Synthwave",
  arctic: "Arctic",
  amber: "Amber",
  oled: "OLED True Black",
};

const presetLabels: Record<LayoutPreset, { letter: string; name: string }> = {
  four: { letter: "A", name: "Four Big" },
  rows: { letter: "B", name: "System Rows" },
  list: { letter: "C", name: "Readable List" },
  gaming: { letter: "D", name: "Gaming Focus" },
  six: { letter: "E", name: "Balanced Six" },
  paged: { letter: "F", name: "Two at a Time" },
  devices: {letter:"G", name:"Devices"},
};

const layoutPresets = Object.keys(presetLabels) as LayoutPreset[];
// Reuse immutable option trees; editing a value should not rebuild hundreds of options.
const metricOptions = metricKeys.map(metric => <option key={metric} value={metric}>{metricMeta[metric].label}</option>);
const detailOptions = Object.fromEntries(metricKeys.map(main => [main, metricOptions.filter(option => option.props.value !== main)]));

const previewMetrics = metricKeys.reduce((metrics, key) => {
  const temperature = key.indexOf("Temp") >= 0 || key === "gpuHotspot";
  metrics[key] = { value: null, unit: temperature ? "°C" : "", min: null, max: null };
  return metrics;
}, {} as DashboardPacket["metrics"]);

const previewPacket: DashboardPacket = {
  timestamp: Date.now(),
  clock: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
  pcTimeOffsetMinutes: new Date().getTimezoneOffset(),
  source: "native",
  fpsSource: null,
  connected: false,
  telemetryMessage: "Starting BrutalDash telemetry…",
  cpuName: "Waiting for PC telemetry",
  gpuName: "DeskThing preview",
  game: null,
  foreground: null,
  capacities: { ramGb: null, vramGb: null, storageGb: null },
  metrics: previewMetrics,
  alerts: [],
};

function formatMetric(value: number | null, unit: string, compact = false) {
  // The device page and desktop extension can update separately. Accept the
  // known misencoded temperature unit from .46/.47 during that transition.
  if (unit === "\u00c2\u00b0C") unit = "°C";
  if (value === null || !Number.isFinite(value)) return { value: "--", unit };
  if (unit === "MHz" && value >= 1_000) return { value: (value / 1_000).toFixed(2), unit: "GHz" };
  if (unit === "KB/s" && value >= 1_024) return { value: (value / 1_024).toFixed(1), unit: "MB/s" };
  if (unit === "MB/s" && value >= 1_024) return { value: (value / 1_024).toFixed(2), unit: "GB/s" };
  if (unit === "GB") return { value: value.toFixed(value >= 100 || compact ? 0 : 1), unit };
  if (unit === "ms") return { value: value.toFixed(1), unit };
  if (unit === "W") return { value: value.toFixed(value < 10 ? 1 : 0), unit };
  return { value: Math.round(value).toString(), unit };
}

function formatCapacity(value: number) {
  const rounded = Math.round(value);
  return Math.abs(value - rounded) < 0.6 ? String(rounded) : value.toFixed(1);
}

function formatPrimary(metric: MetricKey, packet: DashboardPacket, compact: boolean) {
  const reading = packet.metrics[metric];
  if (reading.value !== null && metric === "ramUsed" && packet.capacities.ramGb !== null) {
    return { value: `${reading.value.toFixed(1)} / ${formatCapacity(packet.capacities.ramGb)}`, unit: "GB", capacity: true };
  }
  if (reading.value !== null && metric === "vramUsed" && packet.capacities.vramGb !== null) {
    return { value: `${reading.value.toFixed(1)} / ${formatCapacity(packet.capacities.vramGb)}`, unit: "GB", capacity: true };
  }
  if (reading.value !== null && metric === "storageUsed" && packet.capacities.storageGb !== null) {
    if (packet.capacities.storageGb >= 1024) {
      return {
        value: `${(reading.value / 1024).toFixed(2)} / ${(packet.capacities.storageGb / 1024).toFixed(2)}`,
        unit: "TB",
        capacity: true,
      };
    }
    return {
      value: `${Math.round(reading.value)} / ${Math.round(packet.capacities.storageGb)}`,
      unit: "GB",
      capacity: true,
    };
  }
  return { ...formatMetric(reading.value, reading.unit, compact), capacity: false };
}

function metricProgress(metric: MetricKey, packet: DashboardPacket) {
  const value = packet.metrics[metric].value;
  if (value === null) return null;
  if (packet.metrics[metric].unit === "%") return Math.min(100, Math.max(0, value));
  if (metric === "ramUsed" && packet.capacities.ramGb) return Math.min(100, (value / packet.capacities.ramGb) * 100);
  if (metric === "vramUsed" && packet.capacities.vramGb) return Math.min(100, (value / packet.capacities.vramGb) * 100);
  if (metric === "storageUsed" && packet.capacities.storageGb) return Math.min(100, (value / packet.capacities.storageGb) * 100);
  return null;
}

function cloneLayout(layout: LayoutItem[]) {
  return layout.map((item) => ({ ...item, details: [...item.details] }));
}

function clonePreferences(preferences: DashboardPreferences): DashboardPreferences {
  return {
    ...defaultPreferences,
    ...preferences,
    displayName: displayName(preferences.displayName),
    clockLogo: clockLogo(preferences.clockLogo),
    enabledMetrics: [...(preferences.enabledMetrics || defaultPreferences.enabledMetrics)],
    gameInclude: [...(preferences.gameInclude || [])],
    gameExclude: [...(preferences.gameExclude || [])],
  };
}

function readFileText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(reader.error || new Error("Unable to read file"));
    reader.readAsText(file);
  });
}

function normalizeImportedLayout(value: unknown): LayoutItem[] | null {
  const input = Array.isArray(value)
    ? value
    : value && typeof value === "object" && Array.isArray((value as DashboardState).layout)
      ? (value as DashboardState).layout
      : null;
  if (!input || !input.length) return null;
  const usedIds = new Set<string>();
  return input.slice(0, 18).map((raw, index) => {
    const item = raw as Partial<LayoutItem>;
    const metric = metricKeys.includes(item.metric as MetricKey) ? item.metric as MetricKey : "cpuUsage";
    let id = typeof item.id === "string" && item.id ? item.id.slice(0, 40) : `card-${index}`;
    while (usedIds.has(id)) id = `${id}-${index}`;
    usedIds.add(id);
    const details = Array.isArray(item.details)
      ? item.details.filter((key): key is MetricKey => metricKeys.includes(key as MetricKey)).slice(0, 3)
      : [...(defaultDetails[metric] || [])];
    return {
      id,
      metric,
      details,
      x: Math.min(5, Math.max(0, Math.round(Number(item.x) || 0))),
      y: Math.min(11, Math.max(0, Math.round(Number(item.y) || 0))),
      w: Math.min(6, Math.max(1, Math.round(Number(item.w) || 2))),
      h: Math.min(4, Math.max(1, Math.round(Number(item.h) || 1))),
      ...deviceCardOptions(item),
      hidden: Boolean(item.hidden),
      page: Math.min(2, Math.max(0, Math.round(Number(item.page) || 0))),
    };
  });
}

function isLayoutPreset(value: unknown): value is LayoutPreset {
  return typeof value === "string" && layoutPresets.includes(value as LayoutPreset);
}

function App() {
  const mirrorMode = isRecordingMirror();
  const client = useMemo(() => mirrorMode ? recordingClient() : new BridgethingClient({ url: daemonUrl(), autoConnect: false }), [mirrorMode]);
  const [packet, setPacket] = useState(previewPacket);
  const [layout, setLayout] = useState(() => cloneLayout(defaultLayout));
  const [preferences, setPreferences] = useState(() => clonePreferences(defaultPreferences));
  const [editorOpen, setEditorOpen] = useState(false);
  const [draftLayout, setDraftLayout] = useState(() => cloneLayout(defaultLayout));
  const [draftPreferences, setDraftPreferences] = useState(() => clonePreferences(defaultPreferences));
  const [editorTab, setEditorTab] = useState<"layout" | "appearance" | "clock" | "games" | "alerts">("layout");
  const [mountedEditorTabs, setMountedEditorTabs] = useState(() => new Set(["layout"]));
  const [expandedCardId, setExpandedCardId] = useState<string | null>(null);
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [dragTargetId, setDragTargetId] = useState<string | null>(null);
  const [arrangeMode, setArrangeMode] = useState(false);
  const [holdingCardId, setHoldingCardId] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const [notice, setNotice] = useState("");
  const [editorClosePromptOpen, setEditorClosePromptOpen] = useState(false);
  const [now, setNow] = useState(Date.now());
  const [lastPacketReceivedAt, setLastPacketReceivedAt] = useState(Date.now());
  const [mediaOpen, setMediaOpen] = useState(false);
  const [mediaSnapshot, setMediaSnapshot] = useState<MediaSnapshot | null>(null);
  const [layoutSlots, setLayoutSlots] = useState<Array<LayoutSlot | null>>(() => cloneLayoutSlots());
  const [displayBrightness, setDisplayBrightness] = useState(0.35);
  const [installedUpdate, setInstalledUpdate] = useState<string | null>(null);
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved" | "failed">("idle");
  const profilesRef = useRef<DashboardState['layoutProfiles']>({});
  const draftProfilesRef = useRef<DashboardState['layoutProfiles']>({});
  const pendingSaveRef = useRef<{id:string;timer:number} | null>(null);
  const importRef = useRef<HTMLInputElement>(null);
  const editorOpenRef = useRef(false);
  const editorBaselineRef = useRef<{ layout: LayoutItem[]; preferences: DashboardPreferences } | null>(null);
  const editorShellRef = useRef<HTMLDivElement>(null);
  const pageSwipeStartRef = useRef<{ x: number; y: number } | null>(null);
  const metricsGridRef = useRef<HTMLElement>(null);
  const mediaOpenRef = useRef(false);
  const pendingPacketRef = useRef<DashboardPacket | null>(null);
  const packetFlushTimerRef = useRef<number | null>(null);
  const latestPacketReceivedAtRef = useRef(Date.now());
  const lastVolumeWheelAtRef = useRef(0);
  const presetPressRef = useRef<{ slot: number; holdTimer: number; releaseTimer: number; saved: boolean } | null>(null);
  const layoutRef = useRef(layout);
  const preferencesRef = useRef(preferences);
  const layoutSlotsRef = useRef(layoutSlots);
  const activeLayoutSlotRef = useRef<number | null>(null);
  const latestSaveRequestIdRef = useRef<string | null>(null);
  const displayBrightnessRef = useRef(0.35);
  const clockShowingRef = useRef(false);
  const brightnessController = useMemo(() => new ClockBrightnessController(client.hardware), [client]);
  const pointerSwapRef = useRef<{ id: string; pointerId: number; x: number; y: number; moved: boolean } | null>(null);
  const longPressRef = useRef<{ timer: number; cueTimer:number; pointerId: number; x: number; y: number } | null>(null);

  useEffect(() => mirrorMode ? undefined : installDeviceInputForwarder(client), [client, mirrorMode]);

  useEffect(() => {
    if (mirrorMode) return;
    client.connect();
    return () => client.close();
  }, [client, mirrorMode]);

  useEffect(() => client.webapp.onWebappInstalled((installed) => {
    if (installed.id === manifest.id && installed.version !== appVersion) {
      setInstalledUpdate(installed.version);
    }
  }), [client]);

  useEffect(() => {
    // BridgeThing can replace a bundle while keeping its previous page alive.
    // Wait until editing ends so an update cannot discard unsaved customization.
    if (installedUpdate && !editorOpen) window.location.reload();
  }, [installedUpdate, editorOpen]);

  useEffect(() => {
    const removeForward = client.forward.onJson((message) => {
      if (!message || typeof message !== "object" || !("type" in message)) return;
      const data = message as { type?: unknown; payload?: unknown; requestId?: string };
      if ((data.type === 'dashboard:saved' || data.type === 'dashboard:save-failed') && data.payload) {
        const saved = data.payload as {requestId?:string};
        if (mirrorMode) setSaveStatus(data.type === 'dashboard:saved' ? 'saved' : 'failed');
        if (pendingSaveRef.current && saved.requestId === pendingSaveRef.current.id) {
          window.clearTimeout(pendingSaveRef.current.timer);
          pendingSaveRef.current = null;
          setSaveStatus(data.type === 'dashboard:saved' ? 'saved' : 'failed');
          setNotice(data.type === 'dashboard:saved' ? 'Layout saved' : 'Layout save failed — retry before closing');
        }
      }
      if (data.type === "dashboard:data" && data.payload && !editorOpenRef.current) {
        latestPacketReceivedAtRef.current = Date.now();
        pendingPacketRef.current = data.payload as DashboardPacket;
        if (packetFlushTimerRef.current === null) {
          packetFlushTimerRef.current = window.setTimeout(() => {
            packetFlushTimerRef.current = null;
            const pending = pendingPacketRef.current;
            if (!pending || editorOpenRef.current) return;
            pendingPacketRef.current = null;
            setPacket(pending);
            setLastPacketReceivedAt(latestPacketReceivedAtRef.current);
          }, 750);
        }
      }
      if (data.type === "dashboard:state" && data.payload && typeof data.payload === "object") {
        // Ignore replies for an earlier selection and legacy untagged echoes
        // while a local save is pending. The latest local view is authoritative.
        if (!mirrorMode && ((data.requestId && data.requestId !== latestSaveRequestIdRef.current)
          || (!data.requestId && pendingSaveRef.current))) return;
        const state = data.payload as DashboardState;
        const nextLayout = upgradeGamingLayout(cloneLayout(state.layout), state.preferences.layoutPreset);
        const nextPreferences = clonePreferences(state.preferences);
        const nextSlots = cloneLayoutSlots(state.layoutSlots);
        if (!pendingSaveRef.current) profilesRef.current = cloneLayoutProfiles(state.layoutProfiles);
        const sameView = JSON.stringify([layoutRef.current, preferencesRef.current, layoutSlotsRef.current])
          === JSON.stringify([nextLayout, nextPreferences, nextSlots]);
        layoutRef.current = nextLayout;
        preferencesRef.current = nextPreferences;
        layoutSlotsRef.current = nextSlots;
        if (!sameView) {
          setLayout(nextLayout);
          setPreferences(nextPreferences);
          setLayoutSlots(nextSlots);
        }
        if (!data.requestId) void client.doc.set({ key: "dashboard-state", value: JSON.stringify(state) });
      }
      if (data.type === "dashboard:error" && data.payload && typeof data.payload === "object") {
        const error = data.payload as { message?: unknown };
        setNotice(typeof error.message === "string" ? error.message : "Desktop telemetry unavailable");
      }
      if (mediaOpenRef.current && data.type === "media:data" && data.payload && typeof data.payload === "object") {
        setMediaSnapshot({ ...(data.payload as Omit<MediaSnapshot, "receivedAt">), receivedAt: Date.now() });
      }
    });
    void client.forward.json({ type: "dashboard:get" });
    const ticker = window.setInterval(() => {
      const current = Date.now();
      if (!editorOpenRef.current && (preferencesRef.current.clockMode === "clock" || current - latestPacketReceivedAtRef.current > 4_000)) {
        setNow(current);
      }
    }, 1_000);
    return () => {
      removeForward();
      window.clearInterval(ticker);
      if (packetFlushTimerRef.current !== null) window.clearTimeout(packetFlushTimerRef.current);
      packetFlushTimerRef.current = null;
      pendingPacketRef.current = null;
      if (longPressRef.current) {window.clearTimeout(longPressRef.current.timer);window.clearTimeout(longPressRef.current.cueTimer);}
    };
  }, [client]);

  useEffect(() => {
    mediaOpenRef.current = mediaOpen;
  }, [mediaOpen]);

  useEffect(() => {
    layoutRef.current = layout;
    preferencesRef.current = preferences;
    layoutSlotsRef.current = layoutSlots;
  }, [layout, preferences, layoutSlots]);

  useEffect(() => {
    void client.forward.json({ type: "media:subscribe", payload: { active: mediaOpen } }).catch(() => undefined);
    if (!mediaOpen) setMediaSnapshot(null);

    return () => { if (mediaOpen) void client.forward.json({ type: "media:subscribe", payload: { active: false } }).catch(() => undefined); };
  }, [client, mediaOpen]);

  useEffect(() => {
    const update = (brightness: { effectiveLevel: number }) => {
      displayBrightnessRef.current = brightness.effectiveLevel;
      if (clockShowingRef.current) setDisplayBrightness(brightness.effectiveLevel);
    };
    const remove = client.hardware.onBrightnessChanged(update);
    void client.hardware.stateGet().then(result => {
      if (result.ok) update(result.response.state.brightness);
    }).catch(() => undefined);
    return remove;
  }, [client]);

  useEffect(() => {
    editorOpenRef.current = editorOpen;
    if (!editorOpen) return;
    const focusTimer = window.setTimeout(() => editorShellRef.current?.focus(), 0);
    return () => window.clearTimeout(focusTimer);
  }, [editorOpen]);

  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(""), 2_500);
    return () => window.clearTimeout(timer);
  }, [notice]);

  const displayedLayout = editorOpen ? draftLayout : layout;
  const displayedPreferences = editorOpen ? draftPreferences : preferences;
  const visibleCards = displayedLayout.filter((item) => {
    if (item.hidden) return false;
    return displayedPreferences.layoutPreset !== "paged" || (item.page || 0) === page;
  });
  const status = now - lastPacketReceivedAt > 5_000 ? "stale" : packet.connected ? "live" : "fallback";
  const clockActive = shouldShowClock(displayedPreferences.clockMode, now, lastPacketReceivedAt, editorOpen);
  clockShowingRef.current = clockActive;
  useEffect(() => {
    void brightnessController.setClockActive(clockActive).catch(() => setNotice("Display brightness could not be restored"));
  }, [brightnessController, clockActive]);
  const headerTitle = <span className="wordmark-full" title={displayName(displayedPreferences.displayName)}>{displayName(displayedPreferences.displayName)}</span>;
  const subtitle = `${packet.cpuName} · ${packet.gpuName}`;
  const telemetryLabel = !packet.connected
    ? "WAITING"
    : packet.source === "hwinfo"
      ? "HWiNFO"
      : packet.source === "hybrid"
        ? "HWiNFO+"
        : "NATIVE";

  const style = useMemo(
    () => ({
      "--accent": displayedPreferences.accent,
      "--brightness": `${clockActive ? 100 : displayedPreferences.brightness}%`,
      "--glow": displayedPreferences.glow / 100,
      "--clock-color": displayedPreferences.clockColorMode === "custom" ? displayedPreferences.clockColor : "var(--accent)",
    }) as React.CSSProperties,
    [displayedPreferences, clockActive],
  );

  const setMediaDrawerOpen = (nextOpen: boolean) => {
    if (nextOpen === mediaOpenRef.current) return;
    mediaOpenRef.current = nextOpen;
    setMediaOpen(nextOpen);
  };

  useEffect(() => {
    const handleMediaKey = (event: KeyboardEvent) => {
      if (editorOpenRef.current || !isMediaToggleKey(event.key, event.code, event.repeat)) return;
      event.preventDefault();
      event.stopPropagation();
      if (clockActive) return;
      setMediaDrawerOpen(!mediaOpenRef.current);
    };
    document.addEventListener("keydown", handleMediaKey, true);
    return () => document.removeEventListener("keydown", handleMediaKey, true);
  }, [client, clockActive]);

  const openEditor = () => {
    editorOpenRef.current = true;
    const baselineLayout = cloneLayout(layoutRef.current);
    const baselinePreferences = clonePreferences(preferencesRef.current);
    editorBaselineRef.current = { layout: baselineLayout, preferences: baselinePreferences };
    draftProfilesRef.current = cloneLayoutProfiles(profilesRef.current);
    setMediaOpen(false);
    setDraftLayout(cloneLayout(baselineLayout));
    setDraftPreferences(clonePreferences(baselinePreferences));
    setExpandedCardId(null);
    setEditorTab("layout");
    setArrangeMode(false);
    setEditorClosePromptOpen(false);
    setEditorOpen(true);
  };

  const finishEditorClose = () => {
    editorOpenRef.current = false;
    cancelGesture();
    setEditorClosePromptOpen(false);
    setEditorOpen(false);
    setArrangeMode(false);
    setDraggedId(null);
    setDragTargetId(null);
    editorBaselineRef.current = null;
  };

  const editorHasChanges = () => {
    const baseline = editorBaselineRef.current;
    if (!baseline) return false;
    return JSON.stringify(draftLayout) !== JSON.stringify(baseline.layout)
      || JSON.stringify(draftPreferences) !== JSON.stringify(baseline.preferences);
  };

  const discardEditor = () => {
    const baseline = editorBaselineRef.current;
    if (baseline) {
      setDraftLayout(cloneLayout(baseline.layout));
      setDraftPreferences(clonePreferences(baseline.preferences));
    }
    finishEditorClose();
    setNotice("Changes discarded");
  };

  const requestEditorClose = () => {
    document.dispatchEvent(new Event('brutaldash:close-choices'));
    if (pendingSaveRef.current) { setNotice('Saving layout…'); return; }
    if (saveStatus === 'failed') { setNotice('Layout save failed — use Save to retry'); return; }
    if (editorClosePromptOpen) return;
    if (editorHasChanges()) {
      setEditorClosePromptOpen(true);
      return;
    }
    finishEditorClose();
  };

  useEffect(() => {
    const handleCustomizeKey = (event: KeyboardEvent) => {
      if ((event.target instanceof Element && event.target.closest('input,textarea,select,[contenteditable="true"]')) || !isCustomizeKey(event.key, event.code, event.repeat)) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      if (editorOpenRef.current) requestEditorClose();
      else openEditor();
    };
    document.addEventListener("keydown", handleCustomizeKey, true);
    return () => document.removeEventListener("keydown", handleCustomizeKey, true);
  }, [layout, preferences, draftLayout, draftPreferences, editorClosePromptOpen]);

  const saveEditor = () => {
    if (draftPreferences.networkProbeEnabled && !validProbeTarget(draftPreferences.networkProbeTarget)) {
      setNotice("Enter a valid IPv4 address for the network probe");
      return;
    }
    const nextLayout = cloneLayout(draftLayout);
    const nextPreferences = clonePreferences(draftPreferences);
    layoutRef.current = nextLayout;
    preferencesRef.current = nextPreferences;
    setLayout(nextLayout);
    setPreferences(nextPreferences);
    setPage(0);
    profilesRef.current = {...cloneLayoutProfiles(draftProfilesRef.current),[nextPreferences.layoutPreset]:nextLayout};
    persistDashboard(nextLayout,nextPreferences,layoutSlots);
    finishEditorClose();
    setNotice("Saving dashboard…");
  };

  const choosePreset = (layoutPreset: LayoutPreset) => {
    if (layoutPreset === draftPreferences.layoutPreset) return;
    draftProfilesRef.current = {...draftProfilesRef.current,[draftPreferences.layoutPreset]:cloneLayout(draftLayout)};
    const presetLayout = cloneLayout(draftProfilesRef.current?.[layoutPreset] || clonePresetLayout(layoutPreset));
    setDraftPreferences((current) => ({ ...current, layoutPreset }));
    setDraftLayout(presetLayout);
    setExpandedCardId(null);
    setPage(0);
  };

  const updateItem = (id: string, update: Partial<LayoutItem>) => {
    setDraftLayout((current) => current.map((item) => {
      if (item.id !== id) return item;
      const next = { ...item, ...update };
      next.w = Math.min(6, Math.max(1, next.w));
      next.h = Math.min(4, Math.max(1, next.h));
      next.x = Math.min(6 - next.w, Math.max(0, next.x));
      next.y = Math.min(11, Math.max(0, next.y));
      next.page = Math.min(2, Math.max(0, next.page || 0));
      return next;
    }));
  };

  const changeMetric = (id: string, metric: MetricKey) => {
    updateItem(id, { metric, details: [...(defaultDetails[metric] || [])] });
  };

  const changeDetail = (id: string, index: number, metric: MetricKey | "") => {
    const item = draftLayout.find((candidate) => candidate.id === id);
    if (!item) return;
    const details = [...item.details];
    if (metric) details[index] = metric;
    else details.splice(index, 1);
    updateItem(id, { details: details.filter((key, detailIndex) => details.indexOf(key) === detailIndex).slice(0, 3) });
  };

  const duplicateItem = (id: string) => {
    setDraftLayout((current) => {
      if (current.length >= 18) return current;
      const source = current.find((item) => item.id === id);
      if (!source) return current;
      const duplicate: LayoutItem = {
        ...source,
        id: `${source.id}-copy-${Date.now()}`,
        details: [...source.details],
        x: Math.min(6 - source.w, source.x + 1),
        y: Math.min(11, source.y + 1),
      };
      return [...current, duplicate];
    });
  };

  const moveItem = (id: string, dx: number, dy: number) => {
    const item = draftLayout.find((candidate) => candidate.id === id);
    if (item) updateItem(id, { x: item.x + dx, y: item.y + dy });
  };

  const resizeItem = (id: string, dw: number, dh: number) => {
    const item = draftLayout.find((candidate) => candidate.id === id);
    if (item) updateItem(id, { w: item.w + dw, h: item.h + dh });
  };

  const swapCards = (sourceId: string, targetId: string, patch?: Partial<LayoutItem>) => {
    if (sourceId === targetId && !patch) return;
    const editing = editorOpenRef.current;
    const current = editing ? draftLayout : layoutRef.current;
    const nextPreferences = clonePreferences(editing ? draftPreferences : preferencesRef.current);
    const next = patch ? current.map(item=>item.id===sourceId?{...item,...patch}:item) : swapLayoutSlots(current, sourceId, targetId);
    setDraftLayout(next);
    setLayout(next);
    layoutRef.current = next;
    setPreferences(nextPreferences);
    preferencesRef.current = nextPreferences;
    const profiles = editing ? draftProfilesRef.current : profilesRef.current;
    profilesRef.current = {...cloneLayoutProfiles(profiles),[nextPreferences.layoutPreset]:cloneLayout(next)};
    draftProfilesRef.current = cloneLayoutProfiles(profilesRef.current);
    if (editing) editorBaselineRef.current = {layout:cloneLayout(next),preferences:clonePreferences(nextPreferences)};
    // A recalled button layout must retain the swap when that button is used
    // again. Update its matching saved arrangement, not unrelated presets.
    const signature = (items: LayoutItem[]) => JSON.stringify(items.map(item => [item.id,item.metric,item.x,item.y,item.w,item.h,item.page || 0,!!item.hidden,item.details]).sort((a,b) => String(a[0]).localeCompare(String(b[0]))));
    const currentSignature = signature(current);
    const nextSlots = cloneLayoutSlots(layoutSlotsRef.current);
    const candidates = nextSlots.flatMap((slot,index) => slot && slot.layoutPreset === nextPreferences.layoutPreset && slot.compact === nextPreferences.compact ? [index] : []);
    const exactSlot = candidates.find(index => signature(upgradeGamingLayout(nextSlots[index]!.layout,nextPreferences.layoutPreset)) === currentSignature);
    const activeSlot = activeLayoutSlotRef.current;
    const matchingSlot = activeSlot !== null && candidates.includes(activeSlot) ? activeSlot : exactSlot ?? (candidates.length === 1 ? candidates[0] : -1);
    if (matchingSlot >= 0) {
      activeLayoutSlotRef.current = matchingSlot;
      nextSlots[matchingSlot] = {...nextSlots[matchingSlot]!,layout:cloneLayout(next)};
      layoutSlotsRef.current = nextSlots;
      setLayoutSlots(nextSlots);
    }
    persistDashboard(next,nextPreferences,nextSlots);
  };

  const dropOnCard = (targetId: string) => {
    if (draggedId) swapCards(draggedId, targetId);
    setDraggedId(null);
    setDragTargetId(null);
  };

  const cardAtPointer = (event: ReactPointerEvent<HTMLElement>) => {
    const card = document.elementsFromPoint(event.clientX, event.clientY)
      .map(element => element.closest<HTMLElement>("[data-card-id]"))
      .find(card => card && metricsGridRef.current?.contains(card));
    return card?.dataset.cardId || null;
  };

  const cancelLongPress = (pointerId?: number) => {
    const pending = longPressRef.current;
    if (!pending || (pointerId !== undefined && pending.pointerId !== pointerId)) return;
    window.clearTimeout(pending.timer);
    window.clearTimeout(pending.cueTimer);
    longPressRef.current = null;
    setHoldingCardId(null);
  };

  const cancelGesture = () => {
    const pending = longPressRef.current;
    cancelLongPress();
    const active = pointerSwapRef.current;
    pointerSwapRef.current = null;
    if (active && metricsGridRef.current?.hasPointerCapture(active.pointerId)) metricsGridRef.current.releasePointerCapture(active.pointerId);
    if (pending && metricsGridRef.current?.hasPointerCapture(pending.pointerId)) metricsGridRef.current.releasePointerCapture(pending.pointerId);
    pageSwipeStartRef.current = null;
    setDraggedId(null);
    setDragTargetId(null);
  };

  const startCardGesture = (id: string, event: ReactPointerEvent<HTMLElement>) => {
    if (event.button !== 0 || !event.isPrimary || pointerSwapRef.current || longPressRef.current) return;
    if (editorOpenRef.current && !arrangeMode) return;
    // Own the touch from its beginning, including the browser's native hold.
    event.preventDefault();
    const { pointerId, clientX: x, clientY: y } = event;
    if (!mirrorMode) metricsGridRef.current?.setPointerCapture(pointerId);
    if (arrangeMode) {
      event.preventDefault();
      pointerSwapRef.current = { id, pointerId, x, y, moved: false };
      setDraggedId(id);
      return;
    }
    const cueTimer=window.setTimeout(()=>{if(longPressRef.current?.pointerId===pointerId)setHoldingCardId(id);},500);
    const timer = window.setTimeout(() => {
      if (longPressRef.current?.pointerId !== pointerId) return;
      longPressRef.current = null;
      setHoldingCardId(null);
      pageSwipeStartRef.current = null;
      pointerSwapRef.current = { id, pointerId, x, y, moved: false };
      setDraggedId(id);
    }, 1500);
    longPressRef.current = { timer, cueTimer, pointerId, x, y };
  };

  const moveCardGesture = (event: ReactPointerEvent<HTMLElement>) => {
    const pending = longPressRef.current;
    if (pending?.pointerId === event.pointerId && Math.hypot(event.clientX-pending.x,event.clientY-pending.y)>12) cancelLongPress(event.pointerId);
    const active = pointerSwapRef.current;
    if (!active || active.pointerId !== event.pointerId) return;
    event.preventDefault();
    if (Math.hypot(event.clientX-active.x,event.clientY-active.y)>8) active.moved=true;
    const target = active.moved ? cardAtPointer(event) : null;
    setDragTargetId(target !== active.id ? target : null);
  };

  const finishCardGesture = (event: ReactPointerEvent<HTMLElement>) => {
    cancelLongPress(event.pointerId);
    const active = pointerSwapRef.current;
    if (active && active.pointerId !== event.pointerId) return;
    const target = active?.moved ? cardAtPointer(event) : null;
    if (active && target && target !== active.id) swapCards(active.id,target);
    if (!active && displayedPreferences.layoutPreset === 'paged' && !editorOpenRef.current) finishPageSwipe(event);
    cancelGesture();
    if (metricsGridRef.current?.hasPointerCapture(event.pointerId)) metricsGridRef.current.releasePointerCapture(event.pointerId);
  };

  useEffect(() => {
    const cancel = () => cancelGesture();
    const hidden = () => { if (document.hidden) cancel(); };
    window.addEventListener('blur',cancel);
    document.addEventListener('visibilitychange',hidden);
    return () => { window.removeEventListener('blur',cancel); document.removeEventListener('visibilitychange',hidden); };
  }, []);

  const exportLayout = () => {
    const payload: DashboardState = { layout: draftLayout, preferences: draftPreferences, layoutSlots, layoutProfiles:cloneLayoutProfiles(draftProfilesRef.current), uiRevision: dashboardUiRevision };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "brutaldash-layout.json";
    anchor.click();
    URL.revokeObjectURL(url);
    setNotice("Layout exported");
  };

  const importLayout = async (file: File) => {
    try {
      const parsed = JSON.parse(await readFileText(file)) as unknown;
      const imported = normalizeImportedLayout(parsed);
      if (!imported) throw new Error("No layout cards found");
      setDraftLayout(imported);
      if(parsed && typeof parsed === 'object' && 'layoutProfiles' in parsed) draftProfilesRef.current = cloneLayoutProfiles((parsed as DashboardState).layoutProfiles);
      if (parsed && typeof parsed === "object" && "preferences" in parsed) {
        const importedPreferences = (parsed as Partial<DashboardState>).preferences;
        const importedPreset = importedPreferences && importedPreferences.layoutPreset;
        setDraftPreferences((current) => ({
          ...current,
          ...(importedPreferences || {}),
          layoutPreset: isLayoutPreset(importedPreset)
            ? importedPreset
            : current.layoutPreset,
          enabledMetrics: Array.isArray(importedPreferences && importedPreferences.enabledMetrics)
            ? importedPreferences!.enabledMetrics.filter((metric) => metricKeys.includes(metric))
            : current.enabledMetrics,
        }));
      }
      setPage(0);
      setNotice("Layout imported — save to apply");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Import failed");
    }
  };

  const changePage = (direction: number) => {
    setPage((current) => (current + direction + 3) % 3);
  };

  const startPageSwipe = (event: ReactPointerEvent<HTMLElement>) => {
    pageSwipeStartRef.current = { x: event.clientX, y: event.clientY };
  };

  const finishPageSwipe = (event: ReactPointerEvent<HTMLElement>) => {
    const start = pageSwipeStartRef.current;
    pageSwipeStartRef.current = null;
    if (!start) return;
    const deltaX = event.clientX - start.x;
    const deltaY = event.clientY - start.y;
    if (Math.abs(deltaX) < 55 || Math.abs(deltaX) <= Math.abs(deltaY) * 1.2) return;
    changePage(deltaX < 0 ? 1 : -1);
  };

  const setGameRule = (processName: string, rule: "include" | "exclude" | "clear") => {
    const normalizeRule = (value: string) => value.trim().toLowerCase().replace(/\.exe$/i, "");
    const normalized = normalizeRule(processName);
    if (!normalized) return;
    setDraftPreferences((current) => ({
      ...current,
      gameInclude: rule === "include"
        ? [...new Set([...(current.gameInclude || []).filter(entry => normalizeRule(entry) !== normalized), processName])]
        : (current.gameInclude || []).filter(entry => normalizeRule(entry) !== normalized),
      gameExclude: rule === "exclude"
        ? [...new Set([...(current.gameExclude || []).filter(entry => normalizeRule(entry) !== normalized), processName])]
        : (current.gameExclude || []).filter(entry => normalizeRule(entry) !== normalized),
    }));
  };

  const runMediaCommand = (command: () => Promise<void>) => {
    void command().catch(() => setNotice("Media control unavailable"));
  };

  const runPcMediaCommand = (command: "previous" | "playPause" | "next") => {
    runMediaCommand(() => client.forward.json({ type: "media:command", payload: { command } }));
  };


  const persistDashboard = (nextLayout: LayoutItem[], nextPreferences: DashboardPreferences, nextSlots: Array<LayoutSlot | null>) => {
    if (mirrorMode) { setSaveStatus('saving'); return; }
    const state: DashboardState = { layout: nextLayout, preferences: nextPreferences, layoutSlots: nextSlots, layoutProfiles:{...cloneLayoutProfiles(profilesRef.current),[nextPreferences.layoutPreset]:cloneLayout(nextLayout)}, uiRevision: dashboardUiRevision };
    const requestId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    latestSaveRequestIdRef.current = requestId;
    if (pendingSaveRef.current) window.clearTimeout(pendingSaveRef.current.timer);
    const failed = () => { if (pendingSaveRef.current?.id === requestId) { pendingSaveRef.current = null; setSaveStatus('failed'); setNotice('Layout save not confirmed — retry before closing'); } };
    pendingSaveRef.current = {id:requestId,timer:window.setTimeout(failed,8000)};
    setSaveStatus('saving');
    void client.forward.json({ type: "dashboard:save", requestId, payload: state }).catch(failed);
    void client.doc.set({ key: "dashboard-state", value: JSON.stringify(state) }).catch(() => undefined);
  };

  const saveLayoutSlot = (slot: number) => {
    activeLayoutSlotRef.current = slot;
    const currentLayout = layoutRef.current;
    const currentPreferences = preferencesRef.current;
    const nextSlots = cloneLayoutSlots(layoutSlotsRef.current);
    nextSlots[slot] = {
      layout: cloneLayout(currentLayout),
      layoutPreset: currentPreferences.layoutPreset,
      compact: currentPreferences.compact,
    };
    layoutSlotsRef.current = nextSlots;
    setLayoutSlots(nextSlots);
    persistDashboard(currentLayout, currentPreferences, nextSlots);
    setNotice(`Layout saved to button ${slot + 1}`);
  };

  const loadLayoutSlot = (slot: number) => {
    const saved = layoutSlotsRef.current[slot];
    if (!saved) {
      setNotice(`Hold button ${slot + 1} to save this layout`);
      return;
    }
    activeLayoutSlotRef.current = slot;
    const nextLayout = upgradeGamingLayout(cloneLayout(saved.layout), saved.layoutPreset);
    const nextPreferences = { ...preferencesRef.current, layoutPreset: saved.layoutPreset, compact: saved.compact };
    layoutRef.current = nextLayout;
    preferencesRef.current = nextPreferences;
    setLayout(nextLayout);
    setPreferences(nextPreferences);
    setPage(0);
    persistDashboard(nextLayout, nextPreferences, layoutSlotsRef.current);
    setNotice(`Layout ${slot + 1}`);
  };

  useEffect(() => {
    const finish = (press: NonNullable<typeof presetPressRef.current>, recall: boolean) => {
      window.clearTimeout(press.holdTimer);
      window.clearTimeout(press.releaseTimer);
      if (presetPressRef.current === press) presetPressRef.current = null;
      if (recall && !press.saved) loadLayoutSlot(press.slot);
    };

    const scheduleKeydownOnlyRelease = (press: NonNullable<typeof presetPressRef.current>) => {
      window.clearTimeout(press.releaseTimer);
      press.releaseTimer = window.setTimeout(() => finish(press, true), 250);
    };

    const down = (event: KeyboardEvent) => {
      if (editorOpenRef.current) return;
      if (isRangeResetKey(event.key, event.code, event.repeat)) {
        event.preventDefault();
        event.stopPropagation();
        void client.forward.json({ type: "dashboard:reset-ranges" });
        setNotice("MIN/MAX reset");
        return;
      }
      const slot = layoutSlotFromKey(event.key, event.code);
      if (slot === null) return;
      event.preventDefault();
      event.stopPropagation();

      const active = presetPressRef.current;
      if (active && active.slot === slot) {
        scheduleKeydownOnlyRelease(active);
        return;
      }
      if (active) finish(active, true);

      const press = { slot, holdTimer: 0, releaseTimer: 0, saved: false };
      press.holdTimer = window.setTimeout(() => {
        if (presetPressRef.current !== press) return;
        press.saved = true;
        saveLayoutSlot(slot);
      }, 900);
      presetPressRef.current = press;
      scheduleKeydownOnlyRelease(press);
    };
    const up = (event: KeyboardEvent) => {
      const slot = layoutSlotFromKey(event.key, event.code);
      const press = presetPressRef.current;
      if (slot === null || !press || press.slot !== slot) return;
      event.preventDefault();
      event.stopPropagation();
      finish(press, true);
    };
    document.addEventListener("keydown", down, true);
    document.addEventListener("keyup", up, true);
    return () => {
      document.removeEventListener("keydown", down, true);
      document.removeEventListener("keyup", up, true);
      if (presetPressRef.current) finish(presetPressRef.current, false);
      presetPressRef.current = null;
    };
  }, [client]);

  return (
    <main
      className={`dashboard theme-${displayedPreferences.theme} preset-${displayedPreferences.layoutPreset}${displayedPreferences.compact ? " is-compact" : ""}${editorOpen ? " is-editing" : ""}${arrangeMode ? " is-arranging" : ""}${clockActive ? " is-clock-mode" : ""}${mediaOpen && !editorOpen ? " is-media-open" : ""}`}
      style={style}
      onWheel={(event) => {
        if (editorOpen) return;
        const direction = wheelDirection(event.deltaX, event.deltaY);
        if (clockActive && direction) {
          event.preventDefault();
          const next = Math.min(1, Math.max(0.03, displayBrightnessRef.current + direction * 0.01));
          displayBrightnessRef.current = next;
          setDisplayBrightness(next);
          void brightnessController.setLevel(next).catch(() => setNotice("Brightness control unavailable"));
          setNotice(`Clock brightness ${Math.round(next * 100)}%`);
          return;
        }
        if (mediaOpen && direction) {
          event.preventDefault();
          const wheelAt = performance.now();
          if (wheelAt - lastVolumeWheelAtRef.current < 80) return;
          lastVolumeWheelAtRef.current = wheelAt;
          runMediaCommand(() => client.forward.json({
            type: "media:volume",
            payload: {
              delta: direction > 0 ? 0.03 : -0.03,
              source: mediaSnapshot?.source || null,
            },
          }));
          return;
        }
        if (displayedPreferences.layoutPreset === "paged" && direction) {
          changePage(direction > 0 ? 1 : -1);
        }
      }}
    >
      <div className="ambient-grid" />
      {clockActive && <ClockScreen now={now} offsetMinutes={packet.pcTimeOffsetMinutes} preferences={displayedPreferences} brightness={displayBrightness} />}
      <header className="dashboard-header">
        <div className="brand-lockup">
          <img
            className="brutalfoundry-logo"
            src={clockLogo(displayedPreferences.clockLogo) || '/assets/brutalfoundry-logo.png'}
            alt={displayName(displayedPreferences.displayName)}
          />
          <div className="brand-block">
            <div className="eyebrow">
              <span className={`status-dot status-${status}`} />
              {packet.game ? "GAME DETECTED" : packet.connected ? "LIVE SYSTEM" : "TELEMETRY WAITING"}
            </div>
            <h1 className="brutaldash-wordmark">{headerTitle}</h1>
            <span className="system-name">{subtitle}</span>
          </div>
        </div>
        <time className="dashboard-clock" dateTime={new Date(packet.timestamp).toISOString()}>{packet.clock}</time>
        <div className="header-actions">
          <span className="source-badge" title={packet.fpsSource ? `FPS: ${packet.fpsSource}` : packet.connected ? "FPS unavailable" : packet.telemetryMessage || "Telemetry unavailable"}>
            {status === "stale" ? "STALE" : telemetryLabel}
          </span>
          <span className="version-badge" title={`BrutalDash ${appVersion}`}>{appVersionLabel}</span>
        </div>
      </header>

      <section ref={metricsGridRef} className="metrics-grid" aria-label="Live PC metrics"
        onPointerDown={event => { if (displayedPreferences.layoutPreset === 'paged' && !editorOpenRef.current) startPageSwipe(event); }}
        onPointerMove={moveCardGesture} onPointerUp={finishCardGesture}
        onPointerCancel={cancelGesture} onLostPointerCapture={cancelGesture} onContextMenu={event => event.preventDefault()}>

        {(!editorOpen || arrangeMode) && visibleCards.map((item) => (
          <MetricCard
            key={item.id}
            item={item}
            packet={packet}
            gaming={displayedPreferences.layoutPreset === "gaming"}
            compact={displayedPreferences.compact}
            editing={editorOpen}
            pointerSwapping={arrangeMode}
            dragging={draggedId === item.id}
            holding={holdingCardId === item.id}
            dropTarget={dragTargetId === item.id}
            onDragStart={() => setDraggedId(item.id)}
            onDrop={() => dropOnCard(item.id)}
            onDeviceChange={patch=>swapCards(item.id,item.id,patch)}
            onPointerDown={(event) => startCardGesture(item.id, event)}
          />
        ))}
      </section>

      {!packet.connected && packet.telemetryMessage && !editorOpen && (
        <p className="telemetry-message" role="status">{packet.telemetryMessage}</p>
      )}

      {displayedPreferences.layoutPreset === "gaming" && !editorOpen && <GamingNetwork packet={packet} preferences={displayedPreferences} />}

      {displayedPreferences.layoutPreset === "paged" && !editorOpen && (
        <nav className="page-switcher" aria-label="Dashboard pages">
          {[0, 1, 2].map((pageNumber) => (
            <button key={pageNumber} className={page === pageNumber ? "active" : ""} onClick={() => setPage(pageNumber)} aria-label={`Show page ${pageNumber + 1}`} />
          ))}
        </nav>
      )}

      {packet.alerts[0] && !editorOpen && (
        <aside className={`alert-banner alert-${packet.alerts[0].level}`} role="alert">
          <span className="alert-icon">!</span>
          <span>{packet.alerts[0].label}</span>
          <strong>{packet.alerts[0].value}</strong>
        </aside>
      )}

      {!editorOpen && (
        <MediaDrawer
          open={mediaOpen}
          snapshot={mediaSnapshot}
          artworkUrl={mediaSnapshot?.artwork || null}
          now={now}
          compact={displayedPreferences.compact}
          onPrevious={() => runPcMediaCommand("previous")}
          onPlayPause={() => runPcMediaCommand("playPause")}
          onNext={() => runPcMediaCommand("next")}
        />
      )}

      {arrangeMode && (
        <div className="arrange-toolbar" role="toolbar" aria-label="Arrange dashboard cards">
          <button onClick={() => { cancelGesture(); setArrangeMode(false); }}>BACK</button>
          <strong>{saveStatus === 'saving' ? 'SAVING…' : saveStatus === 'failed' ? 'SAVE FAILED — RETRY' : 'DRAG TO SWAP · SAVES AUTOMATICALLY'}</strong>
          <button className="arrange-save" disabled={saveStatus === 'saving'} onClick={saveStatus === 'failed' ? saveEditor : requestEditorClose}>{saveStatus === 'failed' ? 'RETRY' : 'DONE'}</button>
        </div>
      )}

      <PersistentEditor active={editorOpen && !arrangeMode} render={() => (
        <div
          ref={editorShellRef}
          className="editor-shell"
          role="dialog"
          aria-modal="true"
          aria-label="Dashboard layout editor"
          tabIndex={-1}
        >
          <aside className="editor-panel">
            <div className="editor-heading">
              <div><span className="eyebrow">DESKTOP EDITOR</span><h2>Customize</h2></div>
            </div>
            <nav className="editor-tabs" aria-label="Editor sections">
              {(["layout", "appearance", "clock", "games", "alerts"] as const).map((tab) => (
                <button key={tab} className={editorTab === tab ? "active" : ""} onClick={() => { setEditorTab(tab); setMountedEditorTabs(current => current.has(tab) ? current : new Set([...current, tab])); }}>{tab}</button>
              ))}
            </nav>

            <div className="editor-content">
              {mountedEditorTabs.has("layout") && (
                <div className="editor-tab-panel" hidden={editorTab !== "layout"}>
                  <p className="editor-label">STARTING LAYOUT</p>
                  <div className="preset-picker">
                    {layoutPresets.map((preset) => (
                      <button key={preset} className={draftPreferences.layoutPreset === preset ? "active" : ""} onClick={() => choosePreset(preset)}>
                        <b>{presetLabels[preset].letter}</b><span>{presetLabels[preset].name}</span>
                      </button>
                    ))}
                  </div>
                  <p className="editor-help">Every preset is a starting point. Change the main reading and up to three detail readings in every card, then move, resize, copy, hide, or delete cards.</p>
                  <button className="arrange-launch-button" onClick={() => setArrangeMode(true)}>ARRANGE CARDS ON SCREEN</button>
                  <div className="card-control-list">
                    {draftLayout.map((item) => (
                      <div className={`card-control${item.hidden ? " is-hidden" : ""}${expandedCardId === item.id ? " is-expanded" : ""}`} key={item.id}>
                        <div className="card-control-top">
                          {expandedCardId === item.id ? <ChoiceSelect aria-label={`Main metric for ${item.id}`} value={item.metric} onChange={(event) => changeMetric(item.id, event.target.value as MetricKey)}>
                            {metricOptions}
                          </ChoiceSelect> : <button className="card-metric-button" onClick={() => setExpandedCardId(item.id)}>{metricMeta[item.metric].label}</button>}
                          <button className="text-button" onClick={() => setExpandedCardId((current) => current === item.id ? null : item.id)}>{expandedCardId === item.id ? "Done" : "Details"}</button>
                          <button className="text-button" onClick={() => duplicateItem(item.id)}>Copy</button>
                          <button className="text-button" onClick={() => updateItem(item.id, { hidden: !item.hidden })}>{item.hidden ? "Show" : "Hide"}</button>
                        </div>
                        {expandedCardId === item.id && (
                          <div className="card-control-body">
                            {item.metric === 'peripherals' && <DeviceCardSettings item={item} onChange={patch=>updateItem(item.id,patch)}/>}
                            <div className="detail-selects" hidden={item.metric === 'peripherals'}>
                              {[0, 1, 2].map((detailIndex) => (
                                <ChoiceSelect key={detailIndex} aria-label={`Detail ${detailIndex + 1} for ${item.id}`} value={item.details[detailIndex] || ""} onChange={(event) => changeDetail(item.id, detailIndex, event.target.value as MetricKey | "")}>
                                  <option value="">No detail</option>
                                  {detailOptions[item.metric]}
                                </ChoiceSelect>
                              ))}
                            </div>
                            <div className="nudge-row">
                              <span>Move</span>
                              <button onClick={() => moveItem(item.id, -1, 0)}>←</button>
                              <button onClick={() => moveItem(item.id, 0, -1)}>↑</button>
                              <button onClick={() => moveItem(item.id, 0, 1)}>↓</button>
                              <button onClick={() => moveItem(item.id, 1, 0)}>→</button>
                              <span>Size</span>
                              <button onClick={() => resizeItem(item.id, -1, 0)}>−W</button>
                              <button onClick={() => resizeItem(item.id, 1, 0)}>+W</button>
                              <button onClick={() => resizeItem(item.id, 0, -1)}>−H</button>
                              <button onClick={() => resizeItem(item.id, 0, 1)}>+H</button>
                              {draftPreferences.layoutPreset === "paged" && (
                                <ChoiceSelect aria-label={`Page for ${item.id}`} className="page-select" value={item.page || 0} onChange={(event) => updateItem(item.id, { page: Number(event.target.value) })}>
                                  <option value={0}>Page 1</option><option value={1}>Page 2</option><option value={2}>Page 3</option>
                                </ChoiceSelect>
                              )}
                              <button className="delete-card" onClick={() => setDraftLayout((current) => current.filter((candidate) => candidate.id !== item.id))}>Delete</button>
                            </div>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                  <div className="utility-row">
                    <button className="text-button" onClick={() => setDraftLayout(clonePresetLayout(draftPreferences.layoutPreset))}>Reset preset</button>
                    <button className="text-button" onClick={exportLayout}>Export</button>
                    <button className="text-button" onClick={() => importRef.current && importRef.current.click()}>Import</button>
                    <input ref={importRef} type="file" accept="application/json,.json" hidden onChange={(event) => {
                      const file = event.target.files && event.target.files[0];
                      if (file) void importLayout(file);
                      event.target.value = "";
                    }} />
                  </div>
                </div>
              )}

              {mountedEditorTabs.has("appearance") && (
                <div className="settings-stack editor-tab-panel" hidden={editorTab !== "appearance"}>
                  <BrandingSettings name={draftPreferences.displayName} logo={draftPreferences.clockLogo} onChange={update => { if(editorOpenRef.current) setDraftPreferences(current => ({...current,...update})); }} />
                  <label><span>Theme preset</span><ChoiceSelect aria-label="Theme preset" value={draftPreferences.theme} onChange={(event) => setDraftPreferences((current) => ({ ...current, theme: event.target.value as ThemeName }))}>
                    {(Object.keys(themeLabels) as ThemeName[]).map((theme) => <option key={theme} value={theme}>{themeLabels[theme]}</option>)}
                  </ChoiceSelect></label>
                  <label className="color-setting"><span>Custom accent</span><input type="color" value={draftPreferences.accent} onChange={(event) => setDraftPreferences((current) => ({ ...current, accent: event.target.value }))} /><code>{draftPreferences.accent.toUpperCase()}</code></label>
                  <RangeSetting label="Brightness" value={draftPreferences.brightness} min={35} max={120} unit="%" onChange={(brightness) => setDraftPreferences((current) => ({ ...current, brightness }))} />
                  <RangeSetting label="Glow" value={draftPreferences.glow} min={0} max={100} unit="%" onChange={(glow) => setDraftPreferences((current) => ({ ...current, glow }))} />
                  <label className="toggle-setting"><span>Compact mode</span><input type="checkbox" checked={draftPreferences.compact} onChange={(event) => setDraftPreferences((current) => ({ ...current, compact: event.target.checked }))} /></label>
                </div>
              )}

              {mountedEditorTabs.has("clock") && (
                <div className="settings-stack editor-tab-panel" hidden={editorTab !== "clock"}>
                  <div className="clock-mode-picker" role="group" aria-label="Clock behavior">
                     <span>Clock behavior</span>
                     <div>
                       {(["automatic", "dashboard", "clock"] as ClockMode[]).map((mode) => (
                         <button type="button" key={mode} className={draftPreferences.clockMode === mode ? "active" : ""} onClick={() => setDraftPreferences((current) => ({ ...current, clockMode: mode }))}>
                           {mode === "automatic" ? "Automatic" : mode === "dashboard" ? "Dashboard" : "Clock"}
                         </button>
                       ))}
                     </div>
                   </div>
                  <label><span>Clock face</span><ChoiceSelect aria-label="Clock face" value={draftPreferences.clockFace} onChange={(event) => setDraftPreferences((current) => ({ ...current, clockFace: event.target.value as ClockFace }))}>
                    <option value="bold">Bold Digital</option><option value="foundry">Foundry Digital</option><option value="minimal">OLED Minimal</option><option value="analog-foundry">Foundry Analog</option><option value="analog-minimal">Minimal Analog</option>
                  </ChoiceSelect></label>
                  <label><span>Time format</span><ChoiceSelect aria-label="Time format" value={draftPreferences.clockFormat} onChange={(event) => setDraftPreferences((current) => ({ ...current, clockFormat: event.target.value as ClockFormat }))}>
                    <option value="12">12-hour</option><option value="24">24-hour</option>
                  </ChoiceSelect></label>
                  <label><span>Clock colors</span><ChoiceSelect aria-label="Clock colors" value={draftPreferences.clockColorMode} onChange={(event) => setDraftPreferences((current) => ({ ...current, clockColorMode: event.target.value as ClockColorMode }))}>
                    <option value="theme">Follow dashboard theme</option><option value="custom">Custom color</option>
                  </ChoiceSelect></label>
                  {draftPreferences.clockColorMode === "custom" && <label className="color-setting"><span>Clock color</span><input type="color" value={draftPreferences.clockColor} onChange={(event) => setDraftPreferences((current) => ({ ...current, clockColor: event.target.value }))} /><code>{draftPreferences.clockColor.toUpperCase()}</code></label>}
                  <label className="toggle-setting"><span>Show day and date</span><input type="checkbox" checked={draftPreferences.clockShowDate} onChange={(event) => setDraftPreferences((current) => ({ ...current, clockShowDate: event.target.checked }))} /></label>
                  <p className="editor-help">Automatic mode switches to this clock after 12 seconds without fresh PC telemetry and returns as soon as telemetry reconnects.</p>
                </div>
              )}

              {mountedEditorTabs.has("games") && (
                <div className="settings-stack editor-tab-panel" hidden={editorTab !== "games"}>
                  <label className="toggle-setting"><span>Network latency / loss probe</span><input type="checkbox" checked={draftPreferences.networkProbeEnabled} onChange={event => setDraftPreferences(current => ({...current,networkProbeEnabled:event.target.checked}))} /></label>
                  <label><span>Probe target (IPv4)</span><input aria-label="Probe target" value={draftPreferences.networkProbeTarget} onChange={event => setDraftPreferences(current => ({...current,networkProbeTarget:event.target.value}))} /></label>
                  <p className="editor-help">ICMP round-trip latency and loss over the last 30 probes, every 2 seconds. This measures the chosen address, not your game server. Some addresses block ICMP.</p>
                  <div className="current-app-rule">
                    <span>Current PC application</span>
                    <strong>{packet.foreground?.displayName || "No foreground application reported"}</strong>
                    {packet.foreground && <small>{packet.foreground.processName}{packet.foreground.fullscreen ? " · FULLSCREEN" : ""}</small>}
                    <div className="utility-row">
                      <button className="text-button" disabled={!packet.foreground} onClick={() => packet.foreground && setGameRule(packet.foreground.processName, "include")}>Recognize as game</button>
                      <button className="text-button" disabled={!packet.foreground} onClick={() => packet.foreground && setGameRule(packet.foreground.processName, "exclude")}>Never recognize</button>
                      <button className="text-button" disabled={!packet.foreground} onClick={() => packet.foreground && setGameRule(packet.foreground.processName, "clear")}>Clear rule</button>
                    </div>
                  </div>
                  <div className="game-rule-list"><span>Always recognize</span>{draftPreferences.gameInclude.length ? draftPreferences.gameInclude.map(entry => <button className="rule-chip" key={entry} onClick={() => setGameRule(entry, "clear")}>{entry} ×</button>) : <small>Automatic detection only</small>}</div>
                  <div className="game-rule-list"><span>Never recognize</span>{draftPreferences.gameExclude.length ? draftPreferences.gameExclude.map(entry => <button className="rule-chip" key={entry} onClick={() => setGameRule(entry, "clear")}>{entry} ×</button>) : <small>No custom exclusions</small>}</div>
                  <p className="editor-help">Fullscreen standalone games are probed automatically with PresentMon. Use a saved rule for windowed games or unusual launchers that automatic detection cannot identify safely.</p>
                </div>
              )}

              {mountedEditorTabs.has("alerts") && (
                <div className="settings-stack editor-tab-panel" hidden={editorTab !== "alerts"}>
                  <RangeSetting label="CPU temperature" value={draftPreferences.cpuAlert} min={60} max={105} unit="°C" onChange={(cpuAlert) => setDraftPreferences((current) => ({ ...current, cpuAlert }))} />
                  <RangeSetting label="GPU temperature" value={draftPreferences.gpuAlert} min={55} max={100} unit="°C" onChange={(gpuAlert) => setDraftPreferences((current) => ({ ...current, gpuAlert }))} />
                  <RangeSetting label="RAM usage" value={draftPreferences.ramAlert} min={60} max={100} unit="%" onChange={(ramAlert) => setDraftPreferences((current) => ({ ...current, ramAlert }))} />
                  <p className="editor-help">Alerts appear over the dashboard without interrupting telemetry. Critical alerts begin 8°C above a temperature threshold or at 98% RAM.</p>
                </div>
              )}
            </div>
          </aside>
        </div>
      )} />

      {editorOpen && editorClosePromptOpen && (
        <div className="editor-close-confirm" role="alertdialog" aria-modal="true" aria-labelledby="editor-close-title">
          <div className="editor-close-confirm-card">
            <span className="eyebrow">UNSAVED CHANGES</span>
            <h3 id="editor-close-title">Save your changes?</h3>
            <p>Save the current dashboard, discard the edits, or keep customizing.</p>
            <div className="editor-close-confirm-actions">
              <button className="primary-button" onClick={saveEditor}>SAVE CHANGES</button>
              <button className="secondary-button" onClick={discardEditor}>DISCARD</button>
              <button className="secondary-button" onClick={() => setEditorClosePromptOpen(false)}>KEEP EDITING</button>
            </div>
          </div>
        </div>
      )}

      {(notice || (!editorOpen && saveStatus === 'failed')) && <div className="toast" role="status">
        {notice || 'Layout save failed'}
        {!editorOpen && saveStatus === 'failed' && <button onClick={() => persistDashboard(layoutRef.current,preferencesRef.current,layoutSlotsRef.current)}>RETRY</button>}
      </div>}
    </main>
  );
}

function MediaDrawer({ open, snapshot, artworkUrl, now, compact, onPrevious, onPlayPause, onNext }: {
  open: boolean;
  snapshot: MediaSnapshot | null;
  artworkUrl: string | null;
  now: number;
  compact: boolean;
  onPrevious: () => void;
  onPlayPause: () => void;
  onNext: () => void;
}) {
  const track = snapshot?.ok && snapshot.title ? snapshot : null;
  const playing = snapshot?.playback === "playing";
  const progress = snapshot?.ok
    ? playbackProgress(snapshot.positionMs, snapshot.durationMs || null, playing, snapshot.receivedAt, now)
    : null;
  const source = snapshot?.source?.toLowerCase().includes("spotify") ? "SPOTIFY" : snapshot?.source || "WINDOWS MEDIA";
  return <aside
    className={`media-drawer${open ? " is-open" : ""}${compact ? " media-drawer-compact" : ""}`}
    aria-label="Now playing controls"
    aria-hidden={!open}
  >
    <div className="media-accent" />
    {artworkUrl ? <img className="media-artwork" src={artworkUrl} alt="" /> : <div className="media-artwork media-artwork-fallback">♪</div>}
    <div className="media-copy">
      <div className="media-meta">
        <span className="media-source">{track ? `NOW PLAYING · ${source}` : "MEDIA"}</span>
        <span className="media-volume">WHEEL · MEDIA VOLUME</span>
      </div>
      <strong title={track?.title || "Nothing playing"}>{track?.title || "Nothing playing"}</strong>
      <span className="media-artist" title={track?.artist || track?.album || "Start media on this PC"}>
        {track?.artist || track?.album || "Start media on this PC"}
      </span>
      {progress !== null && <span className="media-progress" aria-label={`${Math.round(progress)}% played`}><i style={{ width: `${progress}%` }} /></span>}
    </div>
    <div className="media-controls">
      <button data-media-control onClick={onPrevious} aria-label="Previous track"><MediaIcon kind="previous" /></button>
      <button data-media-control onClick={onPlayPause} aria-label={playing ? "Pause" : "Play"}><MediaIcon kind={playing ? "pause" : "play"} /></button>
      <button data-media-control onClick={onNext} aria-label="Next track"><MediaIcon kind="next" /></button>
    </div>
  </aside>;
}

// Retain the controls between visits. Hidden telemetry updates must not build
// or reconcile the menu; reopening updates its values without recreating DOM.
const PersistentEditor = memo(function PersistentEditor({active,render}: {active:boolean;render:()=>ReactNode}) {
  const last = useRef<ReactNode>(null);
  if(active) last.current = render();
  return <div className="persistent-editor" hidden={!active}>{last.current}</div>;
}, (previous,next) => !previous.active && !next.active);

function MediaIcon({ kind }: { kind: "previous" | "play" | "pause" | "next" }) {
  const flip = kind === "next";
  return <svg viewBox="0 0 24 24" aria-hidden="true" className={flip ? "media-icon-flip" : ""}>
    {kind === "play" && <path d="M6 4.5v15l12-7.5z" />}
    {kind === "pause" && <path d="M6 5h4v14H6zm8 0h4v14h-4z" />}
    {(kind === "previous" || kind === "next") && <path d="M5 5h2.5v14H5zm3.5 7L19 5v14z" />}
  </svg>;
}

function ClockScreen({ now, offsetMinutes, preferences, brightness }: { now: number; offsetMinutes: number; preferences: DashboardPreferences; brightness: number }) {
  const pcTime = pcClockDate(now, offsetMinutes);
  const parts = new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: preferences.clockFormat === "12",
    timeZone: "UTC",
  }).formatToParts(pcTime);
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find(candidate => candidate.type === type)?.value || "";
  const time = `${part("hour")}:${part("minute")}`;
  const date = new Intl.DateTimeFormat(undefined, { weekday: "long", month: "long", day: "numeric", timeZone: "UTC" }).format(pcTime);
  const analog = preferences.clockFace === "analog-foundry" || preferences.clockFace === "analog-minimal";
  return <section className={`clock-screen clock-face-${preferences.clockFace}`} aria-label={`Disconnected clock, brightness ${Math.round(brightness * 100)} percent`}>
      {preferences.clockFace === "foundry" && <img src={clockLogo(preferences.clockLogo) || '/assets/brutalfoundry-icon.jpg'} alt="" className="clock-logo" />}
    <div className="clock-kicker">{preferences.clockMode === "clock" ? "CLOCK MODE" : "PC OFFLINE"}</div>
    {analog ? <AnalogClock time={pcTime} /> : <time className="clock-time" dateTime={pcTime.toISOString()}>
      <span>{time}</span><small className="clock-seconds">{part("second")}</small>{part("dayPeriod") && <small className="clock-period">{part("dayPeriod")}</small>}
    </time>}
    {preferences.clockShowDate && <div className="clock-date">{date}</div>}
    <div className="clock-brand"><span className="wordmark-full">{displayName(preferences.displayName)}</span><small>{appVersionLabel}</small></div>
  </section>;
}

function AnalogClock({ time }: { time: Date }) {
  const seconds = time.getUTCSeconds();
  const minutes = time.getUTCMinutes() + seconds / 60;
  const hours = (time.getUTCHours() % 12) + minutes / 60;
  const hand = (angle: number) => ({ "--hand-angle": `${angle}deg` }) as React.CSSProperties;
  return <time className="analog-clock" dateTime={time.toISOString()} aria-label={time.toLocaleTimeString()}>
    <span className="analog-ring">
      <span className="analog-dial">
        {Array.from({ length: 60 }, (_, index) => <i key={index} className={`analog-tick${index % 5 === 0 ? " hour-tick" : ""}`} style={{ "--tick-angle": `${index * 6}deg` } as React.CSSProperties} />)}
        <b className="analog-number number-12">12</b><b className="analog-number number-3">3</b><b className="analog-number number-6">6</b><b className="analog-number number-9">9</b>
        <i className="analog-hand hour-hand" style={hand(hours * 30)} /><i className="analog-hand minute-hand" style={hand(minutes * 6)} /><i className="analog-hand second-hand" style={hand(seconds * 6)} />
        <i className="analog-hub" />
      </span>
    </span>
  </time>;
}

type MetricCardProps = {
  onDeviceChange: (patch:Partial<LayoutItem>)=>void;
  item: LayoutItem;
  packet: DashboardPacket;
  compact: boolean;
  editing: boolean;
  pointerSwapping: boolean;
  gaming?: boolean;
  dragging: boolean;
  holding: boolean;
  dropTarget: boolean;
  onDragStart: () => void;
  onDrop: () => void;
  onPointerDown: (event: ReactPointerEvent<HTMLElement>) => void;
};

function MetricCard({ item, packet, compact, editing, gaming, dragging, holding, dropTarget, onPointerDown, onDeviceChange }: MetricCardProps) {
  if (item.metric === "peripherals") return <PeripheralCard item={item} snapshot={packet.peripherals} dragging={dragging} holding={holding} dropTarget={dropTarget} onPointerDown={onPointerDown} onChange={onDeviceChange} />;
  const gamingGpu = gaming && item.metric === "gpuUsage" && item.details.includes("vramUsed");
  const meta = metricMeta[item.metric];
  const metric = packet.metrics[item.metric];
  const formatted = formatPrimary(item.metric, packet, compact);
  const minimum = formatMetric(metric.min, metric.unit, true);
  const maximum = formatMetric(metric.max, metric.unit, true);
  const storageTraffic = item.metric === "storageRead" && packet.metrics.storageWrite.value !== null;
  const storageRead = formatPrimary("storageRead", packet, compact);
  const storageWrite = formatPrimary("storageWrite", packet, compact);
  const storageCapacity = formatPrimary("storageUsed", packet, true);
  const details = item.details
    .filter((key) => !storageTraffic || !["storageRead", "storageWrite", "storageUsed", "storageFree", "storagePercent"].includes(key))
    .filter((key) => packet.metrics[key].value !== null)
    .slice(0, 3);
  const progress = metricProgress(item.metric, packet);
  return (
    <article
      data-card-id={item.id}
      className={`metric-card ${meta.group}-card${item.h > 1 ? " hero-card" : " row-card"}${formatted.capacity ? " capacity-card" : ""}${storageTraffic ? " storage-io-card" : ""}${gamingGpu ? " gaming-gpu-card" : ""}${editing ? " editable-card" : ""}${dragging ? " drag-source" : ""}${dropTarget ? " drop-target" : ""}`}
      style={{ gridColumn: `${item.x + 1} / span ${Math.min(item.w, 6 - item.x)}`, gridRow: `${item.y + 1} / span ${item.h}` }}
      draggable={false}
      onDragStart={event => event.preventDefault()}
      onPointerDown={onPointerDown}
    >
      {(holding || dragging) && <div className="card-hold-progress" role="status"><span>{holding ? 'HOLD TO PICK UP' : 'DRAG TO SWAP'}</span>{holding && <i />}</div>}
      {item.metric === "fps" && packet.game && <div className="fps-game-name" title={packet.game}>{packet.game}</div>}
      {item.metric === "fps" ? (
        editing && <div className="metric-card-top"><span className="drag-handle">DRAG</span></div>
      ) : (
        <div className="metric-card-top"><div className="metric-title">{storageTraffic ? "DISK" : meta.shortLabel}</div>{editing && <span className="drag-handle">DRAG</span>}</div>
      )}
      {storageTraffic ? (
        <>
          <div className="storage-throughput" aria-label="Disk read and write throughput">
            <div className="storage-stream"><b>READ</b><div><span>{storageRead.value}</span><small>{storageRead.unit}</small></div></div>
            <div className="storage-stream"><b>WRITE</b><div><span>{storageWrite.value}</span><small>{storageWrite.unit}</small></div></div>
          </div>
          <div className="metric-range" aria-label="Disk read session range">
            <span><b>MIN</b> {minimum.value}{minimum.unit}</span><span><b>MAX</b> {maximum.value}{maximum.unit}</span>
          </div>
          {storageCapacity.value !== "--" && <div className="metric-details storage-io-tertiary"><span className="metric-detail-reading"><b>USED</b> {storageCapacity.value}{storageCapacity.unit}</span></div>}
        </>
      ) : (
        <>
          <div className="metric-value-line"><span className="metric-main">{formatted.value}</span><span className="metric-unit">{formatted.unit}</span></div>
          {progress !== null && <div className="metric-bar" aria-hidden="true"><span style={{ width: `${progress}%` }} /></div>}
          {!gamingGpu && <div className="metric-range" aria-label={`${meta.label} session range`}>
            <span><b>MIN</b> {minimum.value}{minimum.unit}</span><span><b>MAX</b> {maximum.value}{maximum.unit}</span>
          </div>}
        </>
      )}
      {gamingGpu && <GamingGpuDetails packet={packet} />}
      {!storageTraffic && !gamingGpu && <div className="metric-details">
        {details.map((key) => {
          const detail = formatPrimary(key, packet, true);
          const label = metricMeta[key].shortLabel.startsWith(`${meta.shortLabel} `)
            ? metricMeta[key].shortLabel.slice(meta.shortLabel.length + 1)
            : metricMeta[key].shortLabel;
          return <span className="metric-detail-reading" key={key}><b>{label}</b> {detail.value}{detail.unit}</span>;
        })}
        {!details.length && <span>{unavailableMetricMessage(item.metric, packet.connected, packet.game, packet.telemetryMessage)}</span>}
      </div>}
    </article>
  );
}

function GamingGpuDetails({packet}: {packet: DashboardPacket}) {
  const show = (value: number | null, unit: string) => { const f = formatMetric(value,unit); return `${f.value}${f.unit}`; };
  return <div className="gaming-gpu-details">
    <div className="gpu-detail-heading"><span></span><b>CURRENT</b><b>PEAK</b></div>
    <div><b>TEMP</b><span>{show(packet.metrics.gpuTemp.value,'°C')}</span><span>{show(packet.metrics.gpuTemp.max,'°C')}</span></div>
    <div><b>VRAM</b><span>{formatPrimary('vramUsed',packet,false).value} GB</span><span>{show(packet.metrics.vramUsed.max,'GB')}</span></div>
    <small>POWER <strong>{show(packet.metrics.gpuPower.value,'W')}</strong></small>
  </div>;
}

function GamingNetwork({packet,preferences}: {packet: DashboardPacket; preferences: DashboardPreferences}) {
  const quality = packet.networkQuality?.target === preferences.networkProbeTarget ? packet.networkQuality : undefined;
  const fresh = quality?.updatedAt != null && Date.now()-quality.updatedAt < 6000;
  const latency = fresh && quality.latencyMs != null ? `${quality.latencyMs} ms` : '--';
  const loss = fresh && quality.lossPercent != null ? `${quality.lossPercent.toFixed(1)}%` : '--';
  return <aside className="gaming-network" aria-label="PC network telemetry">
    {(['networkDown','networkUp'] as const).map(key => { const current = formatPrimary(key,packet,false); const peak = formatMetric(packet.metrics[key].max,packet.metrics[key].unit); return <div className="network-reading" key={key}><b>{key === 'networkDown' ? 'DOWNLOAD' : 'UPLOAD'}</b><strong>{current.value}<small>{current.unit}</small></strong><span>PEAK {peak.value} {peak.unit}</span></div>; })}
    <div className="network-reading" title="ICMP round-trip latency to the displayed target, not game-server ping"><b>LATENCY</b><strong>{preferences.networkProbeEnabled ? latency : '--'}</strong><span>{preferences.networkProbeEnabled ? `TO ${preferences.networkProbeTarget}` : 'PROBE OFF'}</span></div>
    <div className="network-reading" title={quality?.error || ''}><b>PACKET LOSS</b><strong>{preferences.networkProbeEnabled ? loss : '--'}</strong></div>
  </aside>;
}

type RangeSettingProps = { label: string; value: number; min: number; max: number; unit: string; onChange: (value: number) => void };

function RangeSetting({ label, value, min, max, unit, onChange }: RangeSettingProps) {
  return <label className="range-setting"><span>{label}</span><input type="range" value={value} min={min} max={max} onChange={(event) => onChange(Number(event.target.value))} /><output>{value}{unit}</output></label>;
}

export default App;
