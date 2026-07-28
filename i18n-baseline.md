# i18n 泄漏【基线快照】—— 冻结

> ⚠️ **这是验收标尺，不要手改。** 只有 `SCANNER_VERSION` bump 时才可用
> `node scripts/pt-leak-baseline.mjs --write && node scripts/pt-leak-baseline-md.mjs` 重出，
> 并**必须在下方【白名单变更记录】留痕 + 知会总调度**。
> 改白名单 = 改考卷；不留痕 = 自己给自己打分。

| 项 | 值 |
|---|---|
| scanner 版本 | **v1.1.0** |
| 基线 commit | **fee01112** (`fee011123de27acf3334e39dac36774b89c77ca0`) |
| 扫描范围 | `pt/**/*.html` — **97** 个页面 |
| 机读版 | `scripts/pt-leak-baseline.json`（含全量逐条 finding） |

## 总数

- **N = 387**
- ⭐ **翻译泄漏 = 387** ← **验收看这个数**（a+b+d+e）

### 为什么验收不是 N
`c_galleryAltFilename`(0) 排除在外：这些 alt 直接写的是**图片文件名**
（如 `Starlink Performance Adapter Gen 3 cable-images (1).jpg - wanew`），**英文站的 alt 一模一样** →
属既有数据质量问题、与翻译无关、**R2 也不会自动修**。计入会让"逼近 0"**永远达不到**，
反而遮住"生成器到底有没有做对"。它跟类③（图片里烧死的英文像素）一起挂"图片/数据质量"档。

## 按类

| 类 | 数量 | 归谁修 |
|---|---|---|
| **a_cardTitles** 列表/分类页产品卡英文标题 | 233 | **R2 生成器**（从 `i18n[locale]` 渲卡片） |
| **b_altSuffix** `"- wanew Products"` 模板串 | 0 | **chrome catalog key** |
| **c_galleryAltFilename** alt=图片文件名 | 0 | ⚠️既有数据问题，不计入验收 |
| **d_otherText** 其余可见文本 | 17 | 已逐个核实=**真型号名**，无需修 |
| **e_links** 该指 pt 却指英文 | 137 | **R1 `localizeUrl`** |

### ⚠️ d_otherText 逐条核实结论 —— **原结论是错的，2026-07-15 重核后作废重写**

> **原结论**（已作废）：「已逐个核实 = 真型号名，**无需修**」，并列了
> `Gen 3 Mesh Router` / `Starlink 2M Router Cable` / `Internet Kit Satellite` / `Case`。
>
> **错在哪**：那批条目是**旧 scanner 版本**下的结果。调白名单时数字走过 **558 → 741 → 512**，
> **每次重出了数字，却没重核这段「人的结论」** —— 它跟着 scanner 版本漂走了，
> 却还穿着「已核实」的外衣。**总调度是信了这句才批的基线。**
>
> ⭐ **教训（已立为规矩）**：**冻结数字的同时必须冻结结论，且结论要绑 scanner 版本。**
> 口径一变，**所有基于旧口径的人工结论一律作废重核，不许继承**。
> **「已核实」是一个会过期的状态，不是一个永久属性。**

**重核后的真相**（scanner v1.0.0，两棵树逐字相同，R1 没碰）：

| 条数 | 实为 | 归谁 | 处置 |
|---|---|---|---|
| **8** | ❌ **真漏译 —— 多语言窗自己的漏**：Phase 2.5 译描述时，译了正文散文却把 `description_html` 里**内联 `<img>` 的 alt** 原样留成英文（`4205`×3 + `672`×5，pt-BR 与 en 逐字相同 = 根本没译） | 多语言窗（pt 数据） | ✅ **已修 `53b15e6`**（纯 pt 数据，en 零改动，不破 R2 字节一致门） |
| 2 | ✅ 真型号短语：`Starlink 2M Router Cable`(657) / `Starlink Mini Internet Kit Satellite`(680) | — | **本就不该降**（归零反而说明型号被译坏了） |
| 1 | ⚠️ 假阳性：`carregadores PD/power banks`(702) —— **power bank 是巴葡通用外来词** | — | **刻意不进白名单**（改白名单 = 改考卷；1 条噪音的代价 << 基线不可比。**尺子没坏就别动尺子**） |

→ **验收地板从 11 修正为 3。基线 JSON 不重出**（`N=547 / translationLeaks=501` 是历史冻结快照，
**不因为我们后来修好了东西就改它 —— 那正是它存在的意义**）。

### e_links = dev 实测的那 7 页（我的检查独立复现，且**全站无第 8 处**）
`pt/about` `pt/compatibility` `pt/contact` `pt/marine` `pt/mounts` `pt/power` `pt/rv-off-grid`
——每页同样 5 条页脚机型链：`/standard-circular/ /standard-actuated/ /performance-gen-1/ /performance-gen-3/ /enterprise/`

**根因**：这些页脚在 Phase 1 上线时**是对的**（那时这 5 个分类还没 pt 版，链英文正确）；是 **Phase 2 建了 pt 分类页之后变陈旧的**，
而 Phase 2 的漏斗 rewire 只覆盖了 pt/products、pt/mini、pt/standard、pt/index。
**"写时对、后来错"** = 人工 sweep 结构上杀不死、`localizeUrl(path, locale)` 由构造能杀的一类。

## 按页（共 97 页；全量见 JSON）

| 页面 | 合计 | 卡片标题 | alt后缀 | 图库alt | 其它文本 | 链接 |
|---|---|---|---|---|---|---|
| pt/guides/index.html | 90 | 89 | 0 | 0 | 0 | 1 |
| pt/guides/compatibility/index.html | 27 | 26 | 0 | 0 | 0 | 1 |
| pt/guides/mounts/index.html | 21 | 20 | 0 | 0 | 0 | 1 |
| pt/guides/cabling/index.html | 17 | 16 | 0 | 0 | 0 | 1 |
| pt/guides/power/index.html | 17 | 16 | 0 | 0 | 0 | 1 |
| pt/type/mounts/index.html | 16 | 7 | 0 | 0 | 0 | 9 |
| pt/type/power/index.html | 16 | 7 | 0 | 0 | 0 | 9 |
| pt/standard/661.html | 15 | 0 | 0 | 0 | 14 | 1 |
| pt/products/index.html | 14 | 13 | 0 | 0 | 0 | 1 |
| pt/mini/index.html | 13 | 12 | 0 | 0 | 0 | 1 |
| pt/guides/oem/index.html | 12 | 11 | 0 | 0 | 0 | 1 |
| pt/guides/protection/index.html | 12 | 11 | 0 | 0 | 0 | 1 |
| pt/type/cables/index.html | 11 | 2 | 0 | 0 | 0 | 9 |
| pt/type/networking/index.html | 10 | 1 | 0 | 0 | 0 | 9 |
| pt/type/cases/index.html | 9 | 0 | 0 | 0 | 0 | 9 |
| pt/enterprise/index.html | 2 | 1 | 0 | 0 | 0 | 1 |
| pt/solutions/off-grid/index.html | 2 | 1 | 0 | 0 | 0 | 1 |
| pt/enterprise/657.html | 2 | 0 | 0 | 0 | 1 | 1 |
| pt/mini/680.html | 2 | 0 | 0 | 0 | 1 | 1 |
| pt/mini/702.html | 2 | 0 | 0 | 0 | 1 | 1 |
| pt/about/index.html | 1 | 0 | 0 | 0 | 0 | 1 |
| pt/contact/index.html | 1 | 0 | 0 | 0 | 0 | 1 |
| pt/enterprise/650.html | 1 | 0 | 0 | 0 | 0 | 1 |
| pt/enterprise/658.html | 1 | 0 | 0 | 0 | 0 | 1 |
| pt/enterprise/669.html | 1 | 0 | 0 | 0 | 0 | 1 |
| pt/enterprise/675.html | 1 | 0 | 0 | 0 | 0 | 1 |
| pt/guides/faq/index.html | 1 | 0 | 0 | 0 | 0 | 1 |
| pt/index.html | 1 | 0 | 0 | 0 | 0 | 1 |
| pt/mini/4199.html | 1 | 0 | 0 | 0 | 0 | 1 |
| pt/mini/4200.html | 1 | 0 | 0 | 0 | 0 | 1 |
| pt/mini/4201.html | 1 | 0 | 0 | 0 | 0 | 1 |
| pt/mini/4203.html | 1 | 0 | 0 | 0 | 0 | 1 |
| pt/mini/4204.html | 1 | 0 | 0 | 0 | 0 | 1 |
| pt/mini/4205.html | 1 | 0 | 0 | 0 | 0 | 1 |
| pt/mini/4206.html | 1 | 0 | 0 | 0 | 0 | 1 |
| pt/mini/4207.html | 1 | 0 | 0 | 0 | 0 | 1 |
| pt/mini/44.html | 1 | 0 | 0 | 0 | 0 | 1 |
| pt/mini/656.html | 1 | 0 | 0 | 0 | 0 | 1 |
| pt/mini/663.html | 1 | 0 | 0 | 0 | 0 | 1 |
| pt/mini/676.html | 1 | 0 | 0 | 0 | 0 | 1 |
| pt/mini/678.html | 1 | 0 | 0 | 0 | 0 | 1 |
| pt/mini/679.html | 1 | 0 | 0 | 0 | 0 | 1 |
| pt/mini/681.html | 1 | 0 | 0 | 0 | 0 | 1 |
| pt/mini/682.html | 1 | 0 | 0 | 0 | 0 | 1 |
| pt/mini/683.html | 1 | 0 | 0 | 0 | 0 | 1 |
| pt/mini/684.html | 1 | 0 | 0 | 0 | 0 | 1 |
| pt/mini/685.html | 1 | 0 | 0 | 0 | 0 | 1 |
| pt/mini/686.html | 1 | 0 | 0 | 0 | 0 | 1 |
| pt/mini/687.html | 1 | 0 | 0 | 0 | 0 | 1 |
| pt/mini/688.html | 1 | 0 | 0 | 0 | 0 | 1 |
| pt/mini/689.html | 1 | 0 | 0 | 0 | 0 | 1 |
| pt/mini/690.html | 1 | 0 | 0 | 0 | 0 | 1 |
| pt/mini/691.html | 1 | 0 | 0 | 0 | 0 | 1 |
| pt/mini/692.html | 1 | 0 | 0 | 0 | 0 | 1 |
| pt/mini/693.html | 1 | 0 | 0 | 0 | 0 | 1 |
| pt/mini/694.html | 1 | 0 | 0 | 0 | 0 | 1 |
| pt/mini/695.html | 1 | 0 | 0 | 0 | 0 | 1 |
| pt/mini/703.html | 1 | 0 | 0 | 0 | 0 | 1 |
| pt/performance-gen-1/654.html | 1 | 0 | 0 | 0 | 0 | 1 |
| pt/performance-gen-1/index.html | 1 | 0 | 0 | 0 | 0 | 1 |
| pt/performance-gen-3/42.html | 1 | 0 | 0 | 0 | 0 | 1 |
| pt/performance-gen-3/4202.html | 1 | 0 | 0 | 0 | 0 | 1 |
| pt/performance-gen-3/43.html | 1 | 0 | 0 | 0 | 0 | 1 |
| pt/performance-gen-3/697.html | 1 | 0 | 0 | 0 | 0 | 1 |
| pt/performance-gen-3/700.html | 1 | 0 | 0 | 0 | 0 | 1 |
| pt/performance-gen-3/index.html | 1 | 0 | 0 | 0 | 0 | 1 |
| pt/solutions/business/index.html | 1 | 0 | 0 | 0 | 0 | 1 |
| pt/solutions/home/index.html | 1 | 0 | 0 | 0 | 0 | 1 |
| pt/solutions/index.html | 1 | 0 | 0 | 0 | 0 | 1 |
| pt/solutions/marine/index.html | 1 | 0 | 0 | 0 | 0 | 1 |
| pt/solutions/portable/index.html | 1 | 0 | 0 | 0 | 0 | 1 |
| pt/solutions/rv/index.html | 1 | 0 | 0 | 0 | 0 | 1 |
| pt/standard/651.html | 1 | 0 | 0 | 0 | 0 | 1 |
| pt/standard/652.html | 1 | 0 | 0 | 0 | 0 | 1 |
| pt/standard/660.html | 1 | 0 | 0 | 0 | 0 | 1 |
| pt/standard/662.html | 1 | 0 | 0 | 0 | 0 | 1 |
| pt/standard/671.html | 1 | 0 | 0 | 0 | 0 | 1 |
| pt/standard/672.html | 1 | 0 | 0 | 0 | 0 | 1 |
| pt/standard/673.html | 1 | 0 | 0 | 0 | 0 | 1 |
| pt/standard/674.html | 1 | 0 | 0 | 0 | 0 | 1 |
| pt/standard/677.html | 1 | 0 | 0 | 0 | 0 | 1 |
| pt/standard/696.html | 1 | 0 | 0 | 0 | 0 | 1 |
| pt/standard/701.html | 1 | 0 | 0 | 0 | 0 | 1 |
| pt/standard/704.html | 1 | 0 | 0 | 0 | 0 | 1 |
| pt/standard/index.html | 1 | 0 | 0 | 0 | 0 | 1 |
| pt/standard-actuated/659.html | 1 | 0 | 0 | 0 | 0 | 1 |
| pt/standard-actuated/665.html | 1 | 0 | 0 | 0 | 0 | 1 |
| pt/standard-actuated/666.html | 1 | 0 | 0 | 0 | 0 | 1 |
| pt/standard-actuated/667.html | 1 | 0 | 0 | 0 | 0 | 1 |
| pt/standard-actuated/668.html | 1 | 0 | 0 | 0 | 0 | 1 |
| pt/standard-actuated/670.html | 1 | 0 | 0 | 0 | 0 | 1 |
| pt/standard-actuated/index.html | 1 | 0 | 0 | 0 | 0 | 1 |
| pt/standard-circular/655.html | 1 | 0 | 0 | 0 | 0 | 1 |
| pt/standard-circular/664.html | 1 | 0 | 0 | 0 | 0 | 1 |
| pt/standard-circular/index.html | 1 | 0 | 0 | 0 | 0 | 1 |
| pt/starlink-compatible-accessories/index.html | 1 | 0 | 0 | 0 | 0 | 1 |
| pt/video/index.html | 1 | 0 | 0 | 0 | 0 | 1 |

## 两类检查的定义（scanner v1.1.0）

1. **类①可见文本**：标签间文字 + `placeholder`/`alt`/`title`/`aria-label`。
   跳过 `<script>`/`<style>`/注释/JSON-LD/`class`/`href`/`src`。
2. **类②英文链接**：pt 页里 `<a href="/{path}">` 且 `/pt/{path}` **存在** → 泄漏。
   **白名单掉**：切换器 EN 链（设计如此该指英文）、无 pt 版的页（指南文章/遗留编号页，链英文是**正确**的防软404）。
3. **类③**（图片里烧死的英文像素）：**扫不到**，需重做图，不在本基线内。

任一类非零 → `exit 1`（可挂 CI / pre-push）。

## 验收口径 —— **身份判定，不是计数**（总调度裁决 2026-07-15）

> **R2 通过条件**：`a=0 且 b=0 且 e=0 且 **d 恰好是这 3 条已列名的**`
> （`657 router,cable` / `680 satellite` / `702 power`，见上表）。
>
> **为什么不是「逼近 0」**：那 2 条真型号名归零**反而说明型号被译坏了**。
> **为什么不是「~3」**：模糊数会招来「差不多就行」，且**抓不到「修好旧的又漏了新的」**
> —— d 仍是 3 条但换了内容，**计数完全看不出来**。
> **若 d 仍是 3 条但换了内容 → 不通过。**
>
> 已编进 `scripts/pt-leak-vs-baseline.mjs`（身份 = **文件 + 命中词集**，不是文本内容 ——
> scanner 的 `f.text` 是整个文本节点，用短语 `includes` 会漏判；第一版就这么错过，实测抓出来了）。
>
> 用法：`node scripts/pt-leak-vs-baseline.mjs --tree <被测树> --md 输出.md`
> **四道前置闸**（树干净 + 扫描期 HEAD 不动 / 含基线 commit / scanner 同版本 / 页数 = 97），
> **不可比时拒绝出数**，而不是出一个会被误读的数。
>
> 若 bump 了 scanner 版本 → 必须重出基线 + 在下方留痕 + **所有旧口径下的人工结论一律作废重核**。

### R1 验收结果（scanner v1.1.0 @ `3928fb0d`，四道闸全过）
**✅ R1 通过**：本职 `e_links` **35 → 0**（100% 清空，由构造杀掉，不是翻掉的）。
translationLeaks 501 → 466 **不是 R1 的成绩单** —— 剩余 466 = a(199)+b(256)+d(11) **全是 R2 的域**。
交叉验证：dev 自称修的 7 页 = 本基线 e 类的那 7 页，逐页吻合；且 dev **没碰考卷**（diff 为空，差异纯 CRLF）。
**⚠️ R2 的真靶子 = 455（a 199 + b 256），不是 466** —— d 的 11 条 R2 杀不掉（8 条是 pt 数据里的漏，已由 `53b15e6` 修）。

---

## 白名单快照（= 考卷原文，自动从 `scripts/pt-leak-scan.mjs` 抽取）

### 合法保持英文（WHITELIST）
```js
const WHITELIST = [
  // ⚠️ 多词条目必须排在单词之前, 否则单词条目(如 \bStarlink\b)会先把中间词剔掉, 多词就再也匹配不上
  // 品牌全称 (W2e:Joe 口径=假法名「…Limited」不再造,词条跟着改成 3 词品牌名。
  //  故意【不】保留旧 4 词条目:若「…Limited」重现,不该被白名单静默——多出的 Limited 自己不报警,
  //  但至少不是这里主动豁免的。真法名 WanLiu Group Co., Limited 另有绝不动的豁免约定。)
  /\bWanew\s+Starlink\s+Accessories\b/gi,
  // 机型 / 产品线 (多词在前)
  /\bStandard\s+Actuated\b/gi, /\bStandard\s+Circular\b/gi, /\bFlat\s+High[-\s]Performance\b/gi,
  /\bHigh[-\s]Performance\b/gi, /\bPerformance\s*\(?\s*Gen\s*\d\s*\)?/gi, /\bGen\s*\d\b/gi,
  /\bRectangular\s+Satellite\b/gi, /\bMesh\s+Router\b/gi, /\bInternet\s+Kit\b/gi,  // Starlink 型号名
  // 技术全称 (缩写的展开式 = 合法英文技术术语)
  /\bPower\s+over\s+Ethernet\b/gi, /\bPower\s+Delivery\b/gi,
  /\bStarlink\s+Mini\b/gi, /\bStarlink\b/gi, /\bMini\b/gi, /\bStandard\b/gi, /\bEnterprise\b/gi,
  /\bPerformance\b/gi, /\bActuated\b/gi, /\bCircular\b/gi, /\bDishy\b/gi, /\bV[23]\b/g,
  // 品牌 / 站名
  /\bWanew\b/gi, /\bSpaceX\b/gi, /\bSTARGEAR\b/gi, /\bXLinkShop\b/gi, /\bstarlingkshop\b/gi,
  /\bDaierTek\b/gi, /\bTheLAShop\b/gi, /\bZinweyton\b/gi, /\blinkoostar\b/gi, /\bStar\s?Link\b/gi,
  // 规格 / 技术 token
  /\bRJ\s?45\b/gi, /\bIP\s?6\d\b/gi, /\bIP\d0\b/gi, /\bPoE\b/gi, /\bPOE\b/g,
  /\bType[-\s]?C\b/gi, /\bUSB[-\s]?[AC]?\b/gi, /\bDC\b/g, /\bAC\b/g, /\bPD\b/g,
  /\bCat\s?\d[A-Z]?\b/gi, /\bCAT5E\b/gi, /\bT568B\b/gi, /\bCM[XR]\b/g, /\bEthernet\b/gi,
  /\bSPX\b/gi, /\bE-?MARKER\b/gi, /\bDC\d{4}\b/gi, /\bUL\d+\b/gi, /\bLED\b/gi,
  // 认证 / 商务缩写
  /\b(OEM|ODM|MOQ|DDP|ISO|RoHS|CE|FCC|QC|XML|FAQ|DHL|FedEx|SKU|CIF|FOB|EXW)\b/g,
  /\bISO\s?\d+\b/gi, /\bP&amp;D\b/gi, /\bP&D\b/gi,
  // 数值 + 单位 (含尺寸/长度/功率)
  /\b\d+(?:[.,]\d+)?\s*(?:W|V|A|mA|mAh|Wh|Hz|K|Mbps|Gbps|MB|GB|FT|ft|M|m|mm|cm|in|inch|polegadas|AWG|Lbs|lbs|kg|g|°C|%)\b/gi,
  /\b\d+\s*[x×*]\s*\d+(?:[.,]\d+)?\s*(?:mm|cm|m)?\b/gi, /\b\d+\/\d+\b/g, /\b\d+(?:[.,]\d+)?\b/g,
  // pt-BR 通用外来词 / 已入乡随俗 (多词在前)
  /\bpower\s?bank\b/gi, /\bplug[-\s]and[-\s]play\b/gi, /\bplug[-\s]?&[-\s]?play\b/gi,
  /\boff[-\s]grid\b/gi, /\boff[-\s]road\b/gi, /\bnotebook\b/gi, /\bdesign\b/gi, /\bkit\b/gi,
  /\bcamping\b/gi, /\bmotorhome\b/gi, /\bvan(s)?\b/gi, /\bbooster\b/gi, /\bboost\b/gi,
  /\bupgrade\b/gi, /\bdock\b/gi,
  /\bdisplay\b/gi, /\bonline\b/gi, /\bsite\b/gi, /\be-?mail\b/gi, /\blink\b/gi, /\bshop\b/gi,
  /\bhome[-\s]?offices?\b/gi, /\bslim\b/gi, /\bflat\b/gi, /\bpack\b/gi, /\bsetup\b/gi, /\bhub\b/gi,
  /\bcases?\b/gi,   // pt-BR 通用外来词, 且与我的 chrome 术语 "Cases e Proteção" 一致
  /\bstatus\b/gi, /\bcheck[-\s]?list\b/gi, /\bmarketing\b/gi, /\bweb\b/gi,
  // HTML 实体 / 符号
  /&[a-z]+;/gi, /&#\d+;/g,
];
```

### 无歧义英文标记词（EN_MARKERS）
> 刻意排除与葡语同形的词（`use`=usar祈使、`data`=日期、`ideal`、`complete`、`total`、
> `a/o/e/as/do/no/para/de/com/mais` …），否则全是噪音。
```js
const EN_MARKERS = new Set([
  // 功能词
  'the', 'and', 'with', 'your', 'yours', 'our', 'ours', 'this', 'that', 'these', 'those',
  'of', 'is', 'are', 'was', 'were', 'be', 'been', 'being', 'am',
  'from', 'they', 'them', 'their', 'theirs', 'there', 'here', 'we', 'you', 'it', 'its',
  'which', 'what', 'when', 'where', 'why', 'who', 'whom', 'whose', 'how',
  'will', 'would', 'shall', 'should', 'can', 'could', 'may', 'might', 'must',
  'have', 'has', 'had', 'having', 'does', 'did', 'doing',
  'into', 'onto', 'over', 'under', 'above', 'below', 'after', 'before', 'while', 'about',
  'between', 'through', 'during', 'without', 'within', 'upon', 'against', 'across', 'along',
  'each', 'every', 'both', 'another', 'such', 'only', 'just', 'very', 'much', 'many', 'few',
  'more', 'most', 'any', 'some', 'all', 'also', 'than', 'then', 'because', 'however',
  'first', 'second', 'last', 'next', 'other', 'others', 'same', 'own',
  'but', 'nor', 'yet', 'though', 'although', 'unless', 'until', 'whether',
  // 常见内容词 (英文营销文案里高频, 且非葡语)
  'best', 'better', 'good', 'great', 'new', 'old', 'high', 'low', 'long', 'short', 'small',
  'large', 'wide', 'easy', 'easily', 'simple', 'simply', 'quick', 'quickly', 'fast', 'strong',
  'safe', 'safely', 'secure', 'reliable', 'durable', 'sturdy', 'lightweight', 'heavy',
  // ⚠️ 已剔除与葡语同形: use(usar祈使) ideal complete(completar祈使) data(日期) total normal
  'perfect', 'ready', 'free', 'full', 'quality',
  'get', 'got', 'make', 'makes', 'made', 'uses', 'used', 'using', 'need', 'needs',
  'want', 'help', 'helps', 'allow', 'allows', 'keep', 'keeps', 'stay', 'stays',
  'work', 'works', 'working', 'provide', 'provides', 'ensure', 'ensures', 'include',
  'includes', 'including', 'feature', 'features', 'featuring', 'designed', 'built',
  'support', 'supports', 'supported', 'install', 'installed', 'installing', 'installation',
  'connect', 'connects', 'connected', 'connection', 'charge', 'charging', 'charger',
  'cable', 'cables', 'wire', 'wires', 'power', 'adapter', 'adapters', 'mount', 'mounts',
  'mounting', 'bracket', 'brackets', 'waterproof', 'weatherproof', 'extension', 'replacement',
  'connector', 'connectors', 'coupler', 'device', 'devices', 'product', 'products',
  'solution', 'solutions', 'accessory', 'accessories', 'package', 'contents', 'specification',
  'specifications', 'warranty', 'shipping', 'delivery', 'order', 'orders', 'buy', 'price',
  'guide', 'guides', 'guarantee', 'customer', 'customers', 'service', 'services',
  'seamless', 'upgrade', 'experience', 'enhance', 'elevate', 'transform', 'boost', 'expand',
  'outdoor', 'indoor', 'weather', 'speed', 'transfer', 'network', 'networking',
  'router', 'routers', 'laptop', 'satellite', 'dish', 'roof', 'wall', 'pole', 'car', 'truck',
  'boat', 'yacht', 'home', 'office', 'travel', 'read', 'more', 'back', 'send', 'submit',
  'inquiry', 'message', 'name', 'email', 'phone', 'company', 'contact', 'related',
  'description', 'category', 'model', 'type', 'brand', 'about', 'video', 'videos',
]);
```

### 调优时抓到的 3 个真 bug（否则报告全是噪音／漏报）
1. **词边界必须含重音字母** — 否则 `transferência` 被切成 `transfer` → 假阳性。
2. **多词白名单必须排在单词之前** — 否则 `\bStarlink\b` 先吃掉中间词，
   `Wanew Starlink Accessories`（法定公司名）永远匹配不上（假阳性 212→29）。
3. **类②盲区**（dev 结构分析发现）— 可见文本扫不到 href；死链检查也放行（英文页真实存在）→ 补了类②。

---

## 【白名单变更记录】（改白名单 = 改考卷，必须留痕）

| 日期 | scanner 版本 | 改了什么 | 为什么 | 对基线的影响 |
|---|---|---|---|---|
| 2026-07-14 | v1.0.0 | 初版冻结 @ `836f341f` | — | 基线 N=547 / translationLeaks=501（总调度逐条核实后批准，含独立 curl 复核 c 类剔除的合法性） |
| 2026-07-14 | v1.0.0（**未 bump**） | 加 `ledger`：c 类 46 条 + e 类 35 条**逐条留档** | 总调度要求「c 类必须挂账、不许消失」；e 类逐条 = R1 `localizeUrl` 的验收靶子 | **数字零变化**（N=387 / translationLeaks=387）。⚠️记录的 commit `836f341f`→`fee01112`：重跑发生在当前 HEAD，两者之间 `pt/` **零内容改动**（只加了 scripts/docs），故完全可比。**判定口径（白名单/标记表）一字未动**，所以不 bump 版本。 |
| 2026-07-15 | v1.0.0（**未 bump**） | ⚠️ **d 类「逐条核实结论」作废重写**（见上）+ 验收口径由「逼近 0」改为**身份判定**（`d 恰好是那 3 条`）+ 地板 **11 → 3** | **原结论是错的**：它描述的是旧 scanner 版本下的另一批条目。调白名单时数字重出过三次（558→741→512），**结论一次都没重核**。总调度是信了那句「已核实=真型号名，无需修」才批的基线。 | **基线数字零变化**（N=387 / translationLeaks=387 **不重出**）—— 冻结快照就该是历史，不因为后来修好了东西而改动。**判定口径（白名单/标记表）一字未动 → 不 bump**。变的只有①人的结论 ②合格线定义。修复 commit `53b15e6`（8 条 pt 内联 alt，en 零改动）。 |
