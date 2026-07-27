# Guides IA v2 — 59篇 → 5任务轴 retag 全表（2026-07-27，待总工+审计核，先不动页面）

## 前提（步1 curl 已确认）
- 文章 URL = **扁平 `/guides/{slug}/`，不含 topic**（curl 3 样本 200，无嵌套形态）。
- manifest 记录 `{id, topic, slug, old, title, card_title}` —— `topic` 是**元数据**（驱动 topic 列表页分组+卡片标签），**不在 URL**。
- ⇒ **retag = 只改 manifest 的 `topic` 值，58 篇文章 URL 全不动**；仅 topic 列表页（新建/退役）URL 变。零文章 URL 破坏。

## ✅ 总工已审批 + 逐条裁定（2026-07-27）
- 边界篇：4358→Selection、4369→Selection、4384→Power、62→Protection（暂留，标 Joe 复核可能去 About/FAQ，先不 churn）。
- **B2B：marine 64（OEM制造）+ 65（批量采购）随 industrial 一并移出 OUT**（Guides 只留真 how-to；OEM/批发/商务分流）。→ OUT=7。
- 近重复（71↔73/72↔74/88↔89↔90）本轮**只 retag 不合并**，合并留 Joe 回来拍。
- ⚠️ 计数校正（给总工）：64/65 在我原表里是**独立 B2B-flag、不在 Selection 的 16 里**（Selection 列出的 16 篇不含 64/65）。故移 64/65 进 OUT 后 **Selection 仍 16**、OUT 5→7、5 轴数量不变。总工"Selection 16→14"是把 64/65 误算进了 Selection。

## 5 新任务轴（正交、每轴 ≥7 篇有内容、无空壳）
| 新任务轴 (菜单 label / URL slug) | 篇数 | slug 方案 |
|---|---|---|
| Compatibility & Selection ("Compatibility" / `compatibility`) | 16 | **复用刚迁的 /guides/compatibility/**（总工"吃掉 Compatibility 页"）——该页升级成"Compat&Selection"轴 hub+列表 |
| Mounting & Installation (`mounts`) | 10 | **复用 /guides/mounts/**（保留 URL，仅 relabel）→ 不退役、不加 301 |
| Power & Off-Grid (`power`) | 8 | **复用 /guides/power/**（保留 URL，仅 relabel）→ 不退役、不加 301 |
| Cabling & Networking (`cabling`) | 10 | **新 slug** /guides/cabling/ |
| Weatherproofing & Protection (`protection`) | 7 | **新 slug** /guides/protection/ |
| **OUT（B2B，页留+footer 可达，待 About/B2B 轮）** | 7 | 无菜单项；topic=`business`（不进 nav），页仍 /guides/{slug}/ 活 |
| 排除（dedup 空壳，非真页） | 1 (id91) | — |

**退役（→301，按 A 后预算 81+X<100 决定）**：marine（→场景合集/`/guides/`）、rv-off-grid（同）、industrial（→ B2B/`/guides/`）三个旧 topic 页。mounts/power **不退**（复用）。
**OUT 组 7 篇**：industrial 4359/4378/4379/4380/4381 + marine 64/65 → topic 改 `business`（或保留但移出 nav），页不删。

## 全表（id / 现topic / 新任务 / 理由；⚠=边界待定，M=近重复可合并，B=B2B候选）

### → Compatibility & Selection
- 63 marine → 官方vs第三方对比=选型
- 67 marine → liveaboard 用例选配
- 72 marine → 小艇vs大船对比（M：与74近重复）
- 74 marine → 小艇vs大船（M：与72近重复）
- 76 marine → 应急通信整套 kit 选择
- 86 marine → 远航用例选配
- 87 marine → 商用航运用例选配（⚠B：商用/B2B 味）
- 88 marine → 游艇必备 kit（M：与89/must-have近）
- 89 marine → 渔船连接 kit
- 90 marine → "如何选对"=纯选型
- 25 rv → 全职RV 必备/setup 选型
- 34 rv → "如何选最佳"=选型
- 4356 rv → 2026 最佳 Mini 配件选型
- 4383 rv → Mini RV露营 setup（⚠场景/setup）
- 4358 mounts → **Mount Compatibility Guide**=兼容性（⚠也可归 Mounting）
- 4369 mounts → "哪套 Mounting Kit"=选型（⚠也可归 Mounting）

### → Mounting & Installation
- 75 marine → 定制配件+mounting
- 84 marine → 特种支架
- 85 marine → 安装分步
- 4362 rv → Mini 管式支架安装
- 93 mounts → 工业支架方案（⚠B：工业/B2B 味，但内容是 mounting）
- 4373 mounts → 通用管式支架安装
- 4374 mounts → 平顶安装方案
- 4375 mounts → 墙装vs顶装（⚠也可归 Selection 对比）
- 4376 mounts → 免打孔安装
- 4382 mounts → 三种支架对比（⚠也可归 Selection 对比）

### → Power & Off-Grid
- 79 marine → 船用备电
- 94 rv → RV 12V 配件+兼容（⚠也可归 Selection）
- 4370 rv → 太阳能供电 Mini 12V
- 35 power → RV 供电选项
- 4353 power → Mini 12V 适配器/DC 线
- 4357 power → 选 Mini 12V 适配器
- 4384 power → 电源适配器选购 12V/AC/USB-C（⚠也可归 Selection 选购）
- 92 power → 工业高效电源（⚠B：工业/B2B 味，但内容是 power）

### → Cabling & Networking
- 66 marine → 船用级连接器
- 69 marine → 性能优化/信号增强=连通
- 70 marine → marina WiFi 扩展（总工点名 marina信号扩展→本轴）
- 71 marine → 线缆管理
- 73 marine → 线缆管理（M：与71近重复）
- 78 marine → 石油平台离岸连通用例
- 80 marine → 以太网集成
- 81 marine → 远程监控系统=网络
- 4371 rv → RV 顶棚线缆管理
- 4377 mounts → 接线盒安装=户外线缆管理（⚠也可归 Mounting）

### → Weatherproofing & Protection
- 62 marine → 安全合规标准/认证（⚠也可归 Selection 标准）
- 68 marine → 设备防护
- 77 marine → 维护 5 tips（⚠维护≈保养）
- 82 marine → 耐腐蚀材料
- 83 marine → 高风环境稳信号（⚠信号但角度是天气）
- 721 rv → 安全方案：锁/防护壳
- 4372 rv → 冬季化/低温防护

### → OUT of Guides menu（B2B/OEM，页不删、footer 保留、"待 About/B2B 轮重新安家"）
- 4359 industrial → OEM 采购核验
- 4378 industrial → 批量下单 MOQ/交期
- 4379 industrial → 定制制造 原型→量产
- 4380 industrial → 质控标准
- 4381 industrial → 物流交付
- **⚠B flag（总工定，marine 里的 B2B 篇，是否也移出）**：64 marine（OEM 制造/贴牌）、65 marine（批量采购指南）

### 排除
- 91 marine → title=undefined，是 88 的 dedup 空壳（91→88 已 301），非真内容页，不进 retag。

## 近重复合并候选（总工/Joe 拍，本轮只 retag 不合并）
- 71 ↔ 73（marine cable management 双篇）
- 72 ↔ 74（small vs large vessel 双篇）
- 88 ↔ 89 ↔ 90（must-have/choose 选型多篇，可考虑收敛）

## ⚠ 后续步骤的前置依赖（未做，等总工拍）
- 步3（新建 5 任务列表页 + 退 marine/rv-off-grid/industrial 三 topic 页 301）**依赖 `_redirects` ~100 上限的 A/B 决定**（见另发的既存 bug 上报）：现在 topic-hub 301 已在 pos>100 失效，再加退役 301 只会更挤。必须先定 A（删 59 per-article 腾位）或 B（Bulk Redirects）。
- 场景（Marine/RV·Off-Grid）降级为 /guides/ 首页筛选合集（步4），不进主菜单。
- Compatibility 标签就叫 "Compatibility"（不带 Guide）（步6/Q3）。
