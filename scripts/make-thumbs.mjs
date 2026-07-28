#!/usr/bin/env node
/**
 * make-thumbs — 为 `/static/` 下的产品卡片图生成缩略图。
 *
 * 规格(与 Admin 那半【逐条相同】,总工 2026-07-28 统一):
 *   长边 960 · webp · 命名 `<base>.thumb.webp` · **新增不替换** · **原图一个字节不动**
 *
 * 🔴 长边为什么是 960:Admin 实测卡片最大渲染宽 **460px @ 视口 530**,×2 取整。
 *    **那个最大值不在任何极值端** —— 只测 375 和 1920 会得出 688,而让 530 档的用户拿到糊图。
 *    **"取两端"不等于"取最大"**,单峰假设在响应式布局上不成立。
 *
 * ⚠️ 这半只做 `/static/`(在本仓,regen 能直接查磁盘存在性),**不写清单** ——
 *    清单只为 R2 那 28 张存在(regen 查不到 R2 的存在性)。别把不需要的东西也塞进去。
 *
 * 用法:
 *   node scripts/make-thumbs.mjs --limit 5   # 先试跑 5 张
 *   node scripts/make-thumbs.mjs             # 全量
 *   node scripts/make-thumbs.mjs --check     # 只报告,不写
 */
import fs from "fs";
import path from "path";
import crypto from "crypto";
import { createRequire } from "module";

const require = createRequire(import.meta.url);
// sharp 装在 admin-worker 的 node_modules 里 —— 本仓不是 npm 项目,不为一个构建期脚本引入一套依赖树。
const sharp = require("../admin-worker/node_modules/sharp");

const LONG_EDGE = 960;
const CHECK = process.argv.includes("--check");
const LIM_IX = process.argv.indexOf("--limit");
const LIMIT = LIM_IX >= 0 ? Number(process.argv[LIM_IX + 1]) : Infinity;

const manifest = JSON.parse(fs.readFileSync("data/products-index.json", "utf8"));
const targets = [...new Set(manifest.map((p) => p.thumb).filter((t) => t && t.startsWith("/static/")))];

const sha = (f) => crypto.createHash("sha256").update(fs.readFileSync(f)).digest("hex");
const thumbOf = (rel) => rel.replace(/\.[^.]+$/, ".thumb.webp");

console.log(`目标 ${targets.length} 张(去重后),长边 ${LONG_EDGE}`);
if (CHECK) {
  let has = 0, miss = 0;
  for (const t of targets) (fs.existsSync("." + thumbOf(t)) ? has++ : miss++);
  console.log(`  已有缩略图 ${has} · 缺 ${miss}`);
  process.exit(0);
}

let made = 0, skipped = 0, origBefore = 0, thumbBytes = 0;
const drift = [];

for (const rel of targets.slice(0, LIMIT)) {
  const src = "." + rel, dst = "." + thumbOf(rel);
  if (!fs.existsSync(src)) { console.error(`  ⚠️ 原图不存在,跳过: ${rel}`); continue; }
  const before = sha(src), beforeSize = fs.statSync(src).size;
  origBefore += beforeSize;

  if (fs.existsSync(dst)) { skipped++; thumbBytes += fs.statSync(dst).size; continue; }   // 新增不替换

  const meta = await sharp(src).metadata();
  const long = Math.max(meta.width, meta.height);
  // 比 960 还小的图不放大 —— 放大只会变大文件、不会变清楚
  const buf = long > LONG_EDGE
    ? await sharp(src).resize({ width: meta.width >= meta.height ? LONG_EDGE : null,
                                height: meta.height > meta.width ? LONG_EDGE : null,
                                withoutEnlargement: true }).webp({ quality: 82 }).toBuffer()
    : await sharp(src).webp({ quality: 82 }).toBuffer();
  fs.writeFileSync(dst, buf);
  made++; thumbBytes += buf.length;

  // 🔴 每张都当场核原图 sha —— **"我没打算改它"不是证据**。
  if (sha(src) !== before) drift.push(rel);
}

console.log(`  新建 ${made} · 已存在跳过 ${skipped}`);
console.log(`  原图合计 ${(origBefore / 1048576).toFixed(2)} MB → 缩略图合计 ${(thumbBytes / 1048576).toFixed(2)} MB` +
  `(省 ${origBefore ? (100 - thumbBytes / origBefore * 100).toFixed(0) : 0}%)`);

if (drift.length) {
  console.error(`\n❌ ${drift.length} 张【原图被改动了】,这不该发生:\n   ${drift.join("\n   ")}`);
  process.exit(1);
}
console.log(`  ✅ 原图 sha256 逐张核对,${targets.slice(0, LIMIT).length} 张全部未变`);
