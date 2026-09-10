import {
  cloneLayoutProfiles,
  clonePresetLayout,
  layoutForPreset,
  withLayoutProfile,
  type LayoutProfiles,
} from '../src/types.ts';

// Regression coverage for the failure users actually see: a custom workspace
// must survive a layout switch and a complete JSON storage round-trip.
const customizedFour = clonePresetLayout('four');
customizedFour[0] = { ...customizedFour[0], x: 3, y: 4, w: 2, h: 1 };

let profiles: LayoutProfiles = withLayoutProfile({}, 'four', customizedFour);
const firstSix = layoutForPreset(profiles, 'six');
const customizedSix = firstSix.map((card, index) => index === 0 ? { ...card, hidden: true } : card);
profiles = withLayoutProfile(profiles, 'six', customizedSix);

const restored = cloneLayoutProfiles(JSON.parse(JSON.stringify(profiles)) as LayoutProfiles);
const restoredFour = layoutForPreset(restored, 'four');
const restoredSix = layoutForPreset(restored, 'six');
restoredFour[0].x = 0;

const checks = [
  firstSix.length === clonePresetLayout('six').length,
  firstSix[0].id === 'gpu' && firstSix[0].x === 0,
  restoredFour[0].y === 4 && restoredFour[0].w === 2 && restoredFour[0].h === 1,
  restoredSix[0].hidden === true,
  restored.four?.[0].x === 3,
  restored.six?.[0] !== customizedSix[0],
];

if (checks.some(result => !result)) {
  console.error(JSON.stringify({ checks, restored }));
  Deno.exit(1);
}

console.log(JSON.stringify({ passed: checks.length, failed: 0 }));
