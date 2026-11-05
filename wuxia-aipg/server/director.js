// 回合导演：决定这一回合「能做什么」。选项的机制含义由引擎决定，叙述者只能改写措辞。
// 这样 LLM 负责文采，规则负责平衡，两边互不越界。

import { maxHpOf, nextRealm } from "./state.js";
import { availableFinales, currentAct, nextBeat } from "./story.js";
import { calendarOf } from "./state.js";

const FOE_LABELS = {
  bandit: "拦路山贼",
  blade: "亡命刀客",
  bloodguard: "血月血卫",
  constable: "镇武司缇骑",
  ranger: "塞北游侠"
};

export function composeScene(canon, state, { outcome, beatInfo, rng }) {
  const calendar = calendarLabel(canon, state);
  const region = canon.regionById.get(state.location);
  const finale = state.turn >= canon.world.rules.maxTurns - 1;

  const npcIds = new Set();
  for (const entry of state.log.slice(-3)) {
    const found = canon.characters.find((c) => entry.text.includes(c.name));
    if (found) npcIds.add(found.id);
  }
  if (outcome?.encounter?.npcId) npcIds.add(outcome.encounter.npcId);
  if (beatInfo?.involved && beatInfo.beat?.reveal) npcIds.add(beatInfo.beat.reveal);

  if (finale) {
    const options = availableFinales(state).map((choice, index) => ({
      id: `f${index + 1}`,
      kind: "finale",
      target: choice.target,
      label: choice.label,
      hint: choice.requires
    }));
    return {
      title: "大衍终局",
      subtitle: `${calendar}·${region.name}`,
      options,
      npcIds: [...npcIds],
      finale: true,
      act: currentAct(canon, state).title,
      promptFacts: [
        "九鼎之门就在眼前，百年谶语走到最后一步。",
        "玩家必须在此做出抉择；无论选什么，这个江湖都会记住今天。"
      ]
    };
  }

  const options = buildOptions(canon, state, { rng, npcIds });
  return {
    title: outcome?.title || "江湖路远",
    subtitle: `${calendar}·${region.name}`,
    options,
    npcIds: [...npcIds],
    finale: false,
    act: currentAct(canon, state).title,
    promptFacts: outcome?.lines || []
  };
}

function buildOptions(canon, state, { rng, npcIds }) {
  const hpRatio = state.hp / maxHpOf(canon, state);
  const next = nextRealm(state);
  const localNpcs = canon.characters.filter((c) => c.region === state.location);
  const upcoming = nextBeat(canon, state);
  const options = [];
  const used = new Set();

  const push = (option) => {
    if (!option || used.has(option.kind) || options.length >= 4) return false;
    used.add(option.kind);
    options.push({ id: `o${options.length + 1}`, ...option });
    return true;
  };

  // 第一栏：这一季最要紧的一件事（铸剑 > 突破 > 疗伤 > 查案）
  const urgent = [];
  if (state.flags.wentian_ready && !state.weapons.includes("wentian")) {
    const bond = state.relations.yue_qingluan || 0;
    if (state.location === "longquan" && state.flags.wentian_seen && bond < 10) {
      urgent.push({ kind: "visit", target: "yue_qingluan", label: "再去看看越青鸾", hint: "她好像有话没说" });
    } else if (state.location === "longquan") {
      urgent.push({ kind: "explore", target: null, label: "去剑池边看看那柄剑", hint: "越青鸾在那里" });
    } else {
      urgent.push({ kind: "roam", target: "longquan", label: "动身去龙泉", hint: "有柄剑铸了十七年" });
    }
  }
  if (state.qi >= next.qi && state.realm < 7) {
    urgent.push({ kind: "breakthrough", target: null, label: `闭关冲击${next.name}`, hint: "内力已足，成败看心境" });
  }
  if (hpRatio < 0.5) {
    urgent.push({ kind: "heal", target: null, label: "找个地方疗伤", hint: "气血不足，硬撑要出事" });
  }
  if (upcoming && upcoming.turn - state.turn <= 2) {
    urgent.push({ kind: "investigate", target: upcoming.id, label: `追查「${upcoming.title}」`, hint: "江湖风声紧了" });
  }
  push(urgent[0]);

  // 第二栏：内力是江湖的根本
  push({ kind: "cultivate", target: null, label: "打坐练气", hint: "内力是江湖的根本" });

  // 第三栏：入门 / 访人 / 练招
  const sect = canon.sects.find((s) => s.seat === state.location);
  const canJoin = !state.sect && sect && ((state.relations[sect.leader] || 0) >= 12 || state.fame >= 10);
  if (canJoin) {
    push({ kind: "join", target: sect.id, label: `投帖拜入${sect.name}`, hint: "从此有了师门" });
  } else if (localNpcs.length && rng.chance(0.75)) {
    const npc = rankNpc(localNpcs, state, rng);
    push({ kind: "visit", target: npc.id, label: `去见${npc.name}`, hint: npc.title });
  } else {
    const art = pickArt(canon, state);
    push({ kind: "practice", target: art?.id || null, label: art ? `打磨${art.name}` : "演练拳脚", hint: "熟能生巧" });
  }

  // 第四栏：出门、探秘、动手、谋生
  const fourth = [];
  const destination = rng.pick(canon.world.regions.filter((r) => r.id !== state.location));
  fourth.push({ kind: "roam", target: destination.id, label: `动身去${destination.name}`, hint: destination.kind, weight: 3 });
  fourth.push({ kind: "explore", target: null, label: "往偏僻处走走", hint: "可能有意外之获", weight: 2.2 });
  if (state.money < 80) fourth.push({ kind: "work", target: null, label: "接一桩活计", hint: "盘缠不多了", weight: 2 });
  if (rng.chance(0.55)) {
    const foe = pickFoe(canon, state, localNpcs, rng);
    if (foe) fourth.push({ kind: "duel", target: foe.id, label: `与${foe.label}动手`, hint: foe.hint, weight: 1.3 });
  }
  fourth.push({ kind: "reflect", target: null, label: "静坐问心", hint: "心乱了，功夫也练不进去", weight: 1 });
  push(rng.weighted(fourth));

  // 保底
  while (options.length < 3) {
    const art = pickArt(canon, state);
    const filler = [
      { kind: "practice", target: art?.id || null, label: art ? `打磨${art.name}` : "演练拳脚" },
      { kind: "cultivate", label: "打坐练气" },
      { kind: "explore", label: "四处走走" },
      { kind: "reflect", label: "静一静" }
    ].find((entry) => !used.has(entry.kind));
    if (!filler) break;
    push(filler);
  }
  return options;
}

function pickArt(canon, state) {
  return state.arts
    .map((entry) => canon.artById.get(entry.id))
    .filter(Boolean)
    .sort((a, b) => a.name.length - b.name.length)[0];
}

function rankNpc(list, state, rng) {
  const scored = list.map((npc) => {
    const relation = state.relations[npc.id] || 0;
    const fresh = relation >= 45 ? 0 : 30;
    return { npc, score: fresh + npc.power * 0.2 - Math.abs(relation) * 0.4 + rng.int(0, 30) };
  });
  scored.sort((a, b) => b.score - a.score);
  return scored[0].npc;
}

function pickFoe(canon, state, localNpcs, rng) {
  const pool = localNpcs.filter((c) => c.power <= 30 + state.realm * 14);
  if (pool.length && rng.chance(0.6)) {
    const npc = rng.pick(pool);
    return { id: npc.id, label: npc.name, hint: npc.title };
  }
  const foes = state.realm >= 3 ? ["bloodguard", "constable", "blade"] : ["bandit", "blade", "ranger"];
  const id = rng.pick(foes);
  return { id, label: FOE_LABELS[id], hint: "输赢都要付代价" };
}

function calendarLabel(canon, state) {
  return calendarOf(canon, state).label;
}

export function sanitizeOptions(options, canon, state) {
  const validKinds = new Set([
    "cultivate", "practice", "roam", "visit", "explore", "duel",
    "heal", "work", "investigate", "breakthrough", "join", "reflect", "finale"
  ]);
  return options.filter((option) => {
    if (!validKinds.has(option.kind)) return false;
    if (option.kind === "roam" && !canon.regionById.has(option.target)) return false;
    if (option.kind === "visit" && !canon.characterById.has(option.target)) return false;
    if (option.kind === "join" && !canon.sectById.has(option.target)) return false;
    if (option.kind === "practice" && option.target && !canon.artById.has(option.target)) return false;
    if (option.kind === "duel" && option.target && !canon.characterById.has(option.target) && !FOE_LABELS[option.target]) return false;
    if (option.kind === "investigate" && option.target && !canon.beats.some((b) => b.id === option.target)) return false;
    if (option.kind === "finale" && !availableFinales(state).some((c) => c.target === option.target)) return false;
    return true;
  });
}
