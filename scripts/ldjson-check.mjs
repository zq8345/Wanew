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

let blocks = 0, dirty = 0, frozenBlocks = 0, frozenDirty = 0, parseFail = 0;
const files = new Set(); const ex = [];
for (const f of pages) {
  const frozen = FROZEN.test(f);
  const s = fs.readFileSync(f, "utf8");
  const re = /<script type="application\/ld\+json">([\s\S]*?)<\/script>/g;
  let m;
  while ((m = re.exec(s))) {
    const body = m[1];
    if (frozen) { frozenBlocks++; if (ENTITY.test(body)) frozenDirty++; ENTITY.lastIndex = 0; continue; }
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
console.log(`  冻结旧址页(不计入判据):块 ${frozenBlocks} · 含实体 ${frozenDirty}`);
ex.forEach((x) => console.log(`     ${x}`));
process.exit(dirty ? 1 : 0);
