/**
 * /pt/products/* 的挂载点。判据在 functions/_lib/product-route.js(四个挂载点共用)。
 *
 * 🔴 **这个文件不是冗余,删了就是静默的坏。** CF Pages Functions 按文件路径挂载:
 *    functions/products/[[path]].js 只匹配 /products/*,**不匹配 /pt/products/***。
 *    在产上正是缺了这三个文件,导致 es/pt/zh 的非规范 slug 返回 404 而不是 301,
 *    而 16 条闸 + 21 条路由断言**全绿** —— 判据测的是逻辑,挂载是它的盲区。
 */
export { handleProductRoute as onRequest } from "../../_lib/product-route.js";
