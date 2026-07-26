#!/usr/bin/env node
/**
 * 第三方品牌残留扫描 —— 按【字段归属】分类
 *
 * 用途：**Joe 审完 64 个产品后跑这个**，一眼看出哪些派生物没跟着干净。
 *   Joe 的地盘（后台能改）  ：title / description_html / summary_html / images[].alt
 *   我们的地盘（后台改不到）：meta_title / meta_description / keywords / jsonld_product
 *
 * ⚠️⚠️ 各字段会不会「跟着源头自动干净」——**逐个不同，别想当然**：
 *   meta_title       ✅ 会 —— 但**不是因为后台**，是 dev 的 R2 派生它
 *                    (render.js:20 `meta_title is deliberately NOT read from data — it is DERIVED`)
 *                    ⛔ **绝不手改**：手改的值会被派生覆盖，或造成半英半葡（我踩过，scanner 抓到我自己的）
 *   keywords         ❌ 不会 —— 独立存储。**但 Joe 决定整个字段删掉（全站死字段）→ 自动消失**
 *   meta_description ❌ 不会 —— 独立存储，且 dev 明确 R2 **不派生它**
 *   jsonld_product   ❌ 不会 —— 后台根本没这个输入框
 *
 * ⭐ 我在这里栽过一个**方法层面**的错，写下来免得重蹈：
 *   我看到 `meta_title` 以 `title` 开头（5/5 吻合），就断定「它是派生的 → Joe 改完自动干净」。
 *   **错。** 读后台代码才知道：`meta_title: en.meta_title || en.title` ——
 *   `||` **只在空值时回退**，有值就**原样存**。后台还给这三个字段各配了一个可编辑 textarea。
 *   → **「曾经是派生生成的」≠「每次编辑时会重新派生」。这是两个不同的断言。**
 *   → **证据是真的（前缀吻合），推论是假的。要断言「X 由 Y 派生」，必须读那段派生代码。**
 *
 * ⭐ 对账原则：每个品牌「整个 JSON 里出现的总数」必须 = 各字段之和。
 *   差额报成「⚠️未归类字段」—— **匹配不上的要吼出来，不是悄悄跳过。**
 *   （来自四次教训：!src 跳过 177 张 CDN 图 / ?v= 判错 656 / <img/> 空标签 / 文件存在+200=好图）
 *
 * 用法：node scripts/brand-residue-scan.mjs
 */
import fs from 'fs';
import path from 'path';
const BRANDS = ['XLinkShop', 'XLinkCore', 'STARGEAR', 'linkoostar', 'DaierTek', 'starlingkshop', 'Dbilida', 'TP-Link', 'TP Link', '深圳市星链', '星链网络配件'];
const OURS = ['meta_title', 'meta_description', 'keywords'];        // 后台改不到 = 我们的
const JOES = ['title', 'description_html', 'summary_html'];          // 后台能改 = Joe 的
const rx = (b) => new RegExp(b.replace(/[-\s]/g, '[-\\s]?'), 'gi');
const count = (s, b) => (String(s || '').match(rx(b)) || []).length;

const rows = [];
for (const f of fs.readdirSync('data/products').filter((x) => x.endsWith('.json')).sort()) {
  const id = f.replace('.json', '');
  const p = JSON.parse(fs.readFileSync('data/products/' + f, 'utf8'));
  for (const b of BRANDS) {
    // 我们的字段
    for (const loc of Object.keys(p.i18n || {})) {
      for (const fld of OURS) {
        const n = count(p.i18n[loc][fld], b);
        if (n) rows.push({ id, brand: b, field: `i18n.${loc}.${fld}`, n, own: 'OURS' });
      }
    }
    // 顶层：jsonld
    for (const fld of ['jsonld_product', 'jsonld_breadcrumb']) {
      const n = count(p[fld], b);
      if (n) rows.push({ id, brand: b, field: fld, n, own: 'OURS' });
    }
    // Joe 的字段（只统计，不动）
    for (const loc of Object.keys(p.i18n || {})) {
      for (const fld of JOES) {
        const n = count(p.i18n[loc][fld], b);
        if (n) rows.push({ id, brand: b, field: `i18n.${loc}.${fld}`, n, own: 'JOE' });
      }
    }
    const altN = (p.images || []).reduce((s, im) => s + count(im.alt, b), 0);
    if (altN) rows.push({ id, brand: b, field: 'images[].alt', n: altN, own: 'JOE' });
    // ⚠️ 兜底：整个 JSON 里的总数，用来对账有没有漏字段
    const total = count(JSON.stringify(p), b);
    const accounted = rows.filter((r) => r.id === id && r.brand === b).reduce((s, r) => s + r.n, 0);
    if (total !== accounted) rows.push({ id, brand: b, field: '⚠️未归类字段', n: total - accounted, own: '???' });
  }
}

const ours = rows.filter((r) => r.own === 'OURS');
const joes = rows.filter((r) => r.own === 'JOE');
const unk = rows.filter((r) => r.own === '???');

console.log('=== ✅ 我们的（后台改不到）===');
ours.forEach((r) => console.log(`  ${r.id.padEnd(5)} ${r.field.padEnd(28)} ${r.brand.padEnd(14)} ×${r.n}`));
console.log(`  小计 ${ours.reduce((s, r) => s + r.n, 0)} 处 / ${ours.length} 个字段位`);
console.log('\n=== ⛔ Joe 的（后台能改，不碰）===');
joes.forEach((r) => console.log(`  ${r.id.padEnd(5)} ${r.field.padEnd(28)} ${r.brand.padEnd(14)} ×${r.n}`));
console.log(`  小计 ${joes.reduce((s, r) => s + r.n, 0)} 处`);
if (unk.length) {
  console.log('\n=== ⚠️ 对账差额（有字段我没归类到！）===');
  unk.forEach((r) => console.log(`  ${r.id} ${r.brand} 差 ${r.n} 处`));
} else console.log('\n✅ 对账平：每一处都归到了具体字段，无遗漏');

// ── 全站文件层字节扫描（补上产品 JSON 之外的漏网：资产文件 / 非产品页 / EXIF 内嵌） ──
// ⭐ 教训（2026-07-26）：XLinkCore 老前台图混进 /video/、且有 HTML 错误页伪装成 .jpg/.png/.woff
//    （同一 md5 存 3 个扩展名），全被"只扫 data/products JSON"漏掉。原始字节 grep 覆盖：
//    ① HTML 伪装资产 ② 图片/字体 EXIF 内嵌品牌串 ③ 非产品页（/video/ 等）文本层。
//    ⚠️ 视觉水印（烤进画面的 logo/文字）字节扫不到 → 仍需人工过眼（见 Joe 清单）。
// scripts/ = 构建期开发工具(不作为内容服务);es-glossary.json = 违禁词表 —— 都【按设计】列品牌名做
// 检测目标,不是站点内容泄漏,排除以免噪声淹没真泄漏。扫描面 = 部署给用户的内容/资产。
const SKIP = new Set(['.git', 'node_modules', '.wrangler', 'scripts']);
const SKIP_FILE = new Set(['data/es-glossary.json']);
const assetHits = [];
(function walk(d) {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    if (SKIP.has(e.name)) continue;
    const fp = path.join(d, e.name);
    if (e.isDirectory()) { walk(fp); continue; }
    if (SKIP_FILE.has(fp.replace(/\\/g, '/').replace(/^\.\//, ''))) continue;
    let buf; try { buf = fs.readFileSync(fp, 'latin1'); } catch { continue; }
    for (const b of BRANDS) { const n = (buf.match(rx(b)) || []).length; if (n) assetHits.push({ file: fp.replace(/\\/g, '/'), brand: b, n }); }
  }
})('.');
console.log('\n=== 🖼 全站文件层（资产 / 非产品页 / EXIF 字节）===');
if (assetHits.length) { assetHits.forEach((h) => console.log(`  ⛔ ${h.file}  ${h.brand} ×${h.n}`)); console.log(`  ⛔ ${assetHits.length} 处品牌残留 —— 清掉！`); }
else console.log('  ✅ 0 品牌残留（资产 / EXIF / 非产品页文本层）；⚠️ 视觉水印仍需人工过眼');
