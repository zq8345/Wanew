// CSS 指纹文件名 —— 取代手工 bump `?v=NN`。
//
// 为什么换掉 `?v=NN`(2026-07-28 实战教训,别改回去):
//   查询串方案自带一个窗口 —— **新 URL 的第一次请求最可能落在部署尚未传开的那几十秒里**,
//   边缘回源拿到【还没换的旧文件】,再按 `immutable` 钉一年。生产上真发生过:`?v=60`
//   被存成 v5 之前的旧 CSS,新 HTML 配旧 CSS,页面半坏,而且 purge 也救不回已经进了
//   访客浏览器的那一年 —— 只能再 bump 一次逃走。
//   指纹文件名把这个故障换了个性质:窗口里的请求打到一个【还不存在的路径】→ 404,
//   短暂、自愈、而且看得见。**把"永久且静默"换成"短暂且明显",方向上永远是对的交易。**
//
// ⚠️ 现状实测(2026-07-28 生产 curl):/skin/* 的 `max-age=31536000, immutable` 【确实生效】
//   (三种取法都返回它)。_headers 里那条说"当前不生效"的留档是 2026-07-27 的,已过时,同批改掉。
//
// ⚠️ 指纹【不等于】生产所服务字节的 sha256(2026-07-28 实测,别当故障排查):
//   指纹算的是【本地工作区字节 = CRLF】(autocrlf checkout),而 git 库里存的、
//   CF Pages 部署出去的是 【LF】。实测 w3.f61c2d853b.css:本地 131653 B、生产 129972 B,
//   差 1681 = 行数,去掉 CR 后逐字节相同 —— 纯 EOL,内容零差异。
//   缓存正确性不受影响:内容一变 → 本地字节变 → 指纹变 → URL 变,该换的还是会换。
//   **但验证生产时不许拿"指纹 == 生产字节 sha"当判据**,它必然对不上。
//   判据要用【文件里的规则】,而且那条规则必须在旧版本上为假 —— 否则是恒真式,
//   给出的绿没有信息量(同日踩过:`repeat(6, 1fr)` 旧文件里本来就有 1 处)。
//
// 用法:regen + chrome-sync 之后跑一次。它是幂等的:内容没变就什么都不做。
import fs from "fs";
import path from "path";
import crypto from "crypto";

const REPO = process.cwd();
const CSS_DIR = path.join(REPO, "skin", "css");
const SRC = path.join(CSS_DIR, "w3.css");            // 可编辑真源(也会被静态服务,但没人引用它)
// ⚠️ w3.js 同样走指纹:它此前是 ?v=NN,那是【同一个会被投毒的窟窿】,只是没人踩到过。
//    一套机制管两个资产,别留一个旧口子等着哪天咬人。
const JS_DIR = path.join(REPO, "skin", "js");
const JS_SRC = path.join(JS_DIR, "w3.js");
const WRITE = process.argv.includes("--write");

// 资产表:每项 = 真源 + 目录 + 指纹名生成 + 旧引用形态(含迁移前的 ?v=NN)
const ASSETS = [
  { src: SRC, dir: CSS_DIR, url: "/skin/css", ext: "css",
    ref: /\/skin\/css\/w3\.(?:css\?v=\d+|[0-9a-f]{10}\.css)/g, stale: /^w3\.[0-9a-f]{10}\.css$/ },
  { src: JS_SRC, dir: JS_DIR, url: "/skin/js", ext: "js",
    ref: /\/skin\/js\/w3\.(?:js\?v=\d+|[0-9a-f]{10}\.js)/g, stale: /^w3\.[0-9a-f]{10}\.js$/ },
];
for (const a of ASSETS) {
  a.buf = fs.readFileSync(a.src);
  a.hash = crypto.createHash("sha256").update(a.buf).digest("hex").slice(0, 10);
  a.name = `w3.${a.hash}.${a.ext}`;
}
const hash = ASSETS[0].hash, NAME = ASSETS[0].name;

// 站内所有 HTML(模板 + 产出)
const pages = [];
(function walk(d) {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    if (e.name === "node_modules" || e.name === ".git") continue;
    const p = path.join(d, e.name);
    if (e.isDirectory()) walk(p);
    else if (e.name.endsWith(".html")) pages.push(p);
  }
})(REPO);

// 旧引用两种形态都认:`?v=NN`(迁移前)与 `w3.<旧hash>.<ext>`(迁移后再改内容)
let files = 0, refs = 0;
for (const p of pages) {
  const s0 = fs.readFileSync(p, "utf8");
  let next = s0;
  for (const a of ASSETS) {
    const hits = next.match(a.ref);
    if (!hits) continue;
    refs += hits.length;
    next = next.replace(a.ref, `${a.url}/${a.name}`);
  }
  if (next === s0) continue;
  files++;
  if (WRITE) fs.writeFileSync(p, next);
}

// 陈旧的指纹副本一并清掉,否则仓库会越攒越多份
const stale = [];
for (const a of ASSETS) {
  const old = fs.readdirSync(a.dir).filter((f) => a.stale.test(f) && f !== a.name);
  stale.push(...old.map((f) => `${a.url}/${f}`));
  if (WRITE) {
    fs.writeFileSync(path.join(a.dir, a.name), a.buf);
    for (const f of old) fs.unlinkSync(path.join(a.dir, f));
  }
}

// 自证:写完之后不许再有任何 `?v=` 形态的引用,且每一处引用都指向当前指纹
let leftoverV = 0, wrongHash = 0, ok = 0;
if (WRITE) {
  for (const p of pages) {
    const s = fs.readFileSync(p, "utf8");
    leftoverV += (s.match(/w3\.(?:css|js)\?v=/g) || []).length;
    for (const a of ASSETS)
      for (const m of s.match(new RegExp(`${a.url}/w3\\.[0-9a-f]{10}\\.${a.ext}`, "g")) || [])
        { m.includes(a.hash) ? ok++ : wrongHash++; }
  }
}

console.log("css-hash  " + ASSETS.map((a) => `${a.url}/${a.name}`).join("  ·  "));
console.log(`  改写引用 ${refs} 处 / ${files} 个文件${WRITE ? "" : "(dry-run,未写盘;加 --write 生效)"}`);
if (stale.length) console.log(`  ${WRITE ? "已删" : "待删"}陈旧指纹副本 ${stale.length}: ${stale.join(", ")}`);
if (WRITE) {
  console.log(`  自证:残留 ?v= 引用 ${leftoverV}(须 0) · 指向当前指纹 ${ok} · 指向别的指纹 ${wrongHash}(须 0)`);
  if (leftoverV || wrongHash) { console.error("❌ 自证不通过"); process.exit(1); }
  for (const a of ASSETS) if (!fs.existsSync(path.join(a.dir, a.name))) { console.error("❌ 指纹文件没写出来:" + a.name); process.exit(1); }
  console.log("✅ 完成");
}
