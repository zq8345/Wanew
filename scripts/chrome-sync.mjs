#!/usr/bin/env node
// chrome-sync — THE resident generator: data/chrome.json + data/templates/_chrome.html -> HTML.
//
//   node scripts/chrome-sync.mjs            dry run: report what would change, write nothing
//   node scripts/chrome-sync.mjs --write     apply
//   node scripts/chrome-sync.mjs --only <p>  restrict to paths containing <p> (sampling)
//
// This is the ONLY thing that should ever write chrome into a page.
//   ✅ change nav/footer copy, or add a language -> edit data/chrome.json, run this.
//   ⛔ never hand-edit chrome inside .html — the next run overwrites it.
//   ⛔ scripts/chrome-seed.migration.mjs ran the dataflow BACKWARDS once, to bootstrap. Not a syncer.
//
// #52 批2：注入核心抽到 functions/_lib/chrome.js（makeChrome/applyChrome）——admin-worker 运行时
// regen 的双步第二段 import 同一份（单真源，W1b 铁律）。本脚本保留：walk/报告/WRITE/CRLF 处理。
// 抽取等价闸 = 重构后 dry run 全站「变更 0」（当前产物已同步态下，字节级无损证明）。
import fs from "fs";
import path from "path";
import { localeDirs } from "./locale-dirs.mjs";
import { makeChrome, wsNorm, applyFormNames } from "../functions/_lib/chrome.js";
import { ensureLandmark } from "./main-landmark.mjs";

const WRITE = process.argv.includes("--write");
const ONLY = process.argv.includes("--only") ? process.argv[process.argv.indexOf("--only") + 1] : null;

const catalogRaw = JSON.parse(fs.readFileSync("data/chrome.json", "utf8"));
const locales = JSON.parse(fs.readFileSync("data/locales.json", "utf8"));
const partial = fs.readFileSync("data/templates/_chrome.html", "utf8");
const manifest = JSON.parse(fs.readFileSync("data/products-index.json", "utf8"));
const forms = JSON.parse(fs.readFileSync("data/forms.json", "utf8")).forms;  // 形态单源 → nav 计数 FORM_KEY
// 🔴 品类显示名的真源是 forms.json，不是 chrome.json —— 读入后立刻覆盖 en，否则后台改完名
//    这里读到的仍是旧名，而 nav 被烘进每一页 ⇒ 「跑构建也不变」。见 chrome.js:applyFormNames。
const catalog = applyFormNames(catalogRaw, forms);

const existsCache = new Map();
const pageExists = (rel) => {
  if (!existsCache.has(rel)) existsCache.set(rel, fs.existsSync(rel));
  return existsCache.get(rel);
};

const { applyChrome } = makeChrome({
  catalog, locales, partial, manifest, pageExists, locDir: localeDirs(locales), forms,
});

// ---- page walk ----
const SKIP = new Set([".git", "node_modules", "skin", "static", "data", "scripts", "functions", "admin", "admin-worker"]);
function walk(dir, out = []) {
  for (const d of fs.readdirSync(dir, { withFileTypes: true })) {
    if (d.name.startsWith(".") || SKIP.has(d.name)) continue;
    const p = path.join(dir, d.name);
    if (d.isDirectory()) walk(p, out); else if (d.name.endsWith(".html")) out.push(p.replace(/\\/g, "/"));
  }
  return out;
}

const pages = walk(".").filter((p) => !ONLY || p.includes(ONLY));
let changed = 0, identical = 0, wsOnly = 0; const report = [], errors = [];
for (const p of pages) {
  const raw = fs.readFileSync(p, "utf8");
  const crlf = raw.includes("\r\n");
  const html0 = raw.replace(/\r/g, "");
  const { html: chromed, errors: pageErrors } = applyChrome(html0, p);
  // 落点兜底:regen 只写 682 个 HTML 里的 365 个,其余老页面只有这条路能拿到 <main>。
  // 已有就原样返回(模板已给的那批),所以这里对它们是零操作。
  const html = ensureLandmark(chromed).html;
  errors.push(...pageErrors);

  if (html === html0) { identical++; continue; }
  changed++;
  if (wsNorm(html0) === wsNorm(html)) { wsOnly++; report.push({ p, kind: "ws-only" }); }
  else report.push({ p, kind: "content", d: html.length - html0.length });
  if (WRITE) fs.writeFileSync(p, crlf ? html.replace(/\n/g, "\r\n") : html);
}

// #52 批2：维护全站页面清单（admin-worker 的 pageExists 数据源——Worker 无 fs，applyChrome 的
// 存在性规则靠它。与产物同源同 commit：walk 是清单的唯一真源，人手不维护）。
if (WRITE) {
  const list = pages.slice().sort();
  fs.writeFileSync("data/pages-list.json", JSON.stringify(list) + "\n");

  // W2f-b：sitemap 从同一份清单【派生】（correct-by-construction，与 pages-list 同一咽喉同一 commit）。
  // 旧 sitemap.xml 是手维护纯 en（161 条、0 pt/0 es，产品还带 .html 与 canonical 相左）——废弃重生成。
  // URL 规则 = canonical 规则：index.html→目录斜杠；其余去 .html 扩展（与 render 的 CANONICAL 一致）。
  // lastmod：无真值，整字段省略（不造假时间戳——总工裁定）。
  const EXCLUDE = new Set(["404.html"]);   // 错误页不进 sitemap
  // internal/no-SEO locale(如 zh):渲染但【不进 sitemap】(SEO 红线)。目录从 locales.internal_noindex
  // 派生(单真源),仍保留在上面的 pages-list.json 里(切换器/admin 的 pageExists 需要它)。
  // ⚠️ sitemap 是 walk(".") 扫全 FS 得来的,不读 enabled —— 所以 zh 必须在这里显式过滤,否则会漏进去。
  const INTERNAL_DIRS = (locales.internal_noindex || [])
    .map((loc) => localeDirs(locales)[loc]).filter(Boolean);
  const isInternal = (p) => INTERNAL_DIRS.some((d) => p === `${d}/` || p.startsWith(`${d}/`));
  // 页面级 noindex(如未迁移的空 Guides 主题占位页 guides/{mounts,power,rv-off-grid}/):渲染并留在
  // pages-list(nav/切换器/admin pageExists 需要),但【不进 sitemap】—— noindex + sitemap 是矛盾信号,
  // GSC 会报 "Submitted URL marked 'noindex'"。单真源=页面自己的 robots meta(不维护第二张排除名单)。
  // ⚠️ 必须进 publishable 谓词本身,让 urls 和 expected 走同一判定 —— 否则自检 emitted!=expected 会炸。
  const NOINDEX = new Set(list.filter((p) => {
    try { return /<meta\s+name=["']robots["']\s+content=["'][^"']*noindex/i.test(fs.readFileSync(p, "utf8")); }
    catch { return false; }
  }));
  const publishable = (p) => !EXCLUDE.has(p) && !isInternal(p) && !NOINDEX.has(p);
  const urls = list.filter(publishable).map((p) =>
    "https://wanew.com/" + p.replace(/index\.html$/, "").replace(/\.html$/, ""));
  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n`
    + urls.map((u) => `  <url><loc>${u}</loc></url>`).join("\n") + "\n</urlset>\n";
  fs.writeFileSync("sitemap.xml", xml);
  // 自检（总工点名）：sitemap 条目数必须==清单可发布页数。同源派生下它防的是上面 filter/map 的
  // 静默丢页——不匹配当场炸，绝不带着缺页的 sitemap 出门。
  const emitted = (fs.readFileSync("sitemap.xml", "utf8").match(/<loc>/g) || []).length;
  const expected = list.filter(publishable).length;   // 同一 publishable 谓词 → 防 filter/map 静默丢页
  if (emitted !== expected) { console.error(`🔴 sitemap 自检 FAIL: 条目 ${emitted} != 可发布页 ${expected}`); process.exit(1); }
  console.log(`sitemap.xml 重生成: ${emitted} 条（pages-list ${list.length} − 排除 ${list.length - expected}：404 + internal/${INTERNAL_DIRS.join(",") || "无"} + noindex ${NOINDEX.size}）`);
}

// ── 🔴 pages-list 双向核对(非写模式)────────────────────────────────────────
/* 为什么在【删页之前】就要有这道闸:`data/pages-list.json` 是 admin-worker 里 `pageExists`
   的唯一数据源(Worker 无 fs)。5b 要删 227 个静态页 —— 清单若没同步更新,守卫就会说谎,
   于是 admin 会对已经不存在的路径下 `sha: null` 墓碑。症状是"保存报错",
   **而没有人会想到是几天前删页时漏更新了一份清单。**

   ⚠️ 闸必须建在删之前:**删完再建,基线里已经含着那个错** —— 那时还得先判断
   "这几条不一致是历史遗留还是新 bug"。现在建,基线是 0,不需要判断。

   🔴 它复用上面那个 `walk(".")` 的结果,**不另写一个扫描器**。另写就是复刻,
   而复刻出来的第二份实现会和真源各自漂移 —— 那种闸红不了,只会说谎。
   代价明说:它照的是"清单是不是陈旧",照不出"walk 的规则本身对不对"。

   ⚠️ 双向缺一不可:只查一向漏"清单多出来的"(指向已删页 → admin 下墓碑),
   只查另一向漏"清单缺的"(新页 admin 看不见 → 保存时误判不存在)。 */
let pagesListDrift = 0;
if (!WRITE) {
  if (ONLY) {
    console.log(`\n⏭️  pages-list 双向核对【跳过】:--only ${ONLY} 下 pages 是子集,比了会假红。**跳过是声明出来的,不是静默的。**`);
  } else if (!fs.existsSync("data/pages-list.json")) {
    console.error("\n🔴 pages-list 双向核对:data/pages-list.json 不存在 —— **这是缺席,不是一致。**");
    pagesListDrift = 1;
  } else {
    const fresh = pages.slice().sort();
    const onDisk = JSON.parse(fs.readFileSync("data/pages-list.json", "utf8"));
    const setDisk = new Set(onDisk), setFresh = new Set(fresh);
    const missing = fresh.filter((p) => !setDisk.has(p));   // 磁盘上有、清单里没有
    const extra = onDisk.filter((p) => !setFresh.has(p));   // 清单里有、磁盘上没有
    console.log(`\npages-list 双向核对:磁盘 ${fresh.length} · 清单 ${onDisk.length} · 清单缺 ${missing.length} · 清单多 ${extra.length}`);
    for (const p of missing.slice(0, 6)) console.log(`   ❌ 清单缺(admin 会误判此页不存在):${p}`);
    for (const p of extra.slice(0, 6)) console.log(`   ❌ 清单多(admin 会对已删页下墓碑):${p}`);
    if (missing.length || extra.length) {
      console.error("🔴 pages-list 与磁盘不一致 —— 跑 `node scripts/chrome-sync.mjs --write` 让它跟上,别手改。");
      pagesListDrift = 1;
    }
  }
}

console.log(`chrome-sync [${WRITE ? "WRITE" : "dry"}]  页面 ${pages.length}  |  字节不变 ${identical}  |  变更 ${changed}(其中纯空白 ${wsOnly})`);
if (errors.length) { console.log(`\n🔴 错误 ${errors.length}:`); for (const e of errors.slice(0, 10)) console.log("   " + e); }
const contentChanged = report.filter((r) => r.kind === "content");
console.log(`\n内容有变更的页 ${contentChanged.length}(预期:删 FOOTER_LANGS 14KB + footer 烘焙 + 括号(N))`);
for (const r of contentChanged.slice(0, 6)) console.log(`   ${r.p}  Δ${r.d}`);
if (wsOnly) { console.log(`\n仅空白归一的页 ${wsOnly}:`); for (const r of report.filter((r) => r.kind === "ws-only").slice(0, 8)) console.log("   " + r.p); }
// ⚠️ 合并退出:不在核对处直接 exit —— 那会把下面的 errors/变更报告吞掉,
//    让人只看见一条红而看不到同一次运行里的其它诊断。
if (errors.length || pagesListDrift) process.exit(1);
