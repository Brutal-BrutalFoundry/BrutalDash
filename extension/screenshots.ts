type Sink = {mkdir(path: string, options: {recursive: boolean}): Promise<unknown>; writeFile(path: string, bytes: Uint8Array, options: {createNew: boolean}): Promise<unknown>};
type Transfer = {device: string; id: string; folder: string; chunks: string[]; length: number; expires: number};
export function screenshotFolder(value: string) {
  const folder = value.trim().replace(/\//g, '\\').replace(/([^:])\\+$/, '$1');
  if (!/^[A-Za-z]:\\/.test(folder) && !/^\\\\[^\\]+\\[^\\]+(?:\\|$)/.test(folder)) throw new Error('Choose a full screenshot folder path in desktop settings');
  if (folder.length > 1000 || /[\x00-\x1f<>"|?*]/.test(folder) || folder.slice(2).includes(':') || folder.split('\\').some(part => part === '..' || part === '.')) throw new Error('Invalid screenshot folder');
  return folder;
}

export class ScreenshotWriter {
  private transfer: Transfer | null = null;
  private busy = false;
  async receive(device: string, payload: {id?: unknown; part?: unknown; data?: unknown; index?: unknown}, folder: string, sink: Sink): Promise<string | null> {
    if (typeof payload.id !== 'string' || !/^[a-zA-Z0-9-]{1,80}$/.test(payload.id)) throw new Error('Invalid screenshot request');
    if (this.transfer && this.transfer.expires < Date.now()) this.transfer = null;
    if (payload.part === 'start') {
      if (this.busy || this.transfer) throw new Error('A screenshot is already saving');
      this.transfer = {device, id: payload.id, folder: screenshotFolder(folder), chunks: [], length: 0, expires: Date.now()+20_000};
      return null;
    }
    const item = this.transfer;
    if (!item || item.device !== device || item.id !== payload.id) throw new Error('Screenshot transfer expired');
    if (payload.part === 'chunk') {
      if (!Number.isInteger(payload.index) || payload.index !== item.chunks.length) throw new Error('Screenshot chunk out of sequence');
      if (typeof payload.data !== 'string' || payload.data.length > 24000 || !/^[A-Za-z0-9+/=]+$/.test(payload.data) || item.length + payload.data.length > 2_800_000) {this.transfer = null; throw new Error('Invalid screenshot data');}
      item.chunks.push(payload.data); item.length += payload.data.length;
      return null;
    }
    if (payload.part !== 'end') throw new Error('Invalid screenshot request');
    this.transfer = null; this.busy = true;
    try {
      const raw = atob(item.chunks.join(''));
      const bytes = Uint8Array.from(raw, character => character.charCodeAt(0));
      const signature = [137,80,78,71,13,10,26,10];
      if (bytes.length < 24 || !signature.every((v,i)=>bytes[i]===v)) throw new Error('Invalid screenshot PNG');
      const view = new DataView(bytes.buffer);
      if (view.getUint32(16) !== 800 || view.getUint32(20) !== 480) throw new Error('Unexpected screenshot dimensions');
      const filename = `BrutalDash-${new Date().toISOString().replace(/[:.]/g,'-')}-${crypto.randomUUID().slice(0,8)}.png`;
      await sink.mkdir(item.folder, {recursive: true});
      await sink.writeFile(item.folder+'\\'+filename, bytes, {createNew: true});
      return filename;
    } finally {this.busy = false;}
  }
}
