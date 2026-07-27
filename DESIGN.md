# DESIGN.md — Wanew 设计宪法(唯一事实源)

> **地位**:全站(官网 wanew.com、产品后台 admin.wanew.com、后续一切 Wanew UI)所有界面工作只能从本文件取值。
> **演进规则(第 7 条红线)**:任何新设计模式、新令牌、新组件变体,必须在**同一个 commit** 里更新本文件,否则视为不合规,审计打回。
> **版本**:v1 — 令牌数值 = W3 三页原型(feat/w3-redesign)实际所用;Joe 拍板原型后锁定。实现载体:`skin/css/w3.css`(w3.css 是本宪法的编译产物,两者同 commit 演进)。

---

## 1. 视觉基准

对标 **Starlink 官网视觉语言**:深色、大图、克制排版、大留白、强交互反馈——但内容密度为 **B2B 询盘转化**服务:信任要素(年限/专利/产能/DDP/认证)进首屏,转化目标是**询盘(Request a quote)**,不是购物车。

五条气质判据(审计可逐条打分):
1. **深空底色**:页面基调是近黑,不是灰;层次靠发丝线与面板色阶,不靠阴影堆叠。
2. **产品照上浅色舞台**:白底产品图一律放进浅色圆角图台(`--w3-tile`),绝不直接贴在深底上。
3. **克制的强调**:强调色只用于图标/链接/焦点/极少量点缀;主按钮是白底黑字胶囊,不是彩色大按钮。
4. **真实摄影优先**:氛围区块用真实场景照(见 §6),禁止插画风/素材库塑料感。
5. **一切可点必有反馈**(见 §5)。

## 2. 设计令牌(Design Tokens)

**取值纪律**:原型中出现的每一个样式值都必须能在下表找到出处;新值先入表再入 CSS,**禁止魔法数字**。

### 2.1 色板(深底 + 单一强调色)

| 令牌 | 值 | 用途 |
|---|---|---|
| `--w3-bg` | `#0a0c0f` | 页面基底 |
| `--w3-bg2` | `#0e1114` | 二级底(stat 格/输入框) |
| `--w3-panel` | `#14181d` | 卡片/面板 |
| `--w3-panel2` | `#191e24` | 面板 hover 态 |
| `--w3-line` | `rgba(255,255,255,.08)` | 发丝线/边框(静态) |
| `--w3-line2` | `rgba(255,255,255,.16)` | 边框(hover/强) |
| `--w3-text` | `#eef1f4` | 主文字 |
| `--w3-text2` | `#a9b2bb` | 次文字(说明/摘要) |
| `--w3-text3` | `#75808a` | 弱文字(眉题/元信息/计数) |
| `--w3-accent` | `#7db1ff` | **唯一强调色**:图标/焦点环/缩略图选中/列表符 |
| `--w3-tile` | `#f4f5f7` | 浅色产品图台 |
| `--w3-ink` | `#14181d` | 浅色面上的深文字 |
| 白色面板 | `#fff` 底 / `#23282e` 文 / `#101418` 标题 / `#e6e9ed` 表线 / `#f5f6f8` 表头 / `#1d63d6` 链接 | 详情页描述舞台(富文本为白底而作) |
| 状态色 | 成功 `#7fd8a2` / 错误 `#ff9d9d` | 仅表单反馈文字 |
| 头部玻璃 | `rgba(10,12,15,.82)` + blur 14px | 滚动后吸顶导航 |
| 面板玻璃 | `rgba(16,19,23,.96)` + blur 18px | 下拉菜单 |
| 遮罩 | `rgba(4,5,7,.6)` + blur 3px | 移动抽屉遮罩 |
| 选区 | `rgba(125,177,255,.28)` | ::selection |

覆盖照片的压暗渐变只允许由 `rgba(10,12,15, α)` 系构成(α∈{.05,.12,.15,.25,.35,.42,.45,.55,.62} 内取),两端必须收敛到 `--w3-bg` 保证与页面无缝。

### 2.2 字体与字号阶梯

字体:**Inter**(Google Fonts,weights 400/500/600/700/800)+ 系统回退。正文行高 1.6;标题行高 1.06–1.22;数字用 `tabular-nums`。

| 步级 | 值 | 用途 |
|---|---|---|
| display-1 | `clamp(2.35rem, 5.2vw, 4.1rem)` /1.06, w700, ls-0.028em | 首页 H1 |
| display-2 | `clamp(2rem, 4vw, 3rem)` /1.08, w700, ls-0.025em | 列表页横幅 H1 |
| h2 | `clamp(1.65rem, 3vw, 2.45rem)` /1.14, w700, ls-0.022em | 区块标题 |
| h3 | `clamp(1.45rem, 2.4vw, 2rem)` /1.22, w700, ls-0.02em | 详情页 H1(产品名) |
| h4 | `clamp(1.3rem, 2vw~2.2vw, 1.7rem~1.8rem)`, w700 | 面板标题/相关产品头 |
| stat | `21px` w700 | 数据格数字 |
| body-lg | `16.5px` | 区块说明(`.w3-sub`)/信任栏数值 |
| body | `15–16px` | 正文/白舞台富文本(15) |
| ui | `14–14.5px` | 按钮(14.5)/卡片标题(14)/表单(14)/摘要(14.5) |
| ui-sm | `13–13.5px` | 导航项/表单标签/次级文字/状态文字 |
| caption | `12–12.5px` | chip(12.5)/徽章/页脚小字 |
| micro | `11–11.5px` | 眉题(11)/计数(11.5)/信任栏标签(11) |

眉题(`.w3-eyebrow`)统一形制:11px / w600 / 全大写 / 字距 `0.22em` / `--w3-text3`,前置 22px 发丝短线。列表过滤条标签变体:字距 0.16em;信任栏标签:0.14em;卡片元信息:0.1em。

### 2.3 间距(8px 网格)

基础网格 **8px**,允许半步 4px(chip/小间隙)。常用档:`4 / 8(-10) / 12(-14) / 16(-18) / 20(-24) / 28(-32) / 36 / 44(-48) / 56 / 72 / 96 / 120 / 140`(px;括号内为同档微调值,受内容光学修正约束)。

| 令牌 | 值 | 用途 |
|---|---|---|
| section | `96px 0`(移动 68–72) | 区块垂直节奏 |
| band | `120–140px 0`(移动 96) | 全幅照片带内距 |
| sechead-gap | 14 / 下距 44 | 区块头内/下 |
| card-pad | 20–26px | 卡片内距 |
| grid-gap | 12–16px | 网格间隙 |
| container | `max-width 1240px` + 两侧 `24px` | `.w3-container`(全站唯一容器) |
| header-h | `68px`(`--w3-header-h`) | 头部高度,吸顶偏移同源 |

### 2.4 圆角与阴影

| 令牌 | 值 | 用途 |
|---|---|---|
| `--w3-radius` | `16px` | 卡片/画廊/面板 |
| `--w3-radius-s` | `10px` | 图台/输入框/缩略图/小按钮面 |
| radius-panel | `20px` | 大面板(描述舞台/询盘) |
| radius-menu | `12–14px` | 下拉面板 |
| radius-pill | `999px` | 按钮/chip/类目签/语言钮 |
| `--w3-shadow` | `0 24px 60px -24px rgba(0,0,0,.55)` | **唯一阴影**,仅浮层(下拉菜单)可用;卡片层次靠边框与底色,不用阴影 |

### 2.5 动效时长与缓动

| 令牌 | 值 | 用途 |
|---|---|---|
| `--w3-ease` | `cubic-bezier(.22,.61,.24,1)` | 唯一缓动曲线 |
| dur-fast | `0.15–0.2s` | 颜色/边框/背景微变 |
| dur-base | `0.22–0.3s` | 位移/浮起/下拉浮现 |
| dur-slow | `0.35–0.45s` | 图片缩放/抽屉滑入 |
| dur-reveal | `0.65s`(级差延迟 0.08s×n, n≤3) | 滚动渐入 |
| hover-lift | `translateY(-2~-4px)` | 卡片/按钮浮起幅度 |
| img-zoom | `scale(1.04–1.05)` | 图台内图片 hover |

`prefers-reduced-motion: reduce` 下全部动画/平滑滚动关停(已在 w3.css 全局钉死)。

### 2.6 治沉闷对比系统（美化北极星 · Joe/总工 2026-07-26 定 · 所有美化必套）

**诊断(Joe)**:全站沉闷 = 暗底 + 暗卡 + 暗内容 + 暗图标全挤一起,无对比无层次无焦点。**目标:暗得高级 = 分层 + 对比 + 焦点,不是暗得平。北极星 anduril.com。** 与 About「全暗」不冲突——全暗仍要分层/对比/焦点。§2.4「卡片不用阴影」被本节修订(见 1)。令牌已进 w3.css `:root`(`--w3-surface-*`/`--w3-elev-card`/`--w3-edge-top`/`--w3-invert-*`/`--w3-well`),③ 起逐块套。

1. **真分层电梯**:surface 拉开明显台阶,卡片必须"浮"起、不与底同色糊成一片。
   - `--w3-surface-0`(基底)→`--w3-surface-1`(凹陷:stat well/输入框,inset)→`--w3-surface-2`(卡片,比 panel 抬亮一档)→`--w3-surface-3`(hover/抬起)。
   - 卡片浮起 = `--w3-surface-2` 底 + `--w3-edge-top`(顶边内高光)+ `--w3-elev-card`(柔和双层投影)+ `--w3-line` 边。**⚠️ 修订 §2.4**:卡片此前"只靠边框+底色、不用阴影"→ 现**允许 `--w3-elev-card` 柔和双层投影 + 顶边高光**(专治"卡和底糊一片")。大投影 `--w3-shadow` 仍仅浮层(下拉)。
2. **对比节奏 + 选择性提亮(反转带)**:长暗段插焦点,暗→亮→暗呼吸。
   - 「信任/证据」类板块(Our Advantages / stats 带 / 认证条)可用**浅底反转** `.w3-invert`:底 `--w3-invert-bg` + 标题 `--w3-invert-ink` + 正文 `--w3-invert-ink2`。
   - 不是全白页;焦点处系统化提亮。**每屏 ≤1 个反转带**,别乱花。
3. **accent 敢用大**:蓝不只做小标签——焦点数字(stat)、关键图标(≥32px)、hover 态、编号角标用足 `--w3-accent`;可用 accent→透明渐变做进度线/顶边。
4. **影像/图形补白(禁暗 void)**:内容板块**禁留"无图暗 void"**(如空的大图标区)。用产品图 / 线性图解 / 图形填;图标区最小垫底 = `--w3-well`(径向井)。
5. **字阶对比锐化**:纯白标题(`--w3-text`)vs 克制但可读灰正文(`--w3-text2` 为正文灰**下限**,禁用更暗的做正文);相邻层级字号/字重/色三者都拉开,层次利落不发糊。

**套用顺序(总工队列)**:③ Guides 美化 → 首页 #82(Our Advantages 反转/分层 + Guides&Resources 卡补图浮起)→ About v4 #80(暗得高级)→ Solutions #77。每套一块 curl/CLI 自验、逐块交。新组件仍 §7.4 同 commit 登记。

## 3. 组件唯一写法(禁止一次性样式)

每类组件**只有一种实现**;需要新变体 = 先改本节 + w3.css,同 commit。

### 3.1 按钮 `.w3-btn`(胶囊,高 48px,14.5px w600)
- **主** `.w3-btn--primary`:白底 `#fff` 黑字;hover `#dfe6ee` + 上浮 1px。**一屏至多一个主按钮语义**:全站统一转化 CTA=`Request a quote`(文案取 `t.body.request_quote`,零歧义)。
- **次/幽灵** `.w3-btn--ghost`:透明底 + `--w3-line2` 边;hover 边 `rgba(255,255,255,.38)` + 微白底。
- 箭头用 `<span class="w3-arw">→</span>`,hover 右移 3px。
- 文字链变体 `.w3-link-arrow`:14px w600 + `::after "→"`(hover 右移 4px)。
- ⛔ 禁止:彩色按钮、方角按钮、第三种按钮底色、图标字体。

### 3.2 卡片
- **产品卡** = 机器产出 DOM(`.blog-one__single`,cardHtml 发出,**类名载重不可改**):面板底+发丝边+16 圆角;内部图台 `--w3-tile` 1:1 圆角 10 外距 10;标题 14px 两行截断;摘要 12.5px `--w3-text3` 两行截断。hover:浮 4px + 边 `--w3-line2` + 底 `--w3-panel2` + 图 zoom。
- **机型瓦片**(`.product-grid-*`,renderHome 发出,类名载重):同族样式,文字行右侧 `→` hover 右移。
- **优势卡**(`.w3-whycard`):面板底+发丝边+16 圆角+浮起;**用编号索引 `.w3-whycard__idx`(01–04,accent 色+下发丝线)领起,不用图标**(总工 review #1:真实证据/编号 > 图标堆砌;图标+三词卡=廉价模板感,禁用);标题 16px + B2B 实质正文(不截断,SEO 需要)。
- **证据条** `.w3-certstrip`(优势区脚):真实认证徽标 `.w3-certbadge`(FCC/CE/RoHS)+ 标签 + 认证页链接——真实证据优先于装饰。
- ⛔ 禁止:第二种卡片底色、卡片投影、无 hover 卡片、**用图标+三词卡填充版面**。

### 3.2b 文章/攻略详情页(`.blog-details`,长文 SEO 页 marine/62 等)
- **单栏**(总工拍板 2026-07-25):无侧栏(旧 blog 的 search/category/recent-posts widget 一律删),正文单列居中,Linear/Stripe 文档式。正文列宽 `max-width:820px` 居中(可读行长,禁满宽 1240)。
- **W3 标题**:章节 h2 交 w3.css 统一(`clamp(22,2.6vw,30)` w700),h3 19px w650;**⛔ 零内联样式**——严禁 `<h2 style="...">` 写死颜色/背景(旧 Tejoy 蓝框 `rgb(15,76,129)` 覆盖单一真源,已全剥)。
- 段落 15.5px/1.8 `--w3-text2`;表格强制 `width:100%`+横向滚动(旧 markup 有 `width="1400"` 会撑破);图 `max-width:100%`+12 圆角。
- **迁移器** `scripts/skin-migrate.mjs`(幂等):换头 CSS/JS 全家桶→w3.css+w3.js、剥 h2 内联 style、平衡删侧栏 col、删 footer 重复 Organization JSON-LD(head 已有主的=L4)。加新长文页照此规范。

### 3.2c 板块分隔 = 空间 + 色调(⛔ 禁 hairline rule)
- 板块之间**不用细线**(总工/Joe 定,世界级做法 Apple/Linear=靠空间+色块,不靠线)。旧 `.w3-hairline-top` 已置 `border-top:0`。
- 分段两招:**(a)** 充足统一纵向留白(`.w3-section` 96px / 移动 68px,成节奏);**(b)** 相邻板块极微妙色调交替 —— base `--w3-bg #0a0c0f` ↔ surface `--w3-bg2 #0e1114`,交替板块加 `.w3-band--alt`(=surface 底),靠色块边界读分段。
- **⛔ 禁**:板块间 `border`/`hr`/细线分隔。

### 3.2d 信息页 hero(`.page-header`)必须铺到最顶、延伸到 nav 背后
- ⭐⭐ **约定(Joe 铁律,2026-07-27 写死):每个顶级板块页必带【专属照片 hero】**——`.page-header` + `.page-header-bg`(bg-image 真实照片)+ ::after scrim,与 Products/Solutions/About/Contact **同一套规格档次**。**禁用暗色纯 CSS 图形 header 代替照片 hero**(Guides ③ 曾误用 slim 图形 header 跑偏、且与 /faq//compatibility/ 的照片 hero 顶图两套——踩过)。Guides 家族(/guides/ 首页 + 各 topic + 文章页 + /compatibility/ + /faq/)统一 hero-guides.webp(⑯ 定的分区招牌图;文章页用矮版 `.page-header--article`)。新增顶级板块页=必配一张专属照片 hero,别再走图形。
- nav 是 `position:fixed` 透明 overlay(滚动才出玻璃底)——信息页 hero 要像首页一样**从视口 y=0 起、延伸到 nav 背后**,nav 透明浮其上。
- 机制:hero `.page-header` 靠**自身 top padding**(`calc(--w3-header-h + 84px)`)让标题避开 nav;内容区 `.xlc-section` 自带上下留白。**⛔ 禁给 `<body>` 加顶 padding**(那会把整个 page-wrapper 下推到 nav 下方,透明 nav 上方露深色页底 = "nav 黑带" bug,踩过三次;根因是 body 顶 padding,不是 hero 渐变/不是 stricky-header)。新信息页 body 别挂带顶 padding 的类。

### 3.2e Guides 浏览 = 专属 topic 页一套逻辑,禁客户端筛选工具条
- ⭐⭐ **约定(Joe 铁律,2026-07-27 写死):Guides 只用【专属 topic 页】一套浏览逻辑**——`/guides/`(All guides 入口)→ 点 topic chip **跳** `/guides/{topic}/` 专属页 → 文章。topic chip 是 `<a href="/guides/{topic}/">` **导航链接**(tab 式),不是就地过滤。
- **⛔ 禁再建"客户端筛选工具条"**(`data-guides-filter` + `data-topic` + JS 就地 toggle):它和专属 topic 页干同一件事 = Joe 反复点的"2 套浏览逻辑"。已删(w3.js filter 段 + 卡片 `data-topic`)。card 只是 `<a>` 跳文章,不带筛选属性。
- home 与各 topic 页共用同一条 `.guides-nav`(当前项 `.is-active`);由 regen `navChips(loc, current)` 单源发出,仅【≥2 个有内容主题】时渲染。

### 3.3 导航(chrome 单咽喉,DOM 由 `_chrome.html` 发出)
- 顶栏固定 68px:透明起步,滚动 >12px(`html.w3-scrolled`)或 `body.w3-solid-header` 时落玻璃底+发丝下边。
- 一级项 13.5px w500;hover/焦点 白字+微白底;**有下拉才有 caret**(CSS `:has` 自动)。
- 下拉:玻璃面板 250px+,项 13.5px,浮现 = 6px 上移 + 0.22s 淡入;`:focus-within` 同 hover(键盘可达)。
- 信息架构(零歧义,一入口一语义):`Products(下拉) / Solutions / Guides / Company / Contact(直达)`。
- 移动端(≤1080px):汉堡(CSS 画线,无图标字体)→ 右侧抽屉 `min(340px, 88vw)`,菜单由 w3.js 克隆(克隆必须去 `main-menu__list` 类名),子级 `+` 展开钮 `.w3-subnav-btn`。
- 语言切换 `.lang-switch`:胶囊钮 + 玻璃下拉,当前语言灰字不可点。

### 3.4 表单 `.w3-form`
- 双栏网格(≤560px 单栏),字段盒 `.w3-field-box`(标签 12.5px w550 `--w3-text2` + 控件)。
- 输入/textarea:`--w3-bg2` 底 + 发丝边 + 10 圆角 + `12px 14px` 内距 + 14px;focus = `--w3-accent` 边(无阴影)。
- 状态文字 `.wanew-form-status`:pending 灰 / success `#7fd8a2` / error `#ff9d9d`。
- 提交按钮 = `.w3-btn--primary`(同 3.1,无表单特例)。

### 3.5 面包屑 `.w3-pdp__crumb`
13px,链接 `--w3-text2` hover 白,分隔符 `/` 弱色;**站内跳转用相对路径**(`../products/`)自动随 locale。

### 3.6 其它钉死组件
- **chip/过滤**(`.product-chip`,机器锚点):胶囊 12.5px,静态=发丝边弱字;hover=亮;`.is-active`=**白底黑字**;计数 `.product-chip__n` 11px tabular。过滤条 `.w3-filterbar` 吸顶(top=header-h)玻璃底。
- **信任栏** `.w3-trust`:5 格,格间发丝竖线,值 16.5px w650 + 标签 micro 全大写。
- **数据格** `.w3-stats`:1px 发丝网格拼接,数字 21px w700。
- **产品策展条** `.w3-pstrip`(首页,机型瓦片之上):**6–8 件人工精选爆款 + 好图**(总工 review #2:策展非目录堆砌;图差不上首页),id 列表在 `data/pages/home-featured.json`,renderHome 优先读它、缺省回落形态多样性挑选;卡=浅色图台真实产品照+两行标题;空列表=module 隐藏。⚠️ 产品首图多为带烤字营销拼图,只收干净纯产品图。
- **场景切换 tabs** `.w3-scenetabs`/`.w3-scene-panel`(Field-proven):**用户可控 tab 切换,绝不 auto-rotate**(总工 review #3:自动轮播是过时反模式,漏内容+伤转化+伤可达);tab=胶囊(is-active 白底黑字),面板=全幅场景照+一句话+入口链,0.5s 透明度切换,方向键可达,尊重 reduced-motion。~~旧 `.w3-scene` chip / `.w3-carousel` 已废弃~~。
- **画廊**(`.swiper-*` 类名载重,实现是 CSS scroll-snap + w3.js,无 swiper 库):主台 1:1 `--w3-tile` 16 圆角;箭头=白圆钮 42px 悬停现身;缩略图 72px,选中 = `--w3-accent` 2px 边。
- **回顶钮** `.scroll-to-target`:44px 圆钮,滚动后现身。

### 3.7 About / Solutions / Guides 区组件（W3 About v2/v3 + Solutions + Guides 迁移新增,§7.4 登记）
> 令牌全取自 §2:色 bg2/panel/line/line2/accent、radius 16、ease、字阶。零魔法值。图标=内联 SVG 线性(stroke 1.6/accent),服务流程/含义(流程节点、认证盾),**非装饰卡**(review#1 边界:流程图/语义图标允许,一排三词装饰图标卡禁用)。
- **流程图** `.w3-flow`/`.w3-flow__node`/`.w3-flow__ic`/`.w3-flow__n`(Quality Process 5 步 + OEM/ODM ODM 3 步,共用一套):横向 grid(`grid-auto-flow:column`),节点=accent 描边环圆 64px(径向井底 `rgba(125,177,255,.14)`→panel + halo `::after` + 景深)+ 渐变进度连接线(`::before`,accent→透明,非灰细线)+ 步骤号 accent 药丸 `.w3-flow__n`;≤760px 转竖排(连接线保留)。hover 节点上浮+环加亮。
- **流程带容器** `.w3-flowband`〔审计 §7.4 补登 · ③/About v4 §2.6 升级〕:给流程图视觉分量的 surface 容器 —— `background:--w3-surface-2` + `--w3-edge-top`+`--w3-elev-card` 浮起 + `1px --w3-line` 边 + `--w3-radius` 圆角 + `34px 30px 30px` 内距(≤760px `26px 20px 6px`)。用途:包裹 `.w3-flow`,避免"图标+线飘在深底上"。
- **图标卡** `.w3-iconcard`(OEM 4 服务卡 · About v4 §2.6 升级):`background:--w3-surface-2`+`--w3-edge-top`+`--w3-elev-card` 浮起+发丝边+16 圆角+径向井图标(46px)+ hover 上浮 4px/更强投影 + 顶部 accent 渐变线(`::before`);h3 15px w650 / p 13px --w3-text2。语义图标(机架/立方/滑块/盾),非装饰。
- **工厂影像墙** `.about-facwall`(制造段,信任硬货):全宽 2×3 grid(gap 14),`figure` overflow-hidden 圆角边框,`img` `aspect-ratio:503/338` object-fit cover + hover scale 1.05 + 底渐隐 `::after` + 编辑级工序 `figcaption`(小写角标胶囊,aria-hidden);≤860px 2 列、≤520px 1 列。图 alt=工序键。
- **认证条** `.about-certstrip`/`.about-cert`(v3.1,取代旧 `.about-certs` 4 大空卡):slim 药丸横排(flex wrap 居中),药丸 `.about-cert`=胶囊 9/16 padding + line2 边 + 盾图标 18px accent + 13.5px w650;放在质量流程之后(节奏 数据→影像→工艺→认证)。
- **能力/免责行** `.about-caps-line`(制造段能力叙述,居中限宽 760)· `.about-disclaimer`(Compat&FAQ 段首商标免责一句,13.5px --w3-text3)。
- **FAQ 平铺** `.faq-flat`/`.faq-flat__item`(About v4 §2.6 升级):`background:--w3-surface-2`+`--w3-edge-top`+`--w3-elev-card` 浮起卡内 h3+p 平铺(非 accordion,总工/Joe 定;内容留 DOM;About 不加 FAQPage schema)。
- **段标题** `.tj-sechead`>`.tj-h2`(全站信息页统一 section 标题):tj-h2=§2.2 h2 精确值(`clamp(1.65rem,3vw,2.45rem)`/1.14/w700/-0.022em);**所有 section h2 同档**(旧 `.xlc-merged-title` 偏大已弃)。
- **Solutions hub 场景卡** `.sol-grid`/`.sol-card`:3 列(→2→1)图卡,`.sol-card` `background:--w3-panel`(⚠️ pre-§2.6,#77 升级时改 --w3-surface-2 + edge + elev 并同步本行);媒体 `aspect-ratio:16/9` cover + hover scale;body=场景名(18px w700)+ 描述(13.5 --w3-text2)+ 角标 accent →;整卡链 `/solutions/{scene}/`。
- **Solutions 场景推荐配件** `.sol-recs`/`.sol-rec`:auto-fit minmax(230px),`.sol-rec` `background:--w3-panel`(⚠️ pre-§2.6,#77 升级时同步本行);药丸行=径向井图标(46px)+ 标签 + hover accent →,深链 `/products/#type`、`/{model}/`。
- **Solutions CTA 带** `.sol-cta`:panel→bg2 渐变面板,左文右钮(≤640 竖排),主钮 §3.1 primary(Request a quote)。
- **信息页 hero 眉标** `.page-header__eyebrow`:11px w600 全大写 0.2em accent(hero 内 eyebrow,如 "SOLUTIONS · RV")。
- **Partner CTA** `.about-partner`:段标题(tj-h2)+ 一句 + primary 按钮(收尾转化,一句+钮不拖)。
- **Guides 库网格** `.guides-grid`/`.guides-card`〔Guides 迁移新增 · ③ 美化按 §2.6 升级,本条已对齐 shipped 代码〕:`repeat(3,1fr)` 卡网格(gap 16;≤900px 2 列、≤560px 1 列)。`.guides-card`=**§2.6 浮起**:`--w3-surface-2` 底 + `--w3-edge-top` 顶边高光 + `--w3-elev-card` 双层投影 + 发丝边 + 16 圆角;hover 上浮 4px + 更强投影 + 顶部 accent 渐变线(`::before` opacity 0→1)。内含 `.guides-card__topic`(11px **w700** 全大写 accent 眉标)+ `.guides-card__t`(标题 16.5px **w700**,3 行截断)+ `.guides-card__sum`(摘要 13.5px `--w3-text2`,2 行截断,派生自正文首个实文段)+ `.guides-card__arw`(角标 →,hover accent+右移);整卡链 `/guides/{slug}/`。card_title(人话短标题)住 guides-manifest,cardOf 回落长标题。`.guides-card.is-hidden`=筛选隐藏态(`display:none`),w3.js `[data-guides-filter]` 依 `data-topic` 切换。
- **Guides 主题导航条** `.guides-nav`/`.guides-chip`〔见 §3.2e 约定〕:药丸行(flex wrap);`.guides-chip`=**导航链接 `<a href="/guides/{topic}/">`**(胶囊 line2 边 + hover accent),`.guides-chip.is-active`=**白底(#fff)+ 近黑字(`--w3-surface-0`)**(当前所在页)。builder 仅在【≥2 个有内容主题】时渲染整条(单主题隐藏,见 regen `activeTopics`/`navChips`)。**已废除** `.guides-filter`/`data-guides-filter` 客户端过滤(§3.2e:Guides 单一浏览逻辑,禁 2 套)。
- **Guides CTA** `.guides-cta`:文章尾转化块,tj-h2 标题 + primary(Request a quote)+ ghost(返回该主题库);令牌全取 §2/§3.1。
- **Guides 空主题占位** `.guides-soon`:未迁移主题(rv-off-grid/mounts/power,G2-4 前)库页 coming-soon 提示条(panel 底 + --w3-text2 居中一句);该页同时注入 `noindex,follow`,避免空壳被索引。
- **选择性提亮反转带** `.w3-invert`〔#82 首页 · §2.6 招2 实现〕:给「信任/证据」类整段套浅底反转(`--w3-invert-bg` 底 + `--w3-invert-ink`/`ink2` 文 + `--w3-invert-accent` 深蓝 accent),暗→亮→暗呼吸,**每屏 ≤1**。内部子件自动改色:eyebrow/h2/sub/link-arrow + `.w3-whycard`(白卡浮于浅底:白底+浅阴影 layered)+ `.w3-certstrip`/`.w3-certbadge`(浅底描边)。首个落点=首页 Our Advantages(Why Wanew)。
- **首页 Guides 卡** `.tj-gcard`〔#82 · §2.6 升级〕:与 `.guides-card` 同款浮起(`--w3-surface-2`+`--w3-edge-top`+`--w3-elev-card`);`.tj-cover` 图标区用 `--w3-well`(径向井)垫底补"暗 void",图标 52px accent。
- **文章照片 hero** `.page-header--article`(Guides 文章页 · 2026-07-27):`.page-header` 照片 hero 的**矮版**(`height:clamp(300px,30vw,460px)`,免长文被巨图挤下去),照片走 `.page-header-bg--guides`(hero-guides.webp,`background-position:center 62%`);承载 `.w3-crumb`(面包屑:`/guides/` → 主题,发丝分隔 `/`,13px --w3-text3 + accent 链)+ 文章 h1。⚠️ 旧 `.page-header--slim`(暗色纯图形 header)已废弃(Joe 铁令改照片 hero,见 §3.2d),CSS 残留待清、勿再用。

## 4. 交互标准

1. **一切可点元素必有 hover / focus-visible / active 反馈**;focus-visible = `2px solid --w3-accent` outline + 3px offset(全局钉死,禁止 `outline:none` 不给替代)。
2. 过渡时长/缓动只从 §2.5 取;JS 动画尊重 `prefers-reduced-motion`(w3.js 的 reveal/平滑滚动已内置)。
3. 滚动渐入只用 `data-w3-reveal`(1–4 级差),每屏渐入元素 ≤4,禁止大面积齐闪。
4. 吸顶元素(导航/过滤条)必须玻璃底,禁止实心色块悬浮。
5. 触控目标 ≥44×44px(汉堡/关闭/箭头/回顶已达标)。

## 5. 移动端(一等公民)

断点:`1080px`(导航切抽屉)/ `980px`(多数网格 4→2 或 1)/ `900px`(详情两栏→单栏)/ `720px`(过滤条纵排+横滑)/ `640px`(区块节奏收紧)/ `560px`(表单/卡片单列)。任何页面在 375px 视口**零横向滚动**(验收硬项)。

## 6. 图片规则

1. **优先真实摄影**(现库:黄昏屋顶 hero / 银河 CTA 带 / 极光露营 / 沙漠公路 / 太阳能屋顶等,位于 `/static/upload/image/`);新增氛围图走 **img.wanew.com**(缓存规则已生效)。
2. 照片统一处理:上下用 §2.1 渐变收敛进 `--w3-bg`,禁止硬边;色调冷暗系,禁止高饱和滤镜。
3. **白底货架图过渡方案**:一律进浅色图台(`--w3-tile` + `object-fit:contain` + 82–88% 内缩),hover 统一 zoom(§2.5);长期方向=逐步替换为统一打光的场景化产品摄影,替换前禁止白底图裸贴深底。
4. 装饰性图片 `alt=""`;信息性图片 alt 由渲染器按 locale 派生(机器规则,勿手写)。

## 7. 红线(重申,违者打回)

1. **SEO 资产零损伤**:URL 结构、301、canonical、hreflang、三语(en/es/pt)、336 页 sitemap 派生管线、meta 派生 —— 设计改动一根手指都不能碰。
2. **三语管线不动**:文案只进 catalog(chrome.json / data/pages/*.json,i18n-check 守卫),模板只引 `{{t.*}}`;机器产出 DOM 的类名(§3.2/3.6 标注"载重"者)只能改样式不能改形状;改模板必须 `regen → chrome-sync --write` 产物同 commit(zero-diff 闸)。
3. **导航与按钮文案零歧义**:每个入口唯一语义;转化 CTA 全站只有 `Request a quote` 一种主口径。
4. **演进规则**:新模式不进 DESIGN.md = 不合规(见文件头)。
