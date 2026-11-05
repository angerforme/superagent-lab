// 界面渲染：把服务器返回的 view 变成可读的江湖。

import { drawPortrait, weatherOf } from "./scene.js";

const MECH_LABEL = {
  cultivate: "练气",
  practice: "练招",
  roam: "远行",
  visit: "访人",
  explore: "探秘",
  duel: "动手",
  heal: "疗伤",
  work: "谋生",
  investigate: "查案",
  breakthrough: "突破",
  join: "入门",
  reflect: "问心",
  finale: "抉择"
};

const ATTR_LABEL = {
  gengu: "根骨",
  wuxing: "悟性",
  fuyuan: "福缘",
  xinxing: "心性",
  meili: "魅力"
};

const MEMORY = { view: null };

export function escapeHtml(text) {
  return String(text ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function renderLife(data, target) {
  const { life } = data;
  const attrs = Object.entries(life.attrs)
    .map(([key, value]) => `<div class="life-item"><dt>${ATTR_LABEL[key]}</dt><dd>${value}</dd></div>`)
    .join("");
  const talents = life.talents.map((t) => `${escapeHtml(t.name)}（${escapeHtml(t.desc)}）`).join("、");
  target.querySelector("#lifeName").textContent = `${life.name}`;
  target.querySelector("#lifeTitle").textContent = `${life.background} · ${life.gender} · ${life.age}岁`;
  target.querySelector("#lifeSeal").textContent = life.gender === "女" ? "命" : "衍";
  target.querySelector("#lifeGrid").innerHTML = `
    <div class="life-item"><dt>出身</dt><dd>${escapeHtml(life.backgroundText)}</dd></div>
    <div class="life-item"><dt>天赋</dt><dd>${talents || "无"}</dd></div>
    <div class="life-item"><dt>命格</dt><dd>${escapeHtml(life.destiny.name)}<br /><small>${escapeHtml(life.destiny.hint)}</small></dd></div>
    <div class="life-item"><dt>相貌</dt><dd>${escapeHtml(life.appearance)}</dd></div>
    <div class="life-item"><dt>随身</dt><dd>${escapeHtml(life.money)} 两银子 · ${escapeHtml(life.arts.join("、") || "无武艺")}</dd></div>
    <div class="life-item"><dt>起于</dt><dd>${escapeHtml(life.location)}</dd></div>
    ${attrs}
  `;
  target.querySelector("#lifeSeed").textContent = `${life.seedText} · 命数 ${data.seed}`;
}

export function renderGame(view, { painter }) {
  MEMORY.view = view;
  document.querySelector("#charName").textContent = view.life.name;
  document.querySelector("#charTitle").textContent = `${view.life.background} · ${view.life.age}岁`;
  document.querySelector("#eraLabel").textContent = view.calendar.label;

  document.querySelector("#realmName").textContent = view.realm.name;
  document.querySelector("#realmNext").textContent =
    view.realm.index >= 7 ? "已至绝顶" : `下一境：${view.realm.next}（内力 ${view.realm.nextQi}）`;
  document.querySelector("#realmBar").style.width = `${Math.round(view.realm.progress * 100)}%`;

  document.querySelector("#stats").innerHTML = `
    <div class="stat"><b>${view.derived.atk}</b><span>攻</span></div>
    <div class="stat"><b>${view.derived.def}</b><span>防</span></div>
    <div class="stat"><b>${view.derived.spd}</b><span>身法</span></div>
  `;

  document.querySelector("#attrs").innerHTML = Object.entries(view.attrs)
    .map(
      ([key, value]) => `
      <div class="attr">
        <span>${ATTR_LABEL[key]}</span>
        <div class="bar"><i style="width:${Math.max(4, Math.min(100, value))}%"></i></div>
        <em>${value}</em>
      </div>`
    )
    .join("");

  const hpRatio = Math.max(0, Math.min(1, view.resources.hp / view.resources.hpMax));
  document.querySelector("#resources").innerHTML = `
    <div class="res"><span>气血</span><b>${view.resources.hp} / ${view.resources.hpMax}</b></div>
    <div class="res"><span>内力</span><b>${view.resources.qi}</b></div>
    <div class="res"><span>银两</span><b>${view.resources.money}</b></div>
    <div class="res"><span>声望</span><b>${view.resources.fame}</b></div>
    <div class="res"><span>因果</span><b>${view.resources.karma > 0 ? "+" : ""}${view.resources.karma}</b></div>
    <div class="res"><span>还余</span><b>${view.turnsLeft} 季</b></div>
  `;
  document.querySelector("#resources").style.setProperty("--hp", hpRatio);

  const bio = document.querySelector("#bio");
  if (bio) {
    bio.innerHTML = `
      <p><span>命格</span>${escapeHtml(view.life.destiny.name)}<br /><small>${escapeHtml(view.life.destiny.hint)}</small></p>
      <p><span>天赋</span>${view.life.talents.map((t) => escapeHtml(t.name)).join("、") || "无"}</p>
      <p><span>师门</span>${view.sect ? escapeHtml(view.sect.name) : "尚未入门"}</p>
    `;
  }

  document.querySelector("#artList").innerHTML =
    view.arts.length === 0
      ? `<li class="empty">尚未习武</li>`
      : view.arts
          .map(
            (art) =>
              `<li><span><b>${escapeHtml(art.name)}</b><br /><small>${escapeHtml(art.type)} · ${escapeHtml(art.grade)}</small></span><span class="grade">${art.mastery}</span></li>`
          )
          .join("");

  document.querySelector("#weaponList").innerHTML =
    view.weapons.length === 0
      ? `<li class="empty">身无神兵</li>`
      : view.weapons
          .map(
            (weapon) =>
              `<li><span><b>${escapeHtml(weapon.name)}</b><br /><small>${escapeHtml(weapon.power)}</small></span><span class="grade">${escapeHtml(weapon.kind)}</span></li>`
          )
          .join("");

  document.querySelector("#sceneAct").textContent = view.scene?.act || "江湖";
  document.querySelector("#sceneTitle").textContent = view.scene?.title || "江湖路远";
  document.querySelector("#sceneSubtitle").textContent = view.scene?.subtitle || "";
  document.querySelector("#weatherTag").textContent = weatherOf(view.calendar.seasonName, view.turn + view.life.name.length);

  painter?.setScene({
    regionId: view.location.id,
    kind: view.location.kind,
    season: view.calendar.seasonName,
    seed: hashSeed(view.id + view.location.id)
  });

  drawPortrait(document.querySelector("#portrait"), {
    seed: hashSeed(view.id + view.life.name),
    gender: view.life.gender,
    name: view.life.name
  });

  renderRightPanel(view);
  renderEnding(view);
}

export function renderOptions(options, onPick) {
  const holder = document.querySelector("#options");
  holder.innerHTML = "";
  options.forEach((option, index) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "option";
    button.dataset.id = option.id;
    button.style.animationDelay = `${index * 60}ms`;
    button.innerHTML = `
      <span class="num">${index + 1}</span>
      <span class="label">${escapeHtml(option.text || option.label)}</span>
      <span class="mech">${MECH_LABEL[option.kind] || ""}</span>
    `;
    button.addEventListener("click", () => onPick(option.id));
    holder.appendChild(button);
  });
}

let typewriterToken = 0;
let typing = null;

export function typeProse(text, { onDone } = {}) {
  const el = document.querySelector("#prose");
  const token = ++typewriterToken;
  const chars = Array.from(text || "");
  const chunk = Math.max(1, Math.round(chars.length / 160));
  let index = 0;
  el.textContent = "";
  typing = { token, text, done: onDone };

  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    el.textContent = text;
    typing = null;
    onDone?.();
    return;
  }

  const timer = setInterval(() => {
    if (token !== typewriterToken) return clearInterval(timer);
    index = Math.min(chars.length, index + chunk);
    el.textContent = chars.slice(0, index).join("");
    const area = document.querySelector("#scrollArea");
    area.scrollTop = area.scrollHeight;
    if (index >= chars.length) {
      clearInterval(timer);
      if (typing?.token === token) typing = null;
      onDone?.();
    }
  }, 16);
}

export function skipTyping() {
  if (!typing) return;
  typewriterToken++;
  document.querySelector("#prose").textContent = typing.text;
  const done = typing.done;
  typing = null;
  done?.();
}

export function setBusy(busy) {
  document.querySelectorAll(".option").forEach((button) => (button.disabled = busy));
  document.querySelector("#hintline").textContent = busy ? "正在推演下一回合……" : "点击选项，或按 1–4 键。";
}

function renderRightPanel(view) {
  const events = [...view.log].reverse();
  document.querySelector("#tabEvents").innerHTML = `
    <p class="section-title">近来江湖</p>
    ${view.rumors
      .slice()
      .reverse()
      .map((rumor) => `<div class="rumor">${escapeHtml(rumor)}</div>`)
      .join("") || `<p class="empty">江湖暂时平静。</p>`}
    <p class="section-title">你的行迹</p>
    ${events
      .map(
        (entry) => `
        <div class="log-entry ${entry.kind}">
          <time>${seasonLabel(entry.turn)}</time>
          <p>${escapeHtml(entry.text)}</p>
        </div>`
      )
      .join("")}
  `;

  document.querySelector("#tabPeople").innerHTML = `
    <p class="section-title">江湖中人</p>
    ${view.relations
      .map(
        (person) => `
        <div class="person">
          <div class="person-head"><b>${escapeHtml(person.name)}</b><span>${escapeHtml(person.stance)}</span></div>
          <small>${escapeHtml(person.title)} · 交情 ${person.value}</small>
        </div>`
      )
      .join("") || `<p class="empty">还没有人记住你的名字。</p>`}
    <p class="section-title">师门</p>
    <p>${view.sect ? `${escapeHtml(view.sect.name)}（${escapeHtml(view.sect.type)}）<br /><small>${escapeHtml(view.sect.creed)}</small>` : `<span class="empty">尚未入门</span>`}</p>
  `;

  document.querySelector("#tabClues").innerHTML = `
    <p class="section-title">主线线索</p>
    <p class="rumor"><b>${escapeHtml(view.scene?.act || "大衍之局")}</b></p>
    ${
      view.clues
        .map((clue) => `<div class="clue"><b>${escapeHtml(clue.id.replace(/^clue_/, "卷宗·"))}</b>${escapeHtml(clue.text)}</div>`)
        .join("") || `<p class="empty">你还没有查到什么。</p>`
    }
    <p class="section-title">命格</p>
    <p class="rumor">${escapeHtml(view.life.destiny.name)}：${escapeHtml(view.life.destiny.hint)}</p>
    <p class="section-title">天赋</p>
    ${view.life.talents.map((t) => `<p class="rumor">${escapeHtml(t.name)}：${escapeHtml(t.desc)}</p>`).join("")}
  `;
}

function renderEnding(view) {
  if (view.status === "alive") return;
  const screen = document.querySelector("#endingScreen");
  document.querySelector("#endingKicker").textContent = view.status === "dead" ? "死局" : "终局";
  document.querySelector("#endingName").textContent = view.ending?.name || "江湖再见";
  document.querySelector("#endingDesc").textContent = view.ending?.desc || "";
  document.querySelector("#endingEpitaph").textContent = view.ending?.epitaph || "";
  screen.classList.remove("hidden");
}

export function toast(message, ms = 2600) {
  const el = document.querySelector("#toast");
  el.textContent = message;
  el.classList.remove("hidden");
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => el.classList.add("hidden"), ms);
}

export function renderSaves(saves, onLoad, onDelete) {
  const list = document.querySelector("#saveList");
  if (!saves.length) {
    list.innerHTML = `<li class="empty">还没有存档。</li>`;
    return;
  }
  list.innerHTML = "";
  for (const save of saves) {
    const li = document.createElement("li");
    li.innerHTML = `
      <div class="meta"><b>${escapeHtml(save.name || "无名侠客")}</b>
      <small>${escapeHtml(save.slot)} · 第${(save.turn ?? 0) + 1}季 · ${escapeHtml(save.savedAt?.slice(0, 16).replace("T", " ") || "")}</small></div>
      <button class="btn small" type="button" data-load>读档</button>
      <button class="btn small ghost" type="button" data-del>删</button>
    `;
    li.querySelector("[data-load]").addEventListener("click", () => onLoad(save.slot));
    li.querySelector("[data-del]").addEventListener("click", () => onDelete(save.slot));
    list.appendChild(li);
  }
}

export function renderCodex(canon, tab = "world") {
  const tabs = [
    { id: "world", label: "总纲" },
    { id: "sects", label: "门派" },
    { id: "arts", label: "武学" },
    { id: "weapons", label: "神兵" },
    { id: "people", label: "人物" },
    { id: "story", label: "大主线" }
  ];
  const nav = document.querySelector("#codexTabs");
  nav.innerHTML = tabs
    .map((t) => `<button type="button" data-tab="${t.id}" class="${t.id === tab ? "active" : ""}">${t.label}</button>`)
    .join("");
  nav.querySelectorAll("button").forEach((button) => {
    button.addEventListener("click", () => renderCodex(canon, button.dataset.tab));
  });

  const body = document.querySelector("#codexBody");
  body.innerHTML = bodyFor(canon, tab);
  body.scrollTop = 0;
}

function bodyFor(canon, tab) {
  if (tab === "world") {
    return `
      <h3>${escapeHtml(canon.world.name)}</h3>
      <p>${escapeHtml(canon.world.premise)}</p>
      <blockquote>${escapeHtml(canon.world.tagline)}</blockquote>
      <p>${escapeHtml(canon.world.cosmology)}</p>
      <h3>九州地理</h3>
      ${canon.world.regions
        .map((region) => `<h3>${escapeHtml(region.name)}<small>${escapeHtml(region.kind)}</small></h3><p>${escapeHtml(region.desc)}</p>`)
        .join("")}
      <p class="empty">年表：${escapeHtml(canon.world.calendar.era)}${canon.world.calendar.startYear}年春开局，共 ${canon.world.rules.maxTurns} 个时节。</p>
    `;
  }
  if (tab === "sects") {
    return canon.sects
      .map(
        (sect) => `
        <h3>${escapeHtml(sect.name)}<small>${escapeHtml(sect.type)}</small></h3>
        <blockquote>${escapeHtml(sect.creed)}</blockquote>
        <p>${escapeHtml(sect.description)}</p>
        <dl>
          <dt>山门</dt><dd>${escapeHtml(canon.world.regions.find((r) => r.id === sect.seat)?.name || sect.seat)}</dd>
          <dt>掌门</dt><dd>${escapeHtml(canon.characters.find((c) => c.id === sect.leader)?.name || "—")}</dd>
          <dt>绝学</dt><dd>${escapeHtml((sect.signatureArts || []).join("、"))}</dd>
          <dt>入门</dt><dd>${escapeHtml(sect.entry)}</dd>
        </dl>`
      )
      .join("");
  }
  if (tab === "arts") {
    return canon.arts
      .map(
        (art) => `
        <h3>${escapeHtml(art.name)}<small>${escapeHtml(art.grade)} · ${escapeHtml(art.type)}</small></h3>
        <p>${escapeHtml(art.desc)}</p>
        <p class="empty">${escapeHtml(art.lore)}</p>`
      )
      .join("");
  }
  if (tab === "weapons") {
    return canon.weapons
      .map(
        (weapon) => `
        <h3>${escapeHtml(weapon.name)}<small>${escapeHtml(weapon.kind)}</small></h3>
        <p>${escapeHtml(weapon.desc)}</p>
        <dl>
          <dt>威能</dt><dd>${escapeHtml(weapon.power)}</dd>
          <dt>认主</dt><dd>${escapeHtml(weapon.condition)}</dd>
        </dl>`
      )
      .join("");
  }
  if (tab === "people") {
    return canon.characters
      .map(
        (person) => `
        <h3>${escapeHtml(person.name)}<small>${escapeHtml(person.title)}</small></h3>
        <p>${escapeHtml(person.desc)}</p>
        <p class="empty">${escapeHtml((person.personality || []).join(" · "))}</p>`
      )
      .join("");
  }
  return canon.acts
    .map(
      (act) => `
      <h3>${escapeHtml(act.title)}<small>${escapeHtml(act.years)}</small></h3>
      <p>${escapeHtml(act.summary)}</p>
      ${act.beats
        .map(
          (beat) => `<p><b>${escapeHtml(beat.title)}</b>（${escapeHtml(canon.world.calendar.era)}${beat.year}年${escapeHtml(canon.world.calendar.seasons[beat.season])}）<br />${escapeHtml(beat.hint || beat.text || "")}</p>`
        )
        .join("")}`
    )
    .join("");
}

function seasonLabel(turn) {
  const seasons = ["春", "夏", "秋", "冬"];
  const year = 23 + Math.floor(turn / 4);
  return `${toCn(year)}·${seasons[turn % 4]}`;
}

function toCn(n) {
  const digits = ["零", "一", "二", "三", "四", "五", "六", "七", "八", "九"];
  if (n < 10) return digits[n];
  if (n < 20) return `十${n % 10 === 0 ? "" : digits[n % 10]}`;
  return `${digits[Math.floor(n / 10)]}十${n % 10 === 0 ? "" : digits[n % 10]}`;
}

function hashSeed(text) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
