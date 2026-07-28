#!/usr/bin/env node
/**
 * es 泄漏扫描器 —— 西语页面上的英文残留
 *
 * ⭐⭐ 它与 pt-leak-scan 的**唯一结构差异**，来自真语料逼出来的一条规则：
 *
 *     ❌ {power}  Power Supply 1.5 m (4.92 ft)     ← Starlink MX 官方西语页原文
 *     ❌ {cable}  Starlink Cable 15 m (49.2 ft)    ← 同上
 *
 *   Starlink MX 的规则是：**硬件部件名保持英文**。我自编语料时永远写不出这两句
 *   （我会写 `fuente de alimentación`）—— 所以我也永远发现不了这条规则。**换成真语料，它当场红了。**
 *
 *   ⚠️ 而正确的修法【不是把 power/cable 从词表里删掉】：
 *      · `cable` 是西语词       → 删词是对的
 *      · `power` **不是西语词** → 删了它，真的英文残留「power bank」「power supply」就再也报不出来
 *      → **正解 = 多词短语白名单，且必须【先】剥短语再匹配单词。**
 *        顺序反了 `\bcable\b` 会先吃掉 `Starlink Cable` —— **这就是 pt 那个 212→29 的 bug 原样重演**。
 *
 * ⭐ 第二条结构差异（我做这把尺子时才发现的）：
 *   **pt 的自检只测「词表」，不测「扫描器」。** 词表干净 ≠ 扫描器干净 —— 短语剥离、词边界、
 *   白名单全都在词表【之外】。所以本文件把判定导出成 `esLeaksIn()`，
 *   **让 es-marker-selftest 直接喂真尺子**。自检测的必须是真尺子，否则又是在量自己的倒影。
 */

/* ── ① 多词白名单：必须【先】剥，且长的排前 ──────────────────────────────
 *   出处：Starlink MX 官方西语页（审计窗真机渲染）—— 它自己就把这些留成英文。 */
export const WHITELIST_PHRASES = [
  'Starlink Cable',    // 证据：'Starlink Cable 15 m (49.2 ft)'
  'Power Supply',      // 证据：'Power Supply 1.5 m (4.92 ft)'
  'AC Cable',          // 证据：'AC Cable 1.5 m (4.92 ft)'
  'Performance (Gen 1)', 'Performance (Gen 2)', 'Performance (Gen 3)',
  'Standard Circular', 'Standard Actuated',
  'All Rights Reserved',
  /* ⭐ 注册法律实体名 —— 与 locales.json fallback 的 'Wanew Starlink Accessories' 同源。
   *   ⚠️ 必须是【多词短语】而【绝不能】把 'accessories' 塞进单词白名单：
   *      accessories 是我们最核心的英文残留标记词，白名单化 = 全站放过它。
   *      这里剥的是"公司叫这个名字"，不是"这个词可以是英文"。 */
  'Starlink Accessories Limited',
  /* ⭐⭐ 2026-07-19：这份清单曾经【和术语表各管各的】,而那是个真洞。
   *   我在 es-glossary.json 里豁免了 High Performance / Rectangular Satellite / power bank …,
   *   这把尺子却不知道,于是它对着同一批数据报 39 条"英文残留" —— **全是误报**。
   *   一把长期飘红的尺子,最后会被所有人略过 —— 那正是我一路在警告的那种失效。
   *   → **术语表是单一真源,两把尺子都从它读**。以后新增豁免只写一处,两边同时认。 */
  ...(() => {
    // ⚠️ 用 import.meta.url 而不是 HERE —— HERE 在本文件里声明得比这里晚,
    //    直接用会 ReferenceError(我刚踩了一次)。这样也不依赖 cwd。
    const G = JSON.parse(fs.readFileSync(new URL('../data/es-glossary.json', import.meta.url), 'utf8'));
    const borrowed = Object.entries(G.terms)
      .filter(([key, t]) => t.es && key.replace(/\([^)]*\)/g, '').split('/').map((s) => s.trim())
        .some((en) => en.toLowerCase() === String(t.es).toLowerCase()))
      .map(([, t]) => t.es);
    return [...G.untranslated.flatMap((u) => String(u.value).split(' / ').map((v) => v.trim())), ...borrowed].filter(Boolean);
  })(),
  /* ⚠️ 这一条【不属于术语表】,所以留在本地:`may.` 是西语「mayo」的缩写(`15 de may. de 2026`),
   *   和英文标记词 `may` 撞形。它不是术语、也不是"不译的英文",是**日期格式**。 */
  'de may. de',
].sort((a, b) => b.length - a.length); // ⭐ 长的先剥 —— 'Starlink Cable' 必须先于 'Cable'

/* ── ② 单词白名单：品牌 / 型号 / 代码值 ─────────────────────────────────
 *   与 locales.json 的 fallback 同源。**这里放的是「本来就不该是西语」的东西**，
 *   不是「翻不动所以放过」—— 后者属于 GAP，必须红。 */
export const WHITELIST_WORDS = new Set([
  'starlink', 'wanew', 'spacex',              // 品牌
  'mini', 'standard', 'performance', 'enterprise', 'circular', 'actuated', 'gen', 'flat',
  'xml', 'oem', 'odm', 'wifi', 'rv',          // 代码值 / 格式名 / 行业缩写
  'copyright',                                 // 法律套话，国际通用（pt 同）
]);

/* ── ③ 英文标记词：从 pt 的 290 词继承，**逐词过了西语** ───────────────────
 *
 *   ⚠️ 继承 pt 的清单是安全的【方向】—— 它列的是「英文词」，英文词就是英文词。
 *      危险的是它对 es **误报**（英文词恰好也是西语词），而那正是自检要抓的。
 *      **但这【不等于】"拿 pt 推 es"** —— 我删的每一个词都有西语理由，不是"pt 也这么干"。
 *
 *   删除清单（相对 pt 的 290 词），每条一个西语理由：
 *     router / routers  西语借词。证据：Starlink MX「un router wifi integrado」「Incluye Router 3」
 *     cable / cables    西语词（cable/cables 拼写完全相同）
 *     video / videos    西语词。⭐墨西哥【不带重音】(西班牙写 vídeo)——正因如此它与英文同形
 *     simple            西语词（拼写完全相同）
 *     durable           西语词（拼写完全相同）
 *     laptop            墨西哥借词。🔴 但该词已在规范标红：**无墨西哥语料证据**
 *                       （亚马逊 MX 被否 = 它是我们数据的来源本身；Starlink MX 配件 PDF 是英文）
 *                       → 删它是「按我们【假设】它是借词」。**这是一个假设，不是证据。**
 *
 *   ⚠️ **`power` 故意保留** —— 它不是西语词。靠 ① 的短语白名单挡住 'Power Supply'，
 *      从而「power bank」这类真残留仍然会红。删词会把它变成永久盲区。
 *
 *   ⚠️ 已知盲区（如实标，不假装没有）：
 *      · `high` 会打中型号名 `Flat High Performance` —— **pt 那 2 条误报的同一个洞**。
 *        `flat` 已进白名单但 `high` 没有：把 high 白名单化会放过真的 "high speed" 残留。
 *        → 留着，让它误报。**误报会被人看见；漏报不会。**
 *      · 英西同源词是【成体系的】(-al/-ble/-ción/-ar 家族)，这 281 词【穷举不了】。
 *        自检语料只有 49 条 —— 它证明的是"这 49 条不误伤"，**不是"清单干净了"**。
 */
const PT_REMOVED = new Set(['router', 'routers', 'cable', 'cables', 'video', 'videos', 'simple', 'durable', 'laptop']);

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
const HERE = path.dirname(fileURLToPath(import.meta.url));

function loadPtMarkers() {
  const raw = fs.readFileSync(path.join(HERE, 'pt-leak-scan.mjs'), 'utf8');
  const m = raw.match(/const EN_MARKERS = new Set\(\[([\s\S]*?)\]\);/);
  if (!m) throw new Error('pt-leak-scan.mjs 的 EN_MARKERS 抓不到 —— 尺子的来源变了，停下来看，不要猜');
  return [...m[1].matchAll(/'([a-z-]+)'/g)].map((x) => x[1]);
}

// 🔴 版本依赖显式化(多语言窗 2026-07-28 要求):本文件【没有】独立的 SCANNER_VERSION,
//    它的判据完全跟随 pt-leak-scan —— 词表靠上面的正则从那份源码里抓,格式判据靠下面这行 import。
//    **pt 的 SCANNER_VERSION 变了,这个闸的口径就变了**,前后两次的数字同样不可比。
//    此前这个依赖只存在于代码里、没有一句话说明,读的人看不出"改 pt 会动 es"。
import { formatHits } from './pt-leak-scan.mjs';

const PT_MARKERS = loadPtMarkers();
export const EN_MARKERS = new Set(PT_MARKERS.filter((w) => !PT_REMOVED.has(w)));

/* ⚠️ 对账：「凡是"匹配到才算"的检查，都要同时数一遍"总共有几个"」
 *    删除清单里若有一个词【在 pt 里根本不存在】，说明我在删一个想象中的词 —— 必须吼。 */
const ghosts = [...PT_REMOVED].filter((w) => !PT_MARKERS.includes(w));
if (ghosts.length) {
  console.error(`❌ 删除清单里这些词在 pt EN_MARKERS 里【不存在】，我在删想象中的词：${ghosts.join(', ')}`);
  process.exit(1);
}

/* ── ④ 判定 ────────────────────────────────────────────────────────────
 *   ⚠️ 词边界必须含重音字母 **和 ñ** —— 否则 año/diseño 被切断，
 *      señal 切成 "se"+"al"（"al" 恰好是英语词）→ 假阳性从天而降。
 *      这是 pt 那个 "transferência → transfer" bug 的西语版，只是更严重。 */
export const WORD_RE = /[a-zà-ÿñ][a-zà-ÿñ'-]*/gi;

/* ⚠️⚠️ 这里我栽了一次，留档 —— **短语剥离曾经是大小写敏感的**：
 *     原来:  t = t.split(p).join(' ')          // split 是字面量匹配 = 大小写敏感
 *   'Power Supply' 恰好【大小写就是那样】，所以自检全绿，**这个洞完全不可见**。
 *   直到扫我自己的译文，'Wanew Starlink Accessories'（全大写）漏出来才暴露。
 *   ⭐ 教训还是那条：**我只测了能用的那个变体。** 白名单里但凡有一条大小写不同，它就静默失效。
 *
 *   ⚠️ 改成正则后必须【转义】—— 'Performance (Gen 1)' 里的括号在正则里是分组，
 *      不转义的话它会匹配 'Performance Gen 1'（无括号）而漏掉真正带括号的那个，**方向还反了**。 */
const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** 返回 text 里的英文残留词（小写，去重）。**这是唯一的判定真源** —— 自检和扫描共用它。 */
export function esLeaksIn(text) {
  if (!text) return [];
  let t = String(text);
  for (const p of WHITELIST_PHRASES) t = t.replace(new RegExp(escapeRe(p), 'gi'), ' '); // ① 先剥短语（长的已排前）
  const words = t.toLowerCase().match(WORD_RE) || [];
  const hits = words.filter((w) => EN_MARKERS.has(w) && !WHITELIST_WORDS.has(w));
  // ② 格式化短语(多语言窗 2026-07-28 规格):**import 而不是重写一遍** ——
  //    FORMAT_LEAKS 是格式规则、天然语言无关,两个语种不该分叉出两套"Mon–Fri 算不算英文"的逻辑。
  //    ⚠️ 它判的是【剥白名单之前】的原文:格式判据认的是复合结构,先剥短语可能把 Mon–Fri 拆散。
  //    命中带 `fmt:` 前缀,与逐词命中区分 —— 数字要能被拆开看。
  const fmt = formatHits(String(text)).map((n) => `fmt:${n}`);
  return [...new Set([...hits, ...fmt])];
}

/* ── CLI：扫 data/ 里已有的 es-MX 值 ───────────────────────────────────── */
if (process.argv[1] && process.argv[1].endsWith('es-leak-scan.mjs')) {
  const strip = (s) => String(s).replace(/<[^>]+>/g, ' ').replace(/&[a-z]+;/gi, ' ');
  let scanned = 0, dirty = 0;
  const rows = [];

  const catalogs = [['data/chrome.json', 'chrome']];
  for (const f of fs.readdirSync('data/pages').filter((f) => f.endsWith('.json'))) catalogs.push([`data/pages/${f}`, `pages/${f}`]);

  for (const [file, label] of catalogs) {
    const j = JSON.parse(fs.readFileSync(file, 'utf8'));
    for (const [k, v] of Object.entries(j)) {
      if (k.startsWith('_') || !v || typeof v !== 'object') continue;
      const es = v['es-MX'];
      if (es === undefined) continue;
      scanned++;
      const hits = esLeaksIn(strip(es));
      if (hits.length) { dirty++; rows.push([`${label}:${k}`, hits, String(es).slice(0, 58)]); }
    }
  }
  for (const f of fs.readdirSync('data/products').filter((f) => f.endsWith('.json'))) {
    const j = JSON.parse(fs.readFileSync(`data/products/${f}`, 'utf8'));
    const es = (j.i18n || {})['es-MX'];
    if (!es) continue;
    for (const [k, v] of Object.entries(es)) {
      scanned++;
      const hits = esLeaksIn(strip(v));
      if (hits.length) { dirty++; rows.push([`products/${f}:${k}`, hits, String(v).slice(0, 58)]); }
    }
  }

  console.log(`\n【es 泄漏扫描】标记词 ${EN_MARKERS.size} 个（pt 290 − ${PT_REMOVED.size} 个西语词）`);
  console.log(`扫了 ${scanned} 个 es-MX 值，${dirty} 个有英文残留\n`);
  for (const [where, hits, sample] of rows) console.log(`  ❌ {${hits.join(',')}}  ${where}\n       ${sample}`);
  console.log(dirty === 0 ? '\n✅ 没有英文残留。' : `\n⚠️ ${dirty} 处 —— 逐条看，误报也要留痕（别改尺子去迁就译文）。`);
}
