export type PeripheralDevice = {
  etaMinutes?: number | null; etaKind?: 'full' | 'empty' | null; etaStatus?: 'adjusting';
  id: string; name: string; kind: string; source: string;
  percent: number | null; estimatePercent: number | null;
  charging: boolean | null; online: boolean; state: string; sampledAt: number;
};
export type PeripheralSnapshot = {
  devices: PeripheralDevice[];
  status: 'starting' | 'ready' | 'unavailable';
  receivedAt: number;
};

export function parsePeripheralSnapshot(value: unknown, now = Date.now()): PeripheralSnapshot | null {
  if (!value || typeof value !== 'object' || !Array.isArray((value as {devices?:unknown}).devices)) return null;
  const devices: PeripheralDevice[] = [];
  const ids = new Set<string>();
  const level = (v: unknown) => typeof v === 'number' && Number.isInteger(v) && v >= 0 && v <= 100 ? v : null;
  for (const entry of (value as {devices:unknown[]}).devices.slice(0,64)) {
    if (!entry || typeof entry !== 'object') continue;
    const d = entry as Record<string,unknown>;
    if (typeof d.id !== 'string' || !/^[a-f0-9]{24}$/.test(d.id) || ids.has(d.id) || typeof d.name !== 'string') continue;
    if (typeof d.sampledAt !== 'number' || !Number.isFinite(d.sampledAt) || d.sampledAt > now+5000) continue;
    ids.add(d.id);
    devices.push({id:d.id,name:d.name.slice(0,100),kind:typeof d.kind==='string'?d.kind.slice(0,20):'device',
      source:typeof d.source==='string'?d.source.slice(0,24):'',percent:level(d.percent),estimatePercent:level(d.estimatePercent),
      charging:typeof d.charging==='boolean'?d.charging:null,online:d.online===true,
      state:typeof d.state==='string'?d.state.slice(0,100):'',sampledAt:d.sampledAt});
  }
  return {devices,status:'ready',receivedAt:now};
}

export function peripheralReading(device: PeripheralDevice, now: number) {
  if (!device.online) return {value:'—',unit:'',status:'Asleep / disconnected',level:null};
  if (now-device.sampledAt > 90_000) return {value:'—',unit:'',status:'Reading unavailable',level:null};
  const level = device.percent ?? device.estimatePercent;
  const approximate = device.percent === null && device.estimatePercent !== null;
  return {value:level===null?'—':`${approximate?'≈':''}${level}`,unit:level===null?'':'%',level,
    status:device.charging?'Charging':device.state || (level===null?'Battery not reported':level<=20?'Low battery':device.charging===null?'Battery level':'On battery')};
}

export function batteryEstimate(device:PeripheralDevice,now:number) {
  if(!device.online||now-device.sampledAt>90000)return '';
  if(device.percent===100)return '';
  if(device.percent===null||device.charging===null)return 'Time estimate unavailable';
  if(!device.etaMinutes||!device.etaKind)return device.etaStatus==='adjusting'?'Updating…':'Learning…';
  const minutes=Math.round(device.etaMinutes),hours=Math.floor(minutes/60),rest=minutes%60;
  return `~${hours?hours+'h ':''}${rest?rest+'m ':''}${device.etaKind==='full'?'to full':'remaining'}`;
}

/** Keep battery state and estimate progress together in the card's status line. */
export function batterySummary(device:PeripheralDevice,now:number,showEstimate=true) {
  const reading=peripheralReading(device,now);
  if(reading.level===null)return reading.status;
  if(reading.level===100)return 'Fully charged';
  const estimate=showEstimate?batteryEstimate(device,now).replace('remaining','left').replace('Time estimate unavailable','ETA unavailable'):'';
  const state=device.charging?'Charging':reading.level<=20?'Low battery':device.charging===false?'On battery':'Battery level';
  return estimate?`${state} · ${estimate}`:state;
}
