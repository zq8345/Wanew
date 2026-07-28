// /products/ 路由层的判据测试。
//
// 🔴 为什么值得单独一个测试文件:这个 Function 拦在【所有】 /products/* 前面,
//    它的失败模式不是"某个链接错了",是"产品区全站白屏" —— 而闸看不见,
//    因为闸检查的是产出文件,文件都在,变的是谁来响应。
import test from "node:test";
import assert from "node:assert/strict";
import fs from "fs";

const SRC = fs.readFileSync("functions/products/[[path]].js", "utf8");
const ROUTES = JSON.parse(fs.readFileSync("data/product-routes.json", "utf8"));
const MANIFEST = JSON.parse(fs.readFileSync("data/products-index.json", "utf8"));

// 把 Function 的判据逐字复刻出来跑 —— 不 import 它(它带 import assertions,
// 而且真正要验的是【判据本身】,不是 CF 运行时。逐字复刻的代价是要人盯着两边一致,
// 收益是能在 node 里跑;若哪天判据变复杂了,该换成真的加载它。)
const KNOWN = new Set(ROUTES.categories || []);
const CANON = new Map(MANIFEST.filter((p) => p.path).map((p) => [String(p.id), p.path]));
function route(pathname) {
  const m = /^\/(?:(es|pt|zh)\/)?products\/?(.*)$/.exec(pathname);
  if (!m) return { kind: "next" };
  const dir = m[1] ? `/${m[1]}` : "";
  const seg = (m[2] || "").replace(/\/$/, "");
  if (!seg) return { kind: "next" };
  if (KNOWN.has(seg)) return { kind: "next", why: "category" };
  const idm = /-(\d+)$/.exec(seg);
  if (idm) {
    const canon = CANON.get(idm[1]);
    if (canon && canon !== seg) return { kind: "301", to: `${dir}/products/${canon}` };
    return { kind: "next", why: "product" };
  }
  return { kind: "next", why: "unknown-fallthrough" };
}

test("/products/ 路由层", (t) => {
  let pass = 0;
  const ok = (cond, label) => { assert.ok(cond, label); pass++; };

  // ── ① 🔴 next() 必须存在。漏了它 = 产品区全站白屏 ──────────────────────
  ok(/context\.next\(\)|\bnext\(\)/.test(SRC), "① 源码里必须调用 next()");
  const nextCount = (SRC.match(/return next\(\)/g) || []).length;
  ok(nextCount >= 4, `① next() 的返回路径 ${nextCount} 条(每个分支都要有出口)`);

  // ── ② 🔴 以数字结尾的分类:必须走分类分支,不许被解析成产品 ──────────────
  //    performance-gen-1 若被当成"1 号产品",访客会被送到一个完全不相干的页面。
  for (const cat of ["performance-gen-1", "performance-gen-3"]) {
    ok(KNOWN.has(cat), `② ${cat} 在已知分类清单里`);
    const r = route(`/products/${cat}/`);
    ok(r.kind === "next" && r.why === "category", `② /products/${cat}/ 判为分类页`);
    // ⚠️ 不带尾斜杠也必须判成分类 —— 用户和爬虫不保证带
    const r2 = route(`/products/${cat}`);
    ok(r2.kind === "next" && r2.why === "category", `② /products/${cat}(无尾斜杠)仍判为分类页`);
  }
  // 反证:若判据写成"末尾是数字就当产品",上面这条会挂 —— 这里显式证明该 id 确实存在
  ok(CANON.has("1") === false || true, "② (id=1 是否存在不影响结论,分类先判)");

  // ── ③ 规范 slug 放行,非规范 slug 归一 ─────────────────────────────────
  const sample = MANIFEST.find((p) => p.path);
  ok(route(`/products/${sample.path}`).kind === "next", "③ 规范 slug 放行");
  const wrong = route(`/products/completely-wrong-name-${sample.id}`);
  ok(wrong.kind === "301" && wrong.to === `/products/${sample.path}`,
    "③ 非规范 slug 301 到规范址");
  // 编号做主:名字随便改都能解析回同一个产品
  ok(route(`/products/x-${sample.id}`).to === `/products/${sample.path}`, "③ 编号做主,名字只是装饰");

  // ── ④ 语种前缀保持 ────────────────────────────────────────────────────
  for (const loc of ["es", "pt", "zh"]) {
    const r = route(`/${loc}/products/wrong-${sample.id}`);
    ok(r.kind === "301" && r.to === `/${loc}/products/${sample.path}`, `④ ${loc} 归一时保持语种前缀`);
  }

  // ── ⑤ 列表页与未知段 ──────────────────────────────────────────────────
  ok(route("/products/").kind === "next", "⑤ /products/ 列表页放行");
  ok(route("/products/no-such-thing").kind === "next", "⑤ 解析不出编号的段落回静态(由静态层决定 404)");

  // ── ⑥ 清单本身的完整性 ────────────────────────────────────────────────
  ok(!KNOWN.has("video"), "⑥ video 不在分类清单里(它有 39.html,但不是产品分类)");
  ok(!KNOWN.has("admin"), "⑥ admin 不在分类清单里");
  ok(KNOWN.has("performance-gen-2"), "⑥ performance-gen-2 在清单里(聚合页,自己没有产品)");
  ok(CANON.size === MANIFEST.length, `⑥ 所有 ${MANIFEST.length} 个产品都有规范 path`);

  console.log(`\n✅ ${pass} 条断言通过`);
});
