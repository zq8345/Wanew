#!/usr/bin/env node
/**
 * rm-verify — 删除路径,然后【逐个断言它们真的不存在】。
 *
 * 为什么要有这个(2026-07-28,同一天里同一个坑被人工检查拦了两次):
 *   `git rm` 在文件有未提交改动时会**拒绝执行并返回非零**,但如果调用方没检查退出码、
 *   或者像我那样在一条复合命令里跑,**它看起来就像什么都没发生**。
 *   两次都是靠"删完再逐个 ls 一遍"抓到的 —— **同一道人工检查在同一天拦了两次,
 *   说明它该变成代码。**
 *
 * 🔴 这条比 git rm 更普遍:**「命令没报错」不等于「命令做了事」。**
 *   删除、移动、清空这类操作的正确验收,永远是**回头看目标状态**,不是看命令的脸色。
 *
 * 用法:
 *   node scripts/rm-verify.mjs <path> [path...]        # 用 git rm
 *   node scripts/rm-verify.mjs --force <path> [...]    # git rm -f(目标有未提交改动时)
 *   node scripts/rm-verify.mjs --dry <path> [...]      # 只报告会删什么,不动手
 *
 * 退出:0 = 全部确已不存在;1 = 有任何一个还在(或参数不合法)
 */
import fs from "fs";
import { execFileSync } from "child_process";

const argv = process.argv.slice(2);
const FORCE = argv.includes("--force");
const DRY = argv.includes("--dry");
const targets = argv.filter((a) => !a.startsWith("--"));

if (!targets.length) {
  console.error("用法: node scripts/rm-verify.mjs [--force] [--dry] <path> [path...]");
  process.exit(1);
}

// ── 删之前先看一眼:不存在的路径要吼出来 ──────────────────────────────
// 静默跳过"本来就不在"的目标,会让一次【打错路径】的删除看起来完全成功。
const missing = targets.filter((t) => !fs.existsSync(t));
if (missing.length) {
  console.error(`❌ 这些路径删之前就不存在(打错了?):\n   ${missing.join("\n   ")}`);
  console.error("   ⚠️ 不静默跳过 —— 一次打错路径的删除,静默跳过后看起来和成功一模一样。");
  process.exit(1);
}

console.log(`将删除 ${targets.length} 个路径:`);
for (const t of targets) {
  const st = fs.statSync(t);
  console.log(`   ${t}  (${st.isDirectory() ? "目录" : st.size + " B"})`);
}
if (DRY) { console.log("\n--dry:未执行。"); process.exit(0); }

// ── 执行 ────────────────────────────────────────────────────────────
let cmdFailed = null;
try {
  execFileSync("git", ["rm", "-q", "-r", ...(FORCE ? ["-f"] : []), ...targets], { stdio: "pipe" });
} catch (e) {
  cmdFailed = (e.stderr || e.stdout || Buffer.from(String(e))).toString().trim();
}

// ── 🔴 无论命令说什么,都回头看目标状态 ──────────────────────────────
const left = targets.filter((t) => fs.existsSync(t));

if (cmdFailed) {
  console.error(`\n⚠️ git rm 报错了:\n   ${cmdFailed.split("\n").join("\n   ")}`);
  if (left.length === 0)
    console.error("   —— 但目标全部已不存在。**命令报错 ≠ 事情没做成**,以状态为准。");
}

if (left.length) {
  console.error(`\n❌ 删除未生效,以下 ${left.length} 个路径仍然存在:\n   ${left.join("\n   ")}`);
  if (/local modifications/.test(cmdFailed || ""))
    console.error("   提示:目标有未提交改动。确认要连改动一起丢弃后,加 --force 重跑。");
  process.exit(1);
}

console.log(`\n✅ ${targets.length} 个路径确已不存在(逐个 existsSync 核实,不看 git 的脸色)`);
