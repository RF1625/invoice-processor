import crypto from "node:crypto";

const IV_LENGTH = 12; // AES-GCM recommended IV length
const TAG_LENGTH = 16;

const buildKey = () => {
  const raw = process.env.MAILBOX_SECRET_KEY;
  if (!raw) {
    throw new Error("MAILBOX_SECRET_KEY env var is required to store mailbox secrets");
  }

  if (/^[0-9a-fA-F]{64}$/.test(raw)) {
    return Buffer.from(raw, "hex");
  }

  if (/^[A-Za-z0-9+/=]{43,44}$/.test(raw)) {
    const buf = Buffer.from(raw, "base64");
    if (buf.length === 32) return buf;
  }

  // Derive a 32-byte key from an arbitrary string
  return crypto.createHash("sha256").update(raw).digest();
};

const getKey = (() => {
  let cached: Buffer | null = null;
  return () => {
    if (!cached) cached = buildKey();
    return cached;
  };
})();

export function encryptSecret(value: string) {
  const key = getKey();
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return Buffer.concat([iv, authTag, ciphertext]).toString("base64");
}

export function decryptSecret(payload: string | null | undefined) {
  if (!payload) return null;
  const key = getKey();
  const buf = Buffer.from(payload, "base64");
  if (buf.length < IV_LENGTH + TAG_LENGTH + 1) {
    throw new Error("Invalid encrypted payload");
  }
  const iv = buf.subarray(0, IV_LENGTH);
  const authTag = buf.subarray(IV_LENGTH, IV_LENGTH + TAG_LENGTH);
  const ciphertext = buf.subarray(IV_LENGTH + TAG_LENGTH);
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(authTag);
  const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return plaintext.toString("utf8");
}
