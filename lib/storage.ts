import fs from "node:fs/promises";
import { createReadStream } from "node:fs";
import path from "node:path";
import { Readable } from "node:stream";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const DEFAULT_STORAGE_ROOT = process.env.VERCEL
  ? "/tmp/invoice-processor"
  : path.join(process.cwd(), "storage");
const STORAGE_ROOT = process.env.STORAGE_ROOT ?? DEFAULT_STORAGE_ROOT;
const sanitizeEnvValue = (value: string) => value.trim().replace(/^["']|["']$/g, "");
const looksLikeJwt = (value: string) => {
  const parts = value.split(".");
  return parts.length === 3 && parts.every(Boolean);
};

const SUPABASE_URL = sanitizeEnvValue(process.env.SUPABASE_URL ?? "");
const SUPABASE_SERVICE_ROLE_KEY = sanitizeEnvValue(process.env.SUPABASE_SERVICE_ROLE_KEY ?? "");
const SUPABASE_ANON_KEY = sanitizeEnvValue(process.env.SUPABASE_ANON_KEY ?? "");
const STORAGE_BUCKET = process.env.SUPABASE_STORAGE_BUCKET ?? "invoices";
const SUPABASE_KEY = looksLikeJwt(SUPABASE_SERVICE_ROLE_KEY)
  ? SUPABASE_SERVICE_ROLE_KEY
  : looksLikeJwt(SUPABASE_ANON_KEY)
    ? SUPABASE_ANON_KEY
    : "";
const SUPABASE_CONFIG_ERROR = SUPABASE_URL
  ? SUPABASE_KEY
    ? null
    : "Supabase storage key is invalid. Set SUPABASE_SERVICE_ROLE_KEY to the service_role API key (JWT)."
  : null;
const USE_SUPABASE_STORAGE = Boolean(SUPABASE_URL);

const globalForSupabase = globalThis as unknown as { supabaseStorageClient?: SupabaseClient };

const getSupabaseClient = () => {
  if (!USE_SUPABASE_STORAGE) return null;
  if (SUPABASE_CONFIG_ERROR) {
    throw new Error(SUPABASE_CONFIG_ERROR);
  }
  if (!globalForSupabase.supabaseStorageClient) {
    globalForSupabase.supabaseStorageClient = createClient(SUPABASE_URL, SUPABASE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
  }
  return globalForSupabase.supabaseStorageClient;
};

const toSafePath = (storagePath: string) => storagePath.replace(/^\/+/, "");

const toNotFoundError = (message: string) => {
  const err = new Error(message) as NodeJS.ErrnoException;
  err.code = "ENOENT";
  return err;
};

const createSignedUrl = async (storagePath: string, expiresInSeconds = 60) => {
  const supabase = getSupabaseClient();
  if (!supabase) {
    throw new Error("Supabase storage is not configured");
  }
  const { data, error } = await supabase.storage.from(STORAGE_BUCKET).createSignedUrl(storagePath, expiresInSeconds);
  if (error || !data?.signedUrl) {
    if (error?.message?.toLowerCase().includes("not found")) {
      throw toNotFoundError("File not found in storage");
    }
    throw new Error(error?.message ?? "Failed to create signed storage URL");
  }
  return data.signedUrl;
};

export async function persistFile(
  buffer: Buffer,
  storagePath: string,
  options?: { contentType?: string | null },
) {
  const safePath = toSafePath(storagePath);
  if (USE_SUPABASE_STORAGE) {
    const supabase = getSupabaseClient();
    if (!supabase) throw new Error("Supabase storage is not configured");
    const { error } = await supabase.storage.from(STORAGE_BUCKET).upload(safePath, buffer, {
      contentType: options?.contentType ?? "application/octet-stream",
      upsert: false,
    });
    if (error) {
      throw new Error(`Failed to upload file to storage: ${error.message}`);
    }
    return safePath;
  }

  const targetPath = path.join(STORAGE_ROOT, safePath);
  const dir = path.dirname(targetPath);
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(targetPath, buffer);
  return targetPath;
}

export function getPublicStoragePath(storagePath: string) {
  const safePath = toSafePath(storagePath);
  return path.join(STORAGE_ROOT, safePath);
}

export async function statStorageFile(storagePath: string) {
  const safePath = toSafePath(storagePath);
  if (USE_SUPABASE_STORAGE) {
    const signedUrl = await createSignedUrl(safePath);
    const res = await fetch(signedUrl, { method: "HEAD" });
    if (res.status === 404) {
      throw toNotFoundError("File not found in storage");
    }
    if (!res.ok) {
      return { size: undefined };
    }
    const sizeHeader = res.headers.get("content-length");
    return { size: sizeHeader ? Number(sizeHeader) : undefined };
  }

  const stats = await fs.stat(getPublicStoragePath(safePath));
  return { size: stats.size };
}

export async function createStorageReadStream(storagePath: string): Promise<ReadableStream<Uint8Array>> {
  const safePath = toSafePath(storagePath);
  if (USE_SUPABASE_STORAGE) {
    const signedUrl = await createSignedUrl(safePath);
    const res = await fetch(signedUrl);
    if (res.status === 404) {
      throw toNotFoundError("File not found in storage");
    }
    if (!res.ok || !res.body) {
      throw new Error(`Failed to download storage file (${res.status})`);
    }
    return res.body as ReadableStream<Uint8Array>;
  }

  const targetPath = getPublicStoragePath(safePath);
  return Readable.toWeb(createReadStream(targetPath)) as ReadableStream<Uint8Array>;
}

const isNotFoundMessage = (message: string | undefined) => message?.toLowerCase().includes("not found");

export async function removeStorageFiles(storagePaths: string[]) {
  const safePaths = storagePaths.map(toSafePath).filter(Boolean);
  if (safePaths.length === 0) return;
  if (USE_SUPABASE_STORAGE) {
    const supabase = getSupabaseClient();
    if (!supabase) throw new Error("Supabase storage is not configured");
    const { error } = await supabase.storage.from(STORAGE_BUCKET).remove(safePaths);
    if (error && !isNotFoundMessage(error.message)) {
      throw new Error(`Failed to remove storage files: ${error.message}`);
    }
    return;
  }

  await Promise.all(
    safePaths.map(async (storagePath) => {
      const targetPath = getPublicStoragePath(storagePath);
      try {
        await fs.unlink(targetPath);
      } catch (err) {
        if ((err as NodeJS.ErrnoException).code !== "ENOENT") {
          throw err;
        }
      }
    }),
  );
}
