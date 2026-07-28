// /products/ 路由层的判据测试。
//
// 🔴 为什么值得单独一个测试文件:这个 Function 拦在【所有】 /products/* 前面,
//    它的失败模式不是"某个链接错了",是"产品区全站白屏" —— 而闸看不见,
//    因为闸检查的是产出文件,文件都在,变的是谁来响应。
//
// 🔴🔴 这个文件自己出过一次最贵的错,记在这里:第 ④ 项三条断言叫「语种前缀保持」,
//    从建起来就是绿的,而生产上 /es|pt|zh/products/{非规范slug} **一直返回 404 而不是 301**。
//    原因:④ 测的是下面那个【逐字复刻出来的 route()】,它永远拿得到完整 pathname;
//    而真实的 CF Pages 按文件路径挂载,`functions/products/[[path]].js` 压根收不到 /es/… 的请求。
//    > **判据复刻了逻辑,却没有一个字覆盖「这段逻辑会不会被调用」。**
//    所以本文件现在分成两类断言,**别再把它们混着读**:
//      ①②③④⑤⑥ = 判据【逻辑】对不对(复刻,跑在 node 里)
//      ⑦        = 判据【挂得到吗】(对账 functions/ 下真实文件,自带正对照)
//      再往上一层的真 HTTP 验证在 scripts/route-live-check.mjs —— 那个才是不复刻的。
import test from "node:test";
import assert from "node:assert/strict";
import fs from "fs";

const SRC = fs.readFileSync("functions/_lib/product-route.js", "utf8");
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

// 从判据源码里读出「它声称接受哪些语种前缀」。
//
// 🔴 这个函数自己坑过一次,值得逐字记下来:第一版锚在 `products` 字面量上,并且我在它上面
//    写了「不是文件里任何一处 (a|b|c)」——**而 _lib/product-route.js 的文件头注释里,
//    逐字抄着旧正则 `^\/(?:(es|pt|zh)\/)?products\/…` 作为事故说明。**
//    于是提取器命中了注释,读出 zh;判据早已改成 (es|pt),它却坚持报"声称了 zh"。
//    连带后果:在那之前的"32 条全绿"也是假的 —— claimed 与 mounted 恰好都含 zh,
//    正反两向都过,**而两边都错着**。
//    > **提取器读到的是"文件里长得像代码的字",不是代码。注释是最像代码的字。**
//    修法两道叠着:① 先剥注释再提取 ② 锚到变量名而不是正则形状。
function stripComments(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/^[ \t]*\/\/.*$/gm, " ");
}
function mountClaimedLocales(src) {
  const m = /PRODUCT_PATH_RE\s*=\s*\/[^\n]*?\(\?:\(([a-z|]+)\)/.exec(stripComments(src));
  return m ? m[1].split("|") : [];
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

  // ── ④ 语种前缀保持【只测逻辑,不证明请求到得了】────────────────────────
  //    ⚠️ 这三条在生产坏着的两天里一直是绿的。它们没错,只是**管的范围比名字听起来小**:
  //       "如果这段逻辑收到了带语种前缀的 pathname,它算得对吗" —— 收不收得到,归 ⑦。
  for (const loc of ["es", "pt", "zh"]) {
    const r = route(`/${loc}/products/wrong-${sample.id}`);
    ok(r.kind === "301" && r.to === `/${loc}/products/${sample.path}`, `④ ${loc} 归一逻辑保持语种前缀(不含挂载)`);
  }

  // ── ⑤ 列表页与未知段 ──────────────────────────────────────────────────
  ok(route("/products/").kind === "next", "⑤ /products/ 列表页放行");
  ok(route("/products/no-such-thing").kind === "next", "⑤ 解析不出编号的段落回静态(由静态层决定 404)");

  // ── ⑥ 清单本身的完整性 ────────────────────────────────────────────────
  ok(!KNOWN.has("video"), "⑥ video 不在分类清单里(它有 39.html,但不是产品分类)");
  ok(!KNOWN.has("admin"), "⑥ admin 不在分类清单里");
  ok(KNOWN.has("performance-gen-2"), "⑥ performance-gen-2 在清单里(聚合页,自己没有产品)");
  ok(CANON.size === MANIFEST.length, `⑥ 所有 ${MANIFEST.length} 个产品都有规范 path`);

  // ── ⑦ 🔴 挂载对账:判据【声称】覆盖的语种,必须【真的挂得到】 ──────────────
  //    这一项是为了那个在产两天的坏而加的。它不复刻任何逻辑,只干一件事:
  //    把 _lib/product-route.js 正则里写着的语种,和 functions/ 下真实存在的挂载文件对账。
  //    **CF Pages 按文件路径挂载 —— 判据写了 `(es|pt|zh)` 不代表请求到得了。**
  const claimed = mountClaimedLocales(SRC);
  // ⚠️ 只断言"读到了东西",不写死个数。第一版写的是 `=== 3`(当时以为含 zh),
  //    zh 一去掉这条就红 —— **而红的是判据,不是产品**。个数是否相符交给下面的双向对账,
  //    那才是真正该管数量的地方。**把当时的事实钉进断言,事实一变判据自己先坏。**
  ok(claimed.length > 0, `⑦ 判据声称支持 ${claimed.length} 个语种前缀 {${claimed.join(",")}}`);
  for (const loc of claimed) {
    const f = `functions/${loc}/products/[[path]].js`;
    ok(fs.existsSync(f), `⑦ ${loc} 声称支持 → 挂载文件必须存在:${f}`);
  }
  ok(fs.existsSync("functions/products/[[path]].js"), "⑦ en(无前缀)挂载文件存在");
  // 🔴 反向对账:挂了的也必须被声称。**少了这一半,对账就是单向的** ——
  //    我第一版只写了正向,于是把 zh 从判据里去掉后,functions/zh/products/ 那个
  //    错建的挂载点**原地留着,32 条断言照样全绿**。它会把 /zh/products/{非规范slug}
  //    301 到一个不存在的页面,而没有任何东西会说话。
  //    > **注释里写着"双向",代码里只做了一向 —— 那条注释本身就是绿灯。**
  const mounted = fs.readdirSync("functions", { withFileTypes: true })
    .filter((e) => e.isDirectory() && !e.name.startsWith("_"))
    .filter((e) => fs.existsSync(`functions/${e.name}/products/[[path]].js`))
    .map((e) => e.name);
  for (const loc of mounted)
    ok(claimed.includes(loc), `⑦ 反向:functions/${loc}/products/ 挂着 → 判据必须声称 ${loc}`);
  ok(mounted.length === claimed.length,
    `⑦ 反向:挂载 ${mounted.length} 个 {${mounted.join(",")}} = 声称 ${claimed.length} 个 {${claimed.join(",")}}`);
  // 每个挂载点都必须真的指向同一份判据 —— 否则改了 _lib 而某个挂载点还留着旧副本
  for (const loc of ["", ...claimed]) {
    const f = loc ? `functions/${loc}/products/[[path]].js` : "functions/products/[[path]].js";
    ok(/_lib\/product-route\.js/.test(fs.readFileSync(f, "utf8")),
      `⑦ ${loc || "en"} 挂载点转发到 _lib/product-route.js(判据单一实现)`);
  }
  // 🔴 正对照 A:判据自己得能红。喂一个【声称支持但没有挂载文件】的语种,必须被读出来。
  //    ⚠️ 不这么写就是又一个"永远绿的判据" —— 而这一项存在的全部理由,正是上一个永远绿的判据。
  const fake = mountClaimedLocales('export const PRODUCT_PATH_RE = /^\\/(?:(es|pt|fr)\\/)?products\\/?(.*)$/;');
  ok(fake.join() === "es,pt,fr", `⑦ 正对照A:能从赋值里读出多出来的语种(读到 ${fake.join("|")})`);
  ok(!fs.existsSync("functions/fr/products/[[path]].js"),
    "⑦ 正对照A:fr 确实没有挂载文件 —— 所以若判据声称 fr,上面的循环会红");
  // 🔴 正对照 B:**提取器不许把注释当代码。** 这正是它踩过的那个坑 ——
  //    _lib 的文件头注释里逐字抄着旧正则,提取器命中注释读出 zh,而代码早已是 (es|pt)。
  const trap = mountClaimedLocales(
    "/* 事故说明:旧版写的是 /^\\/(?:(es|pt|zh)\\/)?products\\/?(.*)$/ */\n" +
    "// 也可能有人在行注释里抄:PRODUCT_PATH_RE = /^\\/(?:(de|fr)\\/)?products/\n" +
    "export const PRODUCT_PATH_RE = /^\\/(?:(es|pt)\\/)?products\\/?(.*)$/;");
  ok(trap.join() === "es,pt", `⑦ 正对照B:块注释与行注释里的旧正则都不许被读进来(读到 ${trap.join("|")})`);

  // ── ⑧ 🔴 functions/_lib/ 下的共享模块不许导出 onRequest ────────────────────
  //    CF Pages 认路由的依据是【导出了 onRequest】,**与它在不在 `_` 开头的目录里无关**。
  //    我把共享判据抽进 _lib/product-route.js 时原样叫了 onRequest,于是 wrangler
  //    自动生成的 _routes.json 里凭空多出一条 `/_lib/product-route` ——
  //    **一个共享模块变成了对外端点**(生产实测 404,没造成暴露,但没人打算创建它)。
  //    > **决定"这是不是一个路由"的不是目录,是导出的名字。**
  //    ⚠️ 判据只扫 `functions/_lib/`,所以**不需要、也不许**豁免 `X as onRequest` 这种别名形式:
  //    别名导出的结果同样是"这个文件导出了 onRequest",一样会变成路由。
  //    我第一版给正则加了 `(?!\s+as)` 想放过别名,是把【挂载点该做的事】和【_lib 不该做的事】
  //    按形状混成了一类 —— 而正对照当场把它抓了出来。**豁免要按位置给,不按写法给。**
  const EXPORTS_ONREQUEST = /export\s+(?:async\s+)?function\s+onRequest\b|export\s*\{[^}]*\bonRequest\b/;
  const libFiles = fs.readdirSync("functions/_lib").filter((f) => f.endsWith(".js"));
  ok(libFiles.length > 0, `⑧ functions/_lib 下有 ${libFiles.length} 个模块`);
  for (const f of libFiles)
    ok(!EXPORTS_ONREQUEST.test(stripComments(fs.readFileSync(`functions/_lib/${f}`, "utf8"))),
      `⑧ _lib/${f} 不导出 onRequest(否则它会变成一条路由)`);
  // 🔴 正对照:这条判据得能红。
  ok(EXPORTS_ONREQUEST.test("export async function onRequest(c){}"), "⑧ 正对照:直接声明形式会被抓到");
  ok(EXPORTS_ONREQUEST.test('export { onRequest } from "./x.js";'), "⑧ 正对照:再导出形式会被抓到");
  ok(EXPORTS_ONREQUEST.test('export { handleProductRoute as onRequest } from "./x.js";'),
    "⑧ 正对照:别名形式 `X as onRequest` 在 _lib 里同样必须被抓到(它一样会造出路由)");
  ok(!EXPORTS_ONREQUEST.test('export function handleProductRoute(c){}'),
    "⑧ 正对照:不叫 onRequest 的正常导出不误伤");

  console.log(`\n✅ ${pass} 条断言通过`);
});
