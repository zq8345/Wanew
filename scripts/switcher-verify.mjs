#!/usr/bin/env node
// 语言切换器的门。总工点名的三条,全部可计算:
//   ① href 指向【其他每一门】语种   ② hreflang 与目标语种一致   ③ 目标页真的存在
//
// ⭐ 为什么以前没有这道门 —— 这是最贵的一课:
// 切换器 100% 失效,活过了 R2 和 R3 整整三轮,而 chrome-verify 一路 253/253 全绿。
// 因为 chrome-verify 验的是"chrome 内容零回归 = 和 HEAD 一样"。切换器的 href 是【逐页变量】,
// 一个每页都不同的值,没法用"和 HEAD 一样"来验 —— 于是它落在了所有门的射程之外。
//
// 而多语言的 scanner 里有 `if (/lang-switch__link/i.test(tag)) continue;` —— 它写道:
//   「白名单不是『这里不会错』,是『这里我放弃观察』。我把这两件事当成了一件。」
//   「我自己造的盲区,恰好就是 bug 落地的地方。」
// 这句对我同样成立。所以这道门【专门】盯那个所有人都排除掉的地方。
//
// ⭐⭐ 2026-07-20:这道门自己也是【二元】的 —— `const isPt = p.startsWith("pt/")`,
//   然后 `want = isPt ? enPath : "/pt"+enPath`、`wantHl = isPt ? "en" : "pt-BR"`,
//   而且只读切换器里的【第一个】链接。es 一上来,它对着 84 个**输出完全正确**的页报红,
//   要求 es/about/ 指向 `/pt/es/about/` —— 一个根本不存在的路径。
//   ⚠️ **门自己红了,但错的是门。** 这是同一条规则第四次被写死(regen 的 dirOf、renderPage 的
//   canonical、8 个列表页手写 head、这里)。一道会对着正确产物报红的门,最后会被所有人略过 ——
//   那比没有门更糟,因为它还占着"我们有门"这个位置。
//   → 目录名和语种集合一律从 data/locales.json 派生;"对侧"改成"其他每一门语种"。
import fs from "fs";
import { localeDirs } from "./locale-dirs.mjs";

const locales = JSON.parse(fs.readFileSync("data/locales.json", "utf8"));
const DIR = localeDirs(locales);                       // { en:"", "pt-BR":"pt", "es-MX":"es", zh:"zh" }
const ENABLED = locales.enabled;
// 切换器语种集 = enabled ∪ render_extra(内部/no-SEO 语种如 zh 也在菜单里,总工 B 拍板)。
// chrome.js 的切换器用的正是这个集,所以门也用它 —— 否则会对着【输出正确】的 zh 菜单项报红。
const SWITCHER = [...locales.enabled, ...(locales.render_extra || [])];

// 页面路径 -> 它是哪门语种。最长目录前缀命中,谁都不命中就是默认语种。
const localeOf = (p) => {
  let best = locales.default, bestLen = -1;
  for (const [loc, d] of Object.entries(DIR)) {
    if (!d) continue;
    if ((p === d || p.startsWith(`${d}/`)) && d.length > bestLen) { best = loc; bestLen = d.length; }
  }
  return best;
};
// 页面路径 -> 与语种无关的"路由"(/about/ 、/mini/689)
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
  e.name === "node_modules" || e.name === ".git" || e.name === "data" || e.name === "admin" ? [] :
  e.isDirectory() ? walk(`${d}/${e.name}`) : /\.html$/.test(e.name) ? [`${d}/${e.name}`] : []);

// 切换器链接是全站唯一带 lang-switch__link 的 <a> —— 直接全文抓【所有】,不再只看第一个。
const LINK_RE = /<a\s+href="([^"]*)"[^>]*class="lang-switch__link"[^>]*hreflang="([^"]*)"/g;

const fails = [];
let checked = 0, none = 0, stale = 0;
for (const p of walk(".").map((f) => f.replace("./", ""))) {
  const h = fs.readFileSync(p, "utf8");
  if (h.indexOf('<div class="lang-switch"') < 0) { none++; continue; }
  const own = localeOf(p);
  const route = routeOf(p, own);

  // W2d 悬停菜单语义:其他每一门语种【恒】在菜单里 —— 对应页存在→对应页,
  // 不存在→该语种首页兜底(总工规格③)。存在性只决定 href,不再决定条目有无。
  // 当前语种在菜单里是 <span aria-current>(不是 <a>),LINK_RE 天然不匹配 → got 里出现即为 bug。
  const want = new Map();
  for (const loc of SWITCHER) {
    if (loc === own) continue;
    want.set(loc, fs.existsSync(fileFor(route, loc)) ? urlFor(route, loc) : (DIR[loc] ? `/${DIR[loc]}/` : "/"));
  }
  const got = new Map();
  for (const m of h.matchAll(LINK_RE)) got.set(m[2], m[1]);

  const issues = [];
  for (const [loc, href] of want) {
    if (!got.has(loc)) { issues.push(`① 缺少 ${loc} 的链接(应为 ${href})`); continue; }
    if (got.get(loc) !== href) issues.push(`① ${loc}: href=${got.get(loc)} 应为 ${href}(${fs.existsSync(fileFor(route, loc)) ? "对应页" : "缺页→该语种首页兜底"})`);
  }
  for (const [loc] of got) {
    if (loc === own) { issues.push(`② 当前语种出现为链接(该是 aria-current 的 span):hreflang=${loc}`); continue; }
    if (!SWITCHER.includes(loc)) issues.push(`② hreflang=${loc} 不在 enabled∪render_extra 里`);
  }
  checked++;
  if (issues.length) fails.push(`${p}\n     ${issues.join("\n     ")}`);

  // 根因指纹:模板自带的那份【死 chrome】—— 切换器里只有 pt-BR 一条、且恒指向 /pt/products/,
  // 与本页是什么页无关。这只可能来自 data/templates/*.html 的占位 header,
  // 也就是说 regen 跑了、chrome-sync 没跑。用【结构】判而不是判那句硬编码葡语文案:
  // 文案哪天被人改掉,这个探针不该跟着失灵。
  if (got.size === 1 && got.get("pt-BR") === "/pt/products/" && route !== "products") stale++;
}
console.log(`switcher-verify  语种 ${SWITCHER.join(",")}(含 render_extra) | 有切换器的页 ${checked} | 无切换器 ${none}(W2d 后菜单恒在——无切换器=无 chrome 的独立页才合法)`);
console.log(`  ① 其他每一门语种恒在菜单(对应页,缺页→该语种首页兜底) · ② 当前语种非链接且 hreflang 合法:  ${checked - fails.length} / ${checked}  ${fails.length ? "🔴" : "✅"}`);
// 先说根因,再列现象。一个根因摊成几百条抱怨会把人推向错误的排查方向 ——
// 告警的价值不只在于响,还在于指对方向。
if (stale) {
  console.log(`\n━━ 先看这里:${stale} 个页的切换器是【模板占位那份】(只有 pt-BR、恒指向 /pt/products/)。`);
  console.log(`   这不是切换器数据错,是 chrome 没同步 —— regen 只发出模板自带的 chrome,`);
  console.log(`   真 chrome 由 _chrome.html 覆盖上去。下面那一大串多半是同一个根因。`);
  // 爆炸半径比这 N 个页大:regen 有一批模板压根不发 header(等 chrome-sync 注入),
  // 而本闸把「无切换器」当合法(见上面那句)——那些页会静默地连导航都没有,本闸不会为它们报红。
  // 提示如果只说自己看得见的那部分,就等于让人以为损失就这么多。
  console.log(`   ⚠️ 同时还有 ${none} 个页连 header 都没有(本闸视「无切换器」为合法,不会为它们报红;`);
  console.log(`      正常同步后这个数是个位数)。所以真实影响面比上面那 ${stale} 个大。`);
  console.log(`\n   → 先跑:  node scripts/chrome-sync.mjs --write   然后重跑本闸。`);
  console.log(`   跑完仍红的才是真问题。`);
}
if (fails.length) { console.log(`\n🔴 ${fails.length} 个页:`); fails.slice(0, 10).forEach((f) => console.log(`   ${f}`)); }
process.exit(fails.length ? 1 : 0);
