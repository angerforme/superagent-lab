// 存档：内存里跑，磁盘上留。存档就是一个 JSON 文件，可以拷走、可以复现。

import { mkdir, readFile, readdir, writeFile, rename, unlink } from "node:fs/promises";
import path from "node:path";

export class GameStore {
  constructor({ dataDir }) {
    this.dataDir = path.join(dataDir, "saves");
    this.games = new Map();
  }

  async init() {
    await mkdir(this.dataDir, { recursive: true });
  }

  put(state) {
    this.games.set(state.id, state);
    return state;
  }

  get(id) {
    return this.games.get(id) || null;
  }

  delete(id) {
    this.games.delete(id);
  }

  async save(state, slot) {
    const safe = sanitizeSlot(slot || state.id);
    const file = path.join(this.dataDir, `${safe}.json`);
    const tmp = `${file}.tmp`;
    const payload = {
      slot: safe,
      savedAt: new Date().toISOString(),
      state
    };
    await writeFile(tmp, JSON.stringify(payload, null, 2), "utf8");
    await rename(tmp, file);
    return { slot: safe, savedAt: payload.savedAt };
  }

  async load(slot) {
    const safe = sanitizeSlot(slot);
    const file = path.join(this.dataDir, `${safe}.json`);
    const payload = JSON.parse(await readFile(file, "utf8"));
    if (!payload?.state?.id) throw new Error("存档损坏");
    this.games.set(payload.state.id, payload.state);
    return payload;
  }

  async list() {
    await mkdir(this.dataDir, { recursive: true });
    const files = (await readdir(this.dataDir)).filter((f) => f.endsWith(".json"));
    const saves = [];
    for (const file of files) {
      try {
        const payload = JSON.parse(await readFile(path.join(this.dataDir, file), "utf8"));
        const state = payload.state;
        saves.push({
          slot: payload.slot ?? file.replace(/\.json$/, ""),
          savedAt: payload.savedAt,
          name: state?.life?.name,
          turn: state?.turn,
          realm: state?.realm,
          status: state?.status
        });
      } catch {
        // 坏档跳过
      }
    }
    return saves.sort((a, b) => String(b.savedAt).localeCompare(String(a.savedAt)));
  }

  async remove(slot) {
    const safe = sanitizeSlot(slot);
    await unlink(path.join(this.dataDir, `${safe}.json`)).catch(() => {});
    return { slot: safe };
  }
}

export function sanitizeSlot(slot) {
  const cleaned = String(slot || "")
    .replace(/[^\w\u4e00-\u9fa5-]/g, "")
    .slice(0, 48);
  if (!cleaned || cleaned === "." || cleaned === "..") return "slot";
  return cleaned;
}
