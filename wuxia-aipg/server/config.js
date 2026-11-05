// 运行配置：优先读本地配置文件 config.local.json，其次环境变量覆盖，最后是内置默认值。
// 默认模型为 deepseek-flash；不填 API Key 时自动使用离线叙述者。

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.join(HERE, "..");
export const CONFIG_FILENAME = "config.local.json";

export const DEFAULTS = {
  host: "127.0.0.1",
  port: 3100,
  llm: {
    baseUrl: "https://api.deepseek.com/v1",
    apiKey: "",
    model: "deepseek-flash",
    temperature: 0.85,
    timeoutMs: 45000
  }
};

export function resolveConfigPath(env = process.env) {
  return env.WUXIA_CONFIG ? path.resolve(env.WUXIA_CONFIG) : path.join(ROOT, CONFIG_FILENAME);
}

export function loadConfig(env = process.env) {
  const configPath = resolveConfigPath(env);
  const file = readConfigFile(configPath);
  const baseDir = file.__found ? path.dirname(configPath) : ROOT;
  const llmFile = isObject(file.llm) ? file.llm : {};

  return {
    host: firstString(env.WUXIA_HOST, file.host, DEFAULTS.host),
    port: numberOrDefault(firstDefined(env.WUXIA_PORT, env.PORT, file.port), DEFAULTS.port, { min: 1, max: 65535 }),
    dataDir: resolvePath(baseDir, firstString(env.WUXIA_DATA_DIR, file.dataDir, path.join(ROOT, "data"))),
    canonDir: resolvePath(baseDir, firstString(env.WUXIA_CANON_DIR, file.canonDir, path.join(ROOT, "canon"))),
    webDir: path.join(ROOT, "web"),
    llm: {
      baseUrl: stripSlash(firstString(env.LLM_BASE_URL, env.OPENAI_BASE_URL, llmFile.baseUrl, DEFAULTS.llm.baseUrl)),
      apiKey: firstString(env.LLM_API_KEY, env.OPENAI_API_KEY, llmFile.apiKey, DEFAULTS.llm.apiKey),
      model: firstString(env.LLM_MODEL, llmFile.model, DEFAULTS.llm.model),
      temperature: numberOrDefault(firstDefined(env.LLM_TEMPERATURE, llmFile.temperature), DEFAULTS.llm.temperature, { min: 0, max: 2 }),
      timeoutMs: numberOrDefault(firstDefined(env.LLM_TIMEOUT_MS, llmFile.timeoutMs), DEFAULTS.llm.timeoutMs, { min: 1000, max: 600000 })
    },
    configFile: file.__found ? configPath : null
  };
}

// 供测试与诊断使用：读取并校验配置文件；不存在时返回空对象（除非 required）。
export function readConfigFile(file, { required = false } = {}) {
  let text;
  try {
    text = readFileSync(file, "utf8");
  } catch (error) {
    if (error.code === "ENOENT") {
      if (required) throw new Error(`配置文件不存在：${file}`);
      return {};
    }
    throw new Error(`读取配置文件失败：${file}（${error.message}）`);
  }

  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch (error) {
    throw new Error(`配置文件不是合法 JSON：${file}（${error.message}）`);
  }
  if (!isObject(parsed)) throw new Error(`配置文件顶层必须是对象：${file}`);
  if (parsed.llm !== undefined && !isObject(parsed.llm)) {
    throw new Error(`配置项 llm 必须是对象：${file}`);
  }
  return { ...parsed, __found: true };
}

// 日志用：只报告来源与是否配置了密钥，绝不打印密钥本身。
export function describeConfig(config) {
  return {
    file: config.configFile,
    model: config.llm.model,
    baseUrl: config.llm.baseUrl,
    apiKey: config.llm.apiKey ? "已配置" : "未配置"
  };
}

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function firstString(...values) {
  for (const value of values) {
    if (typeof value === "string" && value.trim() !== "") return value.trim();
  }
  return "";
}

function firstDefined(...values) {
  for (const value of values) {
    if (value === undefined || value === null || value === "") continue;
    return value;
  }
  return undefined;
}

function numberOrDefault(value, fallback, { min = -Infinity, max = Infinity } = {}) {
  const number = Number(value);
  return Number.isFinite(number) && number >= min && number <= max ? number : fallback;
}

function resolvePath(baseDir, target) {
  return path.isAbsolute(target) ? target : path.resolve(baseDir, target);
}

function stripSlash(url) {
  return String(url || "").replace(/\/+$/, "");
}
