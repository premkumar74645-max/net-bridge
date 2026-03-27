import { Message } from '../types';

const DB_NAME = 'NetBridgeDB';
const STORE_NAME = 'messages';
const QUEUE_STORE = 'offline_queue';

export class LocalDB {
  private db: IDBDatabase | null = null;

  async init() {
    if (typeof indexedDB === 'undefined') {
      console.warn('IndexedDB is not available in this environment. Local storage will not be persistent.');
      return Promise.resolve();
    }
    return new Promise<void>((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, 1);
      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME, { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains(QUEUE_STORE)) {
          db.createObjectStore(QUEUE_STORE, { keyPath: 'id' });
        }
      };
      request.onsuccess = (event) => {
        this.db = (event.target as IDBOpenDBRequest).result;
        resolve();
      };
      request.onerror = () => reject(request.error);
    });
  }

  async saveMessage(message: Message) {
    if (!this.db) await this.init();
    const tx = this.db!.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).put(message);
    return new Promise((resolve) => (tx.oncomplete = resolve));
  }

  async getMessages(): Promise<Message[]> {
    if (!this.db) await this.init();
    return new Promise((resolve) => {
      const tx = this.db!.transaction(STORE_NAME, 'readonly');
      const request = tx.objectStore(STORE_NAME).getAll();
      request.onsuccess = () => resolve(request.result);
    });
  }

  async addToQueue(message: Message) {
    if (!this.db) await this.init();
    const tx = this.db!.transaction(QUEUE_STORE, 'readwrite');
    tx.objectStore(QUEUE_STORE).put(message);
    return new Promise((resolve) => (tx.oncomplete = resolve));
  }

  async getQueue(): Promise<Message[]> {
    if (!this.db) await this.init();
    return new Promise((resolve) => {
      const tx = this.db!.transaction(QUEUE_STORE, 'readonly');
      const request = tx.objectStore(QUEUE_STORE).getAll();
      request.onsuccess = () => resolve(request.result);
    });
  }

  async removeFromQueue(id: string) {
    if (!this.db) await this.init();
    const tx = this.db!.transaction(QUEUE_STORE, 'readwrite');
    tx.objectStore(QUEUE_STORE).delete(id);
    return new Promise((resolve) => (tx.oncomplete = resolve));
  }
}

export const localDB = new LocalDB();
