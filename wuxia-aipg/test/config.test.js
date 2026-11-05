import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describeConfig, loadConfig, readConfigFile, resolveConfigPath, DEFAULTS } from "../server/config.js";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const dir = await mkdtemp(path.join(tmpdir(), "wuxia-config-"));

async function writeConfig(name, value) {
  const file = path.join(dir, name);
  await writeFile(file, typeof value === "string" ? value : JSON.stringify(value, null, 2), "utf8");
  return file;
}

test("没有配置文件时使用内置默认值：deepseek-flash + DeepSeek 接口", () => {
  const config = loadConfig({ WUXIA_CONFIG: path.join(dir, "absent.json") });
  assert.equal(config.llm.model, "deepseek-flash");
  assert.equal(config.llm.baseUrl, "https://api.deepseek.com/v1");
  assert.equal(config.llm.apiKey, "");
  assert.equal(config.port, 3100);
  assert.equal(config.configFile, null);
});

test("配置文件生效：模型、地址、密钥、端口都可写入", async () => {
  const file = await writeConfig("config.json", {
    host: "0.0.0.0",
    port: 3210,
    dataDir: "./saves",
    llm: {
      baseUrl: "https://api.deepseek.com/v1/",
      apiKey: "sk-file-key",
      model: "deepseek-chat",
      temperature: 0.6,
      timeoutMs: 20000
    }
  });
  const config = loadConfig({ WUXIA_CONFIG: file });
  assert.equal(config.host, "0.0.0.0");
  assert.equal(config.port, 3210);
  assert.equal(config.dataDir, path.join(dir, "saves"), "相对路径应相对配置文件解析");
  assert.equal(config.llm.model, "deepseek-chat");
  assert.equal(config.llm.baseUrl, "https://api.deepseek.com/v1", "结尾斜杠应被去掉");
  assert.equal(config.llm.apiKey, "sk-file-key");
  assert.equal(config.llm.temperature, 0.6);
  assert.equal(config.llm.timeoutMs, 20000);
  assert.equal(config.configFile, file);
});

test("环境变量优先级高于配置文件", async () => {
  const file = await writeConfig("priority.json", {
    port: 3001,
    llm: { apiKey: "sk-file", model: "file-model", baseUrl: "https://file.example/v1" }
  });
  const config = loadConfig({
    WUXIA_CONFIG: file,
    WUXIA_PORT: "3999",
    LLM_API_KEY: "sk-env",
    LLM_MODEL: "env-model",
    LLM_BASE_URL: "https://env.example/v1"
  });
  assert.equal(config.port, 3999);
  assert.equal(config.llm.apiKey, "sk-env");
  assert.equal(config.llm.model, "env-model");
  assert.equal(config.llm.baseUrl, "https://env.example/v1");
});

test("非法配置会给出明确错误，而不是静默降级", async () => {
  const broken = await writeConfig("broken.json", "{ not json");
  assert.throws(() => loadConfig({ WUXIA_CONFIG: broken }), /不是合法 JSON/);

  const wrongType = await writeConfig("wrong.json", { llm: "sk-xxx" });
  assert.throws(() => loadConfig({ WUXIA_CONFIG: wrongType }), /llm 必须是对象/);

  const array = await writeConfig("array.json", "[]");
  assert.throws(() => loadConfig({ WUXIA_CONFIG: array }), /顶层必须是对象/);
});

test("端口与温度越界时回落到默认值", async () => {
  const file = await writeConfig("bounds.json", { port: 99999, llm: { temperature: 9 } });
  const config = loadConfig({ WUXIA_CONFIG: file });
  assert.equal(config.port, 3100);
  assert.equal(config.llm.temperature, 0.85);
});

test("example 配置可直接复制使用，且默认模型为 deepseek-flash", async () => {
  const text = await readFile(path.join(ROOT, "config.example.json"), "utf8");
  const example = JSON.parse(text);
  assert.equal(example.llm.model, "deepseek-flash");
  assert.equal(example.llm.baseUrl, "https://api.deepseek.com/v1");
  assert.equal(typeof example.llm.apiKey, "string");
  assert.ok(example.llm.apiKey.length > 0);
  const file = await writeConfig("from-example.json", example);
  const config = loadConfig({ WUXIA_CONFIG: file });
  assert.equal(config.llm.model, "deepseek-flash");
  assert.equal(config.llm.apiKey, "sk-在这里填你的-key");
});

test("默认配置路径是项目内的 config.local.json，可用 WUXIA_CONFIG 覆盖", () => {
  const fallback = resolveConfigPath({});
  assert.equal(path.basename(fallback), "config.local.json");
  assert.equal(resolveConfigPath({ WUXIA_CONFIG: "/tmp/x.json" }), "/tmp/x.json");
});

test("诊断信息只报告是否配置了密钥，不泄露密钥", () => {
  const info = describeConfig({
    configFile: "/tmp/config.local.json",
    llm: { baseUrl: "https://api.deepseek.com/v1", apiKey: "sk-secret", model: "deepseek-flash" }
  });
  assert.equal(JSON.stringify(info).includes("sk-secret"), false);
  assert.equal(info.apiKey, "已配置");
  assert.match(info.file, /config\.local\.json$/);
});

test("readConfigFile 对不存在的文件返回空对象，required 时报错", () => {
  assert.deepEqual(readConfigFile(path.join(dir, "missing.json")), {});
  assert.throws(() => readConfigFile(path.join(dir, "missing.json"), { required: true }), /配置文件不存在/);
});
