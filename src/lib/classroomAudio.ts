// Classroom audio is stored in the same browser database the Live class host
// already reads. Keeping these names stable lets the teacher manage audio from
// a dedicated page without changing timer or music playback in /control.

const DATABASE_NAME = "bdm-control";
const DATABASE_VERSION = 1;
const STORE_NAME = "sounds";

export type TimerCueKey = "warn30" | "tick" | "end";

export const TIMER_CUE_KEYS: TimerCueKey[] = ["warn30", "tick", "end"];

export function musicAudioKey(stateId: string): string {
  return `music:${stateId}`;
}

function storageError(message: string, error?: DOMException | null): Error {
  return new Error(error?.message ? `${message}: ${error.message}` : message);
}

function openAudioDatabase(): Promise<IDBDatabase> {
  if (typeof indexedDB === "undefined") {
    return Promise.reject(new Error("Audio storage is not available in this browser."));
  }

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);

    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE_NAME)) {
        request.result.createObjectStore(STORE_NAME);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(storageError("Audio storage could not be opened", request.error));
    request.onblocked = () => reject(new Error("Audio storage is busy in another tab. Close that tab and try again."));
  });
}

export async function getClassroomAudio(key: string): Promise<Blob | undefined> {
  const database = await openAudioDatabase();

  return new Promise((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, "readonly");
    const request = transaction.objectStore(STORE_NAME).get(key);
    let result: Blob | undefined;

    request.onsuccess = () => {
      result = request.result as Blob | undefined;
    };
    request.onerror = () => reject(storageError("The audio file could not be read", request.error));
    transaction.oncomplete = () => {
      database.close();
      resolve(result);
    };
    transaction.onerror = () => {
      database.close();
      reject(storageError("The audio file could not be read", transaction.error));
    };
    transaction.onabort = () => {
      database.close();
      reject(storageError("The audio read was interrupted", transaction.error));
    };
  });
}

export async function saveClassroomAudio(key: string, audio: Blob): Promise<void> {
  const database = await openAudioDatabase();

  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, "readwrite");
    const request = transaction.objectStore(STORE_NAME).put(audio, key);

    request.onerror = () => reject(storageError("The audio file could not be saved", request.error));
    transaction.oncomplete = () => {
      database.close();
      resolve();
    };
    transaction.onerror = () => {
      database.close();
      reject(storageError("The audio file could not be saved", transaction.error));
    };
    transaction.onabort = () => {
      database.close();
      reject(storageError("The audio save was interrupted", transaction.error));
    };
  });
}

export async function removeClassroomAudio(key: string): Promise<void> {
  const database = await openAudioDatabase();

  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, "readwrite");
    const request = transaction.objectStore(STORE_NAME).delete(key);

    request.onerror = () => reject(storageError("The audio file could not be removed", request.error));
    transaction.oncomplete = () => {
      database.close();
      resolve();
    };
    transaction.onerror = () => {
      database.close();
      reject(storageError("The audio file could not be removed", transaction.error));
    };
    transaction.onabort = () => {
      database.close();
      reject(storageError("The audio removal was interrupted", transaction.error));
    };
  });
}
