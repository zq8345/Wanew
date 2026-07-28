#!/usr/bin/env node
/**
 * rebuild — 站点重建的【一个】命令:regen → chrome-sync → css-hash。
 *
 * 🔴 为什么要有它:这三步是一件事的三个阶段,而**中途只跑第一步会静默回退**。
 *    regen 产出的页面带的是【模板自带的英文 chrome】,chrome-sync 才把各语种的 chrome 烘回去。
 *    我今天为了修 regen 里的两个 bug 重跑了三次 regen,**每次都没跟 chrome-sync** ——
 *    结果 558 个页面的 chrome 回退成英文,连带 6 条闸变红,而我当时以为是自己刚改的代码弄坏的。
 *
 *    诱因不是"不知道这条规矩",我知道,还写在记忆里。真正的原因是:
 *    > **重跑时,注意力锁在被调试的那一处("regen 那个 bug 修好没"),而不是"流水线完整没"。**
 *    所以这条不能靠记得 —— 让完整流程变成默认那个命令,让"只跑第一步"不再是顺手的做法。
 *
 * ⚠️ 任一步失败就停,不往下走:第一步没成功却继续 chrome-sync,
 *    等于把一个坏的中间态烘进全站页面,而那比直接失败难查得多。
 *
 * 用法: node scripts/rebuild.mjs
 * 退出: 0 = 三步全成; 非 0 = 停在失败那一步(会打印是哪一步)
 */
import { spawnSync } from "child_process";

const STEPS = [
  ["regen", ["scripts/regen.mjs"]],
  ["chrome-sync", ["scripts/chrome-sync.mjs", "--write"]],
  ["css-hash", ["scripts/css-hash.mjs", "--write"]],
];

for (const [i, [name, args]] of STEPS.entries()) {
  console.log(`\n━━ ${i + 1}/${STEPS.length} ${name} ━━`);
  const r = spawnSync(process.execPath, args, { stdio: "inherit" });
  if (r.status !== 0) {
    console.error(`\n❌ 停在第 ${i + 1} 步(${name}),退出码 ${r.status}。`);
    console.error("   ⚠️ **后面的步骤没有跑** —— 现在的产出是个中间态,别拿它验收、别提交。");
    if (i > 0) console.error(`   已经跑过的:${STEPS.slice(0, i).map(([n]) => n).join(" → ")}`);
    process.exit(r.status || 1);
  }
}
console.log("\n✅ regen → chrome-sync → css-hash 三步全成\n");
