import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { loadCanon } from "../server/canon.js";
import { GameEngine } from "../server/engine.js";
import { LlmNarrator } from "../server/narrators/llm.js";

const canon = await loadCanon();

// 一个最小的 OpenAI 兼容服务，用来在没有外网的情况下验证接入链路。
async function mockModel(handler) {
  const server = http.createServer((req, res) => {
    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", () => {
      const payload = JSON.parse(body || "{}");
      const content = handler(payload);
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ choices: [{ message: { content } }] }));
    });
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  return { server, baseUrl: `http://127.0.0.1:${server.address().port}/v1` };
}

function optionIds(payload) {
  const user = payload.messages.find((m) => m.role === "user").content;
  return [...user.matchAll(/id=(o\d+)/g)].map((m) => m[1]);
}

test("接入兼容接口：模型执笔、选项按 id 对齐", async () => {
  const { server, baseUrl } = await mockModel((payload) => {
    const ids = optionIds(payload);
    return JSON.stringify({
      prose: "雨落在青石板上，你把剑横在膝上，听着远处的更鼓。这一夜很长，长得像是要把整个江湖都装进去。",
      options: ids.map((id, index) => ({ id, text: `第${index + 1}条路` }))
    });
  });
  const narrator = new LlmNarrator({ baseUrl, apiKey: "test-key", model: "mock-model" });
  const engine = new GameEngine({ canon, narrator });
  const state = await engine.start(20261105);

  assert.equal(state.pendingScene.source, "llm");
  assert.match(state.pendingScene.prose, /青石板/);
  assert.deepEqual(
    state.pendingScene.options.map((o) => o.text),
    state.pendingScene.options.map((_, index) => `第${index + 1}条路`)
  );
  assert.equal(state.pendingScene.options.length, 4);
  await new Promise((resolve) => server.close(resolve));
});

test("模型写错设定时先重试，重试仍错则退回离线叙述者", async () => {
  let calls = 0;
  const { server, baseUrl } = await mockModel((payload) => {
    calls += 1;
    const ids = optionIds(payload);
    return JSON.stringify({
      prose: "你打开系统面板，看到等级提升了，于是点开任务栏，准备去做日常任务。",
      options: ids.map((id) => ({ id, text: "随便走走" }))
    });
  });
  const narrator = new LlmNarrator({ baseUrl, apiKey: "test-key", model: "mock-model" });
  const engine = new GameEngine({ canon, narrator });
  const state = await engine.start(424242);

  assert.equal(calls, 2, "应当重试一次");
  assert.equal(state.pendingScene.source, "offline");
  assert.ok(!state.pendingScene.prose.includes("系统"));
  assert.equal(state.pendingScene.options.length, 4);
  await new Promise((resolve) => server.close(resolve));
});

test("接口报错时静默回退，不阻断回合", async () => {
  const server = http.createServer((req, res) => {
    res.writeHead(500, { "content-type": "application/json" });
    res.end(JSON.stringify({ error: "upstream down" }));
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const baseUrl = `http://127.0.0.1:${server.address().port}/v1`;
  const narrator = new LlmNarrator({ baseUrl, apiKey: "test-key", model: "mock-model" });
  const engine = new GameEngine({ canon, narrator });
  const state = await engine.start(777);
  assert.equal(state.pendingScene.source, "offline");
  assert.ok(state.pendingScene.prose.length > 20);
  assert.match(state.flags._llm_error, /HTTP 500/);
  await new Promise((resolve) => server.close(resolve));
});

test("未配置密钥时不发请求，直接走离线叙述者", async () => {
  let called = false;
  const server = http.createServer((req, res) => {
    called = true;
    res.end("{}");
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const baseUrl = `http://127.0.0.1:${server.address().port}/v1`;
  const narrator = new LlmNarrator({ baseUrl, apiKey: "", model: "mock" });
  const engine = new GameEngine({ canon, narrator });
  const state = await engine.start(1);
  assert.equal(called, false);
  assert.equal(state.pendingScene.source, "offline");
  await new Promise((resolve) => server.close(resolve));
});
