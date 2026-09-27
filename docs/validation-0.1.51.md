# v0.1.51 stable validation

Stable acceptance was provided by the maintainer on 2026-09-27 after device testing. The release uses the exact accepted local ZIP, without rebuilding it for publication.

## Artifact

- File: `BrutalDash-0.1.51.zip`
- Size: 40,886,282 bytes; 211 entries.
- SHA-256: `3ca6dec7917405e24eb9725b29cb7f92d94fc8b42f2071b6d430b8c33d6a0e95`
- Version: 0.1.51; existing app identity retained.

The unchanged ZIP includes `AM5-TESTING.txt`, a historical .48 test checklist. Its candidate label predates this stable promotion; this document records the .51 release status. Its caution about unverified AM5 hardware coverage still applies.

## Automated checks

- TypeScript checks, production build, packaging guards, and ZIP-to-dist integrity passed.
- Fifteen production UI interaction groups passed using a browser and a simulated BridgeThing connection: media geometry, hold cancellation, 1.5-second mouse/touch pickup and swap, automatic save, reload and per-layout persistence, saved-slot recall, save retry, customization close dialogs, pickers, and shared logo/name persistence and defaults.
- Nine native CPU provisioning cases, five CPU-provider lifecycle cases, and five AMD/Intel HWiNFO mapping cases passed.
- Two fresh desktop-extension processes verified telemetry, native ICMP probes, save acknowledgment, and storage persistence.
- Live native CPU temperature, clock, and power samples were collected on the local Intel machine with driver installation disabled.

## Device and hardware evidence

The .48–.51 development sequence included physical Car Thing checks for touch swapping and persistent layouts, media/card/network geometry, fonts, and menu/layout responsiveness. The maintainer accepted the resulting .51 build as working before requesting stable publication.

Earlier AM5 logs showed repeated PawnIO provisioning and missing sensor readings. The shipped changes verify actual signed-module access and fix AMD HWiNFO sensor matching. No successful AM5 raw sensor capture was collected by the agent; user acceptance is not a claim that all AM5 hardware is certified.

Local device responsiveness testing also used temporary development-firmware logging overrides. Those overrides are not part of the release ZIP. Short interaction checks do not establish unlimited-session stability on every firmware or PC configuration.
