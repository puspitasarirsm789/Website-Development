/* =====================================================================
   admin-core.js — Gerbang sesi + routing halaman admin (/admin/).
   ---------------------------------------------------------------------
   Sesi: passcode melalui sha256 dibandingkan dengan data/config.json
   (admin_passcodes). Sesi tersimpan di merch_admin_v1 { role, label,
   logged_in_at }. Halaman tanpa modul spesifik (beranda, kreator,
   pembayaran, dsc, publikasi) dirender langsung dari sini.
   ================================================================== */

import { STORAGE_KEYS, storageGet, storageSet, fetchJSON, formatRupiah, formatTanggal, escapeHTML, queryParam, sha256Hex, showToast, qs, qsa, clearChildren, badgeHTML } from "./utils.js";

let configData = null;
let session = null;

/* ------------------------------------------------------------------
   Sesi.
   ------------------------------------------------------------------ */
function loadSession() {
  const value = storageGet(STORAGE_KEYS.admin);
  return value && value.logged_in_at ? value : null;
}

function saveSession(sessionValue) {
  storageSet(STORAGE_KEYS.admin, sessionValue);
}

function updateChip() {
  const chip = document.getElementById("admin-user-chip");
  if (!chip) return;
  if (session) {
    chip.className = "badge badge-success";
    chip.textContent = `${session.label} · aktif`;
    chip.removeAttribute("hidden");
  } else {
    chip.className = "badge badge-warning";
    chip.textContent = "Bukan sesi admin";
    chip.removeAttribute("hidden");
  }
}

function ensureLogoutButton() {
  const actions = qs(".admin-panel__actions") ?? qs(".admin-topbar");
  if (!actions || qs("#admin-logout")) return;
  const button = document.createElement("button");
  button.id = "admin-logout";
  button.className = "btn btn-ghost btn-sm";
  button.type = "button";
  button.textContent = "Keluar";
  button.addEventListener("click", () => {
    storageSet(STORAGE_KEYS.admin, null);
    session = null;
    updateChip();
    renderLoginGate();
    showToast("Sesi admin ditutup.", { type: "info" });
  });
  actions.prepend(button);
}

/* ------------------------------------------------------------------
   Modal login (memakai .modal-overlay dari main.css).
   ------------------------------------------------------------------ */
function renderLoginGate() {
  if (session) return;

  const existing = qs("#admin-login-overlay");
  if (existing) existing.removeAttribute("hidden");
  if (existing) return;

  const overlay = document.createElement("div");
  overlay.id = "admin-login-overlay";
  overlay.className = "modal-overlay";
  overlay.innerHTML = `
    <div class="modal" role="dialog" aria-modal="true" aria-labelledby="admin-login-title">
      <h2 class="heading-3" id="admin-login-title">Masuk Area Admin</h2>
      <form id="admin-login-form" class="stack" novalidate>
        <div class="form-group">
          <label class="label" for="admin-passcode">Passcode</label>
          <input class="input" id="admin-passcode" name="passcode" type="password" autocomplete="current-password" required>
          <p class="form-hint">Passcode di-hash SHA-256 dan diperiksa terhadap config. Tidak disimpan polos.</p>
        </div>
        <p class="form-error" id="admin-login-error" hidden>Passcode belum benar.</p>
        <button class="btn btn-primary" type="submit">Masuk</button>
      </form>
    </div>
  `;
  document.body.appendChild(overlay);

  const form = qs("#admin-login-form", overlay);
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const input = qs("#admin-passcode", overlay);
    const error = qs("#admin-login-error", overlay);
    const hash = await sha256Hex(input?.value ?? "");
    const matched = (configData?.admin_passcodes ?? []).find((entry) => entry.hash_sha256 === hash);
    if (!matched) {
      error.removeAttribute("hidden");
      input?.focus();
      return;
    }
    error.setAttribute("hidden", "");
    session = { label: matched.label, logged_in_at: new Date().toISOString() };
    saveSession(session);
    updateChip();
    overlay.remove();
    showToast(`Selamat datang, ${session.label}.`, { type: "success" });
    window.dispatchEvent(new CustomEvent("admin-session-ready"));
    renderAdminPage();
  });

  qs("#admin-passcode", overlay)?.focus();
}

/* ------------------------------------------------------------------
   Data contoh (muat data demo dari JSON statis ke localStorage).
   ------------------------------------------------------------------ */
async function seedDemoData() {
  const [orderDemo, aspirasiDemo, dscDemo] = await Promise.all([
    fetchJSON("../data/order-status.json", {}),
    fetchJSON("../data/aspirasi-status.json", {}),
    fetchJSON("../data/dsc-status.json", {}),
  ]);

  if (Array.isArray(orderDemo?.records)) {
    const current = (storageGet(STORAGE_KEYS.orders) ?? []).filter((order) => order.source !== "demo");
    const demoOrders = orderDemo.records.map((record) => ({ ...record, source: "demo" }));
    storageSet(STORAGE_KEYS.orders, [...demoOrders, ...current]);
  }
  const demoTickets = [
    ...(Array.isArray(aspirasiDemo?.records) ? aspirasiDemo.records.map((record) => ({ ...record, type: "aspirasi", source: "demo" })) : []),
    ...(Array.isArray(dscDemo?.records) ? dscDemo.records.map((record) => ({ ...record, type: "dsc", source: "demo" })) : []),
  ];
  if (demoTickets.length > 0) {
    const currentTickets = (storageGet(STORAGE_KEYS.tickets) ?? []).filter((ticket) => ticket.source !== "demo");
    storageSet(STORAGE_KEYS.tickets, [...demoTickets, ...currentTickets]);
  }
  showToast("Data contoh dimuat untuk simulasi admin.", { type: "info" });
}

/* ------------------------------------------------------------------
   Halaman admin tanpa modul khusus.
   ------------------------------------------------------------------ */
function currentPage() {
  return window.location.pathname.split("/").pop() || "index.html";
}

async function renderAdminPage() {
  const page = currentPage();
  const main = document.getElementById("main-content");
  if (!main) return;

  if (page === "index.html") {
    await renderDashboard(main);
  } else if (page === "kreator.html") {
    await renderKreatorTable(main);
  } else if (page === "pembayaran.html") {
    const module = await import("./admin-orders.js");
    module.initPembayaran(main);
  } else if (page === "dsc.html") {
    const module = await import("./admin-aspirasi.js");
    module.initDscTickets(main);
  } else if (page === "publikasi.html") {
    renderPublikasi(main);
  }
}

async function renderDashboard(main) {
  const [products, ledger, orders, tickets] = await Promise.all([
    fetchJSON("../data/products.json", { defaultValue: [] }),
    fetchJSON("../data/ledger.json", { defaultValue: null }),
    Promise.resolve(storageGet(STORAGE_KEYS.orders) ?? []),
    Promise.resolve(storageGet(STORAGE_KEYS.tickets) ?? []),
  ]);

  const activeProducts = (Array.isArray(products) ? products : []).filter((product) => product.is_active !== false);
  const outOfStock = activeProducts.filter((product) => (product.variants ?? []).reduce((sum, variant) => sum + (Number(variant.stock) || 0), 0) === 0);
  const pendingPayments = orders.filter((order) => order.status === "menunggu-verifikasi" || order.status === "menunggu-pembayaran").length;
  const openTickets = tickets.filter((ticket) => ticket.status !== "selesai" && ticket.status !== "disetujui").length;
  const summary = (Array.isArray(ledger?.records) ? ledger.records : []).reduce(
    (acc, record) => {
      const total = Number(record.amount) || 0;
      if (record.status === "selesai") acc.cash += total;
      else acc.pending += total;
      return acc;
    },
    { cash: 0, pending: 0 }
  );

  main.innerHTML = `
    <div class="cluster">
      <button id="seed-demo-btn" class="btn btn-outline btn-sm" type="button">Muat data contoh</button>
    </div>
    <div class="grid-3">
      <article class="card"><div class="card-product__body"><p class="card-product__category">Produk aktif</p><p class="heading-2">${activeProducts.length}</p><p class="form-hint">Habis stok: ${outOfStock.length} produk</p></div></article>
      <article class="card"><div class="card-product__body"><p class="card-product__category">Pesanan menunggu</p><p class="heading-2">${pendingPayments}</p><p class="form-hint">Yang lama diproses lewat antrean pembayaran</p></div></article>
      <article class="card"><div class="card-product__body"><p class="card-product__category">Tiket terbuka</p><p class="heading-2">${openTickets}</p><p class="form-hint">Aspirasi + karya DSC</p></div></article>
      <article class="card"><div class="card-product__body"><p class="card-product__category">Kas sah (selesai)</p><p class="heading-2">${formatRupiah(summary.cash)}</p><p class="form-hint">Sudah masuk ledger</p></div></article>
      <article class="card"><div class="card-product__body"><p class="card-product__category">Menunggu persetujuan</p><p class="heading-2">${formatRupiah(summary.pending)}</p><p class="form-hint">Belum diakui sebagai kas sah</p></div></article>
    </div>
    <article class="card"><div class="card-product__body">
      <h2 class="heading-3">Tautan cepat</h2>
      <div class="cluster">
        <a class="btn btn-primary btn-sm" href="./produk.html">Kelola produk</a>
        <a class="btn btn-primary btn-sm" href="./pembayaran.html">Verifikasi pembayaran</a>
        <a class="btn btn-primary btn-sm" href="./aspirasi.html">Kelola aspirasi</a>
        <a class="btn btn-outline btn-sm" href="./dana.html">Lihat dana</a>
      </div>
    </div></article>
  `;

  qs("#seed-demo-btn", main)?.addEventListener("click", seedDemoData);
}

async function renderKreatorTable(main) {
  const [creators, products] = await Promise.all([
    fetchJSON("../data/creators.json", { defaultValue: [] }),
    fetchJSON("../data/products.json", { defaultValue: [] }),
  ]);
  const rows = (Array.isArray(creators) ? creators : [])
    .map(
      (creator) => `
      <tr>
        <td>${escapeHTML(creator.name)}</td>
        <td>${escapeHTML(creator.class_name ?? "")}</td>
        <td>${(Array.isArray(products) ? products : []).filter((product) => product.creator_id === creator.id).length}</td>
        <td>${badgeHTML(creator.is_active === false ? "Nonaktif" : "Aktif", creator.is_active === false ? "warning" : "success")}</td>
      </tr>
    `
    )
    .join("");
  main.innerHTML = `
    <article class="admin-panel">
      <div class="admin-panel__header">
        <h2 class="heading-3">Daftar kreator</h2>
        <div class="admin-panel__actions"></div>
      </div>
      <div class="admin-table-wrapper">
        <table>
          <thead><tr><th>Nama</th><th>Kelas</th><th>Jumlah karya</th><th>Status</th></tr></thead>
          <tbody>${rows || '<tr><td colspan="4">Belum ada data.</td></tr>'}</tbody>
        </table>
      </div>
      <p class="form-hint">Perubahan kreator dikelola langsung pada data/creators.json saat publikasi.</p>
    </article>
  `;
  ensureLogoutButton();
}

function renderPublikasi(main) {
  const checklist = [
    "Perbarui berkas data/*.json (produk, kreator, FAQ, ledger).",
    "Isi gambar produk asli di assets/img/produk/ lalu perbarui path di products.json.",
    "Ganti QRIS placeholder di assets/img/qris/qris-placeholder.svg dengan QRIS asli (sama nama file).",
    "Pasang hash passcode admin baru di config.json (jalur sha256, jangan tulis passcode polos).",
    "Tambahkan data order-status.json, aspirasi-status.json, dsc-status.json terbaru bila perlu.",
    "Perbarui sitemap.xml base URL ke domain GitHub Pages final.",
    "Push ke branch gh-pages / main dengan Pages aktif (folder root).",
    "Klik penamaan publikasi: alamat final dihalamakan pada README pada root repo.",
  ];
  main.innerHTML = `
    <article class="admin-panel">
      <div class="admin-panel__header"><h2 class="heading-3">Checklist publikasi</h2></div>
      <ol class="stack">
        ${checklist.map((item) => `<li>${escapeHTML(item)}</li>`).join("")}
      </ol>
      <p class="form-hint">Checklist dibuat agar regenerasi konten statis tetap konsisten tanpa CMS.</p>
    </article>
  `;
  ensureLogoutButton();
}

/* ------------------------------------------------------------------
   Bootstrap.
   ------------------------------------------------------------------ */
async function bootstrap() {
  configData = await fetchJSON("../data/config.json", { defaultValue: null });
  session = loadSession();
  updateChip();

  if (!session) {
    renderLoginGate();
  } else {
    ensureLogoutButton();
    window.dispatchEvent(new CustomEvent("admin-session-ready"));
  }

  await renderAdminPage();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", () => bootstrap());
} else {
  bootstrap();
}

export { loadSession, saveSession, updateChip, ensureLogoutButton, seedDemoData };

/* Helper tungggu sesi untuk modul halaman admin lain. */
export function requireSession(onReady) {
  if (loadSession()) {
    onReady();
    return;
  }
  window.addEventListener("admin-session-ready", () => onReady(), { once: true });
}
