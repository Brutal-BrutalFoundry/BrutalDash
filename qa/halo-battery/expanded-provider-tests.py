import sys, unittest
from pathlib import Path
from unittest.mock import patch
sys.path.insert(0,str(Path(__file__).resolve().parents[2]/'extension/vendor/battery-host'))
from providers import headsets as h
from collector import normalize
from providers.base import DeviceStatus
class Device:
    def __init__(self, reply): self.reply=reply;self.requests=[];self.reads=0;self.closed=False;self.nonblocking=False
    def open_path(self,p): self.path=p
    def set_nonblocking(self,b):self.nonblocking=b
    def write(self,r):self.requests.append(r)
    def read(self,n,timeout=None):self.reads+=1;return [] if self.nonblocking else self.reply
    def close(self):self.closed=True
class Tests(unittest.TestCase):
    def info(self,vid=0x1b1c,pid=0x0a14,page=0xffc5,usage=1,path=b'x'):
        return dict(vendor_id=vid,product_id=pid,usage_page=page,usage=usage,interface_number=3,path=path,product_string='Headset')
    def test_every_allowlisted_profile(self):
        for pid in h.CORSAIR_IDS:self.assertIsNotNone(h.profile(self.info(pid=pid)))
        for pid in h.ARCTIS_ONE:self.assertIsNotNone(h.profile(self.info(0x1038,pid,0xff43,0x202)))
        for pid in h.ARCTIS_PLUS:self.assertIsNotNone(h.profile(self.info(0x1038,pid,0xffc0,1)))
        for info in [self.info(pid=1),self.info(page=0xc),self.info(vid=0x1234),{**self.info(),'interface_number':0}]:self.assertIsNone(h.profile(info))
    def test_parsing_and_no_fabricated_charging(self):
        self.assertEqual(h.decode('corsair',[0x64,0,0x80|73,0xb1,4]),(73,True,''))
        self.assertEqual(h.decode('arctis-one',[6,0x12,2,59]),(59,None,''))
        self.assertEqual(h.decode('arctis-plus',[0xb0,0,3,0]),(75,False,'Coarse battery level'))
        for kind,data in [('corsair',[0x64,0,73,0xb1,0]),('corsair',[0x64,0,127,0xb1,1]),('corsair',[0,0,73,0xb1,1]),('arctis-one',[6,0x12,1,70]),('arctis-one',[6,0x12,2,255]),('arctis-plus',[0xb0,0,5,0]),('arctis-plus',[0xb0,1,3,0])]:self.assertIsNone(h.decode(kind,data))
        for kind in ('corsair','arctis-one','arctis-plus'):
            for data in ([],[0],[0]*64):self.assertIsNone(h.decode(kind,data))
        d=normalize(DeviceStatus('x','coarse',75,False,True,'headsets',approx='Coarse battery level',kind='headset'),123)
        self.assertIsNone(d['percent']);self.assertEqual(d['estimatePercent'],75)
    def test_absent_or_unsupported_never_opens_hardware(self):
        with patch.object(h.hidlist,'enumerate',return_value=[self.info(pid=1)]),patch.object(h.hid,'device') as factory:
            self.assertEqual(h.HeadsetProvider().poll(),[]);factory.assert_not_called()
    def test_one_query_closes_and_distinguishes_identical_devices(self):
        a,b=Device([0x64,0,50,0xb1,1]),Device([0x64,0,60,0xb1,4]);infos=[self.info(path=b'a'),self.info(path=b'b')]
        with patch.object(h.hidlist,'enumerate',side_effect=[infos,[]]),patch.object(h.hid,'device',side_effect=[a,b]):out=h.HeadsetProvider().poll()
        self.assertEqual(len(out),2);self.assertNotEqual(out[0].key,out[1].key)
        for d in (a,b):self.assertEqual(d.requests,[[0xc9,0x64]]);self.assertTrue(d.closed)
    def test_unsolicited_packets_and_many_devices_are_bounded(self):
        devices=[]
        def factory():d=Device([0x99]*64);devices.append(d);return d
        infos=[self.info(path=str(i).encode()) for i in range(100)]
        with patch.object(h.hidlist,'enumerate',side_effect=[infos,[]]),patch.object(h.hid,'device',side_effect=factory):self.assertEqual(h.HeadsetProvider().poll(),[])
        self.assertEqual(len(devices),64)
        for d in devices:self.assertLessEqual(d.reads,6);self.assertEqual(len(d.requests),1);self.assertTrue(d.closed)
if __name__=='__main__':unittest.main()
