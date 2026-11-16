import fs from "node:fs";
import path from "node:path";

/** Registro simples de ofertas já postadas (deduplicação entre execuções). */
export interface PostedStore {
  posted: Record<string, { at: string; title: string }>;
}

export class PostedDb {
  private file: string;
  private data: PostedStore = { posted: {} };

  constructor(dataDir: string) {
    fs.mkdirSync(dataDir, { recursive: true });
    this.file = path.join(dataDir, "posted.json");
    this.load();
  }

  private load(): void {
    if (!fs.existsSync(this.file)) return;
    try {
      const parsed = JSON.parse(fs.readFileSync(this.file, "utf8")) as PostedStore;
      if (parsed && typeof parsed.posted === "object") this.data = parsed;
    } catch {
      this.data = { posted: {} };
    }
  }

  has(key: string): boolean {
    return key in this.data.posted;
  }

  mark(key: string, title: string): void {
    this.data.posted[key] = { at: new Date().toISOString(), title };
  }

  /** Remove registros com mais de 30 dias (a oferta pode voltar a valer). */
  prune(maxAgeDays = 30): void {
    const cutoff = Date.now() - maxAgeDays * 24 * 60 * 60 * 1000;
    for (const [key, value] of Object.entries(this.data.posted)) {
      if (new Date(value.at).getTime() < cutoff) delete this.data.posted[key];
    }
  }

  save(): void {
    fs.writeFileSync(this.file, JSON.stringify(this.data, null, 2));
  }

  get size(): number {
    return Object.keys(this.data.posted).length;
  }
}
