/* =====================================================================
   cart.js — Keranjang belanja (KSL: merch_cart_v1).
   ---------------------------------------------------------------------
   Struktur item: { product_id, name, image, price, variant_name, qty }
   Penyimpanan selalu via storage wrapper utils.js (fallback in-memory).
   ================================================================== */

import { STORAGE_KEYS, storageGet, storageSet, fetchJSON, formatRupiah, escapeHTML, showToast, qs, qsa, clearChildren } from "./utils.js";

function readCart() {
  const cart = storageGet(STORAGE_KEYS.cart);
  return Array.isArray(cart) ? cart : [];
}

function writeCart(cart) {
  storageSet(STORAGE_KEYS.cart, cart);
}

function findItem(cart, productId, variantName) {
  return cart.find((item) => item.product_id === productId && item.variant_name === variantName);
}

/* ------------------------------------------------------------------
   API yang dipakai halaman lain (catalog.js / orders.js).
   ------------------------------------------------------------------ */
export function addItemToCart(product, variantName, qty) {
  const cart = readCart();
  const existing = findItem(cart, product.product_id, variantName);
  if (existing) {
    existing.qty += qty;
    /* Cap stok diperiksa ulang pada checkout — cegah nyasar di UI. */
    writeCart(cart);
    return existing;
  }
  cart.push({
    product_id: product.product_id,
    name: product.name,
    image: product.image ?? "",
    price: Number(product.price),
    variant_name: variantName,
    qty: Math.max(Number(qty) || 1, 1),
  });
  writeCart(cart);
  return cart[cart.length - 1];
}

export function getCartItems() {
  return readCart();
}

export function getCartCount() {
  return readCart().reduce((sum, item) => sum + (Number(item.qty) || 0), 0);
}

export function getCartSubtotal() {
  return readCart().reduce((sum, item) => sum + (Number(item.price) || 0) * (Number(item.qty) || 0), 0);
}

export function clearCart() {
  writeCart([]);
}

/* Export untuk halaman lain yang butuh render sendiri. */
export function cartIsEmpty() {
  return readCart().length === 0;
}

/* ==================================================================
   Halaman keranjang.html.
   ================================================================== */
export function initKeranjang() {
  const listTarget = document.getElementById("cart-list");
  if (!listTarget) return;
  const summaryTarget = document.getElementById("cart-summary");
  const emptyAlert = document.getElementById("cart-empty");
  const checkoutBtn = document.getElementById("to-checkout");

  const render = () => {
    const cart = readCart();
    clearChildren(listTarget);

    if (cart.length === 0) {
      listTarget.innerHTML = `
        <div class="empty-state">
          <p class="empty-state__title">Keranjangmu masih kosong.</p>
          <p class="empty-state__desc"><a class="btn btn-primary" href="./katalog.html">Jelajahi katalog</a></p>
        </div>
      `;
      if (summaryTarget) summaryTarget.setAttribute("hidden", "");
      if (emptyAlert) emptyAlert.removeAttribute("hidden");
      if (checkoutBtn) checkoutBtn.setAttribute("disabled", "");
      return;
    }

    if (emptyAlert) emptyAlert.setAttribute("hidden", "");
    if (summaryTarget) summaryTarget.removeAttribute("hidden");
    if (checkoutBtn) checkoutBtn.removeAttribute("disabled");

    listTarget.innerHTML = cart
      .map(
        (item) => `
        <li class="card cart-item" data-product-id="${escapeHTML(item.product_id)}" data-variant="${escapeHTML(item.variant_name)}">
          <img class="cart-item__image" src="${escapeHTML(item.image)}" alt="" loading="lazy" width="96" height="96">
          <div class="cart-item__detail">
            <p class="cart-item__name">${escapeHTML(item.name)}</p>
            <p class="card-creator__meta">Varian: ${escapeHTML(item.variant_name)}</p>
            <p class="cart-item__price">${formatRupiah(item.price)} × ${item.qty}</p>
          </div>
          <div class="stack stack--tight">
            <div class="qty-group" role="group" aria-label="Atur jumlah ${escapeHTML(item.name)}">
              <button type="button" data-action="minus" aria-label="Kurangi jumlah ${escapeHTML(item.name)}">&minus;</button>
              <input class="input" type="number" min="1" value="${item.qty}" data-action="qty" inputmode="numeric" aria-label="Jumlah ${escapeHTML(item.name)}">
              <button type="button" data-action="plus" aria-label="Tambah jumlah ${escapeHTML(item.name)}">+</button>
            </div>
            <button type="button" class="btn btn-ghost btn-sm" data-action="remove">Hapus</button>
          </div>
        </li>
      `
      )
      .join("");

    const subtotal = getCartSubtotal();
    const subtotalNode = document.getElementById("summary-subtotal");
    const totalNode = document.getElementById("summary-total");
    if (subtotalNode) subtotalNode.textContent = formatRupiah(subtotal);
    if (totalNode) totalNode.textContent = formatRupiah(subtotal);
  };

  listTarget.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-action]");
    if (!button) return;
    const item = button.closest(".cart-item");
    const productId = item?.getAttribute("data-product-id");
    const variant = item?.getAttribute("data-variant");
    const cartItemName = item?.querySelector(".cart-item__name")?.textContent ?? "";
    const action = button.getAttribute("data-action");
    const cart = readCart();
    const index = cart.findIndex((entry) => entry.product_id === productId && entry.variant_name === variant);
    if (index === -1) return;

    if (action === "minus" || action === "plus") {
      const qtyInput = item.querySelector('input[data-action="qty"]');
      const step = action === "minus" ? -1 : 1;
      qtyInput.value = String(Math.max(Number(qtyInput.value) + step, 1));
      qtyInput.dispatchEvent(new Event("change"));
    } else if (action === "remove") {
      event.preventDefault();
      cart.splice(index, 1);
      writeCart(cart);
      showToast(`${cartItemName} dihapus dari keranjang.`, { type: "info" });
      render();
    }
  });

  listTarget.addEventListener("change", (event) => {
    const input = event.target.closest('input[data-action="qty"]');
    if (!input) return;
    const item = input.closest(".cart-item");
    const productId = item?.getAttribute("data-product-id");
    const variant = item?.getAttribute("data-variant");
    const cart = readCart();
    const entry = findItem(cart, productId, variant);
    if (!entry) return;
    entry.qty = Math.max(Number(input.value) || 1, 1);
    input.value = String(entry.qty);
    writeCart(cart);
    render();
  });

  checkoutBtn?.addEventListener("click", () => {
    if (readCart().length === 0) {
      showToast("Keranjangmu masih kosong.", { type: "warning" });
      return;
    }
    window.location.assign("./checkout.html");
  });

  /* Sinkron antar-tab. */
  try {
    window.addEventListener("storage", (event) => {
      if (!event.key || event.key === STORAGE_KEYS.cart) render();
    });
  } catch (err) {
    /* Abaikan. */
  }

  render();
}
