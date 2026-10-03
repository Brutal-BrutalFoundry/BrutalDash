# BrutalDash

## 0.1.61 (2026-10-03)

- Fixed duplicate Xbox controller battery entries over Bluetooth. Use the Windows Bluetooth battery reading instead of the misleading controller API value.

## 0.1.60 (2026-09-29)

- Added an LLM Monitor layout with model status, token speed, token counts, context usage, CPU, RAM, GPU readings, and total VRAM.
- Keep the latest inference and context readings visible between runs and after restarting.
- Added local llama.cpp connection settings, including a custom port and optional authentication.
- Added GPU selection for GPU and VRAM cards, with matching HWiNFO readings on multi-GPU systems.
- Show all detected GPU models in the dashboard header.
- Added screenshots by holding the physical dial, saved to the PC folder selected in settings.
- Fixed saved card choices and positions resetting after reconnecting or restarting.
- Restored button 4 as the fourth saved layout shortcut.
- Added double-tap to reset a card’s min/max readings.
- Improved Device Battery connection updates.
- Fixed the disconnected clock display on LLM Monitor.
- Removed min/max from the Gaming FPS card and fixed clipped supporting readings.
- Fixed Gaming GPU card sizing when using the Device Battery card.


## 0.1.53 - Stable (2026-09-27)

- Added HyperX Cloud III Wireless battery and charging status.
- Expanded Logitech receiver support, including newer C54F interfaces and direct Bluetooth HID++ connections.
- Added 25 Corsair and SteelSeries Arctis headset identifiers.
- Improved handling of approximate battery readings to prevent misleading full-charge status and time estimates.

## 0.1.52 - Stable (2026-09-27)

- Add a Devices layout with ring grid, device list, and single-device views, plus a reusable Device batteries card for existing layouts. Whole-card up/down swipes page through detected devices, with a current-page indicator.
- Add visible Grid/List/Single controls and auto-saving hold-and-drag device ordering: half a second before feedback, then a one-second progress cue. Swiping cancels pickup.
- Use the selected Halo card design: larger battery ring beside the reading and one centered status line. Short vertical swipes track the finger and snap between devices; taps and cancelled swipes retain the current device.
- Recognize the Maxwell Xbox receiver's off identity and restore the headset automatically when it reconnects.
- Show short battery ETAs in one-minute steps and withdraw charging estimates when progress no longer supports the learned pace.
- Add solid/outline icons, percentage-based battery colors, optional charging pulse, and time estimates learned separately for charging and use. Save learned rates across restarts and reuse them on a fresh reading. Show an approximate ETA after two measured percentage changes without the fixed ten-minute wait; retain Learning/Updating beside the battery state until an ETA is available. Hardware polling is unchanged.
- Identify the paired Scope II 96 through the OMNI receiver rather than using the receiver name.
- Move the normal dashboard clock up eight pixels.
- Bundle all HaloBattery 1.11.0 battery providers and a separate ASUS keyboard status reader. No Python, HaloBattery, or vendor app installation is required.
- Keep battery polling in a persistent hidden helper, separate from main telemetry. Bound retries and stale readings, clean up the process tree on shutdown, and distinguish estimated, unknown, sleeping, and charging readings.
- Local hardware checks returned readings for Audeze Maxwell, Logitech G502 X PLUS, and ASUS Scope II 96 via OMNI. Other provider/model coverage follows upstream and is not a claim of local hardware testing.

## 0.1.51 - Stable (2026-09-27)

- Promote the user-accepted .51 build to stable, including the changes tested in .48 through .50 below.
- Gaming Focus combines GPU/VRAM and adds network latency and rolling packet loss; supporting readings and bundled fonts are clearer across layouts.
- Hold a card for 1.5 seconds, drag onto another, and release to swap and automatically persist that layout.
- Improve layout switching, customization pickers, media layout, and brightness restoration after clock mode.
- Include verified-access PawnIO provisioning and AMD HWiNFO sensor-name fixes. Hardware coverage is based on available tests and user acceptance, not universal AM5 certification.

- Apply the uploaded branding logo to the top-left dashboard image across layouts as well as Foundry Digital. Restore-defaults returns both surfaces to the stock branding.

## 0.1.50 - Local test build (not published)

- Verify PawnIO readiness by loading the signed CPU-access module instead of trusting registry metadata or installer exit codes. Reuse working access with stale metadata, verify access after setup, and stop with the actual Windows error if setup did not make the driver usable; prevent repeated provisioning loops.

## 0.1.49 - Local test build (not published)

- Recognize AMD HWiNFO CPU temperature, average effective clock, and SMU package-power names. Keep native CPU readings preferred when available and retain HWiNFO readings when native values are missing.
- Process the CPU helper's final output before choosing its restart policy, so completed provisioning retries promptly and cancelled/failed/reboot-required setup does not inadvertently retry.

## 0.1.48 - Local test build (not published)

- Normalize legacy saved Gaming Focus slots before display, correlate save-state replies so delayed older replies cannot restore a previous selection, and skip identical save-echo redraws. Remove usage-bar width animation to avoid continuous layout recalculation on the device.

- Apply approved option 2 to Gaming Focus: increase GPU, CPU, and RAM main values to 44px with labels alongside, retaining grouped supporting stats, min/max, and GPU peaks.

- Apply the user-approved option B grouped supporting-stat design across all six layouts. Retain min/max and GPU peaks; use tighter spacing in dense rows and make room for the System Rows upload group.

- Enlarge supporting telemetry throughout the standard layouts: 16–19px readings, bright 14px labels, larger disk units, and readable GPU current/peak values. Keep min/max; reflow dense rows and omit redundant card-name prefixes from detail labels.

- Make the gaming network strip easier to read with four equal columns, larger readings and labels, and higher-contrast secondary text. Retain transfer peaks and the latency target.

- Remove the probe-count sublabel under packet loss. Internal history remains capped at the last 30 results, including during long sessions.
- Replace native settings dropdowns across the dashboard and companion settings with a shared touch-friendly in-app picker. Keep selections visible, support keyboard navigation/cancel, and scroll long metric lists within the screen.
- Remove the customization-menu X. Mode toggles the menu: close immediately when unchanged; otherwise offer Save changes, Discard, or Keep editing. Mode also dismisses an open picker before applying that logic.
- Local revision 2: combine GPU/VRAM in Gaming Focus; retain temperature and VRAM peaks; add network throughput plus target-labeled native Windows ICMP latency and rolling packet loss.
- Hold any card for 1.5 seconds to pick it up directly on the normal dashboard. Drag onto another card and release to swap, then immediately resume normal operation without entering an editor or requiring confirmation. Show hold progress, cancel early release/outside drops, automatically save with desktop-storage acknowledgment, and retain the change in the layout profile and its recalled button slot.
- Reduce menu work by omitting hidden metric cards, expanding metric selectors only when requested, and retaining menu controls between visits. Keep keyboard shortcuts out of text inputs.
- Add a shared display name and uploaded clock logo in Appearance, with bounded image resizing and a restore-defaults control. Branding survives layout switching and saved-state reloads.
- .40 is the user-confirmed working baseline. Preserve the later larger centered clock, layout persistence, and physical controls.
- Repair corrupted UTF-8 labels and units; render the editor close control with SVG.
- Load the bundled Inter font explicitly in the dashboard and desktop settings, in WOFF2 form with its license; reject missing font assets and oversized settings pages during packaging.
- Keep the editor outside the whole-screen brightness filter, stop unrelated clock/ambient-light renders while editing, and retain visited tab controls instead of repeatedly rebuilding them.
- Restore the display's previous mode and level after clock-wheel dimming; serialize brightness commands and keep dashboard brightness out of clock mode.
- Bound media-helper requests, serialize snapshot/transport/volume over one process, stop stale subscriptions, and clear closed-drawer media state.
- Report failed PawnIO reads instead of treating them as zero; coordinate AMD SMN reads with the shared PCI mutex and retain specific temperature errors.
- Build and package checks are not runtime certification. AM5 hardware, second-machine rendering, long-idle behavior, crashes, and visible flicker remain release gates until directly verified.

## 0.1.47 - BrutalDash beta

- FAILED in reported use despite a successful production build. Not a known-good runtime baseline.
- Fix corrupted unavailable-metric text that could render garbage characters in the FPS card.

## 0.1.46 - BrutalDash beta

- Replace the LibreHardwareMonitor runtime CPU dependency with bundled standalone Intel and AMD CPU telemetry using PawnIO, while keeping HWiNFO optional for additional sensor enrichment.
- Make native CPU telemetry the baseline for CPU usage, temperature, clock and package power when those native readings are available.
- Keep the dashboard renderer responsive after long idle periods to eliminate the large first-input delay.
- Stop automatically restoring display brightness mode after leaving clock mode; manual clock brightness control remains available.
- Ship the corrected physical-button media drawer behavior in the new build.

## 0.1.45 - BrutalDash beta

- Fix native AM5 hardware-access setup when PawnIO returns Windows error 183 because its service is already registered.
- Accept error 183 only after verifying the PawnIO service exists, while preserving normal upgrade handling for known older versions.
- Fall back to the verified PawnIO service when uninstall-version metadata is missing so native CPU telemetry can continue instead of failing setup.
- Pin the exact managed CPU-helper DLL SHA-256 in both build and release packaging guards so the patched helper cannot be silently replaced by an older DLL.

## 0.1.44 - BrutalDash beta

- Fix physical controls: Back toggles Media, Mode/M opens Customize, Buttons 1-3 recall layouts, and Button 4 resets telemetry MIN/MAX.
- Preserve saved card swaps across reloads and make Customize close safely with Save, Discard, or Keep Editing only when changes are pending.
- Enlarge and center the header clock, keep the Native/HWiNFO status readable, and remove the obsolete top SAVE DASHBOARD control and yellow focus border.
- Add bundled native AM5 CPU temperature, clock, and package-power telemetry with one-time PawnIO provisioning when required; no HWiNFO or separate monitoring app is required.
- Replace the oversized single-file CPU helper with a self-contained multi-file publish and add build/package guards that reject the distribution pattern Discord flagged.
- Preserve Intel PresentMon byte-for-byte and keep its Authenticode signature valid instead of patching its PE header.
- Add a tiny hidden PresentMon launcher that forwards live CSV output and owns the child with a kill-on-close Windows Job Object so capture cleanup remains reliable.
- Add release guards for the exact PresentMon, launcher, PawnIO, and CPU-host payloads.

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
