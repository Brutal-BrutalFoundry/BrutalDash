# pc-dashboard-bridgething

## 0.1.37

- Add complete installation, feature, control, and troubleshooting documentation for the first BrutalFoundry release.
- Improve the catalog copy's scanability with structured capability labels.

## 0.1.29 — BrutalDash beta

- Restore BridgeThing's live song, artist, album artwork, playback state and progress feed.
- Keep play, pause and track changes on the PC by sending only those commands through Windows media keys.
- Route the wheel through BridgeThing's current playback-volume owner instead of changing Windows master volume.
- Handle physical swipe-down with native touch events while preserving button taps and bottom-edge swipe-up.
- Synchronize the drawer rise and dashboard reflow so the media bar smoothly pushes the cards upward in normal and compact modes.
- Make preset buttons work with BridgeThing's keydown-only input: tap recalls; hold saves or overwrites the full moved-card layout.
- Preserve clock-wheel brightness, FPS guidance, HWiNFO/native switching, compact mode and the 500 ms telemetry cadence.

## 0.1.28 — BrutalDash beta

- Make all three playback buttons the same teal-to-pink gradient, size, and SVG icon treatment.
- Increase artist readability and allow swipe-down across the open media bar to close it.
- Keep media controls conservative: bottom button/swipe toggles the bar and the wheel controls volume only while open.
- Route playback and volume commands through Windows system media controls so Spotify remains on the PC instead of transferring playback to the phone.
- Remove BridgeThing phone playback metadata and artwork so stale or private phone history can never appear in BrutalDash.
- Let the wheel override clock-mode hardware brightness down to 3%, then restore automatic brightness when the dashboard returns.
- Turn buttons 1–4 into car-radio-style layout memories: hold to save or overwrite, tap to recall.

## 0.1.27 — BrutalDash beta

- Reflow the dashboard above the media bar so playback controls no longer cover live statistics.
- Add bottom-edge swipe up/down gestures and retain the small Back button as the media toggle.
- Enlarge previous, play/pause, and next controls and remove the redundant close button.
- Use the rotary wheel for media volume while the bar is open; map front buttons 1/2/3 to previous/play-pause/next and button 4 to mute.
- Show live volume feedback when BridgeThing reports it, while preserving the compact media layout.

## 0.1.26 — BrutalDash beta

- Use the Car Thing's small bottom Back button to open and close the media drawer; keep Mode/M as a secondary shortcut.
- Reload an already-running dashboard after BridgeThing installs a newer BrutalDash bundle, without interrupting unsaved customization.
- Correct the Foundry clock face logo asset and improve the store description for media and offline clock features.

## 0.1.25 — BrutalDash beta

- Prevent the bundled PresentMon collector from flashing a console window whenever a game starts.
- Add a collapsible now-playing drawer with previous, play/pause, and next controls through BridgeThing's player API.
- Toggle the drawer with the Car Thing Mode button and provide a tighter compact-mode presentation.
- Replace the idle FPS sensor warning with game-aware guidance.
- Update the store description to explain media controls and automatic offline clock mode.

## 0.1.24 — BrutalDash beta

- Reject stale HWiNFO PresentMon values when no game is detected, preventing idle FPS from freezing on the last in-game number.
- Retain the existing 15-second Alt-Tab grace period so active games reacquire FPS without a capture restart.
- Refine the app description to promote HWiNFO integration and explain automatic clock mode as the useful offline fallback.

## 0.1.23 — BrutalDash beta

- Optimize the BrutalFoundry icon to 256 px and 25.9 KB so BridgeThing accepts it under its verified 64 KiB icon limit.
- Add a packaging guard that refuses any future oversized icon instead of silently shipping a fallback letter.
- Detach BridgeThing 0.12.4's Windows console session at extension startup so BrutalDash does not leave a ghost terminal open on unmodified PCs.
- Include the improved contest-facing app description; dashboard behavior is unchanged.

## 0.1.22 — BrutalDash beta

- Fix Windows-built ZIP entries to use the forward-slash paths required by BridgeThing.
- Validate that the icon, settings page, and native extension entry actually exist under the exact manifest paths before creating a bundle.
- Restore both the BrutalFoundry icon and native extension installation; no dashboard behavior was changed.

## 0.1.21 — BrutalDash beta

- Replace the low-contrast catalog thumbnail with a bright, tightly framed BrutalFoundry emblem designed for BridgeThing's small app-list size.
- Package the bundled PresentMon executable inside the desktop extension directory that BridgeThing actually extracts.
- Preserve the existing dashboard, polling cadence, telemetry selection, layouts, clock mode, and controls unchanged.

## 0.1.20 — BrutalDash beta

- Add Foundry Analog and Minimal Analog clock faces with smoothly positioned hour, minute, and second hands.
- Add a dedicated on-device arrange mode: drag one card onto another with a finger to swap their complete grid slots.
- Long-press any dashboard card to enter Arrange Mode directly while retaining Customize → Layout as a discoverable fallback.
- Keep desktop drag-and-drop while making differently sized cards exchange both position and size.
- Remove the redundant `+ FPS` text from the telemetry source badge without changing FPS capture.
- Exclude Windows Snipping Tool from fullscreen game probing.

## 0.1.19 — BrutalDash beta

- Add Automatic Clock Mode after 12 seconds without fresh PC telemetry, plus Dashboard Only and Clock Only modes.
- Add Bold Digital, Foundry, and OLED Minimal clock faces with 12/24-hour time, optional date, theme colors, and a custom clock color.
- Continue the clock from the PC's timezone offset so a disconnected device does not fall back to UTC.
- Probe fullscreen standalone games with bundled PresentMon instead of requiring a recognized store installation path.
- Add persistent Recognize as Game and Never Recognize controls on the device, with matching executable override fields in desktop settings.
- Preserve the detected game and native FPS collector briefly through Alt-Tab transitions.

## 0.1.18 — BrutalDash beta

- Bundle Intel PresentMon 2.5.1 so live FPS, frame time, and 1% low readings do not require HWiNFO or a separate installation.
- Target only the detected game process and retain that target briefly through Alt-Tab transitions.
- Prefer the direct bundled frame stream while retaining HWiNFO FPS as an automatic fallback during capture startup.

## 0.1.17 — BrutalDash beta

- Reacquire an active HWiNFO PresentMon group after Alt-Tab, including process-tagged streams when foreground detection is temporarily unavailable.
- Reject inactive zero-FPS groups instead of allowing them to block a usable stream.

## 0.1.16 — BrutalDash beta

- Remove the redundant FPS card heading while keeping the detected game above the live FPS value and retaining the edit-mode drag control.

## 0.1.15 — BrutalDash beta

- Place the detected game above the FPS label and increase it from 10px gray text to a bold, responsive 15–20px teal-to-pink treatment.

## 0.1.14 — BrutalDash beta

- Read the verified generic `PresentMon` HWiNFO stream when HWiNFO does not tag it with a process name, restoring live FPS, frame time, and 1% low values.
- Label mixed HWiNFO/native samples as `HWiNFO+` in the header.

## 0.1.13 — BrutalDash beta

- Keep BrutalDash in the header and render the detected game name inside the FPS card.
- Restore the DISK read session min/max line and center all card content outside edit mode.
- Apply one continuous teal-to-pink BrutalFoundry gradient to the full BrutalDash wordmark.
- Set the catalog author and source to BrutalFoundry / BrutalDash.

## 0.1.12 — BrutalDash beta

- Restore the prior 0.1.10 device UI after the 0.1.11 screen change did not remain responsive on the Car Thing.

## 0.1.11 — BrutalDash beta

- Keep the BrutalDash wordmark in the header; show detected game names only inside the FPS card.
- Restore the DISK card session min/max range.
- Center card content and apply one continuous teal-to-pink gradient to the full BrutalDash wordmark.

## 0.1.10 — BrutalDash beta

- Remove the rejected custom font and return the dashboard to the system UI font.
- Simplify the storage card to **DISK** with equal live read/write values and one standard-size `USED` tertiary line.
- Deepen the Brutal half of the wordmark to a readable carbon finish while keeping Dash in the teal-to-pink company colors.

## 0.1.9 — BrutalDash beta

- Apply a BrutalFoundry gunmetal, teal, and pink wordmark to BrutalDash.
- Render disk read and write as equal large live values, with disk capacity as the tertiary line.

## 0.1.8 — BrutalDash beta

- Bundle the open-licensed Oxanium variable font for a sharper, readable device UI without relying on a network connection.

## 0.1.7 — BrutalDash beta

- Add native Windows disk read/write rates when HWiNFO is unavailable or incomplete.
- Restore the actual Windows CPU model in the header beside the GPU model.

## 0.1.6 — BrutalDash beta

- Label hybrid data honestly when native Windows or NVIDIA fallback completes an incomplete HWiNFO sample.
- Keep the actual NVIDIA model name instead of showing the generic `GPU` label when HWiNFO is partial.

## 0.1.5 — BrutalDash beta

- Keep native Windows and NVIDIA telemetry active when HWiNFO is present but incomplete.
- Add cross-vendor Windows GPU usage and dedicated-memory fallback.
- Prevent unavailable-HWiNFO warnings from flooding the desktop extension log.

## 0.1.4 — BrutalDash beta

- Rename and brand the app as BrutalDash with the supplied BrutalFoundry logo.
- Add native Windows network throughput and direct NVIDIA driver telemetry.
- Keep HWiNFO optional; correct the shared-memory reader when it is present.
- Package the desktop extension and an app-list icon for BridgeThing installation.

## 0.1.0

First release.
