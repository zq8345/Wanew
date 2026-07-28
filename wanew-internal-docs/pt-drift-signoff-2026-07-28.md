# pt 译法漂移 —— 待拍清单(5 处)

**背景**:#69 审计发现「es 有术语闸、pt 漂了没有任何东西会响」。现建 `scripts/pt-drift-check.mjs`,
**只判一件能自证的事**:同一个 en 串在站上被翻成了多种 pt-BR。

🔴 **我没有替这 5 条做决定。** 定 pt 术语 = 定标准,那要人签字(es 那份 glossary 是逐条带 evidence 签过的,
pt 没有对等物)。下面每条给出**事实 + 两个选项**,请总工/Joe 拍。

---

## 为什么现有的 `reason` 不能直接放行这 5 条

这 5 处**全都已经带 `reason`** —— 但那些 reason 是写给 `catalog-dupe-check` 的,回答的是
**「同一个 en 串为什么允许存成两个 key」**;而这里的问题是
**「这两个 key 为什么可以翻得不一样」** —— **是两个问题**。

拿回答 A 的豁免去放行 B,闸就永远绿。所以本闸用**自己的**豁免字段 `reason.pt-drift`。
(这条本身就是今天反复出现的那个教训:**容错会吃掉错误信号,豁免机制也会**。)

---

## 逐条

### 1. `Off-Grid` → `Off-grid` / `Off-Grid`
| key | pt |
|---|---|
| `chrome:header.scene.offgrid` | `Off-grid` |
| `solutions:solutions.off-grid.name` | `Off-Grid` |

**这条我判它是真漂移,没有角色理由** —— 同一个借词、同一个意思,**只差一个大写字母**。
→ 建议:**统一**(二选一即可,我倾向 `Off-Grid`,与英文原写法一致)。这条几乎不需要讨论,只需要有人点头。

### 2. `Home` → `Início` / `Casa`
| key | pt |
|---|---|
| `chrome:header.home` | `Início` |
| `chrome:header.scene.home_roof` | `Casa` |
| `solutions:solutions.home.name` | `Casa` |

**看起来是合理的角色差异**:导航里的 "Home" = 网站首页 → `Início`;场景名 "Home" = 住宅场景 → `Casa`。
→ 建议:**保留两种,给三个 key 都加 `reason.pt-drift` 写明角色**。(需要人确认这个理解对。)

### 3. `Marine` → `Náutico` / `Náutica`
| key | pt |
|---|---|
| `chrome:header.marine` | `Náutico` |
| `solutions:solutions.marine.name` | `Náutica` |

**阴阳性不一致**。可能是语法驱动(修饰的名词性别不同),也可能是单纯没统一。
→ **需要葡语母语者判**:如果两处都是独立标签(不修饰具体名词),应统一;如果确实随上下文变性,加 reason。
**我不判语法,这条必须人看。**

### 4. `About Us` → `Sobre Nós` / `Sobre` / `Sobre a Wanew`
| key | pt |
|---|---|
| `about:about.page-header-title.1` | `Sobre Nós` |
| `about:about.ld.name.3` | `Sobre` |
| `home:home.about.eyebrow` | `Sobre a Wanew` |

**三种写法**。其中 `about.ld.name.3` 是 JSON-LD 里的名称、`home.about.eyebrow` 是首页眉题 ——
**用途不同,长短不同是合理的**;但三种并存仍值得确认是有意还是随手。
→ 建议:确认后给每个 key 加 `reason.pt-drift`,或统一其中两个。

### 5. `Contact Us` → `Fale conosco` / `Contato`
| key | pt |
|---|---|
| `about:about.span.1` | `Fale conosco` |
| `contact:contact.page-header-title.1` | `Contato` |
| `contact:contact.ld.name.3` | `Contato` |

`Fale conosco`(动词短语,像按钮/链接) vs `Contato`(名词,像页面标题) —— **很可能是有意的**。
→ 建议:确认后加 `reason.pt-drift`。

---

## 拍完之后我做什么

- 判"统一"的 → 我改数据、重跑、验。
- 判"合理共存"的 → 我给**每一个**参与的 key 加 `reason.pt-drift`(只加一半等于没解决,闸也是这么判的)。
- 5 条全部落地后 → 把 `pt-drift-check` 从 report 模式切成 `--strict` 并进 push 前闸套。

**现在它是 report 模式(exit 0)是有意的**:一上来就红的门,最后会被所有人略过 —— 这正是这次审计
在 `pt-leak-scan` 上得出的结论,不能自己又造一个。

---

## 仍然没有被任何闸覆盖的(如实列)

- **译得对不对**:一个 en 全站只有一种 pt 译法、但那个译法本身错了 → 本闸全绿。
- **读感 / 地道度**:没有自动手段。
- **pt-PT(欧葡)用词混入**:需要一份签过字的 pt-BR 术语表,**目前没有**。
  → 这是 pt 与 es 之间**剩下的最大不对称**。要补,得先有人定表,我不自己发明。
