"""Read-only Cloud III Wireless queries (HP 03f0:05b7 / 0c9d).

Wire reference: HyperHeadset cloud_iii_wireless.rs at
57dfa2b32ab73097be016006bf6580933536637e. No configuration commands.
"""
import time
import hid
from .base import DeviceStatus

PIDS = (0x05B7, 0x0C9D)
RESPONSES = {0x82: (0x82, 0x0B), 0x89: (0x89, 0x0D), 0x8A: (0x8A, 0x0C)}


def parse_reply(command, reply):
    if len(reply) < 5 or reply[0] != 0x66 or reply[1] not in RESPONSES[command]:
        return None
    if command == 0x89:
        return reply[4] if (reply[2] or reply[3]) and reply[4] <= 100 else None
    if command == 0x82:
        return bool(reply[2]) if reply[2] in (0, 1) else None
    return reply[2] in (1, 2) if reply[2] in (0, 1, 2) else None


def query(device, command):
    packet = [0x66, command] + [0] * 60
    try:
        device.write(packet)
    except OSError as error:
        if 'Incorrect function' not in str(error) and '(0x00000001)' not in str(error):
            raise
        device.send_feature_report(packet)
    deadline = time.monotonic() + 1.0
    while time.monotonic() < deadline:
        value = parse_reply(command, device.read(64, 100))
        if value is not None:
            return value
    return None


def poll_cloud3(infos, diagnostics):
    result = []
    for info in infos:
        if info['product_id'] not in PIDS or (info.get('usage_page'), info.get('usage')) != (0xFF13, 1):
            continue
        device = hid.device()
        try:
            device.open_path(info['path'])
            device.set_nonblocking(True)
            for _ in range(8):
                if not device.read(64):
                    break
            device.set_nonblocking(False)
            # A receiver can stay attached with the headset off. Require a live link.
            connected = query(device, 0x82)
            if connected is not True:
                diagnostics.append(f'[HyperX Cloud III] link={connected}')
                continue
            level = query(device, 0x89)
            charging = query(device, 0x8A)
            diagnostics.append(f'[HyperX Cloud III] level={level} charging={charging}')
            if level is not None:
                key = 'hyperx:cloud3:' + info['path'].decode(errors='replace')
                result.append(DeviceStatus(key, 'HyperX Cloud III Wireless', level,
                                           charging, True, 'hyperx', kind='headset'))
        except (OSError, ValueError) as error:
            diagnostics.append(f'[HyperX Cloud III] {error}')
        finally:
            device.close()
    return result
