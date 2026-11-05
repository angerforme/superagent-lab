import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createApp } from "../server/server.js";
import { loadConfig } from "../server/config.js";

const dir = await mkdtemp(path.join(tmpdir(), "wuxia-test-"));
const config = { ...loadConfig({}), dataDir: dir, port: 0 };
const { server, store } = await createApp(config);
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const base = `http://127.0.0.1:${server.address().port}`;

async function json(pathname, options) {
  const response = await fetch(base + pathname, {
    headers: { "content-type": "application/json" },
    ...options
  });
  return { status: response.status, body: await response.json().catch(() => ({})) };
}

test("健康检查报告设定状态与叙述者", async () => {
  const { status, body } = await json("/api/health");
  assert.equal(status, 200);
  assert.equal(body.ok, true);
  assert.equal(body.canon.ok, true);
  assert.equal(body.narrator, "offline");
  assert.equal(body.turns, 24);
});

test("典籍接口暴露固定的门派、武学、神兵、人物与主线", async () => {
  const { status, body } = await json("/api/canon");
  assert.equal(status, 200);
  assert.equal(body.sects.length, 12);
  assert.equal(body.weapons.length, 9);
  assert.equal(body.characters.length, 17);
  assert.equal(body.acts.length, 5);
  assert.ok(body.arts.length >= 30);
  // 公开视图不含暗线
  assert.equal(body.characters.some((c) => "secret" in c), false);
});

test("完整一局：开局、行动、存档、读档", async () => {
  const start = await json("/api/game", { method: "POST", body: JSON.stringify({ seed: 20261105 }) });
  assert.equal(start.status, 201);
  const id = start.body.id;
  assert.ok(id);
  assert.equal(start.body.view.scene.options.length, 4);

  let view = start.body.view;
  for (let i = 0; i < 3; i++) {
    const option = view.scene.options[i % view.scene.options.length];
    const step = await json(`/api/game/${id}/action`, {
      method: "POST",
      body: JSON.stringify({ optionId: option.id })
    });
    assert.equal(step.status, 200);
    view = step.body.view;
    assert.ok(view.scene.prose.length > 20);
  }
  assert.equal(view.turn, 3);

  const save = await json(`/api/game/${id}/save`, { method: "POST", body: JSON.stringify({ slot: "测试存档" }) });
  assert.equal(save.status, 200);
  assert.equal(save.body.slot, "测试存档");

  const list = await json("/api/saves");
  assert.ok(list.body.saves.some((s) => s.slot === "测试存档"));

  const loaded = await json(`/api/saves/${encodeURIComponent("测试存档")}`, { method: "POST", body: "{}" });
  assert.equal(loaded.status, 200);
  assert.equal(loaded.body.view.turn, 3);
  assert.equal(loaded.body.view.life.name, view.life.name);

  // 存档可以重复读档并继续推进
  const option = loaded.body.view.scene.options[0];
  const step = await json(`/api/game/${loaded.body.id}/action`, {
    method: "POST",
    body: JSON.stringify({ optionId: option.id })
  });
  assert.equal(step.status, 200);
  assert.equal(step.body.view.turn, 4);

  await json(`/api/saves/${encodeURIComponent("测试存档")}`, { method: "DELETE" });
  const after = await json("/api/saves");
  assert.equal(after.body.saves.some((s) => s.slot === "测试存档"), false);
});

test("无效选项与不存在的对局都返回明确错误", async () => {
  const start = await json("/api/game", { method: "POST", body: JSON.stringify({ seed: 7 }) });
  const bad = await json(`/api/game/${start.body.id}/action`, {
    method: "POST",
    body: JSON.stringify({ optionId: "o99" })
  });
  assert.equal(bad.status, 500);
  assert.match(bad.body.error, /选项已失效/);

  const missing = await json("/api/game/does-not-exist");
  assert.equal(missing.status, 404);
});

test("静态页面可访问，且拒绝目录穿越", async () => {
  const page = await fetch(base + "/");
  assert.equal(page.status, 200);
  assert.match(page.headers.get("content-type"), /text\/html/);
  const html = await page.text();
  assert.ok(html.includes("大衍江湖"));

  const css = await fetch(base + "/css/style.css");
  assert.equal(css.status, 200);

  const escape = await fetch(base + "/../package.json");
  assert.ok([403, 404].includes(escape.status), `越界请求返回 ${escape.status}`);
});

test.after(async () => {
  await new Promise((resolve) => server.close(resolve));
  for (const game of store.games.values()) store.delete(game.id);
  await rm(dir, { recursive: true, force: true });
});
