import test from "node:test";
import assert from "node:assert/strict";
import { loadCanon } from "../server/canon.js";
import { rollLife } from "../server/birth.js";

const canon = await loadCanon();

test("同一种子得到同一段人生", () => {
  const a = rollLife(canon, 20261105);
  const b = rollLife(canon, 20261105);
  assert.deepEqual(a, b);
});

test("不同种子得到不同的人生", () => {
  const a = rollLife(canon, 1);
  const b = rollLife(canon, 2);
  assert.notDeepEqual({ ...a, attrs: null, seedText: null }, { ...b, attrs: null, seedText: null });
});

test("每段人生都有两到三个不重复的天赋、一个命格与合法属性", () => {
  for (let seed = 1; seed <= 200; seed++) {
    const life = rollLife(canon, seed);
    assert.ok(life.name.length >= 2, `种子 ${seed} 姓名为空`);
    assert.ok(life.talents.length >= 2 && life.talents.length <= 3);
    assert.equal(new Set(life.talents.map((t) => t.id)).size, life.talents.length);
    assert.ok(life.destiny.id);
    for (const [key, value] of Object.entries(life.attributes)) {
      assert.ok(Number.isInteger(value), `${key} 不是整数`);
      assert.ok(value >= 8 && value <= 95, `${key}=${value} 越界`);
    }
    assert.ok(life.hp > 0 && life.hpMax >= life.hp);
    assert.ok(life.money >= 0);
    assert.ok(canon.regionById.has(life.location));
    for (const art of life.arts) assert.ok(canon.artById.has(art.id));
  }
});

test("出身覆盖全部设定，且每种出身都有初始武学或明确的无武学", () => {
  const seen = new Set();
  for (let seed = 1; seed <= 4000; seed++) {
    const life = rollLife(canon, seed);
    seen.add(life.backgroundId);
    for (const art of life.arts) {
      const def = canon.artById.get(art.id);
      assert.ok(def, `出身 ${life.backgroundId} 的初始武学 ${art.id} 不存在`);
    }
  }
  for (const bg of canon.lifegen.backgrounds) {
    assert.ok(seen.has(bg.id), `出身 ${bg.id} 从未被抽到`);
  }
});
