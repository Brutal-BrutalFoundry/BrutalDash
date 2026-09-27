import sys, unittest
from pathlib import Path
from unittest.mock import patch
sys.path.insert(0,str(Path(__file__).resolve().parents[2]/'extension/vendor/battery-host'))
from providers import hyperx_cloud3 as cloud3
from providers.logitech import LogitechProvider

class FakeHid:
    def __init__(self,connected=True,feature=False):
        self.connected=connected;self.feature=feature;self.reply=[];self.commands=[];self.closed=False
    def open_path(self,p): self.path=p
    def set_nonblocking(self,v): pass
    def write(self,p):
        if self.feature: raise OSError('WriteFile: (0x00000001) Incorrect function.')
        self.accept(p)
    def send_feature_report(self,p): self.accept(p)
    def accept(self,p):
        assert len(p)==62 and p[0]==0x66 and p[1] in (0x82,0x89,0x8a)
        self.commands.append(p[1]);self.reply={0x82:[0x66,0x82,int(self.connected),0,0],0x89:[0x66,0x89,1,0,73],0x8a:[0x66,0x8a,1,0,0]}[p[1]]
    def read(self,*args): r=self.reply;self.reply=[];return r
    def close(self): self.closed=True

class Tests(unittest.TestCase):
    def infos(self):
        return [dict(product_id=0x05b7,usage_page=p,usage=u,path=b'cloud3') for p,u in [(0xc,1),(0xb,5),(0xff13,1)]]
    def test_cloud3_and_feature_fallback(self):
        for feature in (False,True):
            dev=FakeHid(feature=feature)
            with patch.object(cloud3.hid,'device',return_value=dev): result=cloud3.poll_cloud3(self.infos(),[])
            self.assertEqual((result[0].level,result[0].charging),(73,True));self.assertTrue(dev.closed);self.assertEqual(dev.commands,[0x82,0x89,0x8a])
    def test_disconnected_receiver_skips_battery(self):
        dev=FakeHid(connected=False)
        with patch.object(cloud3.hid,'device',return_value=dev): self.assertEqual(cloud3.poll_cloud3(self.infos(),[]),[])
        self.assertEqual(dev.commands,[0x82])
    def test_invalid_and_unsolicited(self):
        for r in [[],[0x66,0x89],[0,0x89,1,0,73],[0x66,0x89,0,0,73],[0x66,0x89,1,0,255],[0x66,0x8a,1,0,73]]:
            self.assertIsNone(cloud3.parse_reply(0x89,r))
        self.assertEqual(cloud3.parse_reply(0x89,[0x66,0x0d,1,0,0]),0)
        self.assertIsNone(cloud3.parse_reply(0x8a,[0x66,0x8a,3,0,0]))
    def test_exact_logitech_collections(self):
        for page,short,long in [(0xff00,1,2),(0xff43,0x301,0x302)]:
            infos=[dict(product_id=0xc54f,usage_page=p,usage=u,path=path,product_string='USB Receiver') for p,u,path in [(1,2,b'mouse'),(page,short,b'short'),(page,long,b'long')]]
            with patch('providers.logitech.hidlist.enumerate',return_value=infos),patch('providers.logitech._Channel') as channel,patch.object(LogitechProvider,'_read',return_value=None) as read:
                LogitechProvider().poll();channel.assert_called_once_with(b'short',b'long');self.assertEqual([c.args[-1] for c in read.call_args_list],list(range(1,7)));channel.return_value.close.assert_called_once()
    def test_direct_bluetooth_uses_device_index(self):
        infos=[dict(product_id=0xb034,usage_page=0xff43,usage=0x202,path=b'bluetooth',product_string='MX Master 3S')]
        with patch('providers.logitech.hidlist.enumerate',return_value=infos),patch('providers.logitech._Channel') as channel,patch.object(LogitechProvider,'_read',return_value=None) as read:
            LogitechProvider().poll();channel.assert_called_once_with(None,b'bluetooth');self.assertEqual(read.call_args.args[-1],0xff)

if __name__=='__main__': unittest.main()
