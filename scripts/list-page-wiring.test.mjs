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

  // ── ② 首页机型 tile 没有静默消失 ────────────────────────────────────────
  for (const d of LOC_DIRS) {
    const dir = d ? `${d}/` : "";
    const home = `${dir}index.html`;
    if (!fs.existsSync(home)) continue;
    const html = fs.readFileSync(home, "utf8");
    // 该语种下【真实可用】的 tile 数:tile 声明了它,且它指向的页在这个语种存在
    const available = TILES.filter((t) => findPage(dir, t.cat, false));
    // 首页里实际出现的:指向这些机型页的链接
    const rendered = available.filter((t) => {
      const p = findPage(dir, t.cat, false);
      const href = "/" + p.replace(/index\.html$/, "");
      return html.includes(`href="${href}"`);
    });
    ok(available.length > 0, `② ${d || "en"} 首页至少有 1 个可用机型 tile(有 ${available.length} 个)`);
    ok(rendered.length === available.length,
      `② ${d || "en"} 首页渲染出的机型 tile ${rendered.length} = 可用 ${available.length}` +
      `${rendered.length < available.length ? ` —— 缺 ${available.filter((t) => !rendered.includes(t)).map((t) => t.cat).join(",")}` : ""}`);
  }

  console.log(`\n✅ ${pass} 条断言通过`);
});
