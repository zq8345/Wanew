// P2 product-data SEO fixes (audit): applied to data/products/*.json.
//  M2  remove the JSON-LD Product `offers` block — it has no price/priceCurrency
//      (we are inquiry/quote-only), so an offers node is invalid → GSC "Missing field price".
//  L5  brand.name "wanew" → "Wanew" in the Product JSON-LD.
//  M4  meta_description clean-truncate: never end mid-word; prefer last sentence boundary.
// jsonld_product is stored as a STRING (escaped Product schema) inside each product JSON.
import fs from "fs";
const dir = "data/products";

function cleanMeta(m) {
  if (!m) return m;
  const s0 = m.trim();
  if (/[.!?]["']?$/.test(s0)) return s0;                     // already ends on terminal punctuation
  const lastStop = Math.max(s0.lastIndexOf(". "), s0.lastIndexOf("! "), s0.lastIndexOf("? "));
  if (lastStop >= 120) return s0.slice(0, lastStop + 1).trim();   // cut to last full sentence
  const lastSp = s0.lastIndexOf(" ");                        // else drop the trailing partial word
  return (lastSp > 0 ? s0.slice(0, lastSp) : s0).replace(/[,;:\s]+$/, "").trim();
}

let files = 0, nOffers = 0, nBrand = 0, nMeta = 0;
for (const f of fs.readdirSync(dir)) {
  if (!f.endsWith(".json")) continue;
  const p = `${dir}/${f}`;
  const d = JSON.parse(fs.readFileSync(p, "utf8"));
  let changed = false;
  if (typeof d.jsonld_product === "string") {
    let j = d.jsonld_product;
    const before = j;
    j = j.replace(/,\s*"offers"\s*:\s*\{[^{}]*\}/, "");                       // M2
    if (j !== before) nOffers++;
    const b2 = j;
    j = j.replace(/("brand"\s*:\s*\{[^}]*?"name"\s*:\s*)"wanew"/, `$1"Wanew"`); // L5
    if (j !== b2) nBrand++;
    if (j !== d.jsonld_product) { d.jsonld_product = j; changed = true; }
  }
  if (d.i18n) {
    for (const loc of Object.keys(d.i18n)) {
      const m = d.i18n[loc] && d.i18n[loc].meta_description;
      if (m) { const c = cleanMeta(m); if (c !== m) { d.i18n[loc].meta_description = c; nMeta++; changed = true; } }  // M4
    }
  }
  if (changed) { fs.writeFileSync(p, JSON.stringify(d, null, 2) + "\n"); files++; }
}
console.log(`products touched ${files} | M2 offers removed ${nOffers} | L5 brand fixed ${nBrand} | M4 meta cleaned ${nMeta}`);
