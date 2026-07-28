// CSS 指纹文件名 —— 取代手工 bump `?v=NN`。
//
// 为什么换掉 `?v=NN`(2026-07-28 实战教训,别改回去):
//   查询串方案自带一个窗口 —— **新 URL 的第一次请求最可能落在部署尚未传开的那几十秒里**,
//   边缘回源拿到【还没换的旧文件】,再按 `immutable` 钉一年。生产上真发生过:`?v=60`
//   被存成 v5 之前的旧 CSS,新 HTML 配旧 CSS,页面半坏,而且 purge 也救不回已经进了
//   访客浏览器的那一年 —— 只能再 bump 一次逃走。
//   指纹文件名把这个故障换了个性质:窗口里的请求打到一个【还不存在的路径】→ 404,
//   短暂、自愈、而且看得见。**把"永久且静默"换成"短暂且明显",方向上永远是对的交易。**
//
// ⚠️ 现状实测(2026-07-28 生产 curl):/skin/* 的 `max-age=31536000, immutable` 【确实生效】
//   (三种取法都返回它)。_headers 里那条说"当前不生效"的留档是 2026-07-27 的,已过时,同批改掉。
//
// 用法:regen + chrome-sync 之后跑一次。它是幂等的:内容没变就什么都不做。
import fs from "fs";
import path from "path";
import crypto from "crypto";

const REPO = process.cwd();
const CSS_DIR = path.join(REPO, "skin", "css");
const SRC = path.join(CSS_DIR, "w3.css");            // 可编辑真源(也会被静态服务,但没人引用它)
const WRITE = process.argv.includes("--write");

const css = fs.readFileSync(SRC);
const hash = crypto.createHash("sha256").update(css).digest("hex").slice(0, 10);
const NAME = `w3.${hash}.css`;

// 站内所有 HTML(模板 + 产出)
const pages = [];
(function walk(d) {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    if (e.name === "node_modules" || e.name === ".git") continue;
    const p = path.join(d, e.name);
    if (e.isDirectory()) walk(p);
    else if (e.name.endsWith(".html")) pages.push(p);
  }
})(REPO);

// 旧引用两种形态都认:`w3.css?v=NN`(迁移前)与 `w3.<旧hash>.css`(迁移后再改内容)
const REF = /\/skin\/css\/w3\.(?:css\?v=\d+|[0-9a-f]{10}\.css)/g;
let files = 0, refs = 0;
for (const p of pages) {
  const s = fs.readFileSync(p, "utf8");
  const hits = s.match(REF);
  if (!hits) continue;
  const next = s.replace(REF, `/skin/css/${NAME}`);
  if (next === s) continue;
  refs += hits.length; files++;
  if (WRITE) fs.writeFileSync(p, next);
}

// 陈旧的指纹副本一并清掉,否则仓库会越攒越多份 125KB
const stale = fs.readdirSync(CSS_DIR).filter((f) => /^w3\.[0-9a-f]{10}\.css$/.test(f) && f !== NAME);
if (WRITE) {
  fs.writeFileSync(path.join(CSS_DIR, NAME), css);
  for (const f of stale) fs.unlinkSync(path.join(CSS_DIR, f));
}

// 自证:写完之后不许再有任何 `?v=` 形态的引用,且每一处引用都指向当前指纹
let leftoverV = 0, wrongHash = 0, ok = 0;
if (WRITE) {
  for (const p of pages) {
    const s = fs.readFileSync(p, "utf8");
    leftoverV += (s.match(/w3\.css\?v=/g) || []).length;
    for (const m of s.match(/\/skin\/css\/w3\.[0-9a-f]{10}\.css/g) || []) { m.includes(hash) ? ok++ : wrongHash++; }
  }
}

console.log(`css-hash  内容指纹 ${hash}  →  skin/css/${NAME}`);
console.log(`  改写引用 ${refs} 处 / ${files} 个文件${WRITE ? "" : "(dry-run,未写盘;加 --write 生效)"}`);
if (stale.length) console.log(`  ${WRITE ? "已删" : "待删"}陈旧指纹副本 ${stale.length}: ${stale.join(", ")}`);
if (WRITE) {
  console.log(`  自证:残留 ?v= 引用 ${leftoverV}(须 0) · 指向当前指纹 ${ok} · 指向别的指纹 ${wrongHash}(须 0)`);
  if (leftoverV || wrongHash) { console.error("❌ 自证不通过"); process.exit(1); }
  if (!fs.existsSync(path.join(CSS_DIR, NAME))) { console.error("❌ 指纹文件没写出来"); process.exit(1); }
  console.log("✅ 完成");
}
