# Install and use BrutalDash

## Before you begin

You need:

- A Car Thing running BridgeThing firmware and connected to BridgeThing Desktop.
- BridgeThing Desktop 0.12.1 or newer.
- Windows 10 or Windows 11.
- The current `BrutalDash-<version>.zip` release file.

HWiNFO is not required. BrutalDash starts with native Windows telemetry and adds HWiNFO sensors automatically when HWiNFO Shared Memory is available.

## First installation

1. Start BridgeThing Desktop and confirm that the Car Thing is connected.
2. Open **Apps** in BridgeThing Desktop.
3. Choose **Install webapp bundle**.
4. Select `BrutalDash-<version>.zip`.
5. Review and accept the two local extension permissions:
   - **Run** starts the bundled, local telemetry and FPS helpers.
   - **FFI** reads HWiNFO Shared Memory only when HWiNFO is installed and configured for it.
6. Select BrutalDash in the installed-app list and put it on the connected device screen.
7. Wait for the status badge to report **NATIVE**, **HWiNFO**, or **HWiNFO+**. The first two indicate that telemetry is active. `HWiNFO+` means HWiNFO is supplying data while native Windows collection fills a value HWiNFO did not provide.

## Updating

Install the newer ZIP through the same **Install webapp bundle** flow. Do not uninstall BrutalDash first. Using the same app identity lets BridgeThing replace the app while retaining its saved dashboard state.

After an update, confirm the version shown inside BrutalDash. Your chosen layout, layout workspaces, button memories, appearance settings, game rules, and card settings should remain in place.

## Optional HWiNFO integration

HWiNFO adds richer sensor information. It does not replace the native fallback.

1. Open HWiNFO settings.
2. Enable **Shared Memory Support**.
3. Start **Sensors** or **Sensor Status**. A summary-only HWiNFO window does not start sensor data.
4. If you prefer HWiNFO out of the way, use its Sensors-only startup option and minimize the Sensors window.
5. Return to BrutalDash. It automatically prefers HWiNFO when a valid shared-memory sample is available.

If HWiNFO stops, BrutalDash returns to native telemetry without a manual source switch.

## Dashboard basics

Select **Customize** on the device or open the BrutalDash settings page in BridgeThing Desktop.

From there you can:

- choose a layout starting point
- move, resize, hide, copy, or delete cards
- select a main metric and up to three supporting metrics per card
- choose a theme, custom accent color, brightness, glow, or compact mode
- set alert thresholds
- manage game-recognition include and exclude rules
- export a dashboard backup or import a prior backup
- choose the disconnected clock face and clock appearance

Use **Save dashboard** after editing. A saved layout is restored when you switch away and come back, restart BridgeThing, or update BrutalDash.

## Car Thing controls

| Control | What it does |
| --- | --- |
| Button 1, 2, or 3, tap | Recall the saved layout assigned to that button. |
| Button 1, 2, or 3, hold | Save the current layout to that button. Holding it again replaces that button's saved layout. |
| Button 4 | Reset the current session's minimum and maximum readings. |
| Mode or Back button | Open or close the PC media drawer. In clock mode, it toggles automatic display dimming. |
| Wheel while the media drawer is open | Adjust the active PC media session's volume. |
| Wheel while the clock is active | Adjust display brightness manually. Turn automatic dimming back on with the Mode or Back button. |
| Touch and drag in Arrange Mode | Drag a card onto another card to swap their complete positions and sizes. |

## Gaming and FPS

BrutalDash includes Intel PresentMon for local FPS collection. No separate PresentMon installation is needed.

1. Start the game normally.
2. BrutalDash detects the active game and shows its name in the FPS card.
3. The FPS card then shows FPS, frametime, and 1% low when the game exposes a usable PresentMon stream.

When no game is detected, the card says **Launch a game for FPS**. That is expected and does not indicate a broken sensor.

If a game should be treated as a game or ignored, add its executable in the game-recognition controls and save the dashboard.

## Media drawer

The media drawer controls the active Windows media session on the PC. It is intended for Spotify and other Windows media apps that publish a Windows media session.

- The drawer shows artwork, title, artist, progress, and playback state when the active PC app supplies them.
- Previous, play or pause, and next remain PC-side controls. They do not intentionally transfer Spotify playback to a phone.
- The wheel adjusts the active media session volume while the drawer is open.
- Compact mode also uses a compact media drawer.

## Disconnected clock

When BrutalDash stops receiving fresh PC telemetry, it can automatically show the selected clock face. Choose **Automatic**, **Dashboard only**, or **Clock only** in the clock settings.

Clock options include digital and analog faces, 12-hour or 24-hour time, optional date, theme or custom colors, and manual brightness control.

## Troubleshooting

### The dashboard shows no live values

1. Confirm BridgeThing Desktop is running and the Car Thing is connected.
2. Open BrutalDash's app details in BridgeThing and verify that the native extension is enabled and shows **Running**.
3. Restart BridgeThing Desktop once, then reopen BrutalDash.
4. If the extension cannot be enabled, reinstall the same BrutalDash ZIP and accept its local permissions.

### HWiNFO values are missing

1. Confirm HWiNFO **Shared Memory Support** is enabled.
2. Confirm the HWiNFO Sensors component is active, not only the summary window.
3. Keep BrutalDash open for a fresh sample. It will remain on native telemetry if HWiNFO Shared Memory is not currently readable.

### FPS is blank

1. Start a game and leave it in the foreground briefly.
2. Check whether the FPS card changes from **Launch a game for FPS** to the game name.
3. If the game is intentionally nonstandard, add its executable to **Recognize as game** and save.
4. If a detected game has no FPS, the game or graphics configuration may not expose a usable PresentMon stream. Other dashboard telemetry remains available.

### Media details are blank

Start music or video on the PC. BrutalDash can only show what the active Windows media session publishes. It does not use phone media history.

### My custom layout changed

Open **Customize**, make the changes, and choose **Save dashboard** before leaving. Use the export control before a major reorganization to create a portable backup.

## Release validation

Before publishing a new build, verify on a real device:

1. Native telemetry is live.
2. HWiNFO switching works when HWiNFO Sensors are active.
3. A known game produces FPS and a game name.
4. Layout editing, saving, preset switching, restart, and update preservation work.
5. The media drawer displays a current PC media session and the controls stay on the PC.
6. Clock mode appears after the PC connection is unavailable.
