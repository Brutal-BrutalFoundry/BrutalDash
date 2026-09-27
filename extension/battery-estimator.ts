import type {PeripheralDevice, PeripheralSnapshot} from '../src/peripherals.ts';
type Rate = {rate:number;minutes:number;points:number;changes:number};
type Learned = {updated:number;drain?:Rate;charge?:Rate};
type Session = {time:number;level:number;anchorTime:number;anchorLevel:number;mode:'drain'|'charge';started:number};
const DAY=86400000;
export class BatteryEstimator {
  private learned:Record<string,Learned>={};
  private sessions=new Map<string,Session>();
  load(raw:unknown,now=Date.now()) {
    if(!raw||typeof raw!=='object')return;
    for(const [id,v] of Object.entries(raw).slice(0,64)) {
      if(!/^[a-f0-9]{24}$/.test(id)||!v||typeof v!=='object')continue;
      const d=v as Learned;if(!Number.isFinite(d.updated)||d.updated>now||now-d.updated>30*DAY)continue;
      const result:Learned={updated:d.updated};
      for(const mode of ['charge','drain'] as const){const r=d[mode];if(r&&[r.rate,r.minutes,r.points,r.changes].every(Number.isFinite)&&r.rate>0&&r.rate<=10&&r.minutes>=0&&r.points>=0&&r.changes>=0)result[mode]={rate:r.rate,minutes:Math.min(r.minutes,10000),points:Math.min(r.points,1000),changes:Math.min(r.changes,1000)};}
      this.learned[id]=result;
    }
  }
  export(now=Date.now()) {return Object.fromEntries(Object.entries(this.learned).filter(([,v])=>now-v.updated<=30*DAY).sort((a,b)=>b[1].updated-a[1].updated).slice(0,64));}
  update(snapshot:PeripheralSnapshot,now=Date.now()):PeripheralSnapshot {
    this.learned=this.export(now);
    const present=new Set(snapshot.devices.map(d=>d.id));
    for(const id of this.sessions.keys())if(!present.has(id))this.sessions.delete(id);
    const devices=snapshot.devices.map(d=>this.observe(d,now));
    this.learned=this.export(now);
    return {...snapshot,devices};
  }
  private observe(d:PeripheralDevice,now:number):PeripheralDevice {
    const result={...d,etaMinutes:null,etaKind:null,etaStatus:undefined} as PeripheralDevice;
    if(!d.online||now-d.sampledAt>90000||d.percent===null||d.charging===null){this.sessions.delete(d.id);return result;}
    const mode=d.charging?'charge':'drain',t=d.sampledAt,p=d.percent;
    let s=this.sessions.get(d.id);
    // Start a fresh measurement window without discarding usable saved rates.
    // The reconnect gap must never become part of a measured drain/charge rate.
    if(!s||s.mode!==mode||t<s.time||t-s.time>90000){s={time:t,level:p,anchorTime:t,anchorLevel:p,mode,started:t};this.sessions.set(d.id,s);}
    if(t>s.time){
      const step=mode==='charge'?p-s.level:s.level-p;
      if(step<0||step>10){this.sessions.delete(d.id);return result;}
      const points=mode==='charge'?p-s.anchorLevel:s.anchorLevel-p;
      const minutes=(t-s.anchorTime)/60000;
      if(points>0&&minutes>=1){
        const rate=points/minutes;
        if(rate<=10){const learned=this.learned[d.id]??{updated:now},old=learned[mode];
          learned[mode]={rate:old?old.rate*.7+rate*.3:rate,minutes:Math.min(10000,(old?.minutes??0)+minutes),points:Math.min(1000,(old?.points??0)+points),changes:Math.min(1000,(old?.changes??0)+1)};
          learned.updated=now;this.learned[d.id]=learned;
        }
        s.anchorTime=t;s.anchorLevel=p;
      }
      s.time=t;s.level=p;
    }
    const r=this.learned[d.id]?.[mode];
    if(r&&r.points>=2&&r.changes>=2){
      const eta=(mode==='charge'?100-p:p)/r.rate;
      // A plateau substantially longer than the learned rate invalidates the estimate.
      const plateau=(t-s.anchorTime)/60000;
      if(eta>0&&eta<=(mode==='charge'?2880:20160)&&plateau<(mode==='charge'?Math.max(2,2/r.rate):Math.max(10,3/r.rate))){
        // Short predictions should not sit in the same five-minute bucket.
        result.etaMinutes=eta<60?Math.max(1,Math.ceil(eta)):Math.max(5,Math.round(eta/5)*5);result.etaKind=mode==='charge'?'full':'empty';
      }else if(mode==='charge'&&p<100){
        // The last observed pace no longer explains the current plateau. Do not
        // count down a cached prediction; wait for another real percentage step.
        result.etaStatus='adjusting';
      }
    }
    return result;
  }
}
