
import { User, MedicalReport } from './types';

const DB_NAME = 'RadAssistDB';
const STORE_NAME = 'reports';
const DB_VERSION = 1;

/**
 * Simple SHA-256 implementation for local hashing
 */
export async function hashPassword(password: string): Promise<string> {
  const msgUint8 = new TextEncoder().encode(password);
  const hashBuffer = await crypto.subtle.digest('SHA-256', msgUint8);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * IndexedDB Wrapper
 */
class LocalDB {
  private db: IDBDatabase | null = null;

  async init(): Promise<void> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        this.db = request.result;
        resolve();
      };
      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME, { keyPath: 'id' });
        }
      };
    });
  }

  async saveReport(report: MedicalReport): Promise<void> {
    if (!this.db) await this.init();
    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([STORE_NAME], 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.put(report);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  async getReports(userId: string): Promise<MedicalReport[]> {
    if (!this.db) await this.init();
    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([STORE_NAME], 'readonly');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.getAll();
      request.onsuccess = () => {
        const all = request.result as MedicalReport[];
        resolve(all.filter(r => r.userId === userId).sort((a, b) => b.timestamp - a.timestamp));
      };
      request.onerror = () => reject(request.error);
    });
  }

  async deleteReport(id: string): Promise<void> {
    if (!this.db) await this.init();
    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([STORE_NAME], 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.delete(id);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }
}

export const db = new LocalDB();

export const authStorage = {
  saveUser: (user: User) => {
    const users = authStorage.getUsers();
    users.push(user);
    localStorage.setItem('medivise_users', JSON.stringify(users));
  },
  getUsers: (): User[] => {
    const data = localStorage.getItem('medivise_users');
    return data ? JSON.parse(data) : [];
  },
  setSession: (username: string | null) => {
    if (username) localStorage.setItem('medivise_session', username);
    else localStorage.removeItem('medivise_session');
  },
  getSession: () => localStorage.getItem('medivise_session')
};
