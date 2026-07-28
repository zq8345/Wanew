// 产品 URL 的 slug 派生 —— 实现已搬到 functions/_lib/page-paths.js。
//
// 🔴 搬家的理由:Admin 的 Worker 也要算它(保存产品时算出 path 写进 manifest),
//    而 Admin 只能 vendor `functions/_lib/` 下的纯模块 —— scripts/ 不在它的镜像范围里。
//    留这个再导出,是为了 regen 与既有 import 一个字都不用改。
export { productSlug, productPath } from "../functions/_lib/page-paths.js";
