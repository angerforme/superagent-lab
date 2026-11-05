#!/usr/bin/env node
// 由 canon/*.json 生成设定文档。JSON 是唯一事实来源，文档只是它的可读投影。
// 用法：node scripts/build-docs.mjs [--check]

import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadCanon } from "../server/canon.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, "..");
const DOCS = path.join(ROOT, "docs");
const CHECK = process.argv.includes("--check");

const canon = await loadCanon();
const outputs = buildDocs(canon);

await mkdir(DOCS, { recursive: true });
let drifted = [];

for (const [file, content] of Object.entries(outputs)) {
  const target = path.join(DOCS, file);
  if (CHECK) {
    let existing = "";
    try {
      existing = await readFile(target, "utf8");
    } catch {
      drifted.push(`${file}（缺失）`);
      continue;
    }
    if (existing !== content) drifted.push(file);
  } else {
    await writeFile(target, content, "utf8");
  }
}

if (CHECK) {
  if (drifted.length) {
    console.error(`设定文档与 canon/*.json 不一致：${drifted.join("、")}\n请运行 npm run docs 重新生成。`);
    process.exit(1);
  }
  console.log("设定文档与 canon 一致。");
} else {
  console.log(`已生成 ${Object.keys(outputs).length} 份设定文档：${Object.keys(outputs).join("、")}`);
}

function buildDocs(canon) {
  return {
    "00-世界总纲.md": worldDoc(canon),
    "01-门派志.md": sectsDoc(canon),
    "02-武学谱.md": artsDoc(canon),
    "03-神兵录.md": weaponsDoc(canon),
    "04-人物志.md": charactersDoc(canon),
    "05-大主线.md": storyDoc(canon),
    "06-结局录.md": endingsDoc(canon)
  };
}

function header(title, note) {
  return `# ${title}

> 本文件由 \`canon/*.json\` 自动生成，请勿手改；改设定请改 JSON，然后运行 \`npm run docs\`。
> 校验：\`npm run docs:check\`（测试会检查文档与设定是否一致）。
${note ? `\n> ${note}\n` : ""}`;
}

function worldDoc(canon) {
  const w = canon.world;
  return `${header("大衍江湖 · 世界总纲", "这是整个江湖的地基：时代、地理、规则与那句绕不开的谶语。")}

## 一句话

**${w.premise}**

## 谶语

> ${w.tagline}

${w.cosmology}

## 时间

- 纪元：${w.calendar.era}
- 开局：${w.calendar.era}${toCn(w.calendar.startYear)}年${w.calendar.seasons[w.calendar.startSeason]}
- 终局：${w.calendar.era}${toCn(w.calendar.finalYear)}年春至冬
- 一回合 = 一个时节（约九十日），一年四季，全局 ${w.rules.maxTurns} 个时节
- 开局年龄：${w.rules.startAge} 岁

## 九州地理

${w.regions
  .map(
    (region) => `### ${region.name}（${region.kind}）

${region.desc}

- 气候：${region.climate}
- 去处：${region.features.join("、")}
`
  )
  .join("\n")}

## 势力格局

${w.factionsPower.map((line) => `- ${line}`).join("\n")}

## 世界规则（不可违反）

1. 神兵有灵，认主不以血脉论，而以命数、心志与代价论。
2. 九鼎镇龙脉，九兵为钥；九兵齐鸣之日，九鼎之门可开。
3. 血月每两年一现，三现之后天地异变；这是天时，不因任何人的选择而改。
4. 门派、武学、神兵、主要人物与主线事件写死在本设定中；玩家的每一局只改变「谁经历、如何经历、以什么身份经历」。
5. 江湖不以玩家为中心：玩家不出现的地方，大事照常发生。
`;
}

function sectsDoc(canon) {
  return `${header("门派志", "十二股势力，各有山门、绝学、立场与不能说的秘密。玩家可以投入其中，也可以与所有人为敌。")}

${canon.sects
  .map((sect) => {
    const leader = canon.characterById.get(sect.leader);
    const relations = Object.entries(sect.relations || {})
      .map(([id, relation]) => `${canon.sectById.get(id)?.name || id}：${relation}`)
      .join("；");
    return `## ${sect.name}

- 立场：${sect.type}
- 山门：${canon.regionById.get(sect.seat)?.name}
- 掌门：${leader?.name || "—"}（${leader?.title || ""}）
- 门训：**${sect.creed}**
- 绝学：${sect.signatureArts.map((id) => canon.artById.get(id)?.name).join("、")}
- 入门：${sect.entry}
- 地盘：${sect.territory}
- 关系：${relations}

${sect.description}

> **暗线（玩家不可见）**：${sect.secret}
`;
  })
  .join("\n")}
`;
}

function artsDoc(canon) {
  const groups = ["内功", "心法", "剑法", "刀法", "掌法", "外功", "轻功", "暗器", "奇门", "毒功", "医术"];
  const byGrade = (a, b) => gradeValue(b.grade) - gradeValue(a.grade);
  return `${header("武学谱", "共 " + canon.arts.length + " 门武学，分天、地、玄、黄四品。数值与描述同为设定，改动需同步测试。")}

${groups
  .map((type) => {
    const list = canon.arts.filter((art) => art.type === type).sort(byGrade);
    if (!list.length) return "";
    return `## ${type}

${list
  .map((art) => {
    const sect = art.sect ? canon.sectById.get(art.sect)?.name : "江湖流传";
    return `### ${art.name}（${art.grade}品 · ${sect}）

${art.desc}

- 门槛：内力 ${art.requirements?.qi ?? 0}${art.requirements?.realm ? `，境界 ${art.requirements.realm}` : ""}
- 效果：${effectText(art.effects)}
- 来历：${art.lore}
`;
  })
  .join("\n")}`;
  })
  .join("\n")}
`;
}

function weaponsDoc(canon) {
  return `${header("神兵录", "九柄神兵对应九鼎之钥。它们不是装备，是会挑主人的凶物。")}

${canon.weapons
  .map((weapon) => {
    const owner = weapon.owner ? canon.characterById.get(weapon.owner) : null;
    return `## ${weapon.name}（${weapon.kind}）

${weapon.desc}

- 现世：${weapon.awakenYear ? `承平${toCn(weapon.awakenYear)}年` : "早已现世，藏而不出"}
- 持有：${owner ? `${owner.name}（${owner.title}）` : "无主"}
- 所在：${canon.regionById.get(weapon.seat)?.name}
- 威能：${weapon.power}
- 认主：${weapon.condition}
- 传说：${weapon.lore}
`;
  })
  .join("\n")}

## 第十兵 · 问天

九兵之外，天机阁密录另记一兵：以天外陨铁铸成，可斩命数。铸成需铸剑者心头之血，故百年来无人铸成。它不属于谶语，却是破局的唯一变数。
`;
}

function charactersDoc(canon) {
  return `${header("人物志", "十七位主要人物。掌门、杀手、皇帝鹰犬、魔教教主——每个人都有自己的算盘。")}

${canon.characters
  .map((c) => {
    const sect = c.sect ? canon.sectById.get(c.sect)?.name : "无门无派";
    const arts = (c.arts || []).map((id) => canon.artById.get(id)?.name).filter(Boolean).join("、");
    const weapon = c.weapon ? canon.weaponById.get(c.weapon)?.name : null;
    return `## ${c.name}

- 身份：${c.title}
- 门派：${sect}
- 性别年龄：${c.gender}，${c.age}岁
- 常驻：${canon.regionById.get(c.region)?.name || "行踪不定"}
- 性情：${(c.personality || []).join("、")}
- 武学：${arts || "—"}${weapon ? `；神兵：${weapon}` : ""}
- 战力：${c.power}

${c.desc}

> **暗线（玩家不可见）**：${c.secret}${c.revealFlag ? `\n> 解锁标记：\`${c.revealFlag}\`` : ""}
`;
  })
  .join("\n")}
`;
}

function storyDoc(canon) {
  return `${header("大主线 · 大衍之局", "主线是固定年表：无论玩家做什么，这些事都会发生。玩家决定的是自己站在哪里、护住谁、付出什么。")}

${canon.storyline.summary}

${canon.storyline.acts
  .map(
    (act) => `## ${act.title}（${act.years}）

${act.summary}

| 时节 | 事件 | 固定 | 发生地 | 后果 |
| --- | --- | --- | --- | --- |
${act.beats
  .map((beat) => {
    const regions = beat.regions.map((id) => canon.regionById.get(id)?.name).join("、");
    return `| ${canon.world.calendar.era}${toCn(beat.year)}年·${canon.world.calendar.seasons[beat.season]} | **${beat.title}** | ${beat.fixed ? "是" : "否"} | ${regions} | ${beat.stakes} |`;
  })
  .join("\n")}

${act.beats.map((beat) => `### ${beat.title}\n\n${beat.text}\n`).join("\n")}
`
  )
  .join("\n")}
`;
}

function endingsDoc(canon) {
  return `${header("结局录", "结局由这一生的积累与最后一刻的选择共同决定。")}

| 结局 | 优先级 | 条件 | 判词 |
| --- | --- | --- | --- |
${canon.endings
  .map((ending) => `| **${ending.name}** | ${ending.priority} | ${conditionText(ending.conditions)} | ${ending.epitaph} |`)
  .join("\n")}

${canon.endings
  .map(
    (ending) => `## ${ending.name}

${ending.desc}

> ${ending.epitaph}
`
  )
  .join("\n")}
`;
}

function effectText(effects = {}) {
  const labels = { qiMax: "内力上限", atk: "攻势", def: "守势", spd: "身法", heal: "疗伤", hpMax: "气血上限" };
  const parts = Object.entries(effects).map(([key, value]) => `${labels[key] || key}${value > 0 ? "+" : ""}${value}`);
  return parts.length ? parts.join("，") : "无";
}

function conditionText(cond = {}) {
  const parts = [];
  if (cond.dead) parts.push("身死");
  if (cond.minRealm !== undefined) parts.push(`境界 ≥ ${cond.minRealm}`);
  if (cond.minFame !== undefined) parts.push(`声望 ≥ ${cond.minFame}`);
  if (cond.maxFame !== undefined) parts.push(`声望 ≤ ${cond.maxFame}`);
  if (cond.minKarma !== undefined) parts.push(`因果 ≥ ${cond.minKarma}`);
  for (const flag of cond.flags || []) parts.push(`标记 ${flag}`);
  for (const weapon of cond.weapons || []) parts.push(`持有 ${weapon}`);
  for (const [attr, value] of Object.entries(cond.minAttr || {})) parts.push(`${attr} ≥ ${value}`);
  if (cond.partner) parts.push("有生死之交");
  return parts.length ? parts.join("，") : "默认";
}

function toCn(n) {
  const digits = ["零", "一", "二", "三", "四", "五", "六", "七", "八", "九"];
  if (n < 10) return digits[n];
  if (n < 20) return `十${n % 10 === 0 ? "" : digits[n % 10]}`;
  return `${digits[Math.floor(n / 10)]}十${n % 10 === 0 ? "" : digits[n % 10]}`;
}

function gradeValue(grade) {
  return { 黄: 0, 玄: 1, 地: 2, 天: 3 }[grade] ?? 0;
}
