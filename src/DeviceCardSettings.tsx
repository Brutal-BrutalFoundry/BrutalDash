import './device-card-settings.css';
import {ChoiceSelect} from './ChoiceSelect';
import type {LayoutItem} from './types';
export function DeviceCardSettings({item,onChange}:{item:LayoutItem;onChange:(patch:Partial<LayoutItem>)=>void}) {
  return <div className="device-card-settings">
    <label>Devices view<ChoiceSelect aria-label={`Devices view for ${item.id}`} value={item.deviceView||'grid'} onChange={e=>onChange({deviceView:e.target.value as LayoutItem['deviceView']})}><option value="grid">Ring grid</option><option value="rows">Device list</option><option value="focus">Single device</option></ChoiceSelect></label>
    <label>Icons<ChoiceSelect aria-label={`Device icons for ${item.id}`} value={item.deviceIcons||'solid'} onChange={e=>onChange({deviceIcons:e.target.value as LayoutItem['deviceIcons']})}><option value="solid">Solid</option><option value="outline">Outline</option></ChoiceSelect></label>
    <label><input type="checkbox" checked={item.devicePulse!==false} onChange={e=>onChange({devicePulse:e.target.checked})}/> Pulse while charging</label>
    <label><input type="checkbox" checked={item.deviceEstimates!==false} onChange={e=>onChange({deviceEstimates:e.target.checked})}/> Show time estimates</label>
  </div>;
}
export function deviceCardOptions(item:Partial<LayoutItem>):Partial<LayoutItem> {
  return {deviceOrder:Array.isArray(item.deviceOrder)?[...new Set(item.deviceOrder.filter(id=>typeof id==='string'&&/^[a-f0-9]{24}$/.test(id)))].slice(0,64):[],deviceView:item.deviceView==='rows'||item.deviceView==='focus'?item.deviceView:'grid',deviceIcons:item.deviceIcons==='outline'?'outline':'solid',devicePulse:item.devicePulse!==false,deviceEstimates:item.deviceEstimates!==false};
}
