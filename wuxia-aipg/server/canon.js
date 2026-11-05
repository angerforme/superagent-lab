// 设定文档加载器：canon/*.json 是唯一事实来源。
// 文档（docs/*.md）由 scripts/build-docs.mjs 从这些文件生成，保证「固定设定」不会漂移。

import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const CANON_DIR = process.env.WUXIA_CANON_DIR || path.join(HERE, "..", "canon");

const FILES = ["world", "sects", "arts", "weapons", "characters", "storyline", "endings", "lifegen"];

export async function loadCanon(dir = CANON_DIR) {
  const loaded = {};
  for (const name of FILES) {
    const file = path.join(dir, `${name}.json`);
    loaded[name] = JSON.parse(await readFile(file, "utf8"));
  }
  return buildCanon(loaded);
}

export function buildCanon(loaded) {
  const { world, sects, arts, weapons, characters, storyline, endings, lifegen } = loaded;

  const sectById = indexBy(sects, "sect");
  const artById = indexBy(arts, "art");
  const weaponById = indexBy(weapons, "weapon");
  const characterById = indexBy(characters, "character");
  const regionById = indexBy(world.regions, "region");

  const beats = [];
  for (const act of storyline.acts) {
    for (const beat of act.beats) {
      beats.push({
        ...beat,
        actId: act.id,
        actTitle: act.title,
        turn: turnIndex(world, beat.year, beat.season)
      });
    }
  }
  beats.sort((a, b) => a.turn - b.turn);

  const canon = {
    world,
    sects,
    arts,
    weapons,
    characters,
    storyline,
    endings,
    lifegen,
    sectById,
    artById,
    weaponById,
    characterById,
    regionById,
    beats,
    integrity: null
  };
  canon.integrity = validateCanon(canon);
  return canon;
}

function indexBy(list, label) {
  const map = new Map();
  for (const item of list) {
    if (map.has(item.id)) throw new Error(`canon: duplicate ${label} id ${item.id}`);
    map.set(item.id, item);
  }
  return map;
}

export function turnIndex(world, year, season) {
  return (year - world.calendar.startYear) * world.rules.turnsPerYear + season;
}

export function turnToCalendar(world, turn) {
  const perYear = world.rules.turnsPerYear;
  const year = world.calendar.startYear + Math.floor(turn / perYear);
  const season = turn % perYear;
  return {
    year,
    season,
    seasonName: world.calendar.seasons[season],
    label: `${world.calendar.era}${numberToCn(year)}年·${world.calendar.seasons[season]}`
  };
}

function numberToCn(n) {
  const digits = ["零", "一", "二", "三", "四", "五", "六", "七", "八", "九"];
  if (n < 10) return digits[n];
  if (n < 20) return `十${n % 10 === 0 ? "" : digits[n % 10]}`;
  if (n < 100) return `${digits[Math.floor(n / 10)]}十${n % 10 === 0 ? "" : digits[n % 10]}`;
  return String(n);
}

export function validateCanon(canon) {
  const errors = [];
  const fail = (msg) => errors.push(msg);

  for (const sect of canon.sects) {
    if (!canon.regionById.has(sect.seat)) fail(`门派 ${sect.id} 的山门 ${sect.seat} 不在世界地区表中`);
    if (sect.leader && !canon.characterById.has(sect.leader)) fail(`门派 ${sect.id} 的掌门 ${sect.leader} 不存在`);
    for (const artId of sect.signatureArts || []) {
      if (!canon.artById.has(artId)) fail(`门派 ${sect.id} 的绝学 ${artId} 不存在`);
    }
    for (const [other, relation] of Object.entries(sect.relations || {})) {
      if (!canon.sectById.has(other)) fail(`门派 ${sect.id} 的关系指向不存在的门派 ${other}`);
      if (!relation) fail(`门派 ${sect.id} 与 ${other} 的关系为空`);
    }
  }

  for (const art of canon.arts) {
    if (art.sect && !canon.sectById.has(art.sect)) fail(`武学 ${art.id} 所属门派 ${art.sect} 不存在`);
  }

  for (const weapon of canon.weapons) {
    if (weapon.owner && !canon.characterById.has(weapon.owner)) fail(`神兵 ${weapon.id} 的主人 ${weapon.owner} 不存在`);
    if (!canon.regionById.has(weapon.seat)) fail(`神兵 ${weapon.id} 的所在地 ${weapon.seat} 不存在`);
  }

  for (const character of canon.characters) {
    if (character.sect && !canon.sectById.has(character.sect)) fail(`人物 ${character.id} 的门派 ${character.sect} 不存在`);
    if (character.region && !canon.regionById.has(character.region)) fail(`人物 ${character.id} 所在地 ${character.region} 不存在`);
    for (const artId of character.arts || []) {
      if (!canon.artById.has(artId)) fail(`人物 ${character.id} 的武学 ${artId} 不存在`);
    }
    if (character.weapon && !canon.weaponById.has(character.weapon)) fail(`人物 ${character.id} 的神兵 ${character.weapon} 不存在`);
  }

  for (const beat of canon.beats) {
    if (!Array.isArray(beat.regions) || beat.regions.length === 0) fail(`主线事件 ${beat.id} 没有发生地区`);
    for (const region of beat.regions || []) {
      if (!canon.regionById.has(region)) fail(`主线事件 ${beat.id} 的地区 ${region} 不存在`);
    }
    if (beat.reveal && !canon.characterById.has(beat.reveal)) fail(`主线事件 ${beat.id} 的揭露人物 ${beat.reveal} 不存在`);
    if (beat.turn < 0) fail(`主线事件 ${beat.id} 早于开局时间`);
  }

  const seenBeatTurns = new Set();
  for (const beat of canon.beats) {
    if (seenBeatTurns.has(beat.turn)) fail(`主线事件 ${beat.id} 与其它事件落在同一时节（turn ${beat.turn}）`);
    seenBeatTurns.add(beat.turn);
  }

  for (const ending of canon.endings) {
    for (const weapon of ending.conditions?.weapons || []) {
      if (!canon.weaponById.has(weapon)) fail(`结局 ${ending.id} 要求的神兵 ${weapon} 不存在`);
    }
  }

  return { ok: errors.length === 0, errors };
}

// 对外（前端典籍库、LLM 提示词）的公开视图：隐藏未解锁的秘密。
export function publicCharacter(character, flags = {}) {
  const revealed = character.revealFlag ? Boolean(flags[character.revealFlag]) : false;
  const { secret, revealFlag, ...rest } = character;
  return revealed ? { ...rest, secret } : rest;
}

export function publicCanon(canon) {
  return {
    world: canon.world,
    sects: canon.sects.map(({ secret, ...rest }) => rest),
    arts: canon.arts,
    weapons: canon.weapons.map(({ lore, ...rest }) => rest),
    characters: canon.characters.map((c) => {
      const { secret, revealFlag, power, ...rest } = c;
      return rest;
    }),
    acts: canon.storyline.acts.map((act) => ({
      id: act.id,
      title: act.title,
      years: act.years,
      summary: act.summary,
      beats: act.beats.map(({ text, ...beat }) => ({
        ...beat,
        hint: text
      }))
    })),
    endings: canon.endings.map(({ conditions, ...rest }) => rest)
  };
}

// 给叙述者的「本回合相关设定」摘要，控制上下文长度，同时保证用词不越界。
export function loreDigest(canon, state, { beat = null, npcIds = [], maxChars = 2600 } = {}) {
  const region = canon.regionById.get(state.location);
  const sect = state.sect ? canon.sectById.get(state.sect) : null;
  const chars = npcIds
    .map((id) => canon.characterById.get(id))
    .filter(Boolean)
    .map((c) => `${c.name}（${c.title}）：${c.desc}`);

  const lines = [];
  lines.push(`【时代】${canon.world.name}。${canon.world.premise}`);
  lines.push(`【地点】${region?.name ?? "江湖"}：${region?.desc ?? ""}`);
  if (sect) lines.push(`【门派】${sect.name}（${sect.type}）：${sect.creed} ${sect.description.slice(0, 90)}`);
  if (beat) lines.push(`【此刻天下大事】${beat.title}：${beat.text}`);
  if (chars.length) lines.push(`【在场人物】\n${chars.join("\n")}`);
  lines.push(
    `【神兵名录】${canon.weapons.map((w) => `${w.name}（${w.kind}，${w.owner ? canon.characterById.get(w.owner)?.name + "持有" : "无主"}）`).join("、")}`
  );
  lines.push(`【九宗】${canon.sects.map((s) => `${s.name}（${s.type}）`).join("、")}`);
  const text = lines.join("\n");
  return text.length > maxChars ? `${text.slice(0, maxChars)}…` : text;
}

export function knownNames(canon) {
  const names = new Set();
  for (const s of canon.sects) names.add(s.name);
  for (const a of canon.arts) names.add(a.name);
  for (const w of canon.weapons) names.add(w.name);
  for (const c of canon.characters) names.add(c.name);
  for (const r of canon.world.regions) names.add(r.name);
  return names;
}
