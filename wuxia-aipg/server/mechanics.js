// 行动结算：所有数值变化都在这里发生，叙述者只负责把结果写成武侠小说。
// 规则见 docs/06-玩法与数值.md，与固定设定（canon）保持一致。

import { derive, maxHpOf, nextRealm, realmOf, setRelation, addRumor } from "./state.js";
import { clamp } from "./rng.js";

export const ACTION_LABELS = {
  cultivate: "打坐练气",
  practice: "演练武学",
  roam: "行走江湖",
  visit: "拜访人物",
  explore: "探秘寻幽",
  duel: "出手比试",
  heal: "疗伤静养",
  work: "谋生糊口",
  investigate: "追查线索",
  breakthrough: "闭关突破",
  join: "拜师入门",
  reflect: "问心静坐"
};

const GENERIC_FOES = [
  { id: "bandit", name: "拦路山贼", power: 22, reward: 18, fame: 1 },
  { id: "blade", name: "亡命刀客", power: 34, reward: 35, fame: 2 },
  { id: "bloodguard", name: "血月血卫", power: 62, reward: 60, fame: 4, evil: true },
  { id: "constable", name: "镇武司缇骑", power: 55, reward: 30, fame: 2 },
  { id: "ranger", name: "塞北游侠", power: 42, reward: 25, fame: 2 }
];

export function resolveAction(state, action, { canon, rng }) {
  const kind = action.kind;
  const handler = HANDLERS[kind];
  if (!handler) {
    return { kind, title: "无所事事", lines: ["你在客栈里坐了一整天，什么也没做。"], tags: ["idle"] };
  }
  const derived = derive(canon, state);
  const context = { canon, rng, derived, state };
  const outcome = handler(state, action, context);
  outcome.kind = kind;
  outcome.tags = outcome.tags || [];
  state.stats.turnsPlayed += 1;
  return outcome;
}

const HANDLERS = {
  cultivate(state, action, { canon, rng }) {
    const inner = bestInnerArt(canon, state);
    const realm = realmOf(state);
    let gain = 12 + state.attrs.wuxing * 0.16 + state.attrs.gengu * 0.07;
    gain *= inner ? 1 + (inner.effects.qiMax || 0) / 600 : 1;
    gain *= rng.float(0.8, 1.3);
    if (realm.index >= 5) gain *= 0.62;
    gain = Math.round(gain);

    const lines = [`你寻了处避风的所在，依着${inner ? inner.name : "吐纳之法"}打坐，一坐便是半月。`];
    state.qi += gain;
    lines.push(`内力如细流汇入丹田，涨了约莫${gain}分。`);

    let injured = false;
    if (rng.chance(0.05 + (realm.index >= 4 ? 0.04 : 0))) {
      const loss = Math.round(maxHpOf(canon, state) * 0.12);
      state.hp -= loss;
      state.flags.wounded = true;
      state.stats.injuries += 1;
      injured = true;
      lines.push("行至第九周天，真气忽然逆冲，你闷哼一声，嘴角见血——这是走火之兆。");
    }
    return {
      title: "打坐练气",
      lines,
      tags: ["cultivate", injured ? "injury" : "calm"],
      injured
    };
  },

  practice(state, action, { canon, rng }) {
    const candidates = state.arts
      .map((entry) => ({ entry, art: canon.artById.get(entry.id) }))
      .filter((item) => item.art);
    if (candidates.length === 0) {
      return {
        title: "演练武学",
        lines: ["你摆了几个架势，才发觉自己连一套完整的功夫都不会。江湖不是光靠胆子就能走的。"],
        tags: ["practice", "empty"]
      };
    }
    const chosen = action.target
      ? candidates.find((c) => c.entry.id === action.target) || candidates[0]
      : candidates.sort((a, b) => a.entry.mastery - b.entry.mastery)[0];
    const gain = rng.int(6, 13) + Math.round(state.attrs.wuxing / 12);
    const before = chosen.entry.mastery;
    chosen.entry.mastery = clamp(before + gain, 0, 100);
    state.qi += rng.int(1, 3);

    return {
      title: `演练${chosen.art.name}`,
      lines: [
        `你在溪边一遍遍拆解${chosen.art.name}的招式，从前觉得顺的地方，如今看出了破绽。`,
        `这一门功夫的熟稔又深了一层（${Math.round(before)} → ${Math.round(chosen.entry.mastery)}）。`
      ],
      tags: ["practice", chosen.art.id]
    };
  },

  roam(state, action, { canon, rng, derived }) {
    const target = canon.regionById.get(action.target);
    if (!target) {
      return { title: "行走江湖", lines: ["你收拾行囊，却不知该往何处去。"], tags: ["roam", "fail"] };
    }
    const from = canon.regionById.get(state.location);
    const cost = rng.int(6, 24);
    state.money = Math.max(0, state.money - cost);
    state.location = target.id;
    const fame = Math.round(rng.int(1, 3) * derived.fameGain);
    state.fame += fame;

    const lines = [
      `你从${from.name}动身，一路风尘，走了月余，到了${target.name}。`,
      `${target.desc.split("。")[0]}。`
    ];

    if (
      target.id === "longquan" &&
      state.flags.wentian_ready &&
      !state.weapons.includes("wentian")
    ) {
      const bond = state.relations.yue_qingluan || 0;
      if (bond >= 20) {
        state.weapons.push("wentian");
        state.fame += 15;
        state.flags.wentian_held = true;
        addRumor(state, "龙泉有人看见，越青鸾把一柄未开锋的剑交给了一个年轻人。");
        lines.push("你刚进剑池，越青鸾就认出了你。她抱着一柄青白色的长剑，剑身没有锋，剑脊上有一道星痕。");
        lines.push("「爹说，这柄剑不认血脉，只认命。」她把剑递过来，「我看了你很久。你接得住吗？」");
        return {
          title: "剑择其主",
          lines,
          tags: ["roam", "longquan", "wentian"],
          weapon: "wentian",
          encounter: { npcId: "yue_qingluan", name: "越青鸾" }
        };
      }
      state.flags.wentian_seen = true;
      setRelation(state, "yue_qingluan", 6);
      lines.push("龙泉的炉火已经熄了。剑池边站着一个披麻戴孝的姑娘，怀里抱着一柄没有锋的长剑，剑脊上有一道星痕。");
      lines.push("她看了你很久，忽然问：「你说，一柄剑铸了十七年，值不值得？」你没有答上来，她也没有再问。");
      return {
        title: "剑池边的姑娘",
        lines,
        tags: ["roam", "longquan", "wentian_seen"],
        encounter: { npcId: "yue_qingluan", name: "越青鸾" }
      };
    }

    let encounter = null;
    const locals = canon.characters.filter((c) => c.region === target.id);
    if (locals.length && rng.chance(0.55)) {
      const npc = rng.pick(locals);
      const delta = setRelation(state, npc.id, rng.int(2, 8));
      encounter = { npcId: npc.id, name: npc.name };
      lines.push(`在城中你遇见了${npc.name}（${npc.title}），对方看了你一眼，似是记住了你的脸。`);
      addRumor(state, `${target.name}一带近来有${npc.name}的踪迹。`);
      encounter.relation = delta;
    } else if (rng.chance(0.5)) {
      const flavor = rng.pick([
        "路边的茶棚里，说书人正讲到血月三现，惊堂木一拍，满座无声。",
        "城门口的告示被雨水泡烂了，依稀认得出「悬赏」「血月」几个字。",
        "你在渡口看见一个背剑的年轻人，对方也在看你，两人都没说话。",
        "夜宿破庙，墙上有人用剑刻了八个字：九兵认主，命不由人。"
      ]);
      lines.push(flavor);
    }
    return { title: "行走江湖", lines, tags: ["roam", target.id], encounter };
  },

  visit(state, action, { canon, rng, derived }) {
    const npc = canon.characterById.get(action.target);
    if (!npc) return { title: "拜访", lines: ["你想找的人不在这里。"], tags: ["visit", "fail"] };
    if (npc.region && npc.region !== state.location && rng.chance(0.6)) {
      return {
        title: "拜访",
        lines: [`你赶到${npc.name}常居之处，却扑了个空——听说他往别处去了。`],
        tags: ["visit", "miss"]
      };
    }
    const gain = Math.round((rng.int(4, 10) + Math.round(state.attrs.meili / 20)) * derived.relationGain);
    const relation = setRelation(state, npc.id, gain);
    const lines = [];

    if (
      npc.id === "yue_qingluan" &&
      state.flags.wentian_seen &&
      !state.weapons.includes("wentian")
    ) {
      const gain2 = rng.int(8, 14);
      const bond = setRelation(state, npc.id, gain2);
      state.flags.wentian_asked = true;
      return {
        title: "剑池夜话",
        lines: [
          "你又去了剑池。越青鸾还坐在那里，脚边是一堆未成的剑胚。",
          "她说了很多话：说她爹怎么把星陨铁从坑里拖回来，说她怎么偷看剑谱，说她其实知道开锋要用什么。",
          "临走时她把一样东西塞进你手里——半枚烧融的剑镡。「你要是还来，我就把它给你。」"
        ],
        tags: ["visit", npc.id, "wentian"],
        encounter: { npcId: npc.id, name: npc.name, relation: bond }
      };
    }

    if (
      npc.id === "yue_qingluan" &&
      state.flags.wentian_born &&
      !state.weapons.includes("wentian") &&
      relation >= 45
    ) {
      state.weapons.push("wentian");
      state.fame += 15;
      state.flags.wentian_held = true;
      return {
        title: "沧浪一剑",
        lines: [
          "越青鸾把父亲的骨灰坛放在桌上，坛边立着一柄青白色的剑。",
          "「他铸了十七年，就为了铸一柄问得出的剑。」她声音很轻，「现在剑成了，人没了。」",
          "她把剑推到你面前：「你带着它走。别让它只是插在龙泉的雪里。」"
        ],
        tags: ["visit", npc.id, "wentian"],
        weapon: "wentian",
        encounter: { npcId: npc.id, name: npc.name, relation }
      };
    }

    if (relation >= 60 && rng.chance(0.4)) {
      const learnable = (npc.arts || [])
        .map((id) => canon.artById.get(id))
        .filter((art) => art && !state.arts.some((a) => a.id === art.id) && art.grade !== "天");
      if (learnable.length) {
        const art = rng.pick(learnable);
        state.arts.push({ id: art.id, mastery: rng.int(12, 24) });
        lines.push(`${npc.name}见你根基不差，随手点拨了${art.name}的入门关窍，你竟记了个七七八八。`);
        return { title: `拜访${npc.name}`, lines, tags: ["visit", npc.id, "learn"], encounter: { npcId: npc.id, name: npc.name, relation } };
      }
    }

    lines.push(`你登门拜访${npc.name}。${rng.pick([
      "对方话不多，却留你吃了一盏茶。",
      "你们谈了些江湖旧事，临别时对方多看了你一眼。",
      "对方正在忙，只与你说了三句话，但每一句都够你想三天。",
      "茶凉了两次，话却越说越投机。"
    ])}`);
    lines.push(`交情：${relation >= 0 ? "+" : ""}${gain}（${relationName(relation)}）。`);
    return { title: `拜访${npc.name}`, lines, tags: ["visit", npc.id], encounter: { npcId: npc.id, name: npc.name, relation } };
  },

  explore(state, action, { canon, rng, derived }) {
    const region = canon.regionById.get(state.location);
    const lines = [];
    let reward = 0;
    let clue = null;
    let weapon = null;
    let injured = false;

    lines.push(rng.pick([
      `你在${region.name}郊外寻了一处荒废的山神庙，庙里的供桌是新的。`,
      `你循着一道干涸的溪谷往深处走，越走越静，静得能听见自己的心跳。`,
      `你在${region.name}的旧书摊上翻到半卷残页，纸是百年前的东西。`,
      `你跟着一队商旅走了三天，第四天他们忽然改道，说前面不干净。`
    ]));

    if (
      state.location === "longquan" &&
      state.flags.wentian_ready &&
      !state.weapons.includes("wentian") &&
      (state.relations.yue_qingluan || 0) >= 10 &&
      rng.chance(0.9)
    ) {
      state.weapons.push("wentian");
      state.fame += 15;
      state.flags.wentian_held = true;
      addRumor(state, "龙泉有人看见，越青鸾把一柄未开锋的剑交给了一个年轻人。");
      return {
        title: "剑择其主",
        lines: [
          "你在剑池边撞见越青鸾。她抱着一柄青白色的长剑，剑身没有锋，剑脊上有一道星痕。",
          "「爹说，这柄剑不认血脉，只认命。」她把剑递过来，「我看了你很久。你接得住吗？」",
          "剑入手的刹那，炉火与你掌心的血同时亮了一瞬。"
        ],
        tags: ["explore", "wentian"],
        weapon: "wentian"
      };
    }

    const roll = rng.next();
    if (roll < 0.3) {
      reward = rng.int(20, 90);
      state.money += reward;
      lines.push(`神像底下压着一只木匣，里头是散碎银两与一张当票，约莫值${reward}两。`);
    } else if (roll < 0.55) {
      const candidates = state.clues.length < 6
        ? canon.beats.filter((b) => b.turn >= state.turn && b.turn <= state.turn + 4)
        : [];
      if (candidates.length) {
        const beat = rng.pick(candidates);
        clue = { id: `clue_${beat.id}`, text: `你无意间撞见一桩与「${beat.title}」有关的异动。`, beatId: beat.id };
        state.clues.push(clue);
        state.stats.clues += 1;
        lines.push(`你在残页上读到一段没头没尾的话，与近来「${beat.title}」的传闻对得上。`);
      } else {
        reward = rng.int(10, 40);
        state.money += reward;
        lines.push("你没找到什么要紧的东西，只捡了些值钱的零碎。");
      }
    } else if (roll < 0.68) {
      const raw = region.id === "xiyu" || region.id === "saibei" || region.id === "longquan";
      if (raw && rng.chance(0.4)) {
        const wound = rng.int(12, 30);
        state.hp -= wound;
        injured = true;
        state.flags.wounded = true;
        state.stats.injuries += 1;
        lines.push("沙土忽然塌陷，你摔进一处地穴，肋骨磕在石棱上，疼得半晌起不来。");
      } else {
        reward = rng.int(15, 55);
        state.money += reward;
        lines.push("你摸到一处旧镖局的暗格，里头还剩些银钱。");
      }
    } else {
      const wound = rng.int(8, 26);
      state.hp -= wound;
      injured = true;
      state.stats.injuries += 1;
      state.flags.wounded = true;
      lines.push("林子里忽然窜出两个蒙面人，你拼死才脱身，肩上挨了一刀。");
    }

    const fame = Math.round(rng.int(1, 3) * derived.fameGain);
    state.fame += fame;
    return { title: "探秘寻幽", lines, tags: ["explore", injured ? "injury" : "calm"], clue, weapon, injured };
  },

  duel(state, action, { canon, rng, derived }) {
    const target = resolveDuelTarget(canon, state, action.target, rng);
    const enemyPower = target.npc ? Math.round(24 + target.npc.power * 1.1) : target.power + 20;
    const playerRoll = derived.combatPower + rng.int(-12, 12);
    const enemyRoll = enemyPower + rng.int(-12, 12);
    const win = playerRoll >= enemyRoll;
    state.stats.duels += 1;
    const lines = [];

    if (target.npc) {
      lines.push(`你与${target.npc.name}在${canon.regionById.get(state.location).name}动了手。${target.npc.name}的成名绝技是${canon.artById.get(target.npc.arts?.[0])?.name || "一路快剑"}，一出手便知深浅。`);
    } else {
      lines.push(`你在${canon.regionById.get(state.location).name}遇上了${target.name}，话不投机，只能手上见真章。`);
    }

    if (win) {
      state.stats.wins += 1;
      const fame = Math.round((target.npc ? 4 : target.fame) * derived.fameGain);
      state.fame += fame;
      const money = target.npc ? 0 : target.reward;
      state.money += money;
      if (target.npc) setRelation(state, target.npc.id, rng.int(-8, -3));
      lines.push(`三十招后，${target.npc ? target.npc.name : target.name}退了一步，抱拳认输。你赢得不算漂亮，但赢了。`);
      if (money) lines.push(`你从对方身上搜出${money}两银子，算是这场比试的彩头。`);
      return { title: "出手比试", lines, tags: ["duel", "win"], encounter: target.npc ? { npcId: target.npc.id, name: target.npc.name } : null };
    }

    const wound = Math.round(rng.int(14, 34) + (target.npc ? target.npc.power * 0.25 : 0));
    state.hp -= wound;
    state.flags.wounded = true;
    state.stats.injuries += 1;
    if (target.npc) setRelation(state, target.npc.id, rng.int(2, 6));
    lines.push(`你败了，${target.npc ? target.npc.name + "收了手" : "对方没有追"}，但肋下那一记仍让你吐了血。`);
    return {
      title: "出手比试",
      lines,
      tags: ["duel", "lose", "injury"],
      injured: true,
      encounter: target.npc ? { npcId: target.npc.id, name: target.npc.name } : null
    };
  },

  heal(state, action, { canon, rng, derived }) {
    const maxHp = maxHpOf(canon, state);
    const base = rng.int(18, 32) + derived.heal;
    const gain = Math.min(maxHp - state.hp, base);
    state.hp = Math.min(maxHp, state.hp + base);
    const cost = rng.int(4, 14);
    state.money = Math.max(0, state.money - cost);
    if (state.hp >= maxHp * 0.9) delete state.flags.wounded;

    return {
      title: "疗伤静养",
      lines: [
        "你寻了间安静的客栈住下，抓了几副药，把伤口重新包扎了一遍。",
        `睡了三天三夜，气色好了些（气血 +${Math.round(gain)}，花了${cost}两药钱）。`
      ],
      tags: ["heal"]
    };
  },

  work(state, action, { canon, rng, derived }) {
    const earned = Math.round(rng.int(18, 55) * derived.moneyGain);
    state.money += earned;
    state.fame += 1;
    return {
      title: "谋生糊口",
      lines: [
        rng.pick([
          "你在镖局接了一趟短镖，护着两车布匹走了三百里，路上没出事。",
          "你在渡口替人搬了半月货，掌柜多给了几个铜板。",
          "你在药铺坐堂，替人看了半个月的伤风咳嗽。",
          "你替一间武馆撑了半个月场面，馆主很满意。"
        ]),
        `除去吃住，你攒下${earned}两银子。江湖再大，饭总要吃。`
      ],
      tags: ["work"]
    };
  },

  investigate(state, action, { canon, rng, derived }) {
    const upcoming = canon.beats.filter((b) => b.turn >= state.turn && b.turn <= state.turn + 2);
    const beat = action.target ? canon.beats.find((b) => b.id === action.target) : rng.pick(upcoming);
    state.stats.clues += 1;
    const lines = [];

    if (!beat) {
      state.fame += 1;
      state.karma += 1;
      return {
        title: "追查线索",
        lines: ["你四处打听，只问出些家长里短的闲话。江湖太大，秘密太多，不是每条线都通着大事。"],
        tags: ["investigate", "empty"]
      };
    }

    const already = state.clues.find((c) => c.beatId === beat.id);
    if (!already) {
      state.clues.push({ id: `clue_${beat.id}`, text: beat.text.slice(0, 60) + "……", beatId: beat.id });
    }
    state.karma += 1;
    const gain = Math.round(rng.int(2, 5) * derived.fameGain);
    state.fame += gain;
    lines.push(`你顺着「${beat.title}」的传闻一路查下去，从酒肆伙计问到城门老兵，拼出了一角真相。`);
    lines.push(rng.pick([
      "有些事一旦知道，就再也回不到不知道的时候了。",
      "你把线索记在纸上，又觉得这张纸烫手。",
      "有人在暗处看着你，你没有回头。"
    ]));
    return { title: "追查线索", lines, tags: ["investigate", beat.id], clue: { beatId: beat.id } };
  },

  breakthrough(state, action, { canon, rng, derived }) {
    const next = nextRealm(state);
    if (state.realm >= 7) {
      return { title: "闭关突破", lines: ["你的内力已至天人境，再往上，已不是人力可及。"], tags: ["breakthrough", "max"] };
    }
    if (state.qi < next.qi) {
      return {
        title: "闭关突破",
        lines: [`你试图冲击${next.name}，真气行至半途便散了——内力还差${Math.round(next.qi - state.qi)}分火候。`],
        tags: ["breakthrough", "fail"]
      };
    }
    const chance = clamp(0.42 + state.attrs.xinxing / 320 + (state.qi - next.qi) / 1400, 0.2, 0.92);
    if (rng.chance(chance)) {
      state.realm = next.index;
      state.hp = maxHpOf(canon, state);
      state.qi += 20;
      state.fame += 6;
      state.attrs.wuxing = clamp(state.attrs.wuxing + 1, 0, 100);
      return {
        title: "闭关突破",
        lines: [
          `你在山中闭关四十九日，第七日心魔来袭，第四十二日真气贯通任督。`,
          `出关时天正下雪，你站在雪里，忽然觉得天地比从前宽了——${next.name}。`
        ],
        tags: ["breakthrough", "success"]
      };
    }
    const wound = Math.round(maxHpOf(canon, state) * 0.16);
    state.hp -= wound;
    state.flags.wounded = true;
    state.stats.injuries += 1;
    return {
      title: "闭关突破",
      lines: [
        "闭关第三十日，真气冲关不成，反噬经脉。你咬着牙撑到天亮，才没有走火入魔。",
        `境界未成，人却伤了（气血 -${wound}）。`
      ],
      tags: ["breakthrough", "fail", "injury"],
      injured: true
    };
  },

  join(state, action, { canon, rng }) {
    const sect = canon.sectById.get(action.target);
    if (!sect) return { title: "拜师入门", lines: ["你连要去哪座山门都没想好。"], tags: ["join", "fail"] };
    if (state.sect) return { title: "拜师入门", lines: ["你已身在江湖门派之中，一身不能事二主。"], tags: ["join", "fail"] };
    if (state.location !== sect.seat) {
      return { title: "拜师入门", lines: [`${sect.name}的山门在${canon.regionById.get(sect.seat).name}，你还在路上。`], tags: ["join", "fail"] };
    }
    const leader = canon.characterById.get(sect.leader);
    const relation = state.relations[sect.leader] || 0;
    if (relation < 15 && state.fame < 12) {
      return {
        title: "拜师入门",
        lines: [`你在${sect.name}山门外跪了三日，守门弟子只说：掌门不见无名之辈。`],
        tags: ["join", "reject"]
      };
    }
    state.sect = sect.id;
    state.flags[`joined_${sect.id}`] = true;
    state.fame += 8;
    if (sect.type === "魔道") {
      state.karma -= 40;
      state.flags.joined_evil = true;
    }
    const art = (sect.signatureArts || [])
      .map((id) => canon.artById.get(id))
      .filter(Boolean)
      .sort((a, b) => gradeRank(a.grade) - gradeRank(b.grade))[0];
    const lines = [`你入${sect.name}门下。${leader ? leader.name + "亲自看了你的根骨，点了点头。" : ""}`];
    if (art) {
      state.arts.push({ id: art.id, mastery: rng.int(18, 28) });
      lines.push(`门中传你${art.name}，算是入门。`);
    }
    setRelation(state, sect.leader, 10);
    return { title: "拜师入门", lines, tags: ["join", sect.id] };
  },

  reflect(state, action, { canon, rng }) {
    state.attrs.xinxing = clamp(state.attrs.xinxing + 1, 0, 100);
    state.hp = Math.min(maxHpOf(canon, state), state.hp + 6);
    if (Math.abs(state.karma) < 10) delete state.flags.wounded;
    return {
      title: "问心静坐",
      lines: [
        "你在江边坐到日落，什么也没练，只是把这几个月的事一件件想了一遍。",
        rng.pick([
          "有些执念散了，有些执念更硬了。",
          "你想起自己出发那天，忽然明白当时怕的是什么。",
          "江水东流，你忽然觉得江湖没那么大，人也没那么小。"
        ])
      ],
      tags: ["reflect"]
    };
  }
};

function bestInnerArt(canon, state) {
  return state.arts
    .map((entry) => canon.artById.get(entry.id))
    .filter((art) => art && (art.type === "内功" || art.type === "心法"))
    .sort((a, b) => (b.effects.qiMax || 0) - (a.effects.qiMax || 0))[0] || null;
}

function resolveDuelTarget(canon, state, targetId, rng) {
  if (targetId) {
    const npc = canon.characterById.get(targetId);
    if (npc) return { npc };
    const foe = GENERIC_FOES.find((f) => f.id === targetId);
    if (foe) return { ...foe };
  }
  const locals = canon.characters.filter((c) => c.region === state.location && c.power <= 45 + state.realm * 12);
  if (locals.length && rng.chance(0.6)) return { npc: rng.pick(locals) };
  return rng.pick(GENERIC_FOES);
}

function gradeRank(grade) {
  return { 黄: 0, 玄: 1, 地: 2, 天: 3 }[grade] ?? 0;
}

function relationName(value) {
  if (value >= 80) return "生死之交";
  if (value >= 50) return "知己";
  if (value >= 20) return "熟识";
  if (value > -20) return "点头之交";
  if (value > -50) return "有隙";
  return "仇怨";
}
