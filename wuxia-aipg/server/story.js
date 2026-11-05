// 主线推进：固定的事件按年表发生，玩家能改变的是「这一段人生怎么过」，改不了天下大势本身。
// 这正是设定文档存在的意义：江湖有它自己的时间。

import { addLog, addRumor, calendarOf, knowsFlag, realmOf } from "./state.js";

export function advanceClock(canon, state) {
  state.turn += 1;
  const years = Math.floor(state.turn / canon.world.rules.turnsPerYear);
  state.life.age = canon.world.rules.startAge + years;
  return calendarOf(canon, state);
}

export function dueBeats(canon, state) {
  return canon.beats.filter((beat) => beat.turn === state.turn);
}

export function applyBeat(canon, state, beat) {
  const calendar = calendarOf(canon, state);
  for (const flag of beat.flags || []) state.flags[flag] = true;
  if (beat.reveal) {
    const character = canon.characterById.get(beat.reveal);
    if (character?.revealFlag) state.flags[character.revealFlag] = true;
  }
  addRumor(state, `【${calendar.label}】${beat.title}：${beat.text.slice(0, 46)}……`);

  const involved = (beat.regions || []).includes(state.location);
  if (involved && beat.id !== "b24") state.fame += 2;
  if (involved) {
    addLog(state, "world", `你亲眼见证了「${beat.title}」。${beat.text.slice(0, 80)}……`);
  } else {
    addLog(state, "world", `江湖传来消息：${beat.title}。（${beat.text.slice(0, 50)}……）`);
  }

  // 主线事件会给身处其地的玩家留下线索
  if (involved && !state.clues.some((c) => c.beatId === beat.id)) {
    state.clues.push({ id: `clue_${beat.id}`, text: beat.text.slice(0, 60) + "……", beatId: beat.id });
    state.stats.clues += 1;
  }

  return { beat, involved, calendar };
}

export function turnBeat(canon, state) {
  const beats = dueBeats(canon, state);
  return beats.map((beat) => applyBeat(canon, state, beat));
}

export function currentAct(canon, state) {
  const act = [...canon.storyline.acts]
    .reverse()
    .find((a) => a.beats.some((b) => b.turn <= state.turn));
  return act || canon.storyline.acts[0];
}

export function nextBeat(canon, state) {
  return canon.beats.find((beat) => beat.turn > state.turn) || null;
}

// 终局：玩家在最后一幕做出选择，选择决定结局，但结局是否成立还看这一生的积累。
export const FINALE_CHOICES = [
  {
    id: "cut_fate",
    label: "以问天斩断九鼎之门",
    kind: "finale",
    target: "cut_fate",
    requires: "需持有问天",
    flag: "chose_cut_fate"
  },
  {
    id: "close_gate",
    label: "以身守门，谁也不许过",
    kind: "finale",
    target: "close_gate",
    requires: "无需神兵",
    flag: "gate_closed"
  },
  {
    id: "open_gate",
    label: "推开九鼎之门，看看里面是什么",
    kind: "finale",
    target: "open_gate",
    requires: "心志够硬",
    flag: "gate_opened"
  },
  {
    id: "take_board",
    label: "拾起那枚黑子，坐上棋盘",
    kind: "finale",
    target: "take_board",
    requires: "悟性 ≥ 70",
    flag: "took_board"
  }
];

export function availableFinales(state) {
  return FINALE_CHOICES.filter((choice) => {
    if (choice.target === "cut_fate") return state.weapons.includes("wentian");
    if (choice.target === "take_board") return state.attrs.wuxing >= 70;
    if (choice.target === "open_gate") return state.attrs.xinxing >= 40;
    return true;
  });
}

export function applyFinale(canon, state, target) {
  const choice = FINALE_CHOICES.find((c) => c.target === target);
  if (!choice) return null;
  state.flags[choice.flag] = true;
  if (choice.target === "cut_fate") {
    state.flags.gate_closed = true;
    state.flags.wentian_used = true;
  }
  const lines = {
    cut_fate: "你举剑，问天剑鸣如龙吟。剑落，门裂，百年谶语断成两截。",
    close_gate: "你站在门前，把剑横过来。身后是天下人，身前是百年的旧魂。",
    open_gate: "你伸手推门。门很轻，轻得像一声叹息。",
    take_board: "你俯身拾起那枚黑子，指尖沾了血。棋盘上还有三百六十一个空位。"
  };
  addLog(state, "story", lines[choice.target]);
  return { choice, line: lines[choice.target] };
}


export function composeFinaleFacts(canon, state) {
  const facts = [
    "九鼎之门在皇陵之下缓缓开启，百年前的旧魂在里面数着最后一个人。",
    "正道残部、朝廷残军、血月教余众都站在门外，没有人先动。"
  ];
  if (state.weapons.includes("wentian")) {
    facts.push("你手里握着问天，剑身星痕正一寸寸亮起来。");
  } else {
    facts.push("你手里没有问天，能凭的只有这二十四年练成的功夫和身后的那点人。");
  }
  const relation = state.relations.yue_qingluan || 0;
  if (relation >= 40) facts.push("越青鸾站在你身侧，眼睛红着，没有说话。");
  if (state.flags.qingxu_revealed) facts.push("清虚真人——或者说沈砚——就站在门边，笑着看你。");
  if (state.karma <= -40) facts.push("你身后的人不多，且大多不敢看你的眼睛。");
  return facts;
}

export function evalEnding(canon, state) {  const realm = realmOf(state).index;
  const candidates = canon.endings
    .filter((ending) => matches(ending.conditions || {}, state, realm))
    .sort((a, b) => b.priority - a.priority);
  return candidates[0] || null;
}

function matches(cond, state, realm) {
  if (cond.dead && !state.status.startsWith("dead")) return false;
  if (!cond.dead && state.status.startsWith("dead")) return false;
  if (cond.minRealm !== undefined && realm < cond.minRealm) return false;
  if (cond.minFame !== undefined && state.fame < cond.minFame) return false;
  if (cond.maxFame !== undefined && state.fame > cond.maxFame) return false;
  if (cond.minKarma !== undefined && state.karma < cond.minKarma) return false;
  for (const flag of cond.flags || []) if (!knowsFlag(state, flag)) return false;
  for (const weapon of cond.weapons || []) if (!state.weapons.includes(weapon)) return false;
  if (cond.partner) {
    const partner = Object.entries(state.relations).some(([id, value]) => value >= 70 && id !== "lu_jinghong");
    if (!partner) return false;
  }
  for (const [attr, value] of Object.entries(cond.minAttr || {})) {
    if ((state.attrs[attr] || 0) < value) return false;
  }
  return true;
}
