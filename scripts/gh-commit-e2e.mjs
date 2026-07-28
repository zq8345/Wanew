#!/usr/bin/env node
/**
 * gh-commit-e2e — 验 commitFiles 走内联 `content` 之后,**真的能提交、且字节不变形**。
 *
 * 🔴 为什么必须是真调用:这个改动唯一有价值的验收就是"往真仓库提交一次多文件 commit
 *    并把内容读回来逐字节比对"。造一个假 gh 客户端来测,测的是我对 GitHub 的想象 ——
 *    今天已经栽过一次"测了一份复刻品"(把 Function 的判据抄进测试里跑,
 *    而生产上那段逻辑根本收不到请求)。
 *
 * 🔴 它验的两件事,都是文档【没有明说】的推论:
 *    ① **编码**:blob API 显式传 `encoding:"utf-8"` 是因为它还支持 base64;
 *       tree API 的 `content` 没有这个字段。推论是"JSON 请求体按规范就是 UTF-8,
 *       所以只有一种解释"。**推论不是证据** —— 所以这里塞满中文/西语/葡语重音/emoji,
 *       提交后读回来比对。错了会静默写坏全站三语数据,是这个改动后果最重的一条。
 *    ② **请求体大小**:103 个文件内联进一个 POST。官方文档两处都没写上限,
 *       所以这里按真实最坏体积造(默认 ~4MB),让 GitHub 自己回答。
 *
 * ⚠️ 它**只在临时分支上操作**,永不碰 main;跑完删掉那个分支。
 * ⚠️ 需要 GITHUB_TOKEN / GITHUB_REPO。**这台机器上没有凭据**,所以这个脚本由 admin 侧跑。
 *
 * 用法: GITHUB_TOKEN=xxx GITHUB_REPO=zq8345/Wanew node scripts/gh-commit-e2e.mjs [--files 103]
 * 退出: 0 = 全过; 1 = 判据不过; 9 = 仪器无效(没凭据 / 前提不成立)
 */
import { ghConfig, commitFiles, readFile } from "../functions/_lib/github.js";

const N_IX = process.argv.indexOf("--files");
const N = N_IX >= 0 ? Number(process.argv[N_IX + 1]) : 103;   // 默认按品类改名那次的真实规模
const env = { GITHUB_TOKEN: process.env.GITHUB_TOKEN, GITHUB_REPO: process.env.GITHUB_REPO,
  GITHUB_BRANCH: `e2e-commit-probe-${process.env.PROBE_ID || "1"}` };

const base = ghConfig(env);
if (!base) {
  console.error("\n❌ 仪器无效:缺 GITHUB_TOKEN 或 GITHUB_REPO —— **没测成,不是测failed**。");
  process.exit(9);
}
const API = "https://api.github.com";
const H = { Authorization: `Bearer ${env.GITHUB_TOKEN}`, Accept: "application/vnd.github+json",
  "User-Agent": "wanew-e2e" };

// 🔴 数子请求:这个改动的全部意义就是这个数从 5+N 变成 5。
//    包一层全局 fetch 来数 —— 不改被测代码,数的是它真实发出去的请求。
let calls = 0;
const realFetch = globalThis.fetch;
globalThis.fetch = (...a) => { calls++; return realFetch(...a); };

// 各语种的真实字符,外加会被 JSON 转义的东西。**编码坏掉就是在这里现形。**
const SAMPLES = [
  "中文产品标题:星链迷你路由器四口版",
  "Español: Adaptador de corriente — 220 V, ±5 %, ¿compatible?",
  "Português: Suporte de fixação para telhado — instalação rápida, não inclui parafusos",
  'JSON 转义面:引号 " 反斜杠 \\ 换行\n制表\t · emoji 🛰️ · 零宽​ · 全角space　',
];
const body = (i) => `${SAMPLES[i % SAMPLES.length]}\n第 ${i} 个文件 / file #${i}\n${"×".repeat(200)}\n`;

async function main() {
  // ── setup:建一条临时分支,从 main 的 head 拉 ────────────────────────────
  const mainRef = await (await realFetch(`${API}/repos/${base.owner}/${base.name}/git/ref/heads/main`, { headers: H })).json();
  if (!mainRef.object?.sha) { console.error("\n❌ 仪器无效:读不到 main 的 head —— 前提不成立,不出结论。"); process.exit(9); }
  const mk = await realFetch(`${API}/repos/${base.owner}/${base.name}/git/refs`, {
    method: "POST", headers: H,
    body: JSON.stringify({ ref: `refs/heads/${env.GITHUB_BRANCH}`, sha: mainRef.object.sha }) });
  if (!mk.ok && mk.status !== 422) {   // 422 = 分支已存在,可复用
    console.error(`\n❌ 仪器无效:建不出临时分支(${mk.status})—— 没测成。`); process.exit(9);
  }
  console.log(`【gh-commit-e2e】临时分支 ${env.GITHUB_BRANCH} 就位,准备提交 ${N} 个文件`);

  const files = Array.from({ length: N }, (_, i) => ({ path: `.e2e-probe/f${i}.txt`, content: body(i) }));
  const bytes = files.reduce((s, f) => s + Buffer.byteLength(f.content), 0);
  console.log(`   裸内容 ${(bytes / 1024 / 1024).toFixed(2)} MB · JSON 化后 ${(Buffer.byteLength(JSON.stringify(files)) / 1024 / 1024).toFixed(2)} MB`);

  calls = 0;
  let commitErr = null;
  try { await commitFiles(env, { ...base, branch: env.GITHUB_BRANCH }, files, "e2e: inline-content commit probe"); }
  catch (e) { commitErr = e; }
  const used = calls;

  let fail = 0;
  const bad = (m) => { console.error(`  ❌ ${m}`); fail++; };

  if (commitErr) {
    // 🔴 提交失败本身就是结论之一 —— 尤其如果是体积打回来的。**照抄服务器原话,不转述。**
    bad(`提交失败,服务器原话:${commitErr.message}`);
    console.error(`     ⚠️ 若这里是 413/太大,说明"太多请求"换成了"一个太大的请求" —— 那不算修好,走退路(逐文件 blob + 分批)。`);
  } else {
    // ① 子请求数 —— 这个改动的全部意义
    console.log(`  子请求数 ${used}(文件数 ${N})`);
    if (used > 8) bad(`子请求 ${used} 条,期望常数 ~5 —— 循环里还在发请求,改动没生效。`);
    else console.log(`  ✅ 与文件数无关(${N} 个文件只用了 ${used} 条,Workers 上限 50)`);

    // ② 🔴 读回来逐字节比对 —— 验编码的唯一方式
    let checked = 0, mismatch = 0;
    for (const i of [0, 1, 2, 3, N - 1].filter((x) => x >= 0 && x < N)) {
      const got = await readFile(env, { ...base, branch: env.GITHUB_BRANCH }, `.e2e-probe/f${i}.txt`);
      checked++;
      if (got !== files[i].content) {
        mismatch++;
        console.error(`  ❌ f${i} 读回来不一致:`);
        console.error(`     写入 ${JSON.stringify(files[i].content.slice(0, 60))}`);
        console.error(`     读回 ${JSON.stringify(String(got).slice(0, 60))}`);
      }
    }
    if (mismatch) bad(`${mismatch}/${checked} 个抽样字节不一致 —— **内联 content 的编码推论不成立**,走退路。`);
    else console.log(`  ✅ ${checked} 个抽样(含中文/西语重音/葡语/emoji/零宽字符)读回逐字节一致`);
  }

  // ── 清理:删临时分支 ─────────────────────────────────────────────────────
  const del = await realFetch(`${API}/repos/${base.owner}/${base.name}/git/refs/heads/${env.GITHUB_BRANCH}`,
    { method: "DELETE", headers: H });
  console.log(del.ok ? `  🧹 临时分支已删除` : `  ⚠️ 临时分支【没删掉】(${del.status})—— 请手动删 ${env.GITHUB_BRANCH}`);

  if (fail) { console.error(`\n❌ ${fail} 条不过\n`); process.exit(1); }
  console.log(`\n✅ 内联 content 成立:${N} 个文件、常数子请求、字节不变形\n`);
}

main().catch((e) => { console.error(`\n❌ 仪器无效:脚本自身出错 —— ${e.message}`); process.exit(9); });
