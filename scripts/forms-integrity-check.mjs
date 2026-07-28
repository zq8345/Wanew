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

const formNames = new Set(forms.map((f) => f.name));
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
    formCount[e.form] = (formCount[e.form] || 0) + 1;
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
const formLines = forms.map((f) => `  ${f.key} (${f.name}): ${formCount[f.name] || 0}`);
const catLines = cats.map((c) => `  ${c.slug}: ${catCount[c.slug] || 0}`);
console.log(`forms-integrity-check PASS — ${manifest.length} products, all forms ∈ forms.json, all categories ∈ categories.json.`);
console.log("form-factor live counts (delete blocked while >0):\n" + formLines.join("\n"));
console.log("category live counts (delete blocked while >0):\n" + catLines.join("\n"));
