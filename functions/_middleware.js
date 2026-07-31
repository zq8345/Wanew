/* 根级堵口:仓库根 = 部署根,所以任何提交进来的开发文档都是公网可下载的。
 *
 * 🔴 实测(2026-07-30/31,均为【已提交且确实存在】的文件):
 *      /5b-handoff.md  /DESIGN.md  /i18n-baseline.md  /phase2-convert.js   → 200，公开
 *    其中交接文档逐条写着迁移进度、未修的洞、以及哪些路径没堵。
 *
 * ⚠️ **按【模式】堵,不按文件名列清单。**
 *    列清单的堵口只挡住"今天存在的那几个文件" —— 下一份文档落进仓根时,清单不会自己长出来,
 *    而没有人会记得回来加。这正是这个项目里反复出现的那一类:**需要人记得的防线,命中率是 0。**
 *
 * ⚠️ 不用 `_redirects`:它对 4xx 语义不明,且静态资产会先命中。
 *    Pages Functions 优先于静态资产 —— 这是本仓已验证过的机制(同 admin-worker / wanew-internal-docs)。
 *
 * ⚠️ 这里是 **_middleware**,不是 `[[path]].js`:根级 `[[path]].js` 会接管【整站每一个请求】。
 *    middleware 只做一件事 —— 命中模式就 404,否则原样放行 `next()`。
 *
 * 🔴 测堵口必须用【确实存在于仓里】的文件。用一个不存在的路径去证明拦截有效,永远会成功 ——
 *    2026-07-30 就是这么得出过一次"已堵"的假结论。
 */

/* 每条都写明它挡的是哪一类,而不是哪一个文件。 */
const BLOCKED = [
  // ① 任何位置的 Markdown。站点不提供 .md,所以整类都不该被服务 ——
  //    这样新文档落在仓根、scripts/、还是别处,都不需要有人回来改这份规则。
  /\.md$/i,
  // ② 仓根的脚本与配置。/skin/js/*.js 这类真实资产在子目录里,不受影响。
  /^\/[^/]+\.(mjs|cjs|ts|sh|ps1)$/i,
  /^\/phase2-convert\.js$/i,
  // ③ 点开头的配置文件(.gitignore/.gitattributes/.claude 之类),任何层级。
  /(^|\/)\.[^/]+$/,
  // ④ 后台外壳:后台早已是独立仓,这里只剩一个空壳,不该对外可达。
  /^\/admin(\/|$)/i,
];

export async function onRequest(context) {
  const { pathname } = new URL(context.request.url);
  if (BLOCKED.some((re) => re.test(pathname))) {
    return new Response("Not found", { status: 404 });
  }
  return context.next();
}
