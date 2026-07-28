/**
 * /products/* 的路由层:分类页放行、产品页归一到规范 URL。
 *
 * 🔴 第一条、也是最容易致命的一条:**CF Pages Functions 优先于静态资源。**
 *    这个文件挂在 `/products/[[path]]` 上,于是【所有】/products/* 请求都先进这里 ——
 *    包括本该由静态文件服务的分类页与产品详情页。
 *    **漏掉 `context.next()` 就是产品区全站白屏**,而闸不会发现:闸看的是产出文件,
 *    文件确实都在;变的是"谁来响应"。同目录的 functions/scripts/[[path]].js 正是靠同一个
 *    机制把整个前缀强制 404 —— 同一把刀,两个方向。
 *
 * ⚠️ 这一步【不做旧址 → 新址的 301】。我最初的五步计划把它排在这里并写着"旧址仍有静态页兜底",
 *    那句是错的:**Function 一旦返回 301,静态页就不会被服务了,双活当场结束。**
 *    旧址 301 与"删旧址静态页 + 切内链 + 换 sitemap"是同一件事,归第 5 步。
 *
 * 路由判据(总工 2026-07-28 定):**先查分类清单,再按编号解析。**
 *   /products/{x}/  → x ∈ 已知分类 → 放行给静态
 *   /products/{x}   → 末尾 -{digits} 解析 id → 与规范 slug 比,不同则 301
 *
 * 🔴 **不许用"末尾是数字"这类模式判分类还是产品** —— `performance-gen-1` 以 `-1` 结尾,
 *    会被吃成 1 号产品。所以顺序是【先查清单】,而且与尾斜杠无关:用户和爬虫不保证带尾斜杠,
 *    靠尾斜杠区分等于把判据建在一个我们控制不了的输入上。
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

export async function onRequest(context) {
  const { request, next } = context;
  const url = new URL(request.url);
  const m = /^\/(?:(es|pt|zh)\/)?products\/?(.*)$/.exec(url.pathname);
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
