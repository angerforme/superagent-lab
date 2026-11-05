// 设定守卫：LLM 写得再漂亮，也不能改动这个江湖的硬设定。
// 越界的名字、时代错置的词汇、提前泄露的秘密，都会被拦下，退回模板叙述。

const ANACHRONISMS = [
  "手机", "电脑", "网络", "网吧", "APP", "app", "系统", "面板", "玩家", "任务栏",
  "等级", "经验值", "攻略", "直播", "视频", "咖啡", "啤酒", "汽车", "飞机", "电影",
  "游戏", "服务器", "账号", "登录", "技能冷却", "副本", "NPC", "boss", "OK", "ok"
];

const SPOILERS = [
  { flag: "qingxu_revealed", words: ["执棋人", "沈砚"] },
  { flag: "longyuan_fake", words: ["龙渊是假的", "假龙渊"] },
  { flag: "truth_jiuding", words: ["兵主之魂"] }
];

export function guardScene(canon, state, scene, raw, { strict = true } = {}) {
  const problems = [];
  if (!raw || typeof raw.prose !== "string") {
    return { ok: false, problems: ["叙述缺失"], prose: null, options: null };
  }

  let prose = raw.prose.trim();
  if (prose.length < 40) problems.push("叙述过短");
  if (prose.length > 1600) {
    prose = prose.slice(0, 1600);
    problems.push("叙述过长（已截断）");
  }

  for (const word of ANACHRONISMS) {
    if (prose.includes(word)) problems.push(`时代错置用语：${word}`);
  }
  for (const spoiler of SPOILERS) {
    if (state.flags?.[spoiler.flag]) continue;
    for (const word of spoiler.words) {
      if (prose.includes(word)) problems.push(`提前泄露：${word}`);
    }
  }

  const quoted = [...prose.matchAll(/《([^》]+)》/g)].map((m) => m[1]);
  const artNames = new Set(canon.arts.map((a) => a.name));
  for (const title of quoted) {
    if (!artNames.has(title) && !["九兵录", "血月经", "大悲经", "百草经"].includes(title)) {
      problems.push(`虚构典籍：《${title}》`);
    }
  }

  const options = [];
  const expected = scene.options || [];
  if (!Array.isArray(raw.options) || raw.options.length !== expected.length) {
    problems.push("选项数量不符");
  } else {
    for (let i = 0; i < expected.length; i++) {
      const item = raw.options[i];
      const text = typeof item?.text === "string" ? item.text.trim() : "";
      if (text.length < 2 || text.length > 30) problems.push(`选项${i + 1}长度不当`);
      for (const word of ANACHRONISMS) {
        if (text.includes(word)) problems.push(`选项${i + 1}用了时代错置用语`);
      }
      options.push({ id: expected[i].id, text: text || expected[i].label });
    }
  }

  const fatal = problems.some((p) => !p.includes("已截断"));
  if (strict && fatal) {
    return { ok: false, problems, prose: null, options: null };
  }
  return { ok: !fatal, problems, prose, options };
}

export function scenePrompt(canon, state, scene, outcome, options) {
  const realm = ["凡体", "三流", "二流", "一流", "超一流", "宗师", "大宗师", "天人"][state.realm];
  const optionLines = options.map((option, index) => `${index + 1}. ${option.label}（id=${option.id}，机制=${option.kind}）`).join("\n");
  return [
    `【本回合行动结果】`,
    ...(outcome?.lines || []).map((line) => `- ${line}`),
    ``,
    `【江湖动态】`,
    ...(scene.promptFacts || []).slice(-2).map((line) => `- ${line}`),
    ``,
    `【玩家】${state.life.name}，${state.life.gender === "male" ? "男" : "女"}，${state.life.age}岁，${realm}境，位于${canon.regionById.get(state.location).name}。`,
    `内力${Math.round(state.qi)}，气血${Math.round(state.hp)}/${state.hpMax}，声望${Math.round(state.fame)}，银两${Math.round(state.money)}。`,
    state.sect ? `门派：${canon.sectById.get(state.sect)?.name}` : `门派：无（尚未入门）`,
    `持有神兵：${state.weapons.map((id) => canon.weaponById.get(id)?.name).join("、") || "无"}`,
    ``,
    `【本回合可选项（只能改写措辞，顺序与 id 不可变）】`,
    optionLines
  ].join("\n");
}
