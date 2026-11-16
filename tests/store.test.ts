import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { PostedDb } from "../src/store/db.ts";

test("marca, consulta e persiste entre instâncias", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ofertas-db-"));
  const db = new PostedDb(dir);
  assert.equal(db.has("ml:MLB1"), false);
  db.mark("ml:MLB1", "Capacete");
  db.save();
  const db2 = new PostedDb(dir);
  assert.equal(db2.has("ml:MLB1"), true);
  assert.equal(db2.size, 1);
});

test("prune remove registros com mais de 30 dias", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ofertas-db-"));
  const db = new PostedDb(dir);
  db.mark("ml:OLD", "Antigo");
  db.save();
  const file = path.join(dir, "posted.json");
  const raw = JSON.parse(fs.readFileSync(file, "utf8")) as {
    posted: Record<string, { at: string; title: string }>;
  };
  raw.posted["ml:OLD"].at = new Date(Date.now() - 40 * 24 * 60 * 60 * 1000).toISOString();
  fs.writeFileSync(file, JSON.stringify(raw));
  const db2 = new PostedDb(dir);
  db2.prune();
  assert.equal(db2.has("ml:OLD"), false);
});
