/**
 * /products/* 路由判据的【唯一实现】。四个挂载点共用它。
 *
 * 🔴 这个文件之所以存在,是因为一个在产两天没人发现的坏:
 *    CF Pages Functions **按文件路径挂载**。`functions/products/[[path]].js` 只匹配
 *    `/products/*` —— `[[path]]` 捕获的是 `/products/` 之【后】的段,
 *    **前面多一个 `/es` 就根本不进这个 Function。**
 *    而那个文件内部的正则一直写着 `^\/(?:(es|pt|zh)\/)?products\/…`,
 *    **逻辑一直在,只是永远收不到那些请求** —— 生产实测 /es|pt|zh/products/{非规范slug}
 *    全部 404,只有 en 的 301 生效。
 *
 * ⚠️ 更该记住的是判据为什么没抓到:product-route.test.mjs 里有三条断言叫
 *    「语种前缀保持」,一直是绿的 —— 它们测的是**测试文件里逐字复刻出来的 route()**,
 *    那个函数永远拿得到完整 pathname。**判据复刻了逻辑,却没有一个字覆盖
 *    「这段逻辑会不会被调用」。** 挂载是判据的盲区,不是逻辑的。
 *    → 修法不是"多写一条断言",是让判据去比对【声称的覆盖面】与【实际的挂载面】,
 *      见 product-route.test.mjs 第 ⑦ 项,以及真 HTTP 的 route-live-check.mjs。
 *
 * 路由判据(总工 2026-07-28 定):**先查分类清单,再按编号解析。**
 *   /products/{x}/  → x ∈ 已知分类 → 放行给静态
 *   /products/{x}   → 末尾 -{digits} 解析 id → 与规范 slug 比,不同则 301
 *
 * 🔴 **不许用"末尾是数字"这类模式判分类还是产品** —— `performance-gen-1` 以 `-1` 结尾,
 *    会被吃成 1 号产品。所以顺序是【先查清单】,而且与尾斜杠无关:用户和爬虫不保证带尾斜杠。
 *
 * 两张表都来自构建产出,不在这里重新推导:
 *   · data/product-routes.json  —— 已知分类 slug(regen 由三个真源并出)
 *   · data/products-index.json  —— id → 规范 path(regen 用同一个派生函数算好)
 *   **它们由"产出这批页面的那一次运行"生成,所以不可能与实际产出漂移。**
 */
import ROUTES from "../../data/product-routes.json";
import MANIFEST from "../../data/products-index.json";

const KNOWN = new Set(ROUTES.categories || []);
// id → 规范路径段(`{slug}-{id}`)
const CANON = new Map(MANIFEST.filter((p) => p.path).map((p) => [String(p.id), p.path]));

// 🔴 这个正则接受的语种前缀,与 functions/ 下的挂载点【必须一一对应】。
//    product-route.test.mjs ⑦ 就是拿它和实际文件对账的:声称了就必须挂,挂了就必须声称。
//
// ⚠️ **zh 不在里面,而且这是个结论不是遗漏。** zh 只有一个 zh/products/index.html 列表页,
//    没有任何产品详情页与分类页(DESIGN.md §9.1:zh 产品详情页已决定不做)。
//    我第一版把 zh 写了进来并建了挂载点,结果是把 /zh/products/{非规范slug} 从
//    **404 变成 301 跳到另一个 404** —— 对爬虫比原样 404 更差。
//    > **判据声称的范围超出事实时,它不会闲着,它会认真地把请求送进不存在的地方。**
//    zh 列表页不需要这一层:它由静态层直接服务。
//    重新加回 zh 的触发条件 = §9.1 那条被重新考虑(即 zh 产品详情页真的产出了)。
export const PRODUCT_PATH_RE = /^\/(?:(es|pt)\/)?products\/?(.*)$/;

// 🔴 **这里绝不能叫 `onRequest`。** CF Pages 把「导出了 onRequest 的文件」认成路由 ——
//    与它在不在 `_` 开头的目录里无关。我第一版就叫 onRequest,于是 wrangler 自动生成的
//    _routes.json 里凭空多出一条 `/_lib/product-route`,**一个共享模块变成了一个对外端点**。
//    生产实测它返回 404(URL 不匹配正则 → next() → 静态层没有这个文件),所以没造成暴露;
//    但它白占一条 include 额度,而且是个**没人打算创建的路由**。
//    同目录的 render.js / chrome.js / github.js 都没出现在路由表里,正是因为它们不导出这个名字。
//    > **决定"这是不是一个路由"的不是目录,是导出的名字。**
export async function handleProductRoute(context) {
  const { request, next } = context;
  const url = new URL(request.url);
  const m = PRODUCT_PATH_RE.exec(url.pathname);
  if (!m) return next();                          // 不该发生,但不猜 —— 交回静态

  const dir = m[1] ? `/${m[1]}` : "";
  const seg = (m[2] || "").replace(/\/$/, "");

  if (!seg) return next();                        // /products/ 本身 = 全部产品列表页
  if (KNOWN.has(seg)) return next();              // ① 先查分类清单

  // ② 再按编号解析。**只认末尾 `-{数字}`,前面的字随便** —— 编号做主,名字只是装饰,
  //    所以改产品名 / 改机型 / 改品类,旧链接永远解析得回同一个产品。
  const idm = /-(\d+)$/.exec(seg);
  if (idm) {
    const canon = CANON.get(idm[1]);
    if (canon && canon !== seg) {                 // slug 不规范 → 归一
      return Response.redirect(`${url.origin}${dir}/products/${canon}${url.search}`, 301);
    }
    return next();
  }

  // ③ 既不是已知分类、也解析不出编号 —— 交回静态层。
  //    **不在这里判 404**:那等于宣称"清单没收录的都不存在",清单漏一条就是误杀;
  //    静态层找不到文件时自己会 404,那是有据可查的。
  return next();
}
