"""Additional battery-only headset protocols; no settings or wake commands.

Wire fields and IDs: Sapd/HeadsetControl at
25dadae5c5b834f94ee954513421def12c5d6305, corsair_void_rich.hpp,
steelseries_arctis_1.hpp and steelseries_arctis_7_plus.hpp.
"""
import time
import hid
from . import hidlist
from .base import DeviceStatus, Provider

# Each profile requires the documented vendor collection AND interface.
CORSAIR_IDS = (0x1B1C, 0x1B27, 0x0A14, 0x0A16, 0x0A17, 0x0A1D, 0x0A1A,
               0x1B2A, 0x1B23, 0x1B29, 0x0A55, 0x0A51, 0x0A52, 0x0A38,
               0x0A4F, 0x0A2B, 0x0A75)
ARCTIS_ONE = {0x12B3: 'Arctis 1 Wireless', 0x12B6: 'Arctis 1 Wireless Xbox',
              0x12D7: 'Arctis 7X', 0x12D5: 'Arctis 7P'}
ARCTIS_PLUS = {0x220E: 'Arctis 7+', 0x2212: 'Arctis 7+ PS5',
               0x2216: 'Arctis 7+ Xbox', 0x2236: 'Arctis 7+ Destiny'}
TIMEOUT = 0.5
MAX_DEVICES = 64


def profile(info):
    vendor, pid = info.get('vendor_id'), info.get('product_id')
    endpoint = (info.get('usage_page'), info.get('usage'), info.get('interface_number'))
    if vendor == 0x1B1C and pid in CORSAIR_IDS and endpoint == (0xFFC5, 1, 3):
        return ('corsair', info.get('product_string') or 'Corsair headset', [0xC9, 0x64])
    if vendor == 0x1038 and pid in ARCTIS_ONE and endpoint == (0xFF43, 0x0202, 3):
        return ('arctis-one', ARCTIS_ONE[pid], [0x06, 0x12])
    if vendor == 0x1038 and pid in ARCTIS_PLUS and endpoint == (0xFFC0, 1, 3):
        return ('arctis-plus', ARCTIS_PLUS[pid], [0x00, 0xB0])
    return None


def decode(kind, data):
    """(percent, charging, approximate) or None; reject unrelated/invalid data."""
    if kind == 'corsair':
        if len(data) < 5 or data[0:2] != [0x64, 0] or data[3] != 0xB1:
            return None
        level, state = data[2] & 0x7F, data[4]
        if level > 100 or state not in (1, 2, 4, 5):
            return None
        return level, state in (4, 5), ''
    if kind == 'arctis-one':
        if len(data) < 4 or data[:2] != [0x06, 0x12] or data[2] == 1 or data[3] > 100:
            return None
        # This protocol does not report charging. Unknown must stay unknown.
        return data[3], None, ''
    if kind == 'arctis-plus':
        if len(data) < 4 or data[0] != 0xB0 or data[1] == 1 or data[2] > 4 or data[3] not in (0, 1):
            return None
        return data[2] * 25, data[3] == 1, 'Coarse battery level'
    return None


class HeadsetProvider(Provider):
    name = 'headsets'

    def __init__(self):
        self._diag = []

    def poll(self):
        self._diag = []
        out, seen = [], set()
        # hidlist skips hidapi entirely if the vendor is absent; caches enumeration.
        for vendor in (0x1B1C, 0x1038):
            for info in hidlist.enumerate(vendor):
                spec = profile(info)
                path = info['path']
                if not spec or path in seen or len(seen) >= MAX_DEVICES:
                    continue
                seen.add(path)
                kind, name, request = spec
                device = hid.device()
                try:
                    device.open_path(path)
                    device.set_nonblocking(True)
                    for _ in range(8):
                        if not device.read(64):
                            break
                    device.set_nonblocking(False)
                    device.write(request)
                    deadline = time.monotonic() + TIMEOUT
                    # Fixed attempt count also bounds continuous unsolicited traffic.
                    for _ in range(5):
                        remaining = deadline - time.monotonic()
                        if remaining <= 0:
                            break
                        reading = decode(kind, list(device.read(64, max(1, min(100, int(remaining * 1000)))) or []))
                        if reading is None:
                            continue
                        level, charging, approx = reading
                        out.append(DeviceStatus('headsets:' + path.decode(errors='replace'),
                                                name, level, charging, True, self.name,
                                                approx=approx, kind='headset'))
                        break
                except (OSError, ValueError) as error:
                    self._diag.append(f'{name}: {error}')
                finally:
                    device.close()
        return out

    def diagnostics(self):
        return list(self._diag)
