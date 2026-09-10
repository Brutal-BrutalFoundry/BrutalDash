# BrutalDash

<p align="center">
  <img src="public/assets/brutalfoundry-logo.png" alt="BrutalFoundry" width="260">
</p>

**BrutalDash** turns a BridgeThing-powered Car Thing into a live Windows PC performance command center.

It is built for readability at a glance: near-live CPU, GPU, RAM, VRAM, disk, network, game detection, FPS, and frametime data on the device; a desktop-side layout editor; and a standalone clock when the PC connection is unavailable.

**New here?** Start with [INSTALLATION.md](INSTALLATION.md). For the full capability list, see [FEATURES.md](FEATURES.md).

## Highlights

- Native Windows telemetry out of the box: CPU, GPU, RAM, VRAM, disk I/O, storage capacity, and network throughput.
- Native in-game FPS, frametime, and game detection through bundled PresentMon.
- Optional HWiNFO Shared Memory integration for expanded sensor detail; BrutalDash automatically prefers it when available and returns to native telemetry when it is not.
- Per-session minimum and maximum readings, including Button 4 reset.
- Rearrangeable cards, saved layout presets, themes, custom accent, glow, brightness, metric selection, and alerts.
- Compact, PC-native media drawer with artwork, title, artist, progress, playback controls, and active-media volume.
- Digital and analog disconnected clock faces.

## Requirements

- A BridgeThing-compatible Car Thing and BridgeThing Desktop **0.12.1 or newer**.
- Windows 10 or Windows 11 for the telemetry extension.
- HWiNFO is optional. To use expanded sensors, enable **Shared Memory Support** and keep Sensor Status running.

## Install

1. Download the current `BrutalDash-<version>.zip` from the repository's Releases page.
2. In BridgeThing Desktop, choose the option to install a webapp bundle and select the ZIP.
3. Grant the requested native-extension permissions. They are used only for local Windows telemetry, optional HWiNFO Shared Memory access, PresentMon FPS capture, and Windows media sessions.
4. Activate BrutalDash on the Car Thing. Use **Customize** for layouts, cards, themes, clock faces, and sensor preferences.

To update, install the newer ZIP through the same flow. Do not uninstall first: the app keeps its saved dashboard state under the same app identity.

## Development

```powershell
npm install
npm run typecheck
npm run build
npm run share
```

`npm run share` creates an installable BridgeThing ZIP in the project root. The app is intentionally not published to npm.

## Validation

v0.1.37 was captured on a physical Car Thing in live telemetry, game/FPS, media drawer, clock, and customization modes. The public catalog was validated against BridgeThing’s schema and the published ZIP checksum.

## Third-party software

BrutalDash redistributes Intel PresentMon 2.5.1 for local FPS capture. Its license and notice are included in `public/vendor/presentmon/`.

## License

BrutalDash is released under the [MIT License](LICENSE). PresentMon remains subject to its own included license.

---

Built by [Brutal](https://github.com/Brutal-BrutalFoundry).
