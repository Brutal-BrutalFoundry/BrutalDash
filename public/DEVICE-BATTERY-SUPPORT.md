# Device Battery compatibility — 0.1.53

This is protocol coverage, not a claim that every listed model has been tested on hardware. The ZIP includes its helper/runtime; no separate Python or vendor app is needed.

## Added in this candidate

- HyperX Cloud III Wireless: HP 03f0:05b7 and 03f0:0c9d, FF13:0001. Link, battery and charging queries only.
- Logitech HID++: newer receiver collections FF43:0301/0302 (reported C54F receiver), and direct FF43:0202 connections including compatible Bluetooth models. Battery features and names are discovered; interface matching alone does not guarantee a supported battery feature.
- Corsair established headset protocol: vendor 1b1c; IDs 1b1c,1b27,0a14,0a16,0a17,0a1d,0a1a,1b2a,1b23,1b29,0a55,0a51,0a52,0a38,0a4f,0a2b,0a75. Requires FFC5:0001/interface 3 and a valid battery response. Names come from the device. This allowlist covers protocol IDs, not 17 distinct model names. Wired 0a56 is excluded.
- SteelSeries Arctis 1 Wireless(12b3), Arctis 1 Xbox(12b6), Arctis 7X(12d7), Arctis 7P(12d5): FF43:0202/interface 3. Charging state is unknown because this query does not provide it.
- Arctis 7+(220e), PS5(2212), Xbox(2216), Destiny(2236): FFC0:0001/interface 3. Five-level battery readings are marked approximate and excluded from ETA learning.

## Existing coverage retained

HaloBattery 1.11.0 providers: Razer, Audeze, WLmouse, Mchose, HyperX Cloud II, Logitech HID++, SteelSeries Nova 5/7 and mice, XInput, PlayStation and Windows Bluetooth battery properties. Independent ASUS keyboard reader with paired-model identification. Actual model/connection support varies within each family.

Locally observed hardware: Audeze Maxwell, ASUS ROG Strix Scope II 96 via OMNI, Logitech G502 X PLUS. Cloud III and C54F feedback is still needed from the reporting PC. Other new profiles have protocol/fixture tests, not physical-device verification.

## Resource limits

Hardware polling remains once per 30 seconds after the previous poll completes. The expanded headset protocols share one worker inside the existing hidden helper. No per-model processes, foreground polling or UI timers are added. Existing two-second heartbeat continues independently of hardware reads.

Absent vendors skip HID opens; unknown IDs/interfaces are never queried. Enumeration is cached until Windows' HID device list changes. The new headset reader sends one status query per match, drains at most 8 queued reports, accepts at most 5 reads with a 500 ms total response deadline, and caps matches at 64. At 64 simultaneous silent supported headsets the read budget is at most 32 seconds, excluding OS open/write delays. The existing 45-second stuck-provider watchdog bounds unexpected driver hangs by restarting the helper with backoff. The normal few-device case does not pay for absent models.

## Researched but deferred

Corsair HS80 MAX/Virtuoso MAX/Void V2 use a different initialization protocol. Logitech PRO X 2 headset uses Centurion, not the mouse reader. G533/G535 require model-specific voltage calibration. Additional HyperX families use different packet sizes/endpoints. ROCCAT Elo 7.1 Air's referenced implementation does not provide battery support. These are not included by guessing IDs or copying a different model's commands. ModMic battery status remains unverified.

## Protocol references

- https://github.com/Sapd/HeadsetControl/tree/25dadae5c5b834f94ee954513421def12c5d6305/lib/devices
- https://github.com/LennardKittner/HyperHeadset/blob/57dfa2b32ab73097be016006bf6580933536637e/src/devices/cloud_iii_wireless.rs
- https://github.com/Logitech/cpg-docs/tree/master/hidpp20

These readers implement battery wire queries only; no configuration, pairing, RGB, audio-control, firmware, or automatic update commands are used.
