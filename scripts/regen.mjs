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
// #52 批2：形态唯一真源 = data/forms.json（原 render.js FORM_KEY + chrome.js FORM_KEY + 本文件 TYPES 三处硬编码迁入）
const FORMS = JSON.parse(fs.readFileSync(path.join(REPO, "data", "forms.json"), "utf8")).forms;
const FORM_KEY = Object.fromEntries(FORMS.map((f) => [f.name, f.key]));   // bucket name -> data-form slug
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
// Slugs live under /type/ because `mounts/` and `power/` are already guide hubs. [slug, form-name]
// pairs come straight from the forms.json single source (order = /type page + chip order).
const TYPES = FORMS.map((f) => [f.key, f.name]);
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

// SEO 列表页(en/es/pt)的 <head> hreflang 从不被 regenListPage 重建 —— 历史上烤死在种子文件里,
// 跨产品/语种覆盖不一致(实测:mini/index.html en+es 发 0 条、enterprise 发 4 条;审计定性=非互惠
// →Google 整簇忽略→产品目录国际定向失效)。这里【每次构建都派生】互惠簇 + 自指 canonical + 正确 lang,
// 与产品详情页(render)/信息页(renderPage)同一套【存在性】规则,correct-by-construction。幂等:先剥后注。
// zh 走 localizeInternalHead(剥 hreflang + noindex),本函数只管 SEO 语种。
function localizeSeoListHead(html, rel, locale) {
  const route = "/" + rel.replace(/index\.html$/, "").replace(/\.html$/, "");   // "/mini/" | "/type/cables/"
  const self = `https://wanew.com${urlOf(route, locale)}`;
  html = html.replace(/(<html lang=")[^"]*(")/, `$1${locale}$2`);
  html = html.replace(/(<link rel="canonical" href=")[^"]*(")/, `$1${self}$2`);
  html = html.replace(/\s*<!-- hreflang alternates[^>]*-->/g, "");
  html = html.replace(/\s*<link rel="alternate" hreflang="[^"]*" href="[^"]*"\s*\/?>/g, "");
  const links = LOCALES
    .filter((loc) => loc === "en" || urlOf(route, loc) !== route)   // 存在性:urlOf 原样还回=该语种没有此页→不发
    .map((loc) => `<link rel="alternate" hreflang="${loc}" href="https://wanew.com${urlOf(route, loc)}" />`)
    .concat(`<link rel="alternate" hreflang="x-default" href="https://wanew.com${route}" />`)
    .join("\n");
  html = html.replace(/(<link rel="canonical"[^>]*>)/,
    `$1\n<!-- hreflang alternates (derived from locales.json + page existence) -->\n${links}`);
  return html;
}

let lists = 0;
// ⭐ Part 1 机型"从零建列表页"机制(Admin 加机型解锁,2026-07-27):模型页=[slug,slug,...]即 typeof cat==="string"。
//   一个新模型 slug 进 categories.json 但页不存在 → 从【参考现有模型页】(结构与所有模型页相同)播种,
//   下面 regenListPage 按新 cat 重写卡片/banner/title → 建出 en/es/pt(zh 仍从 en 播种)。加 slug=新 URL 不破坏现有=安全。
//   ⚠️ 首页"Shop by Starlink model" tile 是【策展】(home-tiles.json 每条带特定图片,存在性只做过滤,非自动新增):
//   新模型进 tile 需 Admin 另加一条 {cat,img}(带干净图)—— 归 Part 3 加机型契约。本机制只负责【建列表页】。
//   新模型无产品时卡片网格为空(正常:产品由 Admin 后续按 category 归入,grid 自动填充)。
//   ⚠️ 只对【模型】create-if-missing;products/type/aggregate 等固定列表页保持"缺页不自动建"原契约。
const isModelEntry = (c) => typeof c === "string";
const modelSeedRel = (loc, targetCat) => {
  const s = CATS.find((c) => c !== targetCat && fs.existsSync(pageOf(loc, `${c}/index.html`)));
  return s ? `${s}/index.html` : null;   // 该 locale 里第一个【非目标】现存模型页做种;无则该 locale 建不了(回落跳过)
};
for (const [rel, cat, name, bannerModel] of LIST_PAGES) {
 for (const locale of RENDER_SET) {
  const p = pageOf(locale, rel);
  if (!fs.existsSync(p)) {
    // 内部语种(zh) → 从默认语种页【播种】:copy 后由下面 regen 三步本地化(标题/机型 banner/筛选栏
    // 走 catalog zh;卡片走 manifest=英文;chrome 由 chrome-sync 烘 zh)。⚠️ 产品卡标题与
    // /products/ 的 banner 散文本轮保持英文(products-zh 未接、非 catalog 渲染)——内部 noindex 页,已知残留。
    if (isExtra(locale)) {
      const seed = pageOf(DEFAULT, rel);
      if (!fs.existsSync(seed)) continue;   // en 还没建(如新模型 en 播种失败)→ 本轮跳过,下轮补
      fs.mkdirSync(path.dirname(p), { recursive: true });
      fs.copyFileSync(seed, p);
    } else if (isModelEntry(cat)) {
      // 新模型 en/es/pt:从参考现存模型页播种(regenListPage 会按 cat 重写为新模型的卡片网格/banner)。
      const seedRel = modelSeedRel(locale, cat);
      if (!seedRel) continue;               // 该 locale 无可做种的现存模型页 → 跳过(不硬造)
      fs.mkdirSync(path.dirname(p), { recursive: true });
      fs.copyFileSync(pageOf(locale, seedRel), p);
    } else {
      continue;   // 非模型固定列表页(products/type/aggregate):缺页不自动建(站点地图是另一个决定,原契约)
    }
  }
  const h0 = fs.readFileSync(p, "utf8");
  let h1 = regenListPage(h0, manifest, cat, { locale, catalog, urlOf, formKey: FORM_KEY });
  h1 = setListTitle(h1, name, locale, catalog);
  // setListLabels 现在也本地化形态 chip 类目名(header.* 键在 chrome.json=catalog)+ All(list.* 键在 listCat)
  // —— 两个 catalog 合并传入(键空间不重叠:header.* vs list.*)。
  h1 = setListLabels(h1, { locale, catalog: { ...catalog, ...listCat }, model: bannerModel });
  if (isExtra(locale)) h1 = localizeInternalHead(h1, rel, locale);   // zh list 页:head 本地化+noindex+零 hreflang
  else h1 = localizeSeoListHead(h1, rel, locale);                     // en/es/pt list 页:派生+注入互惠 hreflang 簇
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

// ── Solutions: hub (/solutions/) + 6 scene pages (/solutions/{scene}/). Dedicated builder because
//    the page-*.html loop can only express a single-level slug, and it SKIPS non-existent enabled
//    pages (won't seed new URLs). Here we create unconditionally for enabled + zh(internal). The
//    scene template is ONE file reused for 6 scenes: per-scene text keys are aliased to fixed
//    {{t.sol.*}} tokens, and hero/recs/breadcrumb-url are string-substituted before renderPage.
{
  const solCat = JSON.parse(fs.readFileSync(path.join(REPO, "data", "pages", "solutions.json"), "utf8"));
  const solHubTpl = fs.readFileSync(path.join(REPO, "data", "templates", "solutions-hub.html"), "utf8");
  const solSceneTpl = fs.readFileSync(path.join(REPO, "data", "templates", "solutions-scene.html"), "utf8");
  const SOL_SCENES = ["home", "rv", "marine", "off-grid", "portable", "business"];
  const SOL_HERO = { home: "scene-home-rooftop", rv: "scene-rv-overland", marine: "scene-marine", "off-grid": "scene-offgrid", portable: "scene-portable", business: "scene-business-mine" };
  const SVG = (inner) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">${inner}</svg>`;
  const ICON = {
    mount: SVG('<ellipse cx="12" cy="6" rx="5" ry="2.5"/><path d="M12 8.4V16"/><path d="M8 20h8"/><path d="M12 16l4-2.4"/>'),
    power: SVG('<path d="M13 2 4 14h7l-1 8 9-12h-7z"/>'),
    cable: SVG('<rect x="4.5" y="2" width="5" height="3.2" rx="1"/><rect x="14.5" y="18.8" width="5" height="3.2" rx="1"/><path d="M7 5.2v4a3 3 0 0 0 3 3h4a3 3 0 0 1 3 3v3.6"/>'),
    net: SVG('<circle cx="12" cy="5" r="2"/><circle cx="5" cy="19" r="2"/><circle cx="19" cy="19" r="2"/><path d="M12 7v3.5M12 10.5 6 17M12 10.5l6 6.5"/>'),
    case: SVG('<rect x="4" y="7" width="16" height="13" rx="2"/><path d="M9 7V5.2a3 3 0 0 1 6 0V7"/>'),
    mini: SVG('<rect x="5" y="3" width="14" height="10" rx="2"/><path d="M12 13v5"/><path d="M8 21h8"/>'),
    enterprise: SVG('<rect x="4" y="3" width="16" height="18" rx="1.5"/><path d="M8 7h2M14 7h2M8 11h2M14 11h2M8 15h2M14 15h2"/>'),
    all: SVG('<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>'),
    shield: SVG('<path d="M12 3 5 6v5.5c0 4.2 2.9 7.6 7 8.5 4.1-.9 7-4.3 7-8.5V6l-7-3Z"/><path d="m9 12 2 2 4-4"/>'),
  };
  // ── Marine (Solutions #77 sample): the scene template is shared by all 6 scenes, so the extra
  //    blocks are injected at {{SCENE_BLOCKS}} for marine ONLY — every other scene gets "" and its
  //    page stays byte-identical. When a second scene gets the treatment, give it its own entry.
  //    🔴 Content-accuracy rule: each kit card's spec line restates ONLY what that product's own
  //    listing says (see solutions.marine.rec.*.s). Cards are text+icon, NO product photos — the
  //    catalogue still carries scraped listing images with old-brand pixel residue (4209 class).
  const marineTpl = fs.readFileSync(path.join(REPO, "data", "templates", "solutions-marine.html"), "utf8");
  // The thin generic band (Recommended chips + generic CTA) moved OUT of solutions-scene.html into
  // its own partial so a deep scene can drop it: marine's kit + scene CTA supersede it, and keeping
  // both would put two CTAs on one page. Non-marine scenes get this markup back verbatim, so their
  // built pages stay byte-identical — that equality is the regression proof, see the regen diff.
  const solGenericTpl = fs.readFileSync(path.join(REPO, "data", "templates", "solutions-scene-generic.html"), "utf8").replace(/\r/g, "").replace(/\n$/, "");
  const MARINE_KIT = [   // [n, category, id, icon] — real catalogue products, verified present
    [1, "performance-gen-3", 4202, "mount"], [2, "mini", 691, "mount"], [3, "mini", 689, "mount"],
    [4, "mini", 4206, "cable"], [5, "mini", 4205, "power"], [6, "performance-gen-3", 697, "cable"],
  ];
  const esc = (s) => String(s).replace(/&(?!(?:amp|lt|gt|quot|#\d+);)/g, "&amp;");
  const MARINE_GUIDES = [  // real retagged marine articles (slug verified in guides-manifest.json)
    ["starlink-marine-installation-step-by-step-boat-satellite", "Step-by-Step Boat Installation"],
    ["special-mounts-starlink-marine-accessories-complete-guide-stable", "Special Mounts for Rough Seas"],
    ["complete-starlink-marine-cable-management-best-solutions-routing", "Marine Cable Management & Routing"],
    ["starlink-marine-accessories-guide-marine-grade-connectors", "Choosing Marine-Grade Connectors"],
    ["starlink-marine-maintenance-5-essential-tips-reliable-satellite", "5 Marine Maintenance Essentials"],
  ];
  // [labelKey | null, url, icon, literalLabel?] — literal for proper-noun models (Mini/Enterprise)
  const SOL_RECS = {
    home: [["header.mounts_brackets", "/products/#mounts", "mount"], ["header.cables", "/products/#cables", "cable"]],
    rv: [["header.mounts_brackets", "/products/#mounts", "mount"], ["header.power_charging", "/products/#power", "power"], [null, "/mini/", "mini", "Starlink Mini"]],
    marine: [["header.mounts_brackets", "/products/#mounts", "mount"], ["header.cables", "/products/#cables", "cable"]],
    "off-grid": [["header.power_charging", "/products/#power", "power"], ["header.cables", "/products/#cables", "cable"]],
    portable: [[null, "/mini/", "mini", "Starlink Mini"], ["header.cases_protection", "/products/#cases", "case"], ["header.cables", "/products/#cables", "cable"]],
    business: [[null, "/enterprise/", "enterprise", "Enterprise"], ["header.networking", "/products/#networking", "net"], ["header.all_products", "/products/", "all"]],
  };
  const pick = (o, loc) => (o && (o[loc] ?? o.en)) || "";
  let solPages = 0;
  for (const locale of RENDER_SET) {
    if (!LOCALES.includes(locale) && !isExtra(locale)) continue;   // enabled + zh(extra) only
    const baseCat = { ...catalog, ...shared, ...solCat };
    // urlOf can't handle a #hash (it would look up a non-existent file) — resolve the base path's
    // localized URL, then re-append the fragment. Same rule renderHome uses for typecard hashes.
    const linkOf = (u) => { const h = u.indexOf("#"); return h < 0 ? urlOf(u, locale) : urlOf(u.slice(0, h), locale) + u.slice(h); };
    // hub
    {
      const p = pageOf(locale, path.join("solutions", "index.html"));
      const html = renderPage(solHubTpl, { locale, catalog: baseCat, urlOf, path: "/solutions/", dirOf, enabled: LOCALES, internal_noindex: INTERNAL });
      fs.mkdirSync(path.dirname(p), { recursive: true });
      if (!fs.existsSync(p) || fs.readFileSync(p, "utf8") !== html) { fs.writeFileSync(p, html); solPages++; }
    }
    // 6 scenes
    for (const sc of SOL_SCENES) {
      const recs = SOL_RECS[sc].map(([lk, url, ic, lit]) => {
        const label = lit || pick(baseCat[lk], locale);
        return `        <a class="sol-rec" href="${linkOf(url)}"><span class="sol-rec__ic" aria-hidden="true">${ICON[ic]}</span><span class="sol-rec__t">${label}</span><span class="sol-rec__arw" aria-hidden="true">→</span></a>`;
      }).join("\n");
      const sceneCat = { ...baseCat, "sol.eyebrow": solCat[`solutions.${sc}.eyebrow`], "sol.h1": solCat[`solutions.${sc}.h1`], "sol.intro": solCat[`solutions.${sc}.intro`] };
      // Marine-only deep blocks; "" for the other 5 scenes => their pages don't move a byte.
      let sceneBlocks = "";
      if (sc === "marine") {
        const kit = MARINE_KIT.map(([n, cat, id, ic]) => {
          const nm = pick(solCat[`solutions.marine.rec.${n}.n`], locale);
          const spec = pick(solCat[`solutions.marine.rec.${n}.s`], locale);
          return `        <a class="sol-mar-kit__c" href="${urlOf(`/${cat}/${id}`, locale)}">\n`
            + `          <span class="sol-mar-kit__ic" aria-hidden="true">${ICON[ic]}</span>\n`
            + `          <h3 class="sol-mar-kit__t">${esc(nm)}</h3>\n`
            + `          <p class="sol-mar-kit__s">${esc(spec)}</p>\n`
            + `          <span class="sol-mar-kit__arw" aria-hidden="true">→</span>\n        </a>`;
        }).join("\n");
        // Marine articles are EN-only today: on a localized page the title carries the same honest
        // "in English" badge the Guides cards use (card.lang_badge) rather than pretending it is
        // translated. Same call Joe/总工 signed off on for the Guides listings.
        const badge = locale === DEFAULT ? "" : ` <span class="sol-mar-guides__b">${esc(pick(baseCat["card.lang_badge"], locale))}</span>`;
        const guides = MARINE_GUIDES.map(([slug, title]) =>
          `        <a class="sol-mar-guides__l" href="${urlOf(`/guides/${slug}/`, locale)}"><span>${esc(title)}${badge}</span><span class="sol-mar-guides__arw" aria-hidden="true">→</span></a>`
        ).join("\n");
        sceneBlocks = marineTpl
          .split("{{MARINE_KIT}}").join(kit)
          .split("{{MARINE_GUIDES}}").join(guides)
          .split("{{ICON_MOUNT}}").join(ICON.mount).split("{{ICON_SHIELD}}").join(ICON.shield)
          .split("{{ICON_CABLE}}").join(ICON.cable).split("{{ICON_POWER}}").join(ICON.power);
      }
      const tpl2 = solSceneTpl
        .split("{{SCENE_HERO}}").join(`/static/upload/image/20260725/${SOL_HERO[sc]}.webp`)
        .split("{{SCENE_GENERIC}}").join(sc === "marine" ? "" : solGenericTpl)
        .split("{{SCENE_RECS}}").join(recs)
        .split("{{SCENE_BLOCKS}}").join(sceneBlocks)
        .split("{{SCENE_SOLUTIONS_URL}}").join(urlOf("/solutions/", locale));
      const p = pageOf(locale, path.join("solutions", sc, "index.html"));
      const html = renderPage(tpl2, { locale, catalog: sceneCat, urlOf, path: `/solutions/${sc}/`, dirOf, enabled: LOCALES, internal_noindex: INTERNAL });
      fs.mkdirSync(path.dirname(p), { recursive: true });
      if (!fs.existsSync(p) || fs.readFileSync(p, "utf8") !== html) { fs.writeFileSync(p, html); solPages++; }
    }
  }
  console.log(`solutions: ${solPages} pages regenerated (hub + 6 scenes × ${RENDER_SET.length} locales)`);
}

// ── Guides: library home /guides/ + 4 topic index /guides/{topic}/ + articles /guides/{slug}/ ──
//    Migrates legacy .blog-details articles into the unified Guides library, STRIPPING the legacy
//    Tejoy inline styles (DESIGN.md §3.2b: zero inline style). Articles are en-only (source has no
//    localized bodies); home/topic shells build for all locales, listing en articles + lang-badge
//    on non-en. Manifest drives it (guides-manifest.json); G1 = marine填, others G2-4.
{
  const gm = JSON.parse(fs.readFileSync(path.join(REPO, "data", "pages", "guides-manifest.json"), "utf8"));
  const gCat = JSON.parse(fs.readFileSync(path.join(REPO, "data", "pages", "guides.json"), "utf8"));
  const artTpl = fs.readFileSync(path.join(REPO, "data", "templates", "guides-article.html"), "utf8");
  const listTpl = fs.readFileSync(path.join(REPO, "data", "templates", "guides-list.html"), "utf8");
  // ⭐ Guides IA v2(Joe/总工 2026-07-27):5 任务轴(正交)+ oem(B2B,不进 nav、footer 经 /guides/oem/ 可达)。
  //   compatibility 复用 /guides/compatibility/(page-* 建矩阵页,本 builder 只写卡片缓存注入,见下)。
  //   退役 marine/rv-off-grid/industrial(文章已 retag 散入 5 轴;旧 topic 页 git rm+301)。
  const TOPICS = ["compatibility", "mounts", "power", "cabling", "protection", "oem"];
  const NAV_TOPICS = ["compatibility", "mounts", "power", "cabling", "protection"];   // oem 不进 nav
  // 任务轴短标签(nav + 卡片眉标 + 文章"返回轴"):chrome.json 单源 header.guides_*(nav 也用同键,免双源)。
  const TKEY = { compatibility: "header.guides_compatibility", mounts: "header.guides_mounting", power: "header.guides_power", cabling: "header.guides_cabling", protection: "header.guides_protection", oem: "header.guides_oem" };
  const pick = (o, loc) => (o && (o[loc] ?? o.en)) || "";
  const esc = (s) => String(s || "").replace(/&(?!amp;|lt;|gt;|quot;|#)/g, "&amp;");
  // ⭐ 分批:G1 只填 marine。清理阶段①(总工/Joe 定):【不建空壳 topic 页】—— 空 coming-soon
  //    页无价值、留着重演"新旧两套"混淆;G2-4 迁移时带内容重建。只建【真有文章】的 topic。
  const ACTIVE = new Set((gm.active_topics && gm.active_topics.length) ? gm.active_topics : ["marine"]);
  const built = gm.articles.filter((a) => a.slug && ACTIVE.has(a.topic));
  const activeTopics = TOPICS.filter((t) => built.some((a) => a.topic === t));   // 有文章的 topic(顺序=TOPICS)
  // Content store: extracted+stripped article body cached to data/guides-body/{slug}.html on first
  // build, then read from there — so the legacy /marine/*.html source can be deleted (301) while the
  // builder can still re-render articles (template/CSS changes propagate). Cache is the source of truth.
  const bodyDir = path.join(REPO, "data", "guides-body");
  function extractBody(a) {
    const cache = path.join(bodyDir, a.slug + ".html");
    if (fs.existsSync(cache)) return fs.readFileSync(cache, "utf8");
    let h; try { h = fs.readFileSync(path.join(REPO, a.old.replace(/^\//, "") + ".html"), "utf8"); } catch { return null; }
    const m = h.match(/<div class="blog-details__text-1[^"]*"[^>]*>([\s\S]*?)<\/div>\s*(?:<\/div>\s*)?<\/div>\s*<\/div>\s*<\/section>/);
    if (!m) return null;
    const body = m[1]
      .replace(/\s+style="[^"]*"/gi, "")
      .replace(/\s+class="[^"]*(?:list-paddingleft|firstRow)[^"]*"/gi, "")
      .replace(/\s+(?:width|height)="\d+"/gi, "")
      .replace(/&nbsp;/g, " ")
      .replace(/[ \t]+\n/g, "\n").trim();
    fs.mkdirSync(bodyDir, { recursive: true });
    fs.writeFileSync(cache, body);
    return body;
  }
  // 取首个【真正文段】做摘要。跳过:TOC/列表块(目录常是 <h2>Table of Contents</h2><ul>…每项 <p><a href="#">）、
  // 锚点目录项、空段/纯图/注释段/纯编号、以及【标题式短片段】(短且无句读,如 "Understanding X"=正文小标题不是摘要)。
  const descOf = (b) => {
    const noLists = b.replace(/<(ul|ol)\b[\s\S]*?<\/\1>/gi, " ");   // 去 TOC/列表,免把目录首项当摘要
    for (const raw of (noLists.match(/<p[^>]*>([\s\S]*?)<\/p>/gi) || [])) {
      if (/<a\s[^>]*href="#/i.test(raw)) continue;                   // 锚点目录项
      const t = raw.replace(/<!--[\s\S]*?-->/g, "").replace(/<[^>]+>/g, "").replace(/\s+/g, " ").replace(/^\s*\d+[.)]\s*/, "").trim();
      if (t.length >= 24 && (/[.,;:!?]/.test(t) || t.length >= 70)) return t.slice(0, 155);   // 有句读或够长=真文段,排除标题式短片段
    }
    return "";
  };
  let gPages = 0, gWarn = 0;
  // ARTICLES (en only — source content is en)
  for (const a of built) {
    const body = extractBody(a);
    // 守卫=检测提取失败(空/无标题结构)。h2 或 h3 都算有效小节标题(如 /power/4353 全用 h3)——
    // 标题层级规范化(h3→h2)是 ③ 内容质量的事,不该在此把真文章当失败跳过。
    if (!body || (body.match(/<h[23]/gi) || []).length < 1) { console.log(`  ⚠️ guides extract 失败/空: ${a.old}`); gWarn++; continue; }
    const desc = descOf(body);
    // ③ 卡片摘要(派生自正文首段,与文章 meta desc 同源);剥前导编号"1. "(部分文章首段是编号小节)→ 干净引言。
    a._summary = desc.replace(/^\s*\d+[.)]\s*/, "");
    const tpl2 = artTpl
      .split("{{ART_BODY}}").join(body)
      .split("{{ART_TITLE}}").join(esc(a.title))
      .split("{{ART_DESC}}").join(desc.replace(/"/g, "&quot;"))
      .split("{{GUIDES_URL}}").join(urlOf("/guides/", "en"))
      .split("{{GUIDES_TOPIC_URL}}").join(urlOf(`/guides/${a.topic}/`, "en"))
      .split("{{ART_TOPIC_LABEL}}").join(pick(catalog[TKEY[a.topic]], "en"))
      .split("{{ART_TOPIC_MORE}}").join(pick(gCat["guides.more"], "en"));
    const p = pageOf("en", path.join("guides", a.slug, "index.html"));
    const html = renderPage(tpl2, { locale: "en", catalog: { ...catalog, ...shared, ...gCat }, urlOf, path: `/guides/${a.slug}/`, dirOf, enabled: LOCALES, internal_noindex: INTERNAL });
    fs.mkdirSync(path.dirname(p), { recursive: true });
    if (!fs.existsSync(p) || fs.readFileSync(p, "utf8") !== html) { fs.writeFileSync(p, html); gPages++; }
  }
  const cardOf = (a, loc) => {
    const href = urlOf(`/guides/${a.slug}/`, loc);
    const badge = (loc !== "en" && href === `/guides/${a.slug}/`) ? ` <span class="tj-lang-badge">${pick(catalog["card.lang_badge"], loc)}</span>` : "";
    // 卡面用 card_title(人话短标题,③逐篇填);缺省回落长标题(CSS 3 行截断兜底)。SEO 长标题始终留文章 <title>/H1。
    const sum = a._summary ? `<span class="guides-card__sum">${esc(a._summary)}</span>` : "";
    return `        <a class="guides-card" href="${href}"><span class="guides-card__topic">${pick(catalog[TKEY[a.topic]], loc)}</span><span class="guides-card__t">${esc(a.card_title || a.title)}${badge}</span>${sum}<span class="guides-card__arw" aria-hidden="true">→</span></a>`;
  };
  // 一套浏览逻辑(Joe 铁令,消除"客户端筛选 vs 专属页"两套):topic chip = 导航链接 <a>,
  // 点击跳到 /guides/{topic}/ 专属页,不再原地过滤。home 与各 topic 页共用同一条 nav,
  // current 标 is-active。仅 ≥2 个有内容主题才有意义(否则无处可去)。
  const navTopics = NAV_TOPICS.filter((t) => built.some((a) => a.topic === t));   // 有文章的 nav 轴(排除 oem)
  const navChips = (loc, current) => {
    if (navTopics.length < 2) return "";
    const all = `<a class="guides-chip${current === "all" ? " is-active" : ""}" href="${urlOf("/guides/", loc)}">${pick(gCat["guides.filter.all"], loc)}</a>`;
    const tops = navTopics.map((t) =>
      `<a class="guides-chip${current === t ? " is-active" : ""}" href="${urlOf(`/guides/${t}/`, loc)}">${pick(catalog[TKEY[t]], loc)}</a>`).join("");
    return `      <nav class="guides-nav" aria-label="Guides topics">${all}${tops}</nav>`;
  };
  for (const locale of RENDER_SET) {
    if (!LOCALES.includes(locale) && !isExtra(locale)) continue;
    const baseCat = { ...catalog, ...shared, ...gCat };
    // home
    {
      // /guides/ 首页网格 = how-to 文章(排除 oem;oem 是 B2B,只经 /guides/oem/ + footer 可达,不在 how-to 库)。
      const cards = built.filter((a) => a.topic !== "oem").map((a) => cardOf(a, locale)).join("\n");
      const tpl2 = listTpl
        .split("{{GL_TITLE}}").join(pick(gCat["guides.meta.title"], locale)).split("{{GL_DESC}}").join(pick(gCat["guides.meta.desc"], locale))
        .split("{{GL_H1}}").join(pick(gCat["guides.hero.h1"], locale)).split("{{GL_INTRO}}").join(pick(gCat["guides.hero.intro"], locale))
        .split("{{GL_CRUMB}}").join(pick(gCat["guides.hero.h1"], locale))
        .split("{{GL_FILTER}}").join(navChips(locale, "all")).split("{{GL_CARDS}}").join(cards);
      const p = pageOf(locale, path.join("guides", "index.html"));
      const html = renderPage(tpl2, { locale, catalog: baseCat, urlOf, path: "/guides/", dirOf, enabled: LOCALES, internal_noindex: INTERNAL });
      fs.mkdirSync(path.dirname(p), { recursive: true });
      if (!fs.existsSync(p) || fs.readFileSync(p, "utf8") !== html) { fs.writeFileSync(p, html); gPages++; }
    }
    // topic index —— 建【真有文章】的任务轴页。compatibility 特例:page-* 建 /guides/compatibility/(矩阵页),
    //   本 builder 只把该轴文章卡写成缓存 section,由 page-* loop 注入矩阵页底部({{GUIDES_TOPIC_CARDS}})。
    //   oem 也建独立 hub 页(footer 可达、不进 nav)。
    for (const t of activeTopics) {
      const list = built.filter((a) => a.topic === t);
      const cards = list.map((a) => cardOf(a, locale)).join("\n");
      if (t === "compatibility") {
        const section = `      <h2 class="guides-cards-head">${pick(gCat["guides.compat.articles_head"], locale)}</h2>\n      <div class="guides-grid">\n${cards}\n      </div>`;
        fs.mkdirSync(bodyDir, { recursive: true });
        fs.writeFileSync(path.join(bodyDir, `_cards-compatibility-${locale}.html`), section);
        continue;   // 不建页(page-* 拥有 /guides/compatibility/)
      }
      const tpl2 = listTpl
        .split("{{GL_TITLE}}").join(pick(gCat[`guides.topic.${t}.title`], locale) + " | Wanew").split("{{GL_DESC}}").join(pick(gCat[`guides.topic.${t}.intro`], locale))
        .split("{{GL_H1}}").join(pick(gCat[`guides.topic.${t}.title`], locale)).split("{{GL_INTRO}}").join(pick(gCat[`guides.topic.${t}.intro`], locale))
        .split("{{GL_CRUMB}}").join(pick(gCat[`guides.topic.${t}.title`], locale))
        .split("{{GL_FILTER}}").join(navChips(locale, t)).split("{{GL_CARDS}}").join(cards);
      const p = pageOf(locale, path.join("guides", t, "index.html"));
      const html = renderPage(tpl2, { locale, catalog: baseCat, urlOf, path: `/guides/${t}/`, dirOf, enabled: LOCALES, internal_noindex: INTERNAL });
      fs.mkdirSync(path.dirname(p), { recursive: true });
      if (!fs.existsSync(p) || fs.readFileSync(p, "utf8") !== html) { fs.writeFileSync(p, html); gPages++; }
    }
  }
  console.log(`guides: ${gPages} pages regenerated (${built.length} articles + home + ${activeTopics.length} topics [${activeTopics.join(",")}]; ${gWarn} extract warnings)`);
}

// R3(b)… — every other templated page. Driven by what's on disk (data/templates/page-*.html), not
// by a list here: bucket (c)/(d)/(e) land in the pipeline by existing, with nobody remembering to
// register them. Same contract as everything else — regen emits content, chrome-sync owns chrome.
let pages = 0;
const tdir = path.join(REPO, "data", "templates");
// standalone contact config (language-agnostic values) — templates read it via {{cfg.KEY}}.
// Passed to every page; pages without cfg tokens ignore it (Contact is the only consumer).
const contactCfg = fs.existsSync(path.join(REPO, "data", "contact-info.json"))
  ? JSON.parse(fs.readFileSync(path.join(REPO, "data", "contact-info.json"), "utf8")) : {};
// ⭐ Guides 一致性(Joe 2026-07-27):compat/faq 并进 /guides/ 下,与 /guides/{topic}/ 同一套 URL。
//   输出目录 + URL path 都走映射;canonical/hreflang 从 path 派生 → 自动指新 URL。老顶级 URL 走 _redirects 301。
const PAGE_ROUTE = { compatibility: "guides/compatibility", faq: "guides/faq" };
for (const f of fs.readdirSync(tdir).filter((x) => /^page-.+\.html$/.test(x))) {
  const slug = f.replace(/^page-|\.html$/g, "");
  const route = PAGE_ROUTE[slug] || slug;                  // 输出路径 + URL(默认 = slug 本身)
  const pcat = JSON.parse(fs.readFileSync(path.join(REPO, "data", "pages", `${slug}.json`), "utf8"));
  const ptpl = fs.readFileSync(path.join(tdir, f), "utf8");
  for (const locale of RENDER_SET) {
    const p = pageOf(locale, path.join(route, "index.html"));
    if (!fs.existsSync(p) && !isExtra(locale)) continue;   // enabled 缺页不创建;zh 从模板播种
    const h0 = fs.existsSync(p) ? fs.readFileSync(p, "utf8") : "";
    // chrome 整个并进来,不是逐个把需要的 key 挑出来 —— `{...pcat, "card.lang_badge": ...}`
    // 是下一张"记得加"的清单,而清单本身就是那个 bug(这周第五次)。
    // 页面 key 覆盖同名 chrome key(pcat 在后),所以并入不会改变任何现有页面的输出。
    // ⭐ 这是 pages 去重的前提:429 条复印件里有 18 组的值【已经在 chrome.json 里】,
    // 页面目录存了第二份 —— 模板要能直接引 chrome key,那第二份才删得掉。
    // internal_noindex: INTERNAL → zh 信息页出 noindex、零 hreflang(enabled 仍只三语驱 hreflang)。
    // ⭐ IA v2:compatibility 页 = 矩阵内容(本模板)+ Guides builder 写的该轴文章卡缓存(注入 {{GUIDES_TOPIC_CARDS}})。
    //   缓存缺失(如尚未 regen guides)→ 置空,不留裸 token。其余 page-* 模板无此 token,replace 为 no-op。
    let ptpl2 = ptpl;
    if (ptpl.includes("{{GUIDES_TOPIC_CARDS}}")) {
      const cf = path.join(REPO, "data", "guides-body", `_cards-${slug}-${locale}.html`);
      ptpl2 = ptpl.split("{{GUIDES_TOPIC_CARDS}}").join(fs.existsSync(cf) ? fs.readFileSync(cf, "utf8") : "");
    }
    const h1 = renderPage(ptpl2, { locale, catalog: { ...catalog, ...shared, ...pcat }, urlOf, path: `/${route}/`, dirOf, enabled: LOCALES, internal_noindex: INTERNAL, config: contactCfg });
    if (h1 !== h0) { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, h1); pages++; }
  }
}
console.log(`templated pages: ${pages} regenerated (data/templates/page-*.html)`);
