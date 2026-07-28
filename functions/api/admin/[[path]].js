// Admin API — every /api/admin/* is gated by a verified Cloudflare Access JWT.
// Hard gate acceptance: `curl https://wanew.com/api/admin/...` with no Access token => 401.
// Read routes are live now; write/publish (GitHub API + regen) land in the next increment.
import { verifyAccessJwt, deny } from "../../_lib/access-jwt.js";
import { render, genRelated, resolveImg, regenListPage, excerptOf } from "../../_lib/render.js";
import { ghConfig, commitFiles, readFile } from "../../_lib/github.js";

const LIST_CAT = null; // /products/ uses no category filter

// Read the render inputs (template + config + manifest + the axis single sources) straight from
// the repo. render.js is a pure module (no fs) — the Worker reads forms.json/categories.json here
// via the GitHub API and threads them in, so the form-factor slug map has ONE source, not a copy
// baked into this file. Both single sources are required: a missing one is a hard 500, not a
// silent fallback that would let the list-page regen emit empty data-form / wrong chip counts.
async function loadCtx(env, cfg) {
  const [template, siteRaw, manRaw, formsRaw, catsRaw, sizesRaw] = await Promise.all([
    readFile(env, cfg, "data/templates/product.html"),
    readFile(env, cfg, "data/site.json"),
    readFile(env, cfg, "data/products-index.json"),
    readFile(env, cfg, "data/forms.json"),
    readFile(env, cfg, "data/categories.json"),
    readFile(env, cfg, "data/media-sizes.json"),
  ]);
  if (!template || !siteRaw || !formsRaw || !catsRaw) return null;
  const forms = JSON.parse(formsRaw).forms;
  const categories = JSON.parse(catsRaw).categories;
  return {
    template, site: JSON.parse(siteRaw), manifest: manRaw ? JSON.parse(manRaw) : [],
    formNames: forms.map((f) => f.name),                                   // validation whitelist
    catSlugs: categories.map((c) => c.slug),                               // validation whitelist
    formKey: Object.fromEntries(forms.map((f) => [f.name, f.key])),        // bucket name -> data-form slug
    // #8 图片固有尺寸(防 CLS):构建期由 regen 扫磁盘生成 data/media-sizes.json,这里读【同一份】。
    // Worker 读不到磁盘量不出尺寸,但它读得到仓库文件 —— 所以尺寸不必是"谁能读磁盘谁才有"的特权,
    // 两条渲染路径吃同一份事实(和 formKey 同一条路子)。
    // ⚠️ 这一份【可缺】,与 forms/categories 不同:缺了 render 侧查不到就什么都不写,退化成今天的
    //    行为(见 render.js dimAttr);而 forms/categories 缺了会出错页,所以那两个是硬 500。
    sizes: sizesRaw ? JSON.parse(sizesRaw) : undefined,
  };
}

// Persist a product: update manifest, regenerate its detail page + the affected list pages
// (/products/ + new category + old category if it moved), commit everything in one commit.
async function publishProduct(env, cfg, ctx, prod, { isNew, oldCategory, email }) {
  const { template, site } = ctx;
  const thumb = prod.images[0] ? resolveImg(prod.images[0], site.img_base) : "";
  const entry = { id: prod.id, category: prod.category, form: prod.form, title: prod.i18n.en.title, thumb, excerpt: excerptOf(prod) };
  const manifest = ctx.manifest.filter((e) => e.id !== prod.id).concat(entry)
    .sort((a, b) => a.category.localeCompare(b.category) || a.id - b.id);
  const detailHtml = render(prod, { template, imgBase: site.img_base, related: genRelated(entry, manifest), sizes: ctx.sizes });
  const files = [
    { path: `data/products/${prod.id}.json`, content: JSON.stringify(prod, null, 2) },
    { path: `${prod.category}/${prod.id}.html`, content: detailHtml },
    { path: `data/products-index.json`, content: JSON.stringify(manifest, null, 2) },
  ];
  const cats = new Set([LIST_CAT, prod.category]);
  if (oldCategory && oldCategory !== prod.category) cats.add(oldCategory);
  for (const cat of cats) {
    const rel = cat ? `${cat}/index.html` : "products/index.html";
    const h = await readFile(env, cfg, rel);
    if (h) files.push({ path: rel, content: regenListPage(h, manifest, cat, { formKey: ctx.formKey, sizes: ctx.sizes }) });
  }
  return commitFiles(env, cfg, files, `admin: ${isNew ? "create" : "update"} product ${prod.id} (${email})`);
}

// Delete a product: remove its JSON + detail page, drop it from the manifest, and
// regenerate the affected list pages (/products/ + its category) — one atomic commit.
async function unpublishProduct(env, cfg, ctx, id, { email }) {
  const existing = ctx.manifest.find((e) => e.id === id);
  if (!existing) return { notFound: true };
  const category = existing.category;
  const manifest = ctx.manifest.filter((e) => e.id !== id);
  const files = [
    { path: `data/products/${id}.json`, delete: true },
    { path: `${category}/${id}.html`, delete: true },
    { path: `data/products-index.json`, content: JSON.stringify(manifest, null, 2) },
  ];
  for (const cat of new Set([LIST_CAT, category])) {
    const rel = cat ? `${cat}/index.html` : "products/index.html";
    const h = await readFile(env, cfg, rel);
    if (h) files.push({ path: rel, content: regenListPage(h, manifest, cat, { formKey: ctx.formKey, sizes: ctx.sizes }) });
  }
  return commitFiles(env, cfg, files, `admin: delete product ${id} (${email})`);
}

// Validate + normalize an admin-submitted product. Returns {prod} or {error}.
// catSlugs/formNames are the whitelists derived per-request from the categories.json/forms.json
// single sources (see loadCtx) — this function no longer keeps its own hardcoded copy.
function validateProduct(body, id, { catSlugs, formNames }) {
  if (!body || typeof body !== "object") return { error: "body must be an object" };
  // id is authoritative from the caller (URL id for edit, assigned id for create) — not body.
  if (!catSlugs.includes(body.category)) return { error: "invalid category" };
  // form-factor is optional (null/empty = unset); if present it must be a known enum.
  const form = body.form ? String(body.form) : null;
  if (form !== null && !formNames.includes(form)) return { error: "invalid form" };
  const en = body.i18n && body.i18n.en;
  if (!en || typeof en.title !== "string" || !en.title.trim()) return { error: "title required" };
  if (typeof en.description_html !== "string") return { error: "description_html required" };
  if (!Array.isArray(body.images)) return { error: "images must be an array" };
  for (const im of body.images) {
    if (!im || (typeof im.key !== "string" && typeof im.src !== "string")) return { error: "each image needs key or src" };
  }
  // Whitelist the shape we persist — ignore any extra client-sent fields.
  const prod = {
    id, category: body.category, form, robots: body.robots ?? null,
    i18n: { en: {
      title: en.title, summary_html: en.summary_html || "", description_html: en.description_html,
      meta_title: en.meta_title || en.title, meta_description: en.meta_description || "",
    } },
    images: body.images.map((im) => (im.key !== undefined ? { key: im.key, alt: im.alt || "" } : { src: im.src, alt: im.alt || "" })),
    jsonld_product: body.jsonld_product ?? null, jsonld_breadcrumb: body.jsonld_breadcrumb ?? null,
  };
  return { prod };
}

export async function onRequest(context) {
  const { request, env, params } = context;

  // ---- HARD GATE ----
  const auth = await verifyAccessJwt(request, env);
  if (!auth.ok) return deny(auth);

  const path = Array.isArray(params.path) ? params.path : params.path ? [params.path] : [];
  const method = request.method;
  const asset = (p) => env.ASSETS.fetch(new Request(new URL(p, request.url).toString()));

  // GET /api/admin/whoami
  if (method === "GET" && path[0] === "whoami" && path.length === 1) {
    return json({ email: auth.email });
  }

  // GET /api/admin/products  -> lightweight list (from build-time manifest)
  if (method === "GET" && path[0] === "products" && path.length === 1) {
    const res = await asset("/data/products-index.json");
    const list = res.ok ? await res.json() : [];
    return json({ products: list, count: list.length, admin: auth.email });
  }

  // GET /api/admin/products/:id  -> full product JSON
  if (method === "GET" && path[0] === "products" && path.length === 2) {
    const id = path[1].replace(/[^0-9]/g, "");
    if (!id) return json({ error: "bad id" }, 400);
    const res = await asset(`/data/products/${id}.json`);
    if (!res.ok) return json({ error: "not found" }, 404);
    return json(await res.json());
  }

  // POST /api/admin/upload?name=foo.jpg  (raw image body) -> { key } stored in R2 (tejoy-images).
  // The returned key is what a product image entry stores; it resolves via site.json img_base
  // (which becomes https://img.tejoy.com/ once R2 + the custom domain are live).
  if (method === "POST" && path[0] === "upload" && path.length === 1) {
    if (!env.WANEW_IMAGES) return json({ error: "R2 not bound (env.WANEW_IMAGES)" }, 503);
    const url = new URL(request.url);
    const ct = request.headers.get("content-type") || "application/octet-stream";
    const name = url.searchParams.get("name") || "image";
    const ext = (name.split(".").pop() || "").toLowerCase().replace(/[^a-z0-9]/g, "");
    if (!["jpg", "jpeg", "png", "webp", "gif"].includes(ext)) return json({ error: "unsupported image type" }, 400);
    const buf = await request.arrayBuffer();
    if (!buf.byteLength) return json({ error: "empty body" }, 400);
    if (buf.byteLength > 8 * 1024 * 1024) return json({ error: "image exceeds 8MB" }, 413);
    const key = `u_file/uploads/${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}.${ext}`;
    await env.WANEW_IMAGES.put(key, buf, { httpMetadata: { contentType: ct } });
    return json({ ok: true, key });
  }

  // POST /api/admin/products  -> create a new product (assign next id), regen detail + lists.
  if (method === "POST" && path[0] === "products" && path.length === 1) {
    const cfg = ghConfig(env);
    if (!cfg) return json({ error: "GitHub not configured" }, 503);
    let body;
    try { body = await request.json(); } catch { return json({ error: "bad json body" }, 400); }
    const ctx = await loadCtx(env, cfg);
    if (!ctx) return json({ error: "template/config missing" }, 500);
    const newId = ctx.manifest.reduce((m, e) => Math.max(m, e.id), 0) + 1;
    const v = validateProduct(body, newId, ctx);
    if (v.error) return json({ error: v.error }, 400);
    try {
      const r = await publishProduct(env, cfg, ctx, v.prod, { isNew: true, email: auth.email });
      return json({ ok: true, id: newId, ...r, note: "new product created + lists regenerated; deploys in ~1 min" });
    } catch (e) {
      return json({ error: "commit failed", detail: String(e).slice(0, 300) }, 502);
    }
  }

  // PUT /api/admin/products/:id  -> edit an existing product, regen detail + affected lists.
  if (method === "PUT" && path[0] === "products" && path.length === 2) {
    const id = Number(path[1].replace(/\D/g, ""));
    if (!id) return json({ error: "bad id" }, 400);
    const cfg = ghConfig(env);
    if (!cfg) return json({ error: "GitHub not configured" }, 503);
    let body;
    try { body = await request.json(); } catch { return json({ error: "bad json body" }, 400); }
    // loadCtx first: validateProduct needs the categories/forms whitelists it carries.
    const ctx = await loadCtx(env, cfg);
    if (!ctx) return json({ error: "template/config missing" }, 500);
    const v = validateProduct(body, id, ctx);
    if (v.error) return json({ error: v.error }, 400);
    const oldCategory = (ctx.manifest.find((e) => e.id === id) || {}).category;
    try {
      const r = await publishProduct(env, cfg, ctx, v.prod, { isNew: false, oldCategory, email: auth.email });
      return json({ ok: true, ...r, note: "detail + affected lists regenerated; deploys in ~1 min" });
    } catch (e) {
      return json({ error: "commit failed", detail: String(e).slice(0, 300) }, 502);
    }
  }

  // DELETE /api/admin/products/:id  -> remove product, detail page + regen lists.
  if (method === "DELETE" && path[0] === "products" && path.length === 2) {
    const id = Number(path[1].replace(/\D/g, ""));
    if (!id) return json({ error: "bad id" }, 400);
    const cfg = ghConfig(env);
    if (!cfg) return json({ error: "GitHub not configured" }, 503);
    const ctx = await loadCtx(env, cfg);
    if (!ctx) return json({ error: "template/config missing" }, 500);
    try {
      const r = await unpublishProduct(env, cfg, ctx, id, { email: auth.email });
      if (r.notFound) return json({ error: "not found" }, 404);
      return json({ ok: true, ...r, note: "product deleted + lists regenerated; deploys in ~1 min" });
    } catch (e) {
      return json({ error: "delete failed", detail: String(e).slice(0, 300) }, 502);
    }
  }

  return json({ error: "not found" }, 404);
}

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj, null, 2), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });
}
