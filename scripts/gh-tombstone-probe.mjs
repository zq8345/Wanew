#!/usr/bin/env node
/**
 * gh-tombstone-probe — 回答一个只能问 GitHub 的问题:
 * **对一个【不存在】的路径下 `sha: null` 墓碑,建 tree 会怎样?**
 *
 * 为什么这个答案要紧:Admin 的删除侧全部带 `exists` 守卫,而 `exists` 查的是
 * `data/pages-list.json`。5b 删 227 个静态页时若没同步更新那份清单,守卫就会说谎 ——
 * 于是会对已经不存在的路径下墓碑。**如果 GitHub 因此让整个 commit 失败,
 * 那 5b 的删除批次会连带把 admin 的保存功能一起打死**,而症状是"保存报错",
 * 没有人会想到是几天前删页时漏更新了一份清单。
 *
 * 🔴 **这个脚本只建 tree,不 POST commit、不 PATCH ref。**
 *    tree 是游离对象,不被任何分支引用,GitHub 自行回收 —— **分支一个字节不动。**
 *    所以它可以直接在真仓上跑,不需要临时分支。
 *
 * ⚠️ 需要 GITHUB_TOKEN。官网这台机器上**没有凭据**(实测 GITHUB_TOKEN/GH_TOKEN 皆空、
 *    gh 未安装),所以这个脚本由有凭据的一方跑。无凭据时 exit 9(仪器无效),不是通过。
 *
 * 用法: GITHUB_TOKEN=xxx GITHUB_REPO=zq8345/Wanew node scripts/gh-tombstone-probe.mjs
 * 退出: 0 = 拿到答案(答案打印在输出里); 9 = 仪器无效
 */
const API = "https://api.github.com";
const TOKEN = process.env.GITHUB_TOKEN;
const REPO = process.env.GITHUB_REPO || "zq8345/Wanew";
const BRANCH = process.env.GITHUB_BRANCH || "main";

if (!TOKEN) {
  console.error("\n❌ 仪器无效:缺 GITHUB_TOKEN —— **没测成,不是测出了什么**。");
  process.exit(9);
}
const H = { Authorization: `Bearer ${TOKEN}`, Accept: "application/vnd.github+json", "User-Agent": "wanew-probe" };
const [owner, name] = REPO.split("/");

async function j(url, init) {
  const r = await fetch(`${API}${url}`, { ...init, headers: { ...H, ...(init?.headers || {}) } });
  return { ok: r.ok, status: r.status, body: await r.text() };
}

const ref = await j(`/repos/${owner}/${name}/git/ref/heads/${BRANCH}`);
if (!ref.ok) { console.error(`\n❌ 仪器无效:读不到 ${BRANCH} 的 head(${ref.status}) —— 前提不成立。`); process.exit(9); }
const headSha = JSON.parse(ref.body).object.sha;
const headCommit = await j(`/repos/${owner}/${name}/git/commits/${headSha}`);
if (!headCommit.ok) { console.error("\n❌ 仪器无效:读不到 head commit。"); process.exit(9); }
const baseTree = JSON.parse(headCommit.body).tree.sha;

console.log(`【gh-tombstone-probe】${REPO}@${BRANCH}  base_tree=${baseTree.slice(0, 8)}`);
console.log("⚠️ 只建 tree,不建 commit、不移 ref —— 分支不会有任何改变。\n");

const GHOST = ".probe-does-not-exist/never-created.txt";
const cases = [
  { label: "① 只对【不存在】的路径下墓碑", tree: [{ path: GHOST, mode: "100644", type: "blob", sha: null }] },
  { label: "② 一个真删 + 一个幽灵墓碑混在同一棵 tree",
    tree: [{ path: "README.md", mode: "100644", type: "blob", sha: null },
           { path: GHOST, mode: "100644", type: "blob", sha: null }] },
];

// 🔴 对照物先证明:一个【必然成功】的 tree。它若失败，说明是权限/仓状态的问题，
//    那么上面两例的失败就不能归因给"墓碑"。**没有这一格，红了也不知道红在哪。**
cases.unshift({ label: "⓪ 对照:一个必然合法的 tree(写一个真文件)",
  tree: [{ path: ".probe-control.txt", mode: "100644", type: "blob", content: "probe\n" }] });

let control = null;
for (const c of cases) {
  const r = await j(`/repos/${owner}/${name}/git/trees`, {
    method: "POST", body: JSON.stringify({ base_tree: baseTree, tree: c.tree }),
  });
  const line = r.ok ? `✅ ${r.status} 成功` : `🔴 ${r.status} 失败`;
  console.log(`${c.label}\n   ${line}`);
  if (!r.ok) console.log(`   服务器原话: ${r.body.replace(/\s+/g, " ").slice(0, 220)}`);
  if (c.label.startsWith("⓪")) {
    control = r.ok;
    if (!r.ok) { console.error("\n❌ 仪器无效:连对照都建不出来 —— 不是墓碑的问题,不出结论。"); process.exit(9); }
  }
  console.log("");
}

console.log("── 结论怎么读 ──────────────────────────────────────────────");
console.log("① 成功 → 幽灵墓碑无害,5b 删页与 pages-list 不同步【不会】打死 admin 保存");
console.log("① 失败 → 🔴 5b 的删除批次必须与 data/pages-list.json 同批更新,否则 admin 保存全挂");
console.log("② 是更贴近真实的形状(一次保存里既有真删也可能有幽灵),以它为准");
