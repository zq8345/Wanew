// .w3-whitecards 不变量:被翻成【深色墨】的文字,必须真的落在【浅色底】上。
//
// 为什么要有这道闸:2026-07-28 About 下半段崩过一次,第二个根因就是这个 ——
// 我把 .w3-iconcard 换成自己的类,只搬走了 .w3-whitecards 里的深色墨,没搬它依赖的白底。
// 两个改动各自看都对,合起来是深墨压深底、整片标题隐形。CSS 读着完全正常,肉眼审不出来。
//
// ⚠️ 这道闸的第一版是"每个卡片类必须自带 background",在健康树上报了 4 个红 ——
//    因为白底【合法地来自祖先卡片容器】(.tj-gbody 的底在 .tj-gcard 上,
//    .about-steps 的底在 .about-oemblock 上)。在健康树上报红的闸会被忽略,等于没装。
//    所以这一版按【产出 HTML 的真实祖先链】解底色:墨在自己身上,底可以在任何祖先上。
import fs from "fs";
import path from "path";

const REPO = process.cwd();
const css = fs.readFileSync(path.join(REPO, "skin", "css", "w3.css"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");

// ── 1. 从 CSS 里收集:哪些类在 .w3-whitecards 下拿到深墨 / 哪些类拿到浅底
const darkInk = new Set(), lightBg = new Set();
for (const m of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
  const sel = m[1].trim(), body = m[2];
  if (!/\.w3-whitecards\b/.test(sel)) continue;
  for (const one of sel.split(",")) {
    if (!/\.w3-whitecards\b/.test(one)) continue;
    const after = one.split(".w3-whitecards")[1] || "";
    const classes = [...after.matchAll(/\.([a-zA-Z0-9_-]+)/g)].map((x) => x[1]);
    if (!classes.length) continue;
    const target = classes[classes.length - 1];                 // 声明真正作用的那个类
    if (/color\s*:\s*var\(--w3-invert-ink2?\)|color\s*:\s*#(0|1|2)[0-9a-f]{5}\b/i.test(body)) darkInk.add(target);
    if (/background(-color)?\s*:\s*(#fff|#ffffff|white|rgba?\(\s*255)/i.test(body)) lightBg.add(target);
  }
}

// ── 2. 扫产出 HTML:每个带深墨类的元素,祖先链上有没有浅底类
//    只扫挂了 w3-whitecards 的 section 内部 —— 别处的同名类不受这条规则管。
const pages = [];
const walk = (d) => { for (const e of fs.readdirSync(d, { withFileTypes: true })) {
  if (["node_modules", ".git", "skin", "static"].includes(e.name)) continue;
  const p = path.join(d, e.name);
  if (e.isDirectory()) walk(p); else if (e.name.endsWith(".html")) pages.push(p);
} };
walk(REPO);

const TAG = /<(\/?)([a-zA-Z][a-zA-Z0-9]*)\b([^>]*)>/g;
const VOID = new Set(["img", "br", "hr", "input", "meta", "link", "source", "path", "circle", "svg", "use", "area", "col", "embed", "param", "track", "wbr"]);
const bad = new Map();                                          // class -> [page, ...]
let scanned = 0;

for (const p of pages) {
  const html = fs.readFileSync(p, "utf8");
  if (!html.includes("w3-whitecards")) continue;
  scanned++;
  const stack = [];                                             // [{tag, classes, whitecards}]
  let m;
  TAG.lastIndex = 0;
  while ((m = TAG.exec(html))) {
    const [, close, tagRaw, attrs] = m;
    const tag = tagRaw.toLowerCase();
    if (close) { for (let i = stack.length - 1; i >= 0; i--) if (stack[i].tag === tag) { stack.length = i; break; } continue; }
    if (VOID.has(tag) || /\/\s*$/.test(attrs)) continue;
    const cls = (attrs.match(/class="([^"]*)"/) || [, ""])[1].split(/\s+/).filter(Boolean);
    const inScope = cls.includes("w3-whitecards") || stack.some((f) => f.whitecards);
    stack.push({ tag, classes: cls, whitecards: inScope });
    if (!inScope) continue;
    const ink = cls.find((c) => darkInk.has(c));
    if (!ink) continue;
    // 底可以来自自己或任何祖先
    const hasBg = cls.some((c) => lightBg.has(c)) || stack.some((f) => f.classes.some((c) => lightBg.has(c)));
    if (!hasBg) { const k = ink; if (!bad.has(k)) bad.set(k, []); if (bad.get(k).length < 3) bad.get(k).push(p.replace(REPO + path.sep, "")); }
  }
}

console.log(`whitecards-pair-check  深墨类 ${darkInk.size} 个 · 浅底类 ${lightBg.size} 个 · 扫了 ${scanned} 个含 w3-whitecards 的产出页`);
console.log(`  不变量:.w3-whitecards 内被刷成深色的文字,自己或祖先必须有浅底  ${bad.size ? "🔴 " + bad.size + " 类落空" : "✅ 全部有底"}`);
if (bad.size) {
  console.log(`\n━━ 先看这里:下面这些类的文字被刷成了深色,但它和它的所有祖先都没有浅色底。`);
  console.log(`   在深色 section 上这等于把字刷成背景色 —— 页面看起来是空的,而 CSS 读着完全正常。`);
  console.log(`   (2026-07-28 About 就是这么隐形的:换类名时只搬了墨,没搬它依赖的白底。)\n`);
  for (const [c, ps] of bad) {
    console.log(`   🔴 .${c}   例如 ${ps.join(" / ")}`);
    console.log(`      → 给它或它的卡片容器补一条:  .w3-whitecards .${c} { background: #fff; border: 1px solid rgba(11,13,16,.10); }`);
  }
}
process.exit(bad.size ? 1 : 0);
