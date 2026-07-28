// 字阶闸 —— `font-size` 只准取刻度里的值。
//
// 为什么必须有这道闸(总工 2026-07-28):
//   收敛前 186 处声明散在 ~37 个落点。**没有闸,这批做完就开始退化** ——
//   每一次"就这一个地方特殊一点"都合情合理,合起来就是今天这个样子。
//   **能靠结构保证的,不要靠记得。**
//
// 🔴 这道闸自带正样本(`自证` 段):每次运行都先造一个刻度外的值确认它报红、
//    再确认原文通过。**一个读不出已知违规的闸,它的绿没有信息量**(DESIGN.md §8)。
//    自证失败 = 直接 exit 1,不许"检查本身坏了但结果是绿的"。
//
// 范围:只管 `skin/css/w3.css`。实测(2026-07-28)全站 **404 个 HTML 页面
//   全部只引用 w3.css**,skin/css/ 下另外 8 个 CSS 文件无任何页面引用
//   (mibooz.css 341 处 font-size、tejoy-redesign.css 171 处,共 572 处
//   躺在死资产里)。**范围本身是判据的一部分** —— 若将来有页面引用别的表,
//   这里必须同步扩,否则闸看的是一个没人加载的文件。
import fs from "fs";
import path from "path";

const REPO = process.cwd();
const SRC = path.join(REPO, "skin", "css", "w3.css");

// ── 刻度:唯一合法的取值形态 ────────────────────────────────────────────
const TOKENS = ["micro", "small", "compact", "body", "lead", "h3", "h2", "h1", "d2", "d1"];

// ── 待迁移(大端)。**棘轮:只准变少,不准变多。** ──────────────────────
//   大端档位(h3/h2/h1/display-2/display-1)等总工拍板后落地,落一档、这里删一批。
//   ⚠️ 清单里每一项都写明"迁到哪一档",否则它会变成一张permanent的免罪符。
// **已清零**(2026-07-28,大端十档落地那一批)。23 种 / 28 处全部迁完。
const MIGRATING = {};
// 上一次的规模。**只准降不准升** —— debt ratchet。
// 现在是 0:**这道闸从此没有软肋**,任何刻度外的值都会直接报红,没有"暂时放过"的通道。
// ⚠️ 要往回加,先在 DESIGN.md §2.2 里写清是哪一档、为什么它不能用现有档。
const MIGRATING_CEILING = 0;

// ── 显式豁免:必须带理由,照 reason.dupe / .sol-cta 的先例 ───────────────
const EXEMPT = {
  "0.78em": "`.tj-lang-badge` 是【跟随父级】的相对角标(语言徽章跟着它所在的那行字缩放)。刻度管的是绝对档位,相对倍率不在它的管辖范围内 —— 换成任何固定档都会让它在不同字号的上下文里失配。",
};

// ── 提取所有 font-size 取值(带行号) ────────────────────────────────────
function declarations(css) {
  const out = [];
  const re = /font-size:\s*([^;}]+)/g;
  let m;
  while ((m = re.exec(css))) {
    const value = m[1].replace(/\s*!important$/, "").trim();
    out.push({ value, line: css.slice(0, m.index).split(/\r?\n/).length });
  }
  return out;
}

function violations(css) {
  const bad = [];
  for (const d of declarations(css)) {
    if (new RegExp(`^var\\(--w3-fs-(?:${TOKENS.join("|")})\\)$`).test(d.value)) continue;
    if (d.value in MIGRATING) continue;
    if (d.value in EXEMPT) continue;
    bad.push(d);
  }
  return bad;
}

// ══ 自证:先证明这把尺子读得出已知违规 ═══════════════════════════════════
// 造一个刻度外的值 —— 这场病的典型长相就是"就差一点点"的一个新值。
//
// ⚠️ 判据必须是【增量】不是【绝对数】(2026-07-28 端到端实测抓出来的):
//    最初写的是"注入后含该值的违规必须恰好 1 处"。于是当真实文件里**也**存在
//    同一个值时(我做端到端测试时手动注入了一个),自证读到 2、判定"闸坏了"——
//    **闸确实报红了,但报红的理由是错的**,而且那句"闸坏了"会把人引去修闸,
//    而真正该修的是 CSS。**红得看不懂,和绿得没道理一样危险。**
//    改成"注入后的违规总数 = 注入前 + 1",无论真实文件里有多少违规都成立。
//
// 哨兵取一个绝不会有人手写的值,进一步降低碰撞面。
const SENTINEL = "13.7391px";
const raw = fs.readFileSync(SRC, "utf8");
const probe = raw.replace(/font-size: var\(--w3-fs-body\)/, `font-size: ${SENTINEL}`);
if (probe === raw) {
  console.error("❌ 自证无法进行:找不到可污染的锚点(刻度变量一处都没用上?)");
  process.exit(1);
}
const baseline = violations(raw).length;
const probed = violations(probe).length;
if (probed !== baseline + 1) {
  console.error(`❌ 自证失败:注入一个刻度外的值后,违规数 ${baseline} → ${probed}(应为 ${baseline + 1})`);
  console.error("   **这把尺子读不出已知故障,它给出的绿一律不作数。** 先修闸,再看结果。");
  process.exit(1);
}

// ══ 正式检查 ═══════════════════════════════════════════════════════════
const all = declarations(raw);
const bad = violations(raw);
const migrating = all.filter((d) => d.value in MIGRATING);
const exempt = all.filter((d) => d.value in EXEMPT);
const onScale = all.length - bad.length - migrating.length - exempt.length;

console.log("\n【字阶闸 type-scale-check】");
console.log(`  自证:注入哨兵值 → 违规数 +1 ✅(这把尺子读得出已知故障)`);
console.log(`  声明总数 ${all.length}  =  在刻度上 ${onScale} + 待迁移 ${migrating.length} + 豁免 ${exempt.length} + 违规 ${bad.length}`);

if (exempt.length) {
  console.log(`\n  豁免 ${exempt.length} 处(每条都带理由):`);
  for (const [v, why] of Object.entries(EXEMPT))
    console.log(`    ${v} — ${why}`);
}

if (migrating.length) {
  const kinds = new Set(migrating.map((d) => d.value));
  console.log(`\n  ⏳ 待迁移 ${migrating.length} 处 / ${kinds.size} 种(大端档位落地后清零):`);
  for (const v of [...kinds].sort())
    console.log(`    ${String(migrating.filter((d) => d.value === v).length).padStart(2)}×  ${v}  ${MIGRATING[v]}`);
}

// 棘轮:待迁移的【种类数】只准降
if (Object.keys(MIGRATING).length > MIGRATING_CEILING) {
  console.error(`\n❌ 待迁移清单变长了(${Object.keys(MIGRATING).length} > 上限 ${MIGRATING_CEILING})。`);
  console.error("   这张清单是【债务】不是【许可】—— 只准变短。要加新值,先进 DESIGN.md §2.2。");
  process.exit(1);
}

if (bad.length) {
  console.error(`\n❌ ${bad.length} 处 font-size 不在刻度上:`);
  for (const d of bad) console.error(`   skin/css/w3.css:${d.line}  ${d.value}`);
  console.error("\n   刻度见 DESIGN.md §2.2。**档是给角色的,不是给数字省事的** ——");
  console.error("   要新档,先进 DESIGN.md,不许在 CSS 里就地发明一个。");
  process.exit(1);
}

console.log("\n✅ 全部 font-size 都在刻度上(或已显式登记)\n");
