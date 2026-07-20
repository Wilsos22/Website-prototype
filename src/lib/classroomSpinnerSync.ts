"use client";

import { getSupabase } from "./supabase";

export type SyncedClassroomSpinnerMode = "readers" | "ipad";

export interface ClassroomSpinnerSnapshot {
  stateId: string;
  mode: SyncedClassroomSpinnerMode;
  displayNames: string[];
  landed: boolean[];
  spinning: boolean;
  status: string;
  spinNonce: string | null;
}

export interface ClassroomSpinnerSnapshotEnvelope {
  controllerId: string;
  sequence: number;
  sentAt: string;
  snapshot: ClassroomSpinnerSnapshot;
}

interface ControllerOptions {
  role: "controller";
  getSnapshot: () => ClassroomSpinnerSnapshot | null;
}

interface MirrorOptions {
  role: "mirror";
  onSnapshot: (envelope: ClassroomSpinnerSnapshotEnvelope) => void;
}

export type ClassroomSpinnerSyncOptions = ControllerOptions | MirrorOptions;

export interface ClassroomSpinnerSyncChannel {
  publish: (snapshot: ClassroomSpinnerSnapshot) => boolean;
  requestSnapshot: () => void;
  close: () => void;
}

type ClassroomSpinnerSyncMessage =
  | { version: 1; type: "hello"; senderId: string }
  | {
    version: 1;
    type: "state";
    senderId: string;
    sequence: number;
    sentAt: string;
    snapshot: ClassroomSpinnerSnapshot;
  };

interface EncryptedSpinnerMessage {
  version: 1;
  type: "encrypted";
  iv: string;
  ciphertext: string;
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function base64ToBytes(value: string): Uint8Array {
  const binary = atob(value);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function bytesToArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy.buffer;
}

async function spinnerMessageKey(room: string, syncKey: string): Promise<CryptoKey | null> {
  if (typeof crypto === "undefined" || !crypto.subtle) return null;
  const material = new TextEncoder().encode(`big-dog-math-spinner\n${room}\n${syncKey}`);
  const digest = await crypto.subtle.digest("SHA-256", material);
  return crypto.subtle.importKey("raw", digest, { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
}

async function encryptMessage(
  keyPromise: Promise<CryptoKey | null>,
  room: string,
  message: ClassroomSpinnerSyncMessage,
): Promise<EncryptedSpinnerMessage | null> {
  const key = await keyPromise;
  if (!key) return null;
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv, additionalData: new TextEncoder().encode(room) },
    key,
    new TextEncoder().encode(JSON.stringify(message)),
  );
  return {
    version: 1,
    type: "encrypted",
    iv: bytesToBase64(iv),
    ciphertext: bytesToBase64(new Uint8Array(ciphertext)),
  };
}

async function decryptMessage(
  keyPromise: Promise<CryptoKey | null>,
  room: string,
  value: unknown,
): Promise<ClassroomSpinnerSyncMessage | null> {
  if (!isRecord(value) || value.version !== 1 || value.type !== "encrypted") return null;
  if (typeof value.iv !== "string" || typeof value.ciphertext !== "string") return null;
  try {
    const key = await keyPromise;
    if (!key) return null;
    const plaintext = await crypto.subtle.decrypt(
      {
        name: "AES-GCM",
        iv: bytesToArrayBuffer(base64ToBytes(value.iv)),
        additionalData: new TextEncoder().encode(room),
      },
      key,
      bytesToArrayBuffer(base64ToBytes(value.ciphertext)),
    );
    return parseMessage(JSON.parse(new TextDecoder().decode(plaintext)));
  } catch {
    return null;
  }
}

function instanceId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `spinner-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isSpinnerSnapshot(value: unknown): value is ClassroomSpinnerSnapshot {
  if (!isRecord(value)) return false;
  const names = value.displayNames;
  const landed = value.landed;
  const mode = value.mode;
  return typeof value.stateId === "string"
    && value.stateId.length > 0
    && (mode === "readers" || mode === "ipad")
    && Array.isArray(names)
    && names.length >= 1
    && names.length <= 2
    && names.every((name) => typeof name === "string")
    && Array.isArray(landed)
    && landed.length === names.length
    && landed.every((item) => typeof item === "boolean")
    && typeof value.spinning === "boolean"
    && typeof value.status === "string"
    && (value.spinNonce === null || typeof value.spinNonce === "string");
}

function parseMessage(value: unknown): ClassroomSpinnerSyncMessage | null {
  if (!isRecord(value) || value.version !== 1 || typeof value.senderId !== "string") return null;
  if (value.type === "hello") {
    return { version: 1, type: "hello", senderId: value.senderId };
  }
  if (
    value.type === "state"
    && typeof value.sequence === "number"
    && Number.isSafeInteger(value.sequence)
    && value.sequence >= 0
    && typeof value.sentAt === "string"
    && isSpinnerSnapshot(value.snapshot)
  ) {
    return {
      version: 1,
      type: "state",
      senderId: value.senderId,
      sequence: value.sequence,
      sentAt: value.sentAt,
      snapshot: value.snapshot,
    };
  }
  return null;
}

function queueMessage(
  queue: ClassroomSpinnerSyncMessage[],
  message: ClassroomSpinnerSyncMessage,
): void {
  if (message.type === "state") {
    const queuedStateIndex = queue.findIndex((queued) => queued.type === "state");
    if (queuedStateIndex >= 0) {
      queue[queuedStateIndex] = message;
      return;
    }
  }
  if (message.type === "hello" && queue.some((queued) => queued.type === "hello")) return;
  queue.push(message);
}

export function joinClassroomSpinnerRoom(
  room: string,
  syncKey: string,
  options: ClassroomSpinnerSyncOptions,
): ClassroomSpinnerSyncChannel {
  const normalizedRoom = room.trim();
  if (!normalizedRoom) throw new TypeError("Spinner sync room is required.");
  const normalizedSyncKey = syncKey.trim();
  if (!normalizedSyncKey) throw new TypeError("Spinner sync key is required.");

  const senderId = instanceId();
  const supabase = getSupabase();
  const messageKey = spinnerMessageKey(normalizedRoom, normalizedSyncKey);
  const queue: ClassroomSpinnerSyncMessage[] = [];
  let closed = false;
  let sequence = 0;
  let activeControllerId = "";
  let activeControllerSequence = -1;
  let activeControllerSeenAt = 0;
  let helloPublishTimer: ReturnType<typeof setTimeout> | null = null;
  let sendTransport: (message: ClassroomSpinnerSyncMessage) => void = (message) => {
    queueMessage(queue, message);
  };

  const publish = (snapshot: ClassroomSpinnerSnapshot): boolean => {
    if (closed || options.role !== "controller" || !isSpinnerSnapshot(snapshot)) return false;
    const message: ClassroomSpinnerSyncMessage = {
      version: 1,
      type: "state",
      senderId,
      sequence,
      sentAt: new Date().toISOString(),
      snapshot,
    };
    sequence += 1;
    sendTransport(message);
    return true;
  };

  const receive = (rawMessage: unknown) => {
    const message = parseMessage(rawMessage);
    if (!message || message.senderId === senderId || closed) return;

    if (message.type === "hello") {
      if (options.role !== "controller") return;
      if (helloPublishTimer) return;
      helloPublishTimer = setTimeout(() => {
        helloPublishTimer = null;
        const snapshot = options.getSnapshot();
        if (snapshot) publish(snapshot);
      }, 50);
      return;
    }

    if (options.role !== "mirror") return;
    const now = Date.now();
    if (
      activeControllerId
      && message.senderId !== activeControllerId
      && now - activeControllerSeenAt < 15_000
    ) return;
    if (message.senderId === activeControllerId && message.sequence <= activeControllerSequence) return;
    if (message.senderId !== activeControllerId) {
      activeControllerId = message.senderId;
      activeControllerSequence = -1;
    }
    activeControllerSequence = message.sequence;
    activeControllerSeenAt = now;
    options.onSnapshot({
      controllerId: message.senderId,
      sequence: message.sequence,
      sentAt: message.sentAt,
      snapshot: message.snapshot,
    });
  };

  const requestSnapshot = () => {
    if (closed) return;
    sendTransport({ version: 1, type: "hello", senderId });
  };

  if (supabase) {
    const channel = supabase.channel(`classroom-spinner-${normalizedRoom}`, {
      config: { broadcast: { self: false } },
    });
    channel
      .on("broadcast", { event: "spinner" }, (payload) => {
        void decryptMessage(messageKey, normalizedRoom, payload.payload).then((message) => {
          if (message) receive(message);
        });
      })
      .subscribe((status) => {
        if (status !== "SUBSCRIBED" || closed) return;
        sendTransport = (message) => {
          void encryptMessage(messageKey, normalizedRoom, message).then((payload) => {
            if (!payload || closed) return;
            void channel.send({ type: "broadcast", event: "spinner", payload });
          });
        };
        for (const message of queue.splice(0)) sendTransport(message);
        if (options.role === "mirror") requestSnapshot();
      });

    return {
      publish,
      requestSnapshot,
      close: () => {
        if (closed) return;
        closed = true;
        if (helloPublishTimer) clearTimeout(helloPublishTimer);
        queue.length = 0;
        void supabase.removeChannel(channel);
      },
    };
  }

  const broadcastChannel = typeof window !== "undefined" && "BroadcastChannel" in window
    ? new BroadcastChannel(`classroom-spinner-${normalizedRoom}`)
    : null;
  if (broadcastChannel) {
    broadcastChannel.onmessage = (event) => {
      void decryptMessage(messageKey, normalizedRoom, event.data).then((message) => {
        if (message) receive(message);
      });
    };
    sendTransport = (message) => {
      void encryptMessage(messageKey, normalizedRoom, message).then((payload) => {
        if (payload && !closed) broadcastChannel.postMessage(payload);
      });
    };
    for (const message of queue.splice(0)) sendTransport(message);
    if (options.role === "mirror") window.setTimeout(requestSnapshot, 0);
  }

  return {
    publish,
    requestSnapshot,
    close: () => {
      if (closed) return;
      closed = true;
      if (helloPublishTimer) clearTimeout(helloPublishTimer);
      queue.length = 0;
      broadcastChannel?.close();
    },
  };
}
