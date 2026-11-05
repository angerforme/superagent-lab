import test from "node:test";
import assert from "node:assert/strict";
import { loadCanon } from "../server/canon.js";
import { guardScene, scenePrompt } from "../server/guard.js";
import { offlineScene } from "../server/narrators/offline.js";
import { parseJson } from "../server/narrators/llm.js";
import { Rng } from "../server/rng.js";

const canon = await loadCanon();
const scene = {
  title: "演练剑法",
  options: [
    { id: "o1", kind: "cultivate", label: "打坐练气" },
    { id: "o2", kind: "roam", target: "jiangnan", label: "去江南" },
    { id: "o3", kind: "reflect", label: "静坐问心" }
  ],
  promptFacts: ["你练了一整天剑。"]
};

function fakeState(overrides = {}) {
  return {
    seed: 1,
    turn: 0,
    location: "jiangnan",
    life: { name: "沈长风", gender: "male", age: 16 },
    attrs: { gengu: 50, wuxing: 50, fuyuan: 50, xinxing: 50, meili: 50 },
    qi: 20,
    hp: 90,
    hpMax: 100,
    money: 30,
    fame: 0,
    realm: 0,
    arts: [],
    weapons: [],
    sect: null,
    relations: {},
    flags: {},
    log: [],
    pendingScene: scene,
    ...overrides
  };
}

test("合格叙述可以通过设定守卫", () => {
  const result = guardScene(canon, fakeState(), scene, {
    prose: "你在江南的雨里坐了半夜，内力顺着经脉走了一圈，天亮时衣襟已经湿透。远处有人在练剑，剑声很轻。",
    options: [
      { id: "o1", text: "打坐练气" },
      { id: "o2", text: "去江南" },
      { id: "o3", text: "静坐问心" }
    ]
  });
  assert.equal(result.ok, true);
  assert.equal(result.options.length, 3);
});

test("拒绝时代错置的现代词汇", () => {
  const result = guardScene(canon, fakeState(), scene, {
    prose: "你打开了系统面板，看到经验值涨了三百点，于是点了一下升级按钮，心情很好，继续赶路。",
    options: scene.options.map((o) => ({ id: o.id, text: o.label }))
  });
  assert.equal(result.ok, false);
  assert.ok(result.problems.some((p) => p.includes("时代错置")));
});

test("拒绝凭空编造的绝世武学", () => {
  const result = guardScene(canon, fakeState(), scene, {
    prose: "你翻开一本《九阳神功》，只看了三页便觉内力翻涌，浑身舒畅，仿佛天下再无对手，忍不住长啸一声。",
    options: scene.options.map((o) => ({ id: o.id, text: o.label }))
  });
  assert.equal(result.ok, false);
  assert.ok(result.problems.some((p) => p.includes("虚构典籍")));
});

test("在揭秘前拒绝泄露执棋人", () => {
  const result = guardScene(canon, fakeState(), scene, {
    prose: "你忽然明白，执棋人就是清虚真人，他一直在等这一天。雨还在下，你握紧了剑，却不知道该不该出手。",
    options: scene.options.map((o) => ({ id: o.id, text: o.label }))
  });
  assert.equal(result.ok, false);
  assert.ok(result.problems.some((p) => p.includes("提前泄露")));

  const revealed = guardScene(canon, fakeState({ flags: { qingxu_revealed: true } }), scene, {
    prose: "你忽然明白，执棋人就是清虚真人，他一直在等这一天。雨还在下，你握紧了剑，却不知道该不该出手。",
    options: scene.options.map((o) => ({ id: o.id, text: o.label }))
  });
  assert.equal(revealed.ok, true);
});

test("拒绝选项数量不符的叙述", () => {
  const result = guardScene(canon, fakeState(), scene, {
    prose: "你在雨里坐了很久，什么也没想明白，只觉得江湖比来时更远了。",
    options: [{ id: "o1", text: "打坐练气" }]
  });
  assert.equal(result.ok, false);
  assert.ok(result.problems.some((p) => p.includes("选项数量")));
});

test("离线叙述者总能产出合法、可读、含选项的场面", () => {
  for (let turn = 0; turn < 24; turn++) {
    const state = fakeState({ turn });
    const output = offlineScene(canon, state, scene, { lines: ["你练了一整天剑。"] }, { seed: turn });
    assert.ok(output.prose.length > 30, `第 ${turn} 回合叙述过短`);
    assert.equal(output.options.length, scene.options.length);
    const checked = guardScene(canon, state, scene, output);
    assert.equal(checked.ok, true, checked.problems.join("；"));
  }
});

test("提示词包含本回合结果与选项，不包含未解锁秘密", () => {
  const prompt = scenePrompt(canon, fakeState(), scene, { lines: ["你练了一整天剑。"] }, scene.options);
  assert.ok(prompt.includes("你练了一整天剑"));
  assert.ok(prompt.includes("id=o1"));
  assert.ok(!prompt.includes("执棋人"));
});

test("LLM 的 JSON 解析容忍代码围栏与前后噪音", () => {
  assert.deepEqual(parseJson('```json\n{"prose":"a","options":[]}\n```'), { prose: "a", options: [] });
  assert.deepEqual(parseJson('好的，这是结果：{"prose":"b","options":[]} 希望满意'), { prose: "b", options: [] });
  assert.equal(parseJson("完全不是 JSON"), null);
});

test("随机种子在守卫与叙述之间保持稳定", () => {
  assert.equal(Rng.from("a", 1).next(), Rng.from("a", 1).next());
  assert.notEqual(Rng.from("a", 1).next(), Rng.from("a", 2).next());
});
