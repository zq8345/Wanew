// P0-e:ld+json 块里不许出现 HTML 实体。
// 🔴 <script> 是 raw text,实体【不会被解码】⇒ 结构化数据里的值字面就是 "Mounts &amp;amp; Power",
//    Google 读到的就是这串。而这种块 **JSON.parse 完全合法** ——
//    上一把尺子问的是"能不能解析",缺陷在"解析出来的值对不对"。
//    > **解析通过 ≠ 语义正确。**
// ⚠️ 冻结的旧址详情页不计入分母:regen 自 ③c-1 起不再写它们,修不到,收尾那一刀会删掉。
import fs from "fs";
import path from "path";

const SKIP = new Set([".git", "node_modules", "skin", "static", "data", "scripts", "functions", "admin", "admin-worker"]);
const walk = (d, o = []) => {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    if (e.isDirectory()) { if (!SKIP.has(e.name)) walk(path.join(d, e.name), o); continue; }
    if (e.name.endsWith(".html")) o.push(path.join(d, e.name).split(path.sep).join("/").replace(/^\.\//, ""));
  }
  return o;
};
// 冻结页 = 旧址详情页 {机型}/{数字}.html(含语种前缀)
const FORMS = JSON.parse(fs.readFileSync("data/forms.json", "utf8")).forms.map((f) => f.key);
const CATS = JSON.parse(fs.readFileSync("data/product-routes.json", "utf8")).categories;
const MODELS = CATS.filter((c) => !FORMS.includes(c));
const FROZEN = new RegExp(`^(?:(?:es|pt|zh)/)?(?:${MODELS.join("|")})/\\d+\\.html$`);
const ENTITY = /&(amp|lt|gt|quot|apos|#\d+);/g;

const pages = walk(".");
if (!pages.length) { console.error("❌ 仪器无效:一个 html 都没扫到。"); process.exit(9); }

// frozenDirty 随豁免一起退役:冻结族的实体现在和在产页一样计进 dirty,不再单独存一份。
let blocks = 0, dirty = 0, frozenBlocks = 0, parseFail = 0;
const files = new Set(); const ex = [];
let empty = 0, broke = 0; const badFiles = new Set();
for (const f of pages) {
  const frozen = FROZEN.test(f);
  const s = fs.readFileSync(f, "utf8");
  const re = /<script type="application\/ld\+json">([\s\S]*?)<\/script>/g;
  let m;
  while ((m = re.exec(s))) {
    const body = m[1];
    /* ⭐ 正面断言(必须在下面那句 frozen continue 【之前】——
       我第一版写在它后面,于是断言根本看不到冻结族,而标签还写着「含冻结族」。
       是独立盘点的数字对不上把它揪出来的。):块非空 + 可解析。空的 <script type="ld+json"></script> 不是"没有标注",
       是"标注坏了"——搜索引擎拿到一个无法解析的块。判据【不区分冻结与否】:
       被索引、在 sitemap 里的恰恰是冻结旧址页,把它们排除等于把闸架在没有缺陷的地方。 */
    const t = body.trim();
    if (!t) { empty++; badFiles.add(f); }
    else { try { JSON.parse(t); } catch { broke++; badFiles.add(f); } }
    /* 🔴 2026-08-01:实体污染那条的【冻结族豁免】撤销 —— 它保护的是空气,而它有真盲区。
       撤销前先量:冻结族 792 个块、含实体 **0** ⇒ 收进射程零成本、当场仍绿。
       盲区是实证的:**同一晚我(总工)亲手编辑过 `mini/*.html`**(给 4208-4211 补空的
       meta description)。冻结页 regen 写不到,所以修它只能手改 —— 而手改恰恰是最容易
       写进 `&amp;` 的路径,却正好落在这条豁免的背面。**"regen 修不到"是不设防的理由,
       不是不检查的理由:检查照样告诉你哪里坏了,只是修法换成手改。**
       ⚠️ 原豁免理由写的是"收尾那一刀会删掉它们" —— 但那一刀还没落,在此之前它们
       被索引、在 sitemap 里。**按将来会消失来给今天的东西免检,是把时间当成了断言。**
       统计仍分开打印(在产 / 冻结),只是判据不再放过冻结族。 */
    if (frozen) frozenBlocks++;
    blocks++;
    if (body.trim() !== "") { try { JSON.parse(body); } catch { parseFail++; } }
    ENTITY.lastIndex = 0;
    const hits = body.match(ENTITY);
    if (hits) {
      dirty++; files.add(f);
      if (ex.length < 3) ex.push(`${f}\n        ${[...new Set(hits)].join(" ")}  例: ${(body.match(/"[^"]*&(amp|lt|gt|quot|#\d+);[^"]*"/) || [""])[0].slice(0, 76)}`);
    }
  }
}
console.log(`【ld+json 实体污染】页面 ${pages.length}`);
console.log(`  在产页面:块 ${blocks} · 🔴 含实体 ${dirty} · 解析失败 ${parseFail} · 涉及文件 ${files.size}`);
// ⚠️ 这行标签曾写着「不计入判据」——撤销豁免后那句就成了假话。**标签是断言,不是装饰。**
//    今晚同一族栽了三次(注释说 About 复用 .w3-whycard、文档说用 .w3-whycard__idx 编号、
//    这道闸自己标着「含冻结族」而代码在 continue 之后)。改判据必须连它的自述一起改。
console.log(`  其中冻结旧址页(与在产页同一判据,已计入):块 ${frozenBlocks}`);
console.log(`  ⭐ 块非空且可解析(全站,含冻结族):🔴 空块 ${empty} · 解析失败 ${broke} · 涉及文件 ${badFiles.size}  ${empty || broke ? "🔴" : "✅"}`);
[...badFiles].sort().slice(0, 20).forEach((x) => console.log(`     ${x}`));
ex.forEach((x) => console.log(`     ${x}`));
// ⚠️ 退出码必须在【这一行】把新断言算进去。原来是 `dirty ? 1 : 0` —— parseFail 一直在数、
//    却从不影响退出码,于是 12 个空块页在这道闸下常年绿灯。
//    **一道会喊红但不拦人的闸,比没有闸更坏。**
process.exit(dirty || empty || broke || parseFail ? 1 : 0);
