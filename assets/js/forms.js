/* =====================================================================
   forms.js — Formulir aspirasi & DSC + pelacakan tiket.
   ---------------------------------------------------------------------
   Tiket tersimpan di merch_tickets_v1: { code, type, title, category,
   detail, status, created_at, updated_at }. Pelacakan menggabungkan
   tiket lokal dengan data contoh dari JSON statis.
   Status: aspirasi = diterima / ditinjau / diproses / selesai.
           dsc       = menunggu-review / perlu-revisi / disetujui.
   ================================================================== */

import { STORAGE_KEYS, storageGet, storageSet, fetchJSON, formatTanggal, escapeHTML, queryParam, generateUniqueCode, showToast, qs, qsa, clearChildren, badgeHTML } from "./utils.js";

export const ASPIRASI_STATUS_LABEL = {
  "diterima": "Diterima",
  "ditinjau": "Ditinjau",
  "diproses": "Diproses",
  "selesai": "Selesai",
};

export const DSC_STATUS_LABEL = {
  "menunggu-review": "Menunggu Review",
  "perlu-revisi": "Perlu Revisi",
  "disetujui": "Disetujui",
};

const TONE = {
  "diterima": "info",
  "ditinjau": "warning",
  "diproses": "warning",
  "selesai": "success",
  "menunggu-review": "warning",
  "perlu-revisi": "danger",
  "disetujui": "success",
};

function normalizeTicket(record) {
  if (!record || typeof record !== "object") return null;
  const code = record.code ?? record.ticket_code ?? "";
  return {
    ...record,
    code,
    title: record.title ?? "Tanpa judul",
    category: record.category ?? "",
    detail: record.detail ?? record.response ?? "—",
    sender: record.sender ?? "—",
    status: record.status ?? (record.type === "dsc" ? "menunggu-review" : "diterima"),
    created_at: record.created_at ?? record.submitted_at ?? null,
    updated_at: record.updated_at ?? record.submitted_at ?? null,
  };
}

function readTickets() {
  const tickets = storageGet(STORAGE_KEYS.tickets);
  if (!Array.isArray(tickets)) return [];
  return tickets.map(normalizeTicket).filter((ticket) => ticket && ticket.code);
}

export function saveTicket(ticket) {
  const tickets = readTickets();
  const index = tickets.findIndex((entry) => entry.code === ticket.code);
  if (index === -1) tickets.unshift(ticket);
  else tickets[index] = ticket;
  storageSet(STORAGE_KEYS.tickets, tickets);
  return ticket;
}

export function findTicket(code) {
  return readTickets().find((entry) => entry.code === code);
}

function ticketBadge(entry) {
  const label = (entry.type === "dsc" ? DSC_STATUS_LABEL : ASPIRASI_STATUS_LABEL)[entry.status] ?? entry.status;
  return badgeHTML(label, TONE[entry.status] ?? "info");
}

function submitTicketHandler({ type, prefix, statusField }) {
  return async (event) => {
    event.preventDefault();
    const title = document.getElementById(`${type}-title`);
    const category = document.getElementById(`${type}-category`);
    const detail = document.getElementById(`${type}-detail`);
    const sender = document.getElementById(`${type}-sender`);

    if (!title?.value.trim() || title.value.trim().length < 4) {
      showToast("Judul minimal 4 karakter.", { type: "warning" });
      title?.focus();
      return;
    }
    if (!detail?.value.trim() || detail.value.trim().length < 10) {
      showToast("Detail minimal 10 karakter supaya mudah ditindaklanjuti.", { type: "warning" });
      detail?.focus();
      return;
    }

    const now = new Date().toISOString();
    const ticket = {
      code: generateUniqueCode(prefix, readTickets().map((entry) => entry.code)),
      type,
      title: title.value.trim(),
      category: category?.value.trim() ?? "",
      detail: detail.value.trim(),
      sender: sender?.value.trim() || "Anonim",
      status: (statusField?.[category?.value] ?? null) || Object.keys(type === "dsc" ? DSC_STATUS_LABEL : ASPIRASI_STATUS_LABEL)[0],
      created_at: now,
      updated_at: now,
    };
    saveTicket(ticket);

    const result = document.getElementById(`${type}-result`);
    if (result) {
      result.innerHTML = `
        <div class="alert alert-success" role="status">
          Tiket tersimpan dengan kode <strong>${escapeHTML(ticket.code)}</strong>.
          Lacak di <a href="./aspirasi-status.html?tiket=${encodeURIComponent(ticket.code)}">halaman status</a>.
        </div>
      `;
    }
    showToast("Terima kasih! Tiket aspirasimu masuk antrean.", { type: "success" });
    event.target.reset();
  };
}

/* ==================================================================
   aspirasi.html
   ================================================================== */
export async function initAspirasi() {
  const form = document.getElementById("aspirasi-form");
  if (!form) return;

  /* Opsi kategori dari divisions.json agar sinkron dengan unit kerja. */
  const categorySelect = document.getElementById("aspirasi-category");
  if (categorySelect) {
    const divisions = await fetchJSON("./data/divisions.json", { defaultValue: null });
    if (Array.isArray(divisions) && divisions.length > 0) {
      categorySelect.innerHTML =
        '<option value="">— Pilih bidang tujuan —</option>' +
        divisions.map((division) => `<option value="${escapeHTML(division.id)}">${escapeHTML(division.name)}</option>`).join("");
    }
  }

  form.addEventListener("submit", submitTicketHandler({ type: "aspirasi", prefix: "ASP" }));
}

/* ==================================================================
   aspirasi-status.html?tiket=… — gabungkan tiket lokal + data contoh.
   ================================================================== */
export async function initStatusTiket() {
  const lookupForm = document.getElementById("ticket-lookup-form");
  const resultTarget = document.getElementById("ticket-lookup-result");
  if (!resultTarget) return;

  const sampleByType = {
    aspirasi: await fetchJSON("./data/aspirasi-status.json", { defaultValue: null }),
    dsc: await fetchJSON("./data/dsc-status.json", { defaultValue: null }),
  };

  const renderTicket = (entry) => {
    const label = (entry.type === "dsc" ? DSC_STATUS_LABEL : ASPIRASI_STATUS_LABEL)[entry.status] ?? entry.status;
    return `
      <article class="card">
        <div class="card-product__body">
          <div class="cluster cluster--between">
            <h2 class="heading-3">${escapeHTML(entry.code)}</h2>
            ${badgeHTML(label, TONE[entry.status] ?? "info")}
          </div>
          <h3 class="heading-4">${escapeHTML(entry.title)}</h3>
          <p>${escapeHTML(entry.detail)}</p>
          <p class="form-hint">Masuk ${escapeHTML(formatTanggal(entry.created_at))} · terakhir ${escapeHTML(formatTanggal(entry.updated_at))}</p>
        </div>
      </article>
    `;
  };

  const drawFromCode = (code) => {
    clearChildren(resultTarget);
    if (!code) return;
    const local = findTicket(code);
    if (local) {
      resultTarget.innerHTML = renderTicket(local);
      return;
    }
    const prefix = code.split("-")[0] === "DSC" ? "dsc" : "aspirasi";
    const sample = (sampleByType[prefix]?.records ?? []).find((entry) => entry.code === code);
    if (sample) {
      const normalized = { ...sample, type: prefix };
      resultTarget.innerHTML = renderTicket(normalized);
      return;
    }
    resultTarget.innerHTML = `
      <div class="empty-state">
        <p class="empty-state__title">Tiket tidak ditemukan.</p>
        <p class="empty-state__desc">Periksa kode, atau hubungi panitia Ruang 204 untuk bantuan.</p>
      </div>
    `;
  };

  lookupForm?.addEventListener("submit", (event) => {
    event.preventDefault();
    const input = document.getElementById("ticket-lookup");
    drawFromCode((input?.value ?? "").trim().toUpperCase());
  });

  drawFromCode(queryParam("tiket") ?? queryParam("order"));
}

/* ==================================================================
   dsc.html — kanal karya divisi.
   ================================================================== */
export function initDsc() {
  const form = document.getElementById("dsc-form");
  if (!form) return;
  form.addEventListener("submit", submitTicketHandler({ type: "dsc", prefix: "DSC" }));
}

/* Ekspor untuk admin. */
export { readTickets};
