"""ASUS keyboard battery-status query; no configuration commands.

Protocol facts: report 02 on OMNI keyboard collection; command 12 01;
reply byte 6 is percent, byte 9 charging. Observed against Scope II 96.
Reference: G-Helper f67703f6 AsusKeyboard/StrixScopeII protocol definitions.
This provider implements only the wire query, not G-Helper's application code.
"""
import time
import hid
from . import hidlist
from .base import Provider, DeviceStatus

OMNI_KEYBOARDS = {
    0x1A85: 'ROG Azoth',
    0x1B42: 'ROG Azoth Extreme',
    0x1CF1: 'ROG Azoth Extreme SE',
    0x1AB0: 'ROG Strix Scope II 96',
    0x1B7A: 'ROG Strix Scope II 96 RX',
    0x1B06: 'ROG Falchion RX Low Profile',
}


def receiver_instance(path):
    parts = path.lower().split(b'#')
    return parts[2].rsplit(b'&', 1)[0] if len(parts) >= 3 else path.lower()


def paired_keyboard_name(reply):
    if len(reply) < 9 or reply[:3] != [1, 0xA0, 0]:
        return None
    for offset in range(5, len(reply) - 3, 4):
        pid = reply[offset] | (reply[offset + 1] << 8)
        if pid == 0:
            break
        if pid in OMNI_KEYBOARDS:
            return OMNI_KEYBOARDS[pid]
    return None


def read_keyboard_name(info):
    device = hid.device()
    try:
        device.open_path(info['path'])
        device.set_nonblocking(True)
        for _ in range(8):
            if not device.read(64):
                break
        device.set_nonblocking(False)
        # Read paired-device identities; does not change receiver pairing.
        device.write([1, 0xA0, 0, 0] + [0] * 60)
        for _ in range(3):
            name = paired_keyboard_name(device.read(64, 300))
            if name:
                return name
    except OSError:
        pass
    finally:
        device.close()
    return None


class AsusProvider(Provider):
    name = 'asus'

    def poll(self):
        out = []
        devices = hidlist.enumerate(0x0B05)
        names = {}
        for info in devices:
            if info['product_id'] == 0x1ACE and b'mi_02&col01' in info['path'].lower():
                names[receiver_instance(info['path'])] = read_keyboard_name(info)
        for info in devices:
            pid = info['product_id']
            path = info['path'].lower()
            if pid == 0x1ACE and b'mi_02&col02' in path:
                report, size = 2, 64
                name = names.get(receiver_instance(info['path'])) or 'ROG keyboard (OMNI)'
            elif pid in (0x1AAE, 0x1B78) and b'mi_01' in path and info.get('usage_page') == 0xFF00:
                report, size = 0, 65
                name = 'ROG Strix Scope II 96' + (' RX' if pid == 0x1B78 else '')
            else:
                continue
            device = hid.device()
            try:
                device.open_path(info['path'])
                device.set_nonblocking(True)
                for _ in range(8):
                    if not device.read(size):
                        break
                device.set_nonblocking(False)
                device.write([report, 0x12, 0x01] + [0] * (size-3))
                deadline = time.monotonic() + 0.9
                while time.monotonic() < deadline:
                    reply = device.read(size, 300)
                    if len(reply) >= 10 and reply[:3] == [report, 0x12, 0x01] and reply[6] <= 100:
                        out.append(DeviceStatus('asus:'+info['path'].decode(errors='replace'), name,
                            reply[6], reply[9] == 1, True, 'asus', kind='keyboard'))
                        break
            except OSError:
                pass
            finally:
                device.close()
        return out
