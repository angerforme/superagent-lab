// 前端主控：开局、回合、存读档、典籍与快捷键。

import { api } from "./api.js";
import { ScenePainter } from "./scene.js";
import {
  renderCodex,
  renderGame,
  renderLife,
  renderOptions,
  renderSaves,
  setBusy,
  skipTyping,
  toast,
  typeProse
} from "./ui.js";

const state = {
  canon: null,
  life: null,
  game: null,
  painter: null,
  busy: false,
  health: null
};

const $ = (selector) => document.querySelector(selector);
const startScreen = $("#start");
const gameScreen = $("#game");

async function boot() {
  state.painter = new ScenePainter($("#scene"));
  bindEvents();
  try {
    const [health, canon] = await Promise.all([api.health(), api.canon()]);
    state.health = health;
    state.canon = canon;
    updateNarratorTag();
  } catch (error) {
    toast(`服务未就绪：${error.message}`, 5000);
  }

  const resumed = await resumeGame();
  if (!resumed) {
    startScreen.classList.remove("hidden");
    await rollLife();
  }
}

function bindEvents() {
  $("#reroll").addEventListener("click", () => rollLife());
  $("#startBtn").addEventListener("click", () => startGame());
  $("#seedInput").addEventListener("change", () => rollLife());

  $("#codexBtn").addEventListener("click", openCodex);
  $("#codexBtnStart").addEventListener("click", openCodex);
  $("#endingCodexBtn").addEventListener("click", openCodex);

  $("#saveBtn").addEventListener("click", () => openSaves("save"));
  $("#loadBtn").addEventListener("click", () => openSaves("load"));
  $("#confirmSave").addEventListener("click", () => saveGame());

  $("#newLifeBtn").addEventListener("click", () => {
    localStorage.removeItem("wuxia.gameId");
    location.reload();
  });
  $("#quitBtn").addEventListener("click", () => {
    if (confirm("重开一局？当前这一世不会自动存档。")) {
      localStorage.removeItem("wuxia.gameId");
      location.reload();
    }
  });

  $("#codexModal").addEventListener("click", (event) => {
    if (event.target.id === "codexModal" || event.target.closest("[data-close]")) closeModal("#codexModal");
  });
  $("#saveModal").addEventListener("click", (event) => {
    if (event.target.id === "saveModal" || event.target.closest("[data-close]")) closeModal("#saveModal");
  });

  document.querySelectorAll(".tab").forEach((tab) => {
    tab.addEventListener("click", () => {
      document.querySelectorAll(".tab").forEach((t) => t.classList.toggle("active", t === tab));
      for (const id of ["events", "people", "clues"]) {
        $(`#tab${id[0].toUpperCase()}${id.slice(1)}`).classList.toggle("hidden", id !== tab.dataset.tab);
      }
    });
  });

  $("#prose").addEventListener("click", () => skipTyping());

  document.addEventListener("keydown", (event) => {
    if (event.target.matches("input, textarea")) return;
    if (!$("#codexModal").classList.contains("hidden") || !$("#saveModal").classList.contains("hidden")) {
      if (event.key === "Escape") {
        closeModal("#codexModal");
        closeModal("#saveModal");
      }
      return;
    }
    const index = Number(event.key);
    if (index >= 1 && index <= 4 && gameScreen.classList.contains("hidden") === false) {
      const button = document.querySelectorAll(".option")[index - 1];
      if (button && !button.disabled) button.click();
    }
  });
}

function updateNarratorTag() {
  if (!state.health) return;
  const live = state.health.llm;
  const label = live ? `AI 执笔 · ${state.health.narrator}` : "离线叙述者";
  const chip = $("#narratorChip");
  chip.textContent = label;
  chip.classList.toggle("live", Boolean(live));
  $("#narratorTag").textContent = `叙述者：${label}`;
}

async function rollLife() {
  const seedInput = $("#seedInput").value.trim();
  try {
    const data = await api.newLife(seedInput === "" ? undefined : Number(seedInput));
    state.life = data;
    renderLife(data, startScreen);
    $("#startBtn").disabled = false;
  } catch (error) {
    toast(`推演命数失败：${error.message}`, 4000);
  }
}

async function startGame() {
  if (!state.life) return;
  $("#startBtn").disabled = true;
  try {
    const data = await api.start(state.life.seed);
    state.game = data.view;
    localStorage.setItem("wuxia.gameId", data.id);
    enterGame(data.view);
  } catch (error) {
    $("#startBtn").disabled = false;
    toast(`入江湖失败：${error.message}`, 5000);
  }
}

function enterGame(view) {
  startScreen.classList.add("hidden");
  gameScreen.classList.remove("hidden");
  $("#endingScreen").classList.add("hidden");
  renderGame(view, { painter: state.painter });
  typeProse(view.scene?.prose || "", {
    onDone: () => renderOptions(view.scene?.options || [], pick)
  });
  renderOptions(view.scene?.options || [], pick);
}

async function pick(optionId) {
  if (state.busy || !state.game) return;
  if (state.game.status !== "alive") return;
  state.busy = true;
  setBusy(true);
  try {
    const data = await api.action(state.game.id, optionId);
    state.game = data.view;
    renderGame(data.view, { painter: state.painter });
    typeProse(data.view.scene?.prose || "", {
      onDone: () => renderOptions(data.view.scene?.options || [], pick)
    });
    renderOptions(data.view.scene?.options || [], pick);
  } catch (error) {
    toast(`这一招没能递出去：${error.message}`, 5000);
    setBusy(false);
  } finally {
    state.busy = false;
    setBusy(false);
  }
}

async function resumeGame() {
  const id = localStorage.getItem("wuxia.gameId");
  if (!id) return false;
  try {
    const payload = await api.getGame(id);
    state.game = payload.view;
    enterGame(payload.view);
    return true;
  } catch {
    localStorage.removeItem("wuxia.gameId");
    return false;
  }
}

async function openCodex() {
  if (!state.canon) {
    try {
      state.canon = await api.canon();
    } catch (error) {
      toast(`典籍暂不可读：${error.message}`);
      return;
    }
  }
  renderCodex(state.canon, "world");
  $("#codexModal").classList.remove("hidden");
}

function closeModal(selector) {
  $(selector).classList.add("hidden");
}

async function saveGame() {
  if (!state.game) return;
  const slotInput = $("#slotName");
  const slot =
    slotInput.value.trim().replace(/[^\w\u4e00-\u9fa5-]/g, "") ||
    `${state.game.life.name}-${state.game.turn}`;
  try {
    await api.save(state.game.id, slot);
    toast("已写入存档");
    slotInput.value = "";
    await refreshSaves();
  } catch (error) {
    toast(`存档失败：${error.message}`);
  }
}

async function openSaves(mode) {
  if (mode === "save" && state.game?.status !== "alive") {
    toast("这一世已经终了。");
    return;
  }
  $("#saveModal").classList.remove("hidden");
  $("#saveTitle").textContent = mode === "save" ? "存档" : "读档";
  $("#confirmSave").classList.toggle("hidden", mode !== "save");
  $("#slotName").classList.toggle("hidden", mode !== "save");
  await refreshSaves(mode);
}

async function refreshSaves(mode = "save") {
  try {
    const { saves } = await api.saves();
    renderSaves(
      saves,
      async (slot) => {
        try {
          const data = await api.load(slot);
          state.game = data.view;
          localStorage.setItem("wuxia.gameId", data.id);
          closeModal("#saveModal");
          enterGame(data.view);
          toast("读档完成");
        } catch (error) {
          toast(`读档失败：${error.message}`);
        }
      },
      async (slot) => {
        await api.removeSave(slot);
        await refreshSaves(mode);
      }
    );
  } catch (error) {
    toast(`存档列表读取失败：${error.message}`);
  }
}

// 避免界面控制台里出现未捕获异常
window.addEventListener("unhandledrejection", (event) => {
  console.error(event.reason);
  toast(`出了点岔子：${event.reason?.message || event.reason}`, 4000);
});

boot();
