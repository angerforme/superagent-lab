// 确定性随机：同一个种子与世界状态永远得到同一结果。
// 这样「每次开局都是新的人生」与「可复现的存档」可以同时成立。

export function hashString(str) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function next() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export class Rng {
  constructor(seed) {
    this.seed = seed >>> 0;
    this.next = mulberry32(this.seed);
  }

  static from(...parts) {
    return new Rng(hashString(parts.join("|")));
  }

  float(min = 0, max = 1) {
    return min + this.next() * (max - min);
  }

  int(min, max) {
    return Math.floor(this.float(min, max + 1));
  }

  chance(p) {
    return this.next() < p;
  }

  pick(list) {
    if (!list || list.length === 0) return null;
    return list[Math.floor(this.next() * list.length)];
  }

  pickMany(list, count) {
    const pool = [...list];
    const out = [];
    while (pool.length && out.length < count) {
      out.push(pool.splice(Math.floor(this.next() * pool.length), 1)[0]);
    }
    return out;
  }

  shuffle(list) {
    const arr = [...list];
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(this.next() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  weighted(entries) {
    // entries: [{weight, ...}]
    const total = entries.reduce((sum, e) => sum + Math.max(0, e.weight || 0), 0);
    if (total <= 0) return entries[0] ?? null;
    let roll = this.next() * total;
    for (const entry of entries) {
      roll -= Math.max(0, entry.weight || 0);
      if (roll <= 0) return entry;
    }
    return entries[entries.length - 1];
  }
}

export const clamp = (v, min, max) => Math.max(min, Math.min(max, v));
