#!/usr/bin/env node
/**
 * pt 译法漂移守卫 —— 抓「同一个英文概念，在站上被翻成了不止一种葡语」
 *
 * ⚠️⚠️ 先说清这把尺子【管什么、不管什么】，别让绿灯被当成"pt 没问题"：
 *
 *   本闸只判一件事：**同一个 en 串 → 出现了多个不同的 pt-BR 串**。
 *   这件事【完全自证】：证据就在语料里，不需要任何外部术语标准。
 *
 *   本闸【不判】：
 *     ① **译得对不对** —— 一个 en 全站只有一种 pt 译法，但那个译法本身是错的，本闸全绿。
 *     ② **读感 / 地道度** —— 没有任何自动手段能判"像不像巴西人写的"。
 *     ③ **pt-PT 混入**（ecrã/telemóvel/autocarro 之类欧葡用词）—— 那需要一份【签过字的
 *        pt-BR 术语表】，而**目前没有**。es 那边之所以能判，是因为 data/es-glossary.json
 *        是有人逐条带 evidence 签过的；pt 没有对等物。
 *        → **我不自己发明术语标准**。候选清单单独交给总工/Joe 拍，拍完再进闸。
 *
 *   ⭐ 所以：**它红 = 一定有不一致；它绿 ≠ pt 是好的葡语。** 和 es-glossary-check 同一条契约。
 *
 * ⚠️ 豁免必须是【针对本问题】的：`reason.pt-drift`。
 *   为什么不复用现成的 `reason` / `reason.dupe`：那些是写给 catalog-dupe-check 的，
 *   回答的是"同一个 en 串为什么允许存两份 key"——**和"这两份为什么可以翻得不一样"是两个问题**。
 *   拿回答 A 的豁免去放行 B，闸就永远绿。今天实测正是如此：5 处漂移**全都带 `reason`**，
 *   若复用就一条也抓不到，其中还包括 `Off-grid` vs `Off-Grid` 这种**纯大小写不一致、
 *   没有任何角色理由**的真漂移。
 *   —— 这就是"容错会吃掉错误信号"：豁免机制本身也会。
 *
 * 默认 --report（exit 0，只打印）；--strict 时有漂移就 exit 1。
 * 现在默认 report 是【有意的】：5 处待人拍板，还没人签。一上来就红的门最后会被所有人略过，
 * 所以先让它可读、可对账；等那 5 条判完(加 reason.pt-drift 或改成统一译法)再切 --strict 进闸套。
 */
import fs from "fs";
import path from "path";

const STRICT = process.argv.includes("--strict");
const ROOT = process.cwd();

const files = [
  ...fs.readdirSync(path.join(ROOT, "data")).filter((f) => f.endsWith(".json")).map((f) => `data/${f}`),
  ...fs.readdirSync(path.join(ROOT, "data", "pages")).filter((f) => f.endsWith(".json")).map((f) => `data/pages/${f}`),
];

const byEn = new Map();          // en -> Map(pt -> [{file,key,exempt}])
let pairs = 0;
for (const rel of files) {
  let d;
  try { d = JSON.parse(fs.readFileSync(path.join(ROOT, rel), "utf8")); } catch { continue; }
  if (!d || typeof d !== "object" || Array.isArray(d)) continue;
  for (const [key, v] of Object.entries(d)) {
    if (!v || typeof v !== "object" || Array.isArray(v)) continue;
    const en = v.en, pt = v["pt-BR"];
    if (typeof en !== "string" || typeof pt !== "string" || !en || !pt) continue;
    pairs++;
    if (!byEn.has(en)) byEn.set(en, new Map());
    const m = byEn.get(en);
    if (!m.has(pt)) m.set(pt, []);
    m.get(pt).push({ file: rel, key, exempt: Object.prototype.hasOwnProperty.call(v, "reason.pt-drift") });
  }
}

const drifts = [...byEn.entries()].filter(([, m]) => m.size > 1);
// 一处漂移只有在【每一个参与它的 key 都显式豁免】时才算放行 —— 只豁免一半等于没解决。
const unresolved = drifts.filter(([, m]) => [...m.values()].flat().some((h) => !h.exempt));

console.log("【pt 译法漂移守卫】");
console.log(`  扫了 ${files.length} 个数据文件 · ${pairs} 对 en/pt-BR`);
console.log(`  同一 en 出现多种 pt:  ${drifts.length}  (其中未豁免 ${unresolved.length})`);
console.log("");

for (const [en, m] of unresolved) {
  console.log(`  ❌ en "${en}"  → ${m.size} 种 pt 译法`);
  for (const [pt, hits] of m) {
    console.log(`       pt "${pt}"`);
    for (const h of hits) console.log(`          ${h.file}:${h.key}${h.exempt ? "  (已豁免)" : ""}`);
  }
  console.log("");
}

console.log("⚠️ 本闸只判【同一 en 是否有多种 pt】。它绿 ≠ pt 译得对、≠ 读着地道、≠ 没有欧葡用词");
console.log("   —— 那三件需要一份签过字的 pt-BR 术语表，目前没有(见文件头)。");

if (unresolved.length === 0) {
  console.log("\n✅ 没有未决的 pt 译法漂移。");
  process.exit(0);
}
console.log(`\n${STRICT ? "❌ 不合格" : "📋 报告模式(exit 0)"} —— ${unresolved.length} 处待判:`);
console.log("   每处二选一:① 统一成同一个 pt 译法;② 确属不同角色 → 给【每一个】参与的 key 加");
console.log("   `reason.pt-drift` 写明为什么这里必须不同。**别拿 reason.dupe 顶替**,那是另一个问题的答案。");
process.exit(STRICT ? 1 : 0);
