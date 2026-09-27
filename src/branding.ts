export function displayName(value: unknown): string {
  return typeof value === 'string' ? Array.from(value.replace(/[\u0000-\u001f\u007f]/g,'').trim()).slice(0,32).join('') || 'BrutalDash' : 'BrutalDash';
}

export function clockLogo(value: unknown): string | null {
  return typeof value === 'string' && value.length <= 65536 && /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$/.test(value) ? value : null;
}

export async function prepareClockLogo(file: File): Promise<string> {
  if(!['image/png','image/jpeg','image/webp'].includes(file.type)) throw Error('Choose a PNG, JPG, or WebP image.');
  if(file.size > 5*1024*1024) throw Error('Choose an image smaller than 5 MB.');
  const url=URL.createObjectURL(file);
  try {
    const image=new Image();image.src=url;await image.decode();
    if(!image.naturalWidth || !image.naturalHeight || image.naturalWidth*image.naturalHeight>25000000) throw Error('Choose an image no larger than 25 megapixels.');
    for(const size of [192,128,96]) {
      const scale=Math.min(1,size/Math.max(image.naturalWidth,image.naturalHeight));
      const canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(image.naturalWidth*scale));canvas.height=Math.max(1,Math.round(image.naturalHeight*scale));
      const context=canvas.getContext('2d');if(!context)throw Error('Image conversion is unavailable.');
      context.drawImage(image,0,0,canvas.width,canvas.height);
      const encoded=canvas.toDataURL('image/webp',.88);
      if(clockLogo(encoded))return encoded;
    }
    throw Error('Choose a simpler image so the logo can be stored efficiently.');
  } finally {URL.revokeObjectURL(url);}
}
