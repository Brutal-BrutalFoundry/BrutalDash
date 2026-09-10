const utf16 = (value: string) => {
  const bytes = new Uint8Array((value.length + 1) * 2);
  const view = new DataView(bytes.buffer);
  for (let index = 0; index < value.length; index++) view.setUint16(index * 2, value.charCodeAt(index), true);
  return bytes;
};

const kernel = Deno.dlopen('kernel32.dll', {
  OpenFileMappingW: { parameters: ['u32', 'u8', 'buffer'], result: 'pointer' },
  MapViewOfFile: { parameters: ['pointer', 'u32', 'u32', 'u32', 'usize'], result: 'pointer' },
  UnmapViewOfFile: { parameters: ['pointer'], result: 'u8' },
  CloseHandle: { parameters: ['pointer'], result: 'u8' },
  GetLastError: { parameters: [], result: 'u32' },
});
const mapping = kernel.symbols.OpenFileMappingW(0x0004, 0, utf16('Global\\HWiNFO_SENS_SM2'));
const mappingError = kernel.symbols.GetLastError();
if (mapping === null) {
  console.log(JSON.stringify({ stage: 'OpenFileMappingW', lastError: mappingError }));
  kernel.close();
  Deno.exit(1);
}
const view = kernel.symbols.MapViewOfFile(mapping, 0x0004, 0, 0, 0);
const viewError = kernel.symbols.GetLastError();
if (view === null) {
  console.log(JSON.stringify({ stage: 'MapViewOfFile', lastError: viewError }));
  kernel.symbols.CloseHandle(mapping);
  kernel.close();
  Deno.exit(2);
}
const buffer = new Deno.UnsafePointerView(view).getArrayBuffer(48);
const bytes = new Uint8Array(buffer);
const fields = new DataView(buffer);
console.log(JSON.stringify({
  stage: 'header', signature: String.fromCharCode(...bytes.slice(0, 4)),
  version: fields.getUint32(4, true), sensorOffset: fields.getUint32(20, true),
  sensorSize: fields.getUint32(24, true), sensorCount: fields.getUint32(28, true),
  readingOffset: fields.getUint32(32, true), readingSize: fields.getUint32(36, true),
  readingCount: fields.getUint32(40, true),
}));
kernel.symbols.UnmapViewOfFile(view);
kernel.symbols.CloseHandle(mapping);
kernel.close();
