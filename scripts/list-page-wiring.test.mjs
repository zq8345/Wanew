// 列表页接线的两条【静默故障】判据。
//
// 🔴 为什么单独立一个文件:这两处的失败模式都【不报错】——
//    ① 形态页的 banner 由 `/^type\/([^/]+)\//.exec(rel)` 从 rel 反查形态 slug。
//       rel 一改(第 5 步把列表页搬到 /products/ 下),这个正则当场失配,
//       **formSlug 变 undefined,页面走机型分支** —— 构建全绿,只是 5 个形态页的标题错了。
//    ② 首页的机型 tile 按【页存不存在】过滤:页搬家了而 home-tiles 还指向旧址,
//       **tile 不会报错,它会一个不剩地消失** —— 首页少一整块,构建全绿。
//
//    > **"少了一个东西"这类故障,没有专门的判据就永远发现不了。**
//    今天已经栽过三次同形的:overflow scan 查一个不存在的 `main` 选择器(扫空集还报 80/80 绿)、
//    `--json` 少一个字段、以及那个从 BuildFailure 里读出来的数。
//
// 🔴 判据是【结构性】的,不复刻"正确答案应该是什么":
//    不问"形态页的 h1 该是哪个字符串"(那要把 regen 的 TYPE_TITLE_KEY 抄一遍,
//    抄错了两边一起错、一起绿),只问"**它们必须彼此不同、且与机型页无交集**"。
//    同理 tile 不问"该有几个",只问"**必须等于该语种下真实可用的条数,且不为零**"。
//    这样第 5 步把页面搬到 /products/ 之后,这两条判据【原样成立】,不需要跟着改。
import test from "node:test";
import assert from "node:assert/strict";
import fs from "fs";

const FORMS = JSON.parse(fs.readFileSync("data/forms.json", "utf8")).forms.map((f) => f.key);
const CATS = JSON.parse(fs.readFileSync("data/categories.json", "utf8")).categories.map((c) => c.slug);
const TILES = JSON.parse(fs.readFileSync("data/pages/home-tiles.json", "utf8"));
const LOC_DIRS = ["", "es", "pt", "zh"];

// 页可能在旧址(type/{k}/ · {cat}/)或新址(products/{k}/)—— 找到哪个验哪个。
// ⚠️ 这不是"两边都接受所以永远绿":下面 ① 要求【全部 5 个】都找得到,一个都不许缺。
const findPage = (dir, slug, isForm) => {
  const cands = isForm
    ? [`${dir}type/${slug}/index.html`, `${dir}products/${slug}/index.html`]
    : [`${dir}${slug}/index.html`, `${dir}products/${slug}/index.html`];
  return cands.find((p) => fs.existsSync(p)) || null;
};
const h1Of = (p) => (/<h1[^>]*>([^<]*)<\/h1>/.exec(fs.readFileSync(p, "utf8")) || [])[1]?.trim() || "";

test("列表页接线", () => {
  let pass = 0;
  const ok = (c, label) => { assert.ok(c, label); pass++; };

  // ── ① 形态页的 banner 没有掉进机型分支 ───────────────────────────────────
  const formH1 = new Map(), modelH1 = new Map();
  for (const k of FORMS) {
    const p = findPage("", k, true);
    ok(p, `① 形态页 ${k} 必须存在(旧址或新址)`);
    if (p) formH1.set(k, h1Of(p));
  }
  for (const c of CATS) {
    const p = findPage("", c, false);
    if (p) modelH1.set(c, h1Of(p));
  }
  ok(formH1.size === FORMS.length, `① ${FORMS.length} 个形态页全找到`);
  for (const [k, h] of formH1) ok(h.length > 0, `① 形态页 ${k} 的 h1 不为空`);
  // 🔴 核心:formSlug 反查一旦失效,这些页会走同一个分支 —— 表现就是 h1 撞车。
  ok(new Set(formH1.values()).size === formH1.size,
    `① 5 个形态页的 h1 必须两两不同(现有 ${new Set(formH1.values()).size} 个不同值)`);
  const clash = [...formH1.entries()].filter(([, h]) => [...modelH1.values()].includes(h));
  ok(clash.length === 0,
    `① 形态页 h1 不许与任何机型页 h1 相同${clash.length ? `(撞了:${clash.map(([k]) => k).join(",")})` : ""}`);

  // ── ①b 🔴 列表页 canonical 必须【自指】——— 这才是 rel 真正驱动的东西 ────────
  /* ⚠️ 这条是实测逼出来的,过程值得记:我原本以为 (i) 的静默风险在 `formSlug`
     (`/^type\/([^/]+)\//.exec(rel)`)—— 地址一搬,正则失配,形态页标题就悄悄错了。
     我把那个假设写进了闸①,还报给了总工,他也认了。
     **然后我把那个正则真的改成匹配不上、重跑整条流水线 —— 产出零字节变化,闸①纹丝不动。**
     原因:形态页的 h1/title 来自 LIST_PAGES 的 `name`(`{t: TYPE_TITLE_KEY[s]}`),
     那一项**从 TYPES 直接构造,根本不经过 rel 反查**;formSlug 只喂 setListLabels 的
     formKey,而它在当前数据下产出与默认值相同。
     > **一道照着错误因果建起来的闸,会一直是绿的 —— 而它绿得毫无意义。**
     > **"我以为它防住了 X"和"它真的会因为 X 而红",中间隔着一次真实副作用实验。**
     真正吃 rel 的是 `localizeSeoListHead(h1, rel, locale)` / `localizeInternalHead` ——
     它们拿 rel 算 canonical 与 hreflang。所以判据盯这里,而且仍是结构性的:
     **不问 canonical 应该是哪个字符串,只问它是不是指向页面自己。**
     (i) 把页搬到 /products/ 之后,这条原样成立 —— 自指就是自指。 */
  const canonOf = (p) => (/<link rel="canonical" href="([^"]*)"/.exec(fs.readFileSync(p, "utf8")) || [])[1] || "";
  let canonChecked = 0;
  for (const d of LOC_DIRS) {
    const dir = d ? `${d}/` : "";
    for (const [slug, isForm] of [...FORMS.map((k) => [k, true]), ...CATS.map((c) => [c, false])]) {
      const p = findPage(dir, slug, isForm);
      if (!p) continue;                                  // 该语种没这页 —— 既有事实,② 的基线管它
      const want = `https://wanew.com/${p.replace(/index\.html$/, "")}`;
      ok(canonOf(p) === want, `①b ${p} 的 canonical 必须自指:得到 ${canonOf(p) || "(空)"},期望 ${want}`);
      canonChecked++;
    }
  }
  ok(canonChecked >= 40, `①b 覆盖 ${canonChecked} 个列表页(四语种 × 13 条,存在多少验多少)`);

  // ── ② 首页机型 tile 没有静默消失 ────────────────────────────────────────
  /* 🔴 **基线是冻结的数,不是"当前可用数"。** 我第一版写的是
     「渲染数 == 该语种当前可用数」—— 总工点破了它的盲区,而那个盲区正好命中第 5 步:
     **5b 删掉 227 个旧址静态页时,"可用数"会跟着一起降,两边同步下滑,判据永远相等。**
     > **一个会随被测对象一起移动的基线,量不出任何东西。**
     所以数量对【冻结的期望值】比,变化必须来改这张表,并在报告里说明为什么。
     ⚠️ en = 8 是硬的(home-tiles.json 声明 8 条,en 全都有页),它是这张表里最强的一格:
        任何一个 tile 在 en 消失都藏不住。es/pt = 7 是既有事实(那两个语种没有
        performance-gen-2 的页,总工早年确认过 pt 的 7 个 tile 就是这么来的),不是缺口。 */
  const TILE_BASELINE = { "": 8, es: 7, pt: 7, zh: 8 };
  ok(TILES.length === 8, `② home-tiles.json 声明 ${TILES.length} 条(基线按 8 定的)`);
  for (const d of LOC_DIRS) {
    const dir = d ? `${d}/` : "";
    const home = `${dir}index.html`;
    if (!fs.existsSync(home)) continue;
    const html = fs.readFileSync(home, "utf8");
    const rendered = TILES.filter((t) => {
      const p = findPage(dir, t.cat, false);
      if (!p) return false;
      return html.includes(`href="/${p.replace(/index\.html$/, "")}"`);
    });
    const want = TILE_BASELINE[d];
    ok(want !== undefined, `② ${d || "en"} 必须在基线表里(新增语种要显式定它的期望值)`);
    const missing = TILES.filter((t) => !rendered.includes(t)).map((t) => t.cat);
    ok(rendered.length === want,
      `② ${d || "en"} 首页机型 tile ${rendered.length},基线 ${want}` +
      `${missing.length ? ` —— 缺 ${missing.join(",")}` : ""}` +
      `${rendered.length < want ? "(tile 静默消失了 —— 多半是页面搬家而 tile 还指着旧址)" : ""}`);
  }

  console.log(`\n✅ ${pass} 条断言通过`);
});
