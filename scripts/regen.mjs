// Local regeneration runner: git-JSON + template -> product detail pages + admin manifest.
// Run: node scripts/regen.mjs [id ...]   (no args = all)
// Reuses functions/_lib/render.js — the SAME render the CF Pages Function uses at publish.
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { render, genRelated, resolveImg, regenListPage, setListTitle, setListLabels, renderHome, renderPage, excerptOf, catmapOf } from "../functions/_lib/render.js";
import { productPath } from "./product-slug.mjs";
import { localeDirs } from "./locale-dirs.mjs";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const cfg = JSON.parse(fs.readFileSync(path.join(REPO, "data", "site.json"), "utf8"));
const tpl = fs.readFileSync(path.join(REPO, "data", "templates", "product.html"), "utf8");

// ── #81 step3：.webp 在【读入源数据时】就收进图片路径 ─────────────────────────
//
// 每个模板里都有一段 "WebP 自动替换" 脚本，它在【浏览器里】给每张 /static/upload/*.jpg|png
// 造一个 Image() 去试探同名 .webp 在不在。可"在不在"是【构建期完全可知】的 —— 磁盘就在这。
// 用一次网络往返问一个本地就能答的问题，每页每图一次。实测 371 个去重引用【371 个都有孪生】。
//
// ⭐ 为什么在【读入时】换、而不是渲染完再扫一遍页面：写盘后补救会让 regen 每次先写出 .jpg
//    再改成 .webp，于是"N pages regenerated"永远非零 —— 又一个会说假话的仪器。在源头换，
//    渲染出来就是最终形态，变更检测和计数器都还是真的。（我先写了写盘后那版，跑第二遍
//    发现计数器不归零，才换成这版。）
// ⭐ 只换【内存里的字符串】，不动 data/products/*.json 本身 —— 那是 Admin 的域。
// ⚠️ 那段运行时脚本【不删】：产品详情页还有第二条渲染路径（Admin 的 CF Worker 发布），
//    Worker 读不到磁盘、判断不了孪生。删了它，Admin 发布的页面会退回 .jpg 且失去兜底。
//    它留作 Worker 路径的安全网；本地构建的静态页上它找不到 .jpg|png，一次探测都不发。
//    真要退役，得让 Admin 发布路径也做同样替换（需把孪生清单穿进 render.js）。
const _twinCache = new Map();
const webpInline = (text) => String(text).replace(
  /(\/static\/upload\/[^"'\s)\\]+?)\.(jpg|jpeg|png)\b/gi,
  (m, base) => {
    const webp = `${base}.webp`;
    if (!_twinCache.has(webp)) _twinCache.set(webp, fs.existsSync(path.join(REPO, webp.replace(/^\//, ""))));
    return _twinCache.get(webp) ? webp : m;          // 没孪生就原样留着（那时运行时脚本仍是唯一正确行为）
  });

// ── #66：正文图补 loading="lazy" + 真实 width/height（防 CLS）───────────────
//
// 量到的:全站 5629 个 <img> 里 5569 个没有 width/height —— 浏览器在图下载完之前不知道该留
// 多大位置,内容就会跳。这不是"加个属性"的小事,是每页都在发生的布局抖动。
//
// ⭐ 尺寸【从磁盘上的图真读】(自写 PNG/JPEG/WebP 头解析,无依赖),不是估。读不到就不写 ——
//   宁可不加,也不加一个错的宽高比(那比没有更糟:会按错的比例留错位置)。
// ⭐ 必须跑在 webpInline 【之后】:那时 src 已是 .webp,读的就是真正会被下载的那张。
// ⚠️ 全局 CSS 是 `img{max-width:100%;height:auto}` —— 所以属性只提供宽高比给浏览器预留位置,
//   显示尺寸仍由 CSS 决定,不会撑坏布局(动手前先核过这条规则才敢加)。
// ⚠️ 只处理【正文里的图】(产品描述/攻略正文)。首屏 header 的 logo 不走这里,它不该 lazy。
const _dimCache = new Map();
const imgDim = (webPath) => {
  if (_dimCache.has(webPath)) return _dimCache.get(webPath);
  let d = null;
  try {
    const b = fs.readFileSync(path.join(REPO, webPath.replace(/^\//, "")));
    if (b.slice(0, 8).toString("hex") === "89504e470d0a1a0a") d = [b.readUInt32BE(16), b.readUInt32BE(20)];
    else if (b[0] === 0xFF && b[1] === 0xD8) {
      let i = 2;
      while (i < b.length - 8) {
        if (b[i] !== 0xFF) { i++; continue; }
        const m = b[i + 1];
        if (m >= 0xC0 && m <= 0xCF && m !== 0xC4 && m !== 0xC8 && m !== 0xCC) { d = [b.readUInt16BE(i + 7), b.readUInt16BE(i + 5)]; break; }
        i += 2 + b.readUInt16BE(i + 2);
      }
    } else if (b.slice(0, 4).toString() === "RIFF" && b.slice(8, 12).toString() === "WEBP") {
      const f = b.slice(12, 16).toString();
      if (f === "VP8X") d = [1 + b.readUIntLE(24, 3), 1 + b.readUIntLE(27, 3)];
      else if (f === "VP8 ") d = [b.readUInt16LE(26) & 0x3fff, b.readUInt16LE(28) & 0x3fff];
      else if (f === "VP8L") { const n = b.readUInt32LE(21); d = [(n & 0x3FFF) + 1, ((n >> 14) & 0x3FFF) + 1]; }
    }
  } catch { d = null; }
  _dimCache.set(webPath, d);
  return d;
};
const imgAttrs = (text) => String(text).replace(/<img\b[^>]*>/gi, (tag) => {
  const src = (tag.match(/src="([^"]+)"/i) || [])[1];
  if (!src || !src.startsWith("/static/")) return tag;      // 远程图读不到尺寸,不碰
  let out = tag;
  if (!/\bloading=/i.test(out)) out = out.replace(/<img\b/i, '<img loading="lazy"');
  if (!/\bwidth=/i.test(out) && !/\bheight=/i.test(out)) {
    const d = imgDim(src);
    if (d) out = out.replace(/<img\b/i, `<img width="${d[0]}" height="${d[1]}"`);
  }
  return out;
});
const prepMedia = (text) => imgAttrs(webpInline(text));

// ── #8：把尺寸做成【数据】，让两条渲染路径吃同一份事实 ────────────────────────
// render.js 是双运行时(regen=Node / Admin=CF Worker)，Worker 读不到磁盘量不出尺寸。
// 所以构建期把 static 下每张图的真实宽高扫成 data/media-sizes.json，regen 直接用、
// Admin Worker 经 GitHub API 读同一份 —— 尺寸不再是"谁能读到磁盘谁才有"的特权。
// ⚠️ 只收【真读出来】的：解析失败就不进表，render 侧查不到就什么都不写(错的宽高比比没有更糟)。
const MEDIA_SIZES = (() => {
  const out = {};
  const walk = (dir) => {
    for (const d of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, d.name);
      if (d.isDirectory()) { walk(p); continue; }
      if (!/\.(webp|png|jpe?g)$/i.test(d.name)) continue;
      const web = "/" + path.relative(REPO, p).split(path.sep).join("/");
      const dim = imgDim(web);
      if (dim) out[web] = dim;
    }
  };
  walk(path.join(REPO, "static"));
  return out;
})();
/* ── R2 图的尺寸并进来(Admin 出的 data/r2-media-sizes.json)──────────────────
   🔴 只并进【内存】的 MEDIA_SIZES,**绝不并进落盘的 media-sizes.json** ——
      下面那段是【全量覆写】,写进去的话下一次 regen 就把它冲掉,
      **和 thumb 被冲回原图是同一个坑**(两个写入方,而覆写方沉默地赢)。
      落盘那份的语义是"regen 量到的 static/ 尺寸",让它保持名副其实。
   🔴 两组都要:**56 条 = 原图 28 + 缩略图 28**。
      卡片走 `dimAttr(e.thumb, …)`(regen 接管后喂的是缩略图 URL),
      详情页走 `dimAttr(原图URL, …)` —— **只给原图那一组,卡片就查不到、不注 width/height,
      列表页这 28 张的 CLS 防护等于没做,而且一样没有任何症状。**
   ⚠️ 顶层是 `{ _note, _generated_by, sizes:{...} }`,**必须取 `.sizes`** ——
      直接 spread 整个对象的话,进查找表的是那三个键,56 条一条都进不去。
      我预演接线时正是这么错了一次,当场 0 命中。 */
const R2_SIZES = (() => {
  const p = path.join(REPO, "data", "r2-media-sizes.json");
  if (!fs.existsSync(p)) return {};
  return JSON.parse(fs.readFileSync(p, "utf8")).sizes || {};
})();
{
  const p = path.join(REPO, "data", "media-sizes.json");
  const body = JSON.stringify(MEDIA_SIZES, null, 0) + "\n";
  if (!fs.existsSync(p) || fs.readFileSync(p, "utf8") !== body) fs.writeFileSync(p, body);
  Object.assign(MEDIA_SIZES, R2_SIZES);                    // ← 落盘之后才并,顺序是判据的一部分
  console.log(`  + R2 尺寸 ${Object.keys(R2_SIZES).length} 条并入内存(不落盘)`);
  console.log(`media-sizes: ${Object.keys(MEDIA_SIZES).length} images measured -> data/media-sizes.json`);
}      // 顺序固定:先换 webp,再按最终图读尺寸

const prods = {};
const pdir = path.join(REPO, "data", "products");
for (const f of fs.readdirSync(pdir)) {
  if (!f.endsWith(".json")) continue;
  // ⚠️ webpInline 跑在【原始 JSON 文本】上没问题(它只匹配路径子串)；但 imgAttrs 不行 ——
  //    JSON 里的 HTML 引号是 \" 转义的，src="..." 这种正则在原文本上【永远匹配不到】。
  //    所以顺序必须是：先在文本层换 webp → JSON.parse → 再在【解析出来的 HTML 字段】上补属性。
  //    (第一版我把两步都塞在文本层，跑完量出来 lazy 只 +6、抽样图一个属性没有，才查出这条。)
  const d = JSON.parse(webpInline(fs.readFileSync(path.join(pdir, f), "utf8")));
  for (const loc of Object.keys(d.i18n || {})) {
    for (const fld of ["description_html", "summary_html"]) {
      if (d.i18n[loc] && typeof d.i18n[loc][fld] === "string") d.i18n[loc][fld] = imgAttrs(d.i18n[loc][fld]);
    }
  }
  prods[d.id] = d;
}

const locales = JSON.parse(fs.readFileSync(path.join(REPO, "data", "locales.json"), "utf8"));
const catalog = JSON.parse(fs.readFileSync(path.join(REPO, "data", "chrome.json"), "utf8"));
// #52 批1：类目唯一真源 = data/categories.json（原 render.js CATMAP + 本文件 CATS 双硬编码迁入）
const categoriesJson = JSON.parse(fs.readFileSync(path.join(REPO, "data", "categories.json"), "utf8"));
// #52 批2：形态唯一真源 = data/forms.json（原 render.js FORM_KEY + chrome.js FORM_KEY + 本文件 TYPES 三处硬编码迁入）
const FORMS = JSON.parse(fs.readFileSync(path.join(REPO, "data", "forms.json"), "utf8")).forms;
/* 🔴 name 与 key 【都】映射到 key —— C 步 1:读取侧两者都认。
   产品数据里 `form` 存的是【显示名】当外键,所以改一个显示名要重写上百个文件。
   根治是把它改成存 key,而这是第一步:**读取侧先能同时认两种**,admin 才敢动数据。
   ⚠️ 顺序不可颠倒 —— 这一步没上线就迁移,线上按显示名匹配会全部落空,
   产品会从 /type/ 页整批消失。 */
const FORM_KEY = Object.fromEntries(FORMS.flatMap((f) => [[f.name, f.key], [f.key, f.key]]));   // bucket name -> data-form slug
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
/* 🔴 旧址 → 新址:【存在性该问哪一份文件】的改写表。**只改问哪份,不改答什么。**
   urlOf 回的仍然是旧址 URL —— 双活期里页面自己还挂在旧址上,新址那份由 1b 的复制块改写。

   为什么需要它:urlOf 拿【页面自己的路径】问"那个语种有没有这一页",而渲染旧址页时问的
   就是旧址。第 5b 步旧址一停产,这个问题的答案永远变成"没有" ⇒ 新址页上的 hreflang
   alternate 会**静默消失**(实测 312 → 190 条,regen rc=0、零报错)。alternate 少了不会 404,
   只会让互惠簇断掉 —— **没有任何东西会报错,而 Google 会整簇忽略。**

   ⚠️ 这一处是【第五处】。总工给的清单上只有四处存在性判据,我把那四处迁完、产出逐字节不变
   之后,在复刻树上真删一次旧址 —— 详情页从 68 救回 190,**而 alternate 仍是 190 不是 312**。
   > **是那个不变量把它揪出来的,不是我数得全。** 一份必须完整的清单,和一个必须成立的
   > 不变量,后者永远更强:它不依赖任何人枚举得干净。 */
const MOVED_ADDR = new Map();
const urlOf = (p, loc) => {
  const d = dirOf(loc);
  if (!d) return p;
  /* 🔴 迁移是【分语种】的。新址产出那一半的闸是 `if (!isExtra(locale))` —— zh 从来没有
     新址页,DESIGN.md §9.1 也定了 zh 不做产品详情页、第 5b 步不迁移不删。
     所以对 zh 必须仍然问旧址:**问一个永远不存在的文件,得到的"没有"是假的。**
     ⚠️ 我第一版没分语种,zh 首页当场坏给我看 —— 13 行:五张品类卡降级成 `/zh/products/#锚点`,
        机型链接掉了 `/zh` 前缀变成指向英文页。**逐字节对照就是为了抓这个。**
     这里刻意复用 isExtra 而不是另写判断:另写一条 = 两条会各自漂的规则。 */
  const moved = isExtra(loc) ? null : MOVED_ADDR.get(p);
  /* 🔴 产品形状的路径(/{分类}/{数字})在表填好【之前】被问,答案会是"没搬过" —— 那是一句
     谎话,而且它长得和真话一样。宁可当场炸:**面对未知,默认值要选那个会让你被打断的方向。** */
  if (!moved && MOVED_ADDR.size === 0 && /^\/[a-z0-9-]+\/\d+$/.test(p))
    throw new Error(`urlOf(${p}) 在旧址→新址表填好之前被调用 —— 存在性会问到旧址,而旧址第 5b 步就没了`);
  const file = moved ? `${d}/${moved}` : (p.endsWith("/") ? `${d}${p}index.html` : `${d}${p}.html`);
  return fs.existsSync(path.join(REPO, file)) ? `/${d}${p}` : p;
};

// Manifest entries drive related-generation, the admin list, AND list-page regen. They stay
// self-sufficient on purpose — publish-time regen reads only this, not all 64 product JSONs — so
// the localized title/excerpt has to live here too, or the admin Function would need 64 file
// reads to render one pt list page. title/excerpt stay English so the admin UI is untouched.
/* ── 卡片缩略图:存在就用,不存在回落原图 ──────────────────────────────────
   两类图两种存在性判断,因为 regen 是 Node:
   · `/static/`(本仓 40 张)→ **直接查磁盘**,不需要任何清单
   · R2(28 张,`im.key`)→ regen 看不见 R2,读 Admin 生成的清单 `data/r2-thumbs.json`
     ⚠️ 清单必须由【列举 R2 实际内容】生成,不是记录脚本"打算写什么" ——
        否则它记的是意图不是事实,而写失败的那张会被列进去,变成 404(总工 2026-07-28 定的约束)。
   ⚠️ 清单只为 R2 存在。**别把 /static/ 那 40 张也塞进去** —— 它们的存在性本来就查得到,
      多一份要维护的清单,就多一处会漂的地方。 */
const R2_THUMBS = fs.existsSync(path.join(REPO, "data", "r2-thumbs.json"))
  ? new Set(JSON.parse(fs.readFileSync(path.join(REPO, "data", "r2-thumbs.json"), "utf8")).keys || [])
  : new Set();
const thumbName = (s) => s.replace(/\.[^.\/]+$/, ".thumb.webp");
function thumbFor(im, imgBase) {
  const orig = resolveImg(im, imgBase);
  if (!orig) return "";
  if (im && im.key !== undefined) {                       // R2:查清单
    const tk = thumbName(im.key);
    return R2_THUMBS.has(tk) ? imgBase + tk : orig;
  }
  const t = thumbName(orig);                              // 静态:查磁盘
  return t !== orig && fs.existsSync(path.join(REPO, t.replace(/^\//, ""))) ? t : orig;
}

const entries = Object.values(prods).map((p) => {
  const e = { id: p.id, category: p.category, form: p.form, title: p.i18n.en.title,
    // 🔴 规范 URL 段。算一次存下来 —— 跳转层(Function)读它判断"来的 slug 规不规范",
    //    而不是自己再实现一遍派生规则。两处各算一遍 = 两套会分头漂的规则,
    //    症状是"规范 URL 自己 301 到自己"(重定向循环),极难查。
    //    ⚠️ 有 card_title 时用它(短名更适合做 URL),没有则从 en 标题派生 —— 当前 68 个全走派生。
    path: productPath(p.i18n.en.card_title || p.i18n.en.title, p.id),
    // 短名跟语言走,只在有值时才写进 manifest —— 没填的产品条目字节不变(68 个当前全没填)。
    ...(p.i18n.en.card_title ? { card_title: p.i18n.en.card_title } : {}),
    // 🔴 `thumb` 的语义是【卡片用的图】,不是"images[0] 原样"。
    //    此前它直接派生自 images[0],于是有两个写入方:Admin 把它改成缩略图,
    //    **下一次 regen 全量覆盖 manifest 时冲回原图,而且不报任何错** —— 收益在下次发版时静默蒸发。
    //    ⚠️ 也不能改 images[0] 让它自己派生出缩略图:images[0] 同时是【详情页大图】的来源,
    //       那样是"修好卡片、弄糊详情页"。
    //    → 规则改成【存在就用缩略图,不存在回落原图】:单一写入方(regen)、存在性驱动,
    //      不靠谁记得触发刷新;漏生成某张的代价是"那张慢",不是"那张 404"。
    thumb: thumbFor(p.images[0], cfg.img_base), excerpt: excerptOf(p) };
  for (const loc of LOCALES) {
    if (loc === DEFAULT) continue;
    const t = p.i18n[loc] && p.i18n[loc].title;
    const ct = p.i18n[loc] && p.i18n[loc].card_title;
    const x = excerptOf(p, loc);                                // derived, never stored by hand
    if (t || ct || x !== e.excerpt) (e.i18n ??= {})[loc] = { ...(t ? { title: t } : {}), ...(ct ? { card_title: ct } : {}), ...(x ? { excerpt: x } : {}) };
  }
  return e;
});

/* 详情页的旧址 → 新址。**必须在任何 urlOf 调用之前填**(第一个调用点在下面的详情循环里)。
   ⚠️ 对账写成断言而不是注释:漏一条的表现是"某个产品的 hreflang 簇少一门语种",
      而那既不报错也不 404 —— 只有这行会说话。 */
for (const e of entries) if (e.path) MOVED_ADDR.set(`/${e.category}/${e.id}`, `products/${e.path}.html`);
if (MOVED_ADDR.size !== entries.length)
  throw new Error(`旧址→新址表 ${MOVED_ADDR.size} 条 ≠ 产品 ${entries.length} 个 —— 有产品没有规范 path,存在性会问回旧址`);

const only = process.argv.slice(2).map(Number);
const targets = only.length ? only : Object.keys(prods).map(Number);

let written = 0, imbalanced = 0, dualWritten = 0;
for (const id of targets) {
  const prod = prods[id];
  if (!prod) { console.error("missing product", id); continue; }
  const entry = entries.find((e) => e.id === id);
  for (const locale of LOCALES) {
    const out = pageOf(locale, path.join(prod.category, `${id}.html`));
    const newRel = path.join("products", `${entry.path}.html`);
    const newOut = pageOf(locale, newRel);
    /* Only emit a locale's page where one already exists — regen renders content, it does not
       decide the site map. Creating pt pages that nothing links to is a different decision.

       🔴 这个"已经存在"过去问的是【旧址】。第 5b 步要删掉那 227 个旧址页,而删掉的那一刻
       这句话的答案就变了 —— regen 不会报错,它会**改变主意**:认为 es/pt 这些页本来就不该有,
       于是静默停产。实测(两棵复刻树,各跑一次 regen,都 rc=0、都完整收尾):
           /products/ 详情新址   190 页 → 68 页
           /products/{分类}/ 新址  37 页 → 0 页
           新址页上的 alternate   312 条 → 190 条
       > **闸全绿,而某个数字变成了 0。**
       所以判据必须锚在【新址】—— 它是这些页此后唯一的家。
       ⚠️ 双活期两套都在,锚哪边结果都一样 ⇒ 这次改动的正对照是【产出逐字节不变】。
          那个正对照的好处是:它不需要任何人描述"正确的产出应该长什么样"。 */
    if (locale !== DEFAULT && !fs.existsSync(newOut)) continue;
    const related = genRelated(entry, entries, locale, catalog, urlOf);
    const html = render(prod, { template: tpl, imgBase: cfg.img_base, related, locale, modelDisplay: MODEL, catalog, urlOf, enabled: LOCALES, catmap: CATMAP_DATA, sizes: MEDIA_SIZES });
    const opens = (html.match(/<div\b/g) || []).length;
    const closes = (html.match(/<\/div>/g) || []).length;
    if (opens !== closes) { imbalanced++; console.error(`  ⚠️ div imbalance ${locale} ${prod.category}/${id}: ${opens}/${closes}`); }
    fs.mkdirSync(path.dirname(out), { recursive: true });
    fs.writeFileSync(out, html);
    written++;

    /* ── /products/ 迁移 · 第 1b 步:新址【并存】产出,旧址一个字节不动 ──────────
       双活期两个 URL 返回同一份内容 = 重复内容。处理方式(总工 2026-07-28 拍 (a)):
       **新址带 noindex、且不进 sitemap**,第 5 步再摘掉。
       🔴 为什么不是"新址 canonical 指向旧址":那是靠两个 canonical 的【相对关系】去暗示
          "我还没准备好",而 noindex 的字面意思就是这个。**暗示需要被正确解读,声明不需要。**
       🔴 也不是两边 canonical 都自指:那等于两个 URL 互相声称自己是正主,
          **Google 会自己挑一个,而挑中哪个不受我们控制。**
       ⚠️ noindex 与"进 sitemap"是自相矛盾的信号(一边说别收、一边主动提交)——
          所以 sitemap 生成侧必须跳过新址,见 chrome-sync。
       ⚠️ canonical 保持【自指新址】:第 5 步只需摘 noindex,**不必翻转任何已有声明**。
          翻转是最容易漏一半的操作。 */
    // newRel / newOut 已在循环顶部算好(那里的存在性判据要用它)—— 不再各算一次。
    let dual = html.replace(/<link rel="canonical" href="[^"]*"/,
      `<link rel="canonical" href="https://wanew.com${dirOf(locale) ? "/" + dirOf(locale) : ""}/products/${entry.path}"`);
    dual = /<meta\s+name="robots"/i.test(dual) ? dual
      : dual.replace(/(<link rel="canonical")/, `<meta name="robots" content="noindex, follow" />\n$1`);
    // ⚠️ hreflang 也必须改写成新址簇 —— hreflang-verify 当场抓到了这一条。
    //    新址页是【复制旧址内容】来的,里面那组 alternate 仍然指着旧址:等于**新址在替旧址说话**,
    //    而旧址并不认它(hreflang 验的是互惠:A 说 B 是自己的某语种版本,B 也要说回来)。
    //    ⚠️ 存在性规则照旧:某语种没有这个产品页,就不发它的 alternate —— 发了就是声明一个 404。
    //    🔴 只改 `<link rel="alternate">`,**绝不能只锚 `hreflang="xx" href="`** ——
    //       语言切换器的 `<a>` 上是【同样的属性组合】(`href` + `class` + `hreflang`),
    //       宽正则会把切换器一起改掉:切换器该指"本页的其它语种版本"(旧址簇,因为用户当前在旧址体系),
    //       被改成新址后就变成了跨体系跳转。**产出看起来完全正常,链接也 200。**
    //       是"差异恰好三处"那条对账把它揪出来的:第四类差异 720 处全是切换器。
    dual = dual.replace(/<link rel="alternate"[^>]*>/g, (tag) => {
      const m = /hreflang="([^"]+)"/.exec(tag);
      if (!m) return tag;
      const alt = m[1];
      if (alt === "x-default")
        return tag.replace(/href="[^"]*"/, `href="https://wanew.com/products/${entry.path}"`);
      if (!LOCALES.includes(alt)) return tag;
      // 🔴 存在性同样锚【新址】:旧址删掉后,这句若还问旧址,新页会静默少发 alternate ——
      //    实测 312 → 190 条,而 regen rc=0、零报错。alternate 少了不会 404,只会让互惠断掉。
      if (!fs.existsSync(pageOf(alt, newRel))) return tag;
      const d = dirOf(alt) ? `/${dirOf(alt)}` : "";
      return tag.replace(/href="[^"]*"/, `href="https://wanew.com${d}/products/${entry.path}"`);
    });
    fs.mkdirSync(path.dirname(newOut), { recursive: true });
    fs.writeFileSync(newOut, dual);
    dualWritten++;
  }
}
console.log(`regen: wrote ${written} pages (${LOCALES.join("+")}) | div-imbalanced ${imbalanced}`);
console.log(`  /products/ 新址并存(noindex,不进 sitemap): ${dualWritten} 页`);
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
// 形态页标题用的 catalog 键(与 nav 标签同一份,不另存一份英文字面量)。
const TYPE_TITLE_KEY = { cables: "header.cables", mounts: "header.mounts",
  power: "header.power_charging", networking: "header.networking", cases: "header.cases_protection" };
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
  // <title> 走 catalog key 而不是英文字面量:否则新建的 es/pt 形态页会顶着英文标题。
  // 已逐条核对 header.* 的 en 值与原字面量【逐字相同】,所以 en 输出零变化,只是 es/pt 拿到真译文。
  ...TYPES.map(([s]) => [`type/${s}/index.html`, { form: FORMS.find((x) => x.key === s).name }, { t: TYPE_TITLE_KEY[s] }]),
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
const isFormEntry = (c) => !!(c && typeof c === "object" && !Array.isArray(c) && c.form);
const modelSeedRel = (loc, targetCat) => {
  const s = CATS.find((c) => c !== targetCat && fs.existsSync(pageOf(loc, `${c}/index.html`)));
  return s ? `${s}/index.html` : null;   // 该 locale 里第一个【非目标】现存模型页做种;无则该 locale 建不了(回落跳过)
};
// ⚠️ 两阶段,顺序不能反 —— 建页与【按存在性派生 hreflang】必须分开:
// localizeSeoListHead 是靠"该语种的页在不在"决定发不发那条 alternate 的。如果建页和派生在同一遍里
// 交错进行,先被处理的语种(en)派生时,后面的语种(es/pt)页还没建出来 → 它就少发几条 alternate,
// 要再跑一遍 regen 才补齐。实测过:第一遍 en 只拿到 en+x-default,第二遍才补上 es-MX/pt-BR。
// 与其留一条"记得跑两遍"的规矩(总有人不记得),不如让顺序不再重要:
//   阶段①把这个 rel 的各语种缺页【全部】建出来 → 阶段②再统一 regen + 派生 head。
// hreflang 只依赖【同一个 rel 的其它语种】,所以按 rel 分两阶段就足够,不需要全站两遍。
/* 已知分类清单 = 三个已有真源的并集。**必须算在列表页循环之前** —— 它是循环的输入
   (第 1c 用它决定哪些页要产新址),放在循环之后就是"拿还没算出来的东西做判断"。
   ⚠️ 下面写 data/product-routes.json 时复用【同一个集合】,不许各算各的:
      各算各的会漂,而漂的表现是"页在那儿但路由不认"或"路由指向 404"。 */
const KNOWN_ROUTES = new Set([
  ...CATS,
  ...FORMS.map((f) => f.key),
  ...AGGREGATES.map(([r]) => r.replace(/\/index\.html$/, "")),
]);
/* 列表页的旧址 → 新址,补进同一张表(详情页那半在上面,产品循环之前就填好了)。
   品类走 /type/{key}/,机型与聚合页走 /{slug}/ —— 与 LIST_PAGES 用的是同一条规则,
   ⚠️ 但这里是【反着写一遍】。所以下面用 KNOWN_ROUTES 的大小对账:两边条数必须相等,
      不然就是有一类路由没被登记,而它的表现同样是"hreflang 静默少一门语种"。 */
const FORM_KEYS = new Set(FORMS.map((f) => f.key));
let listMoved = 0;
for (const slug of KNOWN_ROUTES) {
  MOVED_ADDR.set(`/${FORM_KEYS.has(slug) ? "type/" : ""}${slug}/`, `products/${slug}/index.html`);
  listMoved++;
}
if (listMoved !== KNOWN_ROUTES.size)
  throw new Error(`列表页旧址→新址 ${listMoved} 条 ≠ 已知路由 ${KNOWN_ROUTES.size} 个`);
let dualLists = 0;
for (const [rel, cat, name, bannerModel] of LIST_PAGES) {
 // ── 阶段①:只建缺页,不产出任何 head ──
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
    } else if (isFormEntry(cat)) {
      // 🔴 #69 审计挖出来的:/type/ 5 页在 en 有、连内部 zh 都有(zh 走上面 isExtra 分支从 en 播种),
      //    **唯独 es/pt 没有** —— 因为形态页的 cat 是 {form:…} 对象,既不是 isExtra 也不是模型 entry,
      //    一路掉到这个 else 里 continue 掉了。生产实测 /es/type/cables/ 与 /pt/type/cables/ 都是 404。
      //    结果是:两个【真正做 SEO 的语种】反而是唯一没有"按形态浏览"这条轴的。
      //    这不是翻译工程 —— 卡片网格由 regenListPage 重建、标题/筛选栏标签 catalog 里早有 es/pt 值。
      //    所以和 zh 一样从默认语种播种即可,下面三步本地化 + localizeSeoListHead 注入自指 canonical
      //    与互惠 hreflang 簇(SEO 语种走这条,不是 zh 那条 noindex 分支)。
      const seed = pageOf(DEFAULT, rel);
      if (!fs.existsSync(seed)) continue;   // en 自己都还没建 → 本轮跳过,下轮补
      fs.mkdirSync(path.dirname(p), { recursive: true });
      fs.copyFileSync(seed, p);
    } else {
      continue;   // 其余固定列表页(products/aggregate):缺页不自动建(站点地图是另一个决定,原契约)
    }
  }
 }
 // ── 阶段②:此时该 rel 的各语种页都已存在,派生出来的 hreflang 才是完整互惠的 ──
 for (const locale of RENDER_SET) {
  const p = pageOf(locale, rel);
  if (!fs.existsSync(p)) continue;          // 阶段①决定不建的(如 products/aggregate 缺页)
  const h0 = fs.readFileSync(p, "utf8");
  let h1 = regenListPage(h0, manifest, cat, { locale, catalog, urlOf, formKey: FORM_KEY, sizes: MEDIA_SIZES });
  h1 = setListTitle(h1, name, locale, catalog);
  // setListLabels 现在也本地化形态 chip 类目名(header.* 键在 chrome.json=catalog)+ All(list.* 键在 listCat)
  // —— 两个 catalog 合并传入(键空间不重叠:header.* vs list.*)。
  // 形态页的 banner 走另一条模式(见 setListLabels 的 formKey 分支)。取哪个 key 由 rel 反查
  // TYPE_TITLE_KEY —— 它已经是 <title> 用的那一份,H1 和 <title> 从此同源,不会各翻各的。
  const formSlug = /^type\/([^/]+)\//.exec(rel)?.[1];
  h1 = setListLabels(h1, { locale, catalog: { ...catalog, ...listCat }, model: bannerModel,
    formKey: formSlug ? TYPE_TITLE_KEY[formSlug] : undefined });
  if (isExtra(locale)) h1 = localizeInternalHead(h1, rel, locale);   // zh list 页:head 本地化+noindex+零 hreflang
  else h1 = localizeSeoListHead(h1, rel, locale);                     // en/es/pt list 页:派生+注入互惠 hreflang 簇
  if (h1 !== h0) { fs.writeFileSync(p, h1); lists++; }

  /* ── 第 1c:分类页的新址并存产出 ────────────────────────────────────────
     第 1b 只产了【详情页】新址 —— 我当时把"新址产出"当成一件事,实际它有两半。
     缺这半的后果不是报错,是 `/products/{分类}/` 在生产上 404,
     而那个 404 长得和"路由判错"一模一样(第 4 步生产实测时正是这么撞上的)。
     ⚠️ 与详情页同样的三处改写:canonical 自指新址 · noindex · hreflang 自成新址簇;
        其余一个字节不动 —— "差异恰好三类"那条对账同样适用于这一半。
     ⚠️ zh 不产:它是内部语种、本来就不进 sitemap,多一份副本只是多一份要维护的东西。 */
  if (!isExtra(locale)) {
    const catSlug = /^type\/([^/]+)\//.exec(rel)?.[1] || rel.replace(/\/index\.html$/, "");
    if (catSlug && KNOWN_ROUTES.has(catSlug)) {
      const nOut = pageOf(locale, path.join("products", catSlug, "index.html"));
      const d = dirOf(locale) ? `/${dirOf(locale)}` : "";
      let dual = h1.replace(/<link rel="canonical" href="[^"]*"/,
        `<link rel="canonical" href="https://wanew.com${d}/products/${catSlug}/"`);
      dual = /<meta\s+name="robots"/i.test(dual) ? dual
        : dual.replace(/(<link rel="canonical")/, `<meta name="robots" content="noindex, follow" />\n$1`);
      dual = dual.replace(/<link rel="alternate"[^>]*>/g, (tag) => {
        const mm = /hreflang="([^"]+)"/.exec(tag);
        if (!mm) return tag;
        if (mm[1] === "x-default")
          return tag.replace(/href="[^"]*"/, `href="https://wanew.com/products/${catSlug}/"`);
        if (!LOCALES.includes(mm[1])) return tag;
        // 存在性规则:没有就不发 alternate。🔴 锚【新址】,理由同详情页那处 ——
        // 旧址一删,这句若还问 rel(旧址),分类新页的 alternate 会静默消失。
        if (!fs.existsSync(pageOf(mm[1], path.join("products", catSlug, "index.html")))) return tag;
        const dd = dirOf(mm[1]) ? `/${dirOf(mm[1])}` : "";
        return tag.replace(/href="[^"]*"/, `href="https://wanew.com${dd}/products/${catSlug}/"`);
      });
      fs.mkdirSync(path.dirname(nOut), { recursive: true });
      fs.writeFileSync(nOut, dual);
      dualLists++;
    }
  }
 }
}
console.log(`list pages regenerated: ${lists} changed`);
console.log(`  /products/{分类}/ 新址并存(noindex,不进 sitemap): ${dualLists} 页`);

/* ── /products/ 路由的已知分类清单 → 落成数据文件,供跳转层(Pages Function)读 ──────
   🔴 判据 = 三个【已有真源】的并集,没有新清单要维护:
      `categories.json` 的 slug(机型)∪ `forms.json` 的 key(品类)∪ `AGGREGATES` 声明的聚合页。
   为什么不是"扫产出目录":两次都试过,两次都带出偏差 ——
      ·「有 index.html」→ 把 `admin` / `starlink-compatible-accessories` 算了进来
      ·「目录下有 \d+.html」→ `video/39.html` 混进来(文件名恰好是数字),
        而 `performance-gen-2` 反而漏掉(**聚合页自己没有产品**)。
      再往上加排除/承认逻辑,就是特判的另一种写法。

   🔴 为什么由 regen 写、而不是 Function 自己拼这三份:
      `AGGREGATES` 声明在【构建脚本】里,运行时不该 import 构建脚本;
      更要紧的是 —— **这份清单由"产出这批页面的那一次运行"生成,所以它不可能和实际产出漂移。**
      若 Function 自己去拼,它拼的是"此刻的三个文件",而页面是"上次构建时的三个文件",
      两者之间那个窗口里的不一致,会表现为 404 或错误路由。 */
{
  // 与第 1c 判定"哪些页要产新址"用的是【同一个集合】—— 各算各的就会漂:
  // 一边产了页、另一边没把它列进路由表,表现为"页在那儿但路由不认",反之则是路由指向 404。
  const known = [...KNOWN_ROUTES].sort();
  const p = path.join(REPO, "data", "product-routes.json");
  const body = JSON.stringify({
    _note: "「/products/{x}/ 是不是分类页」的判据。x 命中这张表 = 分类页,否则按末尾 -{数字} 解析成产品。" +
      "由 regen 在产出页面的同一次运行里生成 —— 与实际产出同源,不会漂移。别手改。",
    _generated_by: "scripts/regen.mjs",
    categories: known,
  }, null, 2) + "\n";
  if (!fs.existsSync(p) || fs.readFileSync(p, "utf8") !== body) fs.writeFileSync(p, body);
  console.log(`product-routes: ${known.length} 个已知分类 slug -> data/product-routes.json`);
}

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
const HERO_HOME_IMG = "/static/upload/image/20260725/hero-home-v3b.webp";   // ⬅ 换首页 hero 只改这一行
const homeTiles = JSON.parse(webpInline(fs.readFileSync(path.join(REPO, "data", "pages", "home-tiles.json"), "utf8")));
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
  // 首页 hero 图 = 一个常量,模板里 preload 与 background 共用同一个 token。
  // ⚠️ 换图只改这一行:两处分开写时,改一处漏一处 → preload 预载 A、实际显示 B,静默多下一张图。
  // 现值是那张越野图【占位】(Joe 的新图未到);图一到只换这一行。
  const h1 = renderHome(homeTpl.split("{{HERO_HOME_IMG}}").join(HERO_HOME_IMG), { locale, catalog: { ...catalog, ...shared, ...homeCat },
    formOrder: FORMS,   // data/forms.json 的数组序 = 形态次序(/type 页与 chip 同源);见 pickHomeProducts
    tiles: homeTiles, modelDisplay: MODEL, urlOf, exists: pageExists, dirOf, enabled: LOCALES, sizes: MEDIA_SIZES,
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
  // ⚠️ rv 用那张越野车图(原首页 hero):Joe 早定的「生活场景图归 Solutions 子页」。
  // 首页目前也还引着它作占位,等 Joe 新图到位后首页换图、这里不动。
  const SOL_HERO = { home: "scene-home-rooftop", rv: "hero-home-v3b", marine: "scene-marine", "off-grid": "scene-offgrid", portable: "scene-portable", business: "scene-business-mine" };
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
  const deepTpl = fs.readFileSync(path.join(REPO, "data", "templates", "solutions-deep.html"), "utf8");
  // The thin generic band (Recommended chips + generic CTA) lives in its own partial so a deep
  // scene can drop it: its kit + scene CTA supersede it, and keeping both puts two CTAs on a page.
  // Scenes NOT in DEEP still get that markup back verbatim, byte-identical to before.
  const solGenericTpl = fs.readFileSync(path.join(REPO, "data", "templates", "solutions-scene-generic.html"), "utf8").replace(/\r/g, "").replace(/\n$/, "");
  // Guide card titles come from the guides manifest, not a second copy here — retitling an article
  // must not need an edit in two places.
  const guidesManifest = JSON.parse(fs.readFileSync(path.join(REPO, "data", "pages", "guides-manifest.json"), "utf8")).articles;
  const guideTitle = (slug) => {
    const a = guidesManifest.find((x) => x.slug === slug);
    if (!a) throw new Error(`solutions: guide slug not in manifest: ${slug}`);
    return a.card_title || a.title;
  };
  // Per-scene deep content wiring. kit = real catalogue products (verified present); guides = real
  // retagged articles. 🔴 Each card's spec tag restates ONLY what that product's own listing says,
  // and cards are icon+text with NO product photos — the catalogue still holds scraped listing
  // images with old-brand pixel residue (the 4209 class).
  const DEEP = {
    marine: {
      kit: [[1, "performance-gen-3", 4202, "mount"], [2, "mini", 691, "mount"], [3, "mini", 689, "mount"],
            [4, "mini", 4206, "cable"], [5, "mini", 4205, "power"], [6, "performance-gen-3", 697, "cable"]],
      sysIcons: ["mount", "shield", "cable", "power"],
      guides: ["starlink-marine-installation-step-by-step-boat-satellite",
               "special-mounts-starlink-marine-accessories-complete-guide-stable",
               "complete-starlink-marine-cable-management-best-solutions-routing",
               "starlink-marine-accessories-guide-marine-grade-connectors",
               "starlink-marine-maintenance-5-essential-tips-reliable-satellite"],
    },
    home: {
      kit: [[1, "mini", 4208, "mount"], [2, "mini", 691, "mount"], [3, "standard", 662, "mount"], [4, "standard-circular", 655, "cable"]],
      sysIcons: ["mount", "cable", "shield", "power"],
      guides: ["flat-roof-mounting-solutions-starlink-terminals-complete-guide",
               "starlink-wall-mount-roof-mount-pros-cons-home",
               "install-starlink-mount-without-drilling-non-permanent-solutions",
               "starlink-junction-box-installation-outdoor-cable-management"],
    },
    rv: {
      kit: [[1, "mini", 681, "mount"], [2, "mini", 689, "mount"], [3, "mini", 4205, "power"], [4, "mini", 4206, "cable"]],
      sysIcons: ["mount", "power", "cable", "shield"],
      guides: ["essential-starlink-rv-accessories-full-time-rvers-setup",
               "complete-guide-starlink-rv-12v-accessories-compatibility",
               "best-starlink-mini-cable-management-rv-roof-mounts",
               "starlink-mini-pipe-mount-installation-guide-step-by"],
    },
    "off-grid": {
      kit: [[1, "mini", 4201, "power"], [2, "mini", 4210, "power"], [3, "mini", 4204, "power"], [4, "mini", 690, "mount"]],
      sysIcons: ["power", "cable", "mount", "shield"],
      guides: ["power-starlink-mini-solar-panels-complete-12v-dc",
               "wanew-starlink-mini-power-guide-12v-adapters-dc",
               "starlink-compatible-power-adapters-buyer-guide-12v-dc",
               "winterizing-starlink-mini-cold-weather-accessories-guide"],
    },
    portable: {
      kit: [[1, "mini", 694, "case"], [2, "mini", 695, "case"], [3, "mini", 684, "mount"], [4, "mini", 4201, "power"]],
      sysIcons: ["case", "mount", "power", "shield"],
      guides: ["set-up-starlink-mini-rv-camping-complete-guide",
               "best-starlink-mini-accessories-rv-off-grid-use",
               "starlink-mini-standard-which-mounting-kit-do-need",
               "install-starlink-mount-without-drilling-non-permanent-solutions"],
    },
    business: {
      kit: [[1, "standard", 661, "net"], [2, "mini", 4199, "net"], [3, "standard", 674, "mount"], [4, "enterprise", 650, "cable"]],
      sysIcons: ["net", "mount", "cable", "shield"],
      guides: ["oem-starlink-compatible-accessories-what-buyers-should-verify",
               "bulk-ordering-guide-moq-lead-time-pricing-starlink-mounts",
               "custom-starlink-accessory-manufacturing-prototype-to-production",
               "quality-control-standards-starlink-compatible-accessories"],
    },
  };
  const esc = (s) => String(s).replace(/&(?!(?:amp|lt|gt|quot|#\d+);)/g, "&amp;");
  // Chips for the thin generic band — only reached by a scene NOT in DEEP. All six are deep today,
  // so this is the fallback path for a future scene, kept working rather than deleted.
  // [labelKey | null, url, icon, literalLabel?] — literal for proper-noun models (Mini/Enterprise)
  const SOL_RECS = {
    home: [["header.mounts", "/products/#mounts", "mount"], ["header.cables", "/products/#cables", "cable"]],
    rv: [["header.mounts", "/products/#mounts", "mount"], ["header.power_charging", "/products/#power", "power"], [null, "/mini/", "mini", "Starlink Mini"]],
    marine: [["header.mounts", "/products/#mounts", "mount"], ["header.cables", "/products/#cables", "cable"]],
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
      // Per-scene text is aliased onto fixed {{t.sol.*}} tokens so ONE partial serves every scene.
      const alias = (suffix) => solCat[`solutions.${sc}.${suffix}`];
      const sceneCat = { ...baseCat, "sol.eyebrow": alias("eyebrow"), "sol.h1": alias("h1"), "sol.intro": alias("intro") };
      const deep = DEEP[sc];
      let sceneBlocks = "";
      if (deep) {
        for (const k of ["pain.h2", "sys.h2", "recs.h2", "cta.h2", "cta.d",
                         ...[1, 2, 3, 4].flatMap((i) => [`pain.${i}.t`, `pain.${i}.d`, `sys.${i}.t`, `sys.${i}.d`])]) {
          sceneCat[`sol.${k}`] = alias(k);
        }
        const kit = deep.kit.map(([, cat, id, ic]) => {
          // Card copy is keyed by PRODUCT id, not by scene slot: the same product shown in two
          // scenes must not carry two descriptions that can drift apart.
          const nm = pick(solCat[`solutions.kit.${id}.n`], locale);
          const spec = pick(solCat[`solutions.kit.${id}.s`], locale);
          return `        <a class="sol-deep-kit__c" href="${urlOf(`/${cat}/${id}`, locale)}">\n`
            + `          <span class="sol-deep-kit__ic" aria-hidden="true">${ICON[ic]}</span>\n`
            + `          <h3 class="sol-deep-kit__t">${esc(nm)}</h3>\n`
            + `          <p class="sol-deep-kit__s">${esc(spec)}</p>\n`
            + `          <span class="sol-deep-kit__arw" aria-hidden="true">→</span>\n        </a>`;
        }).join("\n");
        // Guide articles are EN-only today, so a localized page carries the same honest "in English"
        // badge the Guides cards use (card.lang_badge) rather than pretending they are translated.
        const badge = locale === DEFAULT ? "" : ` <span class="sol-deep-guides__b">${esc(pick(baseCat["card.lang_badge"], locale))}</span>`;
        const guides = deep.guides.map((slug) =>
          `        <a class="sol-deep-guides__l" href="${urlOf(`/guides/${slug}/`, locale)}"><span>${esc(guideTitle(slug))}${badge}</span><span class="sol-deep-guides__arw" aria-hidden="true">→</span></a>`
        ).join("\n");
        const [i1, i2, i3, i4] = deep.sysIcons;
        sceneBlocks = deepTpl
          .split("{{DEEP_KIT}}").join(kit)
          .split("{{DEEP_GUIDES}}").join(guides)
          .split("{{ICON_MOUNT}}").join(ICON[i1]).split("{{ICON_SHIELD}}").join(ICON[i2])
          .split("{{ICON_CABLE}}").join(ICON[i3]).split("{{ICON_POWER}}").join(ICON[i4]);
      }
      const tpl2 = solSceneTpl
        .split("{{SCENE_HERO}}").join(`/static/upload/image/20260725/${SOL_HERO[sc]}.webp`)
        .split("{{SCENE_GENERIC}}").join(deep ? "" : solGenericTpl)
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
    if (fs.existsSync(cache)) return prepMedia(fs.readFileSync(cache, "utf8"));   // #81/#66: 收 .webp + 补 lazy/尺寸
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
    // FAQ 与 5 轴在这条上平级(Joe 2026-07-28 第二次用实际使用推翻我们的分组判断)。
    // 它【不】进 navTopics:那是"有文章的任务轴"集合,混进去 builder 会去建它的列表页,
    // 而 /guides/faq/ 归 page-* loop 所有。所以单独挂一条,current==="faq" 时 active。
    const faq = `<a class="guides-chip${current === "faq" ? " is-active" : ""}" href="${urlOf("/guides/faq/", loc)}">${pick(catalog["header.faq"], loc)}</a>`;
    // OEM 同理单独挂(总工 2026-07-28)。窟窿不是"没人链",是"只有已经在里面的人才链得到":
    // 除 footer 外只有那 7 篇 OEM 文章自己的尾部 CTA 回链,新访客进不去;
    // 其中 4 篇实测【只有 /guides/oem/ 一条入口】。标签用 footer 里既有的 header.guides_oem,不新造说法。
    const oem = `<a class="guides-chip${current === "oem" ? " is-active" : ""}" href="${urlOf("/guides/oem/", loc)}">${pick(catalog["header.guides_oem"], loc)}</a>`;
    return `      <nav class="guides-nav" aria-label="${esc(pick(gCat["guides.nav.aria"], loc))}">${all}${tops}${faq}${oem}</nav>`;
  };
  /* ── 场景横切带(总工 #85):按【任务】的 5 轴是唯一浏览逻辑(Joe §3.2e 铁令,不动);
   *    但有一类读者是从"我的设备装在哪"进来的。给他们一条【横切】入口。
   *
   * ⭐ 关键设计判断,写清楚免得以后被当成回退:
   *   ① **不新建 /guides/{场景}/ 页** —— 那会同时踩两条:(a) 变成第二套 Guides 浏览轴,
   *      正是 Joe 杀掉的"2 套浏览系统";(b) /guides/marine/ 等在 IA v2 已退役并 301 到
   *      /guides/,重建会和线上 301 打架。
   *   ② 这条带指向 /solutions/{场景}/ 页 —— 它们本来就是场景 SEO 落地页(7 块内容),
   *      (注:这行别写成 markdown 粗体包路径,`**` 紧跟 `/` 会把块注释提前闭合 —— 我刚踩过)
   *      而且它们的"怎么装起来"已经反向链回该场景的指南。于是形成真闭环:
   *      Guides 首页 → 场景页 → 该场景指南 → Guides 首页。
   *   ③ 篇数从 manifest 的 `old`(原 hub 路径)派生 = 真实数据,不是手写数字,不会漂。
   *   ④ 只出现在 Guides 首页;topic 页拿到 "" → 那些页字节不变。nav 一个字没动。 */
  const sceneHub = (a) => (String(a.old || "").match(/^\/([a-z-]+)\//) || [])[1];
  const SCENE_BAND = [
    { key: "marine", hub: "marine", to: "/solutions/marine/", nameKey: "solutions.marine.name" },
    { key: "rv", hub: "rv-off-grid", to: "/solutions/rv/", nameKey: "solutions.rv.name" },
  ];
  const solCatForScenes = JSON.parse(fs.readFileSync(path.join(REPO, "data", "pages", "solutions.json"), "utf8"));
  const scenesBand = (loc) => {
    const items = SCENE_BAND.map((sc) => {
      const n = built.filter((a) => sceneHub(a) === sc.hub).length;
      if (!n) return null;                       // 没文章就不出这一格,不做空壳
      const name = pick(solCatForScenes[sc.nameKey], loc);
      const blurb = pick(solCatForScenes[`solutions.${sc.key}.card`], loc);
      return `        <a class="guides-scene" href="${urlOf(sc.to, loc)}">`
        + `<span class="guides-scene__n">${n} ${esc(pick(gCat["guides.scenes.count"], loc))}</span>`
        + `<span class="guides-scene__t">${esc(name)}</span>`
        + `<span class="guides-scene__d">${esc(blurb)}</span>`
        + `<span class="guides-scene__arw" aria-hidden="true">→</span></a>`;
    }).filter(Boolean);
    if (!items.length) return "";
    return `      <section class="guides-scenes">\n`
      + `        <h2 class="guides-scenes__h">${esc(pick(gCat["guides.scenes.h2"], loc))}</h2>\n`
      + `        <p class="guides-scenes__sub">${esc(pick(gCat["guides.scenes.sub"], loc))}</p>\n`
      + `        <div class="guides-scenes__grid">
${items.join("\n")}
        </div>\n      </section>`;
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
        .split("{{GL_FILTER}}").join(navChips(locale, "all")).split("{{GL_SCENES}}").join(scenesBand(locale)).split("{{GL_CARDS}}").join(cards);
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
        .split("{{GL_FILTER}}").join(navChips(locale, t)).split("{{GL_SCENES}}").join("").split("{{GL_CARDS}}").join(cards);
      const p = pageOf(locale, path.join("guides", t, "index.html"));
      const html = renderPage(tpl2, { locale, catalog: baseCat, urlOf, path: `/guides/${t}/`, dirOf, enabled: LOCALES, internal_noindex: INTERNAL });
      fs.mkdirSync(path.dirname(p), { recursive: true });
      if (!fs.existsSync(p) || fs.readFileSync(p, "utf8") !== html) { fs.writeFileSync(p, html); gPages++; }
    }
    /* ⭐ IA 一致性(Joe 2026-07-27 亲自提的不一致):/guides/ 下每一页都该有同一条 chip 筛选条。
     *   compat/faq 由 page-* loop 建,而 navChips 是本 builder 的闭包(依赖 built/navTopics),
     *   所以和 _cards- 走同一套缓存交接 —— 不为它们新造第二条通路(那才是 §3.2e 杀掉的"两套")。
     *   faq 传的 current 不匹配任何 chip → 整条无 is-active。这是总工 ③「筛选条里不放 FAQ chip」
     *   的直接后果:FAQ 不是 5 条任务轴之一,这条 chip 条在 FAQ 上是【出口】不是【当前位置】。 */
    fs.mkdirSync(bodyDir, { recursive: true });
    for (const [slug, cur] of [["compatibility", "compatibility"], ["faq", "faq"]])
      fs.writeFileSync(path.join(bodyDir, `_filter-${slug}-${locale}.html`), navChips(locale, cur));
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
    for (const [token, prefix] of [["{{GUIDES_TOPIC_CARDS}}", "_cards"], ["{{GUIDES_FILTER}}", "_filter"]]) {
      if (!ptpl2.includes(token)) continue;
      const cf = path.join(REPO, "data", "guides-body", `${prefix}-${slug}-${locale}.html`);
      ptpl2 = ptpl2.split(token).join(fs.existsSync(cf) ? fs.readFileSync(cf, "utf8") : "");
    }
    const h1 = renderPage(ptpl2, { locale, catalog: { ...catalog, ...shared, ...pcat }, urlOf, path: `/${route}/`, dirOf, enabled: LOCALES, internal_noindex: INTERNAL, config: contactCfg });
    if (h1 !== h0) { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, h1); pages++; }
  }
}
console.log(`templated pages: ${pages} regenerated (data/templates/page-*.html)`);
