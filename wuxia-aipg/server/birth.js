// 每一次开局都是一段新的人生：姓名、出身、天赋、命格、初始属性全部由种子决定。
// 但门派、武学、神兵、人物与主线全部来自固定设定，不随机生成。

import { Rng, clamp } from "./rng.js";

const ATTR_KEYS = ["gengu", "wuxing", "fuyuan", "xinxing", "meili"];
const BACKGROUND_WEIGHTS = {
  wulin_family: 10,
  orphan: 12,
  medicine_family: 8,
  frontier_orphan: 8,
  scholar: 8,
  escort: 10,
  forge_apprentice: 8,
  qianji_dropout: 6,
  beggar: 10,
  temple_foundling: 6,
  demon_blood: 4,
  fallen_royal: 3
};

export function rollLife(canon, seed) {
  const rng = new Rng(seed >>> 0);
  const gender = rng.chance(0.5) ? "male" : "female";
  const surname = rng.pick(canon.lifegen.surnames);
  const given = rng.pick(canon.lifegen.givenNames[gender]);
  const name = `${surname}${given}`;

  const backgrounds = canon.lifegen.backgrounds.map((bg) => ({
    ...bg,
    weight: BACKGROUND_WEIGHTS[bg.id] ?? 5
  }));
  const background = rng.weighted(backgrounds);

  const talents = rng.pickMany(canon.lifegen.talents, rng.chance(0.35) ? 3 : 2);
  const destiny = rng.weighted(canon.lifegen.destinies.map((d) => ({ ...d, weight: 10 })));

  const attrs = {};
  for (const key of ATTR_KEYS) {
    let value = rng.int(32, 52);
    value += background.mods?.[key] ?? 0;
    for (const talent of talents) value += talent.mods?.[key] ?? 0;
    value += destiny.mods?.[key] ?? 0;
    attrs[key] = clamp(Math.round(value), 8, 95);
  }

  const effects = mergeEffects([...talents, background, destiny]);
  const arts = (background.arts || []).map((id) => ({
    id,
    mastery: rng.int(25, 45)
  }));

  const hpMax = Math.round(80 + attrs.gengu * 2.2 + (effects.hpMax || 0));
  const qi = Math.round(6 + attrs.gengu * 0.5);
  const karma = (background.karma || 0) + (destiny.karma || 0) + sum(talents.map((t) => t.karma || 0));

  return {
    name,
    gender,
    title: background.name,
    age: canon.world.rules.startAge,
    backgroundId: background.id,
    backgroundName: background.name,
    backgroundText: background.desc,
    seedText: rng.pick(background.seeds || ["你只是恰好生在这个年月。"]),
    appearance: rng.pick(canon.lifegen.portraits),
    talents: talents.map(({ id, name, desc }) => ({ id, name, desc })),
    destiny: { id: destiny.id, name: destiny.name, hint: destiny.hint },
    attributes: attrs,
    money: background.money ?? 20,
    arts,
    karma,
    hp: hpMax,
    hpMax,
    qi,
    location: background.region || rng.pick(canon.world.regions).id,
    effects,
    flags: ["art_gain"].filter((f) => talents.some((t) => t.flags?.includes(f))),
    talentFlags: talents.flatMap((t) => t.flags || [])
  };
}

function mergeEffects(items) {
  const out = {};
  for (const item of items) {
    for (const [key, value] of Object.entries(item.effects || {})) {
      out[key] = (out[key] || 0) + value;
    }
  }
  return out;
}

function sum(list) {
  return list.reduce((a, b) => a + b, 0);
}

export { ATTR_KEYS };
