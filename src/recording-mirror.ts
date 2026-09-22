import type { BridgethingClient } from "@bridgething/client";

const MIRROR_WIDTH = 800;
const MIRROR_HEIGHT = 480;
const MIRROR_URL = "ws://127.0.0.1:8894/";

type MirrorInput =
  | {
      kind: "pointer";
      eventType: "pointerdown" | "pointermove" | "pointerup" | "pointercancel" | "click";
      x: number;
      y: number;
      pointerId: number;
      pointerType: string;
      button: number;
      buttons: number;
    }
  | {
      kind: "key";
      eventType: "keydown" | "keyup";
      key: string;
      code: string;
      repeat: boolean;
    }
  | {
      kind: "wheel";
      x: number;
      y: number;
      deltaX: number;
      deltaY: number;
      deltaMode: number;
    }
  | {
      kind: "form";
      eventType: "input" | "change";
      path: number[];
      value: string;
      checked: boolean;
    }
  | {
      kind: "scroll";
      path: number[];
      scrollLeft: number;
      scrollTop: number;
    };

type JsonListener = (message: unknown) => void;

const noopRemove = () => undefined;
const ok = () => Promise.resolve({ ok: true });
const unavailable = () => Promise.resolve({ ok: false });

export function isRecordingMirror() {
  return new URLSearchParams(window.location.search).get("recordingMirror") === "1";
}

export class RecordingMirrorClient {
  private readonly listeners = new Set<JsonListener>();
  private readonly queued: unknown[] = [];
  private readonly pointerTargets = new Map<number, Element>();
  private socket: WebSocket | null = null;
  private stopped = false;

  readonly forward = {
    onJson: (listener: JsonListener) => {
      this.listeners.add(listener);
      return () => this.listeners.delete(listener);
    },
    json: (message: unknown) => {
      const type = message && typeof message === "object" && "type" in message
        ? (message as { type?: unknown }).type
        : null;
      // The physical device already performs user-triggered saves and media
      // commands. The recorder asks only for initial state and media updates,
      // preventing a mirrored click from executing a command twice.
      if (type === "dashboard:get" || type === "media:subscribe") this.send(message);
      return Promise.resolve();
    },
  };

  readonly doc = { set: ok };
  readonly webapp = { onWebappInstalled: () => noopRemove };
  readonly hardware = {
    onBrightnessChanged: () => noopRemove,
    stateGet: () => Promise.resolve({
      ok: true,
      response: { state: { brightness: { effectiveLevel: 1 } } },
    }),
    displaySetMode: ok,
    displaySetLevel: ok,
  };
  readonly player = {
    onSnapshot: () => noopRemove,
    stateGet: unavailable,
    skipPrev: unavailable,
    pause: unavailable,
    resume: unavailable,
    skipNext: unavailable,
  };
  readonly asset = { get: unavailable };

  constructor() {
    this.connect();
  }

  close() {
    this.stopped = true;
    this.socket?.close();
    this.socket = null;
  }

  private connect() {
    if (this.stopped) return;
    const socket = new WebSocket(MIRROR_URL);
    this.socket = socket;
    socket.onopen = () => {
      for (const message of this.queued.splice(0)) socket.send(JSON.stringify(message));
    };
    socket.onmessage = event => {
      try {
        const message = JSON.parse(String(event.data)) as { type?: unknown; payload?: unknown };
        if (message.type === "mirror:input") {
          this.replayInput(message.payload as MirrorInput);
          return;
        }
        for (const listener of this.listeners) listener(message);
      } catch {
        // A malformed recorder packet is ignored; the live dashboard remains usable.
      }
    };
    socket.onclose = () => {
      if (this.socket === socket) this.socket = null;
      if (!this.stopped) window.setTimeout(() => this.connect(), 500);
    };
  }

  private send(message: unknown) {
    if (this.socket?.readyState === WebSocket.OPEN) this.socket.send(JSON.stringify(message));
    else this.queued.push(message);
  }

  private point(x: number, y: number) {
    return {
      x: Math.min(window.innerWidth - 1, Math.max(0, x * window.innerWidth)),
      y: Math.min(window.innerHeight - 1, Math.max(0, y * window.innerHeight)),
    };
  }

  private replayInput(input: MirrorInput) {
    if (!input || typeof input !== "object") return;
    if (input.kind === "form") {
      const target = elementAtPath(input.path);
      if (!(target instanceof HTMLInputElement || target instanceof HTMLSelectElement || target instanceof HTMLTextAreaElement)) return;
      target.value = input.value;
      if (target instanceof HTMLInputElement) target.checked = input.checked;
      target.dispatchEvent(new Event(input.eventType, { bubbles: true, cancelable: true }));
      return;
    }
    if (input.kind === "scroll") {
      const target = elementAtPath(input.path);
      if (target) target.scrollTo(input.scrollLeft, input.scrollTop);
      return;
    }
    if (input.kind === "key") {
      document.dispatchEvent(new KeyboardEvent(input.eventType, {
        key: input.key,
        code: input.code,
        repeat: input.repeat,
        bubbles: true,
        cancelable: true,
      }));
      return;
    }

    const point = this.point(input.x, input.y);
    if (input.kind === "wheel") {
      const target = document.elementFromPoint(point.x, point.y) ?? document.body;
      target.dispatchEvent(new WheelEvent("wheel", {
        clientX: point.x,
        clientY: point.y,
        deltaX: input.deltaX,
        deltaY: input.deltaY,
        deltaMode: input.deltaMode,
        bubbles: true,
        cancelable: true,
      }));
      return;
    }

    let target = this.pointerTargets.get(input.pointerId);
    if (!target || input.eventType === "pointerdown" || input.eventType === "click") {
      target = document.elementFromPoint(point.x, point.y) ?? document.body;
    }
    const options = {
      clientX: point.x,
      clientY: point.y,
      pointerId: input.pointerId,
      pointerType: input.pointerType || "touch",
      button: input.button,
      buttons: input.buttons,
      bubbles: true,
      cancelable: true,
    };
    if (input.eventType === "click") target.dispatchEvent(new MouseEvent("click", options));
    else target.dispatchEvent(new PointerEvent(input.eventType, options));
    if (input.eventType === "pointerdown") this.pointerTargets.set(input.pointerId, target);
    if (input.eventType === "pointerup" || input.eventType === "pointercancel") this.pointerTargets.delete(input.pointerId);
  }
}

export function recordingClient(): BridgethingClient {
  return new RecordingMirrorClient() as unknown as BridgethingClient;
}

function pathToElement(element: Element) {
  const path: number[] = [];
  let current: Element | null = element;
  while (current && current !== document.documentElement) {
    const parent: Element | null = current.parentElement;
    if (!parent) return [];
    path.unshift(Array.prototype.indexOf.call(parent.children, current));
    current = parent;
  }
  return path;
}

function elementAtPath(path: number[]) {
  let current: Element = document.documentElement;
  for (const index of path) {
    const next = current.children.item(index);
    if (!next) return null;
    current = next;
  }
  return current;
}

export function installDeviceInputForwarder(client: BridgethingClient) {
  let active = false;
  const activePointers = new Set<number>();
  const removeControl = client.forward.onJson(message => {
    if (!message || typeof message !== "object" || !("type" in message)) return;
    const packet = message as { type?: unknown; payload?: { active?: unknown } };
    if (packet.type === "mirror:control") active = packet.payload?.active === true;
  });
  const send = (payload: MirrorInput) => {
    if (active) void client.forward.json({ type: "mirror:input", payload });
  };
  const normalize = (value: number, size: number) => Math.min(1, Math.max(0, value / size));
  const onPointer = (event: PointerEvent) => {
    if (event.type === "pointerdown") activePointers.add(event.pointerId);
    const shouldSend = event.type !== "pointermove" || activePointers.has(event.pointerId);
    if (shouldSend) send({
      kind: "pointer",
      eventType: event.type as "pointerdown" | "pointermove" | "pointerup" | "pointercancel",
      x: normalize(event.clientX, window.innerWidth || MIRROR_WIDTH),
      y: normalize(event.clientY, window.innerHeight || MIRROR_HEIGHT),
      pointerId: event.pointerId,
      pointerType: event.pointerType,
      button: event.button,
      buttons: event.buttons,
    });
    if (event.type === "pointerup" || event.type === "pointercancel") activePointers.delete(event.pointerId);
  };
  const onClick = (event: MouseEvent) => send({
    kind: "pointer",
    eventType: "click",
    x: normalize(event.clientX, window.innerWidth || MIRROR_WIDTH),
    y: normalize(event.clientY, window.innerHeight || MIRROR_HEIGHT),
    pointerId: 1,
    pointerType: "mouse",
    button: event.button,
    buttons: event.buttons,
  });
  const onKey = (event: KeyboardEvent) => send({
    kind: "key",
    eventType: event.type as "keydown" | "keyup",
    key: event.key,
    code: event.code,
    repeat: event.repeat,
  });
  const onWheel = (event: WheelEvent) => send({
    kind: "wheel",
    x: normalize(event.clientX, window.innerWidth || MIRROR_WIDTH),
    y: normalize(event.clientY, window.innerHeight || MIRROR_HEIGHT),
    deltaX: event.deltaX,
    deltaY: event.deltaY,
    deltaMode: event.deltaMode,
  });
  const onForm = (event: Event) => {
    const target = event.target;
    if (!(target instanceof HTMLInputElement || target instanceof HTMLSelectElement || target instanceof HTMLTextAreaElement)) return;
    send({
      kind: "form",
      eventType: event.type as "input" | "change",
      path: pathToElement(target),
      value: target.value,
      checked: target instanceof HTMLInputElement && target.checked,
    });
  };
  const onScroll = (event: Event) => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    send({ kind: "scroll", path: pathToElement(target), scrollLeft: target.scrollLeft, scrollTop: target.scrollTop });
  };

  const listeners: Array<[string, EventListener]> = [
    ["pointerdown", onPointer as EventListener],
    ["pointermove", onPointer as EventListener],
    ["pointerup", onPointer as EventListener],
    ["pointercancel", onPointer as EventListener],
    ["click", onClick as EventListener],
    ["keydown", onKey as EventListener],
    ["keyup", onKey as EventListener],
    ["wheel", onWheel as EventListener],
    ["input", onForm as EventListener],
    ["change", onForm as EventListener],
    ["scroll", onScroll as EventListener],
  ];
  for (const [type, listener] of listeners) document.addEventListener(type, listener, true);
  return () => {
    removeControl();
    for (const [type, listener] of listeners) document.removeEventListener(type, listener, true);
  };
}
