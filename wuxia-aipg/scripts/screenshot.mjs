#!/usr/bin/env node
// 界面截图：需要 playwright + chromium。
//   npm i -D playwright && npx playwright install chromium
//   npm start（另一个终端）
//   npm run shot
// 产物写入 docs/screenshots/，用于 PR 的前后对比与 README 展示。

import { chromium } from "playwright";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT = path.join(ROOT, "docs", "screenshots");
const URL = process.env.WUXIA_URL || `http://127.0.0.1:${process.env.WUXIA_PORT || 3100}/`;

await mkdir(OUT, { recursive: true });

const browser = await chromium.launch({ args: ["--no-sandbox"] });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
const errors = [];
page.on("console", (msg) => msg.type() === "error" && errors.push(msg.text()));
page.on("pageerror", (error) => errors.push(`pageerror: ${error.message}`));

await page.goto(URL, { waitUntil: "networkidle" });
await page.waitForTimeout(700);
await page.screenshot({ path: path.join(OUT, "01-开局.jpg"), type: "jpeg", quality: 90 });

await page.click("#startBtn");
await page.waitForTimeout(1400);
await page.click("#prose");
await page.waitForTimeout(400);
await page.screenshot({ path: path.join(OUT, "02-入江湖.jpg"), type: "jpeg", quality: 90 });

for (let i = 0; i < 2; i++) {
  await page.locator(".option").first().click();
  await page.waitForTimeout(1200);
  await page.click("#prose");
  await page.waitForTimeout(500);
}
await page.screenshot({ path: path.join(OUT, "03-江湖行迹.jpg"), type: "jpeg", quality: 90 });

await page.click("#codexBtn");
await page.waitForTimeout(500);
await page.screenshot({ path: path.join(OUT, "04-典籍.jpg"), type: "jpeg", quality: 90 });
await page.click("#codexModal [data-close]");

// 快进到终局：直接调用 API 走完剩余回合，再让页面恢复这一局
const endingState = await page.evaluate(async () => {
  const response = await fetch("/api/game", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ seed: 20261105 })
  });
  const created = await response.json();
  let view = created.view;
  const choose = (options) =>
    options.find((o) => o.kind === "breakthrough") ||
    options.find((o) => o.kind === "heal") ||
    options.find((o) => o.kind === "investigate") ||
    options.find((o) => o.kind === "cultivate") ||
    options.find((o) => o.kind !== "duel" && o.kind !== "finale") ||
    options[0];
  for (let i = 0; i < 40 && view.status === "alive"; i++) {
    const option = view.scene.finale
      ? view.scene.options.find((o) => o.target === "close_gate") || view.scene.options[0]
      : choose(view.scene.options);
    const step = await fetch(`/api/game/${created.id}/action`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ optionId: option.id })
    });
    if (!step.ok) break;
    view = (await step.json()).view;
    if (!view.scene.options.length) break;
  }
  return { id: created.id, status: view.status, ending: view.ending };
});

await page.evaluate((id) => localStorage.setItem("wuxia.gameId", id), endingState.id);
await page.goto(URL, { waitUntil: "networkidle" });
await page.waitForTimeout(1200);
await page.screenshot({ path: path.join(OUT, "06-终局.jpg"), type: "jpeg", quality: 90 });

const mobile = await browser.newPage({ viewport: { width: 430, height: 900 }, deviceScaleFactor: 2 });
await mobile.goto(URL, { waitUntil: "networkidle" });
await mobile.waitForTimeout(600);
await mobile.screenshot({ path: path.join(OUT, "05-移动端.jpg"), type: "jpeg", quality: 90, fullPage: true });

console.log("截图完成：", OUT);
console.log("终局状态：", endingState.status, endingState.ending?.name || "—");
console.log("控制台错误：", errors.length ? errors : "无");
await browser.close();
