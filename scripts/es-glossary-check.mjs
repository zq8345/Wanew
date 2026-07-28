#!/usr/bin/env node
/**
 * es 术语表守卫 —— 抓「我们漂回欧西语 / 术语不一致」
 *
 * ⭐ 它和 es-leak-scan 是两回事，别混：
 *     es-leak-scan      抓「这句还是英文」        （译没译）
 *     es-glossary-check 抓「这句是【西班牙】西语」（译对没译对给谁看）
 *   906 条页面文案不各带一份 reason —— 出处集中在 data/es-glossary.json，**由本文件强制**。
 *
 * ⚠️⚠️ 这把尺子只有【一个方向是硬的】，我把话说在前面：
 *     它红   = 一定有问题
 *     它绿   ≠ 译文是墨西哥西语
 *   因为禁用词表和标记词表一样【穷举不了】。它抓的是「我们已知会漂的那些」。
 *
 * ⚠️ 已知抓不到的（如实列，不藏 —— 审计窗的规则：「任何『我列了 N 个 X』的自检工具，
 *    都不能用作通过依据」，**这条也管本文件**）：
 *
 *   ① **动词变位式的 usted** —— `Obtenga` / `Pruebe` / `Reciba` / `Visite` 全是 usted，
 *      但它们不含 "usted" 三个字母。**审计窗正是栽在这**：它用自制正则数 tú/usted，
 *      报 tu_count:0，全错，因为词表漏了 Disfruta/Regístrate(tú) 和 Pruebe/Obtenga(usted)。
 *      → 本文件【只查显式 usted/ustedes】。变位式必须人读。**这是一个洞，不是一个特性。**
 *
 *   ② **`su` / `sus` 不能禁** —— 它们在第三人称是完全合法的：
 *      「el kit y su cable」= "the kit and its cable"。禁了会误伤到没法用。
 *      → 语料里「su 出现 0 次」是【统计事实】，不是【可执行规则】。两者不是一回事。
 *
 *   ③ **小数点/千分位只能查一半** —— `25,6`（小数逗号）可判；
 *      但 `1.200`（西班牙千分位）与 `25.600`（真小数）**形状完全相同**，不可判。→ 不做，别猜。
 */
import fs from 'fs';

const G = JSON.parse(fs.readFileSync('data/es-glossary.json', 'utf8'));
const LOC = 'es-MX';

/* ⚠️ 词边界必须含重音字母和 ñ —— 否则 señal 切成 "se"+"al"。与 es-leak-scan 同一条规则。 */
const WORD_RE = /[a-zà-ÿñ][a-zà-ÿñ'-]*/gi;
const strip = (s) => String(s).replace(/<[^>]+>/g, ' ').replace(/&[a-z]+;/gi, ' ');

/* ── 复数：一条规则，不是每个词手写两遍 ──────────────────────────────────
 *
 * ⭐ 这是一个【真洞】，2026-07-27 上线 Solutions 时才发现：表按【精确单词】查，
 *   所以 `barco` 在表里、`barcos` 不在 → 既有 `solutions.marine.card` 里的
 *   「para barcos y embarcaciones」**一直是绿的**。闸没说谎，是它照不到那个词形。
 *
 * ⚠️ 而数据本身已经暴露了这个设计的病：9 个带 variants 的术语里，只有 2 个
 *   （power adapter / RV）**手写了复数**，其余 7 个没写。靠人记得给每个词补一份复数
 *   = N 个特例 = 一定漂。→ 改成【按规则生成】，新增术语自动被照，不用记。
 *
 * 生成方向很重要：**从词表正向生成复数**，不是把语料里的任意词反向单数化。
 *   反向单数化会把 `países`→`paí` 这类噪声塞进查表，制造假阳性；正向生成只会新增
 *   「某个已知错词的复数形」这一种键，命中即真命中。
 *
 * ⚠️ 已知照不到的（如实列，遵本文件规矩）：
 *   ① 不规则/变音复数（lápiz→lápices 这条做了，但 régimen→regímenes 这类重音移位没做）；
 *   ② 多词短语只把【中心词=第一个词】变复数（`adaptador de corriente` →
 *      `adaptadores de corriente` 对；`punta de lanza` 这种中心词不在首位的会漏）。 */
const esPlural = (w) => {
  if (!w || w.length < 3) return null;
  if (/s$/.test(w)) return null;                                  // 已是复数形/不变词，不猜
  if (/z$/.test(w)) return w.slice(0, -1) + 'ces';                // vez → veces
  if (/ión$/.test(w)) return w.slice(0, -3) + 'iones';            // embarcación → embarcaciones（重音消失）
  if (/[aeiou]$/.test(w)) return w + 's';                         // barco → barcos
  if (/[a-zà-ÿñ]$/i.test(w)) return w + 'es';                     // ordenador → ordenadores
  return null;
};
/* 短语：只把中心词（首词）变复数 */
const esPluralPhrase = (p) => {
  const [head, ...rest] = p.split(/\s+/);
  const hp = esPlural(head);
  return hp ? [hp, ...rest].join(' ') : null;
};

/* ── 规则 ①：禁用词 ─────────────────────────────────────────────────── */
const FORBIDDEN = new Map(G.forbidden.map((f) => [f.word.toLowerCase(), f]));
for (const f of G.forbidden) {                                    // 复数形同禁
  const p = esPlural(f.word.toLowerCase());
  if (p && !FORBIDDEN.has(p)) FORBIDDEN.set(p, f);
}

/* 形容词豁免表 —— 同形异义(见 es-glossary.json 的 _forbidden_doc)。
 * 建在这里而不是某条规则里面:一个词可能同时命中禁用词和 variants 两条规则,
 * 豁免必须对两条都生效,否则一边放行一边报红。 */
const ADJ_ALLOW = new Map();
for (const f of G.forbidden) {
  if (!f.allow_adjective_after) continue;
  const w = f.word.toLowerCase();
  ADJ_ALLOW.set(w, f.allow_adjective_after);
  const p = esPlural(w);
  if (p) ADJ_ALLOW.set(p, f.allow_adjective_after);   // 形容词要与名词数一致,复数形同豁免
}

/* ── 规则 ②：术语 variants（已知的错误/竞争译法） ─────────────────────── */
const VARIANTS = new Map();
for (const [term, t] of Object.entries(G.terms)) {
  for (const v of t.variants || []) VARIANTS.set(v.toLowerCase(), { term, want: t.es });
}
/* 复数形自动登记（手写的复数条目仍在表里且先到先得，这里只补没有的） */
for (const [term, t] of Object.entries(G.terms)) {
  for (const v of t.variants || []) {
    if (/\s/.test(v)) continue;                                   // 短语走 MULTIWORD
    const p = esPlural(v.toLowerCase());
    if (p && !VARIANTS.has(p)) VARIANTS.set(p, { term, want: t.es });
  }
}
/* ⚠️ 上面这张表按【单词】查(WORD_RE 切词后逐个查表),所以**多词 variant 它永远匹配不到** ——
 *   `Type C`(缺连字符的错写)被切成 `type`+`c`,两个都不在表里,于是静默放过。
 *   这跟规则④漏掉的那一整类是同一个形状:**照的粒度和要照的东西对不上**。
 *   → 多词 variant 走短语查,单独一条。 */
const MULTIWORD_VARIANTS = [];
const seenPhrase = new Set();
for (const [term, t] of Object.entries(G.terms)) {
  for (const v of t.variants || []) {
    if (!/\s/.test(v)) continue;
    if (!seenPhrase.has(v.toLowerCase())) { seenPhrase.add(v.toLowerCase()); MULTIWORD_VARIANTS.push({ v, term, want: t.es }); }
    const p = esPluralPhrase(v.toLowerCase());                    // 中心词复数形同报
    if (p && !seenPhrase.has(p)) { seenPhrase.add(p); MULTIWORD_VARIANTS.push({ v: p, term, want: t.es }); }
  }
}

/* ── 规则 ④：**术语根本没翻** —— 英文原词原样留在 es 译文里 ────────────────
 *
 * ⭐⭐ 这条是补一个【结构性的洞】,不是加一个特例。总工 2026-07-19 量出来的:
 *   术语表白纸黑字写着 `"DC": {es:"CC", note:"⭐不是 DC"}`,而磁盘上 63 处仍是 `DC`,
 *   检查器却报 `0 处命中` 打了 ✅。
 *
 *   原因:规则② 只照 `variants`(已声明的竞争译法)。**「英文原词压根没翻」这一整类,
 *   它从来没照过** —— 我声明了规则,却没装闸。
 *
 *   ⚠️ 这正是我自己在 _forbidden_doc 里写的那句「**它绿 ≠ 译文是墨西哥西语**」的实例。
 *      而且是最坏的一种:**规则写在术语表里,闸却不存在** —— 绿灯让人以为查过了。
 *
 * ⭐ 一条规则,不是 77 个特例:**术语表里 es !== en 的条目,其英文原词出现在 es 里 = 报警**。
 *   以后新增术语【自动】被照,不用记得给它加 variants。
 *
 * ⚠️ 豁免必须显式且写明理由 —— 复用 glossary 的 `untranslated`(每条带 why + evidence),
 *   **绝不靠"闸看不见"来通过**。且豁免是【多词短语】,不是单词:
 *   把 `accessories` 加进单词白名单 = 全站放过它;而 `Starlink Accessories Limited`
 *   只放过注册实体名。这跟 es-leak-scan 里那条是同一个道理,我在那儿写过一次了。
 *
 * ⚠️ 剥短语必须在匹配单词【之前】,且长的排前 —— 否则 `Satellite` 先被吃掉,
 *   `Rectangular Satellite V2` 这个型号名就漏了。pt 那个 212→29 的 bug 就是这么来的。 */
/* 剥离清单 = ① untranslated（专名/部件名） ∪ ② **es === en 的术语（借词）**
 *
 * ⭐ ② 不是特例,是同一条规则的必然推论:**一个术语的 es 就等于 en,它以英文出现就是正确的**,
 *   所以它必须在"找漏翻的英文词"之前被剥掉。否则 `power bank`(借词)会被裸 `power` 命中 ——
 *   而那会逼我去给 power bank 加豁免,变成一条特例。
 *   ⚠️ **借词 ≠ 漏翻。这两件事必须在数据上分清**:借词写进 terms(es===en),漏翻才该报警。 */
const BORROWED = Object.entries(G.terms)
  .filter(([key, t]) => t.es && englishTermsOfRaw(key).some((en) => en.toLowerCase() === String(t.es).toLowerCase()))
  .map(([, t]) => t.es);

function englishTermsOfRaw(key) {
  return key.replace(/\([^)]*\)/g, '').split('/').map((s) => s.trim()).filter(Boolean);
}

const EXEMPT_PHRASES = [
  ...G.untranslated.flatMap((u) => String(u.value).split(' / ').map((v) => v.trim())),
  ...BORROWED,
]
  .filter(Boolean)
  .sort((a, b) => b.length - a.length);

/** 从术语表的 key 里取出英文词:`power (电力输入)` → `power`;`mount / mounts` → 两个 */
const englishTermsOf = (key) =>
  key.replace(/\([^)]*\)/g, '').split('/').map((s) => s.trim()).filter(Boolean);

/* 只照【es 与 en 不同】的术语。router/kit 这类 es===en 的借词不可能"没翻",照它只会误报。 */
const UNTRANSLATED = [];
for (const [key, t] of Object.entries(G.terms)) {
  if (!t.es) continue;
  for (const en of englishTermsOf(key)) {
    if (en.toLowerCase() === String(t.es).toLowerCase()) continue; // es===en,无漂移空间
    UNTRANSLATED.push({ en, want: t.es, evidence: t.evidence, note: t.note });
  }
}
const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/* ── 规则 ③：小数逗号 ───────────────────────────────────────────────────
 *   ⚠️ 千分位 `1,200` 和小数逗号 `25,6` 形状相似 —— 靠「逗号后【恰好】3 位」区分。
 *      1,200 → \d,\d{3}  合法千分位
 *      25,6  → \d,\d{1}  小数逗号 = 西班牙格式 = 红 */
/*   ⚠️ 曾写成 /\d,\d{1,2}/ —— 判定是对的，但报出来的 hit 是 `5,6` 而不是 `25,6`：
 *      **只抓了逗号前一位**。判定对 + 报告不精确 = 人看着困惑，然后不信这把尺子。
 *      正向测试抓到的，反向自检永远抓不到（干净语料里没有逗号数字）。 */
const DECIMAL_COMMA_RE = /\d+,\d{1,2}(?!\d)/g;

/** 单条判定 —— **导出：测试必须调它本人，不许去改数据文件来"模拟"**。
 *  ⚠️ 我刚在这里栽了一次，留档：我原本写了个测试，用正则往 chrome.json 里塞欧西语，
 *     然后跑守卫 → 报 0 命中。**差一点就得出「守卫瞎了」去改一把没坏的尺子。**
 *     一查：**正则根本没匹配，文件压根没被改** —— 守卫是被冤枉的，坏的是我的测试。
 *  ⭐ 同一个形状又来了：**量到的不是你以为的那个东西。**
 *     而正解我十分钟前才在 es-marker-selftest 上做对过（import 真尺子的 esLeaksIn），
 *     转头在这里又做错了 —— **知道那条规矩，不等于用得上它。** */
export function checkOne(text) {
  const t = strip(text);
  const out = [];
  const words = t.toLowerCase().match(WORD_RE) || [];
  /* 同形异义:形容词用法要看【紧邻前一个词】,所以不能只在去重后的词集合上判 ——
   * 词集合丢掉了位置。西语形容词后置(instalaciones móviles),故查 words[i-1]。
   * ⚠️ 一个词在同一段里既作形容词又作名词时,只要有【任何一处】是名词用法就该报 ——
   * 所以是"每个出现位置都判",不是"整段有一处合法就整段放过"。 */
  const adjectiveOk = (w) => {
    // ⚠️ 同一个词可能【同时】在 forbidden 和 terms.variants 里(móvil 就是:禁用词 + cell phone
    //    的竞争译法)。豁免必须对【两条规则都生效】,否则从 forbidden 放行、又被 variants 报红 ——
    //    我第一版就是只在 forbidden 分支加,自测立刻抓到"形容词该放行却仍是红"。
    const allow = ADJ_ALLOW.get(w);
    if (!allow) return false;
    let everyOccurrenceIsAdjective = false;
    for (let i = 0; i < words.length; i++) {
      if (words[i] !== w) continue;
      // 并列形容词:「instalaciones exteriores o móviles」的紧邻前词是 "o" 不是名词 ——
      // 西语里并列的形容词共用同一个中心名词。所以向前找【4 个词的窗口】,窗口内出现被修饰的
      // 名词即判形容词用法。⚠️ 这是近似:窗口内恰好出现那个名词、而 móvil 又确实是名词义时会
      // 误放行。接受这个代价,因为本文件的契约是「红硬、绿不硬」,而把正确的西语报成红会逼人
      // 去改对的内容 —— 那个方向的错更贵。窗口大小写死在这里,不是可调参数。
      const WINDOW = 4;
      if (words.slice(Math.max(0, i - WINDOW), i).some((p) => allow.includes(p))) { everyOccurrenceIsAdjective = true; continue; }
      return false;                                  // 有一处不是形容词用法 -> 照报
    }
    return everyOccurrenceIsAdjective;
  };
  for (const w of new Set(words)) {
    if (FORBIDDEN.has(w) && !adjectiveOk(w)) { const f = FORBIDDEN.get(w); out.push({ kind: '禁用词', hit: w, want: f.use, why: f.why, ev: f.evidence }); }
    if (VARIANTS.has(w) && !adjectiveOk(w)) { const v = VARIANTS.get(w); out.push({ kind: '术语不一致', hit: w, want: v.want, why: `术语「${v.term}」全站唯一译法是「${v.want}」`, ev: G.terms[v.term].evidence }); }
  }
  for (const m of t.match(DECIMAL_COMMA_RE) || []) out.push({ kind: '数字格式', hit: m, want: m.replace(',', '.'), why: '小数逗号 = 西班牙格式。墨西哥用小数点（coppel 实测：小数点 40 次 / 小数逗号 0 次）', ev: 'coppel' });

  /* 规则 ⑤：可见文案里的 `&`（数据里是 &amp;）必须写成 `y`
   *   ⚠️ 必须查【原始值】而不是 strip 后的文本 —— strip() 会把 &amp; 整个删掉,
   *      在它身上永远查不到。这跟规则④漏掉整类是同一个教训:照的对象要对。 */
  if (/&amp;/.test(String(text))) {
    const raw = String(text);
    const i = raw.indexOf('&amp;');
    out.push({ kind: '&符号', hit: '&amp;', want: 'y', ev: G.ampersand.evidence,
      why: `es 可见文案里的 & 一律写 y（chrome 已签目录里每处都是这么做的）。术语 R&D 例外，走 terms → I+D。上下文：…${raw.slice(Math.max(0, i - 26), i + 22)}…` });
  }

  /* 规则 ②b：多词 variant（短语粒度）—— 单词表照不到的那一类 */
  for (const mv of MULTIWORD_VARIANTS) {
    const m = t.match(new RegExp('(?<![-\\w])' + escapeRe(mv.v) + '(?![-\\w])', 'gi'));
    if (m) out.push({ kind: '术语不一致', hit: m[0], want: mv.want, why: `术语「${mv.term}」全站唯一写法是「${mv.want}」`, ev: G.terms[mv.term].evidence });
  }

  /* 规则 ④：先剥豁免短语（长的已排前、大小写不敏感），再找残留的英文原词。 */
  let tx = t;
  for (const p of EXEMPT_PHRASES) tx = tx.replace(new RegExp(escapeRe(p), 'gi'), ' ');
  for (const u of UNTRANSLATED) {
    const m = tx.match(new RegExp('\\b' + escapeRe(u.en) + '\\b', 'gi'));
    if (m) out.push({ kind: '未翻译', hit: m[0], want: u.want, ev: u.evidence || 'glossary', why: `术语表定了 ${u.en} → ${u.want}，但译文里还是英文原词${u.note ? '。' + String(u.note).slice(0, 60) : ''}` });
  }
  /* 同一个词可能同时命中「禁用词」和「术语 variant」（如 carro / lancha）—— 那是两条规则都对，
     但报两遍只是噪音。⚠️ 按 hit 去重，**保留第一条**（禁用词的 why 更具体）。 */
  const seen = new Set();
  return out.filter((r) => (seen.has(r.hit) ? false : seen.add(r.hit)));
}

/* ── 遍历所有 es-MX 值（仅 CLI 直跑时；import 时只拿 checkOne） ──────────
 *   ⚠️ 「凡是"匹配到才算"的检查，都要同时数一遍"总共有几个"」—— 对账在末尾。 */
if (!(process.argv[1] && process.argv[1].endsWith('es-glossary-check.mjs'))) {
  // 被 import：不跑 CLI
} else {
const rows = [];
let scanned = 0;

const files = [['data/chrome.json', 'chrome']];
for (const f of fs.readdirSync('data/pages').filter((f) => f.endsWith('.json'))) files.push([`data/pages/${f}`, `pages/${f}`]);
for (const [file, label] of files) {
  const j = JSON.parse(fs.readFileSync(file, 'utf8'));
  for (const [k, v] of Object.entries(j)) {
    if (k.startsWith('_') || !v || typeof v !== 'object') continue;
    const es = v[LOC];
    if (es === undefined) continue;
    scanned++;
    for (const r of checkOne(es)) rows.push({ where: `${label}:${k}`, sample: String(es).slice(0, 54), ...r });
  }
}
for (const f of fs.readdirSync('data/products').filter((f) => f.endsWith('.json'))) {
  const j = JSON.parse(fs.readFileSync(`data/products/${f}`, 'utf8'));
  const es = (j.i18n || {})[LOC];
  if (!es) continue;
  for (const [k, v] of Object.entries(es)) {
    scanned++;
    for (const r of checkOne(v)) rows.push({ where: `products/${f}:${k}`, sample: String(v).slice(0, 54), ...r });
  }
}

console.log(`\n【es 术语表守卫】`);
console.log(`  规则：禁用词 ${FORBIDDEN.size} 条 · 术语 variants ${VARIANTS.size} 条 · 数字格式 1 条`);
console.log(`  扫了 ${scanned} 个 ${LOC} 值，${rows.length} 处命中\n`);

for (const r of rows) {
  console.log(`  ❌ [${r.kind}] ${r.hit} → 应为「${r.want}」  (${r.ev})`);
  console.log(`       ${r.where}`);
  console.log(`       ${r.sample}`);
  console.log(`       ${r.why}\n`);
}

/* ── 红条统计：标红术语【故意】不算失败 ────────────────────────────────── */
const REDS = Object.entries(G.terms).filter(([, t]) => t.evidence === 'RED-no-evidence');
console.log(`  🔴 已知无证据区（标红上线，不因为翻完了就绿掉）：${REDS.map(([k, t]) => `${k}→${t.es}`).join(' · ')}`);
console.log(`  ⚠️ 本尺子抓不到：动词变位式 usted（Obtenga/Pruebe…）· su/sus 第三人称歧义 · 西班牙千分位 1.200`);
console.log(`     → **它绿 ≠ 译文是墨西哥西语。只有"它红"这个方向是硬的。**\n`);

if (rows.length) { console.log('❌ 不合格 —— 逐条看。别改术语表去迁就译文（那是把尺子往译文上掰）。'); process.exit(1); }
console.log('✅ 无禁用词、无术语不一致、无西班牙数字格式。');
}
