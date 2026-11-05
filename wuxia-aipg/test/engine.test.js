import test from "node:test";
import assert from "node:assert/strict";
import { loadCanon } from "../server/canon.js";
import { GameEngine } from "../server/engine.js";
import { evalEnding } from "../server/story.js";
import { createState } from "../server/state.js";

const canon = await loadCanon();
const engine = new GameEngine({ canon, narrator: { available: false } });

test("同一个种子、同一串选择，得到完全相同的人生", async () => {
  const a = await engine.start(777);
  const b = await engine.start(777);
  assert.equal(a.life.name, b.life.name);
  assert.equal(a.pendingScene.prose, b.pendingScene.prose);

  const sequence = ["o1", "o2", "o3", "o1", "o4", "o2"];
  for (const optionId of sequence) {
    await engine.act(a, optionId);
    await engine.act(b, optionId);
  }
  assert.equal(a.turn, b.turn);
  assert.equal(a.qi, b.qi);
  assert.equal(a.hp, b.hp);
  assert.equal(a.pendingScene.prose, b.pendingScene.prose);
  assert.equal(a.location, b.location);
});

test("每回合推进一季，年表从承平二十三年春走到冬", async () => {
  const state = await engine.start(4242);
  assert.equal(state.turn, 0);
  assert.equal(state.pendingScene.subtitle.includes("承平二十三年·春"), true);
  for (let i = 0; i < 4; i++) {
    const option = state.pendingScene.options[0];
    await engine.act(state, option.id);
  }
  assert.equal(state.turn, 4);
  const label = engine.view(state).calendar.label;
  assert.ok(label.includes("二十四") || label.includes("24"), label);
});

test("固定主线到点必发：血月三次、执棋人现身、大衍终局", async () => {
  const state = await engine.start(9090);
  while (state.status === "alive" && !state.pendingScene?.finale) {
    const option = state.pendingScene.options[0];
    await engine.act(state, option.id);
  }
  assert.equal(state.flags.blood_moon_1, true);
  assert.equal(state.flags.blood_moon_2, true);
  assert.equal(state.flags.blood_moon_3, true);
  assert.equal(state.flags.qingxu_revealed, true);
  assert.equal(state.flags.final_battle, true);
  assert.equal(state.turn, canon.world.rules.maxTurns - 1);
  assert.ok(state.pendingScene.options.some((o) => o.kind === "finale"));
});

test("终局选择会落成一个结局并结束这一局", async () => {
  const state = await engine.start(31337);
  while (state.status === "alive" && !state.pendingScene?.finale) {
    await engine.act(state, state.pendingScene.options[0].id);
  }
  const close = state.pendingScene.options.find((o) => o.target === "close_gate");
  assert.ok(close, "终局应提供守门选项");
  await engine.act(state, close.id);
  assert.equal(state.status, "ended");
  assert.ok(state.ending?.name);
  const view = engine.view(state);
  assert.equal(view.scene.options.length, 0);
  assert.equal(view.ending.name, state.ending.name);
});

test("身死会立即判定结局，且不能再行动", async () => {
  const state = await engine.start(555);
  state.status = "dead";
  const ending = evalEnding(canon, state);
  assert.equal(ending.id, "death");
  const before = JSON.stringify(state.pendingScene);
  await engine.act(state, state.pendingScene.options[0].id);
  assert.equal(JSON.stringify(state.pendingScene), before);
});

test("所有行动都能被合法结算，数值不出现 NaN", async () => {
  let checked = 0;
  for (const seed of [11, 22, 33, 44, 55]) {
    const state = await engine.start(seed);
    while (state.status === "alive" && state.turn < canon.world.rules.maxTurns - 1) {
      const options = state.pendingScene.options;
      const option = options[state.turn % options.length];
      await engine.act(state, option.id);
      const view = engine.view(state);
      assert.ok(Number.isFinite(view.resources.hp));
      assert.ok(Number.isFinite(view.resources.qi));
      assert.ok(Number.isFinite(view.resources.money));
      assert.ok(view.resources.hp <= view.resources.hpMax + 1);
      assert.ok(view.scene.prose.length > 20, `种子 ${seed} 第 ${state.turn} 回合叙述为空`);
      checked++;
    }
  }
  assert.ok(checked > 50, `实际只走了 ${checked} 回合`);
});

test("玩家不可能用不存在的选项推进回合", async () => {
  const state = await engine.start(1);
  await assert.rejects(() => engine.act(state, "o99"), /选项已失效/);
});

test("出生地的门派、人物与地区都来自设定表", async () => {
  for (let seed = 1; seed <= 60; seed++) {
    const state = createState(canon, { seed, id: `t-${seed}` });
    assert.ok(canon.regionById.has(state.location));
    assert.ok(state.qi >= 0 && state.hp > 0);
    assert.equal(state.sect, null);
  }
});
