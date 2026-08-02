/* 筛选 chip 必须来自它那一维的真源 —— 两轴都查。
 *
 * 🔴 为什么存在:2026-08-01 实测,91 个带 chip 的列表页里 **35 个的「类型」行装的是机型 chip**
 *    (连容器 id 都是 modelChips),而计数是"对"的 —— updateChips 老老实实按机型在本页 scope 内数,
 *    /type/power/ 的 7 件恰好全是 mini ⇒ Mini 7、其余 0。**维度错、数字对,肉眼极难发现。**
 *    另有一格 data-filter="performance-gen-3" 显示成「Power & Charging」——本页自己的类型名。
 *
 * ⭐ 判据是【比真源】,不是【比字面量】(总工 2026-08-01,当晚第四次栽在同一形态上之后定的):
 *      chip 文案必须 === 真源里的显示名
 *    而不是 "不得是英文" / "不得等于本页名字" 这类否定式 ——
 *    **否定式判据认得几种错法,就只能查出几种;比真源只有一个正确答案。**
 *
 * ⚠️ chip 有两种载体,两种都要认(我第一版只认 <button data-filter>,把 87 页的 <a> 导航行
 *    数成了"空行",造出一个不存在的缺陷):
 *      <button data-filter="mini">              就地筛选
 *      <a class="product-chip" href="/products/mini/">   机型导航,【没有 data-filter】
 *
 * ⚠️ 不查【次序】:正确页的 chip 次序(mounts/power/cables…)与 forms.json 的数组序
 *    (cables/mounts/power…)不同。次序要不要统一是另一件事(已报总工),这里不把它写成判据 ——
 *    否则 56 个本来正确的页会全红。
 */
import fs from "fs";
import path from "path";
import { FORM_LABEL_KEY, applyFormNames } from "../functions/_lib/chrome.js";

const SKIP = new Set([".git", "node_modules", "skin", "static", "data", "scripts", "functions", "admin", "admin-worker"]);
const walk = (d, o = []) => {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    if (e.name.startsWith(".") || SKIP.has(e.name)) continue;
    const p = path.join(d, e.name);
    if (e.isDirectory()) walk(p, o);
    else if (e.name === "index.html") o.push(p.split(path.sep).join("/").replace(/^\.\//, ""));
  }
  return o;
};

const MODEL_DISPLAY = JSON.parse(fs.readFileSync("data/locales.json", "utf8")).model_display;
const FORMS = JSON.parse(fs.readFileSync("data/forms.json", "utf8")).forms;
/* ⚠️ 必须套 applyFormNames —— 渲染侧读的是它覆盖【之后】的 catalog(regen.mjs:161 / publish.ts:196)。
   我第一版直接读 chrome.json 原文,于是 header.power_charging 拿到的是「Power & Charging」,
   而页面上是「Charging」(forms.json 的 name 覆盖了它)⇒ 闸把 206 处正确的判成了错的。
   **"真源"不是"某个文件里的字面量",是"渲染那一刻真正生效的那个值"。** */
const CHROME = applyFormNames(JSON.parse(fs.readFileSync("data/chrome.json", "utf8")), FORMS);
const localeOf = (f) => (/^pt\//.test(f) ? "pt-BR" : /^es\//.test(f) ? "es-MX" : /^zh\//.test(f) ? "zh" : "en");
const pick = (key, loc) => {
  const e = CHROME[key];
  return e ? (e[loc] ?? e.en) : null;
};
const keyOfHref = (h) => (/\/(?:products|type)\/([a-z0-9-]+)\/?$/.exec(String(h)) || [])[1] || null;
const unesc = (s) => String(s).replace(/&amp;/g, "&").replace(/&#39;/g, "'").replace(/&quot;/g, '"').trim();

const pages = walk(".");
if (!pages.length) { console.error("❌ 仪器无效:一个 index.html 都没扫到。"); process.exit(9); }
if (!Object.keys(MODEL_DISPLAY).length || !FORMS.length) { console.error("❌ 仪器无效:真源读不到。"); process.exit(9); }

let checked = 0;
const bad = [];
for (const f of pages) {
  const s = fs.readFileSync(f, "utf8");
  if (!s.includes("product-chiprow")) continue;
  const loc = localeOf(f);
  const rows = [...s.matchAll(/<div class="product-chiprow">[\s\S]*?<\/div>\s*<\/div>/g)].map((m) => m[0]);
  if (rows.length !== 2) { bad.push(`${f}  chiprow ${rows.length} 行(应 2)`); continue; }
  const allWord = pick("list.chip.all", loc);
  rows.forEach((seg, i) => {
    const axis = i === 0 ? "机型" : "类型";
    const chips = [];
    for (const m of seg.matchAll(/<button\b[^>]*data-filter="([^"]*)"[^>]*>([^<]*)<span/g)) chips.push([m[1], unesc(m[2])]);
    for (const m of seg.matchAll(/<a class="product-chip[^"]*" href="([^"]*)"[^>]*>([^<]*)<span/g)) {
      const k = keyOfHref(m[1]);
      chips.push([k || "all", unesc(m[2])]);
    }
    if (!chips.length) { bad.push(`${f}  ${axis}轴那一行没有任何 chip`); return; }
    for (const [k, label] of chips) {
      checked++;
      if (k === "all") continue;                       // All 的文案由 list.chip.all 管,不属维度取值集
      /* ⭐ 【维度归属】两轴都查:key 必须属于该轴的取值集。这一条是确定的,没有争议。 */
      const inAxis = axis === "机型" ? (k in MODEL_DISPLAY) : FORMS.some((x) => x.key === k);
      if (!inAxis) { bad.push(`${f}  ${axis}轴出现不属于该维度的 key「${k}」`); continue; }
      /* ⭐ 【文案 === 真源】目前只查【类型轴】。
         🔴 不是偷懒,是这条判据在机型轴上【还没被裁定】:机型导航行用的是缩写
            (Perf Gen1 / Perf Gen3),而 model_display 写的是 Performance (Gen 1)/(Gen 3)。
            实测 179 个 chip、约 89 页是这个形态。它可能是有意的窄行缩写,也可能是真分叉 ——
            **没人裁定之前把它写成断言,等于把我的猜测固化成规则。**
         ⚠️ 也不为了让自己这批通过就把判据整条删掉:类型轴这一条是有据的
            (forms.json 是声明过的真源,而且渲染链确实经 applyFormNames 生效),照查。
         已报总工,等他裁定后把机型轴一并纳入 —— 那时这段注释连同 if 一起删。 */
      if (axis !== "类型") continue;
      const want = FORM_LABEL_KEY[k] ? pick(FORM_LABEL_KEY[k], loc) : (FORMS.find((x) => x.key === k) || {}).name;
      if (want === undefined || want === null) { bad.push(`${f}  类型轴 ${k} 在真源里查不到显示名`); continue; }
      if (unesc(want) !== label) bad.push(`${f}  类型轴 ${k} 显示「${label}」· 真源是「${unesc(want)}」`);
    }
    void allWord;
  });
}

console.log(`【chip 必须来自它那一维的真源】页面 ${pages.length} · 检了 ${checked} 个 chip`);
console.log(`  🔴 与真源不符 / 维度不属:${bad.length}  ${bad.length ? "🔴" : "✅"}`);
bad.slice(0, 15).forEach((x) => console.log(`     ${x}`));
if (bad.length > 15) console.log(`     … 还有 ${bad.length - 15} 处`);
// ⚠️ 退出码写在【这一行】。会喊红但不拦人的闸，比没有闸更坏(今晚栽过一次)。
process.exit(bad.length ? 1 : 0);
