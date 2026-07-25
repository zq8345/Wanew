// Local regeneration runner: git-JSON + template -> product detail pages + admin manifest.
// Run: node scripts/regen.mjs [id ...]   (no args = all)
// Reuses functions/_lib/render.js — the SAME render the CF Pages Function uses at publish.
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { render, genRelated, resolveImg, regenListPage, setListTitle, setListLabels, renderHome, renderPage, excerptOf, catmapOf } from "../functions/_lib/render.js";
import { localeDirs } from "./locale-dirs.mjs";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const cfg = JSON.parse(fs.readFileSync(path.join(REPO, "data", "site.json"), "utf8"));
const tpl = fs.readFileSync(path.join(REPO, "data", "templates", "product.html"), "utf8");

const prods = {};
const pdir = path.join(REPO, "data", "products");
for (const f of fs.readdirSync(pdir)) {
  if (!f.endsWith(".json")) continue;
  const d = JSON.parse(fs.readFileSync(path.join(pdir, f), "utf8"));
  prods[d.id] = d;
}

const locales = JSON.parse(fs.readFileSync(path.join(REPO, "data", "locales.json"), "utf8"));
const catalog = JSON.parse(fs.readFileSync(path.join(REPO, "data", "chrome.json"), "utf8"));
// #52 批1：类目唯一真源 = data/categories.json（原 render.js CATMAP + 本文件 CATS 双硬编码迁入）
const categoriesJson = JSON.parse(fs.readFileSync(path.join(REPO, "data", "categories.json"), "utf8"));
const CATMAP_DATA = catmapOf(categoriesJson);
const MODEL = locales.model_display;
const LOCALES = locales.enabled;                               // SEO 语种:驱产品详情页 + manifest + hreflang
const RENDER_EXTRA = locales.render_extra || [];               // 内部/no-SEO 语种(zh):只驱 chrome+信息/列表/首页
const RENDER_SET = [...LOCALES, ...RENDER_EXTRA];              // 渲染集
const INTERNAL = locales.internal_noindex || [];              // 强制 noindex 的内部语种
const isExtra = (loc) => RENDER_EXTRA.includes(loc);
const DEFAULT = locales.default;
const LOC_DIR = localeDirs(locales);                           // pt-BR -> pt / es-MX -> es(唯一真源)
const dirOf = (loc) => LOC_DIR[loc] ?? "";
const pageOf = (loc, rel) => path.join(REPO, dirOf(loc), rel);
// Same rule chrome-sync uses: prefix IF the localized page exists. Existence is the rule; there
// is no list to keep in sync, so it cannot go stale (r1-report.md §5).
const urlOf = (p, loc) => {
  const d = dirOf(loc);
  if (!d) return p;
  const file = p.endsWith("/") ? `${d}${p}index.html` : `${d}${p}.html`;
  return fs.existsSync(path.join(REPO, file)) ? `/${d}${p}` : p;
};

// Manifest entries drive related-generation, the admin list, AND list-page regen. They stay
// self-sufficient on purpose — publish-time regen reads only this, not all 64 product JSONs — so
// the localized title/excerpt has to live here too, or the admin Function would need 64 file
// reads to render one pt list page. title/excerpt stay English so the admin UI is untouched.
const entries = Object.values(prods).map((p) => {
  const e = { id: p.id, category: p.category, form: p.form, title: p.i18n.en.title,
    thumb: p.images[0] ? resolveImg(p.images[0], cfg.img_base) : "", excerpt: excerptOf(p) };
  for (const loc of LOCALES) {
    if (loc === DEFAULT) continue;
    const t = p.i18n[loc] && p.i18n[loc].title;
    const x = excerptOf(p, loc);                                // derived, never stored by hand
    if (t || x !== e.excerpt) (e.i18n ??= {})[loc] = { ...(t ? { title: t } : {}), ...(x ? { excerpt: x } : {}) };
  }
  return e;
});

const only = process.argv.slice(2).map(Number);
const targets = only.length ? only : Object.keys(prods).map(Number);

let written = 0, imbalanced = 0;
for (const id of targets) {
  const prod = prods[id];
  if (!prod) { console.error("missing product", id); continue; }
  const entry = entries.find((e) => e.id === id);
  for (const locale of LOCALES) {
    const out = pageOf(locale, path.join(prod.category, `${id}.html`));
    // Only emit a locale's page where one already exists — regen renders content, it does not
    // decide the site map. Creating pt pages that nothing links to is a different decision.
    if (locale !== DEFAULT && !fs.existsSync(out)) continue;
    const related = genRelated(entry, entries, locale, catalog, urlOf);
    const html = render(prod, { template: tpl, imgBase: cfg.img_base, related, locale, modelDisplay: MODEL, catalog, urlOf, enabled: LOCALES, catmap: CATMAP_DATA });
    const opens = (html.match(/<div\b/g) || []).length;
    const closes = (html.match(/<\/div>/g) || []).length;
    if (opens !== closes) { imbalanced++; console.error(`  ⚠️ div imbalance ${locale} ${prod.category}/${id}: ${opens}/${closes}`); }
    fs.mkdirSync(path.dirname(out), { recursive: true });
    fs.writeFileSync(out, html);
    written++;
  }
}
console.log(`regen: wrote ${written} pages (${LOCALES.join("+")}) | div-imbalanced ${imbalanced}`);
// ⚠️ regen emits the TEMPLATE's chrome, which is the pre-R1 English one. The chrome lives in
// data/chrome.json now, so `node scripts/chrome-sync.mjs --write` MUST run after this or every
// regenerated page silently reverts R1. Content and chrome are separate layers, in that order.
console.log(`⚠️  next: node scripts/chrome-sync.mjs --write   (regen emits the template's chrome; R1's lives in the catalog)`);

const manifest = entries.sort((a, b) => a.category.localeCompare(b.category) || a.id - b.id);
fs.writeFileSync(path.join(REPO, "data", "products-index.json"), JSON.stringify(manifest, null, 2));
console.log(`manifest: data/products-index.json (${manifest.length} products, with thumb)`);

// Regenerate list pages (card grid + chip counts) from the manifest — so a new/edited
// product shows up on /products/ and its category page. /for/X hubs stay hand-curated.
// #52 批1：CATS 硬编码 → 从 data/categories.json 派生（顺序=json 顺序=页面顺序）
const CATS = categoriesJson.categories.map((c) => c.slug);
// Performance (Gen 2) has 0 products of its own. Joe wants the 8th homepage tile back, so the tile
// must land somewhere real: this page aggregates the Performance family instead of being an empty
// shell. Not a hardcoded product list — a category predicate, so it tracks the data forever.
const AGGREGATES = [["performance-gen-2/index.html", ["performance-gen-1", "performance-gen-3"]]];
// The other axis: a category page fixes the model and chips by form; a /type/ page is its mirror.
// Slugs live under /type/ because `mounts/` and `power/` are already guide hubs. The form strings
// must match FORM_KEY in render.js — that is the slug's source of truth, these just name it.
const TYPES = [["cables", "Cables"], ["mounts", "Mounts & Brackets"], ["power", "Power & Charging"],
  ["networking", "Networking"], ["cases", "Cases & Protection"]];
// One table: [page, which products it scopes, what its <title> is named after]. Every list page
// goes through it — no page gets to be the exception that keeps a hand-written title.
// 第 4 格 = banner 用哪个机型名派生标题(setListLabels)。只有机型页有:
//   /products/ 的 banner 是 chrome 的 body.banner.title(普通名词,已经有主);
//   /type/X 的 banner 是另一个模式("Starlink {形态}",没有 Accessories),不套这个模式。
// 写成显式的一格,不是从 name 反推 —— 反推要靠"哪些 name 恰好是机型名",那是个会漂的猜测。
const LIST_PAGES = [
  ["products/index.html", null, { t: "body.banner.title" }],       // common noun -> catalog
  ...CATS.map((c) => [`${c}/index.html`, c, MODEL[c], MODEL[c]]),   // model names are brand terms
  ...AGGREGATES.map(([rel, cat]) => [rel, cat, MODEL["performance-gen-2"], MODEL["performance-gen-2"]]),
  ...TYPES.map(([s, f]) => [`type/${s}/index.html`, { form: f }, f.replace(/&/g, "&amp;")]),
];
// 列表页的 banner/筛选栏标签 catalog(data/pages/list.json)—— 和 shared 一样并进来
const listCat = JSON.parse(fs.readFileSync(path.join(REPO, "data", "pages", "list.json"), "utf8"));

// 内部语种(zh)的 list 页是从默认语种页 copy 来的 —— regenListPage/setList* 只改 body/banner/title,
// 【不碰 <head>】。所以 copy 带来的是默认语种的 head(canonical/hreflang/lang、且无 noindex)。必须把 head
// 本地化成内部 locale 的规则,和 renderPage 对信息页做的一致:lang=该语种、canonical 自指 /dir/route/、
// 【零 hreflang】(内部 no-SEO)、加 noindex —— 否则 zh list 页会向 Google 声明成 en 页副本且可索引(SEO 红线)。
// 幂等:重复跑结果不变。只对 render_extra 语种调用。
function localizeInternalHead(html, rel, locale) {
  const dir = dirOf(locale);
  const route = "/" + rel.replace(/index\.html$/, "").replace(/\.html$/, "");   // "/standard-actuated/" | "/products/"
  html = html.replace(/(<html lang=")[^"]*(")/, `$1${locale}$2`);
  html = html.replace(/(<link rel="canonical" href=")[^"]*(")/, `$1https://wanew.com/${dir}${route}$2`);
  html = html.replace(/\s*<!-- hreflang alternates[^>]*-->/g, "");
  html = html.replace(/\s*<link rel="alternate" hreflang="[^"]*" href="[^"]*"\s*\/?>/g, "");
  if (!/name="robots"\s+content="noindex/.test(html))
    html = html.replace(/(<link rel="canonical"[^>]*>)/, `$1\n<meta name="robots" content="noindex, follow" />`);
  return html;
}

let lists = 0;
for (const [rel, cat, name, bannerModel] of LIST_PAGES) {
 for (const locale of RENDER_SET) {
  const p = pageOf(locale, rel);
  if (!fs.existsSync(p)) {
    // enabled 语种没有这个页 → 不创建(站点地图是另一个决定)。
    // 内部语种(zh) → 从默认语种页【播种】:copy 后由下面的 regen 三步本地化(标题/机型 banner/筛选栏
    // 走 catalog zh;卡片走 manifest=英文;chrome 由 chrome-sync 烘 zh)。⚠️ 产品卡标题与
    // /products/ 的 banner 散文本轮保持英文(products-zh 未接、非 catalog 渲染)——内部 noindex 页,已知残留。
    if (!isExtra(locale)) continue;
    const seed = pageOf(DEFAULT, rel);
    if (!fs.existsSync(seed)) continue;
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.copyFileSync(seed, p);
  }
  const h0 = fs.readFileSync(p, "utf8");
  let h1 = regenListPage(h0, manifest, cat, { locale, catalog, urlOf });
  h1 = setListTitle(h1, name, locale, catalog);
  h1 = setListLabels(h1, { locale, catalog: listCat, model: bannerModel });
  if (isExtra(locale)) h1 = localizeInternalHead(h1, rel, locale);   // zh list 页:head 本地化+noindex+零 hreflang
  if (h1 !== h0) { fs.writeFileSync(p, h1); lists++; }
 }
}
console.log(`list pages regenerated: ${lists} changed`);

// R3(a) — the homepage is generated now, not hand-written: template + prose catalog + tiles.
// setTileAlts is gone: the tiles are emitted with their alts already derived, so there is nothing
// left to go back and patch. Model tiles filter by EXISTENCE — a tile appears only where the page
// it points at exists in that locale. Not a rule I invented: it predicts pt's current 7 tiles
// exactly (no /pt/performance-gen-2/, so no tile sending pt users to an English page), and it
// grows itself — build that page and pt gets its 8th tile with nobody remembering to add it.
// pages 去重后:共享 key 住在 data/pages/shared.json(⚠️ 不用 _shared:.gitignore 忽略 _*.json,会漏提交)(common.more、JSON-LD 样板…)。
// 每个页面的 catalog 都要能看见它 —— 顺序 chrome < shared < 本页,本页 key 优先级最高。
// 从文件读、可缺省:没去重时它不存在,{} 兜底,不影响任何东西。
const shared = fs.existsSync(path.join(REPO, "data", "pages", "shared.json"))
  ? JSON.parse(fs.readFileSync(path.join(REPO, "data", "pages", "shared.json"), "utf8")) : {};
const homeCat = JSON.parse(fs.readFileSync(path.join(REPO, "data", "pages", "home.json"), "utf8"));
const homeTpl = fs.readFileSync(path.join(REPO, "data", "templates", "home.html"), "utf8");
const homeTiles = JSON.parse(fs.readFileSync(path.join(REPO, "data", "pages", "home-tiles.json"), "utf8"));
// 首页产品策展条 id 列表(可缺省:无文件=回落多样性挑选)。总工:6–8 精选好图,非目录堆砌。
const homeFeaturedPath = path.join(REPO, "data", "pages", "home-featured.json");
const homeFeatured = fs.existsSync(homeFeaturedPath) ? (JSON.parse(fs.readFileSync(homeFeaturedPath, "utf8")).ids || null) : null;
const pageExists = (p, loc) => { const d = dirOf(loc); return !d || fs.existsSync(path.join(REPO, `${d}${p}index.html`)); };
let homes = 0;
for (const locale of RENDER_SET) {
  const p = pageOf(locale, "index.html");
  if (!fs.existsSync(p) && !isExtra(locale)) continue;   // enabled 缺页不创建;zh 从模板播种
  const h0 = fs.existsSync(p) ? fs.readFileSync(p, "utf8") : "";
  // 全 chrome + shared + home 键(和 page 模板 158 行一致)—— home 要能引 chrome/shared key,
  // 去重才能把它存的 chrome 副本(meta.title / More / …)重定向到真源。card.alt.category 本就在 chrome。
  // enabled: LOCALES(hreflang 只三语);internal_noindex: INTERNAL(zh 首页出 noindex、零 hreflang)。
  // 机型格子按存在性过滤——list 循环已先播种 /zh/{model}/,故 zh 首页格子显示并链到 /zh/。
  const h1 = renderHome(homeTpl, { locale, catalog: { ...catalog, ...shared, ...homeCat },
    tiles: homeTiles, modelDisplay: MODEL, urlOf, exists: pageExists, dirOf, enabled: LOCALES,
    products: entries, featured: homeFeatured, internal_noindex: INTERNAL });
  if (h1 !== h0) { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, h1); homes++; }
}
console.log(`homepage: ${homes} locales regenerated (template + data/pages/home.json)`);

// R3(b)… — every other templated page. Driven by what's on disk (data/templates/page-*.html), not
// by a list here: bucket (c)/(d)/(e) land in the pipeline by existing, with nobody remembering to
// register them. Same contract as everything else — regen emits content, chrome-sync owns chrome.
let pages = 0;
const tdir = path.join(REPO, "data", "templates");
// standalone contact config (language-agnostic values) — templates read it via {{cfg.KEY}}.
// Passed to every page; pages without cfg tokens ignore it (Contact is the only consumer).
const contactCfg = fs.existsSync(path.join(REPO, "data", "contact-info.json"))
  ? JSON.parse(fs.readFileSync(path.join(REPO, "data", "contact-info.json"), "utf8")) : {};
for (const f of fs.readdirSync(tdir).filter((x) => /^page-.+\.html$/.test(x))) {
  const slug = f.replace(/^page-|\.html$/g, "");
  const pcat = JSON.parse(fs.readFileSync(path.join(REPO, "data", "pages", `${slug}.json`), "utf8"));
  const ptpl = fs.readFileSync(path.join(tdir, f), "utf8");
  for (const locale of RENDER_SET) {
    const p = pageOf(locale, path.join(slug, "index.html"));
    if (!fs.existsSync(p) && !isExtra(locale)) continue;   // enabled 缺页不创建;zh 从模板播种
    const h0 = fs.existsSync(p) ? fs.readFileSync(p, "utf8") : "";
    // chrome 整个并进来,不是逐个把需要的 key 挑出来 —— `{...pcat, "card.lang_badge": ...}`
    // 是下一张"记得加"的清单,而清单本身就是那个 bug(这周第五次)。
    // 页面 key 覆盖同名 chrome key(pcat 在后),所以并入不会改变任何现有页面的输出。
    // ⭐ 这是 pages 去重的前提:429 条复印件里有 18 组的值【已经在 chrome.json 里】,
    // 页面目录存了第二份 —— 模板要能直接引 chrome key,那第二份才删得掉。
    // internal_noindex: INTERNAL → zh 信息页出 noindex、零 hreflang(enabled 仍只三语驱 hreflang)。
    const h1 = renderPage(ptpl, { locale, catalog: { ...catalog, ...shared, ...pcat }, urlOf, path: `/${slug}/`, dirOf, enabled: LOCALES, internal_noindex: INTERNAL, config: contactCfg });
    if (h1 !== h0) { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, h1); pages++; }
  }
}
console.log(`templated pages: ${pages} regenerated (data/templates/page-*.html)`);
