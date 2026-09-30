import type {LlmSnapshot} from '../src/types';

type JsonObject = Record<string, unknown>;
// Main telemetry polls every 500 ms. A longer cache can completely miss short
// local generations, so only coalesce duplicate reads inside the same tick.
const CACHE_MS = 250;
const REQUEST_TIMEOUT_MS = 250;
let cached: {at: number; key: string; value: LlmSnapshot} | null = null;
type Counters = {promptTokens:number;generatedTokens:number;promptSeconds:number;generationSeconds:number};
const runCounters = new Map<string,{task:number|null;last:Counters;base:Counters;scope:'request'|'session'}>();

const object = (value: unknown): JsonObject | null => value && typeof value === 'object' && !Array.isArray(value) ? value as JsonObject : null;
const number = (value: unknown) => typeof value === 'number' && Number.isFinite(value) ? value : null;
const string = (value: unknown) => typeof value === 'string' && value.trim() ? value.trim() : null;

async function getJson(url: string, apiToken = '') {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: apiToken ? {Authorization: `Bearer ${apiToken}`} : undefined,
    });
    if (!response.ok) return null;
    return await response.json() as unknown;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function getText(url: string, apiToken = '') {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: apiToken ? {Authorization: `Bearer ${apiToken}`} : undefined,
    });
    if (!response.ok) return null;
    return await response.text();
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function unavailable(): LlmSnapshot {
  return {backend:null,backendLabel:null,model:null,status:'unavailable',generationTokensPerSecond:null,promptTokensPerSecond:null,firstTokenSeconds:null,promptTokens:null,generatedTokens:null,contextUsed:null,contextLimit:null,elapsedSeconds:null,message:'Waiting for a supported local LLM backend'};
}

function retainLlmSnapshot(current: LlmSnapshot, previous: LlmSnapshot | null): LlmSnapshot {
  const hasRun = current.status === 'generating' || (current.promptTokens ?? 0)>0 || (current.generatedTokens ?? 0)>0;
  if (hasRun || !previous || previous.status === 'unavailable') return current;
  return {...previous,status:'loaded',message:'Last local request · waiting for next run'};
}

function llamaPorts(customPort = 0) {
  return [...new Set([8080,8095,customPort].filter(port => Number.isInteger(port) && port >= 1 && port <= 65535))];
}

function parseLlamaMetrics(value: unknown) {
  if (typeof value !== 'string') return null;
  const metrics = new Map<string, number>();
  for (const rawLine of value.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const match = line.match(/^([A-Za-z_:][A-Za-z0-9_:]*)(?:\{[^}]*\})?\s+(-?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?)$/);
    if (!match) continue;
    const name = match[1].replace(/^llamacpp[:_]/,'');
    const parsed = Number(match[2]);
    if (Number.isFinite(parsed)) metrics.set(name,(metrics.get(name) || 0)+parsed);
  }
  if (!metrics.size) return null;
  const generatedTokens = metrics.get('tokens_predicted_total') ?? null;
  const generationSeconds = metrics.get('tokens_predicted_seconds_total') ?? null;
  const promptTokens = metrics.get('prompt_tokens_total') ?? null;
  const promptSeconds = metrics.get('prompt_seconds_total') ?? null;
  const liveGenerationSpeed = metrics.get('predicted_tokens_seconds') ?? null;
  const livePromptSpeed = metrics.get('prompt_tokens_seconds') ?? null;
  return {
    generationTokensPerSecond: liveGenerationSpeed && liveGenerationSpeed > 0 ? liveGenerationSpeed : generatedTokens !== null && generationSeconds && generationSeconds > 0 ? generatedTokens/generationSeconds : null,
    promptTokensPerSecond: livePromptSpeed && livePromptSpeed > 0 ? livePromptSpeed : promptTokens !== null && promptSeconds && promptSeconds > 0 ? promptTokens/promptSeconds : null,
    generatedTokens,
    promptTokens,
    promptSeconds,
    generationSeconds,
    requestsProcessing: metrics.get('requests_processing') ?? 0,
  };
}

function parseLlama(slotsValue: unknown, propsValue: unknown, metricsValue: unknown = null): LlmSnapshot | null {
  if (!Array.isArray(slotsValue)) return null;
  const slots = slotsValue.map(object).filter((slot): slot is JsonObject => Boolean(slot));
  const active = slots.find(slot => slot.is_processing === true) || [...slots].sort((left,right) => {
    const score = (slot: JsonObject) => (number(slot.id_task) !== null ? 1_000_000+(number(slot.id_task) || 0)*100_000 : 0)
      + (number(slot.n_prompt_tokens) ?? number(slot.tokens_evaluated) ?? 0)
      + (number(slot.id) ?? 0);
    return score(right)-score(left);
  })[0];
  if (!active) return null;
  const props = object(propsValue);
  const settings = object(props?.default_generation_settings);
  const rawNext = Array.isArray(active.next_token) ? active.next_token.map(object).find(Boolean) : object(active.next_token);
  const next = rawNext || null;
  const timings = object(active?.timings);
  const contextLimit = number(active?.n_ctx) ?? number(settings?.n_ctx);
  const metrics = parseLlamaMetrics(metricsValue);
  const slotGenerated = number(next?.n_decoded) ?? number(timings?.predicted_n);
  const slotContext = number(active?.n_prompt_tokens);
  const generated = slotGenerated !== null && slotGenerated > 0 ? slotGenerated : metrics?.generatedTokens ?? slotGenerated;
  const prompt = metrics?.promptTokens ?? slotContext ?? number(active?.tokens_evaluated) ?? number(timings?.prompt_n);
  const generationSpeed = number(timings?.predicted_per_second) ?? metrics?.generationTokensPerSecond ?? null;
  const promptSpeed = number(timings?.prompt_per_second) ?? metrics?.promptTokensPerSecond ?? null;
  const modelPath = string(props?.model_path);
  const model = modelPath?.split(/[\\/]/).pop() || null;
  const processing = active?.is_processing === true || Boolean(metrics?.requestsProcessing);
  const hasTask = number(active.id_task) !== null;
  const contextUsed = slotContext ?? (prompt !== null || generated !== null ? (prompt || 0)+(generated || 0) : null);
  return {backend:'llamacpp',backendLabel:'llama.cpp',model,status:processing?'generating':'loaded',generationTokensPerSecond:generationSpeed,promptTokensPerSecond:promptSpeed,firstTokenSeconds:null,promptTokens:prompt,generatedTokens:generated,contextUsed,contextLimit,elapsedSeconds:null,message:processing?'Generating locally':hasTask?'Last local request completed':'Model loaded · waiting for a request'};
}

function trackLlamaRun(key:string,slots:unknown,props:unknown,text:unknown):LlmSnapshot|null {
  let snapshot=parseLlama(slots,props,text);
  const metrics=parseLlamaMetrics(text);
  if(!snapshot||!metrics||metrics.promptTokens===null||metrics.generatedTokens===null||metrics.promptSeconds===null||metrics.generationSeconds===null)return snapshot;
  const objects=Array.isArray(slots)?slots.map(object).filter((s):s is JsonObject=>Boolean(s)):[];
  const tasks=objects.map(s=>number(s.id_task)).filter((n):n is number=>n!==null);
  const task=tasks.length?Math.max(...tasks):null;
  const totals={promptTokens:metrics.promptTokens,generatedTokens:metrics.generatedTokens,promptSeconds:metrics.promptSeconds,generationSeconds:metrics.generationSeconds};
  const old=runCounters.get(key);
  const reset=old&&(totals.promptTokens<old.last.promptTokens||totals.generatedTokens<old.last.generatedTokens);
  const zero={promptTokens:0,generatedTokens:0,promptSeconds:0,generationSeconds:0};
  let base=old&&!reset?old.base:zero;
  let scope=old&&!reset?old.scope:'session' as 'request'|'session';
  if(old&&!reset&&task!==null&&task!==old.task){base=old.last;scope='request';}
  if(objects.filter(s=>s.is_processing===true).length>1){base=zero;scope='session';}
  const delta={promptTokens:totals.promptTokens-base.promptTokens,generatedTokens:totals.generatedTokens-base.generatedTokens,promptSeconds:totals.promptSeconds-base.promptSeconds,generationSeconds:totals.generationSeconds-base.generationSeconds};
  if(runCounters.size>8&&!runCounters.has(key))runCounters.delete(runCounters.keys().next().value!);
  runCounters.set(key,{task,last:totals,base,scope});
  snapshot={...snapshot,metricsScope:scope,promptTokens:delta.promptTokens,generatedTokens:delta.generatedTokens,generationTokensPerSecond:delta.generationSeconds>0?delta.generatedTokens/delta.generationSeconds:null,promptTokensPerSecond:delta.promptSeconds>0?delta.promptTokens/delta.promptSeconds:null};
  return snapshot;
}

function parseOllama(value: unknown): LlmSnapshot | null {
  const root = object(value);
  if (!root || !Array.isArray(root.models) || root.models.length === 0) return null;
  const model = object(root.models[0]);
  const name = string(model?.name) ?? string(model?.model);
  return {backend:'ollama',backendLabel:'Ollama',model:name,status:'loaded',generationTokensPerSecond:null,promptTokensPerSecond:null,firstTokenSeconds:null,promptTokens:null,generatedTokens:null,contextUsed:null,contextLimit:null,elapsedSeconds:null,message:'Model loaded · Ollama does not expose other clients’ live token timing'};
}

function parseLmStudio(value: unknown): LlmSnapshot | null {
  const root = object(value);
  const rawModels = Array.isArray(root?.models) ? root.models : Array.isArray(value) ? value : [];
  const models = rawModels.map(object).filter((model): model is JsonObject => Boolean(model));
  const loaded = models.find(model => model.status === 'loaded' || model.loaded === true || Array.isArray(model.loaded_instances) && model.loaded_instances.length > 0) || models[0];
  if (!loaded) return null;
  const model = string(loaded.display_name) ?? string(loaded.id) ?? string(loaded.key) ?? string(loaded.model);
  const instances = Array.isArray(loaded.loaded_instances) ? loaded.loaded_instances.map(object).filter(Boolean) as JsonObject[] : [];
  const instance = instances[0];
  const contextLimit = number(instance?.context_length) ?? number(loaded.max_context_length);
  return {backend:'lmstudio',backendLabel:'LM Studio',model,status:'loaded',generationTokensPerSecond:null,promptTokensPerSecond:null,firstTokenSeconds:null,promptTokens:null,generatedTokens:null,contextUsed:null,contextLimit,elapsedSeconds:null,message:'Model loaded · live timing appears when the backend exposes it'};
}

export async function readLlmSnapshot(now = Date.now(), customLlamaPort = 0, apiToken = ''): Promise<LlmSnapshot> {
  const ports = llamaPorts(customLlamaPort);
  const token = apiToken.trim();
  const key = `${ports.join(',')}|${token}`;
  if (cached && cached.key === key && now-cached.at < CACHE_MS) return cached.value;
  const [llamaResults,ollama,lmStudio] = await Promise.all([
    Promise.all(ports.map(async port => {
      const [slots,props,metrics] = await Promise.all([
        getJson(`http://127.0.0.1:${port}/slots`,token),
        getJson(`http://127.0.0.1:${port}/props`,token),
        getText(`http://127.0.0.1:${port}/metrics`,token),
      ]);
      return {port,slots,props,metrics};
    })),
    getJson('http://127.0.0.1:11434/api/ps'),
    getJson('http://127.0.0.1:1234/api/v1/models'),
  ]);
  const llamaCandidates = llamaResults.flatMap(({port,slots,props,metrics}) => {
    const parsed = trackLlamaRun(`${key}|${port}|${string(object(props)?.model_path)||''}`,slots,props,metrics);
    return parsed ? [{...parsed,backendLabel:`llama.cpp · ${port}`}] : [];
  });
  const candidates = [...llamaCandidates,parseLmStudio(lmStudio),parseOllama(ollama)].filter((item): item is LlmSnapshot => Boolean(item));
  const value = candidates.find(item => item.status === 'generating') || candidates[0] || unavailable();
  cached = {at:now,key,value};
  return value;
}

export const __llmTest = {parseLlama,parseLlamaMetrics,parseLmStudio,parseOllama,llamaPorts,retainLlmSnapshot,trackLlamaRun};
export {retainLlmSnapshot};
