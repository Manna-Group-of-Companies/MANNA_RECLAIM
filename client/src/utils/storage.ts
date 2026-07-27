/** localStorage wrapper that degrades to memory in locked-down webviews. */
const memory = new Map<string, string>();

let available = true;
try {
  localStorage.setItem('__probe', '1');
  localStorage.removeItem('__probe');
} catch {
  available = false;
}

export const storage = {
  get<T>(key: string, fallback: T): T {
    try {
      const raw = available ? localStorage.getItem(key) : memory.get(key) ?? null;
      return raw ? (JSON.parse(raw) as T) : fallback;
    } catch {
      return fallback;
    }
  },

  set(key: string, value: unknown): void {
    const raw = JSON.stringify(value);
    try {
      if (available) localStorage.setItem(key, raw);
      else memory.set(key, raw);
    } catch {
      memory.set(key, raw);
    }
  },

  remove(key: string): void {
    try {
      if (available) localStorage.removeItem(key);
    } finally {
      memory.delete(key);
    }
  },
};

export default storage;
