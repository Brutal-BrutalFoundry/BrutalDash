# BrutalDash features

## Live PC telemetry

| Area | Available readings |
| --- | --- |
| CPU | Usage, temperature, clock speed, and power. |
| GPU | Usage, temperature, hotspot temperature, clock speed, power, VRAM used, and VRAM percent. |
| Memory | RAM used and RAM percent. |
| Disk | Live read and write throughput, used space, free space, and capacity percent. |
| Network | Download and upload throughput. |
| Gaming | Detected game, FPS, frametime, and 1% low. |

BrutalDash tracks session minimum and maximum values for supported readings. Button 4 clears the current session range and begins a fresh one from the next live sample.

## Telemetry sources

| Source badge | Meaning |
| --- | --- |
| `NATIVE` | Built-in Windows telemetry is active. No HWiNFO is required. |
| `HWiNFO` | HWiNFO Shared Memory is supplying the active telemetry sample. |
| `HWiNFO+` | HWiNFO is active and native Windows telemetry fills one or more missing values. |

The dashboard automatically selects the best available source. It uses native Windows telemetry as the fallback when HWiNFO is not installed, closed, or does not supply a value.

## Dashboard editor

- Six layout starting points: Balanced, Rows, List, Gaming, Six, and Paged.
- Per-layout workspaces: each layout retains its own saved card arrangement.
- Move, resize, copy, hide, delete, and configure cards.
- Change each card's main metric and up to three detail metrics.
- Arrange Mode lets you drag a card onto another to exchange their complete slots.
- Desktop-side settings page for larger-screen editing.
- Save, export, and import dashboard states.
- Three hardware layout-memory buttons. Tap to recall and hold to save or overwrite.

## Appearance

- Theme presets including Neon Miami and Aurora.
- Custom accent color.
- Adjustable brightness and glow intensity.
- Normal and compact dashboard modes.
- Centered, high-contrast card content for at-a-glance reading.
- BrutalFoundry visual identity and icon.

## Alerts

Configure threshold alerts for CPU temperature, GPU temperature, and RAM use. Alerts remain local to the dashboard connection.

## Game detection and FPS

- Automatic active-game detection.
- Persistent **Recognize as game** and **Never recognize** executable rules.
- Bundled Intel PresentMon capture for FPS, frametime, and 1% low.
- No separate PresentMon install required.
- A game-aware idle state: **Launch a game for FPS** when capture is not expected.
- Brief Alt-Tab retention to help a game reacquire FPS when it returns to the foreground.

## PC-native media drawer

- Current PC media artwork, title, artist, playback state, and progress.
- Previous, play or pause, and next controls sent through Windows media controls.
- Active-media volume adjustment with the wheel.
- Works in normal and compact dashboard modes.
- Does not intentionally use or control phone media playback.

## Disconnected clock

- Automatic fallback when the PC telemetry connection is unavailable.
- Dashboard-only, clock-only, or automatic mode.
- Digital and analog clock faces.
- 12-hour or 24-hour time, optional date, theme or custom clock color.
- Manual clock brightness with the wheel.
- Automatic dimming can be restored with the Mode or Back button while clock mode is active.
