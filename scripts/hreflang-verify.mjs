#!/usr/bin/env node
// W2e: 全站 hreflang 核对器。起因:/es/ 首页缺 es-MX 自指 —— home.html 独立模板把 hreflang
// 写死在 head(en/pt/x-default 化石),不走 renderPage 的派生路径。switcher-verify 的教训原话:
// 「同一条规则第 N 次被写死」—— 这道门保证任何页的 hreflang 簇再也不能悄悄烂掉。
//
// 规则(全部从 data/locales.json 派生,不点名任何语言):
//   ① 簇内不得有重复的 hreflang 键
//   ② 键 ∈ enabled ∪ {x-default}
//   ③ 有簇的页必须含【自指】(自己语种的 alternate,href=自己的 URL)
//   ④ 簇内每条 href 必须=该语种的派生 URL,且目标文件真实存在
//   ⑤ 完整性:每一门「对应页存在」的 enabled 语种都必须在簇里(缺=漏挂,hreflang 互指,漏一边等于没挂)
//   ⑥ x-default 必须指默认语种 URL
// 无簇的页只计数不判红。2026-07-26 起 en 产品页(详情+列表)已补发互惠簇(render.js render 去掉
// locale!=="en" + regen.mjs localizeSeoListHead);现在的「无簇」= EN-only 内容页(未迁移的旧 hub 指南
// 文章 industrial/mounts/power/rv-off-grid/video/* + admin/非路由页)—— 没有本地化孪生,本就无簇可发。
import fs from "fs";
import { localeDirs } from "./locale-dirs.mjs";

const locales = JSON.parse(fs.readFileSync("data/locales.json", "utf8"));
const DIR = localeDirs(locales);
const ENABLED = locales.enabled;
const ORIGIN = "https://wanew.com";

const localeOf = (p) => {
  let best = locales.default, bestLen = -1;
  for (const [loc, d] of Object.entries(DIR)) {
    if (!d) continue;
    if ((p === d || p.startsWith(`${d}/`)) && d.length > bestLen) { best = loc; bestLen = d.length; }
  }
  return best;
};
const routeOf = (p, loc) => {
  const d = DIR[loc];
  const bare = d ? p.slice(d.length + 1) : p;
  return `/${bare}`.replace(/index\.html$/, "").replace(/\.html$/, "");
};
const urlFor = (route, loc) => (DIR[loc] ? `/${DIR[loc]}${route}` : route);
const fileFor = (route, loc) => {
  const u = urlFor(route, loc);
  return u.endsWith("/") ? `${u.slice(1)}index.html` : `${u.slice(1)}.html`;
};

const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) =>
  e.name === "node_modules" || e.name === ".git" || e.name === "data" || e.name === "admin"
    || e.name === "admin-worker" || e.name === ".wrangler" ? [] :
  e.isDirectory() ? walk(`${d}/${e.name}`) : /\.html$/.test(e.name) ? [`${d}/${e.name}`] : []);

const LINK_RE = /<link\s+rel="alternate"\s+hreflang="([^"]*)"\s+href="([^"]*)"\s*\/?>/g;

const fails = [];
let withCluster = 0, noCluster = 0;
for (const p of walk(".").map((f) => f.replace("./", ""))) {
  const h = fs.readFileSync(p, "utf8");
  const got = [...h.matchAll(LINK_RE)].map((m) => [m[1], m[2]]);
  if (!got.length) { noCluster++; continue; }
  withCluster++;
  const own = localeOf(p);
  const route = routeOf(p, own);
  const issues = [];

  const seen = new Set();
  for (const [hl] of got) {
    if (seen.has(hl)) issues.push(`① hreflang=${hl} 重复`);
    seen.add(hl);
    if (hl !== "x-default" && !ENABLED.includes(hl)) issues.push(`② hreflang=${hl} 不在 enabled 里`);
  }
  if (!seen.has(own)) issues.push(`③ 缺自指(${own})`);
  for (const [hl, href] of got) {
    if (hl === "x-default") {
      const enUrl = `${ORIGIN}${route}`;
      if (href !== enUrl) issues.push(`⑥ x-default=${href} 应为 ${enUrl}`);
      continue;
    }
    const want = `${ORIGIN}${urlFor(route, hl)}`;
    if (href !== want) issues.push(`④ ${hl}: href=${href} 应为 ${want}`);
    else if (!fs.existsSync(fileFor(route, hl))) issues.push(`④ ${hl}: 目标页不存在 ${fileFor(route, hl)}(声明了一个 404)`);
  }
  for (const loc of ENABLED) {
    if (!seen.has(loc) && fs.existsSync(fileFor(route, loc))) issues.push(`⑤ 缺 ${loc}(对应页存在却没挂 —— 漏一边等于没挂)`);
  }
  if (!seen.has("x-default")) issues.push(`⑥ 缺 x-default`);
  if (issues.length) fails.push(`${p}\n     ${issues.join("\n     ")}`);
}
console.log(`hreflang-verify  语种 ${ENABLED.join(",")} | 有簇 ${withCluster} | 无簇 ${noCluster}(EN-only 内容页:未迁移旧 hub 指南文章 + 非路由页;无本地化孪生→无簇,只计数)`);
console.log(`  ①无重复 ②键合法 ③自指 ④href=派生且目标存在 ⑤存在即必挂 ⑥x-default:  ${withCluster - fails.length} / ${withCluster}  ${fails.length ? "🔴" : "✅"}`);
if (fails.length) { console.log(`\n🔴 ${fails.length} 个页:`); fails.slice(0, 12).forEach((f) => console.log(`   ${f}`)); }
process.exit(fails.length ? 1 : 0);
