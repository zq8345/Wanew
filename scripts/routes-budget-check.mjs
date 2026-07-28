#!/usr/bin/env node
/**
 * routes-budget-check — 盯住 CF Pages 自动生成的 `_routes.json`:额度、形状、有没有多出来的路由。
 *
 * 🔴 这条闸存在的直接原因,是我拿一个 **BuildFailure 的产出**做了架构裁定。
 *    桩文件相对路径算错一级,esbuild 报 `Could not resolve` —— **而 `_routes.json` 照样产出了,
 *    条数也对**(枚举文件不需要编译成功)。我还用算术给它背了书:「7+40+1=48,逐项吻合」。
 *    那个对账证明的是"文件枚举完整",不是"编译成功"。
 *    > **崩了的进程产出的文件,和跑完的产出的文件长得一样。**
 *    诱因很典型:第一次输出里有 `✨ Compiled Worker successfully`,后两次**那行消失了,我没注意**。
 *    > **成功标志的【消失】,比错误信息的【出现】难察觉一个量级** —— 人会读新增的行,不会数少了的行。
 *    所以这里**由脚本断言那行存在**,不靠人看。看不到 = 仪器无效(exit 9),不出任何结论。
 *
 * 🔴 顺带盯住第二件事:**`_routes.json` 就是"这个站对外有哪些路由"的那份枚举 ——
 *    它一直在,而我们凭记忆维护着一份心里的清单。** `functions/_lib/product-route.js` 因为
 *    导出了 `onRequest`,曾在这张表里凭空多出一条 `/_lib/product-route`:
 *    **一个共享模块变成了对外端点**,而 `_lib` 这个名字让人以为它是私有的。
 *    > **决定"这是不是一个路由"的不是目录,是导出的名字。**
 *
 * 判据:① 编译必须成功 ② include+exclude ≤ 100 ③ 每条 ≤ 100 字符 ④ 不许有 `/_lib/` 路由
 * 用法: node scripts/routes-budget-check.mjs [--json]
 * 退出: 0 = 全过; 1 = 判据不过; 9 = 仪器无效(没编译成功 / 没产出表)
 */
import { spawnSync } from "child_process";
import fs from "fs";
import os from "os";
import path from "path";

const LIMIT = 100;                       // CF: include/exclude 合计 ≤100,每条 ≤100 字符
const SUCCESS_LINE = "Compiled Worker successfully";
const AS_JSON = process.argv.includes("--json");

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "routes-budget-"));
const routesPath = path.join(tmp, "routes.json");

const r = spawnSync("npx", ["wrangler", "pages", "functions", "build",
  "--outdir", path.join(tmp, "out"), "--output-routes-path", routesPath,
  "--compatibility-date=2026-07-03"],
  { shell: true, encoding: "utf8", env: { ...process.env, CI: "1", WRANGLER_SEND_METRICS: "false" } });

const out = `${r.stdout || ""}${r.stderr || ""}`;

// 🔴 仪器有效性先于结论。注意判据是【成功行在不在】,不是退出码 ——
//    wrangler 在 Windows 上即使编译成功也可能抛 libuv assertion 把退出码弄脏。
if (!out.includes(SUCCESS_LINE)) {
  console.error(`\n❌ 仪器无效:没看到 "${SUCCESS_LINE}"。**编译没成功,下面的数一个都不作数。**`);
  const errs = out.split("\n").filter((l) => /ERROR|Could not resolve/.test(l)).slice(0, 4);
  for (const e of errs) console.error(`   ${e.trim()}`);
  process.exit(9);
}
if (!fs.existsSync(routesPath)) {
  console.error("\n❌ 仪器无效:编译说成功了,却没有产出 _routes.json —— 不出结论。");
  process.exit(9);
}

const routes = JSON.parse(fs.readFileSync(routesPath, "utf8"));
const include = routes.include || [];
const exclude = routes.exclude || [];
const total = include.length + exclude.length;
const longest = Math.max(0, ...[...include, ...exclude].map((x) => x.length));
const libRoutes = include.filter((x) => x.startsWith("/_"));

if (AS_JSON) console.log(JSON.stringify({ total, limit: LIMIT, longest, include, exclude, libRoutes }, null, 2));
else {
  console.log(`\n【routes-budget-check】✅ ${SUCCESS_LINE}`);
  console.log(`  include ${include.length} + exclude ${exclude.length} = ${total} / ${LIMIT}`);
  console.log(`  最长一条 ${longest} 字符 / ${LIMIT}`);
}

let fail = 0;
const bad = (m) => { console.error(`  ❌ ${m}`); fail++; };

if (total > LIMIT) bad(`路由规则 ${total} 条,超过 CF 上限 ${LIMIT} —— 自动生成的 _routes.json 在 CF 那边会被拒。`);
if (longest > LIMIT) bad(`有规则超过 ${LIMIT} 字符。`);
for (const l of libRoutes)
  bad(`${l} 是一条对外路由,而它看起来是私有模块。` +
    `**决定"是不是路由"的是导出的名字,不是目录** —— 把它的 onRequest 改个名,挂载点用 \`as onRequest\`。`);

// ⚠️ 额度用掉一半就先说一声。**等撞上限再发现,那时已经没有便宜的退路了**
//    (退路是手写 _routes.json,而漏列一条 = 一个安全防护静默失效)。
if (!fail && total > LIMIT / 2)
  console.log(`  ⚠️ 已用 ${total}/${LIMIT},过半。再往上走要重新评估是不是还能靠自动生成。`);

if (fail) { console.error(`\n❌ ${fail} 条不过\n`); process.exit(1); }
console.log("  ✅ 额度、长度、私有模块暴露 三项全过\n");
