import assert from 'node:assert/strict';
import {PeripheralProvider} from '../../extension/peripherals.ts';
import {parsePeripheralSnapshot,peripheralReading} from '../../src/peripherals.ts';
const realNow=Date.now;let now=100000,children=[],warnings=[];
Date.now=()=>now;
globalThis.Deno={build:{os:'windows'},Command:class {
  spawn(){let output,resolve,closed=false;const child={stdin:new WritableStream(),stdout:new ReadableStream({start(c){output=c;}}),stderr:new ReadableStream({start(c){c.close();}}),status:new Promise(r=>resolve=r),killed:false,
    emit(value){output.enqueue(new TextEncoder().encode(value));},kill(){if(!closed){closed=true;this.killed=true;output.close();resolve({code:0});}}};children.push(child);return child;}
}};
const tick=()=>new Promise(r=>setImmediate(r));
try {
 const p=new PeripheralProvider(m=>warnings.push(m));
 p.update(false,now);assert.equal(children.length,0);
 p.update(true,now);assert.equal(children.length,1);
 const device={id:'a'.repeat(24),name:'Mouse',kind:'mouse',source:'logitech',percent:0,estimatePercent:null,charging:false,online:true,state:'',sampledAt:now};
 children[0].emit(JSON.stringify({devices:[device]})+'\n');await tick();assert.equal(p.snapshot().devices[0].percent,0);
 p.update(true,now+500);assert.equal(children.length,1);
 now+=13000;p.update(true,now);assert(children[0].killed);assert.equal(p.snapshot().status,'unavailable');assert.equal(children.length,1);
 now+=59000;p.update(true,now);assert.equal(children.length,1);now+=1001;p.update(true,now);assert.equal(children.length,2);
 children[1].emit('x'.repeat(128001));await tick();assert(children[1].killed);assert.equal(warnings.length,2);
 now+=60001;p.update(true,now);assert.equal(children.length,3);p.stop();assert(children[2].killed);
 assert.equal(parsePeripheralSnapshot({devices:[{...device,percent:101}]} ,now).devices[0].percent,null);
 assert.equal(parsePeripheralSnapshot({devices:[device,device]},now).devices.length,1);
 assert.equal(peripheralReading(device,device.sampledAt+90001).value,'—');
 console.log('PASS: lazy startup, no duplicate process, stalled helper cleanup, bounded retry, oversized output, stop, invalid/duplicate/stale readings');
}finally{Date.now=realNow;delete globalThis.Deno;for(const c of children)c.kill();}
