// 引擎：把「玩家选择 → 数值结算 → 天下大事 → 叙述 → 下一回合」串起来。
// 同一个种子 + 同一串选择 = 同一段人生。

import { randomUUID } from "node:crypto";
import { createState, view, addLog } from "./state.js";
import { resolveAction } from "./mechanics.js";
import { advanceClock, applyFinale, composeFinaleFacts, evalEnding, turnBeat } from "./story.js";
import { composeScene, sanitizeOptions } from "./director.js";
import { offlineScene } from "./narrators/offline.js";
import { Rng } from "./rng.js";

export class GameEngine {
  constructor({ canon, narrator }) {
    this.canon = canon;
    this.narrator = narrator;
  }

  newLife(seed = cryptoSeed()) {
    const safeSeed = seed >>> 0;
    const state = createState(this.canon, { seed: safeSeed, id: randomUUID() });
    return {
      seed: safeSeed,
      life: {
        name: state.life.name,
        gender: state.life.gender === "male" ? "男" : "女",
        age: state.life.age,
        title: state.life.title,
        background: state.life.backgroundName,
        backgroundText: state.life.backgroundText,
        seedText: state.life.seedText,
        appearance: state.life.appearance,
        talents: state.life.talents,
        destiny: state.life.destiny,
        attrs: state.attrs,
        money: state.money,
        arts: state.arts.map((entry) => this.canon.artById.get(entry.id)?.name).filter(Boolean),
        location: this.canon.regionById.get(state.location)?.name
      }
    };
  }

  async start(seed = cryptoSeed()) {
    const safeSeed = seed >>> 0;
    const state = createState(this.canon, { seed: safeSeed, id: randomUUID() });
    const region = this.canon.regionById.get(state.location);
    const beatInfos = turnBeat(this.canon, state);
    const opening = beatInfos[0] || null;
    const outcome = {
      kind: "prologue",
      title: "初入江湖",
      lines: [
        `${state.life.name}，${state.life.age}岁，${state.life.backgroundName}出身。${state.life.backgroundText}`,
        `${state.life.appearance}${state.life.seedText}`,
        opening
          ? `你还没弄明白江湖的规矩，天下已经先出了事：${opening.beat.title}。${firstSentence(opening.beat.text)}`
          : `你站在${region.name}的街口，第一次觉得自己可以决定往哪儿走。`
      ],
      tags: ["prologue"]
    };
    const scene = composeScene(this.canon, state, { outcome, beatInfo: opening, rng: new Rng(state.seed ^ 0x9e3779b9) });
    scene.beat = opening?.beat || null;
    state.pendingScene = scene;
    await this.#narrate(state, scene, outcome);
    return state;
  }

  async act(state, optionId) {
    if (state.status !== "alive") return state;
    const scene = state.pendingScene;
    if (!scene) throw new Error("当前没有可执行的场景");
    const option = scene.options.find((o) => o.id === optionId);
    if (!option) throw new Error("选项已失效，请刷新当前局面");

    const rng = Rng.from(state.seed, "action", state.turn, optionId, state.stats.turnsPlayed);

    if (option.kind === "finale") {
      const finale = applyFinale(this.canon, state, option.target);
      state.stats.turnsPlayed += 1;
      const ending = evalEnding(this.canon, state);
      state.ending = ending
        ? { id: ending.id, name: ending.name, desc: ending.desc, epitaph: ending.epitaph }
        : { id: "nameless", name: "无名之墓", desc: this.canon.endings.at(-1).desc, epitaph: this.canon.endings.at(-1).epitaph };
      state.status = "ended";
      state.history.push({ turn: state.turn, kind: "finale", target: option.target });

      const outcome = {
        kind: "finale",
        title: "大衍终局",
        lines: [finale?.line || "你做出了选择。", state.ending.desc],
        tags: ["finale", option.target]
      };
      const endScene = {
        title: "终局",
        subtitle: `${scene.subtitle ?? ""}`,
        options: [],
        npcIds: scene.npcIds,
        finale: true,
        promptFacts: outcome.lines,
        act: scene.act
      };
      await this.#narrate(state, endScene, outcome);
      state.pendingScene = {
        ...state.pendingScene,
        title: "终局",
        prose: endScene.prose || "",
        source: endScene.source || "offline",
        options: [],
        ending: state.ending
      };
      return state;
    }

    const outcome = resolveAction(state, option, { canon: this.canon, rng });
    state.history.push({ turn: state.turn, kind: option.kind, target: option.target, summary: outcome.title });

    if (outcome.clue && outcome.clue.beatId) {
      if (!state.clues.some((c) => c.beatId === outcome.clue.beatId)) state.clues.push(outcome.clue);
    }
    for (const line of outcome.lines) addLog(state, "action", line);

    // 伤重不治
    if (state.hp <= 0) {
      state.status = "dead";
      state.hp = 0;
      const ending = evalEnding(this.canon, state);
      state.ending = { id: "death", name: "身死道消", desc: ending?.desc || "", epitaph: ending?.epitaph || "" };
      const deadScene = {
        title: "身死道消",
        subtitle: `${state.turn}`,
        options: [],
        npcIds: [],
        finale: true,
        promptFacts: ["你在江湖上走完了最后一程。"],
        act: scene.act
      };
      await this.#narrate(state, deadScene, {
        kind: "death",
        title: "身死道消",
        lines: ["你倒下去的时候，天正在下雪。江湖太大，死一个人像落一片雪。"],
        tags: ["death"]
      });
      state.pendingScene = { ...deadScene, prose: deadScene.prose || "", options: [], ending: state.ending };
      return state;
    }

    // 时间推进，天下大事照常发生
    advanceClock(this.canon, state);
    const beatInfos = turnBeat(this.canon, state);
    const lastBeat = beatInfos.at(-1) || null;

    // 最终幕：让玩家在大势之前做最后一次选择
    if (state.turn >= this.canon.world.rules.maxTurns) {
      const ending = evalEnding(this.canon, state);
      state.ending = ending
        ? { id: ending.id, name: ending.name, desc: ending.desc, epitaph: ending.epitaph }
        : { id: "nameless", name: "无名之墓", desc: "", epitaph: "" };
      state.status = "ended";
      const endScene = {
        title: state.ending.name,
        subtitle: scene.act || "",
        options: [],
        npcIds: [],
        finale: true,
        promptFacts: [state.ending.desc]
      };
      await this.#narrate(state, endScene, outcome);
      state.pendingScene = { ...endScene, prose: endScene.prose || "", source: endScene.source || "offline", ending: state.ending };
      return state;
    }

    const sceneNext = composeScene(this.canon, state, {
      outcome,
      beatInfo: lastBeat,
      rng: Rng.from(state.seed, "scene", state.turn)
    });
    sceneNext.beat = lastBeat?.beat || null;
    if (sceneNext.finale) {
      sceneNext.promptFacts = [...(outcome.lines || []), ...composeFinaleFacts(this.canon, state)];
    }
    sceneNext.options = sanitizeOptions(sceneNext.options, this.canon, state);
    await this.#narrate(state, sceneNext, outcome);
    state.pendingScene = sceneNext;
    return state;
  }

  async #narrate(state, scene, outcome) {
    const options = scene.options || [];
    let result = null;

    if (this.narrator?.available) {
      result = await this.narrator.narrate({
        canon: this.canon,
        state,
        scene,
        outcome,
        options
      });
      if (result?.error && result.problems) {
        result = await this.narrator.narrate({
          canon: this.canon,
          state,
          scene,
          outcome,
          options,
          retryHint: result.problems.join("；")
        });
      }
    }

    if (!result || result.error) {
      if (result?.error) {
        state.flags._llm_error = result.error;
        state.log.push({ turn: state.turn, kind: "system", text: `叙述者换人：${result.error}` });
      }
      result = offlineScene(this.canon, state, scene, outcome, { seed: state.seed + state.turn * 7919 });
    }

    const byId = new Map((result.options || []).map((o) => [o.id, o.text]));
    scene.prose = result.prose;
    scene.source = result.source;
    scene.options = options.map((option) => ({
      ...option,
      text: byId.get(option.id) || option.label
    }));
    state.flags._narrator = result.source;
  }

  view(state) {
    return view(this.canon, state);
  }
}

function firstSentence(text) {
  const index = text.indexOf("。");
  return index > 0 ? text.slice(0, index + 1) : `${text.slice(0, 60)}……`;
}

export function cryptoSeed() {
  return (Math.floor(Math.random() * 0xffffffff) ^ Date.now()) >>> 0;
}

