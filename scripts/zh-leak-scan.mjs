#!/usr/bin/env node
/**
 * zh-leak-scan — 扫 zh/**\/*.html 可见文本里残留的英文。
 *
 * ⚠️ 它和 es/pt 那两个不是同一种东西,别照抄它们的做法:
 *   es/pt 与英语同属拉丁字母,同形词多(`Cables` 在两种语言里逐字相同),所以那两个扫描器
 *   必须靠一张【英文专属标记词】考卷来判定,而考卷本身会漏、会误判(es 同形词那次)。
 *   **中文与英文字符集不同** —— 一段中文里夹着连续英文单词是【看得见】的,不需要猜。
 *   所以这里的判据是结构性的:去掉白名单后,可见文本里还剩下连续英文词 = 泄漏。
 *   代价是白名单要准(型号/规格/品牌本来就该是英文),收益是**没有考卷,也就没有考卷的盲区**。
 *
 * 扫:标签之间的文字节点 + 可见属性(placeholder / alt / title / aria-label)
 * 不扫:<script>/<style>/注释/class/href/src/id/data-*
 *
 * 用法: node scripts/zh-leak-scan.mjs [--json] [--max N] [--write-baseline]
 * 退出: 0 = 未超基线; 1 = 超了基线或基线缺失
 */
import fs from "fs";
import path from "path";

// ⚠️ 白名单是「考卷」的残余部分,改它必须 bump 版本 —— 否则前后两次的数字不可比,
//    等于自己出题自己打分。基线文件里记了版本,对不上直接红。
export const SCANNER_VERSION = "1.1.0";   // 1.1.0:白名单收入认证名(FCC/RoHS/ETL/REACH/ISO)

const ROOT = process.cwd();
const ZH_DIR = path.join(ROOT, "zh");
const AS_JSON = process.argv.includes("--json");
const WRITE_BASE = process.argv.includes("--write-baseline");
const MAX_IX = process.argv.indexOf("--max");
const MAX = MAX_IX >= 0 ? Number(process.argv[MAX_IX + 1]) : Infinity;
const BASE_FILE = path.join(ROOT, "scripts", "zh-leak-baseline.json");

/* ── 合法保持英文的:品牌 / 型号 / 规格 token / 单位 ──────────────────────
   ⚠️ 这张表只该装【本来就不翻译】的东西。任何"这句还没翻所以先放进来"的条目
      都是把债务写成许可 —— 那种要进基线的数字里,不是进这张表。 */
const KEEP = [
  // 🔴 顺序是判据的一部分:【长的、含结构的必须排在前面】。
  //    我第一版把品牌单词放在最前,于是 `/\bWanew\b/` 先把 hello@wanew.com 里的 wanew 抹掉,
  //    邮箱正则再也匹配不上,剩下 `hello` 与 `com` 两个词 —— 一条纯中文 + 邮箱的负样本被误报。
  //    ⚠️ pt-leak-scan 的注释里**写着这个坑**("多词条目必须排在单词之前"),我读过还是踩了。
  //    **知道一条规则和在自己的代码里遵守它,是两件事。**
  // 邮箱 / 域名 / URL(整体优先)
  /[\w.+-]+@[\w.-]+\.\w+/g, /\b(?:https?:\/\/)?[\w-]+\.(?:com|net|org|cn)\b/gi,
  // 规格 token:数字紧贴单位/接口名,天然是英文
  /\b\d+(?:\.\d+)?\s*(?:AWG|V|A|W|Wh|mAh|mm|cm|m|kg|g|in|ft|GHz|MHz|Mbps|Gbps|dBi|°C|℃)\b/gi,
  // 机型 / 产品线(多词在前,与 pt/es 扫描器同一批,保持三家口径一致)
  /\bStandard\s+Actuated\b/gi, /\bStandard\s+Circular\b/gi, /\bFlat\s+High[-\s]Performance\b/gi,
  /\bHigh[-\s]Performance\b/gi, /\bPerformance\s*\(?\s*Gen\s*\d\s*\)?/gi, /\bGen\s*\d\b/gi,
  // 单词条目在最后
  /\bWanew\b/gi, /\bStarlink\b/gi, /\bSpaceX\b/gi, /\bWhatsApp\b/gi, /\bWeChat\b/gi,
  /\bOEM\b/gi, /\bODM\b/gi, /\bMOQ\b/gi, /\bFAQ\b/gi, /\bIP\d{2}\b/gi,
  // 认证名:FCC / CE / RoHS 等是【机构与法规的专名】,任何语言的页面上都写原文 —— 不是漏翻。
  // ⚠️ 收进白名单前先确认它确实"本来就不该翻",而不是"我不想让它报红"。
  /\bFCC\b/gi, /\bRoHS\b/gi, /\bETL\b/gi, /\bREACH\b/g, /\bISO\s*\d+\b/gi,
  /\bMini\b/gi, /\bEnterprise\b/gi, /\bStandard\b/gi,
  /\bRJ\s?45\b/gi, /\bSPX\b/gi, /\bUSB(?:-[A-C])?\b/gi, /\bDC\b/gi, /\bAC\b/gi,
  /\bPoE\b/gi, /\bWi-?Fi\b/gi, /\bLED\b/gi, /\bABS\b/gi, /\bPC\b/gi, /\bTPU\b/gi,
];

const files = [];
(function walk(d) {
  if (!fs.existsSync(d)) return;
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name);
    if (e.isDirectory()) walk(p);
    else if (e.name.endsWith(".html")) files.push(p);
  }
})(ZH_DIR);

// 可见文本:先摘掉 script/style/注释,再取文字节点与可见属性
const VISIBLE_ATTRS = ["placeholder", "alt", "title", "aria-label"];
function visibleChunks(html) {
  const out = [];
  const stripped = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ");
  for (const a of VISIBLE_ATTRS)
    for (const m of stripped.matchAll(new RegExp(`\\b${a}="([^"]*)"`, "gi")))
      out.push({ where: `[${a}]`, text: m[1] });
  for (const m of stripped.matchAll(/>([^<>]+)</g)) out.push({ where: "[text]", text: m[1] });
  return out;
}

const decode = (s) => s.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
  .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, " ");

const leaks = [];
for (const f of files) {
  const rel = path.relative(ROOT, f).replace(/\\/g, "/");
  const html = fs.readFileSync(f, "utf8");
  for (const { where, text } of visibleChunks(html)) {
    let t = decode(text).trim();
    if (!t) continue;
    for (const re of KEEP) t = t.replace(re, " ");
    // 剩下的连续英文词(≥3 字母,避免把单个字母/罗马数字算进来)
    const words = t.match(/\b[A-Za-z][A-Za-z'-]{2,}\b/g) || [];
    // 判据:**≥2 个**英文词才算泄漏 —— 单个残留词多半是没收进白名单的型号/规格,
    // 而连着两个词几乎必然是一句没翻的话。宁可漏报一个词,不要用误报去换。
    if (words.length >= 2)
      leaks.push({ file: rel, where, words: [...new Set(words)].slice(0, 6), sample: decode(text).trim().slice(0, 80) });
  }
}

const byFile = {};
for (const l of leaks) byFile[l.file] = (byFile[l.file] || 0) + 1;

if (AS_JSON) { console.log(JSON.stringify({ version: SCANNER_VERSION, total: leaks.length, byFile, leaks: leaks.slice(0, MAX) }, null, 2)); }
else {
  console.log(`\n【zh-leak-scan v${SCANNER_VERSION}】扫 ${files.length} 个 zh 页`);
  for (const l of leaks.slice(0, Number.isFinite(MAX) ? MAX : 12))
    console.log(`  ${l.file} ${l.where} {${l.words.join(",")}}  ${l.sample}`);
  if (leaks.length > 12 && !Number.isFinite(MAX)) console.log(`  … 其余 ${leaks.length - 12} 条(--max N 看更多,--json 看全部)`);
  console.log(`\n泄漏总数: ${leaks.length} / 涉及 ${Object.keys(byFile).length} 个文件`);
}

// ── 基线棘轮:只准降,不准升 ────────────────────────────────────────────
if (WRITE_BASE) {
  fs.writeFileSync(BASE_FILE, JSON.stringify({ version: SCANNER_VERSION, total: leaks.length, byFile }, null, 2) + "\n");
  console.log(`\n✅ 基线已写入 ${path.relative(ROOT, BASE_FILE)}(total ${leaks.length})`);
  process.exit(0);
}
if (!fs.existsSync(BASE_FILE)) {
  console.error("\n❌ 缺基线文件。先跑 `node scripts/zh-leak-scan.mjs --write-baseline` 冻结当前水位。");
  console.error("   ⚠️ 没有冻结的基线,这个数字就只是个观感 —— 明天涨了也没人知道。");
  process.exit(1);
}
const base = JSON.parse(fs.readFileSync(BASE_FILE, "utf8"));
if (base.version !== SCANNER_VERSION) {
  console.error(`\n❌ 扫描器版本 ${SCANNER_VERSION} ≠ 基线版本 ${base.version} —— 口径变了,前后两个数不可比。`);
  console.error("   改了白名单就必须重签基线,并在报告里说明改了什么。**自己出题又自己打分,必须留痕。**");
  process.exit(1);
}
console.log(`基线 ${base.total} → 当前 ${leaks.length}`);
if (leaks.length > base.total) {
  console.error(`\n❌ 比基线多了 ${leaks.length - base.total} 条 —— zh 的英文残留在【增加】。`);
  process.exit(1);
}
if (leaks.length < base.total) console.log(`  ✅ 比基线少 ${base.total - leaks.length} 条;修完记得 --write-baseline 把水位钉下来`);
else console.log("  ✅ 与基线持平");
