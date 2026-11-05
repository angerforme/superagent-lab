// LLM 叙述者：任何 OpenAI 兼容的 Chat Completions 接口都能接。
// 它的职责只有一个：把引擎算好的结果写成武侠小说，并改写选项措辞。

import { guardScene, scenePrompt } from "../guard.js";
import { loreDigest } from "../canon.js";

const SYSTEM_PROMPT = `你是中文武侠小说的叙述者，为一部名为《大衍江湖》的文字江湖游戏执笔。

写作要求：
1. 用第二人称「你」叙述，古白话与白话相间，克制、有画面感，忌堆砌辞藻。
2. 每回合 180—420 字，只写本回合发生的事，不跳时间，不替玩家做决定。
3. 严格使用给定设定中的门派、武学、神兵、人物与地名；不得新增门派、神兵、绝世武学或重要人物。
4. 不得出现任何现代词汇与游戏术语（如系统、等级、经验、玩家、任务、直播等）。
5. 不得提前泄露尚未揭晓的秘密（如「执棋人」的真实身份）。
6. 只输出一个 JSON 对象，形如：
{"prose":"……","options":[{"id":"o1","text":"……"}]}
7. options 必须与给定选项一一对应：数量相同、顺序相同、id 相同，只改写为不超过 18 字的行动短语。`;

export class LlmNarrator {
  constructor({ baseUrl, apiKey, model, timeoutMs = 45000, temperature = 0.85 } = {}) {
    this.baseUrl = (baseUrl || "").replace(/\/+$/, "");
    this.apiKey = apiKey || "";
    this.model = model || "";
    this.timeoutMs = timeoutMs;
    this.temperature = temperature;
  }

  get available() {
    return Boolean(this.apiKey && this.baseUrl && this.model);
  }

  describe() {
    return this.available ? `${this.model} @ ${this.baseUrl}` : "offline";
  }

  async narrate({ canon, state, scene, outcome, options, retryHint = "" }) {
    if (!this.available) return null;
    const user = [
      loreDigest(canon, state, { beat: scene.beat, npcIds: scene.npcIds }),
      "",
      scenePrompt(canon, state, scene, outcome, options),
      retryHint ? `\n【上次输出的问题】${retryHint}` : ""
    ].join("\n");

    let raw;
    try {
      raw = await this.#chat([
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: user }
      ]);
    } catch (error) {
      return { error: `LLM 调用失败：${error.message}` };
    }

    const parsed = parseJson(raw);
    if (!parsed) return { error: "LLM 输出不是合法 JSON" };

    const checked = guardScene(canon, state, scene, parsed);
    if (!checked.ok) return { error: `设定守卫拒绝：${checked.problems.join("；")}`, problems: checked.problems };
    return { prose: checked.prose, options: checked.options, source: "llm", problems: checked.problems };
  }

  async #chat(messages) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await fetch(`${this.baseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${this.apiKey}`
        },
        body: JSON.stringify({
          model: this.model,
          messages,
          temperature: this.temperature,
          response_format: { type: "json_object" }
        }),
        signal: controller.signal
      });
      if (!response.ok) {
        const text = await response.text().catch(() => "");
        throw new Error(`HTTP ${response.status} ${text.slice(0, 160)}`);
      }
      const data = await response.json();
      const content = data?.choices?.[0]?.message?.content;
      if (typeof content !== "string" || !content.trim()) throw new Error("响应为空");
      return content;
    } finally {
      clearTimeout(timer);
    }
  }
}

export function parseJson(text) {
  const cleaned = text
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/```\s*$/i, "")
    .trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    const start = cleaned.indexOf("{");
    const end = cleaned.lastIndexOf("}");
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(cleaned.slice(start, end + 1));
      } catch {
        return null;
      }
    }
    return null;
  }
}
