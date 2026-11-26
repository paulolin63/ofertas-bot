import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const STORE_NAME = "ml-refresh-token.enc";
const AAD = Buffer.from("ofertas-bot/ml-refresh-token/v1", "utf8");
const IV_BYTES = 12;
const KEY_BYTES = 32;
const TAG_BYTES = 16;

interface EncryptedRefreshToken {
  version: 1;
  algorithm: "aes-256-gcm";
  iv: string;
  tag: string;
  ciphertext: string;
}

function decodeKey(base64Key: string): Buffer {
  const normalized = base64Key.trim();
  if (!normalized || !/^[A-Za-z0-9+/]+={0,2}$/.test(normalized)) {
    throw new Error("ML_REFRESH_TOKEN_ENCRYPTION_KEY must be base64-encoded 32-byte key data");
  }
  const key = Buffer.from(normalized, "base64");
  if (key.length !== KEY_BYTES) {
    throw new Error("ML_REFRESH_TOKEN_ENCRYPTION_KEY must decode to exactly 32 bytes");
  }
  return key;
}

export function mlRefreshTokenStorePath(dataDir: string): string {
  return path.join(dataDir, STORE_NAME);
}

export function encryptMlRefreshToken(refreshToken: string, base64Key: string): string {
  if (!refreshToken) throw new Error("Cannot encrypt an empty ML refresh token");
  const key = decodeKey(base64Key);
  const iv = crypto.randomBytes(IV_BYTES);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  cipher.setAAD(AAD);
  const ciphertext = Buffer.concat([cipher.update(refreshToken, "utf8"), cipher.final()]);
  const record: EncryptedRefreshToken = {
    version: 1,
    algorithm: "aes-256-gcm",
    iv: iv.toString("base64"),
    tag: cipher.getAuthTag().toString("base64"),
    ciphertext: ciphertext.toString("base64"),
  };
  return `${JSON.stringify(record)}\n`;
}

export function decryptMlRefreshToken(serialized: string, base64Key: string): string {
  const key = decodeKey(base64Key);
  let parsed: unknown;
  try {
    parsed = JSON.parse(serialized) as unknown;
  } catch {
    throw new Error("Encrypted ML refresh-token store is not valid JSON");
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("Encrypted ML refresh-token store has an unsupported format");
  }
  const record = parsed as Partial<EncryptedRefreshToken>;
  if (
    record.version !== 1 ||
    record.algorithm !== "aes-256-gcm" ||
    typeof record.iv !== "string" ||
    typeof record.tag !== "string" ||
    typeof record.ciphertext !== "string"
  ) {
    throw new Error("Encrypted ML refresh-token store has an unsupported format");
  }

  try {
    const iv = Buffer.from(record.iv, "base64");
    const tag = Buffer.from(record.tag, "base64");
    const ciphertext = Buffer.from(record.ciphertext, "base64");
    if (iv.length !== IV_BYTES || tag.length !== TAG_BYTES || ciphertext.length === 0) {
      throw new Error("invalid encrypted token fields");
    }
    const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAAD(AAD);
    decipher.setAuthTag(tag);
    const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
    if (!plaintext) throw new Error("empty decrypted token");
    return plaintext;
  } catch {
    throw new Error("Cannot decrypt ML refresh-token store; verify ML_REFRESH_TOKEN_ENCRYPTION_KEY");
  }
}

/** Uses the encrypted rotating token if present, otherwise the one-time bootstrap secret. */
export function loadMlRefreshToken(
  dataDir: string,
  base64Key: string,
  bootstrapToken: string,
): string | null {
  const storePath = mlRefreshTokenStorePath(dataDir);
  if (fs.existsSync(storePath)) {
    return decryptMlRefreshToken(fs.readFileSync(storePath, "utf8"), base64Key);
  }
  return bootstrapToken.trim() || null;
}

/** Atomically writes only encrypted token material; the plaintext is never written to disk. */
export function saveMlRefreshToken(
  dataDir: string,
  refreshToken: string,
  base64Key: string,
): void {
  const storePath = mlRefreshTokenStorePath(dataDir);
  const directory = path.dirname(storePath);
  fs.mkdirSync(directory, { recursive: true });
  const temporaryPath = `${storePath}.${process.pid}.${crypto.randomBytes(6).toString("hex")}.tmp`;
  try {
    fs.writeFileSync(temporaryPath, encryptMlRefreshToken(refreshToken, base64Key), {
      encoding: "utf8",
      mode: 0o600,
    });
    fs.renameSync(temporaryPath, storePath);
  } finally {
    if (fs.existsSync(temporaryPath)) fs.rmSync(temporaryPath, { force: true });
  }
}
