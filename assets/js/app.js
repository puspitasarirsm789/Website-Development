/* =====================================================================
   app.js — Dispatcher perilaku shell untuk seluruh halaman publik.
   ---------------------------------------------------------------------
   Tanggung jawab (semua laman): nav toggle, nav aktif, badge keranjang,
   isi footer (kontak + tahun) dari data/config.json.
   Halaman khusus: render isi konten (beranda, katalog, produk, keranjang,
   pesanan, formulir, kreator, FAQ) didelegasikan ke modul fitur
   melalui dynamic import sesuai pathname.
   ===================================================================== */

import { STORAGE_KEYS, storageGet, storageUpdate, fetchJSON, escapeHTML, qs, qsa, clearChildren } from "./utils.js";

/* ------------------------------------------------------------------
   Perutean halaman → modul fitur + fungsi init.
   ------------------------------------------------------------------ */
const PAGE_ROUTES = {
  "index.html": { module: "./catalog.js", init: "initHome" },
  "katalog.html": { module: "./catalog.js", init: "initKatalog" },
  "produk.html": { module: "./catalog.js", init: "initDetailProduk" },
  "keranjang.html": { module: "./cart.js", init: "initKeranjang" },
  "checkout.html": { module: "./orders.js", init: "initCheckout" },
  "pembayaran.html": { module: "./orders.js", init: "initPembayaran" },
  "konfirmasi.html": { module: "./orders.js", init: "initKonfirmasi" },
  "status.html": { module: "./orders.js", init: "initStatus" },
  "riwayat.html": { module: "./orders.js", init: "initRiwayat" },
  "aspirasi.html": { module: "./forms.js", init: "initAspirasi" },
  "aspirasi-status.html": { module: "./forms.js", init: "initStatusTiket" },
  "dsc.html": { module: "./forms.js", init: "initDsc" },
};

let cartBadgeFreshener = () => {};

/* ------------------------------------------------------------------
   Badge keranjang di navbar.
   ------------------------------------------------------------------ */
function refreshCartBadge() {
  const badge = document.getElementById("cart-badge");
  if (!badge) return;
  const cart = storageGet(STORAGE_KEYS.cart) ?? [];
  const totalQty = cart.reduce((sum, item) => sum + (Number(item.qty) || 0), 0);
  if (totalQty > 0) {
    badge.textContent = String(totalQty);
    badge.removeAttribute("hidden");
  } else {
    badge.setAttribute("hidden", "");
  }
}

function watchCartForBadge() {
  try {
    window.addEventListener("storage", (event) => {
      if (!event.key || event.key === STORAGE_KEYS.cart) refreshCartBadge();
    });
  } catch (err) {
    /* Abaikan: peramban tanpa dukungan penuh tetap berjalan. */
  }
}

/* ------------------------------------------------------------------
   Menu hamburger.
   ------------------------------------------------------------------ */
function setupNavToggle() {
  const nav = document.querySelector(".nav");
  const toggle = document.querySelector(".nav__toggle");
  if (!nav || !toggle) return;

  const closeMenu = () => {
    nav.classList.remove("nav--open");
    toggle.setAttribute("aria-expanded", "false");
  };

  toggle.addEventListener("click", () => {
    const isOpen = nav.classList.toggle("nav--open");
    toggle.setAttribute("aria-expanded", String(isOpen));
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") closeMenu();
  });

  qsa(".nav__menu a").forEach((link) => {
    link.addEventListener("click", closeMenu);
  });
}

/* ------------------------------------------------------------------
   Tautan nav aktif sesuai halaman.
   ------------------------------------------------------------------ */
function markActiveNavLink() {
  const here = window.location.pathname.split("/").pop() || "index.html";
  qsa(".nav__menu a").forEach((link) => {
    if (link.getAttribute("href") === here) {
      link.setAttribute("aria-current", "page");
    }
  });
}

/* ------------------------------------------------------------------
   Footer: kontak dari config (teks polos) + tahun berjalan.
   ------------------------------------------------------------------ */
async function renderFooterData() {
  const yearNode = document.getElementById("footer-year");
  if (yearNode) yearNode.textContent = String(new Date().getFullYear());

  const contactNode = document.getElementById("footer-contact");
  if (!contactNode) return;
  const config = await fetchJSON("./data/config.json");
  if (!config || !config.admin_contact) {
    contactNode.textContent = "Kontak panitia akan diumumkan di sekolah.";
    return;
  }
  /* Kontak hanya teks polos — tidak boleh jadi tautan pesan instan. */
  contactNode.textContent = config.admin_contact;
}

/* ------------------------------------------------------------------
   Render FAQ (data-driven, dipanggil hanya di faq.html).
   ------------------------------------------------------------------ */
async function renderFaq() {
  const target = document.getElementById("faq-accordion");
  if (!target) return;

  target.innerHTML = Array.from({ length: 4 })
    .map(() => '<div class="skeleton skeleton--card"></div>')
    .join("");

  const data = await fetchJSON("./data/faq.json", { defaultValue: { groups: [] } });
  clearChildren(target);

  if (!data.groups || data.groups.length === 0) {
    target.innerHTML =
      '<div class="alert alert-danger">Maaf, daftar FAQ gagal dimuat. Coba muat ulang halaman.</div>';
    return;
  }

  let itemIndex = 0;
  data.groups.forEach((group) => {
    const heading = document.createElement("h2");
    heading.className = "heading-2";
    heading.textContent = group.title;
    target.appendChild(heading);

    group.items.forEach((item) => {
      itemIndex += 1;
      const details = document.createElement("details");
      details.className = "accordion__item";
      details.innerHTML = `
        <summary class="accordion__trigger">${escapeHTML(item.question)}</summary>
        <div class="accordion__content">
          <p>${escapeHTML(item.answer)}</p>
        </div>
      `;
      target.appendChild(details);
    });
  });
}

/* ------------------------------------------------------------------
   Render daftar kreator (dipanggil hanya di kreator.html).
   ------------------------------------------------------------------ */
async function renderKreator() {
  const target = document.getElementById("creators-grid");
  if (!target) return;

  target.innerHTML = Array.from({ length: 4 })
    .map(() => '<div class="skeleton skeleton--card"></div>')
    .join("");

  const [creators, products] = await Promise.all([
    fetchJSON("./data/creators.json", { defaultValue: null }),
    fetchJSON("./data/products.json", { defaultValue: null }),
  ]);
  clearChildren(target);

  if (!creators || !Array.isArray(creators)) {
    target.innerHTML =
      '<div class="alert alert-danger">Maaf, daftar kreator gagal dimuat. Coba muat ulang halaman.</div>';
    return;
  }

  const active = creators.filter((creator) => creator.is_active !== false);
  active.forEach((creator) => {
    const initials = creator.name
      .split(/\s+/)
      .map((part) => part.charAt(0))
      .slice(0, 2)
      .join("")
      .toUpperCase();
    const totalKarya = (products ?? []).filter(
      (product) => product.creator_id === creator.id && product.is_active !== false
    ).length;
    const card = document.createElement("article");
    card.className = "card card-creator";
    card.innerHTML = `
      <div class="card-creator__body">
        <span class="card-creator__avatar" aria-hidden="true">${escapeHTML(initials)}</span>
        <div>
          <h2 class="heading-3">${escapeHTML(creator.name)}</h2>
          <p class="card-creator__meta">Kelas ${escapeHTML(creator.class_name ?? "")}</p>
        </div>
      </div>
      <p>${escapeHTML(creator.bio)}</p>
      <p class="card-creator__meta">${totalKarya} karya aktif di katalog</p>
    `;
    target.appendChild(card);
  });

  if (active.length === 0) {
    target.innerHTML =
      '<div class="empty-state"><p class="empty-state__title">Belum ada kreator aktif.</p></div>';
  }
}

/* ------------------------------------------------------------------
   Bootstrap.
   ------------------------------------------------------------------ */
async function bootstrap() {
  setupNavToggle();
  markActiveNavLink();
  refreshCartBadge();
  watchCartForBadge();
  renderFooterData();

  const page = window.location.pathname.split("/").pop() || "index.html";
  const route = PAGE_ROUTES[page];
  if (route) {
    const feature = await import(route.module);
    await feature[route.init]();
  } else if (page === "faq.html") {
    await renderFaq();
  } else if (page === "kreator.html") {
    await renderKreator();
  }
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", () => {
    bootstrap();
  });
} else {
  bootstrap();
}

export { refreshCartBadge as __refreshCartBadge };
