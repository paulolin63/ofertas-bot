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
test("gitignore não ignora data/posted.json nem data/amazon-cache.json", () => {
  const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const gitignore = fs.readFileSync(path.join(repoRoot, ".gitignore"), "utf8");
  const lines = gitignore.split("\n").map((l) => l.trim());
  assert.ok(
    lines.includes("!data/posted.json"),
    ".gitignore precisa ter a linha '!data/posted.json' para o posted.json ser commitado",
  );
  assert.ok(
    lines.includes("!data/amazon-cache.json"),
    ".gitignore precisa ter a linha '!data/amazon-cache.json' para o cache diário ser persistido",
  );
});

test("workflows que fazem git push usam concurrency e git pull --rebase", () => {
  const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  for (const name of ["post-deals.yml", "post-ml-deal.yml", "ai-news-digest.yml"]) {
    const content = fs.readFileSync(path.join(repoRoot, ".github", "workflows", name), "utf8");
    assert.match(content, /^concurrency:/m, `${name} precisa definir concurrency`);
    assert.match(content, /git pull --rebase/, `${name} precisa fazer git pull --rebase antes do push`);
  }
  const ci = fs.readFileSync(path.join(repoRoot, ".github", "workflows", "ci.yml"), "utf8");
  assert.match(ci, /npm run typecheck/);
  assert.match(ci, /npm test/);
});
