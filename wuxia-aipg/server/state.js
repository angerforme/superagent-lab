// 游戏状态与派生数值。状态是纯数据，可 JSON 序列化，存档就是一段 JSON。

import { turnToCalendar } from "./canon.js";
import { rollLife } from "./birth.js";
import { clamp } from "./rng.js";

export const REALMS = [
  { index: 0, name: "凡体", qi: 0 },
  { index: 1, name: "三流", qi: 50 },
  { index: 2, name: "二流", qi: 130 },
  { index: 3, name: "一流", qi: 260 },
  { index: 4, name: "超一流", qi: 430 },
  { index: 5, name: "宗师", qi: 650 },
  { index: 6, name: "大宗师", qi: 950 },
  { index: 7, name: "天人", qi: 1350 }
];

export const STATE_VERSION = 1;

export function createState(canon, { seed, id }) {
  const life = rollLife(canon, seed);
  const state = {
    version: STATE_VERSION,
    id,
    seed,
    createdAt: new Date().toISOString(),
    turn: 0,
    life: { ...life, age: canon.world.rules.startAge },
    attrs: { ...life.attributes },
    hp: life.hp,
    hpMax: life.hpMax,
    qi: life.qi,
    money: life.money,
    karma: life.karma,
    fame: 0,
    realm: 0,
    arts: life.arts,
    weapons: [],
    relations: {},
    clues: [],
    flags: {},
    log: [],
    rumors: [],
    location: life.location,
    sect: null,
    status: "alive",
    ending: null,
    stats: { duels: 0, wins: 0, turnsPlayed: 0, clues: 0, injuries: 0 },
    pendingScene: null,
    history: []
  };
  addLog(state, "story", `${life.backgroundName}出身的${life.name}，于${turnToCalendar(canon.world, 0).label}踏入了江湖。`);
  return state;
}

export function calendarOf(canon, state) {
  return turnToCalendar(canon.world, state.turn);
}

export function realmOf(state) {
  return REALMS[clamp(state.realm, 0, REALMS.length - 1)];
}

export function nextRealm(state) {
  return REALMS[clamp(state.realm + 1, 0, REALMS.length - 1)];
}

export function maxHpOf(canon, state) {
  let bonus = 0;
  for (const entry of state.arts) {
    const art = canon.artById.get(entry.id);
    if (art?.effects?.hpMax) bonus += art.effects.hpMax * (entry.mastery / 100);
  }
  for (const id of state.weapons) {
    if (canon.weaponById.has(id)) bonus += 10;
  }
  return Math.round(state.hpMax + bonus + state.realm * 25);
}

export function derive(canon, state) {
  let atk = 8 + state.realm * 12;
  let def = 6 + state.realm * 9;
  let spd = 5 + state.realm * 5;
  let heal = 0;
  let qiMax = 0;
  let fameGain = 1;
  let moneyGain = 1;
  let relationGain = 1;

  for (const entry of state.arts) {
    const art = canon.artById.get(entry.id);
    if (!art) continue;
    const scale = entry.mastery / 100;
    atk += (art.effects.atk || 0) * scale;
    def += (art.effects.def || 0) * scale;
    spd += (art.effects.spd || 0) * scale;
    heal += (art.effects.heal || 0) * scale;
    qiMax += (art.effects.qiMax || 0) * scale;
  }

  const life = state.life;
  const fx = life.effects || {};
  atk += fx.atk || 0;
  def += fx.def || 0;
  spd += fx.spd || 0;
  heal += fx.heal || 0;
  fameGain += fx.fameGain || 0;
  moneyGain += fx.moneyGain || 0;
  relationGain += fx.relationGain || 0;

  if (state.weapons.length > 0) {
    atk += 10;
    def += 6;
  }

  // 装备的神兵按其设定提供额外气势
  for (const id of state.weapons) {
    const weapon = canon.weaponById.get(id);
    if (!weapon) continue;
    atk += 6;
    if (weapon.kind === "刀") atk += 4;
    if (weapon.kind === "降魔杵") def += 6;
    if (weapon.kind === "针") heal += 8;
    if (weapon.kind === "短剑") spd += 5;
  }

  // 伤势与心境影响发挥
  const woundPenalty = state.flags.wounded ? 0.82 : 1;
  atk *= woundPenalty;
  def *= woundPenalty;

  return {
    atk: Math.round(atk),
    def: Math.round(def),
    spd: Math.round(spd),
    heal: Math.round(heal),
    qiMax: Math.round(qiMax),
    combatPower: Math.round(atk * 1.0 + def * 0.55 + spd * 0.7),
    fameGain,
    moneyGain,
    relationGain
  };
}

export function addLog(state, kind, text) {
  state.log.push({ turn: state.turn, kind, text });
  if (state.log.length > 120) state.log.splice(0, state.log.length - 120);
}

export function addRumor(state, text) {
  if (!state.rumors.includes(text)) state.rumors.push(text);
  if (state.rumors.length > 24) state.rumors.shift();
}

export function setRelation(state, charId, delta) {
  const current = state.relations[charId] || 0;
  state.relations[charId] = clamp(current + delta, -100, 100);
  return state.relations[charId];
}

export function knowsFlag(state, flag) {
  return Boolean(state.flags?.[flag]);
}

export function view(canon, state) {
  const calendar = calendarOf(canon, state);
  const derived = derive(canon, state);
  const region = canon.regionById.get(state.location);
  const sect = state.sect ? canon.sectById.get(state.sect) : null;
  const realm = realmOf(state);
  const next = nextRealm(state);

  const arts = state.arts.map((entry) => {
    const art = canon.artById.get(entry.id);
    return art
      ? { id: art.id, name: art.name, type: art.type, grade: art.grade, mastery: Math.round(entry.mastery), sect: art.sect }
      : null;
  }).filter(Boolean);

  const weapons = state.weapons
    .map((id) => canon.weaponById.get(id))
    .filter(Boolean)
    .map((w) => ({ id: w.id, name: w.name, kind: w.kind, power: w.power }));

  const relations = Object.entries(state.relations)
    .filter(([, value]) => value !== 0)
    .map(([id, value]) => {
      const c = canon.characterById.get(id);
      return c ? { id, name: c.name, title: c.title, value, stance: relationStance(value) } : null;
    })
    .filter(Boolean)
    .sort((a, b) => b.value - a.value);

  return {
    id: state.id,
    status: state.status,
    turn: state.turn,
    turnsLeft: Math.max(0, canon.world.rules.maxTurns - state.turn),
    calendar,
    life: {
      name: state.life.name,
      gender: state.life.gender === "male" ? "男" : "女",
      age: state.life.age,
      title: state.life.title,
      background: state.life.backgroundName,
      appearance: state.life.appearance,
      talents: state.life.talents,
      destiny: state.life.destiny,
      seedText: state.life.seedText
    },
    attrs: state.attrs,
    realm: { index: realm.index, name: realm.name, next: next.name, nextQi: next.qi, progress: next.qi > realm.qi ? clamp((state.qi - realm.qi) / (next.qi - realm.qi), 0, 1) : 1 },
    resources: {
      hp: Math.round(state.hp),
      hpMax: maxHpOf(canon, state),
      qi: Math.round(state.qi),
      money: Math.round(state.money),
      fame: Math.round(state.fame),
      karma: Math.round(state.karma)
    },
    derived,
    location: { id: region.id, name: region.name, kind: region.kind, desc: region.desc },
    sect: sect ? { id: sect.id, name: sect.name, type: sect.type, creed: sect.creed } : null,
    arts,
    weapons,
    relations,
    clues: state.clues.filter((c) => !c.hidden),
    rumors: state.rumors.slice(-8),
    log: state.log.slice(-40),
    ending: state.ending,
    scene: state.pendingScene,
    flagsPublic: Object.keys(state.flags).filter((f) => !f.startsWith("_"))
  };
}

export function relationStance(value) {
  if (value >= 80) return "生死之交";
  if (value >= 50) return "知己";
  if (value >= 20) return "熟识";
  if (value > -20) return "萍水相逢";
  if (value > -50) return "有隙";
  if (value > -80) return "仇怨";
  return "死敌";
}
