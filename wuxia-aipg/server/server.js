// HTTP 服务：静态页面 + 游戏 API。零运行时依赖，node server/server.js 即可开玩。

import http from "node:http";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { loadCanon, publicCanon } from "./canon.js";
import { loadConfig } from "./config.js";
import { GameEngine, cryptoSeed } from "./engine.js";
import { LlmNarrator } from "./narrators/llm.js";
import { GameStore } from "./store.js";

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
  ".map": "application/json; charset=utf-8"
};

export async function createApp(config = loadConfig()) {
  const canon = await loadCanon(config.canonDir);
  if (!canon.integrity.ok) {
    throw new Error(`设定文档自检失败：\n${canon.integrity.errors.join("\n")}`);
  }

  const narrator = new LlmNarrator(config.llm);
  const engine = new GameEngine({ canon, narrator });
  const store = new GameStore({ dataDir: config.dataDir });
  await store.init();

  async function handler(req, res) {
    const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
    try {
      if (url.pathname.startsWith("/api/")) {
        await handleApi({ req, res, url, canon, engine, store, narrator });
        return;
      }
      await serveStatic({ req, res, url, webDir: config.webDir });
    } catch (error) {
      sendJson(res, 500, { error: error.message || "服务器错误" });
    }
  }

  const server = http.createServer(handler);
  return { server, canon, engine, store, narrator, config };
}

async function handleApi({ req, res, url, canon, engine, store, narrator }) {
  const parts = url.pathname
    .replace(/^\/api\/?/, "")
    .split("/")
    .filter(Boolean)
    .map((part) => {
      try {
        return decodeURIComponent(part);
      } catch {
        return part;
      }
    });
  const method = req.method || "GET";

  if (parts[0] === "health" && method === "GET") {
    return sendJson(res, 200, {
      ok: true,
      canon: { ok: canon.integrity.ok, errors: canon.integrity.errors },
      narrator: narrator.describe(),
      llm: narrator.available,
      writer: "大衍江湖",
      turns: canon.world.rules.maxTurns
    });
  }

  if (parts[0] === "canon" && method === "GET") {
    return sendJson(res, 200, publicCanon(canon));
  }

  if (parts[0] === "life" && method === "GET") {
    const seed = Number(url.searchParams.get("seed")) >>> 0 || cryptoSeed();
    return sendJson(res, 200, engine.newLife(seed));
  }

  if (parts[0] === "game" && parts.length === 1 && method === "POST") {
    const body = await readJson(req);
    const seed = Number(body.seed) >>> 0 || cryptoSeed();
    const state = await engine.start(seed);
    store.put(state);
    return sendJson(res, 201, { id: state.id, view: engine.view(state) });
  }

  if (parts[0] === "game" && parts.length === 3 && parts[2] === "action" && method === "POST") {
    const state = store.get(parts[1]);
    if (!state) return sendJson(res, 404, { error: "这一局已经不在server上了，读档再来" });
    const body = await readJson(req);
    await engine.act(state, String(body.optionId || ""));
    store.put(state);
    return sendJson(res, 200, { id: state.id, view: engine.view(state) });
  }

  if (parts[0] === "game" && parts.length === 3 && parts[2] === "save" && method === "POST") {
    const state = store.get(parts[1]);
    if (!state) return sendJson(res, 404, { error: "找不到这一局" });
    const body = await readJson(req);
    const saved = await store.save(state, body.slot || state.id);
    return sendJson(res, 200, { ok: true, ...saved });
  }

  if (parts[0] === "game" && parts.length === 2 && method === "GET") {
    const state = store.get(parts[1]);
    if (!state) return sendJson(res, 404, { error: "找不到这一局" });
    return sendJson(res, 200, { id: state.id, view: engine.view(state) });
  }

  if (parts[0] === "saves" && parts.length === 1 && method === "GET") {
    return sendJson(res, 200, { saves: await store.list() });
  }

  if (parts[0] === "saves" && parts.length === 2 && method === "POST") {
    const body = await readJson(req);
    const payload = await store.load(parts[1] || body.slot);
    return sendJson(res, 200, { id: payload.state.id, view: engine.view(payload.state) });
  }

  if (parts[0] === "saves" && parts.length === 2 && method === "DELETE") {
    return sendJson(res, 200, await store.remove(parts[1]));
  }

  sendJson(res, 404, { error: "没有这个接口" });
}

async function serveStatic({ req, res, url, webDir }) {
  let pathname = decodeURIComponent(url.pathname);
  if (pathname === "/") pathname = "/index.html";
  const target = path.normalize(path.join(webDir, pathname));
  if (!target.startsWith(path.normalize(webDir))) {
    return sendText(res, 403, "forbidden");
  }
  try {
    const info = await stat(target);
    if (!info.isFile()) throw new Error("not a file");
    const data = await readFile(target);
    res.writeHead(200, {
      "content-type": MIME[path.extname(target)] || "application/octet-stream",
      "cache-control": "no-cache",
      "x-content-type-options": "nosniff",
      "referrer-policy": "no-referrer",
      "content-security-policy":
        "default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self'; base-uri 'none'; form-action 'none'"
    });
    res.end(data);
  } catch {
    sendText(res, 404, "江湖路断，此处无路（404）");
  }
}

function sendJson(res, status, data) {
  const body = JSON.stringify(data);
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store"
  });
  res.end(body);
}

function sendText(res, status, text) {
  res.writeHead(status, { "content-type": "text/plain; charset=utf-8" });
  res.end(text);
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (chunk) => {
      data += chunk;
      if (data.length > 64 * 1024) {
        reject(new Error("请求体过大"));
        req.destroy();
      }
    });
    req.on("end", () => {
      if (!data) return resolve({});
      try {
        resolve(JSON.parse(data));
      } catch {
        reject(new Error("请求体不是合法 JSON"));
      }
    });
    req.on("error", reject);
  });
}
