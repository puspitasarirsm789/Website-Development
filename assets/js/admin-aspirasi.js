/* =====================================================================
   admin-aspirasi.js — Kelola tiket aspirasi & karya DSC (admin).
   ---------------------------------------------------------------------
   Sumber: merch_tickets_v1 (tiket lokal) + "data contoh" dari JSON statis.
   Halaman: aspirasi.html (semua tiket; direct) dan dsc.html (khusus DSC;
   dimuat oleh admin-core.js). Tindakan: maju status tiket.
   ================================================================== */

import { STORAGE_KEYS, storageGet, storageSet, fetchJSON, formatTanggal, escapeHTML, showToast, qs, badgeHTML, downloadJSON } from "./utils.js";
import { requireSession } from "./admin-core.js";
import { ASPIRASI_STATUS_LABEL, DSC_STATUS_LABEL, readTickets } from "./forms.js";

const STATUS_TONE = {
  "diterima": "info",
  "ditinjau": "warning",
  "diproses": "warning",
  "selesai": "success",
  "menunggu-review": "warning",
  "perlu-revisi": "danger",
  "disetujui": "success",
};

function nextStatus(status, labels, allowed) {
  const keys = Object.keys(labels).filter((key) => allowed.includes(key));
  const current = keys.indexOf(status);
  return current >= 0 && current < keys.length - 1 ? keys[current + 1] : null;
}

function renderTicketRow(ticket) {
  const labels = ticket.type === "dsc" ? DSC_STATUS_LABEL : ASPIRASI_STATUS_LABEL;
  const allowed = ["diterima", "ditinjau", "diproses", "selesai", "menunggu-review", "perlu-revisi", "disetujui"];
  const next = nextStatus(ticket.status, labels, allowed);
  const revise = ticket.type !== "dsc" && ticket.status === "ditinjau";
  return `
    <tr data-ticket="${escapeHTML(ticket.code)}">
      <td><strong>${escapeHTML(ticket.code)}</strong><br><span class="form-hint">${escapeHTML(formatTanggal(ticket.updated_at))}</span></td>
      <td>${ticket.type === "dsc" ? badgeHTML("Karya", "info") : badgeHTML("Aspirasi", "info")}</td>
      <td>${escapeHTML(ticket.title)}<br><span class="form-hint">${escapeHTML(ticket.category ?? "")} · oleh ${escapeHTML(ticket.sender ?? "Anonim")}</span></td>
      <td>${escapeHTML(ticket.detail)}</td>
      <td>${badgeHTML(labels[ticket.status] ?? ticket.status, STATUS_TONE[ticket.status] ?? "info")}</td>
      <td>
        ${next ? `<button type="button" class="btn btn-primary btn-sm" data-action="advance" data-next="${escapeHTML(next)}">→ ${escapeHTML(labels[next])}</button>` : ""}
        ${revise ? '<button type="button" class="btn btn-ghost btn-sm" data-action="reopen">Buka kembali</button>' : ""}
      </td>
    </tr>
  `;
}

function draw(main, { ticketsFilter } = {}) {
  if (!main) return;
  const tickets = readTickets()
    .filter((ticket) => !ticketsFilter || ticketsFilter.includes(ticket.type))
    .sort((a, b) => String(b.updated_at ?? "").localeCompare(String(a.updated_at ?? "")));

  main.innerHTML = `
    <article class="admin-panel">
      <div class="admin-panel__header">
        <h2 class="heading-3">${ticketsFilter?.includes("dsc") ? "Kursus karya (DSC)" : "Semua tiket"}</h2>
        <div class="admin-panel__actions">
          <button id="load-ticket-demo" class="btn btn-outline btn-sm" type="button">Muat data contoh</button>
          <button id="export-tickets" class="btn btn-ghost btn-sm" type="button">Unduh JSON</button>
        </div>
      </div>
      <div class="admin-table-wrapper"><table>
        <thead><tr><th>Kode</th><th>Jenis</th><th>Judul</th><th>Detail</th><th>Status</th><th>Tindakan</th></tr></thead>
        <tbody>
          ${tickets.map(renderTicketRow).join("") || '<tr><td colspan="6">Belum ada tiket. Muat data contoh untuk simulasi.</td></tr>'}
        </tbody>
      </table></div>
      <p class="form-hint">Tindakan status berpengaruh pada hasil pelacakan pengguna (aspirasi-status.html).</p>
    </article>
  `;

  qs("#export-tickets", main)?.addEventListener("click", () => downloadJSON("tiket-ekspor.json", readTickets()));
  qs("#load-ticket-demo", main)?.addEventListener("click", async () => {
    const [aspirasiDemo, dscDemo] = await Promise.all([
      fetchJSON("../data/aspirasi-status.json", {}),
      fetchJSON("../data/dsc-status.json", {}),
    ]);
    const demoTickets = [
      ...(Array.isArray(aspirasiDemo?.records) ? aspirasiDemo.records.map((record) => ({ ...record, type: "aspirasi" })) : []),
      ...(Array.isArray(dscDemo?.records) ? dscDemo.records.map((record) => ({ ...record, type: "dsc" })) : []),
    ];
    if (demoTickets.length > 0) {
      const current = (storageGet(STORAGE_KEYS.tickets) ?? []).filter((ticket) => ticket.source !== "demo");
      storageSet(STORAGE_KEYS.tickets, [...demoTickets.map((ticket) => ({ ...ticket, source: "demo" })), ...current]);
      showToast("Data contoh tiket dimuat.", { type: "info" });
      draw(main, { ticketsFilter });
    }
  });
}

function attachRowActions(main) {
  main.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-action]");
    if (!button) return;
    const row = button.closest("tr[data-ticket]");
    const code = row?.getAttribute("data-ticket") ?? "";
    const tickets = readTickets();
    const ticket = tickets.find((entry) => entry.code === code);
    if (!ticket) return;
    const action = button.getAttribute("data-action");
    if (action === "advance") {
      ticket.status = button.getAttribute("data-next");
    } else if (action === "reopen") {
      ticket.status = "diproses";
    } else {
      return;
    }
    ticket.updated_at = new Date().toISOString();
    const updatedList = tickets.map((entry) => (entry.code === code ? ticket : entry));
    storageSet(STORAGE_KEYS.tickets, updatedList);
    showToast(`Tiket ${code} → ${ticket.status}.`, { type: "success" });
    const isDsc = window.location.pathname.includes("dsc.html");
    draw(main, isDsc ? { ticketsFilter: ["dsc"] } : {});
  });
}

/* ------------------------------------------------------------------
   Init halaman.
   ------------------------------------------------------------------ */
export function initAspirasi(main) {
  requireSession(() => draw(main, {}));
  attachRowActions(main);
}

export function initDscTickets(main) {
  requireSession(() => draw(main, { ticketsFilter: ["dsc"] }));
  attachRowActions(main);
}

/* Self-init: aspirasi.html memuat modul ini langsung. */
if (window.location.pathname.includes("aspirasi.html") && window.location.pathname.includes("/admin/")) {
  const main = document.getElementById("main-content");
  if (main) initAspirasi(main);
}
