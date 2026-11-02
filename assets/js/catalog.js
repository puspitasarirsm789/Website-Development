/* =====================================================================
   catalog.js — Render data produk: beranda, katalog, detail, kreator-link.
   ---------------------------------------------------------------------
   Sumber data: data/products.json + data/categories.json + data/divisions.json
   + data/creators.json (semua via fetchJSON cache-busting).
   Tidak ada logika keranjang di sini — menambah item meminta cart.js.
   ===================================================================== */

import { STORAGE_KEYS, storageGet, fetchJSON, formatRupiah, escapeHTML, queryParam, qs, qsa, clearChildren, showToast } from "./utils.js";

let categoriesMap = new Map();
let productsData = [];

/* ------------------------------------------------------------------
   Util katalog.
   ------------------------------------------------------------------ */
function totalStock(product) {
  return (product.variants ?? []).reduce((sum, variant) => sum + (Number(variant.stock) || 0), 0);
}

function isActive(product) {
  return product.is_active !== false;
}

function categoryName(id) {
  return categoriesMap.get(id)?.name ?? ({ "kaos": "Kaos", "hoodie": "Hoodie", "topi": "Topi", "aksesoris": "Aksesoris", "stiker": "Stiker" }[id] ?? id);
}

function skeletonGrid(count) {
  return Array.from({ length: count })
    .map(() => '<div class="skeleton skeleton--card"></div>')
    .join("");
}

async function loadCatalogData() {
  if (productsData.length > 0) return;
  const [products, categories] = await Promise.all([
    fetchJSON("./data/products.json", { defaultValue: null }),
    fetchJSON("./data/categories.json", { defaultValue: null }),
  ]);
  productsData = Array.isArray(products) ? products.filter(isActive) : [];
  categoriesMap = new Map((categories ?? []).map((category) => [category.id, category]));
}

function productCardHTML(product) {
  const stok = totalStock(product);
  const hapus = stok === 0;
  return `
    <article class="card card-product">
      <a class="card-product__link" href="./produk.html?id=${encodeURIComponent(product.id)}">
        <img class="card-product__image" src="${escapeHTML(product.image)}" alt="Ilustrasi ${escapeHTML(product.name)}" loading="lazy" width="${product.image_width ?? 800}" height="${product.image_height ?? 800}">
        <div class="card-product__body">
          <p class="card-product__category">${escapeHTML(categoryName(product.category_id))}</p>
          <h3 class="card-product__title">${escapeHTML(product.name)}</h3>
          <p class="card-product__desc">${escapeHTML(product.description)}</p>
        </div>
        <div class="card-product__footer">
          <span class="card-product__price">${formatRupiah(product.price)}</span>
          ${hapus ? '<span class="badge badge-danger">Stok Habis</span>' : '<span class="badge badge-success">Tersedia</span>'}
        </div>
      </a>
    </article>
  `;
}

function renderGrid(target, products, emptyMessage) {
  clearChildren(target);
  if (products.length === 0) {
    target.innerHTML = `
      <div class="empty-state">
        <p class="empty-state__title">${escapeHTML(emptyMessage ?? "Belum ada produk.")}</p>
        <p class="empty-state__desc">Coba ubah kata kunci pencarian atau filter kategori.</p>
      </div>
    `;
    return;
  }
  target.innerHTML = products.map(productCardHTML).join("");
}

/* ==================================================================
   Beranda: kategori unggulan, produk pilihan, prestasi divisi DSC.
   ================================================================== */
export async function initHome() {
  await loadCatalogData();

  const featuredTarget = document.getElementById("featured-products");
  if (featuredTarget) {
    featuredTarget.innerHTML = skeletonGrid(4);
    const available = productsData
      .filter((product) => totalStock(product) > 0)
      .sort((a, b) => Number(b.price) - Number(a.price))
      .slice(0, 4);
    setTimeout(() => renderGrid(featuredTarget, available, "Belum ada produk tersedia."), 120);
  }

  const categoryTarget = document.getElementById("home-categories");
  if (categoryTarget) {
    categoryTarget.innerHTML = Array.from(categoriesMap.values())
      .map(
        (category) => `
        <a class="btn btn-outline" href="./katalog.html?kategori=${encodeURIComponent(category.id)}">
          <span aria-hidden="true">${escapeHTML(category.emoji ?? "")}</span> ${escapeHTML(category.name)}
        </a>
      `
      )
      .join("");
  }

  const divisionsTarget = document.getElementById("home-divisions");
  if (divisionsTarget) {
    const divisions = await fetchJSON("./data/divisions.json", { defaultValue: null });
    clearChildren(divisionsTarget);
    if (Array.isArray(divisions) && divisions.length > 0) {
      divisionsTarget.innerHTML = divisions
        .map(
          (division) => `
          <article class="card">
            <div class="card-product__body">
              <p class="card-product__category">${escapeHTML(slugToLabel(division.id))}</p>
              <h3 class="heading-3">${escapeHTML(division.name)}</h3>
              <p class="card-product__desc">${escapeHTML(division.description)}</p>
            </div>
          </article>
        `
        )
        .join("");
    }
  }
}

function slugToLabel(divisionId) {
  const map = { "div-akademik": "Divisi Akademik", "div-olahraga": "Divisi Olahraga", "div-seni-budaya": "Divisi Seni Budaya", "div-kewirausahaan": "Divisi Kewirausahaan", "div-lingkungan": "Divisi Lingkungan", "div-humas": "Divisi Hubungan Masyarakat" };
  return map[divisionId] ?? divisionId;
}

/* ==================================================================
   Katalog: pencarian, filter kategori, urutan harga.
   ================================================================== */
export async function initKatalog() {
  await loadCatalogData();

  const tagsTarget = document.getElementById("kategori-tags");
  if (tagsTarget) {
    const initialCategory = queryParam("kategori") ?? "semua";
    tagsTarget.innerHTML = [
      { id: "semua", name: "Semua", emoji: "🛍️" },
      ...categoriesMap.values(),
    ]
      .map(
        (category) => `
        <button type="button" class="tag" data-kategori="${escapeHTML(category.id)}"
          aria-pressed="${category.id === initialCategory ? "true" : "false"}">
          <span aria-hidden="true">${escapeHTML(category.emoji ?? "")}</span> ${escapeHTML(category.name)}
        </button>
      `
      )
      .join("");
  }

  const grid = document.getElementById("product-grid");
  if (!grid) return;
  grid.innerHTML = skeletonGrid(6);

  const searchInput = document.getElementById("katalog-search");
  const sortSelect = document.getElementById("katalog-sort");
  const emptyAlert = document.getElementById("katalog-empty");

  if (searchInput && queryParam("q")) {
    searchInput.value = queryParam("q");
  }

  const applyFilter = () => {
    const keyword = (searchInput?.value ?? "").trim().toLowerCase();
    const activeTag = qsa("#kategori-tags .tag").find((tag) => tag.getAttribute("aria-pressed") === "true");
    const category = activeTag?.getAttribute("data-kategori") ?? "semua";
    const sort = sortSelect?.value ?? "relevan";

    let items = productsData.filter((product) => {
      const matchCategory = category === "semua" || product.category_id === category;
      const haystack = [product.name, product.description, categoryName(product.category_id)]
        .join(" ")
        .toLowerCase();
      const matchKeyword = keyword === "" || haystack.includes(keyword);
      return matchCategory && matchKeyword;
    });

    if (sort === "harga-naik") items = [...items].sort((a, b) => a.price - b.price);
    if (sort === "harga-turun") items = [...items].sort((a, b) => b.price - a.price);
    if (sort === "stok") items = [...items].sort((a, b) => totalStock(b) - totalStock(a));

    renderGrid(grid, items, "Produk tidak ditemukan.");
    if (emptyAlert) {
      if (items.length === 0) {
        emptyAlert.removeAttribute("hidden");
      } else {
        emptyAlert.setAttribute("hidden", "");
      }
    }
  };

  if (tagsTarget) {
    tagsTarget.addEventListener("click", (event) => {
      const button = event.target.closest("button.tag");
      if (!button) return;
      qsa("#kategori-tags .tag").forEach((tag) => tag.setAttribute("aria-pressed", "false"));
      button.setAttribute("aria-pressed", "true");
      applyFilter();
    });
  }
  searchInput?.addEventListener("input", applyFilter);
  sortSelect?.addEventListener("change", applyFilter);

  applyFilter();
}

/* ==================================================================
   Detail produk (produk.html?id=…): galeri, pilih varian, qty, tambah.
   ================================================================== */
export async function initDetailProduk() {
  const target = document.getElementById("product-detail");
  if (!target) return;
  await loadCatalogData();

  target.innerHTML = Array.from({ length: 2 })
    .map(() => '<div class="skeleton skeleton--card"></div>')
    .join("");

  const requestedId = queryParam("id");
  const product = productsData.find((item) => item.id === requestedId);
  clearChildren(target);

  if (!product) {
    target.innerHTML = `
      <div class="empty-state">
        <p class="empty-state__title">Produk tidak ditemukan.</p>
        <p class="empty-state__desc"><a class="btn btn-primary" href="./katalog.html">Kembali ke katalog</a></p>
      </div>
    `;
    return;
  }

  const stok = totalStock(product);
  const hapus = stok === 0;
  const variants = product.variants ?? [];

  target.innerHTML = `
    <article class="detail-layout">
      <img class="card-product__image" src="${escapeHTML(product.image)}" alt="Ilustrasi ${escapeHTML(product.name)}" loading="lazy" width="${product.image_width ?? 800}" height="${product.image_height ?? 800}">
      <div class="stack">
        <p class="card-product__category">${escapeHTML(categoryName(product.category_id))}</p>
        <div class="cluster cluster--between">
          <h1 class="heading-2">${escapeHTML(product.name)}</h1>
          ${hapus ? '<span class="badge badge-danger">Stok Habis</span>' : '<span class="badge badge-success">Tersedia</span>'}
        </div>
        <p class="text-lg">Desainer: ${escapeHTML(product.creator_id)}</p>
        <p class="price-lg">${formatRupiah(product.price)}</p>
        <p>${escapeHTML(product.description)}</p>

        ${hapus ? '<div class="alert alert-warning" role="note">Stok habis. Cek kembali di estafet produksi berikutnya ya.</div>' : `
        <form id="add-to-cart-form" class="stack" novalidate>
          <div class="form-group">
            <label class="label" for="variant-select">${variants.length > 1 ? "Pilih varian" : "Varian"}</label>
            <select class="select" id="variant-select" name="variant" required>
              ${variants.map((variant) => `<option value="${escapeHTML(variant.name)}">${escapeHTML(variant.name)} · stok ${variant.stock}</option>`).join("")}
            </select>
          </div>
          <div class="form-group">
            <span class="label" id="qty-label">Jumlah</span>
            <div class="qty-group" role="group" aria-labelledby="qty-label">
              <button type="button" id="qty-minus" aria-label="Kurangi jumlah">&minus;</button>
              <input class="input" id="qty-input" name="qty" type="number" inputmode="numeric" min="1" max="1" value="1" aria-describedby="qty-hint">
              <button type="button" id="qty-plus" aria-label="Tambah jumlah">+</button>
            </div>
            <p class="form-hint" id="qty-hint">Maksimal stok varian terpilih.</p>
          </div>
          <button class="btn btn-accent btn-lg" type="submit">Tambah ke keranjang</button>
          <p class="form-hint">Setelah selesai memilih, lanjut ke <a href="./keranjang.html">keranjang</a> untuk checkout.</p>
        </form>
        `}
      </div>
    </article>
  `;

  if (product.creator_id) {
    const creators = await fetchJSON("./data/creators.json", { defaultValue: null });
    const creator = (creators ?? []).find((item) => item.id === product.creator_id);
    if (creator) {
      const creatorParagraph = target.querySelector(".text-lg");
      if (creatorParagraph && creatorParagraph.textContent.includes(product.creator_id)) {
        creatorParagraph.innerHTML = `Desainer: <a href="./kreator.html">${escapeHTML(creator.name)}</a> (${escapeHTML(creator.class_name ?? "")})`;
      }
    }
  }

  if (product.variants === undefined || hapus) {
    return;
  }

  const selectedVariants = () => {
    const select = document.getElementById("variant-select");
    const name = select?.value ?? variants[0]?.name;
    const variant = variants.find((item) => item.name === name) ?? variants[0];
    return variant;
  };

  const qtyInput = document.getElementById("qty-input");
  const updateMax = () => {
    const variant = selectedVariants();
    const max = Math.max(Number(variant?.stock) || 0, 1);
    qtyInput.max = String(max);
    if (Number(qtyInput.value) > max) qtyInput.value = String(max);
    if (Number(qtyInput.value) < 1) qtyInput.value = "1";
  };

  document.getElementById("qty-minus")?.addEventListener("click", () => {
    qtyInput.value = String(Math.max(Number(qtyInput.value) - 1, 1));
    updateMax();
  });
  document.getElementById("qty-plus")?.addEventListener("click", () => {
    const max = Math.max(Number(selectedVariants()?.stock) || 1, 1);
    qtyInput.value = String(Math.min(Number(qtyInput.value) + 1, max));
  });
  document.getElementById("variant-select")?.addEventListener("change", updateMax);

  document.getElementById("add-to-cart-form")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const variant = selectedVariants();
    if (!variant || (Number(variant.stock) || 0) <= 0) {
      showToast("Varian stoknya kosong, mohon pilih varian lain.", { type: "warning" });
      return;
    }
    const qty = Math.min(Number(qtyInput.value) || 1, Number(variant.stock));
    const { addItemToCart } = await import("./cart.js");
    addItemToCart(
      {
        product_id: product.id,
        name: product.name,
        image: product.image,
        price: Number(product.price),
      },
      variant.name,
      qty
    );
    showToast(`${product.name} (${variant.name}) masuk keranjang.`, { type: "success" });
  });
}

/* ==================================================================
   Kreator (kreator.html) — dipanggil dari app.js (render sederhana).
   ================================================================== */
export async function initKreatorGrid(target) {
  /* Dipesankan oleh app.js yang sudah punya daftar kreatornya sendiri. */
  return target;
}
