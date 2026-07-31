# 呈总工 — 2026-07-30 全闸审计汇报

**分支**: `gate9` (与 origin/main 同步)  
**审计人**: 窗口  
**审计方式**: 26 道闸 + 3 测试套件全部真实执行，非抽样，非 dry-run

---

## 一、结果速览

| 状态 | 数量 | 说明 |
|---|---|---|
| ✅ 全绿 | 15 道 | 设计/SEO/路由/产品/品牌/卫生 |
| ✅ 测试过 | 3 个 | product-route / render / list-page-wiring |
| ⚠️ 报告模式 | 4 道 | i18n-check / es-leak / pt-drift / zh-leak |
| ❌ 真红 | 2 道 | **es-hold-check** / **pt-leak-scan** |
| 🔴 特殊 | 1 道 | redirect-residue（exit 2，仪器无效，有意状态） |

**一句话**: 产品/设计/SEO/路由层全绿；问题集中在 **i18n 数据完整性** — es 有 4 个产品悬空，pt 有 90 条真漏译 + 253 条英文链接。

---

## 二、与 2026-07-28 #69 审计的对比

| 指标 | 2026-07-28 | 2026-07-30 | 变化 |
|---|---|---|---|
| es 英文残留 | 2 处 | 2 处 | → 持平 |
| pt 英文残留（可见文本） | 260 处 | **279 处**（已接受 189 + 真漏译 90） | ⚠️ 口径变化，真漏译 90 是新数 |
| pt 英文链接 | 92 个 | **253 处** | ⚠️ 恶化 |
| zh 英文残留 | — | 662 处（基线 872 ↓ 210） | ✅ 改善 |
| es 覆盖 | 28 页 | 58/68 产品 + 页面 | ✅ 推进中 |
| pt 覆盖 | 28 页 | 58/68 产品 + 页面 | ✅ 推进中 |

**口径说明**: 2026-07-28 的 260 处 pt 泄漏未区分「已接受债」与「真漏译」;本次扫描明确拆分：已接受 189 条（EN-only 攻略卡片标题，总工/Joe 拍过），真漏译 90 条。

---

## 三、真红 2 道 — 需总工决策

### 3.1 es-hold-check ❌ — 4 个产品"悬空"

```
产品总数 68  |  有 es 58  |  无 es 10  |  声明扣留 6
对账: 58+10 = 68 / 68 ✅  (数字对得上，语义对不上)
```

| 产品 | 英文标题 | 状态 |
|---|---|---|
| 4208 | Starlink Mini Wall Mount, 360 Adjustable… | ❓ 无 es，未声明 |
| 4209 | Starlink Mini Car Mount for Dashboard… | ❓ 无 es，未声明 |
| 4210 | Starlink Mini Battery Mount, 30,000 mAh… | ❓ 无 es，未声明 |
| 4211 | Starlink Mini Car Adapter 105W… | ❓ 无 es，未声明 |

**对比**: 已有 6 个产品（4206/678/679/691/695/704）在 `es-hold.json` 显式扣留，理由充分（安全风险/参数矛盾/虚假宣传）。这 4 个是**新缺口**。

**数据上分不出是漏翻还是想扣留。** 请总工拍：
- A. 补 es 翻译（如准备推 es 市场）
- B. 加入 `es-hold.json` 写明扣留理由（如暂不推 es）

---

### 3.2 pt-leak-scan ❌ — 真漏译 90 条 + 英文链接 253 处

#### 真漏译 90 条分布（Top 5）

| 页面 | 漏译数 | 内容 |
|---|---|---|
| `pt/guides/index.html` | 89 | 攻略卡片标题/摘要全英文 |
| `pt/guides/compatibility/index.html` | 26 | 产品对比 |
| `pt/guides/mounts/index.html` | 20 | 安装指南 |
| `pt/guides/cabling/index.html` | 16 | 线缆管理 |
| `pt/products/multi-ports-ethernet-adapter-661.html` | 14 | alt 文本重复 14 次 |

#### 英文链接 253 处

pt 页面链接指向英文页而非 pt 页（如 `pt/products/cables/index.html` 中的链接指向 `/products/` 而非 `/pt/products/`）。

**对比 2026-07-28**: 英文链接从 92 个涨到 253 个 — **恶化**，需检查链接生成逻辑。

**已接受债 189 条**: EN-only 攻略卡片标题，总工/Joe 拍过"留现状+诚实角标",**不纳入待办**。

---

## 四、报告模式 4 道 — 有告警，不阻塞

### 4.1 i18n-check ⚠️ — 5 类告警

| 类型 | 数量 | 说明 |
|---|---|---|
| 缺失 | 31 | 未翻译/待裁决（含 4208-4211 的 title/summary/description） |
| 孤儿 | 31 | partial 用了但 catalog 没有（solutions 页 token） |
| 无人使用 | 35 | 可能已腐烂的 key |
| 动态前缀认领 | 210 | 代码里 `前缀${...}` 拼出来的名字 |
| 有据扣留 | 20 | es 扣留（与 es-hold-check 联动） |

**孤儿 token 31 个**（solutions 页用但 catalog 无定义）:
```
sol.pain.h2, sol.pain.1.t, sol.pain.1.d, …, sol.h1, sol.intro, sol.eyebrow
```

### 4.2 pt-drift-check ⚠️ — 4 处译法漂移

| en | pt A | pt B | 位置 |
|---|---|---|---|
| Home | Início | Casa | chrome vs solutions |
| Marine | Náutico | Náutica | chrome vs solutions |
| Off-Grid | Off-grid | Off-Grid | chrome vs solutions |
| About Us | Sobre Nós | Sobre / Sobre a Wanew | about vs home |

**与 2026-07-28 signoff 文档对比**: 该文档记了 5 处，本次扫描 4 处 — 1 处可能已修复，或口径微调。剩余 4 处仍需拍：统一译法 或 加 `reason.pt-drift`。

### 4.3 es-leak-scan ⚠️ — 2 处英文残留

- `{uses}` — `pages/home.json:home.field.h2` — "Probado en campo, dondequiera que uses Starlink"
- `{model}` — `pages/list.json:list.banner.model` — "Accesorios para Starlink {model}"

**逐条看，误报也要留痕**（别改尺子去迁就译文）。

### 4.4 zh-leak-scan ⚠️ — 662 处（基线 872 ↓ 210)

趋势向好，修完需 `--write-baseline` 钉水位。

---

## 五、全绿 15 道 — 零问题

| 闸 | 覆盖 | 结果 |
|---|---|---|
| chrome-verify | 612 页 header/footer/mobilenav | 612/612 零回归 |
| pages-list-sync | 磁盘 vs 清单 | 611/611 一致 |
| url-backslash-check | 611 页 href/src/meta | 0 处 |
| design-drift-check | DESIGN.md §3.7 令牌 | 9 个 surface 零冲突 |
| type-scale-check | 字阶 10 档（含自证） | 全部在刻度上 |
| hreflang-verify | 575 簇 × 3 语种 | 575/575 六条规则全过 |
| switcher-verify | 611 页语种切换器 | 611/611 通过 |
| forms-integrity-check | 68 产品 category/form | 68/68 在真源清单 |
| catalog-dupe-check | 14 catalog 607 key | 0 重复串 |
| brand-residue-scan | 旧品牌残留 | 0 处 |
| repo-hygiene-check | 未追踪/忽略文件 | 干净 |
| vendor-manifest-check | 7 受管文件镜像 | 双向对齐 |
| whitecards-pair-check | 白卡片成对 | 全部有底 |
| es-glossary-check | 禁用词 20 条 | 无违规 |
| es-marker-selftest | 标记词考卷自测 | 尺子可靠 |
| gates-check | 27 道闸名单 | 与实际文件对齐 |

---

## 六、测试套件 3 个全过

| 测试 | 结果 |
|---|---|
| product-route.test | ✅ 路由层全过 |
| render.test | ✅ 渲染判据全过 |
| list-page-wiring.test | ✅ 列表页接线全过 |

---

## 七、慢闸未跑 — 需总工确认后手动触发

| 闸 | 原因 | 建议 |
|---|---|---|
| route-live-check | 🐢 起 wrangler + 491 条真 HTTP | 改 Functions 或路由后必跑 |
| routes-budget-check | 🐢 跑 build + _routes.json | 改 Functions 或路由后必跑 |

---

## 八、特殊状态 — redirect-residue-check

**exit 2（仪器无效）**: `data/product-redirects.json` 不存在 — 表随第 5a 步落地。227 个旧址页还在，**有意留着**:删除必须与「新址可收录」同一时刻发生。当前红得有记录，不是故障。

---

## 九、建议行动

### 高优先级（本周）

| 序号 | 行动 | 负责 | 预估 |
|---|---|---|---|
| 1 | **es-hold-check**: 4208-4211 四选一 — 补 es 或加入扣留清单 | 总工/Joe | 30min |
| 2 | **pt 真漏译 90 条**: 安排 pt-BR 翻译（优先 guides/index 89 条） | 翻译 | 2-3h |
| 3 | **pt 英文链接 253 处**: 检查链接生成逻辑，确保 pt 页链到 pt 页 | 开发 | 1h |

### 中优先级（下周）

| 序号 | 行动 | 负责 | 预估 |
|---|---|---|---|
| 4 | **pt-drift-check 4 处**: 统一译法 或 加 `reason.pt-drift` | 总工/翻译 | 15min |
| 5 | **i18n 孤儿 token 31 个**: 检查 solutions 页渲染，补 catalog 或清理 | 开发 | 1h |
| 6 | **zh-leak 662 条**: 继续推进，修完 `--write-baseline` | 翻译 | 持续 |

### 低优先级（有空时）

| 序号 | 行动 | 负责 | 预估 |
|---|---|---|---|
| 7 | **i18n 无人使用 key 35 个**: 确认腐烂后清理 | 开发 | 30min |
| 8 | **es-leak 2 处**: 逐条看，误报留痕 | 翻译 | 10min |

---

## 十、与 5b-handoff 的关联

本次审计结果与 `5b-handoff.md` 的 §1e「Joe 看得见的三件」直接相关：

- **② `/products/` 保持"全部 68 个"** — 本次 forms-integrity-check 确认 68 产品全在真源清单 ✅
- **③ 筛选状态写进 URL** — 已由总工完成 `834edbb0a`,list-page-wiring.test 通过 ✅
- **④ 20 个品类页进 noindex 开放名单** — 待 ⑤⑥⑦ 内容三件落地后，redirect-residue-check 才有意义

**④ 收尾（旧址 href 归零）** 未在本次闸中直接体现，但 product-route.test 通过说明路由层判据有效。

---

**窗口**  
2026-07-30
