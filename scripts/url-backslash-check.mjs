#!/usr/bin/env node
/**
 * url-backslash-check —— 产出里任何 URL 都不许含反斜杠。
 *
 * 🔴 为什么值得一道常驻闸:`path.join("products", slug, "index.html")` 在 Windows 上是
 *    `products\slug\index.html`,而拼 URL 的代码拿到它就会产出
 *    `https://wanew.com/products\mounts\` —— canonical 和每一条 hreflang alternate 全带反斜杠。
 *    实测一次就是 28 条 × 每个语种簇。
 *
 * ⚠️ **这个 bug 在非 Windows 机器上根本不出现。** 而这个仓的产出是本地生成后提交的 ——
 *    谁在什么系统上跑,决定了它出不出现。修好这一次不了结这一类:
 *    下一次有人用 `path.join` 拼 URL,它会原样复活,而在他的机器上一切正常。
 *    > **一条 grep 的事,但它守的是一整类。**
 *
 * ⚠️ `<meta content>` 里大量是【描述文案】而不是 URL —— 不加区分会满屏假红,
 *    而一道天天假红的闸等于没有闸。所以只对【看起来是 URL 的值】判定:
 *    以 http(s):// 开头,或以 / 开头的站内路径。
 *
 * 退出:0 = 一处都没有 · 1 = 有违规 · 9 = 仪器无效(一个页面都没扫到)
 */
import fs from "fs";
import path from "path";

const SKIP = new Set([".git", "node_modules", "skin", "static", "data", "scripts", "functions", "admin", "admin-worker"]);
const walk = (d, o = []) => {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    if (e.isDirectory()) { if (!SKIP.has(e.name)) walk(path.join(d, e.name), o); continue; }
    if (e.name.endsWith(".html")) o.push(path.join(d, e.name).replace(/\\/g, "/").replace(/^\.\//, ""));
  }
  return o;
};

const looksLikeUrl = (v) => /^https?:\/\//i.test(v) || v.startsWith("/");
// href / src:值本来就该是 URL,一律判。meta content:只判像 URL 的那些。
const RULES = [
  { name: "href", re: /\shref="([^"]*)"/gi, urlOnly: false },
  { name: "src", re: /\ssrc="([^"]*)"/gi, urlOnly: false },
  { name: "meta content", re: /<meta\b[^>]*\scontent="([^"]*)"/gi, urlOnly: true },
];

const pages = walk(".");
if (pages.length === 0) { console.error("❌ 仪器无效:一个 html 都没扫到 —— 没测成,不是通过。"); process.exit(9); }

const hits = [];
for (const f of pages) {
  const src = fs.readFileSync(f, "utf8");
  for (const { name, re, urlOnly } of RULES) {
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(src))) {
      const v = m[1];
      if (!v.includes("\\")) continue;
      if (urlOnly && !looksLikeUrl(v)) continue;
      hits.push({ f, name, v: v.slice(0, 90) });
    }
  }
}

console.log(`【URL 反斜杠】扫描 ${pages.length} 个产出页 · 规则 ${RULES.map((r) => r.name).join(" / ")}`);
if (hits.length) {
  const byFile = {};
  for (const h of hits) (byFile[h.f] ||= []).push(h);
  console.log(`🔴 违规 ${hits.length} 处 / ${Object.keys(byFile).length} 个文件:`);
  for (const [f, hs] of Object.entries(byFile).slice(0, 8))
    console.log(`   ${f}  (${hs.length} 处) 例: [${hs[0].name}] ${hs[0].v}`);
  console.log("\n多半是有人用 path.join 拼了 URL —— 拼 URL 一律用正斜杠字符串,path.join 只拼磁盘路径。");
} else {
  console.log("✅ 0 处。");
}
process.exit(hits.length ? 1 : 0);
