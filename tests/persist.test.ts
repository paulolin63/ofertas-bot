import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Regressão (2026-11-17): o .gitignore tinha `data/*.json` sem exceção para
// data/posted.json, então o passo "Persist posted history" do workflow fazia
// `git add data/posted.json` sem efeito — o arquivo nunca era commitado, o
// runner efêmero começava sempre com o banco vazio e os mesmos brindes eram
// repostados a cada execução (Knightica e My Darkest Witch foram postados
// duas vezes em 2026-11-17). O workflow agora usa `git add -f`, e o
// .gitignore tem a exceção abaixo; este teste trava a exceção.
test("gitignore não ignora data/posted.json (banco de deduplicação)", () => {
  const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const gitignore = fs.readFileSync(path.join(repoRoot, ".gitignore"), "utf8");
  const lines = gitignore.split("\n").map((l) => l.trim());
  assert.ok(
    lines.includes("!data/posted.json"),
    ".gitignore precisa ter a linha '!data/posted.json' para o posted.json ser commitado",
  );
});
