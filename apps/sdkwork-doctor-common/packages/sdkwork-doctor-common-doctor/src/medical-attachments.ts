/**
 * Binary storage for medical-record attachments.
 *
 * The record itself keeps only metadata, so a case list stays small. Browsers
 * store the blob in IndexedDB (localStorage's few megabytes cannot hold photos
 * or video); a host without IndexedDB degrades to an in-memory map for the
 * session instead of failing the upload. Native clients keep the file on the
 * device and put its path on the metadata, so they do not use this store.
 */
import {
  createMedicalAttachment,
  type MedicalAttachment,
  type CreateMedicalAttachmentInput,
} from './medical-records';

/** Where an uploaded file's bytes live for this device. */
export interface MedicalAttachmentStore {
  /** Persists [file] and returns the metadata row to put on the record. */
  readonly put: (input: {
    readonly file: Blob;
    readonly name: string;
    readonly mimeType?: string;
    readonly kind?: CreateMedicalAttachmentInput['kind'];
  }) => Promise<MedicalAttachment>;
  /** Returns the stored bytes, or null when the attachment is inline or gone. */
  readonly read: (attachment: MedicalAttachment) => Promise<Blob | null>;
  readonly remove: (id: string) => Promise<void>;
  readonly clear: () => Promise<void>;
}

const ATTACHMENT_DB_NAME = 'sdkwork.doctor.attachments';
const ATTACHMENT_DB_VERSION = 1;
const ATTACHMENT_DB_STORE = 'attachments';

function idbFactory(): IDBFactory | null {
  try {
    const candidate = (globalThis as { indexedDB?: IDBFactory }).indexedDB;
    return candidate ?? null;
  } catch {
    return null;
  }
}

function openAttachmentDb(): Promise<IDBDatabase | null> {
  const factory = idbFactory();
  if (!factory) return Promise.resolve(null);
  return new Promise<IDBDatabase | null>((resolve) => {
    let settled = false;
    const finish = (value: IDBDatabase | null): void => {
      if (settled) return;
      settled = true;
      resolve(value);
    };
    try {
      const request = factory.open(ATTACHMENT_DB_NAME, ATTACHMENT_DB_VERSION);
      request.onupgradeneeded = () => {
        const database = request.result;
        if (!database.objectStoreNames.contains(ATTACHMENT_DB_STORE)) {
          database.createObjectStore(ATTACHMENT_DB_STORE);
        }
      };
      request.onsuccess = () => finish(request.result);
      request.onerror = () => finish(null);
      request.onblocked = () => finish(null);
    } catch {
      finish(null);
    }
  });
}

function requestResult<T>(request: IDBRequest<T>): Promise<T | null> {
  return new Promise<T | null>((resolve) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => resolve(null);
  });
}

function requestDone<T>(request: IDBRequest<T>): Promise<boolean> {
  return new Promise<boolean>((resolve) => {
    request.onsuccess = () => resolve(true);
    request.onerror = () => resolve(false);
  });
}

async function writeBlob(id: string, file: Blob): Promise<IDBDatabase | null> {
  const database = await openAttachmentDb();
  if (!database) return null;
  try {
    const store = database.transaction(ATTACHMENT_DB_STORE, 'readwrite').objectStore(ATTACHMENT_DB_STORE);
    const ok = await requestDone(store.put(file, id));
    return ok ? database : null;
  } catch {
    return null;
  }
}

async function readBlob(id: string): Promise<Blob | null> {
  const database = await openAttachmentDb();
  if (!database) return null;
  try {
    const store = database.transaction(ATTACHMENT_DB_STORE, 'readonly').objectStore(ATTACHMENT_DB_STORE);
    const value = await requestResult<Blob>(store.get(id));
    return value instanceof Blob ? value : null;
  } catch {
    return null;
  }
}

async function deleteBlob(id: string): Promise<void> {
  const database = await openAttachmentDb();
  if (!database) return;
  try {
    const store = database.transaction(ATTACHMENT_DB_STORE, 'readwrite').objectStore(ATTACHMENT_DB_STORE);
    await requestDone(store.delete(id));
  } catch {
    // Best effort: the metadata is already gone from the record.
  }
}

async function clearBlobs(): Promise<void> {
  const database = await openAttachmentDb();
  if (!database) return;
  try {
    const store = database.transaction(ATTACHMENT_DB_STORE, 'readwrite').objectStore(ATTACHMENT_DB_STORE);
    await requestDone(store.clear());
  } catch {
    // Best effort.
  }
}

/**
 * Browser attachment store: IndexedDB for the bytes, with an in-memory fallback
 * when the database is unavailable (private mode, embedded webview, quota).
 */
export function createBrowserMedicalAttachmentStore(): MedicalAttachmentStore {
  const memory = new Map<string, Blob>();
  const store: MedicalAttachmentStore = {
    async put(input) {
      const attachment = createMedicalAttachment({
        name: input.name,
        mimeType: input.mimeType,
        sizeBytes: input.file.size,
        kind: input.kind,
      });
      const database = await writeBlob(attachment.id, input.file);
      if (!database) memory.set(attachment.id, input.file);
      return attachment;
    },
    async read(attachment) {
      if (attachment.dataUrl) return null;
      const stored = await readBlob(attachment.id);
      return stored ?? memory.get(attachment.id) ?? null;
    },
    async remove(id) {
      memory.delete(id);
      await deleteBlob(id);
    },
    async clear() {
      memory.clear();
      await clearBlobs();
    },
  };
  return Object.freeze(store);
}

/** In-memory attachment store for tests and hosts without IndexedDB. */
export function createMemoryMedicalAttachmentStore(): MedicalAttachmentStore {
  const memory = new Map<string, Blob>();
  const store: MedicalAttachmentStore = {
    async put(input) {
      const attachment = createMedicalAttachment({
        name: input.name,
        mimeType: input.mimeType,
        sizeBytes: input.file.size,
        kind: input.kind,
      });
      memory.set(attachment.id, input.file);
      return attachment;
    },
    async read(attachment) {
      return memory.get(attachment.id) ?? null;
    },
    async remove(id) {
      memory.delete(id);
    },
    async clear() {
      memory.clear();
    },
  };
  return Object.freeze(store);
}
