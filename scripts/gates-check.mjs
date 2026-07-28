#!/usr/bin/env node
/**
 * gates-check — 守 data/gates.json 这份【哪些是闸】的名单。
 *
 * 🔴 它防的是一种在代码里【没有痕迹】的故障:**一整道闸不在**。
 *    我今天撞过三次:cherry-pick 三条闸到新分支时,⑨ 号闸留在了未推的 5a commit 里,
 *    于是同一个测试文件从 106 条断言变成 51 条 —— **而测试照样打印"全部通过"**。
 *    > 第一层(已有):一条断言没验到 → 中止   「验不了 ≠ 验过了」
 *    > 第二层(这里):**一整道闸不在   → 全绿   「闸不在 ≠ 闸通过了」**
 *    「53 条全绿」和「106 条全绿」,在只看有没有红的眼里长得一模一样。
 *    那次能发现是因为数字掉了一半、大到刺眼 —— **如果掉的是 3 条呢?**
 *
 * 🔴 为什么是显式名单而不是一条 glob:
 *    **按文件名模式枚举,分不出「闸」和「名字像闸的工具」。** `rm-verify.mjs` 名字里有 verify,
 *    但它接路径参数并执行删除,**裸跑打印用法后 exit 1** —— 总工按 glob 跑全套时
 *    把它当成了第三条红。而两个人各自按 glob 数,一个得 22、一个得 25,**数不一样本身就是证据**。
 *    ⇒ **glob 只用来【触发提问】(这个文件是什么?),显式名单用来【回答】。**
 *
 * 用法: node scripts/gates-check.mjs [--json] [--list]
 * 退出: 0 = 名单与实际对齐; 1 = 有缺
 */
import fs from "fs";

const REG = "data/gates.json";
const AS_JSON = process.argv.includes("--json");
const LIST = process.argv.includes("--list");

const reg = JSON.parse(fs.readFileSync(REG, "utf8"));
const gates = reg.gates || [];
const notGates = reg.not_gates || [];

let fail = 0;
const bad = (s) => { console.error(`  ❌ ${s}`); fail++; };

// ① 名单里每条闸,文件必须存在,且 cmd 指向的就是它
for (const g of gates) {
  const m = /(scripts\/[\w.-]+\.mjs)/.exec(g.cmd || "");
  if (!m) { bad(`${g.id} 的 cmd 里看不出脚本路径:${g.cmd}`); continue; }
  if (!fs.existsSync(m[1])) bad(`${g.id} 的脚本不存在:${m[1]}`);
  if (!g.what || !g.what.trim()) bad(`${g.id} 没写 what —— 一道说不清自己在验什么的闸,红了也没人知道该看哪里`);
}
for (const n of notGates) {
  if (!fs.existsSync(n.path)) bad(`not_gates 里的 ${n.path} 不存在`);
  if (!n.why || !n.why.trim()) bad(`${n.path} 没写 why`);
}

// ② scripts/ 下【名字像闸】的文件,必须在名单的某一侧出现
const SUSPECT = /(check|verify|scan|test|selftest)\.mjs$/;
const declared = new Set([
  ...gates.map((g) => (/(scripts\/[\w.-]+\.mjs)/.exec(g.cmd || "") || [])[1]).filter(Boolean),
  ...notGates.map((n) => n.path),
]);
const suspects = fs.readdirSync("scripts").filter((f) => SUSPECT.test(f)).map((f) => `scripts/${f}`);
for (const p of suspects) {
  if (!declared.has(p)) {
    bad(`${p} 名字像闸,却没在 ${REG} 里表态 —— **它是一道闸,还是一个名字像闸的工具?**` +
      `不表态的话,下一个人按 glob 跑全套时会拿到一条无法解释的红(或者漏掉一道真闸)`);
  }
}

if (AS_JSON) console.log(JSON.stringify({ gates: gates.length, notGates: notGates.length, suspects: suspects.length }, null, 2));
else if (LIST) for (const g of gates) console.log(`${g.cmd}`);
else {
  console.log(`\n【gates-check】闸 ${gates.length} 道 · 明确不是闸 ${notGates.length} 个 · 名字像闸的文件 ${suspects.length} 个`);
  const slow = gates.filter((g) => (g.what || "").includes("🐢"));
  if (slow.length) console.log(`   🐢 慢闸 ${slow.length} 道(起 wrangler / 跑 build):${slow.map((g) => g.id).join(" ")}`);
}

// ⚠️ 扫到 0 个"名字像闸的文件"= 目录读错了,那样上面的 ② 整条形同虚设。钉住分母。
if (suspects.length === 0) bad("scripts/ 下一个名字像闸的文件都没扫到 —— 目录或模式写错了,②这一整条没有验");

if (fail) { console.error(`\n❌ ${fail} 条不过\n`); process.exit(1); }
if (!AS_JSON && !LIST) console.log("  ✅ 名单与实际文件对齐\n");
