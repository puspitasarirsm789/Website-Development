/* =====================================================================
   orders.js — Siklus pesanan (LCL: merch_orders_v1).
   ---------------------------------------------------------------------
   Alur (statis, tanpa backend):
     checkout → kode pesanan + simpan (menunggu-pembayaran)
     pembayaran → instruksi method (QRIS / transfer) dari config.json
     konfirmasi → isi bukti (catatan + nama bukti) → menunggu-verifikasi
     status → pelacakan stepper; riwayat → daftar pesanan lokal
   Status pipeline: menunggu-pembayaran → menunggu-verifikasi →
   terverifikasi → sedang-disiapkan → siap-diambil → selesai (| ditolak).
   Stok divalidasi ulang saat checkout dengan data/products.json.
   ================================================================== */

import { STORAGE_KEYS, storageGet, storageSet, fetchJSON, formatRupiah, formatTanggal, escapeHTML, queryParam, generateUniqueCode, showToast, qs, qsa, clearChildren, badgeHTML, downloadJSON } from "./utils.js";

export const ORDER_STATUS_FLOW = [
  "menunggu-pembayaran",
  "menunggu-verifikasi",
  "terverifikasi",
  "sedang-disiapkan",
  "siap-diambil",
  "selesai",
];

export const ORDER_STATUS_LABEL = {
  "menunggu-pembayaran": "Menunggu Pembayaran",
  "menunggu-verifikasi": "Menunggu Verifikasi Bukti",
  "terverifikasi": "Terverifikasi",
  "sedang-disiapkan": "Sedang Disiapkan",
  "siap-diambil": "Siap Diambil",
  "selesai": "Selesai",
  "ditolak": "Ditolak",
};

export const ORDER_STATUS_TONE = {
  "menunggu-pembayaran": "warning",
  "menunggu-verifikasi": "warning",
  "terverifikasi": "info",
  "sedang-disiapkan": "info",
  "siap-diambil": "success",
  "selesai": "success",
  "ditolak": "danger",
};

/* ------------------------------------------------------------------
   Penyimpanan pesanan.
   ------------------------------------------------------------------ */
function normalizeOrder(record) {
  if (!record || typeof record !== "object") return null;
  const code = record.code ?? record.order_code ?? "";
  const subtotal = Number(record.subtotal ?? record.total ?? 0);
  const items = Array.isArray(record.items) && record.items.length > 0
    ? record.items
    : [
        {
          product_id: record.items_summary ?? "demo",
          name: record.items_summary ?? "Item demo",
          variant_name: "",
          price: subtotal,
          qty: 1,
          line_total: subtotal,
          image: "",
        },
      ];
  return {
    ...record,
    code,
    items: items.map((item) => ({ ...item, line_total: Number(item.price ?? 0) * Number(item.qty ?? 1) })),
    subtotal,
    buyer: record.buyer ?? { name: "Data contoh", class_name: "", email: "", note: "" },
    status: record.status ?? "menunggu-pembayaran",
    proof_note: record.proof_note ?? null,
    proof_name: record.proof_name ?? "",
    created_at: record.created_at ?? null,
    updated_at: record.updated_at ?? null,
  };
}

export function readOrders() {
  const orders = storageGet(STORAGE_KEYS.orders);
  if (!Array.isArray(orders)) return [];
  return orders.map(normalizeOrder).filter((order) => order && order.code);
}

export function writeOrders(orders) {
  storageSet(STORAGE_KEYS.orders, orders);
}

export function saveOrder(order) {
  const orders = readOrders();
  const index = orders.findIndex((entry) => entry.code === order.code);
  if (index === -1) orders.unshift(order);
  else orders[index] = order;
  writeOrders(orders);
  return order;
}

export function findOrder(code) {
  return readOrders().find((order) => order.code === code);
}

function newOrderCode() {
  return generateUniqueCode("ORD", readOrders().map((order) => order.code));
}

/* ------------------------------------------------------------------
   Validasi keranjang vs stok terbaru (dari products.json).
   ------------------------------------------------------------------ */
async function orderItemsFromCart() {
  const cart = storageGet(STORAGE_KEYS.cart) ?? [];
  if (!Array.isArray(cart) || cart.length === 0) {
    return { items: [], errors: ["Keranjangmu masih kosong."], subtotal: 0 };
  }
  const products = await fetchJSON("./data/products.json", { defaultValue: null });
  const byId = new Map((products ?? []).map((product) => [product.id, product]));

  const items = [];
  const errors = [];
  let subtotal = 0;

  cart.forEach((entry) => {
    const product = byId.get(entry.product_id);
    const variant = (product?.variants ?? []).find((item) => item.name === entry.variant_name);
    if (!product || product.is_active === false) {
      errors.push(`${entry.name} sudah tidak dijual — item dihapus otomatis.`);
      return;
    }
    if (!variant) {
      errors.push(`Varian "${entry.variant_name}" pada ${entry.name} tidak ada lagi — item dihapus otomatis.`);
      return;
    }
    const maxQty = Math.min(Number(variant.stock) || 0, Number(entry.qty) || 1);
    if (maxQty <= 0) {
      errors.push(`${entry.name} (${variant.name}) stoknya habis — item dihapus otomatis.`);
      return;
    }
    if (maxQty < entry.qty) {
      errors.push(`Stok ${entry.name} (${variant.name}) tinggal ${maxQty} — jumlah disesuaikan.`);
    }
    items.push({
      product_id: entry.product_id,
      name: entry.name,
      variant_name: variant.name,
      price: Number(product.price),
      qty: maxQty,
      image: entry.image ?? "",
      line_total: Number(product.price) * maxQty,
    });
    subtotal += Number(product.price) * maxQty;
  });

  return { items, errors, subtotal };
}

function orderBadge(status) {
  return badgeHTML(ORDER_STATUS_LABEL[status] ?? status, ORDER_STATUS_TONE[status] ?? "info");
}

function renderOrderItems(items) {
  if (!Array.isArray(items) || items.length === 0) {
    return '<p class="form-hint">Rincian item tidak tersedia.</p>';
  }
  return items
    .map(
      (item) => `
      <div class="summary-row">
        <span>${escapeHTML(item.name)} (${escapeHTML(item.variant_name)}) × ${item.qty}</span>
        <span>${formatRupiah(item.line_total)}</span>
      </div>
    `
    )
    .join("");
}

/* ==================================================================
   checkout.html
   ================================================================== */
export async function initCheckout() {
  const form = document.getElementById("checkout-form");
  const summaryTarget = document.getElementById("checkout-summary");
  if (!form || !summaryTarget) return;

  const { items, errors, subtotal } = await orderItemsFromCart();

  if (items.length === 0) {
    summaryTarget.innerHTML = `
      <div class="empty-state">
        <p class="empty-state__title">Keranjangmu kosong.</p>
        <p class="empty-state__desc"><a class="btn btn-primary" href="./katalog.html">Pilih produk dulu</a></p>
      </div>
    `;
    if (errors.length > 0) {
      summaryTarget.innerHTML = `<div class="alert alert-warning">${errors.map(escapeHTML).join("<br>")}</div>` + summaryTarget.innerHTML;
    }
    form.setAttribute("hidden", "");
    return;
  }

  /* Setelah penyaringan stok, simpan ulang keranjang agar konsisten. */
  if (errors.length > 0) {
    storageSet(STORAGE_KEYS.cart, items.map(({ product_id, name, image, price, variant_name, qty }) => ({ product_id, name, image, price, variant_name, qty })));
    summaryTarget.insertAdjacentHTML("beforebegin", `<div class="alert alert-warning" role="note">${errors.map(escapeHTML).join("<br>")}</div>`);
  }

  const config = await fetchJSON("./data/config.json", { defaultValue: null });
  const methods = config?.payment_methods ?? [];
  summaryTarget.innerHTML = `
    <h2 class="heading-3">Ringkasan Pesanan</h2>
    ${renderOrderItems(items)}
    <div class="summary-row summary-row--total"><span>Total</span><span id="checkout-total">${formatRupiah(subtotal)}</span></div>
    ${foreignFeeNote(config)}
    ${renderMethodSelect(methods)}
  `;

  const methodSelect = document.getElementById("checkout-method");
  if (methodSelect) {
    methodSelect.addEventListener("change", () => {
      const methodTotalNote = document.getElementById("method-note");
      if (!methodTotalNote) return;
      const chosen = methods.find((method) => method.type === methodSelect.value);
      methodTotalNote.textContent = chosen?.instruction ?? "";
    });
  }

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const name = document.getElementById("buyer-name");
    const classField = document.getElementById("buyer-class");
    const email = document.getElementById("buyer-email");
    const note = document.getElementById("buyer-note");
    const method = document.getElementById("checkout-method");

    if (!name?.value.trim() || !classField?.value.trim()) {
      showToast("Nama dan kelas wajib diisi.", { type: "warning" });
      if (!name?.value.trim()) name?.focus();
      else classField?.focus();
      return;
    }
    if (email?.value && !/^\S+@\S+\.\S+$/.test(email.value)) {
      showToast("Format email belum benar.", { type: "warning" });
      email.focus();
      return;
    }

    const chosenMethod = methods.find((entry) => entry.type === method?.value) ?? methods[0] ?? null;
    const order = {
      code: newOrderCode(),
      items,
      subtotal,
      payment_method: chosenMethod?.type ?? "qris",
      buyer: {
        name: name.value.trim(),
        class_name: classField.value.trim(),
        email: email?.value.trim() ?? "",
        note: note?.value.trim() ?? "",
      },
      status: "menunggu-pembayaran",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    saveOrder(order);
    clearCartAndRefresh();
    window.location.assign(`./pembayaran.html?order=${encodeURIComponent(order.code)}`);
  });
}

function foreignFeeNote(config) {
  const percent = Number(config?.osis_fee_percent ?? 0);
  if (!percent) return "";
  return `<p class="form-hint">Dana OSIS ${percent}% sudah dihitung dalam harga produk terpilih.</p>`;
}

function renderMethodSelect(methods) {
  if (methods.length === 0) return "";
  return `
    <div class="form-group">
      <label class="label" for="checkout-method">Metode pembayaran</label>
      <select class="select" id="checkout-method" name="method">
        ${methods.map((method) => `<option value="${escapeHTML(method.type)}">${escapeHTML(method.name ?? method.label)}</option>`).join("")}
      </select>
      <p class="form-hint" id="method-note">${escapeHTML(methods[0]?.instruction ?? "")}</p>
    </div>
  `;
}

function clearCartAndRefresh() {
  storageSet(STORAGE_KEYS.cart, []);
}

/* ==================================================================
   pembayaran.html?order=… — instruksi pembayaran.
   ================================================================== */
export async function initPembayaran() {
  const target = document.getElementById("payment-instructions");
  if (!target) return;

  const code = queryParam("order");
  const order = code ? findOrder(code) : null;

  if (!order) {
    clearChildren(target);
    target.innerHTML = `
      <div class="empty-state">
        <p class="empty-state__title">Pesanan tidak ditemukan.</p>
        <p class="empty-state__desc"><a class="btn btn-primary" href="./riwayat.html">Lihat riwayat pesanan</a></p>
      </div>
    `;
    return;
  }

  const config = await fetchJSON("./data/config.json", { defaultValue: null });
  const methods = config?.payment_methods ?? [];
  const chosen = methods.find((method) => method.type === order.payment_method) ?? methods[0] ?? null;
  const deadlineNote = config?.order_deadline_note ?? "";

  clearChildren(target);

  let instructions = `
    <div class="alert alert-info" role="note">Kode pesananmu: <strong>${escapeHTML(order.code)}</strong></div>
    <h2 class="heading-3">Ringkasan</h2>
    ${renderOrderItems(order.items)}
    <div class="summary-row summary-row--total"><span>Total</span><span>${formatRupiah(order.subtotal)}</span></div>
  `;

  if (chosen?.type === "qris" && chosen.image) {
    instructions += `
      <h2 class="heading-3">Scan QRIS berikut</h2>
      <img class="payment-qris" src="${escapeHTML(chosen.image)}" alt="Kode QRIS pembayaran OSIS SMANIC" loading="lazy" width="640" height="760">
      <p class="form-hint">Nominal tepat: <strong>${formatRupiah(order.subtotal)}</strong></p>
    `;
  } else if (chosen) {
    instructions += `
      <h2 class="heading-3">${escapeHTML(chosen.bank_name ?? "Transfer bank")}</h2>
      <p>Nomor rekening: <strong>${escapeHTML(chosen.account_number ?? "")}</strong></p>
      <p>Atas nama: <strong>${escapeHTML(chosen.account_name ?? chosen.account_holder ?? "")}</strong></p>
      <p class="form-hint">Nominal tepat: <strong>${formatRupiah(order.subtotal)}</strong></p>
    `;
  } else {
    instructions += `<div class="alert alert-warning">Instruksi pembayaran belum tersedia, hubungi panitia di Ruang 204.</div>`;
  }

  if (deadlineNote) {
    instructions += `<div class="alert alert-warning" role="note">${escapeHTML(deadlineNote)}</div>`;
  }

  instructions += `
    <div class="cluster">
      <a class="btn btn-accent btn-lg" href="./konfirmasi.html?order=${encodeURIComponent(order.code)}">Saya sudah bayar</a>
      <a class="btn btn-outline" href="./status.html?order=${encodeURIComponent(order.code)}">Lacak pesanan</a>
    </div>
  `;

  target.innerHTML = instructions;
}

/* ==================================================================
   konfirmasi.html?order=… — pengisian bukti bayar.
   ================================================================== */
export function initKonfirmasi() {
  const form = document.getElementById("proof-form");
  const alertTarget = document.getElementById("proof-context");
  if (!form || !alertTarget) return;

  const code = queryParam("order");
  const order = code ? findOrder(code) : null;

  if (!order) {
    clearChildren(alertTarget);
    alertTarget.innerHTML = `
      <div class="empty-state">
        <p class="empty-state__title">Pesanan tidak ditemukan.</p>
        <p class="empty-state__desc">Masukkan kode pesanan secara manual di bawah.</p>
      </div>
    `;
  } else {
    alertTarget.innerHTML = `<div class="alert alert-info" role="note">Mengonfirmasi pesanan <strong>${escapeHTML(order.code)}</strong> (${escapeHTML(ORDER_STATUS_LABEL[order.status])}).</div>`;
  }

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const codeInput = document.getElementById("proof-order-code");
  if (codeInput && code) codeInput.value = code.toUpperCase();
    const note = document.getElementById("proof-note");
    const proofFile = document.getElementById("proof-file");
    const typedCode = (codeInput?.value ?? "").trim().toUpperCase();

    if (!typedCode) {
      showToast("Kode pesanan wajib diisi.", { type: "warning" });
      codeInput?.focus();
      return;
    }

    let target = null;
    if (typedCode.startsWith("ORD-")) {
      target = findOrder(typedCode) ?? null;
    }
    if (!target) {
      showToast("Kode pesanan tidak dikenali, cek riwayatmu.", { type: "danger" });
      codeInput?.focus();
      return;
    }
    if (target.status !== "menunggu-pembayaran" && target.status !== "menunggu-verifikasi") {
      showToast(`Pesanan ini sudah berstatus ${ORDER_STATUS_LABEL[target.status]}.`, { type: "info" });
      return;
    }

    target.status = "menunggu-verifikasi";
    target.proof_note = note?.value.trim() ?? "";
    target.proof_name = proofFile?.files?.[0]?.name ?? "";
    target.updated_at = new Date().toISOString();
    saveOrder(target);

    showToast("Bukti pembayaran dicatat. Menunggu verifikasi panitia.", { type: "success" });
    window.location.assign(`./status.html?order=${encodeURIComponent(target.code)}`);
  });
}

/* ==================================================================
   status.html?order=… — stepper pelacakan.
   ================================================================== */
export function initStatus() {
  const lookupForm = document.getElementById("status-lookup-form");
  const stepperTarget = document.getElementById("status-stepper");
  const detailTarget = document.getElementById("status-detail");
  if (!stepperTarget || !detailTarget) return;

  const renderOrder = (order) => {
    if (!order) {
      stepperTarget.innerHTML = `
        <div class="empty-state">
          <p class="empty-state__title">Pesanan tidak ditemukan.</p>
          <p class="empty-state__desc">Cek kembali kode dari halaman riwayat, atau hubungi panitia Ruang 204.</p>
        </div>
      `;
      clearChildren(detailTarget);
      return;
    }

    const rejekIndex = order.status === "ditolak" ? -1 : ORDER_STATUS_FLOW.indexOf(order.status);
    const doneClass = (index) => (index < rejekIndex ? " stepper__step--done" : "");
    const activeClass = (index) => (index === rejekIndex ? " stepper__step--active" : "");

    if (order.status === "ditolak") {
      stepperTarget.innerHTML = `<div class="alert alert-danger" role="note">Pembayaranmu ditolak. Silakan hubungi panitia untuk info lebih lanjut.</div>`;
    } else {
      stepperTarget.innerHTML = `
        <ol class="stepper">
          ${ORDER_STATUS_FLOW.map(
            (status, index) => `
            <li class="stepper__step${doneClass(index)}${activeClass(index)}">
              <span class="stepper__dot" aria-hidden="true">${index + 1}</span>
              <span class="stepper__label">${escapeHTML(ORDER_STATUS_LABEL[status])}</span>
            </li>
          `
          ).join("")}
        </ol>
      `;
    }

    detailTarget.innerHTML = `
      <h2 class="heading-3">Detail pesanan ${escapeHTML(order.code)}</h2>
      <p>Status saat ini: ${orderBadge(order.status)}</p>
      <p class="form-hint">Terakhir diperbarui ${escapeHTML(formatTanggal(order.updated_at))}</p>
      <div class="admin-panel admin-panel--plain">
        ${renderOrderItems(order.items)}
        <div class="summary-row summary-row--total"><span>Total</span><span>${formatRupiah(order.subtotal)}</span></div>
      </div>
    `;
  };

  const drawFromCode = (code) => {
    renderOrder(code ? findOrder(code) : null);
  };

  lookupForm?.addEventListener("submit", (event) => {
    event.preventDefault();
    const input = document.getElementById("status-lookup");
    drawFromCode((input?.value ?? "").trim().toUpperCase());
  });

  drawFromCode(queryParam("order"));
}

/* ==================================================================
   riwayat.html — daftar pesanan tersimpan (lokal).
   ================================================================== */
export function initRiwayat() {
  const target = document.getElementById("order-history");
  if (!target) return;

  const orders = readOrders();
  clearChildren(target);

  if (orders.length === 0) {
    target.innerHTML = `
      <div class="empty-state">
        <p class="empty-state__title">Belum ada pesanan dari peramban ini.</p>
        <p class="empty-state__desc"><a class="btn btn-primary" href="./katalog.html">Belanja sekarang</a></p>
      </div>
    `;
    return;
  }

  target.innerHTML = orders
    .map(
      (order) => `
      <article class="card">
        <div class="card-product__body">
          <div class="cluster cluster--between">
            <h2 class="heading-3"><a href="./status.html?order=${encodeURIComponent(order.code)}">${escapeHTML(order.code)}</a></h2>
            ${orderBadge(order.status)}
          </div>
          <p class="form-hint">${escapeHTML(formatTanggal(order.created_at))} · ${order.items.length} produk</p>
          <p>${renderOrderItems(order.items)}</p>
          <div class="summary-row summary-row--total"><span>Total</span><span>${formatRupiah(order.subtotal)}</span></div>
        </div>
      </article>
    `
    )
    .join("");
}

/* Ekspor tambahan untuk modul admin. */
export { orderBadge };
