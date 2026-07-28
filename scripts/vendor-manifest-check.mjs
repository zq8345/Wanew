#!/usr/bin/env node
/**
 * vendor-manifest-check — 守 data/vendor-manifest.json 这份【规范】。
 *
 * 🔴 它不测量任何东西,也不解析任何东西 —— 只回答两个是非题:
 *      ① 清单里写的文件,在不在?
 *      ② 该表态的文件,表态了没有?
 *    **这正是它值得存在的原因。** 总工立过:「当仪器故障率高于缺陷发现率时,加仪器是负收益」,
 *    而今天三个窗口清点出的八次事故**全是仪器出问题**(正则漏简写属性、括号配平被字符串带歪、
 *    截取跑过调用边界、CRLF 假差异…)。这道闸不匹配模式、不推导、不聚合,**没有可漂的地方**。
 *
 * 🔴 为什么"该表态的文件"必须全员出现,而不是只列要镜像的:
 *    **忘记把新文件加进清单,和"决定不镜像它",在只列白名单的清单里长得一模一样。**
 *    要求全员表态之后,新增一个 _lib 文件就必须做一次显式决定 —— 而这道闸替人记得问。
 *    (这条缺口不是假想:官网新增 page-paths.js 时,admin 的守卫比的是它自己那份名单,
 *     **结构上不可能发现有个新文件该镜像** —— 是总工口头提醒才补上的。)
 *
 * 用法: node scripts/vendor-manifest-check.mjs [--json]
 * 退出: 0 = 全过; 1 = 有缺
 */
import fs from "fs";
import path from "path";

const MANIFEST = "data/vendor-manifest.json";
const AS_JSON = process.argv.includes("--json");
// 需要全员表态的目录/文件。⚠️ 加一个新的受管目录时,这里也要加 —— 而"这里漏了"
//    的后果是那个目录整片不被要求表态,所以它自己也要能被看出来:下面会打印覆盖面。
const GOVERNED = [
  { dir: "functions/_lib", ext: [".js", ".mjs"] },
  { dir: "scripts", ext: [".mjs"], only: ["locale-dirs.mjs"] },
];

const m = JSON.parse(fs.readFileSync(MANIFEST, "utf8"));
const declared = new Map((m.files || []).map((f) => [f.path, f]));

let fail = 0;
const bad = (s) => { console.error(`  ❌ ${s}`); fail++; };

// ① 清单里写的,文件必须真在
for (const [p, f] of declared) {
  if (!fs.existsSync(p)) bad(`清单里有 ${p},文件不存在 —— 它要么被删了没更清单,要么路径写错了`);
  if (typeof f.mirror !== "boolean") bad(`${p} 的 mirror 不是布尔 —— 表态必须明确`);
  if (!f.why || !f.why.trim()) bad(`${p} 没写 why —— 一个没有理由的决定,下个人无法判断它是否仍然成立`);
}

// ② 受管目录下的文件,必须都表过态
const governedFiles = [];
for (const g of GOVERNED) {
  if (!fs.existsSync(g.dir)) continue;
  for (const e of fs.readdirSync(g.dir, { withFileTypes: true })) {
    if (!e.isFile() || !g.ext.some((x) => e.name.endsWith(x))) continue;
    if (g.only && !g.only.includes(e.name)) continue;
    governedFiles.push(path.posix.join(g.dir, e.name));
  }
}
for (const p of governedFiles) {
  if (!declared.has(p)) {
    bad(`${p} 没有在 ${MANIFEST} 里表态 —— **新增一个 _lib 文件必须显式决定它要不要被 Admin 镜像**;` +
      `漏表态与"决定不镜像"在别处看起来一样,所以这里不许沉默`);
  }
}

const mirrored = [...declared.values()].filter((f) => f.mirror).map((f) => f.path);
if (AS_JSON) console.log(JSON.stringify({ governed: governedFiles.length, declared: declared.size, mirrored }, null, 2));
else {
  console.log(`\n【vendor-manifest-check】受管文件 ${governedFiles.length} · 已表态 ${declared.size} · 需镜像 ${mirrored.length}`);
  for (const p of mirrored) console.log(`   ↳ ${p}`);
}

// ⚠️ 覆盖面为 0 也会让上面全过 —— 那是"扫空集还报绿"。钉住分母。
if (governedFiles.length === 0) bad("受管文件扫到 0 个 —— GOVERNED 的路径写错了,这次什么都没验");

if (fail) { console.error(`\n❌ ${fail} 条不过\n`); process.exit(1); }
if (!AS_JSON) console.log("  ✅ 清单与实际文件双向对齐\n");
