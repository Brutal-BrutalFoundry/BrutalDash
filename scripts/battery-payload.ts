import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';

export function verifyBatteryPayload(directory:string) {
  const files=JSON.parse(readFileSync(resolve(directory,'payload-sha256.json'),'utf8')) as Record<string,string>;
  for(const required of ['BrutalDashBatteryHost.exe','collector.py','providers/asus.py','runtime/python.exe','runtime/python314.pak','runtime/hid.cp314-win_amd64.pyd','LICENSE-HaloBattery.txt']) {
    if(!files[required])throw Error(`Missing battery payload checksum: ${required}`);
  }
  for(const [file,hash] of Object.entries(files)) {
    if(file.startsWith('/')||file.includes('..')||file.includes('\\'))throw Error('Invalid battery payload path');
    const bytes=readFileSync(resolve(directory,file));
    if(createHash('sha256').update(bytes).digest('hex')!==hash)throw Error(`Battery payload mismatch: ${file}`);
  }
  const launcher=readFileSync(resolve(directory,'BrutalDashBatteryHost.exe'));
  const pe=launcher.readUInt32LE(0x3c);
  if(launcher.readUInt16LE(pe+24+68)!==2)throw Error('Battery helper must not open a console window');
}
