// Tiny in-page pub/sub so any control-panel surface (poll results, the student
// spinner) can ask the Abbie console to react out loud. The Abbie console is the
// only subscriber; callers just fire a fully-formed stage direction and the
// console handles the brain call, the projector bubble, the voice, and the
// student broadcast. If no console is mounted (e.g. the standalone /spinner
// route), the call is a harmless no-op. Teacher-triggered only, to control noise.

type Handler = (direction: string) => void;

const handlers = new Set<Handler>();

export function requestAbbieLine(direction: string): void {
  handlers.forEach((h) => h(direction));
}

export function subscribeAbbieLine(handler: Handler): () => void {
  handlers.add(handler);
  return () => { handlers.delete(handler); };
}

// True when an Abbie console is mounted and listening (i.e. we're inside the
// control panel). Surfaces let a shared component hide its "have Abbie react"
// affordance when there's nothing to react — e.g. the standalone /spinner route.
export function hasAbbieListener(): boolean {
  return handlers.size > 0;
}
