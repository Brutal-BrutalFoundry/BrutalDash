import { PresentMonProvider, type PresentMonMetrics } from '../extension/presentmon.ts';

const target = Deno.args[0] || 'ChatGPT.exe';
const provider = new PresentMonProvider({
  info: message => console.error(message),
  warn: message => console.error(message),
});

let metrics: PresentMonMetrics | null = null;
try {
  provider.updateTarget(target);
  for (let attempt = 0; attempt < 12; attempt += 1) {
    await new Promise(resolve => setTimeout(resolve, 500));
    metrics = provider.snapshot();
    if (metrics) break;
  }
} finally {
  provider.stop();
}

if (!metrics) {
  console.error(`No native frame metrics arrived for ${target}`);
  Deno.exit(1);
}

console.log(JSON.stringify({ target, ...metrics }));
