export type CacheEntry<T> = {
  data: T;
  updatedAt: number;
};

const memoryCache = new Map<string, CacheEntry<unknown>>();
const inflight = new Map<string, Promise<CacheEntry<unknown>>>();

const isEntry = (value: unknown): value is CacheEntry<unknown> => {
  if (!value || typeof value !== "object") return false;
  const entry = value as { data?: unknown; updatedAt?: unknown };
  return "data" in entry && typeof entry.updatedAt === "number";
};

const coerceEntry = <T>(value: unknown): CacheEntry<T> | null => {
  if (isEntry(value)) return value as CacheEntry<T>;
  if (value === undefined) return null;
  return { data: value as T, updatedAt: 0 };
};

export const readCache = <T>(key: string): CacheEntry<T> | null => {
  const memory = memoryCache.get(key) as CacheEntry<T> | undefined;
  if (memory) return memory;
  if (typeof window === "undefined") return null;
  const raw = sessionStorage.getItem(key);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as unknown;
    const entry = coerceEntry<T>(parsed);
    if (!entry) {
      sessionStorage.removeItem(key);
      return null;
    }
    memoryCache.set(key, entry);
    if (!isEntry(parsed)) {
      sessionStorage.setItem(key, JSON.stringify(entry));
    }
    return entry;
  } catch {
    sessionStorage.removeItem(key);
    return null;
  }
};

export const writeCache = <T>(key: string, data: T): CacheEntry<T> => {
  const entry: CacheEntry<T> = { data, updatedAt: Date.now() };
  memoryCache.set(key, entry);
  if (typeof window !== "undefined") {
    sessionStorage.setItem(key, JSON.stringify(entry));
  }
  return entry;
};

export const isStale = (entry: CacheEntry<unknown> | null, maxAgeMs: number) => {
  if (!entry) return true;
  if (!Number.isFinite(entry.updatedAt)) return true;
  return Date.now() - entry.updatedAt > maxAgeMs;
};

export const fetchAndCache = async <T>(key: string, fetcher: () => Promise<T>): Promise<CacheEntry<T>> => {
  const pending = inflight.get(key) as Promise<CacheEntry<T>> | undefined;
  if (pending) return pending;
  const promise = (async () => {
    try {
      const data = await fetcher();
      return writeCache(key, data);
    } finally {
      inflight.delete(key);
    }
  })();
  inflight.set(key, promise as Promise<CacheEntry<unknown>>);
  return promise;
};
