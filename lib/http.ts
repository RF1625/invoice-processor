export async function readJson<T = Record<string, unknown>>(res: Response, fallback?: T): Promise<T> {
  try {
    const text = await res.text();
    if (!text) return (fallback ?? ({} as T));
    return JSON.parse(text) as T;
  } catch {
    return (fallback ?? ({} as T));
  }
}
