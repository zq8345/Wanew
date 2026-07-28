// 产品 URL 的 slug 派生 —— **唯一实现**。
//
// 🔴 为什么单独成模块:规范 URL 由 regen 算,而跳转层(Pages Function)要判断"来的这个
//    slug 是不是规范的"。两边必须用【同一份】规则 —— 两处各写一遍,就是两套会分头漂的规则,
//    而分头漂的症状是"某些产品的规范 URL 自己 301 到自己"(重定向循环),极难查。
//    ⚠️ 但 Function 【不 import 它】:派生结果写进 data/products-index.json,Function 读结果。
//       算一次、存下来、到处读 —— 比"到处算、指望算得一样"可靠。
//
// 规则(总工 2026-07-28 定,+ 我补的两端处理):
//   ① 括号内容整块剥掉("(2 Pack)" 这类包装说明不是产品名)
//   ② 剥掉【开头】的填充词与纯数字包装词
//   ③ 取前 6 词 —— 不收到 5:少一个词换来的可读性,不抵丢掉一个信息词
//   ④ 🔴 再剥掉【末尾】的填充词。**这一条是补的**:原规则只说剥开头,
//      而剥掉开头的 for 之后取 6 词,会把句中另一个 for 拉到末尾 ——
//      `for-starlink-performance-adapter-gen-3` → `starlink-…-gen-3-for`。
//      **改规则要看两端**,和"改一个刻度点要看它两侧的整片区间"是同一条。
//   ⑤ 超 50 字符按【词边界】截断,不许截半个词;截完可能又露出填充词,再剥一次
//   ⑥ `starlink` 保留 —— 买家真会搜的词,不算噪音(实测 65/68 条含它)
//
// ⚠️ `2-in-1` 这类【规格】不是填充:它在标题里是连字符连着的一个词,不会被 ② 剥掉。
//    我第一版的检查判据 `/^\d/` 把它报成了违规 —— **判据太宽会把正确行为报成错误**。

const FILLER = /^(for|the|a|an|of|to|with|and|new|hot|pack|packs)$/;
const TRAIL = /-(?:for|the|a|an|of|to|with|and)$/;
const MAX = 50;

export function productSlug(title) {
  let w = String(title || "")
    .toLowerCase()
    .replace(/\([^)]*\)/g, " ")        // ① 括号内容
    .replace(/[^\w\s-]/g, " ")
    .split(/\s+/)
    .filter(Boolean);
  // ② 开头
  while (w.length && (FILLER.test(w[0]) || /^\d+$/.test(w[0]) || /^\d+-?packs?$/.test(w[0]))) w.shift();
  w = w.slice(0, 6);                   // ③
  while (w.length && FILLER.test(w[w.length - 1])) w.pop();   // ④ 末尾
  let out = w.join("-").replace(/-+/g, "-").replace(/^-|-$/g, "");
  if (out.length > MAX) {              // ⑤ 按词边界截
    const kept = [];
    for (const x of out.split("-")) { if ((kept.join("-") + "-" + x).length > MAX) break; kept.push(x); }
    out = kept.join("-");
  }
  while (TRAIL.test(out)) out = out.replace(/-[a-z]+$/, "");
  return out;
}

// 规范 URL 路径段:`{slug}-{id}`。
// 🔴 **编号做主,名字只是装饰** —— 路由只认末尾 `-{digits}`,前面的字随便。
//    所以改产品名、改机型、改品类,旧链接永远能解析回同一个产品。
export function productPath(title, id) {
  const s = productSlug(title);
  return s ? `${s}-${id}` : String(id);
}
