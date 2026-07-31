// P0-c 堵口的真 HTTP 验证。
// 🔴 阳性样本必须是【确实存在于仓里且已提交】的文件 —— 用不存在的路径测拦截,永远会通过。
// 🔴 阴性对照同样必须有:只测"该 404 的都 404 了",挡不住"把整站也 404 了"。
// 🔴 起服务前先确认端口是空的:遗留的 workerd 不热重载,会让你拿旧代码跑出一片绿。
import { spawn, spawnSync } from "child_process";
import fs from "fs";

const PORT = Number(process.argv[2] || 8793);
const BASE = `http://127.0.0.1:${PORT}`;

// [路径, 期望码, 说明] —— 阳性样本先断言"文件确实在仓里",否则这条用例本身无效。
const CASES = [
  ["/5b-handoff.md", 404, "根级 md(存在于仓)", "5b-handoff.md"],
  ["/DESIGN.md", 404, "根级 md(存在于仓)", "DESIGN.md"],
  ["/i18n-baseline.md", 404, "根级 md(存在于仓)", "i18n-baseline.md"],
  ["/phase2-convert.js", 404, "仓根脚本(存在于仓)", "phase2-convert.js"],
  ["/admin/", 404, "后台空壳(存在于仓)", "admin/index.html"],
  ["/scripts/regen.mjs", 404, "scripts/(已有堵口)", "scripts/regen.mjs"],
  ["/wanew-internal-docs/", 404, "内部文档(已有堵口)", null],
  // ── 阴性对照:这些【必须】仍然 200,否则就是把站堵死了 ──
  ["/", 200, "首页 ← 阴性对照", "index.html"],
  ["/products/", 200, "产品列表 ← 阴性对照", "products/index.html"],
  ["/es/products/", 200, "es 列表 ← 阴性对照", "es/products/index.html"],
  ["/guides/", 200, "攻略 ← 阴性对照", "guides/index.html"],
  ["/favicon.svg", 200, "根级资产 ← 阴性对照(不许被 md/点文件规则误伤)", "favicon.svg"],
];

// 阳性样本的存在性先自证
let invalid = 0;
for (const [p, code, why, file] of CASES) {
  if (code === 404 && file && !fs.existsSync(file)) {
    console.log(`❌ 用例无效:${p} 的样本文件 ${file} 不在仓里 —— **用不存在的文件测拦截会永远通过**`);
    invalid++;
  }
}
if (invalid) process.exit(9);

const busy = await fetch(BASE + "/", { redirect: "manual", signal: AbortSignal.timeout(1500) }).then(() => true).catch(() => false);
if (busy) { console.error(`❌ 仪器无效:${BASE} 已被占用(多半是遗留 workerd,它不热重载 ⇒ 会拿旧代码跑出一片绿)。`); process.exit(9); }

const srv = spawn("npx", ["wrangler", "pages", "dev", ".", "--port", String(PORT), "--compatibility-date=2026-07-03"],
  { shell: true, env: { ...process.env, CI: "1", WRANGLER_SEND_METRICS: "false" }, stdio: "ignore" });
const down = () => { try { spawnSync("taskkill", ["/PID", String(srv.pid), "/T", "/F"], { stdio: "ignore" }); } catch {} srv.kill(); };

let up = false;
for (let i = 0; i < 90 && !up; i++) {
  await new Promise((r) => setTimeout(r, 1000));
  up = await fetch(BASE + "/", { redirect: "manual" }).then(() => true).catch(() => false);
}
if (!up) { console.error(`❌ 仪器无效:${BASE} 90s 内没起来 —— 这不是闸红,是没测成。`); down(); process.exit(9); }

const bench = await fetch(BASE + "/", { redirect: "manual" });
if (bench.status !== 200) { console.error(`❌ 仪器无效:基准 / = ${bench.status},期望 200 —— 服务起来了但服务的不是这个站。`); down(); process.exit(9); }
console.log(`【堵口验证】${BASE} 基准 / = 200,仪器有效。共 ${CASES.length} 条真请求。\n`);

let fail = 0;
for (const [p, want, why] of CASES) {
  const r = await fetch(BASE + p, { redirect: "manual" });
  const ok = r.status === want;
  if (!ok) fail++;
  console.log(`${ok ? "✅" : "🔴"} ${String(r.status).padEnd(4)} 期望 ${String(want).padEnd(4)} ${p.padEnd(28)} ${why}`);
}
down();
console.log(`\n对账:${CASES.length} 条 = 通过 ${CASES.length - fail} + 失败 ${fail}`);
process.exit(fail ? 1 : 0);
