"""Background battery collector. No tray UI, updater, persistence or startup task.

One persistent process; providers retain caches, run at most once per 30s, and
never block the JSON heartbeat. A stuck provider terminates this process after
45s; the desktop supervisor owns its whole process tree and backs off retries.
"""
import hashlib
import json
import logging
import os
import sys
import threading
import time
from providers import (RazerProvider, AudezeProvider, WLmouseProvider, MchoseProvider,
    HyperXProvider, LogitechProvider, SteelSeriesProvider, XInputProvider,
    PlayStationProvider, BluetoothProvider)
from providers.asus import AsusProvider
from dedupe import dedupe_controllers, drop_bluetooth_duplicates

logging.disable(logging.CRITICAL)
POLL_SECONDS = 30
PROVIDERS = [RazerProvider, AudezeProvider, WLmouseProvider, MchoseProvider,
    HyperXProvider, LogitechProvider, SteelSeriesProvider, XInputProvider,
    PlayStationProvider, BluetoothProvider, AsusProvider]


def normalize(status, sampled_at):
    level = status.level
    if type(level) is not int or not 0 <= level <= 100:
        level = None
    approximate = bool(status.approx)
    wired = status.source == 'xinput' and 'on cable' in status.approx.lower()
    kind = status.kind
    if not kind:
        words = status.name.lower()
        if any(word in words for word in ('headset', 'headphone', 'blackshark', 'arctis', 'maxwell', 'cloud ii')):
            kind = 'headset'
        elif status.source in ('xinput', 'playstation'):
            kind = 'gamepad'
        elif status.source in ('razer', 'wlmouse', 'mchose', 'logitech', 'steelseries'):
            kind = 'mouse'
        else:
            kind = 'device'
    return dict(id=hashlib.sha256(status.key.encode()).hexdigest()[:24],
        name=status.name[:100], kind=kind, source=status.source,
        percent=None if approximate else level,
        estimatePercent=level if approximate and not wired else None,
        state='Wired; battery unknown' if wired else 'Battery not reported' if level is None else status.approx or '',
        charging=None if wired or status.source == 'bluetooth' else status.charging, online=status.online,
        sampledAt=sampled_at)


def main():
    lock = threading.Lock()
    states = {p.name: dict(devices=[], sampledAt=0, startedAt=0, status='starting') for p in PROVIDERS}
    def run(factory):
        provider = factory()
        while True:
            with lock:
                states[provider.name]['startedAt'] = time.monotonic()
            try:
                devices = provider.poll()
                status = 'ready'
            except Exception:
                devices, status = [], 'unavailable'
            with lock:
                states[provider.name] = dict(devices=devices[:64], sampledAt=int(time.time()*1000),
                                            startedAt=0, status=status)
            time.sleep(POLL_SECONDS)
    for factory in PROVIDERS:
        threading.Thread(target=run, args=(factory,), daemon=True).start()
    while True:
        time.sleep(2)
        with lock:
            snapshot = {key:dict(value) for key,value in states.items()}
        # Do not accumulate hung threads or stale readings indefinitely.
        if any(s['startedAt'] and time.monotonic()-s['startedAt'] > 45 for s in snapshot.values()):
            os._exit(6)
        bluetooth = snapshot['bluetooth']['devices']
        other = [d for k,s in snapshot.items() if k != 'bluetooth' for d in s['devices']]
        devices = drop_bluetooth_duplicates(dedupe_controllers(other, bluetooth)+bluetooth, set())
        normalized = [normalize(d, snapshot[d.source]['sampledAt']) for d in devices if d.source in snapshot]
        normalized.sort(key=lambda d:(d['kind'],d['name'],d['id']))
        message = dict(devices=normalized[:64], providers={k:s['status'] for k,s in snapshot.items()})
        print(json.dumps(message, separators=(',',':')), flush=True)


if __name__ == '__main__':
    main()
