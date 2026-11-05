import test from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";
import { fileURLToPath } from "node:url";

const run = promisify(execFile);
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

test("设定文档与 canon/*.json 完全一致", async () => {
  await run(process.execPath, ["scripts/build-docs.mjs", "--check"], { cwd: ROOT });
});

test("文档覆盖全部固定设定", async () => {
  const { readFile } = await import("node:fs/promises");
  const { loadCanon } = await import("../server/canon.js");
  const canon = await loadCanon();
  const docs = {};
  for (const file of ["00-世界总纲.md", "01-门派志.md", "02-武学谱.md", "03-神兵录.md", "04-人物志.md", "05-大主线.md", "06-结局录.md"]) {
    docs[file] = await readFile(path.join(ROOT, "docs", file), "utf8");
  }
  for (const sect of canon.sects) {
    assert.ok(docs["01-门派志.md"].includes(sect.name), `门派 ${sect.name} 未进文档`);
  }
  for (const weapon of canon.weapons) {
    assert.ok(docs["03-神兵录.md"].includes(weapon.name), `神兵 ${weapon.name} 未进文档`);
  }
  for (const character of canon.characters) {
    assert.ok(docs["04-人物志.md"].includes(character.name), `人物 ${character.name} 未进文档`);
  }
  for (const beat of canon.beats) {
    assert.ok(docs["05-大主线.md"].includes(beat.title), `主线事件 ${beat.title} 未进文档`);
  }
});
