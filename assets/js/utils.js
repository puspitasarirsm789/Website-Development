/* =====================================================================
   utils.js — Fondasi bersama seluruh laman (publik & admin)
   ---------------------------------------------------------------------
   Penyimpanan lokal aman (try/catch + fallback in-memory), pengambilan
   data JSON dengan cache-busting, util format mata uang/teks, toast,
   dan helper DOM. Tidak ada logika bisnis toko di sini.
   ===================================================================== */

const STORAGE_KEYS = {
  cart: "merch_cart_v1",
  orders: "merch_orders_v1",
  tickets: "merch_tickets_v1",
  admin: "merch_admin_v1",
};

/* ------------------------------------------------------------------
   Penyimpanan: localStorage bisa gagal (mode privat / penuh / file://).
   Seluruh akses dibungkus try/catch dan beralih ke objek in-memory.
   ------------------------------------------------------------------ */
const memoryStore = new Map();

function storageGet(key) {
  try {
    const raw = window.localStorage.getItem(key);
    if (raw === null) {
      return memoryStore.has(key) ? memoryStore.get(key) : null;
    }
    return JSON.parse(raw);
  } catch (err) {
    console.warn("[utils] localStorage tidak tersedia, pakai memori.", err);
    return memoryStore.has(key) ? memoryStore.get(key) : null;
  }
}

function storageSet(key, value) {
  const serialized = JSON.stringify(value);
  memoryStore.set(key, value);
  try {
    window.localStorage.setItem(key, serialized);
  } catch (err) {
    /* Abaikan: nilai tetap hidup di memoryStore untuk sesi ini. */
  }
  return value;
}

function storageUpdate(key, updater, fallback) {
  const current = storageGet(key) ?? fallback;
  const next = updater(current);
  storageSet(key, next);
  return next;
}

function storageRemove(key) {
  memoryStore.delete(key);
  try {
    window.localStorage.removeItem(key);
  } catch (err) {
    /* Abaikan. */
  }
}

/* ------------------------------------------------------------------
   Jaringan data: fetch JSON statis dengan cache-busting + error lembut.
   ------------------------------------------------------------------ */
async function fetchJSON(path, { defaultValue = null } = {}) {
  try {
    const url = path + (path.includes("?") ? "&" : "?") + "t=" + Date.now();
    const response = await fetch(url, { cache: "no-store" });
    if (!response.ok) throw new Error("HTTP " + response.status + " pada " + path);
    return await response.json();
  } catch (err) {
    console.warn("[utils] Gagal memuat data:", path, err);
    return defaultValue;
  }
}

/* ------------------------------------------------------------------
   Format & teks.
   ------------------------------------------------------------------ */
const rupiahFormatter = new Intl.NumberFormat("id-ID", {
  maximumFractionDigits: 0,
});

function formatRupiah(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return "Rp0";
  return "Rp" + rupiahFormatter.format(number);
}

function formatTanggal(isoString) {
  if (!isoString) return "—";
  const date = new Date(isoString);
  if (Number.isNaN(date.getTime())) return isoString;
  return new Intl.DateTimeFormat("id-ID", {
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function escapeHTML(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function slugToTitle(slug) {
  return String(slug ?? "")
    .split(/[-_]/)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

/* ------------------------------------------------------------------
   Query param & ID acak.
   ------------------------------------------------------------------ */
function queryParam(name) {
  return new URLSearchParams(window.location.search).get(name);
}

function generateCode(prefix) {
  const year = new Date().getFullYear();
  let suffix = "";
  for (let i = 0; i < 4; i += 1) {
    suffix += String(Math.floor(Math.random() * 10));
  }
  return `${prefix}-${year}-${suffix}`;
}

function generateUniqueCode(prefix, existingCodes) {
  const taken = new Set(existingCodes);
  let code = generateCode(prefix);
  while (taken.has(code)) {
    code = generateCode(prefix);
  }
  return code;
}

/* ------------------------------------------------------------------
   SHA-256 untuk verifikasi passcode (crypto.subtle; localhost & HTTPS
   adalah secure context sehingga tersedia).
   ------------------------------------------------------------------ */
async function sha256Hex(text) {
  const bytes = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

/* ------------------------------------------------------------------
   Toast (butuh #toast-container aria-live di halaman).
   ------------------------------------------------------------------ */
function showToast(message, { type = "info", duration = 3800 } = {}) {
  const container = document.getElementById("toast-container");
  if (!container) return;
  const toast = document.createElement("div");
  toast.className = `toast toast--${type}`;
  toast.setAttribute("role", "status");
  toast.textContent = message;
  container.appendChild(toast);
  window.setTimeout(() => {
    toast.remove();
  }, duration);
}

/* ------------------------------------------------------------------
   Helper DOM ringan.
   ------------------------------------------------------------------ */
function qs(selector, scope = document) {
  return scope.querySelector(selector);
}

function qsa(selector, scope = document) {
  return Array.from(scope.querySelectorAll(selector));
}

function clearChildren(node) {
  while (node && node.firstChild) {
    node.removeChild(node.firstChild);
  }
}

function badgeHTML(text, tone) {
  const toneClass = tone ? ` badge-${tone}` : "";
  return `<span class="badge${toneClass}">${escapeHTML(text)}</span>`;
}

function downloadJSON(filename, data) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export {
  STORAGE_KEYS,
  storageGet,
  storageSet,
  storageUpdate,
  storageRemove,
  fetchJSON,
  formatRupiah,
  formatTanggal,
  escapeHTML,
  slugToTitle,
  queryParam,
  generateCode,
  generateUniqueCode,
  sha256Hex,
  showToast,
  qs,
  qsa,
  clearChildren,
  badgeHTML,
  downloadJSON,
};
