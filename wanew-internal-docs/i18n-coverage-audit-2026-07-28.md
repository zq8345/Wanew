# 四语覆盖度 + 语言切换器审计报告

> 审计窗：Wanew-多语言（执行窗）· 交付：Wanew-总工 · **Joe 亲点**
> **取证时间**：2026-07-28T13:45–16:30Z（UTC）· **CSS 版本**：`skin/css/w3.css?v=65` · **代码基线**：`main @ b41573ec9`（本地=origin，working tree 干净）
> **只读、只出报告，未改代码、未部署、未 commit、未 push。**
> **⚠️ 两处正在变动**（Joe 已预告）：`/about/` 与 `/solutions/*` 今天正在大改——下列涉及这两处的结论**标记为临时**，仅反映取证时刻的状态。`/type/` 未来会改成 `/products/`，其现状按现役页面审。

---

## 方法论声明（先说清楚"怎么知道没漏"，再讲结果）

1. **模板枚举**：不数 URL（sitemap 336+条），数**生成器的模板/路由表**——直接读 `scripts/regen.mjs`（804 行）的路由构造逻辑，而非猜测或抓包归纳。核对依据：
   - `data/templates/*.html`：18 个模板文件（`home.html` / `product.html` / `list` 系列内联 / `solutions-hub/scene/deep/scene-generic.html` / `guides-list/article.html` / `page-*.html`×10 / `_chrome.html` 非页面）。
   - 路由构造常量：`LIST_PAGES`（products 通用 + `CATS`7机型 + `AGGREGATES`1聚合 + `TYPES`5形态）、`SOL_SCENES`（6 场景）、`guides-manifest.json`（59 篇文章 + 7 个 topic hub）、R3(b) 循环（`fs.readdirSync(page-*.html)` 驱动，"存在即路由"，不是白名单，故不会有新增页面漏枚举的问题）。
   - **枚举完整性的自证**：R3(b) 的路由发现方式是**读磁盘目录**而非维护列表（代码注释原话："bucket (c)/(d)/(e) 落进来靠存在,没人记得注册"）——这意味着我读同一份 `fs.readdirSync` 逻辑，能保证我看到的模板集合与生成器实际处理的集合是**同一个来源**，不存在"生成器多认一个我没看见"的可能。
   - 已核对模板总数与实际路由数量吻合：home(1) + product(68 品×3 类别输出) + list 系列(1+7+1+5=14) + solutions(1 hub+6 scene) + guides(7 hub，59 篇文章走独立路径未逐一枚举，仅整体核查) + page-*(about/contact/faq→guides/compatibility→guides/starlink-compatible-accessories/video，共 8 个仍活跃 + 4 个孤儿见下)。

2. **取证有效性前置断言**（今天的教训）：每次判定前先确认①HTTP 200 ②字节量级合理(非空响应/非缓存 308) ③`html lang` 与预期语种一致——证明抓到的确实是"那一语言那一页"，而非旧缓存/循环残留。本报告所有"200/lang=xx"结论均基于此前置断言后的实测,已知我之前吃过的类似亏这次没有再犯。

3. **判据先自证**：hreflang 检查器我**手工制造了一个已知坏例**验证它真的报错（见下"hreflang"节），而不是假设它工作。

4. **范围声明**：本报告覆盖——生产 wanew.com 现网全部路由类模板 + Joe 指定的 10 个切换器测试模板 + 内容层扫描（渲染后 HTML，非源文件）。**未覆盖**：59 篇 guides 独立文章逐篇内容质检（仅结构性核过是否存在/是否有 zh 版）、管理后台(`admin`/`admin-worker`)。

---

## 一、覆盖度

### 1.1 四语页面覆盖矩阵（按模板分组，非逐 URL）

| 模板/分区 | en | es | pt | zh | 备注 |
|---|---|---|---|---|---|
| 首页 home | 1 | 1 | 1 | 1 | 全绿 |
| 产品详情 product.html | 68 | 62 | 68 | **0** | 🔴 见 1.3 |
| 产品列表 CATS(7)+聚合(1)+products | 9 | 9 | 9 | 9 | 全绿 |
| /type/ 形态页(5) | 5 | 5 | 5 | 5 | 存在性全绿；**H1 有 bug 见二.1** |
| Solutions hub+scene(7) | 7 | 7 | 7 | 7 | 全绿（今日变动中，见上）|
| Guides hub(7,含 compat/faq) | 7 | 7 | 7 | 7 | 全绿；**hub 页内英文残留见 1.4** |
| Guides 独立文章(59) | 59 | 0* | 0* | 0 | *为设计如此（深度优先未覆盖长尾文章），非本轮缺陷 |
| about / contact / starlink-compatible-accessories / video | 4 | 4 | 4 | 4 | 全绿（about 今日变动中）|
| **孤儿：industrial/mounts/power/rv-off-grid** | 0 | 0 | 0 | **4** | 🔴 见 1.2 |

> es 产品详情 68 中 62 为 68−6（es-hold 有据扣留，见 1.5），非缺陷。

### 1.2 🔴 zh 孤儿页（影响面：4 个页面，但揭示一类架构行为）

`data/templates/page-industrial.html`、`page-mounts.html`、`page-power.html`、`page-rv-off-grid.html` 四个模板对应的**旧顶层路由**（`/industrial/` `/mounts/` `/power/` `/rv-off-grid/`）在 en/es/pt 早已被 Guides IA 重构删除（`_redirects` 里对应 301 到 `/guides/...`），**但 zh 版本仍然存在且 200 存活**：

```
/zh/industrial/  -> HTTP 200   （对应 /industrial/ 已 301 到 /guides/）
/zh/mounts/      -> HTTP 200   （对应 /mounts/ 已 301 到 /guides/mounts/）
/zh/power/       -> HTTP 200   （对应 /power/ 已 301 到 /guides/power/）
/zh/rv-off-grid/ -> HTTP 200   （对应 /rv-off-grid/ 已 301 到 /guides/）
```

**根因**：`regen.mjs` 的 R3(b) 循环对 zh（`isExtra(locale)`）有一条豁免：`if (!fs.existsSync(p) && !isExtra(locale)) continue;`——意为"页面不存在时,除非是 zh,否则不新建"。zh 因为豁免了这条判断,**只要模板文件还在磁盘上,就会无条件从模板播种**,不管 en/es/pt 是否已经把这条路由废弃。en/es/pt 的目录被删除后,这条豁免让 zh 独自留下了一批"任何语言都不该再有"的旧内容。

**已核实的影响面**：
- 页面本身 `robots: noindex, follow` ✅ 正确（不会被索引）。
- **不被任何页面链接**（我搜过全站 href，只有 `_redirects`/模板源码自身提及，无一个真实渲染页指向它们）——普通用户点不到，只能靠猜 URL 或旧收藏/外链。
- 页面渲染正常（引用当前 `w3.css?v=65`，非视觉损坏），语言切换器工作正常（在这类孤儿页上点"View in English"会落到英文首页——因为没有对应 en 页，属于一致的兜底行为，见二节）。

**结论**：**不是索引/SEO 风险**（noindex 生效），**是架构/卫生问题**——zh 独自携带了 4 个"任何其它语言都已经删除"的死内容分支，来源于 zh 的"缺页即播种"逻辑没有区分"这个模板是当前架构的一部分"还是"这个模板是被废弃、只是文件还没删"。建议：删除这 4 个 `page-*.html` 模板文件（连同 `data/pages/{industrial,mounts,power,rv-off-grid}.json`，如果内容已完全并入 Guides），regen 后 zh 孤儿页自然消失。

### 1.3 🔴 zh 产品详情页完全不存在（影响面：68 个产品页）

`product.html` 模板的渲染循环用的是 `for (const locale of LOCALES)`，而 **`LOCALES = locales.enabled`（只有 en/pt-BR/es-MX）**，**不含 zh**——即便 `RENDER_SET`（含 zh）已在别处使用，产品详情页的生成器**从未把 zh 纳入**。实测：

```
/zh/mini/44       -> HTTP 404
/zh/mini/651      -> HTTP 404
/zh/mini/44.html  -> HTTP 404
```

而我早前交付的 `products-zh.json`（51 品译文）目前**只是躺在 `zh-translations/` 待合并的数据**，尚未看到被合并进 `data/products/*.json` 的 `i18n.zh` 字段（若已合并，`product.html` 渲染循环仍需先接上 zh 才会生效）。这不是切换器的 bug（切换器在目标不存在时正确回退首页，见二节），而是**zh 覆盖度的真实缺口**：核心转化路径（产品详情）在 zh 完全空白，只有列表/分类页有 zh。

### 1.4 🟡 zh Guides hub 页存在英文可见残留（影响面：7 个 hub 页的文章预览卡）

zh 只渲染 7 个 Guides **主题枢纽页**（cabling/compatibility/mounts/oem/power/protection/faq），**不渲染 59 篇独立文章**（en 独有）。但枢纽页上展示的"文章预览卡"（标题+摘录）**直接引用文章的英文原文**，因为对应 zh 译文从未存在。启发式扫描（无正式 zh-leak-scan 工具，见 1.6）在 `zh/guides/*` 命中 **376 处候选英文残留，覆盖 38 个 zh 页面中的 28 个**——绝大多数集中在 Guides hub 的文章预览卡。这是"zh 覆盖度未及"的自然结果（59 篇文章本就不在 zh 范围内），但**用户可见的后果是**：浏览 `/zh/guides/cabling/` 时，页面框架是中文，卡片内容是英文——观感不统一。

### 1.5 ✅ es/pt sitemap 差 6 条——已核实，属有意为之

Sitemap 现值：es 89 条、pt 95 条，差 6：`mini/4206` `mini/678` `mini/679` `mini/691` `mini/695` `standard/704`。**逐条核对**：这正是 `data/es-hold.json` **有据扣留**的 6 个产品——因英文源本身涉嫌危险/矛盾宣称（18AWG 线配 15A 保险丝、"POE"实为无源直流、12V-48V 与正文矛盾、屋顶件零依据 500lb 承重、"Waterproof"却 IP60、100W 与 65W 自相矛盾），`es-hold-check.mjs` 守卫强制"要么有 es 译文,要么显式声明扣留理由"，本次对账 **58+10=68 全部可追溯**（其中 4 条是全新未译产品见 1.7，非扣留）。**结论：非缺陷，是安全治理机制生效的副作用。**

### 1.6 ⚠️ 内容层英文残留扫描（渲染后 HTML，非源文件）

按 Joe 要求"扫产出页面不是扫源文件"的教训，本节结果全部来自**已生成的 HTML**：

- **pt-leak-scan（现有工具）**：255 处可见文本命中 = **已接受 189**（挂 `tj-lang-badge` 诚实角标的 EN-only 攻略卡片标题，Joe 早年拍板保留）+ **真漏译 66**，涉及 20 个文件。**真漏译 66 的构成**（逐一核实，非笼统数字）：
  - **系统性一条**（详见二.1）：`/type/*` 5 个页面的 H1 标题硬编码英文，在 pt 扫描里也命中（与我独立用 curl 交叉验证的 es 发现同源同根）。
  - **约 4-5 个具体产品**（657/661/680/702 等）的 `images[].alt` 字段：这些产品的 title/description **都已正确译成 pt**，唯独图片 alt 还是英文——因为它们的 alt 文本恰好是完整英文短语（如 "High Performance 2M Router Cable for Starlink"），被扫描器的关键词匹配逮到。**但这只是冰山一角**，见下条。
  - 少量孤立片段（contact 页 "within 1 business day"、solutions/off-grid 页 1 处）。
  - ⚠️ **对账**：我用 `--json` 模式复算过 66 这个数（用脚本自己的"是否挂角标"判据重新过滤），复算结果同为 66——工具的自报数可信。

- **🔴 更严重、扫描器没完整捕捉到的真相**：`images[].alt` 在**全部 68 个产品**上都是**纯英文字符串、无任何语种字段**（不是"某些产品漏译"，是这个字段本身**从未被任何一次 pt/es/zh 翻译流程覆盖过**——包括我自己这一轮为 zh 做的翻译，范围也只有 `title/summary_html/description_html/meta_description`，同样没碰 `images[].alt`）。**扫描器只在 alt 文本恰好是"英语感"够强的完整短语时才触发命中**（如上面 4 个产品），对于像 `"2 in 1 Starlink Mini Cable (1).jpg - wanew"` 这种偏文件名/品牌名的 alt 完全扫不出来，尽管它同样是未本地化的英文。**真实受影响面 = 全站三个非英语种 × 68 个产品 × 平均 5-9 张图 ≈ 上千个属性，而不是扫描器报出的个位数产品**。这条建议单列进整改，且是"以后建 alt 本地化前必须先补个字段级 locale 结构"的架构级待办,不是内容翻译待办。

- **es-leak-scan（现有工具）**：只命中 2 处，均**判断为误报/低风险**——① `{model}` 占位符（模板变量，非真英文）；② "que **uses** Starlink"——核实为**西语虚拟式动词变位**（usar 的 tú 虚拟式现在时"uses"="你使用"），是正确的西班牙语语法，恰好与英文单词"uses"同形，属已知的**同形词陷阱**（本仓此前已吃过 Industrial/FAQ 的同款亏并写入规范）。**不建议动它**。

- **zh：无专用泄漏扫描工具**（`scripts/` 目录下没有 zh 版本）。已用一次性启发式脚本（长英文短语检测，排除品牌/规格 token）扫描，结果见 1.4。**这是工具覆盖面的真实缺口**，建议照 pt/es 的模式补一个 `zh-leak-scan.mjs`。

- **补充发现（对 scanner 本身的诊断）**：pt-leak-scan 的"类②"（"该指 pt 却指英文的链接"）本轮命中 137 处，**逐一抽查后确认全部是语言切换器里指向 `/zh/...` 的合法链接**——该工具写于 zh 加入之前，它的"是否为英文"判断逻辑把"不是 /pt/ 也不是 /es/ 前缀"都算作英文，于是把新增的 zh 切换器链接一并误判。**这是工具需要更新以认识第四语言，不是真实缺陷**；已记入整改。

### 1.7 🔴 4 个全新产品完全未翻译（任何非英语言）

`4208 / 4209 / 4210 / 4211`（均为 mini 分类）：**无 pt-BR title、无 es-MX、（大概率）无 zh**。`es-hold-check.mjs` 守卫本轮**正确地对这 4 个报红**（"没有 es-MX,也没在 es-hold 里声明——是漏翻还是想扣留？数据上分不出来"）——即治理机制运作正常、及时报警，只是尚未有人处理。这是新品上架流程与 i18n 翻译流程**尚未完全串联**的证据（新品能上线 en 版，但没有强制门槛要求同时补三语）。

### 1.8 guard/scanner 综合结果（辅助证据）

- `i18n-check.mjs --report`：744→现覆盖 keys 更多，缺失均可归为"有据扣留(20，同 1.5 的 6 品)"或"孤儿 token(31，见下)"。
- **"孤儿 31"核实为 guard 局限，非真缺口**：这 31 个形如 `sol.pain.h2` 的 key 是 Solutions 场景模板用短前缀动态拼接实际 key（如 `solutions.marine.pain.h2`）导致的——guard 认不出这种拼接，误判成"模板用了但 catalog 没有"。我抽查 `solutions.marine.pain.h2`/`.pain.1.t` 两个真实 key，**四语（en/pt-BR/es-MX/zh）翻译全部存在且质量正常**，证实并非真缺口。
- `catalog-dupe-check`：干净。

---

## 二、语言切换器（实测，非读码——见下方证据方式）

**证据方式说明**：除对首页/products/mini44 做过真实浏览器点击（DOM 事件派发，非坐标点击——坐标点击在本环境有 ref 漂移问题，已发现并绕过；改用对真实渲染 DOM 元素派发原生 `click()`，语义等价于用户点击，触发同一套事件处理器与导航）外，其余模板通过对**已生成、已部署页面**的 `<a class="lang-switch__link">` 结构做**页面内 `fetch`/DOM 读取**验证——这是对真实响应的核验，不是读 `render.js` 源码推断。

### 2.1 🔴 系统性问题：`/type/*` 页面 H1 硬编码英文（跨 5 页 × 2 语言 = 10 处，与切换器无关但顺带抓到）

严格说这不是切换器 bug，是内容层 wiring bug，但因为是在切换器测试路径上发现的，一并报：

```
/pt/type/mounts/  <title>  = "Suportes e Fixações-Wanew | ..."   ✅ 正确引用 catalog
/pt/type/mounts/  <h1>     = "Starlink Mounts & Brackets"         ❌ 硬编码英文
```

**已排除"只是巧合的同形词"**：核对 `header.mounts_brackets`（pt-BR: "Suportes e Fixações"）、`header.power_charging`（"Energia e Carregamento"）、`header.cases_protection`（"Cases e Proteção"）——四个 catalog key **确实各有不同于英文的 pt-BR 译文**，且这些译文**正确用在了 `<title>` 上**，唯独 **`<h1>` 没有引用同一个 catalog key**，而是走了另一条硬编码路径。**es 同样命中**（`/es/type/*` 全部 H1 英文）。**影响：5 个页面 × 2 个真实 SEO 语种 = 10 处用户可见的页面主标题误标**——H1 是访客和搜索引擎读到的核心信号，比 `<title>` 更显眼。**这是本次审计里覆盖度检查中"影响面最大的单一根因 bug"**（一次修复解决 10 处）。

### 2.2 切换器行为矩阵（10 个模板，按 Joe 指定列表）

| 模板 | en→es 落点 | en→pt 落点 | en→zh 落点 | html lang 跟随 | 备注 |
|---|---|---|---|---|---|
| 首页 | `/es/` ✅ | `/pt/` ✅ | `/zh/` ✅ | ✅（实测点击 en→zh，落地 lang=zh，标题正确译为中文）| |
| 产品列表 /products/ | `/es/products/` ✅ | `/pt/products/` ✅ | `/zh/products/` ✅ | ✅（实测点击 en→es，lang=es-MX，标题译"Productos"）| |
| 产品详情 /mini/44 | `/es/mini/44` ✅ | `/pt/mini/44` ✅ | **`/zh/`**（首页兜底）⚠️ | ✅ | zh 落首页是因为 1.3 的覆盖缺口，非切换器错——**一致**（同类情况全部落首页,非有时首页有时 404）|
| Solutions 场景 /solutions/marine/ | `/es/solutions/marine/` ✅ | `/pt/solutions/marine/` ✅ | `/zh/solutions/marine/` ✅ | 未逐一实测但结构一致 | 今日变动中，标记临时 |
| Guides 枢纽 /guides/ | `/es/guides/` ✅ | `/pt/guides/` ✅ | `/zh/guides/` ✅ | | |
| Guides 独立文章（en-only 样本） | **`/es/`**（首页兜底）| **`/pt/`**（首页兜底）| **`/zh/`**（首页兜底）| | **三语言全部一致回退首页，无 404**——这正是 Joe 要求的"缺页时哪种都行但必须一致不能 404"的最佳范例 |
| Compatibility /guides/compatibility/ | `/es/guides/compatibility/` ✅ | `/pt/guides/compatibility/` ✅ | `/zh/guides/compatibility/` ✅ | | |
| FAQ /guides/faq/ | `/es/guides/faq/` ✅ | `/pt/guides/faq/` ✅ | `/zh/guides/faq/` ✅ | | |
| About /about/ | `/es/about/` ✅ | `/pt/about/` ✅ | `/zh/about/` ✅ | | **今日大改中，标记临时** |
| Contact /contact/ | `/es/contact/` ✅ | `/pt/contact/` ✅ | `/zh/contact/` ✅ | | |

**反向测试**（es→en / es→pt，取产品详情页做代表）：`/es/mini/44` → 点击 English → 真实点击导航到 `/mini/44`，`html lang` 正确变回 `en`。切换器对侧 = 非链接（`aria-current` 语义正确，当前语种在下拉里显示为纯文本非可点）。**往返一致，无异常。**

**当前语种显示为非链接**：在全部测试模板上确认——下拉菜单里当前语种（如首页上的 "English"）渲染为 `<span>`/`generic` 而非 `<a>`，符合"不能点自己"的预期。

**移动端切换器**：resize 到 375×812（iPhone 尺寸）后重新加载 `/mini/44`，语言切换按钮（36×36px，位于视口右上角 x=338，拇指可达范围内）可点击、点击后 `aria-expanded` 正确切为 `true`、4 个语言链接全部在移动布局下**真实可见**（`offsetParent !== null`，非仅 DOM 存在而 CSS 隐藏）。**移动端功能正常**。

### 2.3 一致性结论

**切换器本身没有发现 bug**——所有"落到首页而非同一页"的情况都发生在**目标页确实不存在**的场景（zh 产品详情、任意语言的 guides 独立文章），且**三语言/多模板下这个回退行为完全一致**（不是"这个模板 404、那个模板回首页"的不一致状态），符合 Joe 定的"哪种都行但必须一致不能 404"标准。**真正的问题是覆盖度（1.3/1.4），不是切换逻辑本身。**

---

## 三、hreflang

### 3.1 现状（`hreflang-verify.mjs` 全站重跑）

```
语种 en,pt-BR,es-MX | 有簇 348 | 无簇 40(EN-only 内容页:未迁移旧 hub 指南文章 + 非路由页;无本地化孪生→无簇,只计数)
①无重复 ②键合法 ③自指 ④href=派生且目标存在 ⑤存在即必挂 ⑥x-default:  348 / 348  ✅
```

- **zh 不在 hreflang 簇里**（设计如此）：抽查任意 en/es/pt 页面的 `<head>`，`<link rel="alternate" hreflang="...">` 只含 en/pt-BR/es-MX/x-default 四条，**从不含 zh**；反向抽查 `zh/industrial/index.html`（孤儿页样本），`<head>` 里**零个** `<link rel="alternate">`，只有切换器 `<a>` 标签上语义性的 `hreflang` 属性（那是给锚点自身的语言提示，不是 SEO 的 alternate 簇，二者不是一回事，已核实区分清楚）。**结论：zh 的"不参与 hreflang"设计完整落地，双向都干净。**

### 3.2 常驻核对器验证（Joe 要求"在已知错误上验一次"）

**制造已知坏例**：在快照的 `index.html` 里手工删除 pt-BR 的 hreflang 行（模拟"只在一侧挂"的历史病），重跑 `hreflang-verify.mjs`：

```
①无重复 ②键合法 ③自指 ④href=派生且目标存在 ⑤存在即必挂 ⑥x-default:  347 / 348  🔴
🔴 1 个页: index.html
   ⑤ 缺 pt-BR(对应页存在却没挂 —— 漏一边等于没挂)
```

**核对器精确报出被破坏的那一项和缺失的语种，随即复原文件**（`grep -c` 验证复原后计数恢复为 2）。**结论：核对器目前是活的、真的能报错，不是摆设。**

---

## 整改清单（按影响面排序，非按严重度）

**影响面最大（跨多模板/多语言的系统性问题）**
1. `/type/*` 5 页 H1 硬编码英文（es+pt，10 处）——查 `<h1>` 渲染路径为何没接 catalog key（`<title>` 已正确接，同一处模板应能复用同一份代码）。
2. `images[].alt` 全站 68 品从未走任何本地化管线（架构级缺口，波及 es/pt/zh 全部三门语言、上千个属性）——建议新增字段结构（如 `images[].alt_i18n.{locale}` 或复用现有 `i18n.{locale}` 挂一个 `image_alt` 数组），并回填至少高流量产品。

**结构性/卫生（zh 专属，范围小但性质清楚）**
3. zh 孤儿页 4 个（industrial/mounts/power/rv-off-grid）——删除对应 4 个 `page-*.html` 模板 + `data/pages/*.json`（若确认内容已被 Guides 完全取代）。
4. zh 产品详情页 0 覆盖（68 页缺口）——把 `product.html` 的渲染循环从 `LOCALES` 扩到 `RENDER_SET`（含 zh），并确认 `data/products/*.json` 已合并 `i18n.zh`（我已交付 51 品译文待合并 + 13 品因英文源变动暂缓）。
5. zh Guides hub 页文章预览卡英文残留（7 页，376 处启发式命中）——如果 zh 不打算做 59 篇长尾文章，至少给预览卡加个诚实角标（同 pt 的 `tj-lang-badge` 模式），比裸英文更一致。

**新品/流程缺口**
6. 4208-4211 四个新品任何非英语言都未翻译——`es-hold-check` 已正确报红，需要人工判定"翻还是扣留"并显式声明（同 es-hold 6 品的先例）。

**工具/scanner 维护**
7. 补一个 `zh-leak-scan.mjs`（比照 pt/es 版本）——目前 zh 内容层泄漏完全没有常驻检测，本轮靠一次性脚本才发现 1.4。
8. `pt-leak-scan.mjs` 的"类②"更新到认识 zh（否则每次扫描都会把合法的 zh 切换器链接错报成 137 处"英文链接"，噪音掩盖真信号）。
9. sitemap 加 xhtml:link hreflang 备份（次要，head 已全量覆盖，非失败项，历次审计都提过）。

**存疑（判不准，交总工/Joe）**
- pt-leak-scan 的 66 条"真漏译"里，具体哪些图片 alt 值得投入翻译、哪些可以等——量太大（上千属性），建议按产品流量/转化路径排优先级而非全量翻译，这个排序判断超出本窗权限。

---

## 附：证据出处
- 只读快照：`git archive HEAD`（main @ b41573ec9）→ 本地临时目录（非 worktree，未产生任何 git 状态）。
- 生产实测：`curl -sL https://wanew.com/...`（跟随 308/301，检验 HTTP 状态 + 字节量级 + html lang）+ 浏览器会话（Chrome DevTools Protocol，真实 DOM `click()` 事件派发 + 页面导航验证 + resize 至 375×812 验证移动端）。
- 复用仓内工具：`scripts/{i18n-check,pt-leak-scan,es-leak-scan,es-glossary-check,es-hold-check,catalog-dupe-check,hreflang-verify,switcher-verify}.mjs`（均在快照上重新跑过，非引用旧结果）。
- 新写的一次性诊断脚本（未提交）：产品 zh/pt/es 字段完整性核对、`images[].alt` 全站结构扫描、zh 启发式英文残留扫描、hreflang 已知坏例注入测试。
