import { validProbeTarget, type NetworkQuality } from '../src/network-quality';
export type ProbeResult = { latencyMs: number | null; lost: boolean; error: string | null };
// A worker keeps the blocking Windows API and thread-local GetLastError together,
// off the telemetry/event thread. No ping.exe or shell process is launched.
const workerSource = `
let api, errors, handle;
try {
 api=Deno.dlopen('iphlpapi.dll',{
  IcmpCreateFile:{parameters:[],result:'pointer'},
  IcmpCloseHandle:{parameters:['pointer'],result:'i32'},
  IcmpSendEcho:{parameters:['pointer','u32','buffer','u16','pointer','buffer','u32','u32'],result:'u32'}
 });
 errors=Deno.dlopen('kernel32.dll',{GetLastError:{parameters:[],result:'u32'}});
 handle=api.symbols.IcmpCreateFile();
 if(!handle||Deno.UnsafePointer.value(handle)===18446744073709551615n)throw Error('ICMP handle unavailable');
}catch(error){self.postMessage({latencyMs:null,lost:false,error:String(error)});self.close();}
self.onmessage=e=>{
 if(e.data.stop){if(handle)api.symbols.IcmpCloseHandle(handle);api?.close();errors?.close();self.close();return;}
 try{
  const parts=e.data.target.split('.').map(Number);const address=(parts[0]|parts[1]<<8|parts[2]<<16|parts[3]<<24)>>>0;
  const data=new Uint8Array(16),reply=new Uint8Array(256);
  const count=api.symbols.IcmpSendEcho(handle,address,data,data.length,null,reply,reply.length,1000);
  const view=new DataView(reply.buffer);const status=count?view.getUint32(4,true):errors.symbols.GetLastError();
  const lost=[11002,11003,11004,11005,11010,11013,11014].includes(status);
  self.postMessage({latencyMs:count&&status===0?view.getUint32(8,true):null,lost,error:status===0?null:'ICMP '+status});
 }catch(error){self.postMessage({latencyMs:null,lost:false,error:String(error)});}
};`;
export class NetworkQualityMonitor {
  private worker: Worker | null = null;
  private pending = false;
  private nextAt = 0;
  private deadline: ReturnType<typeof setTimeout> | undefined;
  private stopped = false;
  private history: boolean[] = [];
  private current: NetworkQuality;
  constructor(readonly target: string, private factory = () => new Worker(`data:text/javascript,${encodeURIComponent(workerSource)}`, { type: 'module' })) {
    this.current = {target,latencyMs:null,lossPercent:null,samples:0,received:0,updatedAt:null,error:null};
  }
  snapshot(now = Date.now()): NetworkQuality {
    if (this.current.updatedAt !== null && now-this.current.updatedAt > 6000) return {...this.current,latencyMs:null,lossPercent:null,error:'Probe stale'};
    return {...this.current};
  }
  update(now = Date.now()) {
    if(this.stopped || this.pending || now<this.nextAt)return;
    if(!validProbeTarget(this.target)){this.current.error='Invalid IPv4 target';return;}
    try {
      if(!this.worker){
        this.worker=this.factory();
        this.worker.onmessage=event=>this.consume(event.data);
        this.worker.onerror=event=>{event.preventDefault();this.failed('Probe worker failed');};
      }
      this.pending=true;this.nextAt=now+2000;
      this.deadline=setTimeout(()=>this.failed('Probe deadline exceeded'),2500);
      this.worker.postMessage({target:this.target});
    }catch(error){this.failed(String(error));}
  }
  private failed(error: string) {
    clearTimeout(this.deadline);this.pending=false;this.nextAt=Date.now()+10000;
    this.worker?.terminate();this.worker=null;
    this.current={...this.current,latencyMs:null,lossPercent:null,error,updatedAt:Date.now()};
  }
  private consume(value: ProbeResult) {
    clearTimeout(this.deadline);this.pending=false;
    if(this.stopped){this.worker?.postMessage({stop:true});this.worker=null;return;}
    const success=Number.isFinite(value.latencyMs)&&value.latencyMs!==null&&value.latencyMs>=0;
    if(!success&&!value.lost){this.failed(value.error||'Probe unavailable');return;}
    this.history.push(success);if(this.history.length>30)this.history.shift();
    const received=this.history.filter(Boolean).length;
    this.current={target:this.target,latencyMs:success?value.latencyMs:null,lossPercent:(this.history.length-received)/this.history.length*100,samples:this.history.length,received,updatedAt:Date.now(),error:success?null:value.error};
  }
  stop() {
    this.stopped=true;clearTimeout(this.deadline);
    const worker=this.worker;this.worker=null;
    if(worker){worker.postMessage({stop:true});setTimeout(()=>worker.terminate(),1500);}
  }
}
