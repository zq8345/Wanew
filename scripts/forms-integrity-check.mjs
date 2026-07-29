// forms-integrity-check — the build-time half of the category/form "delete guard".
//
// Single sources: data/forms.json (form-factor axis) + data/categories.json (model axis).
// This gate refuses to pass if any live product references a form or category that those
// single sources no longer contain. That is exactly what makes a *delete* safe: you cannot
// drop "Cables" from forms.json (or "mini" from categories.json) while products still carry
// it — the orphaned products would silently vanish from their /type/ or /{category}/ page and
// render with an empty data-form. Here that becomes a loud FAIL instead of a silent drop.
//
// The matching *runtime* guard (reject the DELETE request when count>0) lives on the Admin
// repo's form/category delete endpoints — see the Part-3 contract. This is the repo-side rail.
//
// Exit 1 on any orphan; exit 0 when every product's form ∈ forms.json and category ∈ categories.json.
import fs from "fs";

const read = (p) => JSON.parse(fs.readFileSync(p, "utf8"));

const forms = read("data/forms.json").forms;
const cats = read("data/categories.json").categories;
const manifest = read("data/products-index.json");

/* 🔴 C 步 1:读取侧【显示名与 key 两者都认】。
   产品数据里 `form` 存的是显示名当外键 —— 改一个显示名就要重写上百个文件。
   根治是改成存 key,而这一步是"读取侧先能同时认",admin 才敢动数据。
   ⚠️ 顺序不可颠倒:这一步没上线就迁移,线上按显示名匹配全部落空,产品从 /type/ 页整批消失。
   ⚠️ 这里认两种【不是】放松校验 —— 第三种(既不是 name 也不是 key)照样报孤儿。 */
const formNames = new Set(forms.flatMap((f) => [f.name, f.key]));
const FORM_KEY = Object.fromEntries(forms.flatMap((f) => [[f.name, f.key], [f.key, f.key]]));
const catSlugs = new Set(cats.map((c) => c.slug));

// Count live products per form / per category (the "count>0 ⇒ can't delete" measure).
const formCount = {}, catCount = {};
const orphanForms = new Map();   // form name -> [ids]
const orphanCats = new Map();    // category slug -> [ids]

for (const e of manifest) {
  if (e.category) {
    catCount[e.category] = (catCount[e.category] || 0) + 1;
    if (!catSlugs.has(e.category)) push(orphanCats, e.category, e.id);
  }
  // form is optional on a product (null/unset is allowed); only validate when present.
  if (e.form) {
    /* 🔴 累加时就归一成 key,而不是把原始值当桶名。
       原来这里按 `e.form` 原样累加、下面按 `f.name` 取 —— 迁移后数据里只有 key,
       于是**每个品类都取到 undefined,打印 0**。而它印出来的正好是
       "这个品类可以删"的那个数字:**闸是绿的,同时输出一个反过来的事实。**
       ⚠️ 修在累加处而不是取值处,是因为取值处修只能得到"迁移后对";
       归一化让它**迁移前后都对**,而兼容期里写成显示名的产品也不会从计数里消失
       ——那种产品既不进任何桶、又因为孤儿判定收两种而不报警,会落进两条检查中间的缝。 */
    const fk = FORM_KEY[e.form] || e.form;
    formCount[fk] = (formCount[fk] || 0) + 1;
    if (!formNames.has(e.form)) push(orphanForms, e.form, e.id);
  }
}

function push(map, key, id) {
  if (!map.has(key)) map.set(key, []);
  map.get(key).push(id);
}

const problems = [];
for (const [name, ids] of orphanForms) problems.push(`  ✗ form "${name}" is on ${ids.length} product(s) [${ids.join(", ")}] but is NOT in data/forms.json`);
for (const [slug, ids] of orphanCats) problems.push(`  ✗ category "${slug}" is on ${ids.length} product(s) [${ids.join(", ")}] but is NOT in data/categories.json`);

if (problems.length) {
  console.error("forms-integrity-check FAIL — orphaned product references (a form/category was removed while products still use it):");
  console.error(problems.join("\n"));
  console.error("\nFix: re-add the form/category to its single source, OR move/delete the products off it first.");
  process.exit(1);
}

// Passing summary: every form's live count (this is the number a delete endpoint must refuse on).
const formLines = forms.map((f) => `  ${f.key} (${f.name}): ${formCount[f.key] || 0}`);
const catLines = cats.map((c) => `  ${c.slug}: ${catCount[c.slug] || 0}`);
console.log(`forms-integrity-check PASS — ${manifest.length} products, all forms ∈ forms.json, all categories ∈ categories.json.`);
console.log("form-factor live counts (delete blocked while >0):\n" + formLines.join("\n"));
console.log("category live counts (delete blocked while >0):\n" + catLines.join("\n"));
