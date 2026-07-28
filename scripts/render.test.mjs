#!/usr/bin/env node
// 回归测试:钉住那些【已经咬过我们两次以上】的行为。
//   node scripts/render.test.mjs
//
// 每一条都对应一个真事故,不是想象出来的边界。测试存在的意义是把"我记得"换成"它会炸"。
import fs from "fs";
import { renderPage, assertNoTokens } from "../functions/_lib/render.js";
import { visibleText, isProse } from "./page-extract.migration.mjs";
import { localeDirs } from "./locale-dirs.mjs";

let pass = 0, fail = 0;
const ok = (name, cond, extra = "") => { if (cond) { pass++; console.log(`  ✅ ${name}`); } else { fail++; console.log(`  🔴 ${name} ${extra}`); } };
const throws = (name, fn, re) => {
  try { fn(); fail++; console.log(`  🔴 ${name} — 没抛`); }
  catch (e) { const m = re.test(e.message); if (m) { pass++; console.log(`  ✅ ${name}`); } else { fail++; console.log(`  🔴 ${name} — 抛了但不是预期的: ${e.message}`); } }
};

const urlOf = (p) => p;
const cat = { "x.a": { en: "A", "pt-BR": "Á" } };
// ⭐ dirOf 从【真的 locales.json】派生,不在测试里另写一份映射 —— 测试自己造一份映射,
//    就又成了同一条规则的第 N 份实现,而这正是被测的那个 bug。
const LOCALES = JSON.parse(fs.readFileSync("data/locales.json", "utf8"));
const dirOf = (loc) => localeDirs(LOCALES)[loc] ?? "";
const enabled = LOCALES.enabled;

console.log("\n【① canonical 必须是每页自己的路径】 —— 曾把 11 个信息页全部规范化到首页:");
ok("每页 canonical 用自己的 path",
  renderPage('<link rel="canonical" href="{{CANONICAL}}" />', { locale: "en", catalog: cat, urlOf, path: "/faq/", dirOf, enabled })
    .includes('href="https://wanew.com/faq/"'));
ok("pt 加 /pt 前缀",
  renderPage('<link rel="canonical" href="{{CANONICAL}}" />', { locale: "pt-BR", catalog: cat, urlOf, path: "/faq/", dirOf, enabled })
    .includes('href="https://wanew.com/pt/faq/"'));
throws("path 形状不对就炸(而不是悄悄当成首页)",
  () => renderPage("{{CANONICAL}}", { locale: "en", catalog: cat, urlOf, path: "faq", dirOf, enabled }), /path 必须形如/);
ok("breadcrumb 首页 URL 与本页 URL 是两个不同的 token",
  renderPage('{{HOME_URL}}|{{CANONICAL}}', { locale: "en", catalog: cat, urlOf, path: "/faq/", dirOf, enabled }) === "https://wanew.com|https://wanew.com/faq/");

// ⭐ 第三门语言。原来这里是 `locale === "en" ? path : "/pt" + path` —— 一个【二元】判据:
//   凡不是 en 的一律当 pt。它在只有两门语言时【永远是对的】,所以两轮全绿都没照出来;
//   es 一进来,82 个西语页的 canonical 全部指向 /pt/,等于对 Google 声明"西语页是葡语页的副本"。
//   ⚠️ 这条断言不测"es 对不对",它测的是**判据是不是派生的** —— 所以下面还钉了"绝不出现 /pt/"。
console.log("\n【①b 第三门语言】 —— 二元判据(en / 非 en)在只有两门语言时永远是对的:");
{
  const esOut = renderPage('<link rel="canonical" href="{{CANONICAL}}" />|{{HOME_URL}}',
    { locale: "es-MX", catalog: cat, urlOf, path: "/faq/", dirOf, enabled });
  ok("es canonical 指向 /es/,不是 /pt/", esOut.includes('href="https://wanew.com/es/faq/"'), esOut);
  ok("es 页里绝不出现 /pt/", !esOut.includes("/pt/"), esOut);
  ok("es 的 HOME_URL 也是派生的", esOut.endsWith("https://wanew.com/es/"), esOut);
}
throws("不传 dirOf 就炸 —— 缺省回落到 'pt' 正是要根除的那个 bug",
  () => renderPage("{{CANONICAL}}", { locale: "es-MX", catalog: cat, urlOf, path: "/faq/", enabled }), /必须传 dirOf/);

console.log("\n【② 否定式:任何剩下的 {{...}} 都要炸】 —— 曾因正则不认连字符而放行:");
throws("带连字符的 token(正则曾不认识它,于是它被原样印出去)",
  () => renderPage("{{t.certifications-testing.meta.keywords}}", { locale: "en", catalog: cat, urlOf, path: "/x/", dirOf, enabled }), /不存在的 key|未解析/);
throws("我还没想到的 token 形状,也必须炸",
  () => assertNoTokens("<p>{{SOMETHING_I_NEVER_ANTICIPATED}}</p>", "en"), /未解析的 token/);
throws("拼错的 token 不会静默留在页面上",
  () => assertNoTokens("<p>{{t.x.a</p>{{ t.x.a }}", "en"), /未解析的 token/);
ok("解析干净就不炸", renderPage("{{t.x.a}}", { locale: "pt-BR", catalog: cat, urlOf, path: "/x/", dirOf, enabled }) === "Á");

console.log("\n【③ 紧跟【闭】标签后面的裸文本】 —— 同一个 bug 咬了两次(R1 的 seeder,R3(b) 的 contact/oem-odm):");
ok("</label>Name —— 用户真正读的那半,曾被整个漏掉",
  visibleText("<label>A</label>Name<input>").includes("Name"), JSON.stringify(visibleText("<label>A</label>Name<input>")));
ok("同时也要抓到标签包着的那半",
  visibleText("<label>A</label>Name<input>").includes("A"));
ok("连续闭标签之间的文本",
  visibleText("<div><b>x</b></div>Bare<div></div>").includes("Bare"));
ok("不含字母的不是散文(→ × 纯数字…一条规则代替一串特例)",
  visibleText("<span>→</span><b>12</b><i>Hi</i>").join("|") === "Hi");
ok("script/style 里的内容不是散文",
  visibleText("<style>.a{color:red}</style><script>var x='Hi'</script><p>Real</p>").join("|") === "Real");

// ④ 总工点名要的断言。我曾误报「抽取器有跨 slug 状态串扰」并据此宣布之前所有多 slug 数据作废,
// 后来实测那是假警报 —— 我比了两个不同的对象(单跑时查模板、批量跑时查生成页)。
// 但他要的这条断言本身是对的,bug 假不代表守卫没用:
//   ⭐「一个结果依赖于『和谁一起跑』的工具,产出的不是数据,是巧合。」
// 模块级 let / 缓存 / 正则 lastIndex / 累积数组没在 slug 之间重置,都会造成这个形状,而且它
// 只在批量时现形 —— 正是最难靠肉眼发现的一类。现在它被钉死了。
// 「不含字母 = 不是散文」方向对、线画错了:数字【是】随语种变的。pt 写 400.000–600.000,
// en 写 400,000–600,000 —— 我的规则把它判成装饰、不给 key,en 就把 pt 盖掉了。
console.log("\n【③b 数字有本地化形态,不是装饰】 —— 一条规则代替特例是对的,但线得画在真实的分界上:");
ok("带千位分隔符的数字 = 散文(en 格式)", isProse("400,000–600,000"));
ok("带千位分隔符的数字 = 散文(pt 格式)", isProse("400.000–600.000"));
ok("裸字形不是散文", !isProse("→") && !isProse("•"));
ok("单个整数不是散文", !isProse("12"));
ok("带字母的永远是散文", isProse("15 Years") && isProse("200+ patentes"));

console.log("\n【④ 单跑 == 批量跑】 —— 结果依赖于「和谁一起跑」的工具,产出的是巧合:");
{
  const { execSync } = await import("child_process");
  const FLAG = "--i-know-this-is-migration-only";
  const rd = (p) => (fs.existsSync(p) ? fs.readFileSync(p, "utf8") : null);
  const snap = (s) => [rd(`data/templates/page-${s}.html`), rd(`data/pages/${s}.json`)];
  // ⚠️ 先【存档】跑测试前就存在的产物。第一版我在结尾无条件删掉所有 page-*.html —— 那是
  // 「清理测试自己造的东西」的合理意图,但它同时删掉了【真实抽取出来的模板】:于是我在
  // "全套门"里先跑 test 再跑 i18n-check,guard 找不到任何消费者,报了 281 条假的"key 已腐烂"。
  // ⭐ 一个对仓库有副作用的测试,会去破坏它下游的门。测试必须把世界还原成它进来时的样子。
  const KEEPERS = ["faq", "about", "video", "contact"];
  const saved = {};
  for (const s of KEEPERS) saved[s] = snap(s);
  const solo = {};
  for (const s of ["faq", "video"]) {
    execSync(`node scripts/page-extract.migration.mjs ${FLAG} ${s}`, { stdio: "pipe" });
    solo[s] = snap(s);
  }
  execSync(`node scripts/page-extract.migration.mjs ${FLAG} faq about video contact`, { stdio: "pipe" });
  for (const s of ["faq", "video"]) {
    const b = snap(s);
    ok(`${s}: 单跑产出 === 批量跑产出`, solo[s][0] === b[0] && solo[s][1] === b[1]);
  }
  // 还原:本来有的写回原样,本来没有的删掉
  for (const s of KEEPERS) {
    const [tpl, json] = saved[s];
    const tp = `data/templates/page-${s}.html`, jp = `data/pages/${s}.json`;
    if (tpl === null) { if (fs.existsSync(tp)) fs.unlinkSync(tp); } else fs.writeFileSync(tp, tpl);
    if (json === null) { if (fs.existsSync(jp)) fs.unlinkSync(jp); } else fs.writeFileSync(jp, json);
  }
}

// ⑤ 总工:「凡是『插入/替换』类操作,一律断言『插入后的产物里能找到它』—— 不是断言插入函数返回了 true。」
// 我把 JS-JSON-LD 那段插在了 head/rest 拆分之后,而 `tpl = head + rest` 把它整个丢掉 ——
// 它每次都"成功"、只是什么也没干。⭐ 沉默的成功 = 最贵的失败,和「未解析 token 必须炸」同一个家族。
console.log("\n【⑤ 插入必须在产物里找得到】 —— 沉默的成功 = 最贵的失败:");
{
  const mustContain = (out, needle, what) => { if (!out.includes(needle)) throw new Error(`${what}: 插入后在产物里找不到 ${needle}`); return out; };
  throws("插入后找不到 → 抛,而不是安静地当作成功", () => mustContain("<p>x</p>", "{{TOKEN}}", "test"), /找不到/);
  ok("真的插进去了 → 通过", mustContain("<p>{{TOKEN}}</p>", "{{TOKEN}}", "test").includes("{{TOKEN}}"));
}

// ⑥ 语言切换器 —— 全站唯一一个 100% 失效却活过三轮全绿门的功能。
// 它没被任何门看着,因为 chrome-verify 验的是"和 HEAD 一样",而切换器的 href 是【逐页变量】:
// 一个每页都不同的值,天生落在"零回归"这种门的射程之外。
// ⭐ 而多语言的 scanner 明确把它加进了白名单(`if (/lang-switch__link/) continue`)——
//    「白名单不是『这里不会错』,是『这里我放弃观察』。」bug 就落在那个我们都同意不看的地方。
console.log("\n【⑥ 语言切换器】 —— 逐页变量,零回归门天生看不见它:");
{
  const { execSync } = await import("child_process");
  let out = "", code = 0;
  try { out = execSync("node scripts/switcher-verify.mjs", { encoding: "utf8" }); }
  catch (e) { out = e.stdout || ""; code = 1; }
  const m = out.match(/(\d+) \/ (\d+)/);
  ok(`切换器 ①指向对侧 ②hreflang 一致 ③目标页存在:${m ? `${m[1]}/${m[2]}` : "?"}`, code === 0);
  // 本节是【转调】switcher-verify 再截一个 N/M —— 它那边刚加的根因提示会被这一截吞掉。
  // 转调的门必须把被转调者的根因原样带出来,否则等于把最有用的一句话过滤掉了。
  const root = out.match(/^━━ 先看这里:.*$/m);
  if (root) {
    console.log(`     ${root[0]}`);
    console.log(`     → 先跑:  node scripts/chrome-sync.mjs --write   然后重跑;跑完仍红的才是真问题。`);
  }
}

// ⑦ 仓库卫生 —— 两条「靠人记得」的规矩,而两条都已经证明记不住(gitignore 静默吞文件撞过
//    两次、拿 HEAD 当基线撞过三次),所以它们得会报红。总工:「基线必须是**门管不着的东西**,
//    只要基线能被被测对象改写,门就是面镜子。」
console.log("\n【⑦ 仓库卫生】 —— 被 gitignore 静默吞的文件 · 拿 HEAD 当基线的门:");
{
  const { execSync } = await import("child_process");
  let out = "", code = 0;
  try { out = execSync("node scripts/repo-hygiene-check.mjs", { encoding: "utf8" }); }
  catch (e) { out = (e.stdout || "") + (e.stderr || ""); code = 1; }
  ok(out.trim().split("\n").filter(Boolean).join(" / ") || "(无输出)", code === 0);
}

console.log(`\n${fail ? "🔴" : "✅"} ${pass} 通过 / ${fail} 失败`);
process.exit(fail ? 1 : 0);
