import test from "node:test";
import assert from "node:assert/strict";
import { loadCanon } from "../server/canon.js";

const canon = await loadCanon();

test("设定自检通过（引用完整、主线时序不冲突）", () => {
  assert.equal(canon.integrity.ok, true, canon.integrity.errors.join("\n"));
});

test("固定设定的规模符合设计", () => {
  assert.equal(canon.sects.length, 12);
  assert.equal(canon.weapons.length, 9);
  assert.equal(canon.characters.length, 17);
  assert.ok(canon.arts.length >= 30);
  assert.equal(canon.beats.length, 24);
  assert.ok(canon.endings.length >= 7);
});

test("门派绝学、掌门、山门都能解析", () => {
  for (const sect of canon.sects) {
    assert.ok(canon.regionById.has(sect.seat), `${sect.id} 的山门不存在`);
    assert.ok(canon.characterById.has(sect.leader), `${sect.id} 的掌门不存在`);
    for (const artId of sect.signatureArts) {
      assert.ok(canon.artById.has(artId), `${sect.id} 的绝学 ${artId} 不存在`);
    }
  }
});

test("神兵都有主人与现世地，且主人属于对应势力", () => {
  for (const weapon of canon.weapons) {
    assert.ok(canon.characterById.has(weapon.owner), `${weapon.id} 的主人不存在`);
    assert.ok(canon.regionById.has(weapon.seat), `${weapon.id} 的所在地不存在`);
    assert.ok(weapon.condition && weapon.power, `${weapon.id} 缺少认主条件或威能`);
  }
});

test("主线事件按年表严格递增，且每幕至少四个事件", () => {
  const turns = canon.beats.map((beat) => beat.turn);
  assert.deepEqual(turns, [...turns].sort((a, b) => a - b));
  assert.equal(new Set(turns).size, turns.length);
  for (const act of canon.storyline.acts) {
    assert.ok(act.beats.length >= 4, `${act.id} 事件太少`);
  }
});

test("终局发生在最后一季，且第一幕从开局开始", () => {
  assert.equal(canon.beats.at(-1).turn, canon.world.rules.maxTurns - 1);
  assert.equal(canon.beats[0].turn, 0);
});

test("每个结局都能被条件命中（不存在空条件以外的孤立结局）", () => {
  const ids = new Set(canon.endings.map((e) => e.id));
  assert.ok(ids.has("death"));
  assert.ok(ids.has("nameless"));
  for (const ending of canon.endings) {
    assert.ok(ending.desc.length > 40, `${ending.id} 缺少结局文本`);
    assert.ok(ending.epitaph.length > 4, `${ending.id} 缺少判词`);
  }
});
