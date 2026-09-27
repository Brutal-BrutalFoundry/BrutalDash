import {useRef,useState} from 'react';
import {prepareClockLogo} from './branding';
import './branding.css';

export function BrandingSettings({name,logo,onChange}: {name:string;logo:string|null;onChange:(value:{displayName?:string;clockLogo?:string|null})=>void}) {
  const [busy,setBusy]=useState(false),[error,setError]=useState('');
  const generation=useRef(0);
  return <div className="branding-controls">
    <label><span>Display name</span><input aria-label="Display name" value={name} maxLength={32} placeholder="BrutalDash" onChange={event=>onChange({displayName:event.target.value})} /></label>
    <div className="branding-logo-row"><img src={logo || '/assets/brutalfoundry-icon.jpg'} alt="Clock logo preview" />
      <label><span>{busy ? 'Preparing logo…' : 'Clock logo'}</span><input aria-label="Clock logo" type="file" accept="image/png,image/jpeg,image/webp" disabled={busy} onChange={async event=>{
        const file=event.target.files?.[0];event.target.value='';if(!file)return;
        const token=++generation.current;setBusy(true);setError('');
        try {const clockLogo=await prepareClockLogo(file);if(token===generation.current)onChange({clockLogo});}
        catch(error){if(token===generation.current)setError(error instanceof Error?error.message:'Could not read that image.');}
        finally{if(token===generation.current)setBusy(false);}
      }} /></label>
    </div>
    <small>Shared across all layouts. The name appears in the dashboard header and clock; the logo appears in the dashboard header and on Foundry Digital. Upload an image from the desktop settings. Images are resized automatically.</small>
    {error && <p role="alert">{error}</p>}
    <button type="button" onClick={()=>{generation.current++;setBusy(false);setError('');onChange({displayName:'BrutalDash',clockLogo:null});}}>Restore BrutalDash branding</button>
  </div>;
}
