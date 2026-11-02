/* =====================================================================
   admin-orders.js — Kelola pesanan & verifikasi pembayaran (admin).
   ---------------------------------------------------------------------
   Sumber: merch_orders_v1 (lokal + "data contoh" dari order-status.json).
   Halaman: pesanan.html (semua status; modul diload langsung) dan
   pembayaran.html (antrean bukti; dimuat oleh admin-core.js).
   Tindakan: maju status pesanan / tolak bukti pembayaran.
   ================================================================== */

import { STORAGE_KEYS, storageGet, storageSet, fetchJSON, formatRupiah, formatTanggal, escapeHTML, showToast, qs, clearChildren, badgeHTML, downloadJSON } from "./utils.js";
import { requireSession } from "./admin-core.js";
import { ORDER_STATUS_FLOW, ORDER_STATUS_LABEL, readOrders, saveOrder, findOrder } from "./orders.js";

const STATUS_TONE = {
  "menunggu-pembayaran": "warning",
  "menunggu-verifikasi": "warning",
  "terverifikasi": "info",
  "sedang-disiapkan": "info",
  "siap-diambil": "success",
  "selesai": "success",
  "ditolak": "danger",
};

function renderOrderRow(order, allowed) {
  const current = ORDER_STATUS_FLOW.indexOf(order.status);
  const nextStatus = current >= 0 && current < ORDER_STATUS_FLOW.length - 1 ? ORDER_STATUS_FLOW[current + 1] : null;
  return `
    <tr data-order="${escapeHTML(order.code)}">
      <td><strong>${escapeHTML(order.code)}</strong><br><span class="form-hint">${escapeHTML(formatTanggal(order.updated_at))}</span></td>
      <td>${escapeHTML(order.buyer?.name ?? "—")}<br><span class="form-hint">${escapeHTML(order.buyer?.class_name ?? "")}</span></td>
      <td>${escapeHTML((order.items ?? []).map((item) => `${item.name} (${item.variant_name}) × ${item.qty}`).join(", ")) || "—"}</td>
      <td>${formatRupiah(order.subtotal)}<br>${badgeHTML(order.payment_method === "qris" ? "QRIS" : "Transfer", "info")}</td>
      <td>${badgeHTML(ORDER_STATUS_LABEL[order.status] ?? order.status, STATUS_TONE[order.status] ?? "info")}${order.proof_note ? `<br><span class="form-hint">Bukti: ${escapeHTML(order.proof_note)}</span>` : ""}</td>
      <td>
        ${nextStatus && allowed.includes(order.status) ? `<button type="button" class="btn btn-primary btn-sm" data-action="advance" data-next="${escapeHTML(nextStatus)}">→ ${escapeHTML(ORDER_STATUS_LABEL[nextStatus])}</button>` : ""}
        ${order.status === "menunggu-verifikasi" ? '<button type="button" class="btn btn-ghost btn-sm" data-action="reject">Tolak bukti</button>' : ""}
      </td>
    </tr>
  `;
}

/* ------------------------------------------------------------------
   Draw pesanan (dipakai dua halaman dengan filter berbeda).
   ------------------------------------------------------------------ */
function draw(main, { statusesFilter } = {}) {
  if (!main) return;
  const orders = readOrders()
    .filter((order) => !statusesFilter || statusesFilter.includes(order.status))
    .sort((a, b) => String(b.updated_at ?? "").localeCompare(String(a.updated_at ?? "")));
  const allowed = ["menunggu-pembayaran", "menunggu-verifikasi", "terverifikasi", "sedang-disiapkan", "siap-diambil"];

  main.innerHTML = `
    <article class="admin-panel">
      <div class="admin-panel__header">
        <h2 class="heading-3">${statusesFilter ? "Antrean pembayaran" : "Semua pesanan"}</h2>
        <div class="admin-panel__actions">
          <button id="load-order-demo" class="btn btn-outline btn-sm" type="button">Muat data contoh</button>
          <button id="export-orders" class="btn btn-ghost btn-sm" type="button">Unduh JSON</button>
        </div>
      </div>
      <div class="admin-table-wrapper"><table>
        <thead><tr><th>Kode</th><th>Pembeli</th><th>Item</th><th>Total & metode</th><th>Status</th><th>Tindakan</th></tr></thead>
        <tbody>
          ${orders.map((order) => renderOrderRow(order, allowed)).join("") || '<tr><td colspan="6">Belum ada pesanan. Muat data contoh untuk simulasi.</td></tr>'}
        </tbody>
      </table></div>
      <p class="form-hint">Semua perubahan berdampak bagi pembeli yang melacak lewat halaman status dengan kode yang sama.</p>
    </article>
  `;

  qs("#export-orders", main)?.addEventListener("click", () => downloadJSON("orders-ekspor.json", readOrders()));
  qs("#load-order-demo", main)?.addEventListener("click", async () => {
    const demo = await fetchJSON("../data/order-status.json", {});
    if (Array.isArray(demo?.records)) {
      const current = (storageGet(STORAGE_KEYS.orders) ?? []).filter((order) => order.source !== "demo");
      storageSet(STORAGE_KEYS.orders, [...demo.records.map((record) => ({ ...record, source: "demo" })), ...current]);
      showToast("Data contoh pesanan dimuat.", { type: "info" });
      draw(main, { statusesFilter });
    }
  });
}

function attachRowActions(main) {
  main.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-action]");
    if (!button) return;
    const row = button.closest("tr[data-order]");
    const order = findOrder(row?.getAttribute("data-order") ?? "");
    if (!order) return;
    const action = button.getAttribute("data-action");
    if (action === "advance") {
      order.status = button.getAttribute("data-next");
    } else if (action === "reject") {
      order.status = "ditolak";
    } else {
      return;
    }
    order.updated_at = new Date().toISOString();
    saveOrder(order);
    showToast(`Pesanan ${order.code} → ${ORDER_STATUS_LABEL[order.status]}.`, { type: "success" });
    /* Redraw ringan: bangun ulang tabel dengan filter halaman aktif. */
    const isQueue = window.location.pathname.includes("pembayaran.html");
    draw(main, isQueue ? { statusesFilter: ["menunggu-verifikasi", "menunggu-pembayaran"] } : {});
  });
}

/* ------------------------------------------------------------------
   Init halaman.
   ------------------------------------------------------------------ */
export function initPesanan(main) {
  requireSession(() => draw(main, {}));
  attachRowActions(main);
}

export function initPembayaran(main) {
  requireSession(() => draw(main, { statusesFilter: ["menunggu-verifikasi", "menunggu-pembayaran"] }));
  attachRowActions(main);
}

/* Self-init: halaman pesanan.html memuat modul ini langsung. */
if (window.location.pathname.includes("pesanan.html")) {
  const main = document.getElementById("main-content");
  if (main) initPesanan(main);
}
