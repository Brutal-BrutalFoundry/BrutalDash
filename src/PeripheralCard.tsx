import {useEffect,useRef,useState,type PointerEvent} from 'react';
import type {LayoutItem} from './types';
import {batterySummary,peripheralReading,type PeripheralSnapshot} from './peripherals';
import './peripherals.css';

function DeviceIcon({kind,solid}:{kind:string;solid:boolean}) {
  if(solid) return <svg viewBox="0 0 48 48" aria-hidden="true" fill="currentColor">
    {kind==='mouse'?<path d="M22 4a12 12 0 00-10 12v4h10ZM26 4v16h10v-4A12 12 0 0026 4ZM12 24v8a12 12 0 0024 0v-8Z"/>:
    kind==='keyboard'?<path fillRule="evenodd" d="M6 11h36a4 4 0 014 4v20a4 4 0 01-4 4H6a4 4 0 01-4-4V15a4 4 0 014-4Zm2 6v4h4v-4Zm8 0v4h4v-4Zm8 0v4h4v-4Zm8 0v4h4v-4ZM8 25v4h4v-4Zm8 0v4h4v-4Zm8 0v4h4v-4Zm8 0v4h8v-4ZM12 33v3h24v-3Z"/>:
    kind==='headset'?<><path d="M7 23a17 17 0 0134 0h-6a11 11 0 00-22 0Z"/><rect x="6" y="24" width="10" height="17" rx="4"/><rect x="32" y="24" width="10" height="17" rx="4"/></>:
    kind==='gamepad'?<path fillRule="evenodd" d="M14 12h20c9 0 14 27 7 29-5 1-9-9-12-9H19c-3 0-7 10-12 9-7-2-2-29 7-29Zm0 7v4h-4v3h4v4h3v-4h4v-3h-4v-4Zm16 1v4h4v-4Zm6 6v4h4v-4Z"/>:<path d="M5 13h34v22H5ZM41 20h4v8h-4Z"/>}
  </svg>;
  return <svg viewBox="0 0 48 48" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    {kind==='mouse'?<><rect x="12" y="5" width="24" height="38" rx="12"/><path d="M24 6v12M12 21h24"/></>:
    kind==='keyboard'?<><rect x="3" y="11" width="42" height="27" rx="4"/><path d="M10 19h2m6 0h2m6 0h2m6 0h2M10 26h2m6 0h2m6 0h2m6 0h2M14 32h20"/></>:
    kind==='headset'?<><path d="M7 27v-5a17 17 0 0134 0v5"/><rect x="5" y="23" width="8" height="17" rx="3"/><rect x="35" y="23" width="8" height="17" rx="3"/></>:
    kind==='gamepad'?<><path d="M14 14h20c8 0 12 23 6 24-4 1-8-7-10-7H18c-2 0-6 8-10 7-6-1-2-24 6-24Z"/><path d="M15 19v10m-5-5h10m12-3h1m4 5h1"/></>:
    <><rect x="6" y="13" width="33" height="22" rx="4"/><path d="M42 20v8M12 20v8m6-8v8m6-8v8"/></>}
  </svg>;
}

export function PeripheralCard({item,snapshot,dragging,holding,dropTarget,onPointerDown,onChange}:{
  item:LayoutItem;snapshot?:PeripheralSnapshot;dragging:boolean;holding:boolean;dropTarget:boolean;
  onPointerDown:(event:PointerEvent<HTMLElement>)=>void;
  onChange:(patch:Partial<LayoutItem>)=>void;
}) {
  const [page,setPage]=useState(0),[now,setNow]=useState(Date.now());
  const cardRef=useRef<HTMLElement|null>(null);
  const itemsRef=useRef<HTMLDivElement|null>(null);
  const motion=useRef<Animation|null>(null);
  useEffect(()=>()=>{motion.current?.cancel();},[]);
  const swipe=useRef<{x:number;y:number;time:number;pointerId:number}|null>(null);
  const order=item.deviceOrder??[];
  const devices=[...(snapshot?.devices??[])].sort((a,b)=>{const ai=order.indexOf(a.id),bi=order.indexOf(b.id);return (ai<0?64:ai)-(bi<0?64:bi);});
  const tileGesture=useRef<{id:string;x:number;y:number;pointer:number;ready:boolean;timer:ReturnType<typeof setTimeout>;cue:ReturnType<typeof setTimeout>;edge?:ReturnType<typeof setTimeout>}|null>(null);
  const [tileDrag,setTileDrag]=useState<{source:string;target:string|null;ready:boolean}|null>(null);
  const cancelTile=()=>{const g=tileGesture.current;if(g){clearTimeout(g.timer);clearTimeout(g.cue);clearTimeout(g.edge);}tileGesture.current=null;setTileDrag(null);};
  useEffect(()=>{const cancel=()=>cancelTile();window.addEventListener('blur',cancel);return()=>{window.removeEventListener('blur',cancel);const g=tileGesture.current;if(g){clearTimeout(g.timer);clearTimeout(g.cue);clearTimeout(g.edge);}};},[]);
  const tileDown=(event:PointerEvent<HTMLDivElement>,id:string)=>{
    if(!large||!event.isPrimary||event.button!==0)return;
    event.stopPropagation();event.preventDefault();cancelTile();
    event.currentTarget.setPointerCapture(event.pointerId);
    swipe.current={x:event.clientX,y:event.clientY,time:Date.now(),pointerId:event.pointerId};
    const gesture={id,x:event.clientX,y:event.clientY,pointer:event.pointerId,ready:false,cue:setTimeout(()=>{if(tileGesture.current===gesture)setTileDrag({source:id,target:null,ready:false});},500),timer:setTimeout(()=>{if(tileGesture.current!==gesture)return;gesture.ready=true;swipe.current=null;setTileDrag({source:id,target:null,ready:true});},1500)};
    tileGesture.current=gesture;
  };
  const tileMove=(event:PointerEvent<HTMLDivElement>)=>{
    const g=tileGesture.current;if(!g||g.pointer!==event.pointerId)return;
    event.stopPropagation();
    if(!g.ready){if(Math.hypot(event.clientX-g.x,event.clientY-g.y)>16)cancelTile();return;}
    const article=event.currentTarget.closest('article')!;
    const target=document.elementFromPoint(event.clientX,event.clientY)?.closest<HTMLElement>('[data-device-id]');
    const id=target&&article.contains(target)?target.dataset.deviceId??null:null;
    setTileDrag(old=>old?.target===id?old:{source:g.id,target:id,ready:true});
    const bounds=article.getBoundingClientRect();const direction=event.clientY<bounds.top+28?-1:event.clientY>bounds.bottom-28?1:0;
    if(direction&&count>1&&event.clientX>=bounds.left&&event.clientX<=bounds.right){if(!g.edge)g.edge=setTimeout(()=>{if(tileGesture.current===g)setPage(p=>(p+direction+count)%count);g.edge=undefined;},600);}else{clearTimeout(g.edge);g.edge=undefined;}
  };
  const tileUp=(event:PointerEvent<HTMLDivElement>)=>{
    const g=tileGesture.current;if(!g||g.pointer!==event.pointerId)return;
    if(g.ready){
      event.stopPropagation();
      const article=event.currentTarget.closest('article')!;
      const target=document.elementFromPoint(event.clientX,event.clientY)?.closest<HTMLElement>('[data-device-id]');
      const targetId=target&&article.contains(target)?target.dataset.deviceId:null;
      if(targetId&&targetId!==g.id){const next=[...new Set([...order,...devices.map(d=>d.id)])].slice(-64);const a=next.indexOf(g.id),b=next.indexOf(targetId);if(a>=0&&b>=0){[next[a],next[b]]=[next[b],next[a]];onChange({deviceOrder:next});}}
    }
    cancelTile();
  };
  const large=item.w>=5&&item.h>=3;
  const view=large?(item.deviceView||'grid'):'focus';
  const perPage=large&&view!=='focus'?3:1;
  const count=Math.max(1,Math.ceil(devices.length/perPage));
  const current=Math.min(page,count-1);

  useEffect(()=>{const timer=setInterval(()=>setNow(Date.now()),5000);return()=>clearInterval(timer);},[]);
  useEffect(()=>setPage(0),[item.id,perPage]);
  useEffect(()=>{
    // Capture phase also sees touches captured by the outer dashboard or tiles.
    // Move only this card's compositor layer; do not rerender telemetry per move.
    const move=(event:globalThis.PointerEvent)=>{
      const start=swipe.current,el=itemsRef.current;
      if(!start||start.pointerId!==event.pointerId||dragging||!el||count<2)return;
      const dx=event.clientX-start.x,dy=event.clientY-start.y;
      if(Math.abs(dy)<8||Math.abs(dy)<Math.abs(dx)*1.1)return;
      motion.current?.cancel();
      el.style.transform=`translateY(${Math.max(-80,Math.min(80,dy*.7))}px)`;
    };
    const settle=(from:string)=>{
      const el=itemsRef.current;if(!el)return;
      el.style.transform='';motion.current?.cancel();
      if(!window.matchMedia('(prefers-reduced-motion: reduce)').matches)motion.current=el.animate([{transform:from},{transform:'translateY(0)'}],{duration:160,easing:'ease-out'});
    };
    const finish=(event:globalThis.PointerEvent)=>{
      const start=swipe.current;if(!start||start.pointerId!==event.pointerId)return;
      swipe.current=null;if(dragging){settle('translateY(0)');return;}
      const dx=event.clientX-start.x,dy=event.clientY-start.y;
      const threshold=Math.min(26,Math.max(14,(cardRef.current?.clientHeight??150)*.14));
      const flick=Date.now()-start.time<250&&Math.abs(dy)>=12;
      if(count>1&&(Math.abs(dy)>=threshold||flick)&&Math.abs(dy)>Math.abs(dx)*1.1){setPage((current+(dy<0?1:-1)+count)%count);settle(`translateY(${dy<0?24:-24}px)`);}
      else settle(itemsRef.current?.style.transform||'translateY(0)');
    };
    const cancel=()=>{swipe.current=null;settle(itemsRef.current?.style.transform||'translateY(0)');};
    window.addEventListener('pointermove',move,true);window.addEventListener('pointerup',finish,true);window.addEventListener('pointercancel',cancel,true);window.addEventListener('blur',cancel);
    return()=>{window.removeEventListener('pointermove',move,true);window.removeEventListener('pointerup',finish,true);window.removeEventListener('pointercancel',cancel,true);window.removeEventListener('blur',cancel);};
  },[current,count,dragging]);
  return <article ref={cardRef} tabIndex={count>1?0:-1} onKeyDown={event=>{if(event.target===event.currentTarget&&(event.key==="ArrowUp"||event.key==="ArrowDown")){event.preventDefault();event.stopPropagation();setPage((current+(event.key==="ArrowDown"?1:-1)+count)%count);}}} data-card-id={item.id} className={`metric-card peripheral-card ${item.h>1?"hero-card":"row-card"} ${large?'peripheral-large':'peripheral-single'} view-${view} ${item.devicePulse!==false?'allow-pulse':''} ${item.deviceEstimates!==false?'show-estimates':''}${item.h===1?' peripheral-short':''}${item.w<=3?' peripheral-narrow':''}${holding?' is-holding':''}${dragging?' drag-source':''}${dropTarget?' drop-target':''}`}
    style={{gridColumn:`${item.x+1} / span ${Math.min(item.w,6-item.x)}`,gridRow:`${item.y+1} / span ${item.h}`}}
    onPointerDown={event=>{if(event.isPrimary&&event.button===0)swipe.current={x:event.clientX,y:event.clientY,time:Date.now(),pointerId:event.pointerId};onPointerDown(event);}}
    onPointerCancel={()=>{swipe.current=null;}} onDragStart={event=>event.preventDefault()} draggable={false}>
    {(holding||dragging)&&<div className="card-hold-progress" role="status"><span>{holding?'HOLD TO PICK UP':'DRAG TO SWAP'}</span>{holding&&<i/>}</div>}
    <header className="peripheral-heading"><strong className="metric-title">Device Battery</strong>{large&&<nav className="device-view-switch" aria-label="Devices view" onPointerDown={event=>event.stopPropagation()}>{(['grid','rows','focus'] as const).map(value=><button key={value} aria-pressed={view===value} onClick={()=>{if(view!==value)onChange({deviceView:value});}}>{value==='grid'?'Grid':value==='rows'?'List':'Single'}</button>)}</nav>}<span>{large?`${devices.length} detected${count>1?` · ${current+1} / ${count}`:""}`:count>1?`${current+1} / ${count}`:""}</span></header>
    <div className="peripheral-items" ref={itemsRef}>
      {devices.slice(current*perPage,(current+1)*perPage).map(device=>{
        const reading=peripheralReading(device,now);
        const unavailable=snapshot?.status==='unavailable';
        const available=!unavailable&&reading.level!==null;
        const band=!available?'unknown':reading.level!>=80?'high':reading.level!>=40?'medium':reading.level!>=20?'low':'critical';
        const state=!available?'unavailable':device.charging?'charging':reading.level===100?'charged':reading.level!<=10?'critical':reading.level!<=20?'low':'normal';
        return <div key={device.id} data-device-id={device.id} className={`peripheral-tile state-${state} level-${band}${tileDrag?.source===device.id?' tile-held':''}${tileDrag?.ready&&tileDrag.target===device.id&&tileDrag.source!==device.id?' tile-drop':''}`}
          onPointerDown={event=>tileDown(event,device.id)} onPointerMove={tileMove} onPointerUp={tileUp} onPointerCancel={cancelTile}>
          {tileDrag?.source===device.id&&<div className="tile-drag-label"><span>{tileDrag.ready?'DRAG TO SWAP':'HOLD TO PICK UP'}</span>{!tileDrag.ready&&<i/>}</div>}
          <div className="peripheral-icon">
            <svg className="battery-ring" viewBox="0 0 120 120" aria-hidden="true"><circle cx="60" cy="60" r="52"/><circle className="battery-arc" cx="60" cy="60" r="52" pathLength="100" strokeDasharray={`${available?reading.level:0} 100`} transform="rotate(-90 60 60)"/></svg>
            <div className="device-glyph"><DeviceIcon kind={device.kind} solid={item.deviceIcons!=='outline'}/></div>
          </div>
          <div className="peripheral-name" title={device.name}>{device.name}</div>
          <div className="peripheral-value metric-main">{unavailable?'—':reading.value}<small>{unavailable?'':reading.unit}</small></div>
          <div className="peripheral-status">{unavailable?'Reading unavailable':batterySummary(device,now,item.deviceEstimates!==false)}</div>
          <div className="peripheral-meter"><i style={{width:`${unavailable?0:reading.level??0}%`}}/></div>
        </div>;
      })}
      {!devices.length&&<div className="peripheral-empty">{!snapshot||snapshot.status==='starting'?'Looking for devices…':snapshot.status==='unavailable'?'Battery reader unavailable':'No supported devices connected'}<small>Wireless mice, keyboards, headsets and controllers</small></div>}
    </div>
  </article>;
}
