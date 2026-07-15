// Sound for the BRUH board.
//
// Clips are loaded once on the admin page and kept in IndexedDB on that machine
// (same approach as /control's cue sounds), so the board can fire them without a
// round trip and they survive a reload. No clip loaded means a built-in tone,
// so the game is never silent and never blocked on setup.

export interface BruhSoundSlot {
  key: string;
  label: string;
  hint: string;
}

export const BRUH_SOUND_SLOTS: BruhSoundSlot[] = [
  { key: "bruh", label: "BRUH card", hint: "The card that wipes a team to zero" },
  { key: "spin", label: "Slot spin", hint: "Loops while the reels are turning" },
  { key: "gain", label: "Points gained", hint: "A positive card lands" },
  { key: "loss", label: "Points lost", hint: "A negative card lands" },
  { key: "tick", label: "Reveal tick", hint: "Each team's answer and each reel stop" },
  { key: "buzzer", label: "Time up", hint: "The answer window closes" },
];

const DB_NAME = "bdm-bruh";
const STORE = "sounds";

function idbOpen(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function putSound(key: string, blob: Blob): Promise<void> {
  const db = await idbOpen();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put(blob, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function getSound(key: string): Promise<Blob | undefined> {
  const db = await idbOpen();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const r = tx.objectStore(STORE).get(key);
    r.onsuccess = () => resolve(r.result as Blob | undefined);
    r.onerror = () => reject(r.error);
  });
}

export async function delSound(key: string): Promise<void> {
  const db = await idbOpen();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).delete(key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

/** Load every stored clip as a blob URL, keyed by slot. */
export async function loadSoundUrls(): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  for (const slot of BRUH_SOUND_SLOTS) {
    try {
      const blob = await getSound(slot.key);
      if (blob) out[slot.key] = URL.createObjectURL(blob);
    } catch { /* no clip for this slot */ }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Playback

/** Fallback tones, so a slot with no clip still reads as an event in the room. */
const TONES: Record<string, { f: number; t: number; d: number }[]> = {
  bruh: [{ f: 180, t: 0, d: 0.5 }, { f: 120, t: 0.25, d: 0.6 }],
  spin: [{ f: 440, t: 0, d: 0.05 }],
  gain: [{ f: 660, t: 0, d: 0.12 }, { f: 880, t: 0.1, d: 0.18 }],
  loss: [{ f: 330, t: 0, d: 0.16 }, { f: 220, t: 0.12, d: 0.24 }],
  tick: [{ f: 520, t: 0, d: 0.06 }],
  buzzer: [{ f: 300, t: 0, d: 0.3 }],
};

export class BruhSound {
  private ctx: AudioContext | null = null;
  private urls: Record<string, string> = {};
  private loops = new Map<string, HTMLAudioElement>();

  setUrls(urls: Record<string, string>) {
    this.urls = urls;
  }

  private tone(key: string) {
    const pattern = TONES[key];
    if (!pattern) return;
    try {
      const Ctor = window.AudioContext
        || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx = this.ctx ?? new Ctor();
      const ctx = this.ctx;
      for (const { f, t, d } of pattern) {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.frequency.value = f;
        osc.connect(gain);
        gain.connect(ctx.destination);
        gain.gain.setValueAtTime(0.0001, ctx.currentTime + t);
        gain.gain.exponentialRampToValueAtTime(0.3, ctx.currentTime + t + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + t + d);
        osc.start(ctx.currentTime + t);
        osc.stop(ctx.currentTime + t + d + 0.02);
      }
    } catch { /* audio unavailable */ }
  }

  play(key: string, opts?: { loop?: boolean }) {
    const url = this.urls[key];
    if (!url) {
      if (!opts?.loop) this.tone(key);
      return;
    }
    try {
      const a = new Audio(url);
      a.loop = !!opts?.loop;
      void a.play().catch(() => { /* autoplay blocked until the teacher clicks */ });
      if (opts?.loop) {
        this.stop(key);
        this.loops.set(key, a);
      }
    } catch { /* audio unavailable */ }
  }

  stop(key: string) {
    const a = this.loops.get(key);
    if (a) { a.pause(); this.loops.delete(key); }
  }

  stopAll() {
    for (const key of Array.from(this.loops.keys())) this.stop(key);
  }
}
