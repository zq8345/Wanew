#!/usr/bin/env node
/**
 * route-live-check — 用【真的 HTTP】验路由层,不复刻任何判据。
 *
 * 🔴 为什么非要有这一层:product-route.test.mjs 把 Function 的逻辑逐字复刻到 node 里跑,
 *    于是它测的永远是"我写的判据算得对吗",而不是"生产上会发生什么"。
 *    在产两天的那个坏就藏在这条缝里 —— /es/products/{非规范slug} 一直 404 而不是 301,
 *    而 16 条闸 + 21 条路由断言全绿,因为**没有一条断言真的发过一个请求**。
 *    这个脚本起一个本地 wrangler pages dev(与生产同一套 Functions 挂载规则),
 *    然后一条条真发请求、真看状态码和 Location。
 *
 * 🔴 仪器有效性先于结论:全部断言之前先打一个必然 200 的基准。
 *    **服务没起来时,所有请求都会失败 —— 那时候的一片红和"闸抓到了坏"长得一模一样。**
 *    基准不过 = 报「仪器无效」并以另一个退出码退出,不许冒充闸红。
 *
 * ⚠️ 旧址的期望值【按磁盘实况推】,不是写死:
 *    静态文件还在 → 期望 200(双活期);已经删了 → 期望 301(第 5 步之后)。
 *    这样第 5 步前后同一个脚本都成立;而"删了却没建 301"会落到期望 301 得到 404 —— 照样红。
 *
 * 用法: node scripts/route-live-check.mjs [--port 8791] [--keep]
 * 退出: 0 = 全过; 1 = 有断言失败; 9 = 仪器无效(服务没起来 / 基准不过)
 */
import { spawn } from "child_process";
import fs from "fs";

const PORT_IX = process.argv.indexOf("--port");
const PORT = PORT_IX >= 0 ? Number(process.argv[PORT_IX + 1]) : 8791;
const BASE = `http://127.0.0.1:${PORT}`;
const KEEP = process.argv.includes("--keep");

const MANIFEST = JSON.parse(fs.readFileSync("data/products-index.json", "utf8"));
const ROUTES = JSON.parse(fs.readFileSync("data/product-routes.json", "utf8"));
const ALL_LOCALES = ["", "es", "pt", "zh"];
// 🔴 **有产品详情/分类页的语种只有这三个。** zh 只有一个 zh/products/index.html 列表页
//    (DESIGN.md §9.1:zh 产品详情页已决定不做)。
//    ⚠️ 第一版我按 ALL_LOCALES 生成全部用例,于是报出 3 条 zh 的红 ——
//    **判据里藏了"每个语种都齐全"这个不成立的前提,报出来的红和真红长得一样。**
//    修法不是给 zh 加豁免,是把既定规则写进判据本身。
const PRODUCT_LOCALES = ["", "es", "pt"];
const p = (loc, rest) => `${loc ? "/" + loc : ""}${rest}`;

const sample = MANIFEST.find((x) => x.path);
const cases = [];
const skipped = [];
const add = (path, code, loc) => cases.push({ path, code, loc });

// ① 归一化:非规范 slug → 301 到规范址,且【保持语种前缀】
for (const loc of PRODUCT_LOCALES)
  add(p(loc, `/products/deliberately-wrong-name-${sample.id}`), 301, p(loc, `/products/${sample.path}`));
// ② 规范址放行
for (const loc of PRODUCT_LOCALES) add(p(loc, `/products/${sample.path}`), 200);
// ③ 列表页(四语种都有)与分类页(含以数字结尾的机型 —— 不许被当成 N 号产品)
for (const loc of ALL_LOCALES) add(p(loc, "/products/"), 200);
for (const cat of ["cables", "performance-gen-1"])
  for (const loc of PRODUCT_LOCALES) add(p(loc, `/products/${cat}/`), 200);
// ④ 安全:/scripts/ 前缀由 Function 强制 404(_routes.json 若漏列它,这条会变 200)
add("/scripts/regen.mjs", 404);
// ⑤ 旧址:期望值按磁盘实况推(见文件头)
//    ⚠️ 磁盘上【从来没有过】的组合(如 es/performance-gen-2)必须跳过,不是期望 301 ——
//    否则又是在为一个本就不存在的地址要一条重定向。跳过必须计数并打印:
//    **"匹配到才算"的检查会静默漏掉整片区域,而屏幕上只剩一片绿。**
const FORMS = new Set(JSON.parse(fs.readFileSync("data/forms.json", "utf8")).forms.map((f) => f.key));
let oldAddrTotal = 0, oldAddrTested = 0;
const REDIRECT_MAP = fs.existsSync("data/product-redirects.json")
  ? JSON.parse(fs.readFileSync("data/product-redirects.json", "utf8")) : null;
for (const cat of ROUTES.categories) {
  for (const loc of ALL_LOCALES) {
    const dir = FORMS.has(cat) ? `type/${cat}` : cat;
    const path = p(loc, `/${dir}/`);
    oldAddrTotal++;
    if (fs.existsSync(`${loc ? loc + "/" : ""}${dir}/index.html`)) { add(path, 200); oldAddrTested++; }  // 双活期
    else if (REDIRECT_MAP?.[path]) { add(path, 301, REDIRECT_MAP[path]); oldAddrTested++; }              // 第 5 步之后
    else skipped.push(`${path}(磁盘无此旧址,映射表也没有 → 本就不存在)`);
  }
}

async function probe(path) {
  const r = await fetch(BASE + path, { redirect: "manual" });
  return { code: r.status, loc: r.headers.get("location") };
}

let srv = null;
async function up() {
  srv = spawn("npx", ["wrangler", "pages", "dev", ".", "--port", String(PORT),
    "--compatibility-date=2026-07-03"],
    { shell: true, env: { ...process.env, CI: "1", WRANGLER_SEND_METRICS: "false" }, stdio: "ignore" });
  for (let i = 0; i < 90; i++) {
    await new Promise((r) => setTimeout(r, 1000));
    try { await fetch(BASE + "/", { redirect: "manual" }); return true; } catch { /* 还没起 */ }
  }
  return false;
}

const ready = await up();
if (!ready) {
  console.error(`\n❌ 仪器无效:${BASE} 起不来(90s 超时)。**这不是闸红,是没测成。**`);
  if (srv) srv.kill();
  process.exit(9);
}
// 🔴 基准:根路径必须 200。不过 = 服务在但服务错了东西,同样不许出结论。
const bench = await probe("/");
if (bench.code !== 200) {
  console.error(`\n❌ 仪器无效:基准 / 返回 ${bench.code},期望 200。**服务起来了但服务的不是这个站** —— 不出结论。`);
  if (srv && !KEEP) srv.kill();
  process.exit(9);
}
console.log(`【route-live-check】${BASE} 基准 / = 200,仪器有效。开始 ${cases.length} 条真请求。`);
// 🔴 跳过必须吼出来并对账 —— 静默跳过的检查看起来和全过一模一样。
// ⚠️ 分母必须是【旧址组合】本身,不是全部用例。第一版这行写着"旧址组合对账"却拿
//    cases.length(含归一化/分类页/安全 404 等)当分母 —— **标签说的和数字算的不是一件事。**
console.log(`   旧址组合对账:${ROUTES.categories.length} 分类 × ${ALL_LOCALES.length} 语种 = ${oldAddrTotal};测 ${oldAddrTested} + 跳过 ${skipped.length} = ${oldAddrTested + skipped.length}`);
if (oldAddrTested + skipped.length !== oldAddrTotal) {
  console.error(`
❌ 仪器无效:旧址对账不平(${oldAddrTested}+${skipped.length} ≠ ${oldAddrTotal})—— 有组合两边都没落到,不出结论。`);
  if (srv && !KEEP) srv.kill();
  process.exit(9);
}
for (const s of skipped) console.log(`   ⏭️  ${s}`);
console.log("");

let fail = 0;
for (const c of cases) {
  const got = await probe(c.path);
  let bad = got.code !== c.code;
  // 301 时连 Location 一起核 —— 只看状态码会放过"跳到了错的地方"
  if (!bad && c.code === 301 && c.loc) {
    const want = BASE + c.loc;
    if (got.loc !== want) { bad = true; got.why = `Location ${got.loc} ≠ ${want}`; }
  }
  if (bad) {
    fail++;
    console.error(`  ❌ ${c.path}  期望 ${c.code}${c.loc ? " → " + c.loc : ""},得到 ${got.code}${got.why ? " · " + got.why : ""}`);
  }
}
if (srv && !KEEP) srv.kill();

if (fail) { console.error(`\n❌ ${fail}/${cases.length} 条失败`); process.exit(1); }
console.log(`✅ ${cases.length}/${cases.length} 条真请求全过`);
