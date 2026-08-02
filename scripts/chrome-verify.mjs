#!/usr/bin/env node
// chrome-verify — the acceptance proof for the chrome sync, per 总工's three conditions.
//
// Run AFTER `chrome-sync --write`, against git HEAD as the "before":
//   node scripts/chrome-verify.mjs
//
// Why this exists: comparing whole pages is meaningless here — deleting the 14KB FOOTER_LANGS
// script IS a content change, so every page trivially reports "content changed" and the real
// question ("did any chrome content silently regress?") never gets asked. So we compare the
// chrome BLOCK BY BLOCK, subtracting each intentional change first. What must survive:
//
//   ① header : identical once the count spans are neutralised   (parens are intentional)
//   ② footer : identical once BOTH sides' two JS-filled lists are emptied (baking is intentional)
//              + the baked lists must equal the recorded browser oracle (r1-findings.md §4)
//   ③ mobilenav: identical, full stop
//   ④ whitespace: any surviving difference must be INDENTATION only — never inline gaps
import { execSync } from "child_process";
import { baseline, baselineExists, baselineRef } from "./_baseline.mjs";
import fs from "fs";
import path from "path";

const SKIP = new Set([".git", "node_modules", "skin", "static", "data", "scripts", "functions", "admin"]);
function walk(dir, out = []) {
  for (const d of fs.readdirSync(dir, { withFileTypes: true })) {
    if (d.name.startsWith(".") || SKIP.has(d.name)) continue;
    const p = path.join(dir, d.name);
    if (d.isDirectory()) walk(p, out); else if (d.name.endsWith(".html")) out.push(p.replace(/\\/g, "/"));
  }
  return out;
}
const sliceBetween = (s, a, b, inc) => {
  const i = s.indexOf(a); if (i < 0) return null;
  const j = s.indexOf(b, i + a.length); if (j < 0) return null;
  return s.slice(i, inc ? j + b.length : j);
};
const blocks = (h) => ({
  header: sliceBetween(h, '<header class="main-header clearfix">', "</header>", true),
  footer: sliceBetween(h, '<footer class="site-footer">', "</footer>", true),
  mobilenav: sliceBetween(h, '<div class="mobile-nav__wrapper">', '<a href="#" data-target="html" class="scroll-to-target scroll-to-top">', false),
});
const wsNorm = (s) => (s || "").replace(/>\s+</g, "><").replace(/\s+/g, " ").trim();
// neutralise the intentional deltas so what remains is "did anything else move?"
const killCounts = (s) => (s || "").replace(/<span class="nav-dd__n">\(?\d+\)?<\/span>/g, '<span class="nav-dd__n">#</span>');
const emptyLists = (s) => (s || "")
  .replace(/(id="footer-products-list">)[\s\S]*?(<\/ul>)/, "$1$2")
  .replace(/(id="footer-service-list">)[\s\S]*?(<\/ul>)/, "$1$2");
// 跳过导航链接(K1,WCAG 2.4.1)= 有意加进 chrome 的常驻一行,和 switcher 同理:两侧都摘掉。
// 🔴 摘掉 = 这道门【不再看守它】。所以下面 ⑤ 立刻补上对它的正面断言 ——
//    中和一个东西而不接管对它的看守,就是在门上开一个没人知道的洞。
const killSkip = (s) => (s || "").replace(/<a class="w3-skip"[\s\S]*?<\/a>\s*/g, "");
// the switcher is injected/normalised on purpose; compare with it removed
const killSwitcher = (s) => (s || "").replace(/<div class="lang-switch" data-lang-switch>[\s\S]*?<\/div>/g, "");
// inline gap = whitespace BETWEEN two tags on the same "line" of markup, i.e. `> <`
const inlineGaps = (s) => ((s || "").match(/>[ \t]+</g) || []).length;

// stdio pipe: a page absent from HEAD makes git print "fatal: … exists on disk, but not in HEAD"
// to stderr. Harmless to the check, but it lands in the operator's terminal looking like a crash —
// and a line-numbered reader (`sed -n 2p`) then quotes git's panic as if it were the verdict.
// ⚠️ 这里原本读 `git show HEAD:`。我提交之后再跑这道门,HEAD 就是那笔提交本身 ——
//    门拿它跟【它自己】比,于是 81 个带着英文 chrome 的 pt 页拿到了绿灯(exit 0)。
//    「零回归门只在提交之前有意义」这条我记在脑子里,证明记不住。基线归 _baseline.mjs,
//    锁在【分支起点】(与 origin/main 的 merge-base),提交多少次都不动。
const before = (p) => { try { return baseline(p).replace(/\r/g, ""); } catch { return null; } };

const pages = walk(".");
let ok = 0; const fails = [], wsOnlyPages = [], inlineDrift = [], noBaseline = [];
for (const p of pages) {
  // A page absent from HEAD is NEW: there is no "before", so no regression is even definable, and
  // excluding it is right. But it must be NAMED, not dropped. Silently skipping is how a gate
  // prints ✅ over a moving denominator — leaving the reader to notice 248/253 himself in order to
  // learn that 5 pages were never looked at. Whatever this gate did not verify, it says out loud.
  const b = before(p); if (b === null) { noBaseline.push(p); continue; }
  const a = fs.readFileSync(p, "utf8").replace(/\r/g, "");
  const B = blocks(b), A = blocks(a);
  const issues = [];
  // ① header
  if (wsNorm(killSkip(killSwitcher(killCounts(B.header)))) !== wsNorm(killSkip(killSwitcher(killCounts(A.header))))) issues.push("header 内容变了");
  // ② footer (lists emptied on both sides)
  if (wsNorm(emptyLists(B.footer)) !== wsNorm(emptyLists(A.footer))) issues.push("footer 非列表部分内容变了");
  // ③ mobilenav
  if (wsNorm(B.mobilenav) !== wsNorm(A.mobilenav)) issues.push("mobilenav 内容变了");
  // ④ inline gaps must not be added/removed inside the chrome
  for (const k of ["header", "footer", "mobilenav"]) {
    const gb = inlineGaps(k === "footer" ? emptyLists(B[k]) : killSkip(killSwitcher(B[k])));
    const ga = inlineGaps(k === "footer" ? emptyLists(A[k]) : killSkip(killSwitcher(A[k])));
    if (gb !== ga) inlineDrift.push(`${p} ${k}: 行内间距 ${gb} -> ${ga}`);
  }
  if (issues.length) fails.push(`${p}: ${issues.join(" | ")}`);
  else {
    ok++;
    // did anything change at all beyond whitespace, in the chrome?
    const same = ["header", "footer", "mobilenav"].every((k) => B[k] === A[k]);
    if (!same) wsOnlyPages.push(p);
  }
}
// ⑤ 跳过链接与落点的【正面】看守 —— 上面把它从对比里摘掉了,这里必须盯住它本身。
//    判据不是"存在",是"恰好一个、且顺序对":重复注入(每跑一次多一个)正是这类改动的典型故障,
//    而它在"存在与否"的检查下完全隐形。
const a11y = [];
for (const p of pages) {
  const s = fs.readFileSync(p, "utf8");
  if (!s.includes('<header class="main-header clearfix">')) continue;   // 无 chrome 的页(admin 壳)不适用
  const skip = (s.match(/class="w3-skip"/g) || []).length;
  const land = (s.match(/id="main-content"/g) || []).length;
  const order = s.indexOf('class="w3-skip"') < s.indexOf('id="main-content"');
  if (skip !== 1 || land !== 1 || !order) a11y.push(`${p}: 跳过链接 ${skip} 个 · 落点 ${land} 个 · 顺序 ${order ? "对" : "🔴反了"}`);
}
console.log(`chrome-verify  页面 ${pages.length}`);
console.log(`  ⑤ 跳过链接/落点各恰好 1 个且顺序正确:${pages.length - a11y.length} / ${pages.length}  ${a11y.length ? "🔴" : "✅"}`);
if (a11y.length) { console.log("\n🔴 跳过链接或落点异常:"); a11y.slice(0, 12).forEach((x) => console.log("   " + x)); }
// 对账:被检的 + 无基线的 = 总数。让分子分母永远合得上,而不是让读者盯着分母的变化自己推断。
if (noBaseline.length) {
  console.log(`  ⓪ 新页(HEAD 里没有 → 无"之前",不存在回归,不计入分子)${noBaseline.length}:`);
  noBaseline.forEach((p) => console.log("     " + p));
}
const base = pages.length - noBaseline.length;
console.log(`  ① header / ② footer / ③ mobilenav 内容零回归(扣除有意改动后):${ok} / ${base}  ${fails.length ? "🔴" : "✅"}  (${base} 有基线 + ${noBaseline.length} 新页 = ${pages.length})`);
if (fails.length) { console.log("\n🔴 内容回归:"); fails.slice(0, 12).forEach((f) => console.log("   " + f)); }
console.log(`  ④ 行内间距(> <)被增删的块:${inlineDrift.length}  ${inlineDrift.length ? "🔴 必须逐条列给总工" : "✅ 一处都没动"}`);
if (inlineDrift.length) inlineDrift.slice(0, 12).forEach((d) => console.log("   " + d));
console.log(`\n  chrome 字节有变化的页:${wsOnlyPages.length}(内容相同 → 差异只在缩进/有意改动)`);
// ⚠️ a11y 必须进【这一行】。我先前写的是 process.exitCode = 2 —— 它被这句 process.exit()
//    直接覆盖,于是闸打印了 🔴、退出码却是 0:跑闸的循环按退出码计,会把它算成绿。
//    **一道会喊红但不拦人的闸,比没有闸更坏。**(对照组当场抓到)
process.exit(fails.length || inlineDrift.length || a11y.length ? 1 : 0);
