import { detachBridgeThingConsole } from './windows-console';

// BridgeThing starts the extension in Deno. Run this before the telemetry
// graph is evaluated so Windows releases the inherited console at the first
// possible application-side point.
detachBridgeThingConsole();
