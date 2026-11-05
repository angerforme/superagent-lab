// 运行配置：全部来自环境变量，缺省即可离线开玩。

import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.join(HERE, "..");

export function loadConfig(env = process.env) {
  return {
    host: env.WUXIA_HOST || "127.0.0.1",
    port: Number(env.WUXIA_PORT || env.PORT || 3100),
    dataDir: env.WUXIA_DATA_DIR || path.join(ROOT, "data"),
    canonDir: env.WUXIA_CANON_DIR || path.join(ROOT, "canon"),
    webDir: path.join(ROOT, "web"),
    llm: {
      baseUrl: env.LLM_BASE_URL || env.OPENAI_BASE_URL || "https://api.openai.com/v1",
      apiKey: env.LLM_API_KEY || env.OPENAI_API_KEY || "",
      model: env.LLM_MODEL || "gpt-4o-mini",
      temperature: Number(env.LLM_TEMPERATURE || 0.85),
      timeoutMs: Number(env.LLM_TIMEOUT_MS || 45000)
    }
  };
}
