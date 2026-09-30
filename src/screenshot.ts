import type {BridgethingClient} from '@bridgething/client';
export const screenshotHoldMs = 1200;

// No rendering work or background timers until the shortcut is used.
export async function captureDashboard(): Promise<string> {
  const node = document.querySelector<HTMLElement>('main.dashboard');
  if (!node) throw new Error('Dashboard is not ready');
  await document.fonts.ready;
  const {toSvg} = await import('html-to-image');
  const svg = await toSvg(node, {
    width: 800, height: 480, preferredFontFormat: 'woff2',
    filter: element => !(element instanceof HTMLElement && (element.classList.contains('toast') || element.classList.contains('notice') || element.classList.contains('save-notice'))),
  });
  // The renderer deep-clones SVGs without resolving their children's CSS.
  // Resolve it on the detached capture, never changing the live dashboard.
  const documentCopy = new DOMParser().parseFromString(decodeURIComponent(svg.slice(svg.indexOf(',')+1)), 'image/svg+xml');
  const originals = Array.from(node.querySelectorAll('svg *'));
  const copies = Array.from(documentCopy.querySelectorAll('foreignObject svg *'));
  originals.forEach((original, index) => {
    const copy = copies[index]; if (!copy) return;
    const style = getComputedStyle(original);
    copy.setAttribute('style', Array.from(style).map(key => `${key}:${style.getPropertyValue(key)}`).join(';'));
  });
  const serialized = new XMLSerializer().serializeToString(documentCopy);
  const img = new Image();
  await new Promise<void>((resolve,reject) => {img.onload=()=>resolve();img.onerror=()=>reject(new Error('Screenshot rendering failed'));img.src='data:image/svg+xml;charset=utf-8,'+encodeURIComponent(serialized);});
  const canvas=document.createElement('canvas');canvas.width=800;canvas.height=480;
  const context=canvas.getContext('2d');if(!context)throw new Error('Screenshot canvas unavailable');
  context.fillStyle='#05070a';context.fillRect(0,0,800,480);context.drawImage(img,0,0);
  const image=canvas.toDataURL('image/png');
  const encoded = image.slice('data:image/png;base64,'.length);
  if (!image.startsWith('data:image/png;base64,') || encoded.length > 2_800_000) {
    throw new Error('Screenshot is too large');
  }
  return encoded;
}

export function installScreenshotHold(target: Document, capture: () => void, enabled: () => boolean) {
  let held = false, fired = false, hold = 0, release = 0;
  const clear = () => {window.clearTimeout(hold); window.clearTimeout(release); held = false; fired = false;};
  const down = (event: KeyboardEvent) => {
    if ((event.code !== 'Enter' && event.key !== 'Enter') || !enabled()) return;
    if ((event.target as HTMLElement | null)?.closest('input,select,textarea,[contenteditable=true]')) return;
    event.preventDefault(); event.stopImmediatePropagation();
    if (!held) {
      held = true;
      hold = window.setTimeout(() => {if (held && !fired) {fired = true; capture();}}, screenshotHoldMs);
    }
    // Car Thing firmware can deliver repeated keydowns without keyup.
    window.clearTimeout(release);
    release = window.setTimeout(clear, event.repeat ? 350 : 700);
  };
  const up = (event: KeyboardEvent) => {if (held && (event.code === 'Enter' || event.key === 'Enter')) {event.preventDefault(); event.stopImmediatePropagation(); clear();}};
  target.addEventListener('keydown', down, true); target.addEventListener('keyup', up, true);
  window.addEventListener('blur', clear);
  return () => {clear(); target.removeEventListener('keydown', down, true); target.removeEventListener('keyup', up, true); window.removeEventListener('blur', clear);};
}


export async function sendScreenshot(forward: BridgethingClient['forward'], id: string, data: string) {
  let pending: {part:string;index?:number;resolve:()=>void;reject:(error:Error)=>void} | null = null;
  const unsubscribe=forward.onJson(message=>{
    const reply=message as {type?:string;payload?:{id?:string;part?:string;index?:number;ok?:boolean;error?:string}};
    const p=reply?.payload;if(!pending || p?.id!==id)return;
    if(reply.type==='screenshot:result') {
      if(p.ok && pending.part==='end')pending.resolve();
      else if(!p.ok)pending.reject(new Error(p.error || 'Screenshot save failed'));
    } else if(reply.type==='screenshot:ack' && p.part===pending.part && (p.index ?? undefined)===pending.index)pending.resolve();
  });
  const send=(part:string,index?:number,chunk?:string)=>new Promise<void>((resolve,reject)=>{
    const timer=window.setTimeout(()=>{pending=null;reject(new Error('Desktop did not acknowledge the screenshot'));},4000);
    const done=(error?:Error)=>{window.clearTimeout(timer);pending=null;error?reject(error):resolve();};
    pending={part,index,resolve:()=>done(),reject:done};
    void forward.json({type:'screenshot:transfer',payload:{id,part,...(index===undefined?{}:{index}),...(chunk===undefined?{}:{data:chunk})}}).catch(error=>done(error instanceof Error ? error : new Error('Desktop connection lost')));
  });
  try {
    await send('start');
    for(let offset=0,index=0;offset<data.length;offset+=24000,index++) {
      // Stay below the forward-surface burst limit, even on a fast local link.
      await new Promise(resolve=>window.setTimeout(resolve,100));
      await send('chunk',index,data.slice(offset,offset+24000));
    }
    await send('end');
  } finally {unsubscribe();}
}
