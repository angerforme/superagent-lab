// 与后端通信的薄封装：所有游戏状态都由服务器裁决，前端只负责呈现与传话。

async function request(path, options = {}) {
  const response = await fetch(path, {
    headers: { "content-type": "application/json" },
    ...options
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error || `请求失败（${response.status}）`);
  }
  return data;
}

export const api = {
  health: () => request("/api/health"),
  canon: () => request("/api/canon"),
  newLife: (seed) => request(`/api/life${seed !== undefined && seed !== null && seed !== "" ? `?seed=${seed}` : ""}`),
  start: (seed) => request("/api/game", { method: "POST", body: JSON.stringify({ seed }) }),
  getGame: (id) => request(`/api/game/${encodeURIComponent(id)}`),
  action: (gameId, optionId) =>
    request(`/api/game/${encodeURIComponent(gameId)}/action`, {
      method: "POST",
      body: JSON.stringify({ optionId })
    }),
  save: (gameId, slot) =>
    request(`/api/game/${encodeURIComponent(gameId)}/save`, {
      method: "POST",
      body: JSON.stringify({ slot })
    }),
  saves: () => request("/api/saves"),
  load: (slot) => request(`/api/saves/${encodeURIComponent(slot)}`, { method: "POST", body: "{}" }),
  removeSave: (slot) => request(`/api/saves/${encodeURIComponent(slot)}`, { method: "DELETE" })
};
