import fs from "node:fs/promises";
import path from "node:path";

const DEFAULT_STORAGE_ROOT = process.env.VERCEL
  ? "/tmp/invoice-processor"
  : path.join(process.cwd(), "storage");
const STORAGE_ROOT = process.env.STORAGE_ROOT ?? DEFAULT_STORAGE_ROOT;

export async function persistFile(buffer: Buffer, storagePath: string) {
  const safePath = storagePath.replace(/^\/+/, "");
  const targetPath = path.join(STORAGE_ROOT, safePath);
  const dir = path.dirname(targetPath);
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(targetPath, buffer);
  return targetPath;
}

export function getPublicStoragePath(storagePath: string) {
  const safePath = storagePath.replace(/^\/+/, "");
  return path.join(STORAGE_ROOT, safePath);
}
