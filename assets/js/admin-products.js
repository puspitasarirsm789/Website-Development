/* =====================================================================
   admin-products.js — Lihat & sunting stok produk (admin/produk.html).
   ---------------------------------------------------------------------
   Edit stok varian disimpan sebagai draft lokal (merch_admin_v1),
   lalu "Unduh products.json" menghasilkan berkas final untuk dipush.
   Klaim harga/deskripsi tetap di JSON — modul ini fokus stok.
   ================================================================== */

import { STORAGE_KEYS, storageGet, storageUpdate, fetchJSON, formatRupiah, escapeHTML, qsa, qs, downloadJSON } from "./utils.js";
import { requireSession } from "./admin-core.js";

function readOverrides() {
  return storageGet(STORAGE_KEYS.admin)?.product_overrides ?? {};
}

function saveOverrides(overrides) {
  storageUpdate(STORAGE_KEYS.admin, (session) => ({ ...(session ?? {}), product_overrides: overrides }), {});
}

function mergeProduct(product, overrides) {
  const override = overrides[product.id];
  if (!override) return { ...product, variants: product.variants.map((variant) => ({ ...variant })) };
  return {
    ...product,
    variants: product.variants.map((variant, index) => ({
      ...variant,
      stock: Number(override[index] ?? variant.stock),
    })),
  };
}

async function draw(main) {
  const products = await fetchJSON("../data/products.json", { defaultValue: [] });
  const overrides = readOverrides();
  const merged = (Array.isArray(products) ? products : []).map((product) => mergeProduct(product, overrides));

  main.innerHTML = `
    <article class="admin-panel">
      <div class="admin-panel__header">
        <h2 class="heading-3">Stok produk</h2>
        <div class="admin-panel__actions">
          <button id="save-stok" class="btn btn-primary btn-sm" type="button" disabled>Simpan draft</button>
          <button id="export-products" class="btn btn-outline btn-sm" type="button">Unduh products.json</button>
        </div>
      </div>
      <div class="admin-table-wrapper"><table>
        <thead><tr><th>Produk</th><th>Kategori / Kreator</th><th>Harga</th><th>Varian &amp; stok</th></tr></thead>
        <tbody>
          ${merged
            .map(
              (product) => `
            <tr data-product="${escapeHTML(product.id)}">
              <td><strong>${escapeHTML(product.name)}</strong><br><span class="form-hint">${escapeHTML(product.id)}</span></td>
              <td>${escapeHTML(product.category_id)} / ${escapeHTML(product.creator_id)}</td>
              <td>${formatRupiah(product.price)}</td>
              <td><div class="stack stack--tight">
                ${product.variants
                  .map(
                    (variant, index) => `
                  <div class="cluster">
                    <span>${escapeHTML(variant.name)}</span>
                    <input class="input input--stok" type="number" min="0" inputmode="numeric" value="${variant.stock}"
                      data-variant-index="${index}" aria-label="Stok ${escapeHTML(product.name)} ${escapeHTML(variant.name)}">
                  </div>
                `
                  )
                  .join("")}
              </div></td>
            </tr>
          `
            )
            .join("") || '<tr><td colspan="4">Produk gagal dimuat.</td></tr>'}
        </tbody>
      </table></div>
      <p class="form-hint">Draft stok tersimpan lokal; gunakan "Unduh products.json" lalu push berkasnya ke repo.</p>
    </article>
  `;

  const saveButton = qs("#save-stok", main);
  main.addEventListener("input", (event) => {
    if (event.target.matches(".input--stok")) {
      saveButton.removeAttribute("disabled");
    }
  });

  saveButton?.addEventListener("click", () => {
    const nextOverrides = { ...readOverrides() };
    qsa("tr[data-product]", main).forEach((row) => {
      const productId = row.getAttribute("data-product");
      const inputs = qsa(".input--stok", row);
      if (inputs.length === 0) return;
      const product = merged.find((entry) => entry.id === productId);
      const changed = {};
      let touched = false;
      inputs.forEach((input) => {
        const index = Number(input.getAttribute("data-variant-index"));
        const original = Number(product?.variants?.[index]?.stock) || 0;
        if (Number(input.value) !== original) {
          changed[index] = Number(input.value);
          touched = true;
        }
      });
      if (touched) nextOverrides[productId] = changed;
    });
    saveOverrides(nextOverrides);
    saveButton.setAttribute("disabled", "");
    showToast("Draft stok tersimpan. Unduh products.json untuk publikasi.", { type: "success" });
  });

  qs("#export-products", main)?.addEventListener("click", () => {
    const overrides = readOverrides();
    const output = (Array.isArray(products) ? products : []).map((product) => mergeProduct(product, overrides));
    downloadJSON("products.json", output);
  });
}

if (window.location.pathname.includes("produk.html") && window.location.pathname.includes("/admin/")) {
  const main = document.getElementById("main-content");
  if (main) requireSession(() => draw(main));
}
