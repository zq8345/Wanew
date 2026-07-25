#!/usr/bin/env node
// P1 收官:把仍挂旧 tejoy 皮肤(tejoy-redesign.css + bootstrap/swiper/mibooz/magnific/wow/jquery)的
// 长文攻略页迁到 W3 皮肤(w3.css + w3.js)。这些页的 W3 chrome(header/footer/mobilenav)已被
// chrome-sync 烘进去、body 是 blog-details/sidebar markup(w3.css 在 wave-2 已给样式),所以迁移
// = 换 <head> 的 CSS 全家桶 + 删遗留 JS 全家桶。幂等。用法:
//   node scripts/skin-migrate.mjs <file...>        指定文件
//   node scripts/skin-migrate.mjs --all            自动扫所有仍含 tejoy-redesign.css 的 html
import fs from "fs";
import { execSync } from "child_process";

const OLD_CSS = /[ \t]*<link\b[^>]*href="\/skin\/css\/(?:mibooz[^"]*|bootstrap[^"]*|all\.min[^"]*|swiper[^"]*|pro\.css[^"]*|jquery\.magnific[^"]*|tejoy-redesign[^"]*)"[^>]*>\n?/g;
const OLD_CSS_PRELOAD = /[ \t]*<link\b[^>]*rel="preload"[^>]*href="\/skin\/css\/mibooz[^"]*"[^>]*>\n?/g;
const OLD_JS = /[ \t]*<script\b[^>]*src="\/skin\/js\/(?:jquery-[^"]*|bootstrap\.bundle[^"]*|jquery\.magnific[^"]*|wow[^"]*|swiper\.min[^"]*|mibooz[^"]*)"[^>]*>\s*<\/script>\n?/g;
const INTER_OLD = /(<link\b[^>]*href="https:\/\/fonts\.googleapis\.com\/css2\?family=Inter:wght@)400;500;600;700(&display=swap"[^>]*>)/;

function migrate(file) {
  let s = fs.readFileSync(file, "utf8");
  const before = s;
  const crlf = s.includes("\r\n");
  let body = s.replace(/\r\n/g, "\n");
  // --- head: 换 CSS/JS 全家桶 ---
  body = body.replace(OLD_CSS_PRELOAD, "").replace(OLD_CSS, "").replace(OLD_JS, "");
  body = body.replace(INTER_OLD, "$1400;500;600;700;800$2");   // Inter 补 800
  if (!/skin\/css\/w3\.css/.test(body)) {
    body = body.replace(/(<link\b[^>]*href="https:\/\/fonts\.googleapis\.com\/css2\?family=Inter[^>]*>)/,
      `$1\n<link rel="stylesheet" href="/skin/css/w3.css?v=8" />`);
  } else body = body.replace(/skin\/css\/w3\.css\?v=\d+/g, "skin/css/w3.css?v=8");
  if (!/skin\/js\/w3\.js/.test(body)) {
    body = body.replace(/<\/body>/, `<script src="/skin/js/w3.js?v=2" defer></script>\n</body>`);
  }
  // --- body: 文章页规范(总工拍板:单栏 / W3 标题 / 零内联样式) ---
  // ① 剥 h2 内联 style(Tejoy 蓝框写死覆盖 → 交 w3.css 统一 W3 标题)。仅正文 h2(chrome/footer 用 h3)。
  body = body.replace(/(<h2\b[^>]*?)\s+style="[^"]*"/g, "$1");
  // ② 去旧 blog 侧栏做单栏:平衡删除 col-xl-3 那个侧栏列(含嵌套 div,靠计数不靠贪婪正则)。
  body = removeBalancedDiv(body, /<div class="col-xl-3 col-lg-3">/);
  // ③ L4:删 footer 处【重复】的 Organization JSON-LD(head 里已有主的;此注释唯一)。
  body = body.replace(/\n?[ \t]*<!-- Structured Data: Organization -->\s*<script type="application\/ld\+json">[\s\S]*?<\/script>/, "");
  const out = crlf ? body.replace(/\n/g, "\r\n") : body;
  if (out !== before) { fs.writeFileSync(file, out); return true; }
  return false;
}

// 从 openTagRe 命中的 <div ...> 起,按 <div>/</div> 计数删到它的平衡闭合(含内容)。返回删后 html。
function removeBalancedDiv(html, openTagRe) {
  const m = html.match(openTagRe);
  if (!m) return html;
  const start = m.index;
  const re = /<div\b|<\/div>/g; re.lastIndex = start;
  let depth = 0, mm;
  while ((mm = re.exec(html))) {
    if (mm[0] === "</div>") { if (--depth === 0) return html.slice(0, start) + html.slice(mm.index + 6); }
    else depth++;
  }
  return html;   // 不平衡:原样返回(自检会抓)
}

let files = process.argv.slice(2).filter((a) => a !== "--all");
if (process.argv.includes("--all")) {
  files = execSync('git grep -l "tejoy-redesign.css" -- "*.html"', { encoding: "utf8" }).trim().split("\n").filter(Boolean);
}
let n = 0;
for (const f of files) { if (migrate(f)) { n++; console.log("migrated", f); } else console.log("no-change", f); }
console.log(`\nskin-migrate: ${n}/${files.length} changed`);
// 残留自检:迁完的文件不应再含任何旧皮引用
const leftovers = files.filter((f) => /tejoy-redesign\.css|skin\/js\/mibooz|bootstrap\.min\.css|swiper\.min/.test(fs.readFileSync(f, "utf8")));
if (leftovers.length) { console.error(`🔴 仍有旧皮残留 ${leftovers.length}:`, leftovers.slice(0, 5)); process.exit(1); }
console.log("✅ 0 旧皮残留");
