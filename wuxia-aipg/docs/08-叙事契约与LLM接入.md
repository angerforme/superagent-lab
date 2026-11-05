# 叙事契约与 LLM 接入

> 这份文档说明：引擎、叙述者、设定守卫三者的边界，以及如何接入一个大模型。

## 一、职责边界

```
玩家点选 → 引擎结算（mechanics） → 天下大势（story） → 导演编排（director）
        → 叙述者执笔（LLM / 离线） → 设定守卫（guard） → 前端呈现
```

- **引擎**是唯一能改数值的地方。LLM 不参与判定，也不能决定胜负。
- **导演**决定「这一回合能做什么」。选项的 `kind` 与 `target` 由程序给定。
- **叙述者**只做两件事：把结果写成 180–420 字的武侠段落；把每个选项改写成不超过 18 字的行动短语。
- **守卫**负责把越界内容拦下来，让「设定固定」成为可验证的约束，而不是一句口号。

## 二、输出协议

```json
{
  "prose": "第二人称叙述……",
  "options": [
    { "id": "o1", "text": "去江南" },
    { "id": "o2", "text": "打坐练气" }
  ]
}
```

- `options` 必须与引擎给出的选项**数量一致、顺序一致、id 一致**；只允许改 `text`。
- 前端按 `id` 回传选择，引擎再按 `id` 找回机制含义，因此模型无法凭空发明行动。

## 三、守卫检查项

| 检查 | 处理 |
| --- | --- |
| 叙述 < 40 字或 > 1600 字 | 拒绝（过长则截断后复核） |
| 现代词汇（系统、等级、玩家、手机、直播、APP 等） | 拒绝 |
| 《书名》不在设定典籍表中 | 拒绝（可放行《九兵录》《血月经》等设定内典籍） |
| 提前泄露未解锁秘密（执棋人、沈砚、龙渊是假的、兵主之魂） | 拒绝，直到对应 flag 写入 |
| 选项数量不符 / 选项为空 / 选项过长 | 拒绝 |
| 第一次不合格 | 带问题清单重试一次 |
| 第二次仍不合格、超时、断网、无 Key | 退回离线叙述者 |

被拒绝的内容会记入 `state.log`（`system` 类），方便调试模型行为；玩家侧只看到叙述换人。

## 四、提示词组成

1. **system**：身份、文风、字数、第二人称、不得新增设定、不得出现现代词、不得提前泄露秘密、只输出 JSON。
2. **设定摘要**（`loreDigest`）：时代前提、当前地区、所属门派、当前主线事件、在场人物（公开描述）、九兵名录、九宗名录。
3. **本回合事实**：行动结果的逐条文本、玩家状态（境界/内力/气血/声望/银两/门派/神兵）。
4. **选项清单**：含 `id` 与机制标签，供模型改写措辞。

暗线不会进入提示词：`secret` 字段在 `publicCanon` / `loreDigest` 中被移除，只有 `revealFlag` 为真时才允许出现。

## 五、接入方式

### 1. 配置文件（推荐）

复制模板并填入密钥：

```bash
cp config.example.json config.local.json
```

`config.local.json`（已被 `.gitignore` 忽略）：

```json
{
  "host": "127.0.0.1",
  "port": 3100,
  "llm": {
    "baseUrl": "https://api.deepseek.com/v1",
    "apiKey": "sk-你的key",
    "model": "deepseek-flash",
    "temperature": 0.85,
    "timeoutMs": 45000
  }
}
```

默认模型为 **deepseek-flash**，默认接口为 `https://api.deepseek.com/v1`。
配置路径可用 `WUXIA_CONFIG=/path/to/config.json` 覆盖；相对路径（如 `dataDir`）按配置文件所在目录解析。

### 2. 环境变量（优先级更高）

```bash
LLM_BASE_URL=https://api.deepseek.com/v1 LLM_API_KEY=sk-... LLM_MODEL=deepseek-flash node server/index.js
LLM_BASE_URL=http://127.0.0.1:11434/v1 LLM_API_KEY=ollama LLM_MODEL=qwen2.5:14b node server/index.js
```

优先级：**环境变量 > `config.local.json` > 内置默认值**。非法 JSON、`llm` 不是对象、端口越界都会在启动时给出明确错误或回落到合法默认值；日志只打印「已配置/未配置」，不打印密钥。

### 3. 协议细节

`server/narrators/llm.js` 的请求体包含 `response_format: { type: "json_object" }`；若你的服务不支持，可删掉该字段，
守卫仍会从文本中提取第一个 JSON 对象。超时默认 45 秒，可用 `timeoutMs` / `LLM_TIMEOUT_MS` 调整。
`GET /api/health` 会报告当前模型与配置文件来源，便于确认密钥是否生效。

## 六、离线叙述者

没有 Key、调用失败或输出不合格时，`narrators/offline.js` 用固定模板 + 引擎事实生成段落：
按季节与地区起句，拼接行动结果，补一句状态收束，选项则回落到导演给的标签。
它不会写错设定，也不会让游戏卡住——这是本项目的「永远可玩」底线，也是全部测试使用的叙述者。

## 七、测试怎么证明这些

- `test/guard.test.js`：现代词、虚构典籍、提前泄露、选项数量、离线叙述合法性。
- `test/config.test.js`：配置文件读取、环境变量优先级、默认 deepseek-flash、非法配置报错、密钥不出现在诊断信息里。
- `test/engine.test.js`：同种子同选择完全一致；24 个主线事件按点到齐；终局落成结局；数值无 NaN。
- `test/docs.test.js`：`docs/*.md` 与 `canon/*.json` 完全一致，防止设定文档与实现脱节。
- `test/server.test.js`：开局、行动、存读档、错误处理、目录穿越防护。
