#!/usr/bin/env node
/**
 * redirect-residue-check —— 用 301 映射表当 oracle,核对旧址文件还剩几个。
 *
 * 🔴 oracle 是 `data/product-redirects.json`(regen 产出页面的同一次运行里生成的),
 *    **不是形状正则**。总工和 Admin 各写各的正则数同一批东西:一个得 55/191,一个得 238,
 *    两个都错、宽的方向还不一样,错的还是同一个文件(`video/39.html` 被当成产品详情页)。
 *    > **两个人各自用形状去数同一批东西,各自宽的方向还不同。** 收紧正则不是正解 —— 换 oracle 才是。
 *
 * 用法:
 *    node scripts/redirect-residue-check.mjs            # 表取自工作树
 *    node scripts/redirect-residue-check.mjs --ref <r>  # 表取自某个 git ref(表还没合进 main 时用)
 * 退出:
 *    0 = 一个旧址文件都不剩
 *    1 = 还有残留(⑥ 之前这是【正确答案】,不是失败 —— 它证明这把尺子会报非零)
 *    2 = 🔴 尺子本身不可信:表取不到 / 形状不认识 / 自己不自洽 / 为空
 *
 * ⚠️ 为什么 `2` 必须单独一档:它防的不是"没删干净",是"**我根本没量到**"。
 *    这把尺子的第一版写了一串"兼容多种表格式"的容错去猜形状 —— 猜错时它不报错,
 *    而是安静地得到一个**空集合**,于是打印「✅ 剩余 0,删净了」。当时一个文件都没删。
 *    > **容错解析 + 空集合 = 一盏免费的绿灯。** 读【已知格式的权威数据】时,容错是反模式:
 *    > 它把"我读错了"变成"没有数据",而没有数据的检查永远通过。
 *
 * ⚠️ 量的是【工作树】,不是 origin/main。搬过来之前它读 `git ls-tree origin/main` ——
 *    那样它永远看不见本地还没推的改动,当闸用就是一把慢一拍的尺子。
 */
import fs from "fs";
import path from "path";
import { execFileSync } from "child_process";

const REPO = process.cwd();
const MAP_REL = "data/product-redirects.json";
const ri = process.argv.indexOf("--ref");
const REF = ri >= 0 ? process.argv[ri + 1] : null;

const die2 = (msg) => { console.log(`🔴 ${msg}`); process.exit(2); };

let raw;
if (REF) {
  try { raw = execFileSync("git", ["show", `${REF}:${MAP_REL}`], { cwd: REPO, encoding: "utf8", maxBuffer: 1 << 28 }); }
  catch { die2(`取不到 ${REF}:${MAP_REL} —— **这是取不到,不是没有**。停。`); }
} else {
  if (!fs.existsSync(path.join(REPO, MAP_REL)))
    die2(`工作树里没有 ${MAP_REL} —— **这是没取到,不是"没有旧址要删"**。表随第 5a 步落地;` +
         `在那之前用 \`--ref <5a 的 commit>\` 指定。停。`);
  raw = fs.readFileSync(path.join(REPO, MAP_REL), "utf8");
}

let tbl;
try { tbl = JSON.parse(raw); } catch (e) { die2(`表不是合法 JSON:${e.message}`); }

// 认死真实形状 { _count, redirects: { "/from": "/to" } };认不出就中止,不猜。
if (!tbl.redirects || typeof tbl.redirects !== "object" || Array.isArray(tbl.redirects))
  die2("表的形状不是 {redirects:{from:to}} —— 不猜,中止。");
const froms = Object.keys(tbl.redirects);
if (Number(tbl._count) !== froms.length)
  die2(`_count(${tbl._count}) ≠ 实际(${froms.length}) —— 表自己不自洽,中止。`);
if (froms.length === 0)
  die2("一条 from 都没有 —— 空集合会让剩余数天然为 0,中止。");

/* 一条 from(URL 路径)可能落成 `{p}.html` 或 `{p}/index.html`。
   ⚠️ 两种都算"还在" —— 只判一种会把仍然存在的文件报成已删,那是假绿。 */
const candidates = (from) => {
  const p = String(from).replace(/^\/+/, "").replace(/\/+$/, "");
  return p ? [`${p}.html`, `${p}/index.html`, p] : ["index.html"];
};
/* 🔴 只算【文件】,不算目录。`fs.existsSync("enterprise")` 对目录也返回 true ——
   删掉 `enterprise/index.html` 之后那个目录还在(往往是空的),尺子会永远报"还有残留",
   于是 exit 0 这一档【永远到不了】。
   ⚠️ 这个坑是移植带进来的:原版用 `git ls-tree`,那里只有文件、没有目录条目,裸路径候选无害。
      换成文件系统之后同一行代码就变了意思。
   > **是"删完必须报 0"这条正对照把它抓出来的** —— 三档退出只测了 2 和 1 的话,
   > 这把尺子会带着"永远报非零"的缺陷上线,而它看起来一直在正常工作。 */
const isFile = (abs) => { try { return fs.statSync(abs).isFile(); } catch { return false; } };
const onDisk = (from) => candidates(from).some((c) => isFile(path.join(REPO, c)));

const remaining = froms.filter(onDisk);
const bucket = (f) => (/\/\d+\/?$/.test(f) ? "详情页" : /\/type\//.test(f) ? "type 品类页" : "机型列表页");
const tally = {};
for (const f of remaining) tally[bucket(f)] = (tally[bucket(f)] || 0) + 1;
const zh = froms.filter((f) => /^\/zh\//.test(f));
const zhGone = zh.filter((f) => !onDisk(f));

console.log(`【旧址残留】表 ${froms.length} 条(_count 声明 ${tbl._count})· 来源 ${REF ? `ref ${REF}` : "工作树"}`);
console.log(`  映射表 from 所指文件,磁盘上【仍存在】的:${remaining.length}`);
for (const [k, v] of Object.entries(tally)) console.log(`     ${k.padEnd(14)} ${v}`);
// 对账:剩余 + 已不在 = 表的总条数。让分子分母永远合得上。
console.log(`  对账:仍存在 ${remaining.length} + 已不在 ${froms.length - remaining.length} = ${froms.length} / ${froms.length}`);
console.log(`  zh 条目 ${zh.length} 条,其中文件本就不在磁盘上 ${zhGone.length} 条(那几条只需 301,无页可删)`);
console.log(remaining.length === 0
  ? "\n✅ 剩余 0 —— 旧址已删净。⚠️ 只有在此之前见过非零,这个 0 才作数。"
  : `\n⚠️ 剩余 ${remaining.length} —— 收尾那一刀尚未执行。**这正是这把尺子的正对照:它会报非零。**`);
remaining.slice(0, 3).forEach((f) => console.log(`     例: ${f}`));
process.exit(remaining.length === 0 ? 0 : 1);
