# 分类增删机制 —— 交 Admin 的契约文档（#52 block 3）

**范围**：官网 wanew.com 侧的「机型（model）增删」与「形态（form-factor）增删排序」机制契约，供 Admin（admin.wanew.com / wanew-admin 仓）实现其管理端点时对接。
**对应**：block 1（机型从零建页机制，`533002f4`）+ block 2（forms.json 单源，`aba6c47e` commit-local）。
**两条轴是正交的**：一个产品同时有一个 `category`（机型 slug，走 `/{slug}/`）和一个可选 `form`（形态 bucket，走 `/type/{key}/`）。别混。

---

## 0. 一句话分工

| 事 | 数据在哪（单源） | 谁写数据 | 谁生成页面 |
|---|---|---|---|
| 机型 增/删 | `data/categories.json` + `data/locales.json` model_display + `data/pages/home-tiles.json` | Admin（GitHub commit 通道） | **官网 build**（`regen.mjs`，见 §2） |
| 形态 增/删/排序/改显示名 | `data/forms.json` | Admin（GitHub commit 通道） | **官网 build**（`regen.mjs` + `chrome-sync.mjs`） |
| 产品 增/删/改 | `data/products/*.json` + `data/products-index.json` | Admin 端点（已在产：POST/PUT/DELETE `/api/admin/products`） | 端点运行时自建（`regenListPage` at edge） |

**关键差别**：产品 CRUD 端点在 CF edge 运行时就能重建受影响的列表页（`regenListPage` 打补丁到已存在 HTML）。但**新机型/新形态的页面是从零生成的，靠 `scripts/regen.mjs`（读模板/参考页，需 fs），edge 运行时跑不了** —— 必须过一次官网 build。见 §2。

---

## 1. ⚠️ 官网 build 管线现状（写端点前必读）

- 官网**没有 CI / 没有 package.json build**。CF Pages = **直接静态托管仓库里已提交的文件**（含 `functions/` 作 Pages Functions）。
- `scripts/regen.mjs`（建/刷页面）+ `scripts/chrome-sync.mjs --write`（同步导航/计数）是**本地 build 脚本**，产出的 built HTML **是提交进仓的产物**。今天由**官网窗**（本窗）在数据变更后本地跑一次并提交。
- 含义：**Admin 只 commit 数据单源（categories.json / forms.json / …）还不够** —— 新机型/新形态的页面要等一次官网 build 才会出现。产品 CRUD 不受此限（端点自己在 edge 重建已存在列表页）。

**近期建议流程（~0 用户，别过度自动化）**：
> Admin 端点 commit 数据单源 → 通知官网窗（走总工）→ 官网窗跑 `node scripts/regen.mjs && node scripts/chrome-sync.mjs --write` → 提交 built 页 → push。

**开放问题（请 Admin 拍）**：是否要给 build 加个触发器（GitHub Action / 官网 Function 里做个 rebuild 路由）做到机型/形态自助生效？今天没有，也不阻塞（小规模手动 build 够用）。

---

## 2. 加机型（model）

**Admin 写这三个文件（都走 GitHub commit 通道，已建立）**：

1. `data/categories.json` —— 追加一条（顺序 = 列表页/首页瓦片顺序）：
   ```json
   { "slug": "new-model", "display": "New Model" }
   ```
   - `slug` = URL 段（`/new-model/`），小写连字符，**新 slug = 新 URL，不破坏现有 = 安全**。
   - `display` = 兜底显示名。

2. `data/locales.json` 的 `model_display` —— 追加同 slug（**必填**：列表页标题派生用的是 `MODEL[slug]`；缺了 `listTitleOf` 返 null → 新页会**沿用被播种的参考机型的标题**（如误显示成 `Mini-Wanew…`），不是崩、但是错标题）：
   ```json
   "new-model": "New Model"
   ```
   - 机型名是品牌词、不翻译，四语共用这一个值。

3. `data/pages/home-tiles.json` —— 若要进首页「Shop by model」瓦片，追加一条**带干净图**（首页瓦片是**策展**的，不是自动全量；存在性只做过滤）：
   ```json
   { "cat": "new-model", "img": "/static/upload/image/…/clean.png" }
   ```
   - 🔴 **图片红线**：用干净自有资产或品类图,**别用带旧品牌残留的扒来图**（4209/LincooStar 那种，Joe 铁令）。
   - 不进 tile 也可以（机型页照样能从 nav/列表访问）。

**然后官网 build**（§1 流程）会：
- 从**参考现存机型页**播种出 `/{slug}/index.html` + `es/pt/zh` 三语（block 1 机制，zh 从 en 播种 + noindex 自处理）；
- 用 `regenListPage` 按新 category 重写卡片网格/banner/标题；
- 新机型**无产品时 = 空 grid**（产品由 Admin 按 `category` 归入后自动填卡）。

**Admin 端点契约**：加机型端点 = 校验 slug 合法（`^[a-z0-9-]+$`、不与现有重复）→ commit 上述文件 → 通知触发 build。**不要**在端点里试图 edge 生成机型页（生成不了，需 fs）。

---

## 3. 加 / 删 / 排序 / 改显示名 形态（form-factor）

**唯一真源 = `data/forms.json`**（block 2 定；结构见文件内 `_note`）：
```json
{ "forms": [ { "key": "cables", "name": "Cables" }, … ] }
```
- `key` = URL/data-form slug（`/type/{key}/` + 卡片 `data-form`）。
- `name` = 存在每个产品 `form` 字段上的 bucket 显示名（校验白名单也用它）。
- **数组顺序 = /type 页顺序 = chip 顺序**。

| 操作 | 怎么做 | 安全性 |
|---|---|---|
| **加**形态 | 追加 `{key,name}`（新 key = 新 `/type/{key}/` URL） | 安全 |
| **排序** | 重排数组 | 安全（只改 chip/页顺序） |
| **改显示名** | 改某条的 `name`（同时把所有引用该形态的产品 `form` 字段一起改成新 `name`，否则会成孤儿——见 §4 闸） | 需连带改产品数据 |
| **删**形态 | 删掉那条 | ⚠️ **守卫**：见 §4 |
| **改 key（slug 改名）** | ❌ **一期不做** —— 会改 `/type/{key}/` URL（破坏外链/SEO） | 禁 |

**消费点**（Admin 无需动，列此说明 forms.json 影响面）：`regen.mjs`(TYPES+FORM_KEY) / `render.js`(穿参 formKey) / `chrome.js`(nav 计数) / `functions/api/admin/[[path]].js`(产品校验白名单 + 列表页重建)。

---

## 4. 守卫规则（删安全 = count>0 拒删）

**两半，缺一不可**：

1. **运行时那半 = Admin 端点的活（请实现）**：机型/形态的**删端点**在执行前必须查「该 slug/form 当前被多少产品引用」，**count>0 → 拒删并返回该数**。
   - 机型：`products-index.json` 里 `entry.category === slug` 的条数。
   - 形态：`products-index.json` 里 `entry.form === name` 的条数。
   - 参考本仓 `functions/api/admin/[[path]].js` 已有 `loadCtx`（经 GitHub API 读 `products-index.json`）可复用同款计数。

2. **build-time 那半 = 官网仓已建（`scripts/forms-integrity-check.mjs`）**：任何产品引用了 `forms.json`/`categories.json` 里已不存在的 form/category → **build FAIL**。这是最后一道网：就算数据被绕过手改，官网 build 也会拒绝出破页。
   ```
   node scripts/forms-integrity-check.mjs   # PASS/FAIL + 每 form/category 的 live 计数
   ```
   建议纳入 push 前闸套。

**为什么要守卫**：删掉一个仍有产品的 form/category，那些产品会**静默从 `/type/` 或 `/{category}/` 页消失**、卡片 `data-form` 变空 —— 守卫把「静默丢」变成「响亮拒」。

---

## 5. 一期不做（out of scope）

- **slug/key 改名**（机型 `/{slug}/` 或形态 `/type/{key}/` 的 URL 段）—— 会破坏现有 URL，需配 301 迁移，单开一期。本期只做：**加 / 排序 / 改显示名 / 带守卫删**。

---

## 6. 部署联动依赖（block 2 = `aba6c47e`，待 push）

- block 2 后，`functions/api/admin/[[path]].js` 的 `loadCtx` **要求** `data/forms.json` + `data/categories.json` 存在（读不到 → 500）。两文件都在同一 commit 里，**一起部署即可**，无时序问题。
- ⚠️ **跨仓 re-vendor**：block 2 改了 `functions/_lib/chrome.js` `makeChrome` 签名（新增 `forms` 参）。wanew-admin 若 vendor 了 chrome.js/render.js，**push 后需 re-vendor 并在调 makeChrome 时传 `forms`**（否则其 nav 计数全 0，不崩但错）。请先核 admin-worker 运行时是否真调 makeChrome。
- ⚠️ block 2 动了 `loadCtx`/`validateProduct`（产品 CRUD 共用），与 Admin 在途修的「/api/admin 分类页 Failed to fetch」可能同面 —— push 前对齐别撞车。**我全程没碰 `/models`、`/categories` 路由**（本仓 Function 只有 product CRUD）。

---

## 7. 快速自检清单（Admin 实现端点后）

- [ ] 加机型：commit 三文件 → 官网 build → `curl -sI https://wanew.com/new-model/` = 200；`/es/new-model/`、`/pt/new-model/` = 200；`/zh/new-model/` = 200 且 noindex。
- [ ] 加形态：forms.json 追加 → build → `curl -sI https://wanew.com/type/new-key/` = 200；某机型页 form chip 出现新项且计数对。
- [ ] 删守卫：对一个 count>0 的机型/形态调删端点 → 返回拒绝 + 该 count；`node scripts/forms-integrity-check.mjs` = PASS（因为没真删成）。
- [ ] 改显示名：改 forms.json `name` + 连带改产品 `form` → build → integrity 闸 PASS、chip 标签变、`/type/{key}/` URL 不变。
