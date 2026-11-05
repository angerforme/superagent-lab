#!/usr/bin/env node
// 通关模拟：用离线叙述者走完一局，打印一段可读的人生年表。
// 用法：node scripts/playthrough.mjs [seed]

import { loadCanon } from "../server/canon.js";
import { GameEngine } from "../server/engine.js";

const canon = await loadCanon();
const engine = new GameEngine({ canon, narrator: { available: false } });
const seed = Number(process.argv[2]) >>> 0 || 20261105;

const state = await engine.start(seed);
console.log(`\n════ 大衍江湖 · 命数 ${seed} ════`);
console.log(`${state.life.name}（${state.life.gender === "male" ? "男" : "女"}，${state.life.backgroundName}）`);
console.log(`天赋：${state.life.talents.map((t) => t.name).join("、")}　命格：${state.life.destiny.name}`);
console.log(`起于：${canon.regionById.get(state.location).name}\n`);

let guard = 0;
while (state.status === "alive" && guard++ < 40) {
  const view = engine.view(state);
  console.log(`【${view.calendar.label} · ${view.location.name}】 ${view.scene.title}（${view.realm.name}，内${Math.round(state.qi)} 血${Math.round(state.hp)}/${view.resources.hpMax}）`);
  console.log(view.scene.prose);
  if (!view.scene.options.length) break;
  console.log(`→ ${view.scene.options.map((o) => o.text).join(" / ")}`);
  const option = choose(view.scene.options, view);
  console.log(`＞ ${option.text}\n`);
  await engine.act(state, option.id);
}

const final = engine.view(state);
console.log(`════ 结局：${final.ending?.name || "未完"} ════`);
console.log(final.ending?.desc || "");
console.log(`「${final.ending?.epitaph || ""}」`);
console.log(
  `${final.life.name} · ${final.life.age}岁 · ${final.realm.name} · 声望 ${final.resources.fame} · 因果 ${final.resources.karma} · 交过手 ${state.stats.duels} 次（胜 ${state.stats.wins}） · 线索 ${state.stats.clues} 条`
);

function choose(options, view) {
  const byKind = (kind) => options.find((o) => o.kind === kind);
  if (view.scene.finale) {
    return byKind("finale") || options[0];
  }
  if (view.resources.hp < view.resources.hpMax * 0.45) {
    const heal = byKind("heal");
    if (heal) return heal;
  }
  return (
    byKind("breakthrough") ||
    byKind("investigate") ||
    byKind("cultivate") ||
    byKind("practice") ||
    options[0]
  );
}
