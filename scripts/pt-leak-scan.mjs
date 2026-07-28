#!/usr/bin/env node
/**
 * pt-leak-scan — 扫 pt/**\/*.html 的「可见文本」里残留的英文, 发现即 exit 1 (可当 CI / pre-push).
 *
 * 只扫用户可见的东西:
 *   - 标签之间的文字节点
 *   - 可见属性: placeholder / alt / title / aria-label
 * 不扫: <script>/<style>/注释 / class / href / src / id / data-* / JSON-LD(在 script 内)
 *
 * 判定思路: 先剔除「合法保持英文」的白名单(机型名/规格token/品牌/pt通用外来词/单位数值),
 * 再看剩下的词里有没有「无歧义英文标记词」(刻意避开与葡语同形的 a/o/e/as/do/no/para/de/com/mais/total…).
 *
 * 用法: node scripts/pt-leak-scan.mjs [--json] [--max N]
 * 退出: 0 = 无泄漏; 1 = 有泄漏
 */
import fs from 'fs';
import path from 'path';

/* ⚠️ 白名单/标记表 = 「考卷」. 改动必须 bump 版本并知会总调度 —— 否则基线不可比,
   等于自己给自己打分. 基线快照见 scripts/pt-leak-baseline.json */
export const SCANNER_VERSION = '1.1.0';   // 1.1.0:加 FORMAT_LEAKS 格式判据(多语言窗规格 2026-07-28)

const ROOT = process.cwd();
const PT_DIR = path.join(ROOT, 'pt');
const AS_JSON = process.argv.includes('--json');
const MAX_IX = process.argv.indexOf('--max');
const MAX = MAX_IX >= 0 ? Number(process.argv[MAX_IX + 1]) : Infinity;

/* ─────────── 白名单: 合法保持英文 (多词优先, 顺序=先长后短) ─────────── */
const WHITELIST = [
  // ⚠️ 多词条目必须排在单词之前, 否则单词条目(如 \bStarlink\b)会先把中间词剔掉, 多词就再也匹配不上
  // 品牌全称 (W2e:Joe 口径=假法名「…Limited」不再造,词条跟着改成 3 词品牌名。
  //  故意【不】保留旧 4 词条目:若「…Limited」重现,不该被白名单静默——多出的 Limited 自己不报警,
  //  但至少不是这里主动豁免的。真法名 WanLiu Group Co., Limited 另有绝不动的豁免约定。)
  /\bWanew\s+Starlink\s+Accessories\b/gi,
  // 机型 / 产品线 (多词在前)
  /\bStandard\s+Actuated\b/gi, /\bStandard\s+Circular\b/gi, /\bFlat\s+High[-\s]Performance\b/gi,
  /\bHigh[-\s]Performance\b/gi, /\bPerformance\s*\(?\s*Gen\s*\d\s*\)?/gi, /\bGen\s*\d\b/gi,
  /\bRectangular\s+Satellite\b/gi, /\bMesh\s+Router\b/gi, /\bInternet\s+Kit\b/gi,  // Starlink 型号名
  // 技术全称 (缩写的展开式 = 合法英文技术术语)
  /\bPower\s+over\s+Ethernet\b/gi, /\bPower\s+Delivery\b/gi,
  /\bStarlink\s+Mini\b/gi, /\bStarlink\b/gi, /\bMini\b/gi, /\bStandard\b/gi, /\bEnterprise\b/gi,
  /\bPerformance\b/gi, /\bActuated\b/gi, /\bCircular\b/gi, /\bDishy\b/gi, /\bV[23]\b/g,
  // 品牌 / 站名
  /\bWanew\b/gi, /\bSpaceX\b/gi, /\bSTARGEAR\b/gi, /\bXLinkShop\b/gi, /\bstarlingkshop\b/gi,
  /\bDaierTek\b/gi, /\bTheLAShop\b/gi, /\bZinweyton\b/gi, /\blinkoostar\b/gi, /\bStar\s?Link\b/gi,
  // 规格 / 技术 token
  /\bRJ\s?45\b/gi, /\bIP\s?6\d\b/gi, /\bIP\d0\b/gi, /\bPoE\b/gi, /\bPOE\b/g,
  /\bType[-\s]?C\b/gi, /\bUSB[-\s]?[AC]?\b/gi, /\bDC\b/g, /\bAC\b/g, /\bPD\b/g,
  /\bCat\s?\d[A-Z]?\b/gi, /\bCAT5E\b/gi, /\bT568B\b/gi, /\bCM[XR]\b/g, /\bEthernet\b/gi,
  /\bSPX\b/gi, /\bE-?MARKER\b/gi, /\bDC\d{4}\b/gi, /\bUL\d+\b/gi, /\bLED\b/gi,
  // 认证 / 商务缩写
  /\b(OEM|ODM|MOQ|DDP|ISO|RoHS|CE|FCC|QC|XML|FAQ|DHL|FedEx|SKU|CIF|FOB|EXW)\b/g,
  /\bISO\s?\d+\b/gi, /\bP&amp;D\b/gi, /\bP&D\b/gi,
  // 数值 + 单位 (含尺寸/长度/功率)
  /\b\d+(?:[.,]\d+)?\s*(?:W|V|A|mA|mAh|Wh|Hz|K|Mbps|Gbps|MB|GB|FT|ft|M|m|mm|cm|in|inch|polegadas|AWG|Lbs|lbs|kg|g|°C|%)\b/gi,
  /\b\d+\s*[x×*]\s*\d+(?:[.,]\d+)?\s*(?:mm|cm|m)?\b/gi, /\b\d+\/\d+\b/g, /\b\d+(?:[.,]\d+)?\b/g,
  // pt-BR 通用外来词 / 已入乡随俗 (多词在前)
  /\bpower\s?bank\b/gi, /\bplug[-\s]and[-\s]play\b/gi, /\bplug[-\s]?&[-\s]?play\b/gi,
  /\boff[-\s]grid\b/gi, /\boff[-\s]road\b/gi, /\bnotebook\b/gi, /\bdesign\b/gi, /\bkit\b/gi,
  /\bcamping\b/gi, /\bmotorhome\b/gi, /\bvan(s)?\b/gi, /\bbooster\b/gi, /\bboost\b/gi,
  /\bupgrade\b/gi, /\bdock\b/gi,
  /\bdisplay\b/gi, /\bonline\b/gi, /\bsite\b/gi, /\be-?mail\b/gi, /\blink\b/gi, /\bshop\b/gi,
  /\bhome[-\s]?offices?\b/gi, /\bslim\b/gi, /\bflat\b/gi, /\bpack\b/gi, /\bsetup\b/gi, /\bhub\b/gi,
  /\bcases?\b/gi,   // pt-BR 通用外来词, 且与我的 chrome 术语 "Cases e Proteção" 一致
  /\bstatus\b/gi, /\bcheck[-\s]?list\b/gi, /\bmarketing\b/gi, /\bweb\b/gi,
  // HTML 实体 / 符号
  /&[a-z]+;/gi, /&#\d+;/g,
];

/* ─────────── 无歧义英文标记词 (确定不是葡语) ─────────── */
/* 刻意排除与 pt 同形/近形: a, o, e, as, os, do, da, no, na, em, de, com, por, se, ou,
   mais, so, ate, total, normal, industrial, material, natural, digital, original, final,
   central, radio, ideal, principal, local, real, social, legal, animal, capital … */
const EN_MARKERS = new Set([
  // 功能词
  'the', 'and', 'with', 'your', 'yours', 'our', 'ours', 'this', 'that', 'these', 'those',
  'of', 'is', 'are', 'was', 'were', 'be', 'been', 'being', 'am',
  'from', 'they', 'them', 'their', 'theirs', 'there', 'here', 'we', 'you', 'it', 'its',
  'which', 'what', 'when', 'where', 'why', 'who', 'whom', 'whose', 'how',
  'will', 'would', 'shall', 'should', 'can', 'could', 'may', 'might', 'must',
  'have', 'has', 'had', 'having', 'does', 'did', 'doing',
  'into', 'onto', 'over', 'under', 'above', 'below', 'after', 'before', 'while', 'about',
  'between', 'through', 'during', 'without', 'within', 'upon', 'against', 'across', 'along',
  'each', 'every', 'both', 'another', 'such', 'only', 'just', 'very', 'much', 'many', 'few',
  'more', 'most', 'any', 'some', 'all', 'also', 'than', 'then', 'because', 'however',
  'first', 'second', 'last', 'next', 'other', 'others', 'same', 'own',
  'but', 'nor', 'yet', 'though', 'although', 'unless', 'until', 'whether',
  // 常见内容词 (英文营销文案里高频, 且非葡语)
  'best', 'better', 'good', 'great', 'new', 'old', 'high', 'low', 'long', 'short', 'small',
  'large', 'wide', 'easy', 'easily', 'simple', 'simply', 'quick', 'quickly', 'fast', 'strong',
  'safe', 'safely', 'secure', 'reliable', 'durable', 'sturdy', 'lightweight', 'heavy',
  // ⚠️ 已剔除与葡语同形: use(usar祈使) ideal complete(completar祈使) data(日期) total normal
  'perfect', 'ready', 'free', 'full', 'quality',
  'get', 'got', 'make', 'makes', 'made', 'uses', 'used', 'using', 'need', 'needs',
  'want', 'help', 'helps', 'allow', 'allows', 'keep', 'keeps', 'stay', 'stays',
  'work', 'works', 'working', 'provide', 'provides', 'ensure', 'ensures', 'include',
  'includes', 'including', 'feature', 'features', 'featuring', 'designed', 'built',
  'support', 'supports', 'supported', 'install', 'installed', 'installing', 'installation',
  'connect', 'connects', 'connected', 'connection', 'charge', 'charging', 'charger',
  'cable', 'cables', 'wire', 'wires', 'power', 'adapter', 'adapters', 'mount', 'mounts',
  'mounting', 'bracket', 'brackets', 'waterproof', 'weatherproof', 'extension', 'replacement',
  'connector', 'connectors', 'coupler', 'device', 'devices', 'product', 'products',
  'solution', 'solutions', 'accessory', 'accessories', 'package', 'contents', 'specification',
  'specifications', 'warranty', 'shipping', 'delivery', 'order', 'orders', 'buy', 'price',
  'guide', 'guides', 'guarantee', 'customer', 'customers', 'service', 'services',
  'seamless', 'upgrade', 'experience', 'enhance', 'elevate', 'transform', 'boost', 'expand',
  'outdoor', 'indoor', 'weather', 'speed', 'transfer', 'network', 'networking',
  'router', 'routers', 'laptop', 'satellite', 'dish', 'roof', 'wall', 'pole', 'car', 'truck',
  'boat', 'yacht', 'home', 'office', 'travel', 'read', 'more', 'back', 'send', 'submit',
  'inquiry', 'message', 'name', 'email', 'phone', 'company', 'contact', 'related',
  'description', 'category', 'model', 'type', 'brand', 'about', 'video', 'videos',
]);

/* ─────────── 工具 ─────────── */
function blankNonVisible(html) {
  // 等长空格替换, 保留偏移 → 行号准确
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, (m) => ' '.repeat(m.length))
    .replace(/<style[\s\S]*?<\/style>/gi, (m) => ' '.repeat(m.length))
    .replace(/<!--[\s\S]*?-->/g, (m) => ' '.repeat(m.length));
}
function lineOf(html, idx) {
  let n = 1;
  for (let i = 0; i < idx && i < html.length; i++) if (html[i] === '\n') n++;
  return n;
}
function stripWhitelist(text) {
  let t = ' ' + text + ' ';
  for (const re of WHITELIST) t = t.replace(re, ' ');
  return t;
}
/* ── 格式化短语判据(多语言窗 2026-07-28 规格,与逐词标记表【并列,不替代】)───────────
   缘起:官网实测 Contact 页 `Mon–Fri 9:00–18:00` 与 `within 1 business day` 在 es/pt 页面上
   是英文,而这两个闸的命中数都是 **0** —— 逐词标记表里没有 Mon/Fri 这类三字母缩写。

   🔴 为什么不照抄 zh-leak-scan 的"白名单减法":zh 与英文【不同字符集】,"减掉白名单后剩下的
      连续英文 = 泄漏"在 zh 上安全;而 es/pt 与英语同属拉丁字母、同形词海量(`Cables`、
      `Industrial` 逐字同形),照搬会淹没在误报里 ——
      **而误报是豁免的上游:一道吵闹的闸活不过一天,它会被加个豁免关掉。**

   🔴 也不是"把星期缩写逐个加进标记表":`Mar` 是英文 March 缩写,同时是西语 martes(周二)
      的缩写,还是 "mar"(海)。**单字层面在 es 上就是雷。**

   → 判据改为要求【格式元素叠加】:两个星期缩写被连字符连起来 · `within N business day(s)`
     整体短语 · 时间戳后面紧跟 AM/PM。**命中这种复合格式本身就是证据,不必猜单字含义。**

   ⚠️ 这一族的计数【单独出】,不混进逐词判据那个数 —— 保持"数字要能被拆开看"的既有原则。 */
const FORMAT_LEAKS = [
  { name: 'day-range',    re: /\b(Mon|Tue|Wed|Thu|Fri|Sat|Sun)\s*[-–—]\s*(Mon|Tue|Wed|Thu|Fri|Sat|Sun)\b/ },
  { name: 'business-day', re: /\bwithin\s+\d+\s+business\s+days?\b/i },
  { name: 'am-pm-time',   re: /\b\d{1,2}:\d{2}\s*(AM|PM)\b/i },
];
// es-leak-scan 直接 import 这一份 —— **格式规则天然语言无关,不该分叉出两套"Mon–Fri 是不是英文"的逻辑**。
export function formatHits(text) {
  return FORMAT_LEAKS.filter((f) => f.re.test(text)).map((f) => f.name);
}

function englishHits(text) {
  const stripped = stripWhitelist(text).toLowerCase();
  // ⚠️ 词边界必须含重音字母, 否则 "transferência" 会被切成 "transfer"+"ência" → 假阳性
  const words = stripped.match(/[a-zà-ÿ][a-zà-ÿ'-]*/g) || [];
  const hits = words.filter((w) => EN_MARKERS.has(w.replace(/[''-]+$/, '')));
  return [...new Set(hits)];
}
function walk(dir, acc = []) {
  if (!fs.existsSync(dir)) return acc;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, acc);
    else if (e.name.endsWith('.html')) acc.push(p);
  }
  return acc;
}

/* ─────────── 第二类: 指向英文页的链接 (pt 版存在却没指过去) ─────────── */
/* 盲区来源: 这类泄漏在 href 属性里(不在可见文本面), 且死链检查会放行(英文页真实存在),
   但用户一点就掉出 pt 站 → 比可见文本更伤漏斗. 只有「pt 版存在却链了英文」才算泄漏:
   - 切换器 EN 链 → ⚠️ **不再跳过, 改为【验证】** (见 switcherLeaksOf)
   - 没有 pt 版的页(指南文章/遗留编号页) → 链英文是正确的(防软404) → 不报 */

/* ⚠️⚠️ 2026-07-16 —— 这里曾是这个项目里最锋利的一个错, 留档:
 *
 *   原来:      if (/lang-switch__link/i.test(tag)) continue;   // 切换器 EN 链 = 设计
 *   我的理由:  「切换器 EN 链 = 设计如此(该指英文) → 白名单」
 *
 * 然后 R1 (51626fec "R1 lands", chrome 进 catalog 那一笔) 把它打坏了:
 *   R1 之前 (8cb5a0cf):  <a href="/marine/"      hreflang="en">    EN   ✅
 *   R1 之后 (51626fec):  <a href="/pt/products/" hreflang="pt-BR"> EN   ❌
 * → **全站每个 pt 页, 点 EN 都掉到「葡语的产品页」。它在线上活过了整个 R2 和 R3。**
 * → **而我的白名单保证我永远发现不了 —— 我自己造的盲区, 恰好就是 bug 落地的地方。**
 *
 * ⭐ 教训: **白名单不是「这里不会错」, 是「这里我放弃观察」。我把这两件事当成了一件。**
 *    **「设计如此」是一个【可测的断言】, 不是一个【豁免的理由】** ——
 *    **能说出"它该是什么"的地方, 恰恰是最该去验证它真是什么的地方。**
 *
 * (同族: !src 静默跳过 177 张 / ?v= 判错 656 / 空 <img/> / 文件存在+200=好图 /
 *        "meta_title 以 title 开头 = 它由 title 派生" / dev 的「我量了自己的倒影」)
 */
function switcherLeaksOf(raw, rel) {
  /* W2d 悬停菜单后,pt 页的切换器有【两】个链接(en+es),不再只有一扇 en 门。
     规则升级为逐链「hreflang ↔ href 树前缀一致」:
       hreflang=en    → href 不得进 /pt/ 也不得进 /es/
       hreflang=es-MX → href 必须在 /es/ 树里(缺对应页时兜底 /es/ 也满足)
       hreflang=pt-BR → 在 pt 页上指向自己 = bug(当前语种该是 span,不是 <a>)
     深层校验(对应页/兜底首页选对了没)由 switcher-verify.mjs 全站闸负责,这里只堵"树错"。 */
  const out = [];
  for (const m of raw.matchAll(/<a\s[^>]*lang-switch__link[^>]*>/gi)) {
    const tag = m[0];
    const href = (tag.match(/href="([^"]*)"/i) || [])[1] || '';
    const hl = (tag.match(/hreflang="([^"]*)"/i) || [])[1] || '';
    const line = raw.slice(0, m.index).split('\n').length;
    const inPt = href === '/pt' || href.startsWith('/pt/');
    const inEs = href === '/es' || href.startsWith('/es/');
    if (/^pt/i.test(hl) || inPt)
      out.push({ file: rel, line, kind: 'switcher', hits: ['switcher→pt'], text: tag.slice(0, 96),
                 href, should: 'pt 页的切换器链接只该通向其他语种(en/es),当前语种该是 span' });
    else if (/^en/i.test(hl) && inEs)
      out.push({ file: rel, line, kind: 'switcher', hits: ['switcher-hreflang'], text: tag.slice(0, 96),
                 href, should: 'hreflang=en 的链接不该进 /es/ 树' });
    else if (/^es/i.test(hl) && !inEs)
      out.push({ file: rel, line, kind: 'switcher', hits: ['switcher-hreflang'], text: tag.slice(0, 96),
                 href, should: 'hreflang=es-MX 的链接必须在 /es/ 树里' });
    else if (hl && !/^(en|es)/i.test(hl))
      out.push({ file: rel, line, kind: 'switcher', hits: ['switcher-hreflang'], text: tag.slice(0, 96),
                 href, should: 'hreflang 只该是 en 或 es-MX' });
  }
  return out;
}

function buildPtUrlSet(files) {
  const s = new Set();
  for (const f of files) {
    let u = '/' + path.relative(ROOT, f).split(path.sep).join('/');
    u = u.replace(/index\.html$/, '').replace(/\.html$/, '');
    s.add(u); s.add(u.replace(/\/$/, '')); s.add(u.replace(/\/$/, '') + '/');
  }
  return s;
}
function linkLeaksOf(raw, vis, rel, ptUrls) {
  const out = [];
  for (const m of vis.matchAll(/<a\s[^>]*>/gi)) {
    const tag = m[0];
    if (/lang-switch__link/i.test(tag)) continue;   // 切换器不走这条通用规则 —— 它由 switcherLeaksOf 单独【验证】(见上)
    const hm = tag.match(/href="([^"]*)"/i);
    if (!hm) continue;
    const href = hm[1];
    if (!href.startsWith('/')) continue;                          // 外链 / mailto / #锚
    if (href.startsWith('/pt/') || href === '/pt') continue;       // 已经是 pt
    if (/^\/(static|skin|favicon|sitemap)/i.test(href)) continue;  // 静态资源
    const clean = href.split('#')[0].split('?')[0];
    if (!clean) continue;
    const ptEquiv = ('/pt' + clean).replace(/\/{2,}/g, '/');
    const exists = ptUrls.has(ptEquiv) || ptUrls.has(ptEquiv.replace(/\/$/, '')) || ptUrls.has(ptEquiv.replace(/\/$/, '') + '/');
    if (exists) out.push({ file: rel, line: lineOf(raw, m.index), kind: 'link', href, should: ptEquiv });
  }
  return out;
}

/* ─────────── 扫描 ─────────── */
const findings = [];
const linkFindings = [];
// 类①-b:格式化短语命中。**单独一个数组** —— 与类①的逐词命中并列展示,不合并计数。
const formatFindings = [];
// 🔴 CLI 守卫(2026-07-28 加):此前扫描主体在【模块顶层】直接跑 —— 任何人 import 这个文件
//    都会连带触发一次全站扫描。es-leak-scan 为复用 formatHits 而 import 它时当场现形:
//    es 的输出从 ~10 行变成 399 行,里面混着 pt 的全部结果。
//    ⚠️ 这类"import 有副作用"的模块,被复用的那一刻才暴露 —— **而复用正是我们想鼓励的事**。
//    (es 复用词表时是用正则从源码里抠的,绕开了这个坑,所以它一直没被发现。)
const IS_CLI = process.argv[1] && process.argv[1].replace(/\\/g, '/').endsWith('pt-leak-scan.mjs');
const files = IS_CLI ? walk(PT_DIR) : [];
const PT_URLS = IS_CLI ? buildPtUrlSet(files) : new Set();
for (const file of files) {
  const raw = fs.readFileSync(file, 'utf8');
  const vis = blankNonVisible(raw);
  const rel = path.relative(ROOT, file).split(path.sep).join('/');

  // 1) 标签之间的文字节点
  for (const m of vis.matchAll(/>([^<>]+)</g)) {
    const text = m[1].replace(/\s+/g, ' ').trim();
    if (!text || text.length < 3) continue;
    const hits = englishHits(text);
    // badged:这段英文后面紧跟着 tj-lang-badge(em inglês)=【已声明的英文】,不是漏译。
    // 取窗口而不是整文件:证据必须和结论在同一处,否则一个页面只要任意位置有角标就会把全页洗白。
    // ⚠️ 判据取 raw(原始标记),不能取 finding.text —— 那是剥过标签的纯文本,角标不可能在里面。
    // 窗口【前后都要看】:角标挂在卡片标题上,而同一张卡的【摘要】排在角标之后 ——
    // 只向后看会把标题判成已接受、把同一张卡的摘要判成真漏译,同一张已声明的卡被拆成两半。
    // ⚠️ 这是个有界近似(向前 420 / 向后 200 字符):窗口内恰好有别的卡的角标时会误判为已接受。
    //    接受这个代价的方向是【偏保守地少报真漏译】吗?不是 —— 反了会漏掉真问题。所以窗口取得紧,
    //    且这个数只用来分类、不用来免责:真漏译那一栏才是待办,已接受那栏仍会被打印出来可核。
    const badged = /tj-lang-badge/.test(raw.slice(Math.max(0, m.index - 420), m.index + m[0].length + 200));
    if (hits.length) findings.push({ file: rel, line: lineOf(raw, m.index), kind: 'text', hits, text: text.slice(0, 120), badged });
    // 类①-b:格式化短语。与上面的逐词判据【并列跑】—— 逐词命中为 0 的文本仍可能命中格式。
    const fmt = formatHits(text);
    if (fmt.length) formatFindings.push({ file: rel, line: lineOf(raw, m.index), kind: 'text', rules: fmt, text: text.slice(0, 120) });
  }
  // 2) 可见属性
  for (const m of vis.matchAll(/\b(placeholder|alt|title|aria-label)="([^"]+)"/gi)) {
    const attr = m[1].toLowerCase(), text = m[2].replace(/\s+/g, ' ').trim();
    if (!text || text.length < 3) continue;
    const hits = englishHits(text);
    if (hits.length) findings.push({ file: rel, line: lineOf(raw, m.index), kind: attr, hits, text: text.slice(0, 120) });
    const fmt = formatHits(text);
    if (fmt.length) formatFindings.push({ file: rel, line: lineOf(raw, m.index), kind: attr, rules: fmt, text: text.slice(0, 120) });
  }
  // 3) 第二类: 指向英文页的链接
  linkFindings.push(...linkLeaksOf(raw, vis, rel, PT_URLS));
  linkFindings.push(...switcherLeaksOf(raw, rel));   // ⚠️ 切换器: 验证它真的指 en, 而不是假设(见上方留档)
}

/* ─────────── 输出 ─────────── */
// ⚠️ 同 CLI 守卫:被 import 时不打印、不 exit —— 一个模块不该在别人 import 它的时候结束别人的进程。
if (IS_CLI)
if (AS_JSON) {
  console.log(JSON.stringify({
    scannerVersion: SCANNER_VERSION,
    scanned: files.length,
    leaks: findings.length, findings: findings.slice(0, MAX),
    linkLeaks: linkFindings.length, linkFindings: linkFindings.slice(0, MAX),
  }, null, 2));
} else {
  console.log(`pt-leak-scan: 扫描 ${files.length} 个 pt 页`);
  // ── 第二类: 指向英文页的链接 (用户一点就掉出 pt 站) ──
  if (linkFindings.length) {
    const byF = {};
    for (const f of linkFindings) (byF[f.file] ||= []).push(f);
    console.log(`\n【类②】指向英文页的链接 (pt 版存在却没指过去) — ${linkFindings.length} 处 / ${Object.keys(byF).length} 文件`);
    for (const [file, list] of Object.entries(byF)) {
      const uniq = [...new Set(list.map((x) => x.href))];
      console.log(`  ❌ ${file}  (${list.length})  → ${uniq.slice(0, 5).join(' ')}${uniq.length > 5 ? ' …' : ''}`);
    }
  } else {
    console.log('✅ 类② 无「该指 pt 却指英文」的链接');
  }
  // ── 拆分:已接受的债 vs 真漏译 ──────────────────────────────────────────────
  // 为什么必须拆:这个数字里【很大一部分是 58 篇 EN-only 攻略文章的卡片标题】,而那是
  // 总工/Joe 当时明确拍板"留现状 + 挂诚实角标(em inglês)"的**已接受的债**,不是缺陷。
  // 把它和真漏译混在一个数里,后果是:这个数【永远不可能归零】→ 门永远红 → 最后被所有人略过。
  // **会被忽略的告警等于没有告警。** 所以按"这一行有没有挂 tj-lang-badge"分开计。
  // ⚠️ 判据取【生成页里真实存在的标记】tj-lang-badge,不是靠猜文件名或路径 —— 角标在哪、
  //    哪一行就是已声明的英文,证据和结论在同一行上。
  const isBadged = (f) => f.badged === true;
  const accepted = findings.filter(isBadged);
  const real = findings.filter((f) => !isBadged(f));
  console.log(`\n【类①】可见文本英文残留 —— 已接受的债 ${accepted.length} · 真漏译 ${real.length}`);
  console.log('  已接受 = 挂了 tj-lang-badge(em inglês)的 EN-only 攻略卡片标题:总工/Joe 拍过"留现状+诚实角标"');
  console.log('  真漏译 = 没有任何声明的英文残留 ← 【只有这个数该被当成待办】');
  if (!findings.length) {
    console.log('✅ 未发现英文残留 (可见文本)');
  } else {
    const byFile = {};
    for (const f of findings) (byFile[f.file] ||= []).push(f);
    let shown = 0;
    for (const [file, list] of Object.entries(byFile)) {
      if (shown >= MAX) break;
      console.log(`\n❌ ${file}  (${list.length})`);
      for (const f of list) {
        if (shown++ >= MAX) break;
        console.log(`   L${f.line} [${f.kind}] {${f.hits.join(',')}}  ${f.text}`);
      }
    }
    console.log(`\n泄漏总数: ${findings.length}(已接受 ${accepted.length} + 真漏译 ${real.length}) / 涉及 ${Object.keys(byFile).length} 个文件`);
  }
  console.log(`\n合计: 类①可见文本 ${findings.length} = 已接受 ${accepted.length} + 【真漏译 ${real.length}】 · 类②英文链接 ${linkFindings.length}`);
  // 类①-b 单独一行:它抓的是【逐词判据抓不到】的那一类,合并进上面那个数就看不出它有没有在工作。
  console.log(`      类①-b 格式化短语 ${formatFindings.length}${formatFindings.length ? ':' : '(day-range / business-day / am-pm-time 均无命中)'}`);
  for (const f of formatFindings.slice(0, 12))
    console.log(`        ⛔ ${f.file}:${f.line} [${f.kind}] {${f.rules.join(',')}}  ${f.text}`);
  if (formatFindings.length > 12) console.log(`        … 其余 ${formatFindings.length - 12} 条`);
  console.log('⚠️ 判达标只看【真漏译】那个数。总数含已接受的债,它不会归零,拿它当 KPI 会让这道门永远红。');
  console.log('(类③=图片里烧死的英文像素, 扫不到, 需重做图)');
}
if (IS_CLI) process.exit(findings.length || linkFindings.length || formatFindings.length ? 1 : 0);
