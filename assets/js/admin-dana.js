/* =====================================================================
   admin-dana.js — Buku kas OSIS (admin/dana.html).
   ---------------------------------------------------------------------
   Sumber: data/ledger.json (read-only). Tampilan ringkasan kas sah vs
   menunggu persetujuan + tabel global + ekspor ledger.json.
   ================================================================== */

import { fetchJSON, formatRupiah, formatTanggal, escapeHTML, showToast, qs, badgeHTML, downloadJSON } from "./utils.js";
import { requireSession } from "./admin-core.js";

const STATUS_TONE = {
  "selesai": "success",
  "terverifikasi": "info",
  "menunggu-persetujuan": "warning",
};

async function draw(main) {
  const ledger = await fetchJSON("../data/ledger.json", { defaultValue: null });
  const records = Array.isArray(ledger?.records) ? ledger.records : [];

  const summary = records.reduce(
    (acc, record) => {
      const amount = Number(record.amount) || 0;
      if (record.status === "selesai") acc.cash += amount;
      else acc.pending += amount;
      return acc;
    },
    { cash: 0, pending: 0 }
  );
  const feePercent = Number(ledger?.osis_fee_percent ?? 0);

  main.innerHTML = `
    <div class="grid-3">
      <article class="card"><div class="card-product__body"><p class="card-product__category">Kas sah</p><p class="heading-2">${formatRupiah(summary.cash)}</p><p class="form-hint">Transaksi berstatus selesai</p></div></article>
      <article class="card"><div class="card-product__body"><p class="card-product__category">Menunggu</p><p class="heading-2">${formatRupiah(summary.pending)}</p><p class="form-hint">Belum diakui kas sah</p></div></article>
      <article class="card"><div class="card-product__body"><p class="card-product__category">Dana OSIS</p><p class="heading-2">${feePercent}%</p><p class="form-hint">Sudah memotong harga produk</p></div></article>
    </div>
    <article class="admin-panel">
      <div class="admin-panel__header">
        <h2 class="heading-3">Riwayat global</h2>
        <div class="admin-panel__actions">
          <button id="export-ledger" class="btn btn-outline btn-sm" type="button">Unduh ledger.json</button>
        </div>
      </div>
      <div class="admin-table-wrapper"><table>
        <thead><tr><th>Kode</th><th>Tanggal</th><th>Keterangan</th><th>Sumber</th><th>Nominal</th><th>Status</th></tr></thead>
        <tbody>
          ${records
            .map(
              (record) => `
            <tr>
              <td>${escapeHTML(record.code ?? "")}</td>
              <td>${escapeHTML(formatTanggal(record.date))}</td>
              <td>${escapeHTML(record.description ?? record.title ?? "—")}</td>
              <td>${escapeHTML(record.source ?? "—")}</td>
              <td>${formatRupiah(record.amount)}</td>
              <td>${badgeHTML(record.status ?? "—", STATUS_TONE[record.status] ?? "info")}</td>
            </tr>
          `
            )
            .join("") || '<tr><td colspan="6">Belum ada transaksi tercatat.</td></tr>'}
        </tbody>
      </table></div>
      <p class="form-hint">Ledger read-only di halaman ini; pembaruan dilakukan lewat berkas data/ledger.json saat publikasi.</p>
    </article>
  `;

  qs("#export-ledger", main)?.addEventListener("click", () => downloadJSON("ledger.json", ledger ?? {}));
}

if (window.location.pathname.includes("dana.html") && window.location.pathname.includes("/admin/")) {
  const main = document.getElementById("main-content");
  if (main) requireSession(() => draw(main));
}
