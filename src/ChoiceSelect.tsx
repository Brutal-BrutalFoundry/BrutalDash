import {Children, isValidElement, useEffect, useId, useRef, useState, type CSSProperties, type ReactNode} from 'react';
import {createPortal} from 'react-dom';
import './choice-select.css';

type Props = {
  value: string | number;
  children: ReactNode;
  onChange: (event: {target: {value: string}}) => void;
  'aria-label'?: string;
  className?: string;
  disabled?: boolean;
};

// Keep the option JSX at call sites, but render choices inside the app instead
// of a browser-owned popup that cannot be controlled or mirrored reliably.
export function ChoiceSelect({value,children,onChange,className,disabled,'aria-label':label='Choose setting'}: Props) {
  const options=Children.toArray(children).filter(isValidElement).map(child=>{
    const props=child.props as {value:string|number;children:ReactNode;disabled?:boolean};
    return {value:String(props.value),label:props.children,disabled:props.disabled};
  });
  const selected=options.find(option=>option.value===String(value));
  const [open,setOpen]=useState(false);
  const [accent,setAccent]=useState('#20f7e5');
  const trigger=useRef<HTMLButtonElement>(null),panel=useRef<HTMLDivElement>(null);
  const id=useId();
  const close=()=>{setOpen(false);trigger.current?.focus({preventScroll:true});};

  useEffect(()=>{
    if(!open)return;
    const root=panel.current!;
    const chosen=root.querySelector<HTMLButtonElement>('[aria-selected="true"]') || root.querySelector<HTMLButtonElement>('[role="option"]:not(:disabled)');
    chosen?.focus({preventScroll:true});chosen?.scrollIntoView({block:'nearest'});
    let search='',searchedAt=0;
    const key=(event:KeyboardEvent)=>{
      if(event.key==='Escape'){event.preventDefault();event.stopImmediatePropagation();close();return;}
      const choices=Array.from(root.querySelectorAll<HTMLButtonElement>('[role="option"]:not(:disabled)'));
      const active=choices.indexOf(document.activeElement as HTMLButtonElement);
      let next:HTMLButtonElement|undefined;
      if(event.key==='ArrowDown'||event.key==='ArrowRight')next=choices[(active+1)%choices.length];
      if(event.key==='ArrowUp'||event.key==='ArrowLeft')next=choices[(active-1+choices.length)%choices.length];
      if(event.key==='Home')next=choices[0];
      if(event.key==='End')next=choices[choices.length-1];
      if(event.key==='Tab'){
        const buttons=Array.from(root.querySelectorAll<HTMLButtonElement>('button:not(:disabled)'));
        const index=buttons.indexOf(document.activeElement as HTMLButtonElement);
        next=buttons[(index+(event.shiftKey?-1:1)+buttons.length)%buttons.length];
      }
      if(event.key.length===1&&event.key!==' '&&!event.ctrlKey&&!event.metaKey&&!event.altKey){
        search=(Date.now()-searchedAt<750?search:'')+event.key.toLowerCase();searchedAt=Date.now();
        next=choices.find(button=>button.textContent?.trim().toLowerCase().startsWith(search));
        event.stopImmediatePropagation();
      }
      if(next){event.preventDefault();next.focus({preventScroll:true});next.scrollIntoView({block:'nearest'});}
    };
    document.addEventListener('keydown',key,true);
    document.addEventListener('brutaldash:close-choices',close);
    return()=>{document.removeEventListener('keydown',key,true);document.removeEventListener('brutaldash:close-choices',close);};
  },[open]);

  return <>
    <button ref={trigger} type="button" data-choice-picker className={`choice-trigger ${className||''}`} aria-label={label} aria-haspopup="dialog" aria-expanded={open} disabled={disabled} onClick={()=>{
      setAccent(getComputedStyle(trigger.current!).getPropertyValue('--accent').trim()||'#20f7e5');setOpen(true);
    }}><span>{selected?.label || 'None'}</span><svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true"><path d="m6 9 6 6 6-6" fill="none" stroke="currentColor" strokeWidth="2" /></svg></button>
    {open && createPortal(<div data-choice-picker className="choice-backdrop" style={{'--choice-accent':accent} as CSSProperties} onClick={event=>{if(event.target===event.currentTarget)close();}}>
      <div ref={panel} className="choice-panel" role="dialog" aria-modal="true" aria-labelledby={id}>
        <div className="choice-heading"><h2 id={id}>{label}</h2><button type="button" aria-label="Close choices" onClick={close}><svg width="24" height="24" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg></button></div>
        <div className="choice-options" role="listbox" aria-label={label}>
          {options.map(option=><button key={option.value} type="button" role="option" aria-selected={option.value===String(value)} disabled={option.disabled} onClick={()=>{onChange({target:{value:option.value}});close();}}><span>{option.label}</span>{option.value===String(value)&&<svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12 4 4L19 6" fill="none" stroke="currentColor" strokeWidth="2" /></svg>}</button>)}
        </div>
      </div>
    </div>,document.body)}
  </>;
}
