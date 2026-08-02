/* Product JSON-LD 的 image 必须【出现在该产品自己的图册里】。
 *
 * 🔴 这道闸为什么存在:2026-08-01 实测,在线产品 68,jsonld image 指向自己图册的只有 4 个
 *    (4208-4211,人手写的)。**机器写过的 64 份存储拷贝一份对的都没有** —— 图册被重排/裁剪过,
 *    而那份拷贝留在原地,于是结构化数据里的主图指向一张这个产品已经不用的资产。
 *    这 64 个坏了不知道多久,而没有任何一道闸出声。
 *
 * ⚠️ 判据锚在【产出页】,不锚数据:jsonld 现在是渲染时派生的,数据里那两个字段已经没人读,
 *    盯着它们等于盯一个不再影响线上的东西。
 * ⚠️ 两边都过 resolveImg 再比 —— **不自己另写一套等价规则**。{key} 走 R2 图床、{src} 走站内静态,
 *    我第一版审计脚本就是自己猜规则,把所有 R2 产品误判成"不在图册里"。
 *    自己猜一套等价规则,正是这 64 个的病根。
 */
import fs from "fs";
import path from "path";
import { resolveImg } from "../functions/_lib/render.js";

const IMG_BASE = JSON.parse(fs.readFileSync("data/site.json", "utf8")).img_base;
const SKIP = new Set([".git", "node_modules", "skin", "static", "data", "scripts", "functions", "admin", "admin-worker"]);
const walk = (d, o = []) => {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    if (e.name.startsWith(".") || SKIP.has(e.name)) continue;
    const p = path.join(d, e.name);
    if (e.isDirectory()) walk(p, o);
    else if (e.name.endsWith(".html")) o.push(p.replace(/\\/g, "/").replace(/^\.\//, ""));
  }
  return o;
};

// id → 该产品图册(已归一)。产品页路径两族都以 id 收尾:/{cat}/{id}.html 与 /products/{slug}-{id}.html
/* ⚠️ 比较时【去掉扩展名】—— 站里有 webp 孪生机制:regen 的 webpInline 会把 x.jpg 换成 x.webp
   (实测 static/upload/down/f6f88df527.jpg 与 .webp 两个文件都在)。所以页面上的 image 是图册
   那张的 webp 版,**同一张资产**。不去扩展名的话,这道闸会把 228 个正确的页面判成坏的。
   🔴 放宽之后必须【重跑反向自证】:原来那 64 个坏在文件名整个不同(650 存 bb55cff3ea,图册是
      f6f88df527),去扩展名遮不住它。**放宽尺子让自己的活通过,是这里最容易犯的错。** */
const norm = (u) => String(u).replace(/^https?:\/\/[^/]+/, "").replace(/^\//, "").replace(/\.[a-z0-9]+$/i, "");
const gallery = new Map();
for (const f of fs.readdirSync("data/products").filter((x) => x.endsWith(".json"))) {
  const p = JSON.parse(fs.readFileSync(path.join("data/products", f), "utf8"));
  gallery.set(String(p.id), new Set((p.images || []).map((x) => resolveImg(x, IMG_BASE)).filter(Boolean).map(norm)));
}

const pages = walk(".");
if (!pages.length) { console.error("❌ 仪器无效:一个 html 都没扫到。"); process.exit(9); }
if (!gallery.size) { console.error("❌ 仪器无效:一个产品数据都没读到。"); process.exit(9); }

let checked = 0, noId = 0;
const bad = [];
for (const f of pages) {
  const m = /(?:^|[/-])(\d+)\.html$/.exec(f);
  for (const b of String(fs.readFileSync(f, "utf8")).matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)) {
    let j; try { j = JSON.parse(b[1].trim()); } catch { continue; }   // 空/坏由 ldjson-check 管
    if (j["@type"] !== "Product") continue;
    if (!m) { noId++; continue; }                                     // 认不出 id 就吼,不静默跳过
    const gal = gallery.get(m[1]);
    if (!gal) { noId++; continue; }
    checked++;
    for (const u of [].concat(j.image || [])) if (!gal.has(norm(u))) bad.push(`${f}  用 ${norm(u)}  不在 ${m[1]} 的图册(${gal.size} 张)里`);
  }
}

console.log(`【jsonld image ∈ 自己的图册】页面 ${pages.length} · 检了 ${checked} 个 Product 块`);
if (noId) console.log(`  ⚠️ 认不出产品 id / 无该产品数据的 Product 块:${noId}(不计入分子,但列出来免得分母静默缩水)`);
console.log(`  🔴 图不在自己图册里:${bad.length}  ${bad.length ? "🔴" : "✅"}`);
bad.slice(0, 15).forEach((x) => console.log(`     ${x}`));
if (bad.length > 15) console.log(`     … 还有 ${bad.length - 15} 处`);
// ⚠️ 退出码写在【这一行】。今晚已经栽过一次:process.exitCode 被脚本末尾的 process.exit() 覆盖,
//    闸打印 🔴 而退出码 0,跑闸的循环按退出码计会把它算成绿。会喊红但不拦人的闸,比没有闸更坏。
process.exit(bad.length || noId ? 1 : 0);
