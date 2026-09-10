import { cloneLayoutSlots, swapLayoutSlots, type LayoutItem, type LayoutSlot } from '../src/types.ts';

const card = (id: string, x: number, y: number, w: number, h: number, page = 0): LayoutItem => ({
  id, x, y, w, h, page, metric: 'gpuUsage', details: [], hidden: false,
});

const original = [card('gpu', 0, 0, 4, 2), card('vram', 4, 2, 2, 1), card('cpu', 0, 2, 2, 1)];
const swapped = swapLayoutSlots(original, 'vram', 'gpu');
const gpu = swapped.find(item => item.id === 'gpu')!;
const vram = swapped.find(item => item.id === 'vram')!;
const saved: LayoutSlot = { layout: swapped, layoutPreset: 'four', compact: false };
const persisted = JSON.parse(JSON.stringify({ layoutSlots: [saved, null, null, null] })) as { layoutSlots: Array<LayoutSlot | null> };
const restored = cloneLayoutSlots(persisted.layoutSlots)[0]!;
const restoredGpu = restored.layout.find(item => item.id === 'gpu')!;
const restoredVram = restored.layout.find(item => item.id === 'vram')!;
const checks = [
  vram.x === 0 && vram.y === 0 && vram.w === 4 && vram.h === 2,
  gpu.x === 4 && gpu.y === 2 && gpu.w === 2 && gpu.h === 1,
  swapped.find(item => item.id === 'cpu') === original[2],
  swapLayoutSlots(original, 'gpu', 'gpu') === original,
  swapLayoutSlots(original, 'missing', 'gpu') === original,
  restoredVram.x === 0 && restoredVram.y === 0 && restoredVram.w === 4 && restoredVram.h === 2,
  restoredGpu.x === 4 && restoredGpu.y === 2 && restoredGpu.w === 2 && restoredGpu.h === 1,
  restored.layout !== swapped && restored.layout[0] !== swapped[0],
];

if (checks.some(result => !result)) {
  console.error(JSON.stringify({ checks, swapped }));
  Deno.exit(1);
}

console.log(JSON.stringify({ passed: checks.length, failed: 0 }));
