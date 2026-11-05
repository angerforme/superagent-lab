#!/usr/bin/env node
// 入口：node server/index.js

import { createApp } from "./server.js";
import { describeConfig, loadConfig } from "./config.js";

const config = loadConfig();
const info = describeConfig(config);
const { server, canon, narrator } = await createApp(config);

server.listen(config.port, config.host, () => {
  const url = `http://${config.host}:${config.port}`;
  console.log(`\n  大衍江湖 · ${canon.world.tagline}`);
  console.log(`  ${url}`);
  console.log(`  设定：${canon.sects.length} 门派 / ${canon.arts.length} 武学 / ${canon.weapons.length} 神兵 / ${canon.characters.length} 人物 / ${canon.beats.length} 主线事件`);
  console.log(`  叙述者：${narrator.describe()}${narrator.available ? "" : "（离线模板；在 config.local.json 或环境变量中填入 API Key 后由 LLM 执笔）"}`);
  console.log(`  配置：${info.file ? info.file : "内置默认"} / 模型 ${info.model} / API Key ${info.apiKey}\n`);
});
