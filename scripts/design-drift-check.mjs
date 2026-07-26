#!/usr/bin/env node
/**
 * design-drift-check — DESIGN.md §3.7 组件注册 与 w3.css 代码 的 background 令牌一致性闸。
 *
 * 病史(审计 2 次人肉捞到):每次把组件 CSS 升 §2.6(panel/bg2 → surface-2 浮起),漏同步
 * DESIGN.md §3.7 注册描述 → 唯一事实源越漂越多。这道闸把"事后补注册"变成"drift 即报错",
 * 与 vendor / i18n / brand-residue 守卫同套路。Solutions 前落地(那批会有更多 §2.6 升级)。
 *
 * 规则:对每个【在 §3.7 注册且在 w3.css 有显式 background: var(--w3-<surface令牌>) 的组件类】,
 *   代码用的那个 surface 令牌(如 surface-2)必须【原样出现在】该类的 §3.7 注册文字里。
 *   缺失 = 漂移(注册没跟上代码)→ 报错。
 *   surface 令牌集 = bg / bg2 / panel / panel2 / surface-0..3 / invert-bg(分层/底色族)。
 *
 * 退出:0 = 无漂移;1 = 有漂移。
 */
import fs from "fs";

const DESIGN = fs.readFileSync("DESIGN.md", "utf8");
const CSS = fs.readFileSync("skin/css/w3.css", "utf8");

// surface/底色族令牌(只这些参与一致性;accent/line/text 等不算 background 分层)
const SURFACE = ["surface-0", "surface-1", "surface-2", "surface-3", "panel2", "panel", "bg2", "bg", "invert-bg"];
// 注:panel2 在 panel 前、bg2 在 bg 前 —— 先长后短,避免 "panel2" 被 "panel" 抢匹配。

// 1) 取 §3.7 区块(### 3.7 … 到下一个 ## / 结尾)
const secM = DESIGN.match(/###\s*3\.7[\s\S]*?(?=\n##\s|\n###\s(?!\s*3\.7)|$)/);
const section = secM ? secM[0] : "";
if (!section) { console.error("🔴 找不到 DESIGN.md §3.7 区块"); process.exit(1); }

// 2) 拆成 bullet(以行首 "- " 分)。只把 bullet 的【首个 .class = primary 注册类】纳入本闸:
//    子提及(如 .w3-invert bullet 里顺带说的 .w3-whycard)不算它的注册,避免把别的 bullet 的令牌误安上去。
const bullets = section.split(/\n(?=- )/).filter((b) => /^- /.test(b));
const docByClass = {};   // primaryClass -> { tokens:Set, bullet:string }
for (const b of bullets) {
  const first = b.match(/`\.([a-z0-9][a-z0-9_-]*)`/i);   // primary = bullet 里第一个 `.class`
  if (!first) continue;
  const tokens = new Set();
  for (const t of SURFACE) if (new RegExp(`--w3-${t}\\b|\\b${t}\\b`).test(b)) tokens.add(t);
  docByClass[first[1]] = { tokens, bullet: b };
}

// 3) 代码里每个类的基础规则 background token(取 `.class { … background: var(--w3-X) … }`,X∈SURFACE)
function codeBg(cls) {
  const re = new RegExp(`\\.${cls.replace(/[-]/g, "\\-")}\\s*\\{([^}]*)\\}`);
  const m = CSS.match(re);
  if (!m) return null;
  const bg = m[1].match(/background:\s*var\(--w3-([a-z0-9-]+)\)/i);
  if (!bg) return null;
  return SURFACE.includes(bg[1]) ? bg[1] : null;   // 只关心 surface 族
}

// 4) 对每个【primary 注册 且 代码用 surface 族背景】的类校验:
//    - 冲突(doc 写了 surface 令牌但不含代码的)= 升级漏改注册的病 → 报错。
//    - doc 完全没提 surface 令牌 = 欠文档(非升级漂移)→ 不喊狼,只计入"未声明"提示。
const drifts = [], undocumented = [];
let checked = 0;
for (const [cls, doc] of Object.entries(docByClass)) {
  const code = codeBg(cls);
  if (!code) continue;                       // 该类代码无 surface 族背景 → 不在本闸范围
  checked++;
  if (doc.tokens.size === 0) { undocumented.push(`.${cls}(代码 --w3-${code})`); continue; }
  if (!doc.tokens.has(code)) drifts.push({ cls, code, docTokens: [...doc.tokens].join(",") });
}

if (drifts.length) {
  console.error(`🔴 design-drift: ${drifts.length} 个组件 §3.7 注册 background 令牌与代码【冲突】(升级漏改注册):`);
  for (const d of drifts) console.error(`   .${d.cls}: 代码=--w3-${d.code} · 注册写=${d.docTokens} —— 把 §3.7 描述更到 --w3-${d.code}`);
  console.error(`   (修根:升组件 §2.6 时同 commit 更 §3.7,别留给审计人肉捞。)`);
  process.exit(1);
}
console.log(`design-drift: ✅ §3.7 注册 background 令牌与代码零冲突(检查 ${checked} 个 surface 组件)`);
if (undocumented.length) console.log(`   ℹ️ ${undocumented.length} 个 surface 组件 §3.7 未声明 background 令牌(非漂移,建议补):${undocumented.join(" · ")}`);
