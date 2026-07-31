// 堵口：wanew-internal-docs/ 是内部审计/交接文档，而 Pages 的 repo 根 = 部署根
// ⇒ 提交进来就等于 https://wanew.com/wanew-internal-docs/<文件> 公开可下载。
//
// 🔴 2026-07-30 实测：这个目录当时【是 200】，里面躺着 audit-report-2026-07-30.md ——
//    一份逐条列出"哪些路径没堵、哪里有洞"的安全审计报告，公网可直接下载。
//
// ⚠️ 那天我先测过一次并得出"已堵(404)"的结论，那是【假的】：我测的那个文件当时还没提交，
//    404 的原因是文件不存在，不是堵口生效。**用一个不存在的样本去证明拦截有效，永远会成功。**
//    ⇒ 测堵口必须用【确实存在于仓里】的文件。
//
// 不用 _redirects：CF Pages 的 _redirects 对 4xx 语义不明，且静态资产会先命中；
// Pages Functions 优先于静态资产，是这个仓已验证过的机制（同 admin-worker/[[path]].js）。
export function onRequest() {
  return new Response("Not found", { status: 404 });
}
