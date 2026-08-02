/* <main id="main-content"> 地标 —— 跳过导航链接的落点,同时补上全站缺失的 main 地标。
 *
 * 🔴 为什么它【不】走 chrome 注入(这是本模块存在的全部理由,删之前先读完):
 *    functions/_lib/chrome.js 的 header 锚点区间 = [<header class="main-header clearfix"> … 第一个 </header>]。
 *    <main> 的开标签必须在 </header> 【外面】,而区间到 </header> 就截止 —— 写在外面的东西不在
 *    替换区间里,于是第二次构建时旧的还在、新的又插一个,**每跑一次构建多一个落点**。
 *    要让区间覆盖它就得改 ANCHORS 的结束标记:那是 vendor 文件(admin 镜像同一份),而且首次运行时
 *    新结束标记在旧页面里根本不存在 → sliceBetween 找不到锚点 → 全站报「找不到锚点 header」。
 *
 * ✅ 所以:一条插入规则,两个应用点,两处都【幂等】(已有就原样返回):
 *    ① data/templates/*.html —— 覆盖 regen 写的 365 页。**后台用的是同一批模板**,
 *       所以 Joe 在后台按保存重烘焙首页/产品页时,落点跟着模板一起出来,不会掉。
 *       (只放 chrome-sync 里就有这个洞:后台发布完的页面没有落点,而跳过链接照样指着它。)
 *    ② scripts/chrome-sync.mjs —— 兜底 regen 管不到的那批老页面(mini/standard/enterprise/type/…,
 *       实测 682 个 HTML 里 regen 只写 365 个)。
 *    规则只有一条,所以两个应用点不会长出两种行为。
 */

const OPEN = `<main id="main-content" tabindex="-1">`;
const CLOSE = `</main>`;

export function ensureLandmark(html) {
  if (html.includes(`id="main-content"`)) return { html, changed: false, why: "已有" };
  const h = html.indexOf("</header>");
  const f = html.indexOf(`<footer class="site-footer">`);
  if (h < 0 || f < 0 || f < h) return { html, changed: false, why: "无 header/footer 锚点" };

  let start = h + "</header>".length;

  // .stricky-header 在源码里是个空壳(实测可聚焦元素 0),但站上的脚本会在滚动时把导航克隆进去。
  // 落点若起在它【之前】,用户跳到正文后再按 Tab 会掉进那份克隆导航 —— 正是这条链接要避免的事。
  // 有它就跨过去:从它的 <div 起做括号配平,配到它自己的 </div>。
  const m = html.slice(start).match(/^\s*<div class="stricky-header[^"]*"[^>]*>/);
  if (m) {
    let depth = 1, end = -1;
    const re = /<div\b|<\/div>/g;
    re.lastIndex = start + m[0].length;
    let t;
    while ((t = re.exec(html))) {
      depth += t[0] === "</div>" ? -1 : 1;
      if (!depth) { end = t.index + t[0].length; break; }
    }
    if (end < 0) return { html, changed: false, why: "stricky-header 括号配不平" };
    start = end;
  }

  return {
    html: html.slice(0, start) + "\n" + OPEN + html.slice(start, f) + CLOSE + "\n" + html.slice(f),
    changed: true, why: "已插入",
  };
}
