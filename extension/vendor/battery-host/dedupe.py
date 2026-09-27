# Adapted from HaloBattery 1.11.0; Copyright (c) 2026 Halo Battery contributors.
# MIT license: LICENSE-HaloBattery.txt
import logging
from typing import List, Set
from providers.base import DeviceStatus
log=logging.getLogger("halo_battery")
GAMEPAD_WORDS = ("controller", "gamepad", "joystick", "joy-con")

def dedupe_controllers(results: List[DeviceStatus], bt: List[DeviceStatus]) -> List[DeviceStatus]:
    """A controller connected over Bluetooth is seen twice: by the controller
    provider and as a Bluetooth device. Windows' own Bluetooth battery value is
    the one shown in Settings, so the controller provider's entry is dropped."""
    bt_pads = [s for s in bt if s.kind == "gamepad" or any(w in s.name.lower() for w in GAMEPAD_WORDS)]
    if not bt_pads:
        return results
    out = [s for s in results if not (s.source == "xinput" and s.via == "bluetooth")]
    for s in results:
        if s not in out:
            log.info("[XInput] %s is connected over Bluetooth and shown as a Bluetooth device", s.name)
    return out

_TRANSPORT_WORDS = frozenset((
    "bt", "ble", "bluetooth", "wireless", "dongle", "receiver", "headset", "usb",
))

def device_family(name: str) -> str:
    """A device name reduced to what identifies the device, not the connection.

    "Audeze Maxwell", "Audeze Maxwell Headset" and "Audeze Maxwell BT" are one headset
    seen over three connections and have to come out equal.
    """
    words = "".join(c if c.isalnum() else " " for c in (name or "").lower()).split()
    return " ".join(w for w in words if w not in _TRANSPORT_WORDS)

def drop_bluetooth_duplicates(results: List[DeviceStatus],
                              logged: Set[str]) -> List[DeviceStatus]:
    """One icon per device, not one per transport.

    A device that is read over HID is also visible to Windows' own Bluetooth battery
    API once it is paired: a Maxwell reports the same level over the USB-C endpoint and
    over Bluetooth at the same time, which put a second icon in the tray next to the
    live one. The HID reading wins here - it is the device's own protocol and it
    carries the charging state - so the Bluetooth copy is dropped and said so once per
    device rather than every poll. A device HID cannot see (Bluetooth only, nothing
    plugged in) keeps its Bluetooth icon, which is how a headset used purely over
    Bluetooth is covered at all: the vendor collection the provider needs does not
    exist over Bluetooth.
    """
    # controllers are left to dedupe_controllers(): for them the Bluetooth value wins
    hid = [device_family(st.name) for st in results
           if not st.key.startswith("bt:") and st.source not in ("bluetooth", "xinput")]
    kept: List[DeviceStatus] = []
    for st in results:
        if st.key.startswith("bt:") or st.source == "bluetooth":
            fam = device_family(st.name)
            duplicate = bool(fam) and any(
                fam == h or (len(fam) >= 6 and (fam in h or h in fam)) for h in hid)
            if duplicate:
                if st.key not in logged:
                    logged.add(st.key)
                    log.info("[Bluetooth] %s is already read over HID, the "
                             "Bluetooth copy is not shown", st.name)
                continue
            logged.discard(st.key)
        kept.append(st)
    return kept
