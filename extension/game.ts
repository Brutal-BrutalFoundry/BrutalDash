import type { DashboardPreferences } from '../src/types';
import type { ForegroundApp } from './foreground';

const excludedForeground = /^(explorer|chrome|msedge|firefox|discord|code|codex|chatgpt|bridgething|steam|steamwebhelper|epicgameslauncher|goggalaxy|spotify|applicationframehost|searchhost|startmenuexperiencehost|shellexperiencehost|textinputhost|systemsettings|taskmgr|powershell|pwsh|cmd|conhost|windowsterminal|snippingtool|screenclippinghost|hwinfo64|presentmon|nvidiaapp|nvcontainer|radeonsoftware|msiafterburner|rtss)$/i;

function normalized(value: string) {
  return value.trim().split(/[\\/]/).pop()?.replace(/\.exe$/i, '').toLowerCase() || '';
}

export function processFileName(app: ForegroundApp) {
  const executable = app.path.split(/[\\/]/).pop() || app.name;
  return /\.exe$/i.test(executable) ? executable : `${executable}.exe`;
}

export function friendlyAppName(app: ForegroundApp) {
  const title = app.title.replace(/\s[-—|].*$/, '').trim();
  return (title || app.name.replace(/[-_]/g, ' '))
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/64$/, '')
    .trim() || app.name;
}

function preferenceHas(entries: string[] | undefined, app: ForegroundApp) {
  const expected = normalized(processFileName(app));
  return (entries || []).some(entry => normalized(entry) === expected);
}

export function gameCandidate(app: ForegroundApp | null, preferences: DashboardPreferences) {
  if (!app || preferenceHas(preferences.gameExclude, app)) return null;
  const name = normalized(app.name);
  const included = preferenceHas(preferences.gameInclude, app);
  if (!included && excludedForeground.test(name)) return null;
  const known = /^(aces|aces_be|projectzomboid64)$/i.test(name);
  const likelyPath = /\\(steamapps\\common|Epic Games|XboxGames|GOG Galaxy\\Games)\\/i.test(app.path);
  const likelyName = /(game|shipping|win64|dx11|dx12|client)$/i.test(name);
  return included || known || likelyPath || likelyName || app.fullscreen ? processFileName(app) : null;
}

export type RetainedGameTarget = { processName: string; seenAt: number } | null;

/**
 * Selects the only process whose FPS data may be shown for this poll.
 * A recently detected game is retained briefly so Alt-Tab does not tear down
 * capture, but an unscoped/stale PresentMon reading is never treated as idle FPS.
 */
export function fpsCaptureTarget(
  app: ForegroundApp | null,
  preferences: DashboardPreferences,
  retainedGame: RetainedGameTarget,
  now: number,
  retentionMs: number,
) {
  const liveProcessName = gameCandidate(app, preferences);
  if (liveProcessName) return { liveProcessName, sensorProcessName: liveProcessName };
  if (retainedGame && now - retainedGame.seenAt <= retentionMs) {
    return { liveProcessName: null, sensorProcessName: retainedGame.processName };
  }
  return { liveProcessName: null, sensorProcessName: null };
}

export function detectedGame(app: ForegroundApp | null, hasPresentMonReadings: boolean, preferences: DashboardPreferences) {
  if (!app || preferenceHas(preferences.gameExclude, app)) return null;
  const name = normalized(app.name);
  const included = preferenceHas(preferences.gameInclude, app);
  if (!included && excludedForeground.test(name)) return null;
  const knownGame = new Map<string, string>([
    ['aces', 'War Thunder'], ['aces_be', 'War Thunder'], ['projectzomboid64', 'Project Zomboid'],
  ]).get(name);
  if (knownGame) return knownGame;
  const likelyGamePath = /\\(steamapps\\common|Epic Games|XboxGames|GOG Galaxy\\Games)\\/i.test(app.path);
  const likelyGameName = /(game|shipping|win64|dx11|dx12|client)$/i.test(name);
  if (!included && !likelyGamePath && !likelyGameName && !(hasPresentMonReadings && app.fullscreen)) return null;
  return friendlyAppName(app);
}

export function foregroundPacket(app: ForegroundApp | null) {
  return app ? { processName: processFileName(app), displayName: friendlyAppName(app), fullscreen: app.fullscreen } : null;
}
