import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  decryptMlRefreshToken,
  encryptMlRefreshToken,
  loadMlRefreshToken,
  mlRefreshTokenStorePath,
  saveMlRefreshToken,
} from "../src/ml/tokenStore.ts";

const KEY = Buffer.alloc(32, 0x5a).toString("base64");
const OTHER_KEY = Buffer.alloc(32, 0x33).toString("base64");

function withTempDir(fn: (dir: string) => void): void {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ml-token-store-"));
  try {
    fn(dir);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

test("refresh token is AES-256-GCM encrypted and round-trips", () => {
  const plaintext = "TG-private-refresh-token-value";
  const encrypted = encryptMlRefreshToken(plaintext, KEY);
  assert.ok(!encrypted.includes(plaintext));
  assert.equal(decryptMlRefreshToken(encrypted, KEY), plaintext);
});

test("refresh token store uses bootstrap secret once, then prefers encrypted rotation", () => {
  withTempDir((dir) => {
    const storePath = mlRefreshTokenStorePath(dir);
    assert.equal(loadMlRefreshToken(dir, KEY, "BOOTSTRAP-TOKEN"), "BOOTSTRAP-TOKEN");
    assert.equal(fs.existsSync(storePath), false, "loading the bootstrap token must not write a store");
    saveMlRefreshToken(dir, "ROTATED-TOKEN", KEY);
    const persisted = fs.readFileSync(storePath, "utf8");
    assert.ok(!persisted.includes("ROTATED-TOKEN"));
    assert.equal(loadMlRefreshToken(dir, KEY, "STALE-BOOTSTRAP-TOKEN"), "ROTATED-TOKEN");
  });
});

test("refresh token store fails closed for a wrong encryption key", () => {
  withTempDir((dir) => {
    saveMlRefreshToken(dir, "ROTATED-TOKEN", KEY);
    assert.throws(
      () => loadMlRefreshToken(dir, OTHER_KEY, "BOOTSTRAP-TOKEN"),
      /Cannot decrypt ML refresh-token store/,
    );
  });
});

test("refresh token encryption key must decode to exactly 32 bytes", () => {
  assert.throws(() => encryptMlRefreshToken("TOKEN", "not-a-base64-key"), /base64-encoded/);
  assert.throws(() => encryptMlRefreshToken("TOKEN", Buffer.alloc(16).toString("base64")), /32 bytes/);
});

test("tampered ciphertext is rejected", () => {
  const encrypted = JSON.parse(encryptMlRefreshToken("TOKEN", KEY)) as {
    version: number;
    algorithm: string;
    iv: string;
    tag: string;
    ciphertext: string;
  };
  encrypted.ciphertext = Buffer.from("tampered").toString("base64");
  assert.throws(
    () => decryptMlRefreshToken(JSON.stringify(encrypted), KEY),
    /Cannot decrypt ML refresh-token store/,
  );
});
