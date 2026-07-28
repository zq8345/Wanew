# es/pt leak-scanner 格式盲区 · 我的判定 + 补丁规格（供官网应用，我复核）

> 背景：官网实测 Contact 页营业时间/响应时长英文残留，`es-leak-scan`/`pt-leak-scan` 两个闸均未命中（`Mon–Fri` 命中数=0、`within 1 business day` 命中数=0）。这两个闸是我冻结基线的，改闸需 bump 版本+重签基线，官网没动，报给我判定。以下是我的决定+已验证过的补丁规格。

## 判定：加一层**补充性**格式判据，不改动/不替换现有标记词判据

**不采用**"照抄 zh-leak-scan 的白名单减法"（总工邮件里也点出了这点）：zh 与英文不同字符集，"减掉白名单剩下的连续英文=泄漏"在 zh 上安全；但 **es/pt 与英语同属拉丁字母、同形词多**（`Cables`/`Industrial` 逐字同形），照搬会让这套判据在 es/pt 上产生海量误报。

**采用**：加一组**格式模式（format-pattern）regex**，只匹配"英语特有、无法与西/葡语言混淆的格式化短语"，与现有的逐词标记表并行、互不替代：

```js
// 新增：格式化短语判据（与 EN_MARKERS 逐词匹配并列，互补不替代）
// 只认"格式"，不认单词——所以不会撞见 Cables/Industrial 这类同形词。
const FORMAT_LEAKS = [
  { name: "day-range",    re: /\b(Mon|Tue|Wed|Thu|Fri|Sat|Sun)\s*[-–—]\s*(Mon|Tue|Wed|Thu|Fri|Sat|Sun)\b/ },
  { name: "business-day", re: /\bwithin\s+\d+\s+business\s+days?\b/i },
  { name: "am-pm-time",   re: /\b\d{1,2}:\d{2}\s*(AM|PM)\b/i },
];
```

**为什么这三条是安全的、不是又一次"清单会漏"**：
- **不是逐字加日期/月份缩写单词进标记表**（那样会撞 `Mar`——英文 March 缩写，但也是西班牙语 martes(周二) 缩写、也是"mar"(海)这个常见西语名词——单字层面在 es 上就是雷）。
- **而是要求"两个星期缩写被连字符连起来"这个复合格式**——西/葡语没有人会把"周一至周五"写成"Mon–Fri"这种拼法，命中这个格式本身就是证据，不需要猜单字含义。
- `business day` 走**短语匹配**（"within N business day(s)"整体），不是拆开认"business"或"day"单字——避免任何单字层面的同形词风险。
- AM/PM 要求前面紧跟 `\d{1,2}:\d{2}` 时间戳，纯字母"am"（西语常见词，如"amor"缩写？不存在，但类似风险总要防）不会孤立触发。

## 已验证（不是假设）

1. **对着修复前的真实泄漏跑**（旧快照 es/pt 的 contact 页）：`day-range` 命中 `Mon–Fri`，`business-day` 命中 `within 1 business day`——**两条判据都精确复现了官网实测抓到的真实泄漏**，AM/PM 本站未用到该格式，未命中（合理，因为原文没有 AM/PM 场景）。
2. **对全站现网 es(91 文件)/pt(97 文件) 跑，检查有没有误伤**：修复前只命中 contact 页那 2 处（就是真泄漏本身），**其余 89+95 个页面 0 命中**——没有同形词或格式巧合造成的误报。
3. **对已修复的现网快照重跑**：es/pt 全站 **0 命中**——证明官网这次的修复是真修复（不是巧合过关），也证明这套新判据在"干净状态"下不会自己制造噪音。

## 补丁位置

- `scripts/pt-leak-scan.mjs`：`FORMAT_LEAKS` 数组加在 `EN_MARKERS`/`englishHits()` 附近；在现有"可见文本"提取循环（`vis.matchAll(/>([^<>]+)</g)` 处理文本节点 + `placeholder|alt|title|aria-label` 属性提取处）里，对已提取的文本**额外**跑一遍 `FORMAT_LEAKS`，命中计入一个新的子类（建议叫"类①-b 格式化短语"，与现有"类①可见文本"逐词判据并列展示，不混进同一个数字——保持"数字要能被拆开看"的既有原则）。
- `scripts/es-leak-scan.mjs`：**直接复用同一份 `FORMAT_LEAKS`**（不是重新写一遍——它现在就是从 pt-leak-scan 的 `EN_MARKERS` 派生 `PT_REMOVED` 过滤后使用；`FORMAT_LEAKS` 是格式规则不是词表，天然语言无关，**两个语言应该导入同一份，不该分叉出两套判断"Mon–Fri 是不是英文"的逻辑**）。

## 版本 + 基线（我的权限范围内，我来定）

- `pt-leak-scan.mjs`：`SCANNER_VERSION` `1.0.0 → 1.1.0`（比照 zh-leak-scan 加白名单时的版本语义：判据变了，版本必须跟着变，否则前后两次数字不可比）。
- `es-leak-scan.mjs`：目前代码里没看到独立的 `SCANNER_VERSION` 常量（复用 pt 的标记表），若加了独立版本号也同步到 `1.1.0`；若沿用"跟随 pt 版本"的隐式约定，需要在文件头注释里显式写清楚这个依赖关系（目前只有代码层面的 import 依赖，没有文档说明，建议官网顺手补一句注释）。
- **重签基线**：加了 `FORMAT_LEAKS` 后必须重新生成 `pt-leak-baseline.json`（含新 `scannerVersion`、新 `commitShort`、新 `translationLeaks` 总数——这次修复后应该是 0 新增，因为 contact 页已经修好了，但基线机制要求走这个流程而不是手改数字）。**我不会自己改这个文件**——它是我冻结的基线，改动必须经过"版本 bump → 重跑 → 新数字进基线"这个流程留痕，不能悄悄把数字往下修。

## 交付方式

本文件是**决定 + 已验证规格**，不是代码 diff——具体的 regex 插入位置/变量命名细节，交官网按现有代码风格实现（沿用其"多词条目排在单词前面"等既有教训，见 `zh-leak-scan.mjs` 注释里的坑）。**官网实现后，我用同一组"3 条格式规则 + 全站 0 误报"的验证方法复测一遍，再确认基线数字。**
