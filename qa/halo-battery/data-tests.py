import sys
import unittest
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / 'extension/vendor/battery-host'))
from collector import normalize, PROVIDERS
from providers.base import DeviceStatus
from providers.asus import AsusProvider, paired_keyboard_name, receiver_instance
from providers.audeze import AudezeProvider, no_headset_linked
from dedupe import dedupe_controllers, drop_bluetooth_duplicates


class BatteryDataTests(unittest.TestCase):
    def test_maxwell_disconnect_and_reconnect(self):
        for name in ('Audeze Maxwell Dongle', ' Audeze Maxwell XBOX Dongle '):
            self.assertTrue(no_headset_linked([{'product_string': name}]))
        self.assertFalse(no_headset_linked([{'product_string': 'Audeze Maxwell HID'}]))
        self.assertFalse(no_headset_linked([{'product_string': 'Audeze Maxwell Headset'}]))
        info = {'product_id': 0x4B18, 'serial_number': '0000000000000000',
                'path': b'test', 'usage_page': 0xFF13, 'usage': 1}
        provider = AudezeProvider()
        with patch('providers.audeze.hidlist.enumerate') as enumerate_devices, patch.object(provider, '_read_battery', return_value=(64, False)) as read:
            enumerate_devices.return_value = [{**info, 'product_string': 'Audeze Maxwell HID'}]
            first = provider.poll()
            self.assertEqual(len(first), 1)
            enumerate_devices.return_value = [{**info, 'product_string': 'Audeze Maxwell XBOX Dongle'}]
            read.reset_mock()
            self.assertEqual(provider.poll(), [])
            read.assert_not_called()  # Never accept the receiver's cached level while off.
            enumerate_devices.return_value = [{**info, 'product_string': 'Audeze Maxwell HID'}]
            returned = provider.poll()
            self.assertEqual(len(returned), 1)
            self.assertEqual(returned[0].key, first[0].key)

    def test_full_provider_coverage(self):
        self.assertEqual({p.name for p in PROVIDERS}, {'razer','audeze','wlmouse','mchose','hyperx',
            'logitech','steelseries','xinput','playstation','bluetooth','asus','headsets'})

    def test_exact_zero_and_invalid(self):
        self.assertEqual(normalize(DeviceStatus('a','Empty',0),1)['percent'],0)
        for value in (None,-1,101,255,True,float('nan')):
            self.assertIsNone(normalize(DeviceStatus('a','Invalid',value),1)['percent'])

    def test_no_false_precision_or_charging(self):
        d=normalize(DeviceStatus('a','Controller',55,False,True,'xinput','about 55% (medium)'),1)
        self.assertIsNone(d['percent']);self.assertEqual(d['estimatePercent'],55)
        d=normalize(DeviceStatus('a','Controller',100,True,True,'xinput','on cable, charging'),1)
        self.assertIsNone(d['percent']);self.assertIsNone(d['estimatePercent']);self.assertIsNone(d['charging'])
        d=normalize(DeviceStatus('a','Bluetooth headset',60,False,True,'bluetooth'),1)
        self.assertIsNone(d['charging'])

    def test_duplicate_transport(self):
        hid=DeviceStatus('hid:1','Audeze Maxwell',64,False,True,'audeze')
        bt=DeviceStatus('bt:1','Audeze Maxwell Headset',63,False,True,'bluetooth')
        self.assertEqual(drop_bluetooth_duplicates([hid,bt],set()),[hid])
        controller=DeviceStatus('pad','Xbox controller',None,False,True,'xinput',kind='gamepad',via='bluetooth')
        bt=DeviceStatus('bt:2','Xbox controller',82,False,True,'bluetooth',kind='gamepad')
        self.assertEqual(dedupe_controllers([controller],[bt]),[])

    def test_omni_keyboard_identity(self):
        prefix = [1, 0xA0, 0, 1, 0]
        self.assertEqual(paired_keyboard_name(prefix + [0x94,0x1A,2,4,0xB0,0x1A,2,4]), 'ROG Strix Scope II 96')
        self.assertEqual(paired_keyboard_name(prefix + [0x85,0x1A,2,4]), 'ROG Azoth')
        self.assertIsNone(paired_keyboard_name(prefix + [0xFF,0xFF,2,4]))
        self.assertIsNone(paired_keyboard_name([2,0x12,1,1,0,0xB0,0x1A,2,4]))
        self.assertIsNone(paired_keyboard_name(prefix + [0xB0,0x1A]))
        self.assertEqual(receiver_instance(b'hid#vid_0b05&mi_02&col01#7&123&0&0000#guid'), receiver_instance(b'hid#vid_0b05&mi_02&col02#7&123&0&0001#guid'))
        self.assertNotEqual(receiver_instance(b'hid#vid#7&123&0&0000#guid'), receiver_instance(b'hid#vid#7&456&0&0000#guid'))

    def test_asus_validates_only_status_reply_and_closes(self):
        class Device:
            closed=False
            def open_path(self,path):pass
            def set_nonblocking(self,value):self.nonblock=value
            def write(self,packet):self.packet=packet
            def read(self,size,timeout=0):
                if self.nonblock:return []
                return [2,0x12,1,0,0,0,58,0,0,1]+[0]*54
            def close(self):self.closed=True
        device=Device()
        info={'product_id':0x1ACE,'path':b'example_mi_02&col02','usage_page':0xFF01}
        with patch('providers.asus.hidlist.enumerate',return_value=[info]),patch('providers.asus.hid.device',return_value=device):
            result=AsusProvider().poll()
        self.assertEqual(result[0].level,58);self.assertTrue(result[0].charging)
        self.assertEqual(device.packet[:3],[2,0x12,1]);self.assertEqual(len(device.packet),64);self.assertTrue(device.closed)


if __name__=='__main__':unittest.main()
