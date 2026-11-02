# SRS/FSD – Website Merch Sekolah (Admin: Tim OSIS)

Versi 1.0 · Dokumen spesifikasi untuk agent generator · Target: situs statis (HTML/CSS/JS) tanpa database dan tanpa backend, dipublikasikan di GitHub Pages

## 1. Pendahuluan

### 1.1 Tujuan

Dokumen ini mendefinisikan kebutuhan fungsional dan non-fungsional website merchandise sekolah yang dikelola tim OSIS. Dokumen dipakai sebagai acuan tunggal bagi agent generator (AI/code generator) untuk membangun seluruh situs.

### 1.2 Ruang Lingkup

Website menyediakan: katalog merch karya kreator/penjual siswa, keranjang, checkout, informasi pembayaran, status pesanan, kanal aspirasi dan evaluasi siswa, layanan divisi organisasi (Division Service Center), serta perangkat admin/penjual untuk mengelola data.

### 1.3 Batasan Teknis Wajib (Hard Constraints)

| ID | Batasan |
| --- | --- |
| C-01 | Hanya file statis: HTML, CSS, JavaScript (vanilla atau library via CDN/di-bundle). Tidak ada server, API milik sendiri, maupun database. |
| C-02 | Harus berjalan di GitHub Pages, termasuk saat di-host pada sub-path (misal /nama-repo/). Semua path wajib relatif. |
| C-03 | Tidak ada proses build wajib. Boleh dibuka langsung dari folder (atau dengan server statis sederhana). Build tool opsional dan tidak boleh menjadi syarat deploy. |
| C-04 | Data konten disimpan sebagai file JSON di dalam repo (folder /data). Data sementara milik pengunjung disimpan di localStorage. |
| C-05 | Tidak ada integrasi dengan WhatsApp (termasuk tautan otomatis wa.me atau API), payment gateway, maupun layanan pembayaran apa pun. Pembayaran, konfirmasi pembayaran, dan pengiriman pesanan ke admin dilakukan manual di luar situs. Satu-satunya layanan pihak ketiga yang boleh dipakai adalah Google Forms (embed/link) atau endpoint form eksternal (misal Formspree) untuk aspirasi dan DSC, bersifat opsional lewat file konfigurasi. |
| C-06 | Tidak boleh ada rahasia (password, token, nomor rekening pribadi tanpa izin) yang ditanam di kode. Semua nilai yang bisa berubah diletakkan di /data/config.json. |
| C-07 | Bahasa antarmuka: Bahasa Indonesia. Mata uang: Rupiah (format Rp12.500). |

### 1.4 Definisi

| Istilah | Arti |
| --- | --- |
| Pengguna | Siswa/guru/orang tua yang memesan merch dan mengirim aspirasi |
| Penjual/Kreator | Siswa atau kelompok yang membuat dan menjual produk merch |
| Admin | Anggota OSIS yang mengelola situs |
| DSC | Division Service Center, kanal permintaan layanan ke divisi organisasi OSIS |
| Kode Pesanan | ID unik pesanan, format ORD-YYMMDD-XXXX, dibuat di sisi klien |
| Kode Tiket | ID unik aspirasi/DSC, format ASP-YYMMDD-XXXX atau DSC-YYMMDD-XXXX |

## 2. Keputusan Arsitektur (Pemetaan Kebutuhan Dinamis ke Solusi Statis)

Karena tidak ada backend dan database, fitur yang biasanya membutuhkan server diselesaikan dengan pola berikut. Agent generator wajib mengikuti pola ini dan tidak boleh mengganti dengan backend.

| Kebutuhan | Solusi Statis |
| --- | --- |
| Penyimpanan produk, kreator, FAQ, divisi | File JSON di /data, diedit admin lewat Admin Toolkit lalu di-commit ke repo |
| Keranjang belanja | localStorage (kunci: merch\_cart\_v1) |
| Pesanan masuk | Checkout menghasilkan Kode Pesanan dan Ringkasan Pesanan berupa teks terformat yang disalin/diunduh pengguna, lalu dikirim manual ke admin lewat kanal kontak yang ditampilkan di situs (tanpa integrasi). Pesanan tersimpan juga di localStorage pengguna sebagai riwayat |
| Pembayaran | Halaman instruksi saja: QRIS statis (gambar) dan/atau transfer bank/e-wallet dari config.json. Tanpa payment gateway. Pengguna membayar manual di luar situs dan admin memverifikasi secara manual |
| Konfirmasi pembayaran | Pengguna mengisi form konfirmasi yang menghasilkan teks (Kode Pesanan, nominal, metode) untuk disalin, lalu mengirimkannya manual ke admin beserta bukti transfer lewat kanal kontak yang ditampilkan |
| Status pesanan | Admin memperbarui file /data/order-status.json (hanya Kode Pesanan + status + catatan, tanpa data pribadi). Halaman pengguna mengambil file ini dan mencocokkan dengan Kode Pesanan |
| Aspirasi dan evaluasi | Formulir di situs mengirim lewat endpoint eksternal opsional (Google Forms/Formspree). Bila tidak diatur, form menghasilkan teks terformat untuk disalin dan dikirim manual ke admin. Kode Tiket dibuat di klien |
| Monitoring tindak lanjut aspirasi | File /data/aspirasi-status.json (Kode Tiket, status, tanggapan publik). Tanpa data pribadi |
| Pengelolaan oleh admin/penjual | Admin Toolkit: halaman klien yang memuat JSON, menyediakan form edit, lalu mengekspor (unduh/salin) JSON baru untuk di-commit. Opsional: commit langsung lewat GitHub REST API memakai Personal Access Token yang diinput manual dan hanya disimpan di sessionStorage |
| Autentikasi admin | Gerbang passcode sisi klien (hash SHA-256 di config.json). Ini hanya pencegah akses iseng, bukan keamanan sejati (lihat bagian 10) |
| Dashboard dan laporan | Dihitung di browser dari JSON dan data yang diimpor admin |

## 3. Peran dan Hak Akses

| Peran | Area | Kemampuan Utama |
| --- | --- | --- |
| Pengguna (publik) | Situs utama | Lihat katalog, pesan, bayar, cek status, kirim aspirasi dan DSC, baca FAQ |
| Penjual/Kreator | /admin/ (mode Penjual) | Lihat profil sendiri, tambah/edit/hapus produk milik sendiri, kelola stok, lihat pesanan produknya |
| Admin OSIS | /admin/ (mode Admin) | Semua kemampuan penjual untuk semua kreator, ditambah verifikasi pembayaran, tindak lanjut aspirasi/DSC, kelola kreator, pencatatan dana |

Pemisahan peran di sisi klien dilakukan lewat passcode berbeda per peran (daftar hash di config.json) dan filter kreator\_id untuk mode Penjual.

## 4. Stack dan Struktur Repositori

### 4.1 Stack

- HTML5 semantik, CSS modern (variabel CSS, flexbox/grid), JavaScript ES modules tanpa framework wajib.
- Boleh memakai library ringan via CDN (misal Alpine.js atau Tailwind Play CDN) bila versi disematkan secara eksplisit. Lebih disukai tanpa dependensi.
- Routing: multi-page (satu file HTML per halaman) dengan path relatif, agar aman di GitHub Pages tanpa konfigurasi rewrite. Sertakan 404.html.

### 4.2 Struktur Folder

```
/ (root repo)
├─ index.html                 Beranda
├─ katalog.html               Katalog + pencarian + kategori
├─ produk.html                Detail produk (?id=...)
├─ keranjang.html
├─ checkout.html
├─ pembayaran.html            Instruksi bayar (?order=...)
├─ konfirmasi.html            Konfirmasi pembayaran
├─ status.html                Status pesanan
├─ riwayat.html               Riwayat pesanan (dari localStorage)
├─ aspirasi.html              Form aspirasi dan evaluasi
├─ aspirasi-status.html       Monitoring tindak lanjut aspirasi
├─ dsc.html                   Division Service Center
├─ kreator.html               Profil kreator (?id=...)
├─ faq.html                   FAQ dan bantuan
├─ 404.html
├─ admin/
│  ├─ index.html              Gerbang login + dashboard
│  ├─ produk.html             Kelola produk / tambah / edit / hapus / stok
│  ├─ kreator.html            Kelola kreator/penjual
│  ├─ pesanan.html            Kelola pesanan
│  ├─ pembayaran.html         Verifikasi pembayaran
│  ├─ aspirasi.html           Tindak lanjut aspirasi dan evaluasi
│  ├─ dsc.html                Tindak lanjut permintaan layanan divisi
│  ├─ dana.html               Pencatatan penyaluran dana ke kreator
│  └─ publikasi.html          Ekspor JSON / commit ke GitHub
├─ assets/
│  ├─ css/  (main.css, admin.css)
│  ├─ js/   (app.js, cart.js, orders.js, catalog.js, forms.js, admin-*.js, utils.js)
│  └─ img/  (logo, produk/, kreator/, qris/)
├─ data/
│  ├─ config.json
│  ├─ products.json
│  ├─ creators.json
│  ├─ categories.json
│  ├─ divisions.json
│  ├─ faq.json
│  ├─ order-status.json
│  ├─ aspirasi-status.json
│  ├─ dsc-status.json
│  └─ ledger.json
├─ README.md                  Panduan deploy dan operasional OSIS
└─ .nojekyll
```

## 5. Model Data (JSON)

Semua file berupa objek dengan kunci utama berupa array, dan setiap record punya id unik berupa string.

### 5.1 config.json

| Field | Tipe | Keterangan |
| --- | --- | --- |
| school\_name, org\_name, tagline | string | Identitas sekolah dan OSIS |
| admin\_contact | string | Teks kontak admin yang ditampilkan di situs (nomor/akun dan jam layanan). Hanya ditampilkan sebagai teks, bukan tautan integrasi |
| aspirasi\_endpoint | string | URL Google Form atau Formspree. Kosong berarti form hanya menghasilkan teks untuk dikirim manual |
| payment\_methods | array | Setiap item: type (qris, bank, ewallet), label, account\_name, account\_number, qris\_image |
| order\_deadline\_note | string | Info periode pre-order/pengambilan barang |
| pickup\_info | string | Lokasi dan jadwal pengambilan (tanpa pengiriman) |
| admin\_passcodes | array | Item: role (admin atau seller), creator\_id (untuk seller), sha256 |
| github | objek | owner, repo, branch, untuk fitur publikasi opsional |
| currency\_locale | string | Default id-ID |

### 5.2 products.json

| Field | Tipe |
| --- | --- |
| id, slug | string |
| name, description | string |
| price | number (rupiah) |
| category\_id | string |
| creator\_id | string |
| images | array path gambar relatif |
| variants | array: label (misal ukuran), stock, price\_delta |
| stock | number (dipakai bila tanpa varian) |
| is\_active | boolean |
| created\_at, updated\_at | string ISO |

### 5.3 creators.json

id, name, bio, class\_or\_group, photo, contact\_public (opsional), is\_active.

### 5.4 categories.json, divisions.json, faq.json

- categories: id, name, icon.
- divisions: id, name, description, services (array nama layanan).
- faq: id, group, question, answer.

### 5.5 order-status.json

records: order\_code, status, note, updated\_at. Nilai status yang valid: MENUNGGU\_PEMBAYARAN, MENUNGGU\_VERIFIKASI, TERVERIFIKASI, DIPROSES, SIAP\_DIAMBIL, SELESAI, DIBATALKAN. File ini tidak boleh memuat nama, kelas, atau kontak pembeli.

### 5.6 aspirasi-status.json dan dsc-status.json

records: ticket\_code, status (DITERIMA, DIPROSES, DITINDAKLANJUTI, SELESAI, DITOLAK), public\_response, handled\_by\_division (opsional), updated\_at.

### 5.7 ledger.json (penyaluran dana)

records: id, order\_code\_ref (opsional), creator\_id, gross\_amount, osis\_fee, net\_amount, status (BELUM\_DISALURKAN, DISALURKAN), disbursed\_at, note.

### 5.8 Data di localStorage (per perangkat pengguna)

| Kunci | Isi |
| --- | --- |
| merch\_cart\_v1 | Array item: product\_id, variant, qty |
| merch\_orders\_v1 | Array pesanan lokal: order\_code, items (snapshot nama dan harga), buyer (nama, kelas, kontak), total, payment\_method, created\_at |
| merch\_tickets\_v1 | Array tiket aspirasi/DSC yang pernah dikirim: ticket\_code, type, created\_at |

## 6. Persyaratan Fungsional – Sisi Pengguna

Setiap persyaratan memiliki ID (FR-U-xx) dan kriteria penerimaan (AC).

### 6.1 Beranda (index.html)

- FR-U-01: Menampilkan hero (nama sekolah/OSIS, tagline), produk unggulan (is\_featured atau 8 produk terbaru), daftar kategori, sorotan kreator, dan pintasan ke Aspirasi, DSC, serta FAQ.
- AC: Semua konten dimuat dari JSON. Jika JSON gagal dimuat, tampil pesan galat ramah dan tombol muat ulang.

### 6.2 Katalog Produk (katalog.html)

- FR-U-02: Grid produk dengan foto, nama, harga (atau rentang harga), nama kreator, dan label Stok Habis bila stok nol.
- FR-U-03: Hanya produk is\_active yang tampil. Produk stok habis tetap tampil tetapi tombol beli nonaktif.
- AC: Responsif 2 kolom di ponsel, 3-4 kolom di desktop. Gambar lazy-load.

### 6.3 Pencarian dan Kategori

- FR-U-04: Kolom pencarian teks (nama, deskripsi, nama kreator) dengan debounce 250 ms, tanpa reload halaman.
- FR-U-05: Filter kategori, filter kreator, rentang harga, ketersediaan stok, dan pengurutan (terbaru, harga naik, harga turun, nama).
- FR-U-06: Status filter tersimpan di query string agar tautan dapat dibagikan.
- AC: Hasil kosong menampilkan keadaan kosong dengan tombol Reset Filter.

### 6.4 Detail Produk (produk.html?id=)

- FR-U-07: Galeri gambar, nama, harga, deskripsi, pilihan varian, stok tersisa, info kreator (tautan ke profil), tombol Tambah ke Keranjang dan Beli Sekarang.
- FR-U-08: Validasi jumlah (minimal 1, maksimal sesuai stok). Varian wajib dipilih bila ada.
- AC: ID tidak ditemukan menampilkan halaman produk tidak ditemukan.

### 6.5 Keranjang Belanja (keranjang.html)

- FR-U-09: Tambah, ubah jumlah, hapus item. Subtotal per baris dan total keseluruhan dihitung otomatis.
- FR-U-10: Saat halaman dibuka, keranjang divalidasi terhadap products.json terbaru (harga berubah, stok kurang, produk nonaktif) dan pengguna diberi peringatan jelas.
- FR-U-11: Badge jumlah item keranjang di header pada semua halaman.

### 6.6 Checkout (checkout.html)

- FR-U-12: Form data pembeli: nama lengkap, kelas/identitas, nomor kontak yang bisa dihubungi, catatan. Semua kecuali catatan wajib diisi dan divalidasi (nomor kontak minimal 9 digit).
- FR-U-13: Ringkasan pesanan dan pilihan metode pembayaran dari config.json. Pengambilan barang di sekolah (pickup\_info), tanpa ongkir.
- FR-U-14: Saat Buat Pesanan: buat Kode Pesanan, simpan ke merch\_orders\_v1, kosongkan keranjang, lalu arahkan ke pembayaran.html?order=KODE.
- FR-U-15: Halaman pembayaran menyediakan Ringkasan Pesanan berupa teks terformat (Kode Pesanan, daftar item, total, data pembeli) dengan tombol Salin dan Unduh (.txt). Pengguna mengirimkannya secara manual ke admin lewat kanal kontak yang tertera di config.json, tanpa integrasi atau tautan otomatis.
- Catatan: stok tidak berkurang otomatis. Pengurangan stok dilakukan admin/penjual saat memproses pesanan (lihat FR-A-xx).

### 6.7 Pembayaran (pembayaran.html?order=)

- FR-U-16: Halaman hanya menampilkan instruksi, tanpa payment gateway dan tanpa pemrosesan pembayaran di situs. Isinya: total yang harus dibayar, kode unik opsional (3 digit terakhir untuk memudahkan verifikasi, dibuat deterministik dari Kode Pesanan), dan instruksi sesuai metode: gambar QRIS, nomor rekening dengan tombol Salin, dan batas waktu pembayaran dari config.
- AC: Kode Pesanan tidak dikenal menampilkan arahan ke Riwayat Pesanan.

### 6.8 Konfirmasi Pembayaran (konfirmasi.html?order=)

- FR-U-17: Form ringkas: metode yang dipakai, nominal ditransfer, nama pengirim, tanggal. Tombol Buat Teks Konfirmasi menghasilkan teks terformat untuk disalin. Pengguna mengirimkannya manual ke admin beserta bukti transfer lewat kanal kontak yang tertera. Situs tidak mengirim apa pun secara otomatis.
- FR-U-18: Status lokal pesanan pada perangkat berubah menjadi MENUNGGU\_VERIFIKASI setelah teks konfirmasi dibuat dan pengguna menandai Sudah Saya Kirim ke Admin. Status resmi tetap berasal dari order-status.json.

### 6.9 Status Pesanan (status.html)

- FR-U-19: Input Kode Pesanan (atau otomatis dari ?order=), ambil order-status.json dengan parameter anti-cache, tampilkan status dalam bentuk stepper (Menunggu Pembayaran, Verifikasi, Diproses, Siap Diambil, Selesai) beserta catatan admin.
- AC: Kode tidak ada di file berarti tampil Belum ada pembaruan dari admin dan status lokal terakhir.

### 6.10 Riwayat Pesanan (riwayat.html)

- FR-U-20: Daftar pesanan dari merch\_orders\_v1 dengan kode, tanggal, total, dan status terbaru (digabung dari order-status.json). Tautan ke pembayaran, konfirmasi, status.
- FR-U-21: Tombol Hapus Riwayat dari perangkat ini dan penjelasan bahwa riwayat tersimpan hanya di browser ini.

### 6.11 Form Aspirasi dan Evaluasi (aspirasi.html)

- FR-U-22: Form: jenis (Aspirasi, Saran, Evaluasi Kegiatan, Keluhan), kategori/divisi tujuan, judul, isi (min. 20 karakter), opsi anonim, nama dan kelas (disembunyikan bila anonim), kontak opsional.
- FR-U-23: Kirim lewat aspirasi\_endpoint dari config (opsional). Bila kosong atau gagal, form menghasilkan teks terformat dengan tombol Salin untuk dikirim manual ke admin. Kode Tiket (ASP-...) dibuat di klien, ditampilkan, disalin, dan disimpan ke merch\_tickets\_v1.
- FR-U-24: Perlindungan spam sederhana: honeypot field dan jeda minimal 5 detik antara membuka form dan mengirim.

### 6.12 Monitoring Tindak Lanjut Aspirasi (aspirasi-status.html)

- FR-U-25: Cek status dengan Kode Tiket atau tampilkan daftar tiket milik perangkat ini dari merch\_tickets\_v1, dengan status, tanggapan publik, dan tanggal pembaruan dari aspirasi-status.json.
- FR-U-26: Tampilkan juga statistik agregat publik (jumlah diterima, diproses, selesai).

### 6.13 Division Service Center (dsc.html)

- FR-U-27: Daftar divisi OSIS dari divisions.json beserta layanan yang tersedia.
- FR-U-28: Form permintaan layanan: divisi, jenis layanan, nama pemohon dan kelas/organisasi, tanggal dibutuhkan, deskripsi kebutuhan. Mekanisme pengiriman dan kode tiket sama dengan FR-U-23 (prefiks DSC-).
- FR-U-29: Status permintaan dapat dicek pada dsc-status.json lewat Kode Tiket (komponen pengecekan status dipakai ulang dari aspirasi-status).

### 6.14 Profil Kreator (kreator.html?id=)

- FR-U-30 (juga bagian fitur Penjual): Foto, nama, bio, kelas/kelompok, dan daftar produk milik kreator tersebut dengan fitur sortir dasar.

### 6.15 FAQ dan Bantuan (faq.html) – Tambahan

- FR-U-31: Daftar FAQ berkelompok (Pemesanan, Pembayaran, Pengambilan, Aspirasi, DSC) berbentuk akordeon dengan pencarian cepat, memuat dari faq.json.
- FR-U-32: Bagian Bantuan menampilkan kanal kontak admin sebagai teks (tanpa tautan integrasi), serta panduan langkah memesan dan membayar secara manual.

## 7. Persyaratan Fungsional – Sisi Penjual dan Admin (/admin/)

### 7.1 Umum Admin Toolkit

- FR-A-01: Gerbang masuk dengan passcode. Hash SHA-256 dari input (Web Crypto API) dibandingkan dengan admin\_passcodes di config.json. Peran dan creator\_id disimpan di sessionStorage. Tombol Keluar menghapusnya.
- FR-A-02: Semua halaman admin memuat JSON terbaru dari /data, menyimpan perubahan sementara sebagai draf di localStorage (kunci admin\_draft\_\*), dan memberi indikator Ada perubahan belum dipublikasikan.
- FR-A-03: Halaman Publikasi (publikasi.html): untuk tiap file JSON yang berubah tampilkan diff ringkas, tombol Unduh JSON dan Salin JSON, serta petunjuk langkah commit lewat antarmuka web GitHub. Opsional (FR-A-04): tombol Commit ke GitHub memakai GitHub REST API (PUT /repos/{owner}/{repo}/contents/{path}) dengan token yang diinput manual, disimpan di sessionStorage saja, tidak pernah ditulis ke localStorage, kode, atau JSON.
- FR-A-05: Impor/ekspor CSV dan JSON untuk pesanan yang dicatat admin (lihat 7.4).
- FR-A-06: Setelah commit, perubahan terlihat di situs publik setelah GitHub Pages selesai deploy (sekitar 1-2 menit). Tampilkan catatan ini di halaman Publikasi.

### 7.2 Dashboard Admin (admin/index.html)

- FR-A-07: Kartu ringkasan: jumlah produk aktif, stok menipis (ambang di config, default 5), jumlah pesanan per status, total omzet (dari data pesanan yang dicatat admin), tiket aspirasi dan DSC per status, dan dana belum disalurkan.
- FR-A-08: Mode Penjual hanya menampilkan ringkasan produk dan pesanan milik kreator tersebut.

### 7.3 Pengelolaan Produk dan Kreator

- FR-A-09 (Tambah Produk): Form lengkap sesuai skema products.json, dengan validasi (nama, harga > 0, kategori, minimal satu gambar). Gambar dipilih dari path yang ada di assets/img/produk/ atau diunggah ke folder tersebut secara manual. Panduan nama file ditampilkan. ID dan slug dibuat otomatis dan unik.
- FR-A-10 (Edit/Hapus Produk): Edit semua field. Hapus bersifat soft delete (is\_active=false) secara default dengan opsi hapus permanen disertai konfirmasi dua langkah.
- FR-A-11 (Kelola Stok): Tabel stok per produk/varian dengan penyesuaian cepat (tambah/kurangi, set nilai) dan catatan alasan. Peringatan stok menipis.
- FR-A-12 (Kelola Kreator/Penjual, khusus Admin): CRUD kreator, aktif/nonaktif, dan penautan passcode seller.
- Hak akses: mode Penjual hanya dapat memodifikasi record dengan creator\_id miliknya. Admin dapat semuanya.

### 7.4 Pengelolaan Pesanan dan Pembayaran

Karena pesanan dan bukti bayar diterima manual dari pembeli, admin mencatat pesanan ke Order Tracker lokal.

- FR-A-13 (Kelola Pesanan): Admin menempelkan Ringkasan Pesanan yang diterima dari pembeli (parser membaca Kode Pesanan, item, total, pembeli) atau memasukkan manual. Pesanan disimpan di localStorage admin (admin\_orders\_v1) dan dapat diekspor/diimpor sebagai JSON agar dapat dibagi antar anggota OSIS. Setiap pesanan memiliki status sesuai 5.5 dan riwayat perubahan.
- FR-A-14: Filter berdasarkan status, kreator, tanggal, dan pencarian kode/nama. Penjual hanya melihat item produk miliknya.
- FR-A-15: Saat pesanan berstatus TERVERIFIKASI, admin dapat mengurangi stok produk terkait dengan satu tombol (menghasilkan draf perubahan products.json).
- FR-A-16: Tombol Hasilkan order-status.json menyusun file status publik dari semua pesanan (hanya kode, status, catatan, waktu) untuk dipublikasikan.
- FR-A-17 (Verifikasi Pembayaran, khusus Admin): Daftar pesanan MENUNGGU\_VERIFIKASI dengan nominal diharapkan (termasuk kode unik), input nominal diterima, catatan, serta aksi Verifikasi atau Tolak. Perubahan status tercatat bersama nama verifier (input bebas) dan waktu. Pencocokan dengan mutasi rekening dan bukti transfer dilakukan manual oleh admin di luar situs.
- FR-A-18: Tombol Buat Teks Pembaruan menghasilkan teks status untuk disalin. Admin mengirimkannya manual ke pembeli, tanpa integrasi pesan otomatis.

### 7.5 Tindak Lanjut Aspirasi dan DSC (khusus Admin)

- FR-A-19: Admin mencatat tiket yang masuk (dari respons Google Form bila dipakai, atau teks yang dikirim manual oleh pengguna) ke tracker lokal (admin\_tickets\_v1) dengan impor CSV dari Google Forms.
- FR-A-20: Per tiket: ubah status, isi tanggapan publik (otomatis disaring agar tanpa data pribadi), tetapkan divisi penanggung jawab (untuk DSC).
- FR-A-21: Tombol Hasilkan aspirasi-status.json dan dsc-status.json untuk dipublikasikan.

### 7.6 Pencatatan Penyaluran Dana ke Kreator (khusus Admin)

- FR-A-22: Rekap otomatis per kreator dari pesanan berstatus SELESAI: bruto, potongan OSIS (persentase atau nominal tetap di config), neto.
- FR-A-23: Admin menandai penyaluran (tanggal, catatan, referensi bukti). Hasil disimpan sebagai draf ledger.json dan dapat diekspor ke CSV untuk laporan bendahara.
- FR-A-24: Mode Penjual dapat melihat ringkasan dana miliknya saja (read-only).

## 8. Alur Utama

### 8.1 Alur Pemesanan

1. Pengguna menjelajah katalog lalu menambah ke keranjang.
2. Checkout dan isi data pembeli. Sistem membuat Kode Pesanan dan menyimpan lokal.
3. Sistem mengarahkan ke halaman pembayaran, pengguna membayar manual lewat QRIS/transfer di luar situs, tanpa payment gateway.
4. Pengguna mengirim Ringkasan Pesanan dan bukti transfer secara manual ke admin lewat kanal kontak yang tertera.
5. Admin mencatat pesanan, memverifikasi pembayaran, lalu mengubah status.
6. Admin mempublikasikan order-status.json. Pengguna mengecek status di situs.
7. Barang siap diambil, pesanan SELESAI, dana disalurkan ke kreator dan dicatat.

### 8.2 Alur Aspirasi/DSC

Pengguna mengisi form, mendapat Kode Tiket, admin menerima dan mencatat, memperbarui status dan tanggapan publik, mempublikasikan file status, pengguna memantau lewat Kode Tiket.

## 9. Persyaratan Non-Fungsional

| ID | Kategori | Persyaratan |
| --- | --- | --- |
| NFR-01 | Kinerja | Skor Lighthouse minimal 90 (Performance, Accessibility, Best Practices, SEO) di ponsel. Total JS di bawah 150 KB tanpa kompresi untuk halaman publik |
| NFR-02 | Responsif | Mobile-first, lebar uji 360 px sampai 1440 px |
| NFR-03 | Aksesibilitas | Kontras WCAG AA, navigasi keyboard, label form, atribut alt pada gambar, fokus terlihat |
| NFR-04 | Kompatibilitas | Dua versi terakhir Chrome, Edge, Firefox, Safari, serta Chrome Android |
| NFR-05 | Gambar | Format WebP/JPEG, maksimal 200 KB per gambar produk, lazy loading, rasio konsisten 1:1 atau 4:5 |
| NFR-06 | SEO | Title, meta description, Open Graph per halaman, sitemap.xml dan robots.txt sederhana |
| NFR-07 | Ketahanan | Semua fetch ditangani dengan try/catch, ada keadaan loading, kosong, dan galat. Akses localStorage selalu dibungkus try/catch dengan fallback memori |
| NFR-08 | Privasi | Data pribadi pembeli hanya di perangkat pembeli dan kanal komunikasi manual ke admin. Tidak ada data pribadi di file JSON publik. Tampilkan catatan privasi di form |
| NFR-09 | Pemeliharaan | Kode modular, komentar singkat, README berisi panduan OSIS non-teknis (tambah produk, ubah nomor WhatsApp, publikasi) |
| NFR-10 | Tema | Warna dan logo dapat diubah lewat variabel CSS tunggal di :root. Dukung mode terang (gelap opsional) |
| NFR-11 | Cache | Fetch data publik dari /data memakai parameter versi/timestamp agar pembaruan segera terlihat |

## 10. Keamanan dan Keterbatasan (Wajib Dicantumkan di README)

- Situs statis tidak dapat menyembunyikan data. Seluruh isi repo dan JSON bersifat publik. Jangan menyimpan data pribadi, bukti transfer, atau nomor rekening pribadi tanpa izin pemiliknya.
- Passcode sisi klien hanya menghalangi akses iseng ke antarmuka admin. Siapa pun yang membaca kode dapat melewatinya. Karena itu Admin Toolkit tidak menyimpan rahasia, dan perubahan data tetap harus melewati commit ke repo yang dilindungi akun GitHub OSIS (aktifkan 2FA, batasi kolaborator).
- Token GitHub (bila fitur FR-A-04 dipakai) memakai fine-grained token dengan akses hanya ke repo ini, hak Contents: read/write, masa berlaku pendek.
- Status pesanan, aspirasi, dan stok tidak real-time. Pembaruan bergantung pada commit admin. Pengguna perlu diberi tahu hal ini di FAQ.
- Stok tidak dikunci secara atomik. Mungkin terjadi pesanan melebihi stok, sehingga admin perlu memverifikasi ketersediaan saat konfirmasi. Disarankan model pre-order dengan kuota.
- Sanitasi: semua teks dari JSON dirender dengan textContent (bukan innerHTML) untuk mencegah XSS. Teks ringkasan yang disalin atau diunduh disusun dari data yang sudah dibersihkan.

## 11. Deployment ke GitHub Pages

1. Buat repo publik (atau privat bila akun mendukung Pages privat), unggah semua file.
2. Settings, Pages, Source: Deploy from a branch, branch main, folder /(root).
3. Pastikan file .nojekyll ada di root.
4. Semua tautan dan path aset memakai path relatif (misal ./assets/css/main.css atau ../assets/... untuk halaman di /admin/). Dilarang memakai path diawali slash tunggal.
5. Uji di URL https://USERNAME.github.io/NAMA-REPO/ sebelum rilis.
6. Alur pembaruan konten: edit lewat Admin Toolkit, unduh/commit JSON, tunggu Pages selesai build.

## 12. Pemetaan Fitur ke Modul (Traceability)

| Fitur (dari tabel kebutuhan) | Peran | Persyaratan |
| --- | --- | --- |
| Beranda | Pengguna | FR-U-01 |
| Form Aspirasi dan Evaluasi | Pengguna | FR-U-22 s.d. 24 |
| Monitoring Tindak Lanjut Aspirasi | Pengguna | FR-U-25, 26 |
| Division Service Center | Pengguna | FR-U-27 s.d. 29 |
| Katalog Produk | Pengguna | FR-U-02, 03 |
| Pencarian dan Kategori | Pengguna | FR-U-04 s.d. 06 |
| Riwayat Pesanan | Pengguna | FR-U-20, 21 |
| Detail Produk | Pengguna | FR-U-07, 08 |
| Keranjang Belanja | Pengguna | FR-U-09 s.d. 11 |
| Status Pesanan | Pengguna | FR-U-19 |
| Checkout | Pengguna | FR-U-12 s.d. 15 |
| Pembayaran | Pengguna | FR-U-16 |
| Konfirmasi Pembayaran | Pengguna | FR-U-17, 18 |
| Profil Kreator | Penjual | FR-U-30 |
| Tambah Produk | Penjual | FR-A-09 |
| Edit/Hapus Produk | Penjual | FR-A-10 |
| Kelola Stok | Penjual | FR-A-11 |
| Kelola Pesanan | Penjual | FR-A-13, 14 |
| Dashboard Admin | Admin | FR-A-07, 08 |
| Tindak Lanjut Aspirasi dan Evaluasi | Admin | FR-A-19 s.d. 21 |
| Tindak Lanjut Permintaan Pelayanan Divisi Organisasi | Admin | FR-A-19 s.d. 21 |
| Kelola Produk | Admin | FR-A-09 s.d. 11 |
| Kelola Kreator/Penjual | Admin | FR-A-12 |
| Kelola Pesanan | Admin | FR-A-13 s.d. 16, 18 |
| Verifikasi Pembayaran | Admin | FR-A-17 |
| Pencatatan Penyaluran Dana ke Kreator | Admin | FR-A-22 s.d. 24 |
| FAQ dan Bantuan | Tambahan | FR-U-31, 32 |

## 13. Kriteria Penerimaan Global (Definition of Done)

- Semua halaman pada bagian 4.2 ada dan dapat dibuka dari navigasi tanpa tautan rusak.
- Situs berjalan penuh dari GitHub Pages sub-path tanpa galat 404 pada aset.
- Tidak ada panggilan jaringan selain ke file lokal, endpoint form di config (opsional), dan (opsional) api.github.com. Tidak ada tautan wa.me, API WhatsApp, maupun payment gateway di kode.
- Alur pemesanan 8.1 dapat diselesaikan end-to-end pada ponsel dengan data contoh.
- Data contoh (seed) tersedia: minimal 12 produk, 4 kreator, 5 kategori, 6 divisi, 12 entri FAQ, beberapa pesanan dan tiket contoh pada status berbeda, dan pengaturan config.json berisi nilai placeholder yang jelas.
- README berisi panduan operasional dan peringatan keamanan bagian 10.

## 14. Panduan untuk Agent Generator

1. Bangun berurutan: (a) kerangka, tema, layout bersama, utilitas (format rupiah, fetch JSON, penyimpan aman); (b) data seed; (c) halaman publik; (d) Admin Toolkit; (e) README dan SEO.
2. Jangan menambahkan backend, database, kerangka kerja yang membutuhkan build, atau layanan berbayar.
3. Setiap kali ada keraguan antara kenyamanan dan kepatuhan batasan C-01 sampai C-07, patuhi batasan.
4. Tuliskan asumsi yang diambil sebagai komentar di config.json dan README, bukan menanyakannya.
5. Hasil akhir harus dapat langsung diunggah ke repo dan dipublikasikan tanpa langkah tambahan selain pengisian config.json.

## 15. Asumsi dan Hal yang Perlu Dikonfirmasi OSIS

- Model penjualan diasumsikan pre-order dengan pengambilan di sekolah, tanpa pengiriman.
- Besaran potongan OSIS (persen atau nominal) dan jadwal penyaluran dana ke kreator.
- Kanal kontak resmi admin (ditampilkan sebagai teks), metode pembayaran, dan gambar QRIS yang disetujui sekolah.
- Pilihan penerima aspirasi: Google Form, Formspree, atau cukup teks yang disalin dan dikirim manual ke admin.
- Daftar divisi OSIS dan layanan yang ditawarkan di DSC.
- Siapa saja yang memegang akses repo GitHub dan kebijakan 2FA.
