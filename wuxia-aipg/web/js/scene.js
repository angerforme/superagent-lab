// 程序化水墨场景：不依赖任何图片资源，根据地区、季节、天气实时作画。
// 同一局、同一地点、同一季节，画出来的山水是一样的；飘落的雪与雾则会流动。

import { Rng } from "./rng.js";

const SEASON_TINT = {
  春: { sky: ["#20302e", "#3d4f47", "#8a9a86"], ink: "#0d1413", glow: "#d9cfa4", ground: "#1b2622" },
  夏: { sky: ["#0f1c22", "#1f3841", "#4d6f6b"], ink: "#0a1214", glow: "#e8e3c9", ground: "#12201d" },
  秋: { sky: ["#241a16", "#4a3226", "#9a6b45"], ink: "#140d0a", glow: "#e8b874", ground: "#241811" },
  冬: { sky: ["#12161c", "#28313c", "#6c7a86"], ink: "#0a0d11", glow: "#e6eef5", ground: "#1a2026" }
};

const WEATHER_BY_SEASON = {
  春: ["细雨", "柳絮", "薄雾", "新雪初化"],
  夏: ["雷雨", "蝉声", "烈日", "闷热的风"],
  秋: ["落叶", "霜气", "长空雁叫", "西风"],
  冬: ["大雪", "寒风", "冰河", "枯枝上的寒鸦"]
};

export class ScenePainter {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.particles = [];
    this.mist = [];
    this.scene = null;
    this.time = 0;
    this.raf = null;
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(canvas.parentElement || canvas);
    this.resize();
  }

  resize() {
    const parent = this.canvas.parentElement;
    if (!parent) return;
    const rect = parent.getBoundingClientRect();
    if (rect.width < 2 || rect.height < 2) return;
    this.width = rect.width;
    this.height = rect.height;
    this.canvas.width = Math.round(rect.width * this.dpr);
    this.canvas.height = Math.round(rect.height * this.dpr);
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    this.rebuild();
    this.draw();
  }

  setScene({ regionId, kind, season, seed }) {
    this.scene = {
      regionId,
      kind: kind || "江湖",
      season: season || "春",
      seed: (seed >>> 0) || 1
    };
    this.rebuild();
    if (!this.raf) this.loop();
  }

  rebuild() {
    if (!this.scene) return;
    const rng = new Rng(this.scene.seed ^ hashKind(this.scene.kind));
    const area = Math.max(1, this.width * this.height);
    const count = Math.min(90, Math.round(area / 9000));
    this.particles = [];
    for (let i = 0; i < count; i++) {
      this.particles.push({
        x: rng.float(0, this.width),
        y: rng.float(0, this.height),
        r: rng.float(0.6, 2.4),
        vy: rng.float(6, 22),
        vx: rng.float(-8, 8),
        phase: rng.float(0, Math.PI * 2)
      });
    }
    this.mist = [];
    for (let i = 0; i < 5; i++) {
      this.mist.push({
        y: rng.float(0.3, 0.85),
        w: rng.float(0.5, 1.3),
        speed: rng.float(0.004, 0.012),
        phase: rng.float(0, 1),
        alpha: rng.float(0.03, 0.09)
      });
    }
    this.ridges = this.buildRidges(rng);
    this.glints = Array.from({ length: 40 }, () => ({
      x: rng.float(0, 1),
      y: rng.float(0, 1),
      a: rng.float(0.02, 0.09),
      r: rng.float(0.6, 1.8)
    }));
  }

  buildRidges(rng) {
    const layers = [];
    const count = this.scene.kind === "边塞" || this.scene.kind === "绝域" ? 3 : 4;
    for (let l = 0; l < count; l++) {
      const base = 0.34 + l * 0.11;
      const points = [];
      const steps = 14;
      for (let i = 0; i <= steps; i++) {
        const x = i / steps;
        const jag = l === 0 ? 0.12 : 0.075;
        const peak = Math.sin(x * Math.PI * (2 + l)) * jag + rng.float(-0.03, 0.03);
        points.push({ x, y: base - Math.abs(peak) - rng.float(0, 0.02) });
      }
      layers.push({ points, alpha: 0.16 + l * 0.13, base });
    }
    return layers;
  }

  loop() {
    const step = () => {
      this.time += 0.016;
      this.draw();
      this.raf = requestAnimationFrame(step);
    };
    this.raf = requestAnimationFrame(step);
  }

  stop() {
    if (this.raf) cancelAnimationFrame(this.raf);
    this.raf = null;
  }

  draw() {
    if (!this.scene || !this.width) return;
    const ctx = this.ctx;
    const { width: w, height: h } = this;
    const tint = SEASON_TINT[this.scene.season] || SEASON_TINT.春;
    const rng = new Rng(this.scene.seed ^ 0xabc);

    // 天
    const sky = ctx.createLinearGradient(0, 0, 0, h);
    sky.addColorStop(0, tint.sky[0]);
    sky.addColorStop(0.55, tint.sky[1]);
    sky.addColorStop(1, tint.sky[2]);
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, w, h);

    // 日月
    const moonX = w * (0.68 + rng.float(-0.04, 0.04));
    const moonY = h * 0.22;
    const moonR = Math.min(w, h) * 0.075;
    const glow = ctx.createRadialGradient(moonX, moonY, moonR * 0.2, moonX, moonY, moonR * 4);
    glow.addColorStop(0, hexA(tint.glow, 0.55));
    glow.addColorStop(0.35, hexA(tint.glow, 0.12));
    glow.addColorStop(1, hexA(tint.glow, 0));
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(moonX, moonY, moonR * 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = hexA(tint.glow, 0.85);
    ctx.beginPath();
    ctx.arc(moonX, moonY, moonR, 0, Math.PI * 2);
    ctx.fill();

    // 远山
    this.ridges.forEach((layer, index) => {
      ctx.beginPath();
      ctx.moveTo(0, h);
      for (const p of layer.points) ctx.lineTo(p.x * w, p.y * h);
      ctx.lineTo(w, h);
      ctx.closePath();
      ctx.fillStyle = hexA(tint.ink, layer.alpha);
      ctx.fill();
      if (index === this.ridges.length - 1) {
        ctx.strokeStyle = hexA(tint.glow, 0.06);
        ctx.lineWidth = 1;
        ctx.stroke();
      }
    });

    // 地貌
    const groundY = h * 0.74;
    switch (this.scene.kind) {
      case "剑门": this.drawSwordGate(ctx, w, h, groundY, tint, rng); break;
      case "佛门": this.drawTemple(ctx, w, h, groundY, tint, rng); break;
      case "道门": this.drawValley(ctx, w, h, groundY, tint, rng); break;
      case "边塞": this.drawFrontier(ctx, w, h, groundY, tint, rng); break;
      case "水乡": this.drawWaterTown(ctx, w, h, groundY, tint, rng); break;
      case "药谷": this.drawHerbValley(ctx, w, h, groundY, tint, rng); break;
      case "铸兵": this.drawForge(ctx, w, h, groundY, tint, rng); break;
      case "皇城": this.drawCapital(ctx, w, h, groundY, tint, rng); break;
      case "绝域": this.drawDesert(ctx, w, h, groundY, tint, rng); break;
      default: this.drawPlains(ctx, w, h, groundY, tint, rng);
    }

    this.drawMist(ctx, w, h, tint);
    this.drawWeather(ctx, w, h, tint);
    this.drawGrain(ctx, w, h);
  }

  drawGround(ctx, w, h, y, tint, color = "#0a0d0c") {
    const g = ctx.createLinearGradient(0, y, 0, h);
    g.addColorStop(0, hexA(color, 0.72));
    g.addColorStop(1, hexA(color, 0.97));
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(0, y + 4);
    for (let x = 0; x <= w; x += w / 12) {
      ctx.lineTo(x, y + Math.sin(x * 0.01 + this.scene.seed) * 3);
    }
    ctx.lineTo(w, h);
    ctx.lineTo(0, h);
    ctx.closePath();
    ctx.fill();
  }

  drawSwordGate(ctx, w, h, y, tint, rng) {
    // 剑峰
    for (let i = 0; i < 6; i++) {
      const x = w * (0.12 + i * 0.15) + rng.float(-12, 12);
      const top = y - h * rng.float(0.18, 0.42);
      const wide = w * rng.float(0.012, 0.028);
      const grad = ctx.createLinearGradient(x, top, x, y);
      grad.addColorStop(0, hexA(tint.ink, 0.86));
      grad.addColorStop(1, hexA(tint.ink, 0.35));
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.moveTo(x, top);
      ctx.lineTo(x + wide, y);
      ctx.lineTo(x - wide, y);
      ctx.closePath();
      ctx.fill();
    }
    // 石阶与山门
    ctx.strokeStyle = hexA(tint.glow, 0.16);
    ctx.lineWidth = 1;
    for (let i = 0; i < 9; i++) {
      const yy = y + i * 4;
      const ww = 60 + i * 14;
      ctx.beginPath();
      ctx.moveTo(w / 2 - ww / 2, yy);
      ctx.lineTo(w / 2 + ww / 2, yy);
      ctx.stroke();
    }
    ctx.fillStyle = hexA(tint.ink, 0.9);
    ctx.fillRect(w / 2 - 46, y - 62, 8, 62);
    ctx.fillRect(w / 2 + 38, y - 62, 8, 62);
    ctx.fillRect(w / 2 - 62, y - 70, 124, 9);
    ctx.fillStyle = hexA(tint.glow, 0.35);
    ctx.fillRect(w / 2 - 18, y - 58, 36, 5);
    this.drawGround(ctx, w, h, y, tint);
    ctx.fillStyle = hexA(tint.glow, 0.10);
    ctx.fillRect(w / 2 - 1, y - 60, 2, 50);
  }

  drawTemple(ctx, w, h, y, tint, rng) {
    this.drawGround(ctx, w, h, y, tint);
    // 塔林
    for (let i = 0; i < 5; i++) {
      const x = w * (0.16 + i * 0.17);
      const th = h * rng.float(0.1, 0.24);
      ctx.fillStyle = hexA(tint.ink, 0.72);
      ctx.beginPath();
      ctx.moveTo(x - 9, y);
      ctx.lineTo(x - 7, y - th);
      ctx.lineTo(x + 7, y - th);
      ctx.lineTo(x + 9, y);
      ctx.closePath();
      ctx.fill();
      for (let t = 1; t <= 3; t++) {
        const ty = y - th * (t / 4);
        ctx.fillRect(x - 11, ty, 22, 2);
      }
    }
    // 主殿飞檐
    const cx = w * 0.62;
    ctx.fillStyle = hexA(tint.ink, 0.92);
    ctx.beginPath();
    ctx.moveTo(cx - 78, y - 34);
    ctx.quadraticCurveTo(cx, y - 74, cx + 78, y - 34);
    ctx.lineTo(cx + 64, y - 30);
    ctx.quadraticCurveTo(cx, y - 60, cx - 64, y - 30);
    ctx.closePath();
    ctx.fill();
    ctx.fillRect(cx - 56, y - 34, 112, 34);
    ctx.fillStyle = hexA(tint.glow, 0.22);
    ctx.fillRect(cx - 6, y - 26, 12, 26);
    // 香火
    ctx.fillStyle = hexA(tint.glow, 0.18);
    ctx.beginPath();
    ctx.arc(cx + 34, y - 18, 3, 0, Math.PI * 2);
    ctx.fill();
  }

  drawValley(ctx, w, h, y, tint, rng) {
    this.drawGround(ctx, w, h, y + 6, tint);
    // 瀑布
    const fx = w * 0.24;
    const grad = ctx.createLinearGradient(fx, 0, fx, y);
    grad.addColorStop(0, hexA("#cfe4e0", 0.02));
    grad.addColorStop(1, hexA("#cfe4e0", 0.30));
    ctx.fillStyle = grad;
    ctx.fillRect(fx, y - h * 0.45, w * 0.018, h * 0.45);
    // 道观
    const cx = w * 0.58;
    ctx.fillStyle = hexA(tint.ink, 0.9);
    ctx.fillRect(cx - 40, y - 26, 80, 26);
    ctx.beginPath();
    ctx.moveTo(cx - 54, y - 26);
    ctx.quadraticCurveTo(cx, y - 46, cx + 54, y - 26);
    ctx.closePath();
    ctx.fill();
    // 丹炉烟
    ctx.strokeStyle = hexA(tint.glow, 0.10);
    ctx.lineWidth = 2;
    for (let i = 0; i < 3; i++) {
      ctx.beginPath();
      ctx.moveTo(cx + 20, y - 30);
      ctx.bezierCurveTo(cx + 30, y - 60, cx + 8, y - 80, cx + 22, y - 110);
      ctx.stroke();
    }
    // 石灯
    for (let i = 0; i < 4; i++) {
      const x = cx - 70 + i * 46;
      ctx.fillStyle = hexA(tint.glow, 0.12);
      ctx.fillRect(x, y - 14, 2, 14);
      ctx.beginPath();
      ctx.arc(x + 1, y - 16, 2.2, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  drawFrontier(ctx, w, h, y, tint, rng) {
    this.drawGround(ctx, w, h, y - 8, tint, "#151009");
    // 沙丘
    for (let i = 0; i < 2; i++) {
      ctx.beginPath();
      ctx.moveTo(0, y + 20 + i * 22);
      ctx.bezierCurveTo(w * 0.3, y - 20 + i * 26, w * 0.6, y + 40 + i * 20, w, y + 6 + i * 24);
      ctx.lineTo(w, h);
      ctx.lineTo(0, h);
      ctx.closePath();
      ctx.fillStyle = hexA("#0d0a06", 0.5 + i * 0.2);
      ctx.fill();
    }
    // 城墙
    const wallY = y - 34;
    ctx.fillStyle = hexA("#0b0906", 0.92);
    ctx.fillRect(w * 0.08, wallY, w * 0.84, h * 0.1);
    for (let i = 0; i < 14; i++) {
      ctx.fillRect(w * 0.09 + i * (w * 0.06), wallY - 8, w * 0.03, 8);
    }
    // 城楼
    ctx.fillRect(w * 0.44, wallY - 46, w * 0.12, 46);
    ctx.beginPath();
    ctx.moveTo(w * 0.42, wallY - 46);
    ctx.quadraticCurveTo(w * 0.5, wallY - 68, w * 0.58, wallY - 46);
    ctx.closePath();
    ctx.fill();
    // 旗
    ctx.strokeStyle = hexA(tint.glow, 0.3);
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(w * 0.5, wallY - 46);
    ctx.lineTo(w * 0.5, wallY - 86);
    ctx.stroke();
    ctx.fillStyle = hexA("#7a2c26", 0.6);
    ctx.beginPath();
    ctx.moveTo(w * 0.5, wallY - 86);
    ctx.lineTo(w * 0.5 + 26, wallY - 80);
    ctx.lineTo(w * 0.5, wallY - 70);
    ctx.closePath();
    ctx.fill();
  }

  drawWaterTown(ctx, w, h, y, tint, rng) {
    const waterY = y - 6;
    // 水面
    const g = ctx.createLinearGradient(0, waterY, 0, h);
    g.addColorStop(0, hexA("#0c1a1c", 0.55));
    g.addColorStop(1, hexA("#04090b", 1));
    ctx.fillStyle = g;
    ctx.fillRect(0, waterY, w, h - waterY);

    // 屋舍：白墙黛瓦，飞檐翘角
    for (let i = 0; i < 7; i++) {
      const x = w * (0.02 + i * 0.145) + rng.float(-8, 8);
      const width = w * rng.float(0.09, 0.125);
      const wallH = rng.float(30, 52);
      const top = waterY - wallH;
      ctx.fillStyle = hexA("#1a1f22", 0.92);
      ctx.fillRect(x, top, width, wallH);
      // 屋檐
      ctx.beginPath();
      ctx.moveTo(x - 12, top + 2);
      ctx.quadraticCurveTo(x + width * 0.2, top - 12, x + width * 0.5, top - 14);
      ctx.quadraticCurveTo(x + width * 0.8, top - 12, x + width + 12, top + 2);
      ctx.lineTo(x + width + 2, top + 7);
      ctx.quadraticCurveTo(x + width * 0.5, top - 4, x - 2, top + 7);
      ctx.closePath();
      ctx.fillStyle = hexA("#080b0d", 0.98);
      ctx.fill();
      // 窗
      const windows = width > 70 ? 2 : 1;
      for (let k = 0; k < windows; k++) {
        const wx = x + width * (k + 0.5) / windows - 5;
        const lit = rng.chance(0.55);
        ctx.fillStyle = lit ? "rgba(226, 178, 104, 0.5)" : "rgba(60, 70, 72, 0.5)";
        ctx.fillRect(wx, top + wallH * 0.42, 10, 9);
        if (lit) {
          const halo = ctx.createRadialGradient(wx + 5, top + wallH * 0.42 + 4, 1, wx + 5, top + wallH * 0.42 + 4, 26);
          halo.addColorStop(0, "rgba(226, 178, 104, 0.16)");
          halo.addColorStop(1, "rgba(226, 178, 104, 0)");
          ctx.fillStyle = halo;
          ctx.fillRect(wx - 20, top + wallH * 0.42 - 20, 50, 50);
        }
      }
      // 倒影
      ctx.fillStyle = "rgba(226, 178, 104, 0.08)";
      for (let k = 0; k < 5; k++) {
        ctx.fillRect(x + rng.float(4, width - 8), waterY + 6 + k * 6, rng.float(6, 16), 1);
      }
    }

    // 拱桥
    const bx = w * 0.63;
    const bridgeR = Math.min(w * 0.15, h * 0.22);
    ctx.strokeStyle = hexA("#0a0d0e", 0.98);
    ctx.lineWidth = 9;
    ctx.beginPath();
    ctx.arc(bx, waterY + bridgeR * 0.55, bridgeR, Math.PI * 1.08, Math.PI * 1.92);
    ctx.stroke();
    ctx.lineWidth = 1;
    ctx.strokeStyle = hexA(tint.glow, 0.22);
    for (let k = 0; k < 7; k++) {
      const a = Math.PI * (1.1 + (k / 6) * 0.8);
      const x1 = bx + Math.cos(a) * bridgeR;
      const y1 = waterY + bridgeR * 0.55 + Math.sin(a) * bridgeR;
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x1, y1 - 12);
      ctx.stroke();
    }
    ctx.beginPath();
    ctx.arc(bx, waterY + bridgeR * 0.55 - 12, bridgeR, Math.PI * 1.1, Math.PI * 1.9);
    ctx.stroke();
    // 桥影
    ctx.strokeStyle = "rgba(226, 178, 104, 0.06)";
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.arc(bx, waterY + bridgeR * 1.6, bridgeR * 0.9, Math.PI * 1.15, Math.PI * 1.85);
    ctx.stroke();

    // 乌篷船
    const sx = w * 0.3;
    const sy = waterY + Math.min(46, (h - waterY) * 0.45);
    ctx.fillStyle = hexA("#07090a", 0.95);
    ctx.beginPath();
    ctx.moveTo(sx - 30, sy);
    ctx.quadraticCurveTo(sx, sy + 10, sx + 34, sy - 2);
    ctx.quadraticCurveTo(sx + 6, sy - 8, sx - 30, sy);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(sx - 2, sy - 6, 13, Math.PI, 0);
    ctx.fill();
    ctx.strokeStyle = hexA(tint.glow, 0.2);
    ctx.beginPath();
    ctx.moveTo(sx + 28, sy - 2);
    ctx.lineTo(sx + 40, sy - 34);
    ctx.stroke();
    // 船上灯火
    ctx.fillStyle = "rgba(232, 186, 112, 0.6)";
    ctx.beginPath();
    ctx.arc(sx - 2, sy - 2, 2.2, 0, Math.PI * 2);
    ctx.fill();

    // 水纹
    ctx.strokeStyle = "rgba(180, 200, 196, 0.05)";
    ctx.lineWidth = 1;
    for (let k = 0; k < 7; k++) {
      const ly = waterY + 14 + k * ((h - waterY) / 8);
      ctx.beginPath();
      ctx.moveTo(0, ly);
      ctx.quadraticCurveTo(w * 0.5, ly + 3, w, ly - 2);
      ctx.stroke();
    }
  }

  drawHerbValley(ctx, w, h, y, tint, rng) {
    this.drawGround(ctx, w, h, y, tint, "#0c1510");
    // 药田
    ctx.strokeStyle = hexA("#6f9b86", 0.12);
    for (let i = 0; i < 8; i++) {
      const yy = y + 8 + i * 8;
      ctx.beginPath();
      ctx.moveTo(0, yy);
      ctx.lineTo(w, yy - 4);
      ctx.stroke();
    }
    // 药庐
    const cx = w * 0.3;
    ctx.fillStyle = hexA(tint.ink, 0.9);
    ctx.beginPath();
    ctx.moveTo(cx - 34, y - 18);
    ctx.lineTo(cx, y - 58);
    ctx.lineTo(cx + 34, y - 18);
    ctx.closePath();
    ctx.fill();
    ctx.fillRect(cx - 26, y - 18, 52, 18);
    // 草叶
    for (let i = 0; i < 90; i++) {
      const x = rng.float(0, w);
      const yy = rng.float(y + 4, h);
      ctx.strokeStyle = hexA("#7ba48d", rng.float(0.05, 0.18));
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x, yy);
      ctx.quadraticCurveTo(x + 2, yy - 8, x + rng.float(-3, 3), yy - 14);
      ctx.stroke();
    }
  }

  drawForge(ctx, w, h, y, tint, rng) {
    this.drawGround(ctx, w, h, y + 8, tint, "#0f0a07");

    // 炉火与烟
    const fx = w * 0.3;
    const fire = ctx.createRadialGradient(fx, y - 20, 2, fx, y - 20, Math.max(w, h) * 0.34);
    fire.addColorStop(0, "rgba(255, 176, 86, 0.55)");
    fire.addColorStop(0.35, "rgba(206, 102, 34, 0.24)");
    fire.addColorStop(1, "rgba(120, 40, 10, 0)");
    ctx.fillStyle = fire;
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = "rgba(200, 190, 170, 0.08)";
    ctx.lineWidth = 2;
    for (let i = 0; i < 3; i++) {
      ctx.beginPath();
      ctx.moveTo(fx + 10, y - 70);
      ctx.bezierCurveTo(fx + 34, y - 130, fx - 6, y - 180, fx + 22, y - 230);
      ctx.stroke();
    }

    // 铸剑山庄：主屋与飞檐
    const hallX = w * 0.16;
    const hallW = w * 0.42;
    const hallTop = y - h * 0.15;
    ctx.fillStyle = hexA(tint.ink, 0.95);
    ctx.fillRect(hallX, hallTop, hallW, h * 0.15);
    ctx.beginPath();
    ctx.moveTo(hallX - 18, hallTop + 2);
    ctx.quadraticCurveTo(hallX + hallW * 0.5, hallTop - 34, hallX + hallW + 18, hallTop + 2);
    ctx.lineTo(hallX + hallW + 6, hallTop + 8);
    ctx.quadraticCurveTo(hallX + hallW * 0.5, hallTop - 22, hallX - 6, hallTop + 8);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = hexA(tint.ink, 0.98);
    for (let i = 0; i < 4; i++) {
      ctx.fillRect(hallX + 10 + i * (hallW / 4), hallTop + 6, 5, h * 0.15 - 6);
    }
    // 檐下悬剑
    ctx.strokeStyle = hexA(tint.glow, 0.22);
    for (let i = 0; i < 5; i++) {
      const x = hallX + 22 + i * (hallW / 6);
      ctx.beginPath();
      ctx.moveTo(x, hallTop + 12);
      ctx.lineTo(x, hallTop + 34);
      ctx.stroke();
      ctx.fillStyle = hexA(tint.glow, 0.3);
      ctx.fillRect(x - 4, hallTop + 34, 8, 1.5);
    }

    // 冶炉
    ctx.fillStyle = hexA(tint.ink, 0.98);
    ctx.beginPath();
    ctx.moveTo(fx - 34, y);
    ctx.lineTo(fx - 30, y - 46);
    ctx.quadraticCurveTo(fx, y - 62, fx + 30, y - 46);
    ctx.lineTo(fx + 34, y);
    ctx.closePath();
    ctx.fill();
    ctx.fillRect(fx + 20, y - 120, 12, 76);
    ctx.fillStyle = hexA("#ffb35c", 0.55);
    ctx.fillRect(fx - 14, y - 28, 28, 12);
    ctx.fillStyle = hexA("#ffd9a0", 0.35);
    ctx.fillRect(fx - 6, y - 24, 12, 6);

    // 砧与锤
    const ax = w * 0.66;
    ctx.fillStyle = hexA(tint.ink, 0.96);
    ctx.fillRect(ax - 14, y - 16, 28, 16);
    ctx.fillRect(ax - 22, y - 22, 44, 7);
    ctx.strokeStyle = hexA(tint.glow, 0.3);
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(ax + 2, y - 24);
    ctx.lineTo(ax + 14, y - 52);
    ctx.stroke();
    ctx.fillStyle = hexA(tint.ink, 0.9);
    ctx.save();
    ctx.translate(ax + 16, y - 58);
    ctx.rotate(-0.5);
    ctx.fillRect(-8, -6, 16, 12);
    ctx.restore();

    // 火星
    for (let i = 0; i < 26; i++) {
      const t = (this.time * 0.6 + i * 0.37 + rng.float(0, 0.4)) % 1;
      const x = fx + Math.sin(t * 9 + i) * 34;
      const yy = y - 30 - t * 110;
      ctx.fillStyle = `rgba(255, 186, 96, ${0.55 * (1 - t)})`;
      ctx.beginPath();
      ctx.arc(x, yy, 1.5, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  drawCapital(ctx, w, h, y, tint, rng) {
    this.drawGround(ctx, w, h, y, tint);
    // 城门
    const gx = w * 0.5;
    ctx.fillStyle = hexA(tint.ink, 0.96);
    ctx.fillRect(gx - 120, y - 90, 240, 90);
    ctx.beginPath();
    ctx.arc(gx, y - 34, 26, Math.PI, 0);
    ctx.fillRect(gx - 26, y - 34, 52, 34);
    ctx.fillStyle = hexA("#140f0a", 1);
    ctx.beginPath();
    ctx.arc(gx, y - 30, 20, Math.PI, 0);
    ctx.fillRect(gx - 20, y - 30, 40, 30);
    // 城楼
    ctx.fillStyle = hexA(tint.ink, 0.98);
    ctx.beginPath();
    ctx.moveTo(gx - 150, y - 92);
    ctx.quadraticCurveTo(gx, y - 134, gx + 150, y - 92);
    ctx.lineTo(gx + 130, y - 86);
    ctx.quadraticCurveTo(gx, y - 122, gx - 130, y - 86);
    ctx.closePath();
    ctx.fill();
    // 灯笼
    for (let i = 0; i < 6; i++) {
      const x = gx - 110 + i * 44;
      ctx.fillStyle = "rgba(214, 120, 70, 0.55)";
      ctx.beginPath();
      ctx.arc(x, y - 62, 3.2, 0, Math.PI * 2);
      ctx.fill();
    }
    // 远塔
    ctx.fillStyle = hexA(tint.ink, 0.55);
    for (let i = 0; i < 3; i++) {
      const x = w * (0.12 + i * 0.06);
      ctx.fillRect(x, y - 120, 12, 120);
      ctx.fillRect(x - 6, y - 126, 24, 6);
    }
  }

  drawDesert(ctx, w, h, y, tint, rng) {
    this.drawGround(ctx, w, h, y - 4, tint, "#171008");
    for (let i = 0; i < 3; i++) {
      ctx.beginPath();
      ctx.moveTo(0, y + 30 + i * 26);
      ctx.bezierCurveTo(w * 0.35, y - 30 + i * 30, w * 0.7, y + 50 + i * 22, w, y + 10 + i * 26);
      ctx.lineTo(w, h);
      ctx.lineTo(0, h);
      ctx.closePath();
      ctx.fillStyle = hexA("#0d0905", 0.4 + i * 0.22);
      ctx.fill();
    }
    // 残城
    const cx = w * 0.68;
    ctx.fillStyle = hexA(tint.ink, 0.85);
    ctx.fillRect(cx - 60, y - 46, 22, 46);
    ctx.fillRect(cx - 20, y - 66, 18, 66);
    ctx.fillRect(cx + 18, y - 30, 26, 30);
    ctx.beginPath();
    ctx.moveTo(cx - 60, y - 46);
    ctx.lineTo(cx - 52, y - 60);
    ctx.lineTo(cx - 40, y - 46);
    ctx.closePath();
    ctx.fill();
  }

  drawPlains(ctx, w, h, y, tint) {
    this.drawGround(ctx, w, h, y, tint);
    ctx.strokeStyle = hexA(tint.glow, 0.08);
    ctx.lineWidth = 1;
    for (let i = 0; i < 12; i++) {
      const x = (i / 12) * w + 20;
      ctx.beginPath();
      ctx.moveTo(x, y + 12);
      ctx.quadraticCurveTo(x + 4, y - 4, x - 2, y - 16);
      ctx.stroke();
    }
  }

  drawMist(ctx, w, h, tint) {
    for (const band of this.mist) {
      const offset = ((this.time * band.speed + band.phase) % 1.4) - 0.2;
      const x = offset * w;
      const y = band.y * h;
      const g = ctx.createLinearGradient(x, y, x + w * band.w, y);
      g.addColorStop(0, "rgba(220, 230, 230, 0)");
      g.addColorStop(0.5, `rgba(220, 230, 230, ${band.alpha})`);
      g.addColorStop(1, "rgba(220, 230, 230, 0)");
      ctx.fillStyle = g;
      ctx.fillRect(x, y - 22, w * band.w, 44);
    }
  }

  drawWeather(ctx, w, h, tint) {
    const season = this.scene.season;
    const mode = season === "冬" ? "snow" : season === "春" ? "petal" : season === "秋" ? "leaf" : "dust";
    for (const p of this.particles) {
      p.y += p.vy * (mode === "petal" ? 0.28 : 0.5) * 0.016 * 60;
      p.x += Math.sin(this.time + p.phase) * 0.35 + p.vx * 0.016;
      if (p.y > h) { p.y = -8; p.x = Math.random() * w; }
      if (p.x > w) p.x = 0;
      if (p.x < 0) p.x = w;
      ctx.fillStyle =
        mode === "snow" ? "rgba(232, 240, 248, 0.5)"
        : mode === "petal" ? "rgba(226, 190, 196, 0.42)"
        : mode === "leaf" ? "rgba(196, 140, 78, 0.4)"
        : "rgba(226, 214, 190, 0.18)";
      if (mode === "petal" || mode === "leaf") {
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.phase + this.time);
        ctx.fillRect(0, 0, p.r * 1.6, p.r * 0.8);
        ctx.restore();
      } else {
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  drawGrain(ctx, w, h) {
    ctx.save();
    for (const glint of this.glints) {
      ctx.fillStyle = `rgba(236, 229, 214, ${glint.a})`;
      ctx.fillRect(glint.x * w, glint.y * h, glint.r, glint.r);
    }
    ctx.restore();
  }
}

export function weatherOf(season, seed) {
  const rng = new Rng((seed >>> 0) ^ hashKind(season));
  return rng.pick(WEATHER_BY_SEASON[season] || ["风"]);
}

// 人物剪影：同样用程序化水墨，避免任何外部素材。
export function drawPortrait(canvas, { seed, gender, name }) {
  const ctx = canvas.getContext("2d");
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const w = canvas.clientWidth || canvas.width;
  const h = canvas.clientHeight || canvas.height;
  canvas.width = w * dpr;
  canvas.height = h * dpr;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const rng = new Rng((seed >>> 0) ^ 0x51ed);

  const bg = ctx.createLinearGradient(0, 0, 0, h);
  bg.addColorStop(0, "#1a1d25");
  bg.addColorStop(1, "#0b0d11");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, w, h);

  // 远山
  ctx.fillStyle = "rgba(201, 168, 106, 0.08)";
  ctx.beginPath();
  ctx.moveTo(0, h * 0.72);
  ctx.quadraticCurveTo(w * 0.3, h * 0.5, w * 0.55, h * 0.7);
  ctx.quadraticCurveTo(w * 0.8, h * 0.55, w, h * 0.74);
  ctx.lineTo(w, h);
  ctx.lineTo(0, h);
  ctx.closePath();
  ctx.fill();

  // 月
  ctx.fillStyle = "rgba(226, 200, 143, 0.35)";
  ctx.beginPath();
  ctx.arc(w * 0.78, h * 0.24, Math.min(w, h) * 0.1, 0, Math.PI * 2);
  ctx.fill();

  // 人物剪影（半身）
  const cx = w * 0.5;
  const headR = Math.min(w, h) * 0.14;
  const headY = h * 0.42;
  ctx.fillStyle = "rgba(8, 9, 12, 0.92)";
  ctx.beginPath();
  ctx.ellipse(cx, headY, headR * 0.85, headR, 0, 0, Math.PI * 2);
  ctx.fill();
  // 发髻
  ctx.beginPath();
  ctx.ellipse(cx, headY - headR * 0.78, headR * 0.45, headR * 0.4, 0, 0, Math.PI * 2);
  ctx.fill();
  if (gender === "female") {
    ctx.beginPath();
    ctx.moveTo(cx - headR * 0.9, headY - headR * 0.2);
    ctx.quadraticCurveTo(cx - headR * 1.5, headY + headR * 2.2, cx - headR * 0.7, headY + headR * 2.6);
    ctx.lineTo(cx - headR * 0.2, headY + headR * 0.4);
    ctx.closePath();
    ctx.fill();
  }
  // 肩
  ctx.beginPath();
  ctx.moveTo(cx - headR * 3.0, h + 4);
  ctx.quadraticCurveTo(cx - headR * 1.4, headY + headR * 1.2, cx, headY + headR * 1.05);
  ctx.quadraticCurveTo(cx + headR * 1.4, headY + headR * 1.2, cx + headR * 3.0, h + 4);
  ctx.closePath();
  ctx.fill();
  // 衣纹笔触
  ctx.strokeStyle = "rgba(201, 168, 106, 0.16)";
  ctx.lineWidth = 1;
  for (let i = 0; i < 4; i++) {
    ctx.beginPath();
    ctx.moveTo(cx - headR * 1.6 + i * headR * 0.8, h - 6);
    ctx.quadraticCurveTo(cx - headR * 0.6 + i * headR * 0.5, headY + headR * 2.4, cx - headR * 0.2 + i * headR * 0.6, headY + headR * 1.4);
    ctx.stroke();
  }
  // 剑
  ctx.strokeStyle = "rgba(201, 168, 106, 0.22)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(cx + headR * 2.2, h);
  ctx.lineTo(cx + headR * 3.4, headY + headR * 0.4);
  ctx.stroke();

  // 印章
  ctx.strokeStyle = "rgba(168, 74, 66, 0.55)";
  ctx.lineWidth = 1;
  ctx.strokeRect(w - 34, h - 34, 22, 22);
  ctx.fillStyle = "rgba(214, 143, 134, 0.6)";
  ctx.font = `${Math.round(11)}px ${getComputedStyle(document.body).fontFamily}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText((name || "侠").slice(-1), w - 23, h - 22);

  // 纸纹
  for (let i = 0; i < 180; i++) {
    ctx.fillStyle = `rgba(236, 229, 214, ${rng.float(0.01, 0.05)})`;
    ctx.fillRect(rng.float(0, w), rng.float(0, h), 1, 1);
  }
}

function hashKind(kind) {
  let h = 0;
  for (const ch of String(kind)) h = (h * 131 + ch.charCodeAt(0)) >>> 0;
  return h;
}

function hexA(hex, alpha) {
  const value = hex.replace("#", "");
  const r = parseInt(value.slice(0, 2), 16);
  const g = parseInt(value.slice(2, 4), 16);
  const b = parseInt(value.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}
