# v0.1.52 validation

Release artifact: BrutalDash-0.1.52.zip, 53,549,749 bytes, 276 entries. SHA-256: cc4a2b0e723ca9aed32e65e2b9142340baecfa65ae96a43597fc00761e07eb0d. Every entry matches the tested dist build.

## Checks

- Typecheck/build, seven battery UI groups and fifteen shared UI interaction groups passed. Estimator and helper-supervisor regression tests passed.
- Actual Car Thing: vertical swipe cancels hold, the delayed hold enters pickup, dropping swaps devices, order survives reload, and the test restores the original order. Grid/List/Single measured 30–57 ms. Clock offset is -8 px.
- Populated battery-card run: 90 UI actions including 90 seconds idle; p95 107.1 ms, maximum 444.3 ms, one above 250 ms and none above 500 ms. No JavaScript exceptions, browser restarts or current-boot OOM kills.
- Fifteen saved-layout switches passed, with settings and saved slots restored.
- Exact ZIP helper ran from a fresh directory containing spaces with only Windows directories on PATH and external Python search variables removed. All eleven providers initialized; keyboard and mouse readings returned.
- Keyboard/mouse readings returned automatically after an interval without replies. Earlier physical off/on tests covered the Maxwell receiver.

## Scope

The test device initially ran development firmware 0.2.5-dev and suffered native browser storage stalls and OOM kills. After an authorized installation of official production 0.2.5, the unchanged app ZIP passed the checks above on daemon 0.12.5, with no custom browser, systemd override or memory tuning. Development-firmware performance remains a known limitation, not a fixed app defect. The ZIP contains no firmware update and requires no special firmware flash on an already-configured production BridgeThing installation.

Windows x64 dependency isolation was tested on one PC. Other device models have provider coverage, not hardware certification. AM5 support is not newly certified by this release. Full charge/discharge-cycle ETA accuracy remains unverified; estimates adapt to observed use and charging taper. Automated touchscreen injection and user finger feel are distinct evidence.
