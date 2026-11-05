// 离线叙述者：没有配置 LLM（或调用失败）时接管，保证游戏永远可玩、可测试、可复现。
// 它只使用固定设定与引擎结果，因此不会写出越界的江湖。

import { Rng } from "../rng.js";
import { calendarOf, nextRealm, realmOf } from "../state.js";

const WEATHER = {
  春: ["细雨", "柳絮", "薄雾", "新雪初化"],
  夏: ["雷雨", "蝉声", "烈日", "闷热的风"],
  秋: ["落叶", "霜气", "长空雁叫", "西风"],
  冬: ["大雪", "寒风", "冰河", "枯枝上的寒鸦"]
};

const OPENINGS = [
  "「{calendar}，{region}。」",
  "{weather}落在{region}的屋脊上，{calendar}的风里带着江湖的味道。",
  "{calendar}，{region}。天光很短，人心很长。"
];

const CLOSINGS = [
  "你站在原地，听见远处有人在练剑。",
  "风起了，你把衣襟拢紧，知道事情还没完。",
  "这一夜你睡得很浅，梦里全是兵刃相击的声音。",
  "江湖不会等人，天亮之后，路还要自己走。"
];

export function offlineScene(canon, state, scene, outcome, { seed } = {}) {
  const rng = new Rng(seed ?? state.seed + state.turn * 7919);
  const calendar = calendarOf(canon, state);
  const region = canon.regionById.get(state.location);
  const weather = rng.pick(WEATHER[calendar.seasonName] || ["风"]);
  const realm = realmOf(state);

  const opening = rng
    .pick(OPENINGS)
    .replace("{calendar}", calendar.label)
    .replace("{region}", region.name)
    .replace("{weather}", weather);

  const facts = [];
  if (outcome?.lines?.length) facts.push(...outcome.lines);
  if (scene?.beat && outcome?.kind !== "finale") {
    facts.push(`江湖上传出消息：${scene.beat.title}。${scene.beat.text.slice(0, 46)}……`);
  }
  if (scene?.promptFacts?.length && outcome?.kind === "finale") facts.push(...scene.promptFacts);

  const stateLines = [];
  if (state.hp < state.hpMax * 0.4) stateLines.push("身上的伤还在隐隐作痛，你清楚自己撑不了太久。");
  if (state.fame >= 40) stateLines.push(`近来江湖上开始有人提起你的名字，说${state.life.name}不是易与之辈。`);
  if (state.karma <= -30) stateLines.push("你走过的路上留下的名声不太干净，有人看你的眼神已经变了。");
  const next = nextRealm(state);
  if (state.realm < 7 && state.qi >= next.qi) stateLines.push("丹田里的内力涨得发烫，像是随时要冲开什么。");

  const closing = `${stateLines.length ? rng.pick(stateLines) : rng.pick(CLOSINGS)}${rng.pick(CLOSINGS)}`;
  const body = facts.slice(0, 4).join("");
  const prose = `${opening}${body}${closing}`;

  return {
    prose,
    options: scene.options.map((option) => ({ id: option.id, text: option.label })),
    source: "offline"
  };
}
