import {BatteryEstimator} from './battery-estimator.ts';
import {parsePeripheralSnapshot, type PeripheralSnapshot} from '../src/peripherals.ts';

type Child = {stdin:WritableStream<Uint8Array>;stdout:ReadableStream<Uint8Array>;stderr:ReadableStream<Uint8Array>;status:Promise<unknown>;kill():void};
type Runtime = {build:{os:string};Command:new(command:string,options:object)=>{spawn():Child}};
export class PeripheralProvider {
  private child: Child | null = null;
  private latest: PeripheralSnapshot = {devices:[],status:'starting',receivedAt:0};
  private retryAt = 0;
  private lastOutput = 0;
  private keepUntil = 0;
  private failures = 0;
  private estimator=new BatteryEstimator();
  private loaded:Promise<void>;
  private writing:Promise<void>=Promise.resolve();
  private lastSaved=0;
  constructor(private warn:(message:string)=>void,private storage?:{get():Promise<unknown>;set(value:unknown):Promise<unknown>}) {
    this.loaded=storage?storage.get().then(v=>{this.estimator.load(v);}).catch(()=>{warn('Battery history could not load');}):Promise.resolve();
  }
  async flush() {
    await this.loaded;
    if(!this.storage)return Promise.resolve();
    const value=this.estimator.export();
    this.writing=this.writing.then(()=>this.storage!.set(value)).then(()=>{}).catch(()=>{this.warn('Battery history could not save');});
    return this.writing;
  }
  snapshot(): PeripheralSnapshot {
    return !this.child && this.latest.receivedAt ? {...this.latest,status:'unavailable'} : this.latest;
  }
  update(enabled:boolean, now=Date.now()) {
    if (enabled) this.keepUntil=now+30_000;
    if (!enabled && now>=this.keepUntil) {this.stop();return;}
    if (this.child && now-this.lastOutput>12_000) this.failed(this.child,'Battery helper stopped responding');
    if (this.child || now<this.retryAt) return;
    const deno=(globalThis as typeof globalThis & {Deno?:Runtime}).Deno;
    if (deno?.build.os!=='windows') return;
    try {
      const executable=decodeURIComponent(new URL('./vendor/battery-host/BrutalDashBatteryHost.exe',import.meta.url).pathname).replace(/^\/([A-Za-z]:)/,'$1').replace(/\//g,'\\');
      const child=new deno.Command(executable,{args:[],stdin:'piped',stdout:'piped',stderr:'piped'}).spawn();
      this.child=child;this.lastOutput=now;
      void this.read(child);
      void child.stderr.pipeTo(new WritableStream({write(){}})).catch(()=>{});
      void child.status.then(()=>{if(this.child===child)this.failed(child,'Battery helper exited');}).catch(()=>{if(this.child===child)this.failed(child,'Battery helper failed');});
    } catch {this.retryAt=now+60_000;this.latest={...this.latest,status:'unavailable'};this.warn('Battery helper could not start');}
  }
  private async read(child:Child) {
    const reader=child.stdout.getReader(),decoder=new TextDecoder();let pending='';
    try {
      await this.loaded;
      while(this.child===child) {
        const {done,value}=await reader.read();if(done)break;
        pending+=decoder.decode(value,{stream:true});
        if(pending.length>128_000)throw Error('Oversized battery payload');
        let end:number;
        while((end=pending.indexOf('\n'))>=0) {
          const line=pending.slice(0,end);pending=pending.slice(end+1);
          const snapshot=parsePeripheralSnapshot(JSON.parse(line));
          if(snapshot && this.child===child) {this.latest=this.estimator.update(snapshot);this.lastOutput=Date.now();if(this.lastOutput-this.lastSaved>=60000){this.lastSaved=this.lastOutput;void this.flush();}}
        }
      }
    } catch {if(this.child===child)this.failed(child,'Battery helper output unavailable');}
    finally{reader.releaseLock();}
  }
  private failed(child:Child,message:string) {
    if(this.child!==child)return;
    this.stop();this.failures++;
    this.retryAt=Date.now()+(this.failures>=3?300_000:60_000);
    this.latest={...this.latest,status:'unavailable'};
    this.warn(message);
  }
  stop() {
    const child=this.child;this.child=null;
    if(child){void child.stdin.close().catch(()=>{});try{child.kill();}catch{}}
  }
}

