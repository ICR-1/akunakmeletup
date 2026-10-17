# ASTRA — Prompt untuk AI Agent

Bagian ini untuk kamu (manusia), bukan untuk diimplementasikan. Prompt di bawah dirancang agar agent membaca `PRD.md` penuh, bekerja per milestone dengan bukti verifikasi, dan berhenti di titik yang bisa kamu periksa.

**Cara pakai:**

1. Buat folder proyek kosong, lalu simpan `PRD.md` di root folder itu.
2. Buka agent coding (mis. Claude Code) di folder itu.
3. Tempel **Prompt 1** satu kali di awal.
4. Setelah agent melapor satu milestone lulus dan kamu mencoba hasilnya, tempel **Prompt 2** untuk milestone berikutnya (atau **Prompt 3** jika waktu mepet).
5. Pakai **Prompt 4** saat ada bug, dan **Prompt 5** sebelum submission.

Jika agent mulai menyimpang atau sesi baru dimulai, cukup perintahkan: *Baca AGENTS.md dan bagian 13-16 di PRD.md, lalu lanjutkan dari milestone terakhir yang lulus.*

**Prompt 1: Awal proyek**

```text
Kamu adalah AI engineer senior yang membangun game web 3D low-poly bernama "ASTRA: Space Mission Architect" untuk hackathon NASA Space Apps (challenge: Space Mission Design Game).

Sumber kebenaran adalah file PRD.md di root folder ini. Baca SELURUHNYA sebelum menulis kode apa pun, terutama bagian 0, 13, 14, 15, dan 16. Jangan mengubah PRD.md.

Langkah awal (berurutan, jangan melompat):
1. Baca PRD.md sampai habis. Tulis ringkasan maksimal 10 baris tentang apa yang akan kamu bangun, lalu daftar ambiguitas atau kontradiksi yang kamu temukan (maksimal 10). Untuk tiap ambiguitas pilih opsi paling sederhana yang tetap memenuhi MVP dan catat di DECISIONS.md. Jangan berhenti untuk bertanya kecuali benar-benar terblokir.
2. Buat AGENTS.md di root berisi: aturan kerja (PRD bagian 0 dan 16), perintah npm, struktur repo (bagian 13), dan status milestone. Dokumen ini harus cukup agar sesi baru bisa melanjutkan tanpa membaca ulang semuanya.
3. Buat daftar tugas untuk milestone M0 sampai M8 beserta kriteria penerimaannya (bagian 15).
4. Kerjakan M0 sampai selesai: tulis kode dan tes, jalankan `npm test`, `npm run lint`, dan `npm run build`, lalu jalankan `npm run dev` untuk memastikan aplikasi benar-benar berjalan.
5. Setelah semua kriteria penerimaan M0 lulus, kirim laporan dengan format di bawah, lalu BERHENTI dan tunggu perintahku.

Aturan keras (ringkasan dari PRD, yang menang jika ada konflik adalah PRD bagian 16):
- Stack tetap: TypeScript strict, Vite, Three.js dari npm. Tanpa library fisika dan tanpa framework UI.
- Tanpa aset eksternal: semua model, terrain, dan audio dibuat prosedural. Tanpa CDN, font web, atau unduhan saat runtime. Jangan memakai logo NASA atau karakter berhak cipta.
- Semua angka katalog dari data/*.json; konstanta mekanik di src/core/constants.ts; semua keacakan lewat rng berseed (dilarang Math.random()).
- Folder rules dan events harus fungsi murni (tanpa Three.js dan DOM) dan wajib punya tes unit.
- Jangan menambah fitur di luar PRD; ide tambahan dicatat di DECISIONS.md bagian Ide.
- Fakta sains hanya dari PRD; jangan mengarang fakta baru.
- Teks antarmuka berbahasa Indonesia.
- Jangan pernah menyatakan sesuatu selesai atau lulus tanpa benar-benar menjalankan perintah verifikasinya dan menampilkan hasilnya.

Format laporan setiap milestone:
- Milestone: ID dan nama.
- Kriteria penerimaan: tiap kriteria, status LULUS atau GAGAL, dan bukti (nama tes atau perintah yang dijalankan).
- Hasil npm test, npm run lint, npm run build (ringkas).
- Keputusan baru di DECISIONS.md.
- Masalah terbuka dan risiko.
- Cara aku mencobanya secara manual (3-6 langkah).
```

**Prompt 2: Lanjut satu milestone**

```text
Lanjutkan ke milestone [ISI: M1] di PRD.md.

Baca ulang AGENTS.md dan bagian 15 untuk milestone ini, serta bagian PRD yang relevan (sebutkan bagian apa saja yang kamu baca). Jangan mengubah perilaku milestone sebelumnya kecuali tes menunjukkan bug; jika memperbaiki, jelaskan alasannya.

Kerjakan sampai semua kriteria penerimaan lulus, jalankan npm test, npm run lint, dan npm run build, perbarui AGENTS.md (status milestone) dan README.md secara singkat, lalu kirim laporan dengan format yang sama seperti sebelumnya dan BERHENTI.
```

**Prompt 3: Mode otonom (jika waktu mepet)**

```text
Kerjakan milestone [ISI: M1] sampai [ISI: M8] di PRD.md secara berurutan tanpa menunggu persetujuanku.

Untuk tiap milestone: baca bagian PRD yang relevan, implementasikan, jalankan npm test, npm run lint, dan npm run build, pastikan semua kriteria penerimaan lulus, perbarui AGENTS.md, lalu commit dengan pesan yang jelas. Jangan mulai milestone berikutnya sebelum yang sekarang lulus semua.

Berhenti dan tanyakan padaku hanya jika: (a) verifikasi sebuah milestone gagal tiga kali berturut-turut dengan pendekatan berbeda, (b) PRD benar-benar kontradiktif sehingga tidak ada opsi sederhana, atau (c) kamu butuh sesuatu yang tidak bisa kamu buat sendiri.

Setelah tiap milestone, tulis laporan singkat satu paragraf di DECISIONS.md. Di akhir, kirim laporan lengkap dengan format yang sama dan daftar semua keputusan penting.
```

**Prompt 4: Perbaikan bug**

```text
Aku menemukan masalah:
- Yang terjadi: [ISI]
- Yang diharapkan menurut PRD: [ISI, sebutkan bagian jika tahu]
- Langkah reproduksi: [ISI]

Cari akar masalahnya. Jika logikanya ada di folder rules atau events, tulis tes yang gagal terlebih dahulu. Perbaiki dengan perubahan sekecil mungkin, jalankan npm test, npm run lint, dan npm run build, lalu jelaskan penyebab, perbaikan, dan bukti bahwa masalah hilang. Jangan refaktor di luar kebutuhan dan jangan mengubah angka di data/ kecuali masalahnya memang di keseimbangan.
```

**Prompt 5: Audit akhir sebelum submission**

```text
Lakukan audit akhir terhadap PRD.md.

1. Untuk setiap bagian 1 sampai 16, periksa apakah implementasi memenuhinya. Hasilkan tabel dengan kolom: bagian, status (SESUAI, SEBAGIAN, BELUM), bukti, tindakan.
2. Perbaiki semua item SEBAGIAN atau BELUM yang termasuk scope MVP (M0 sampai M8).
3. Jalankan alur penuh (desain, penerbangan, permukaan, review) untuk Bulan dan Mars. Periksa: console bebas error dan warning, FPS minimal 30 di scene permukaan terberat, ukuran dist/ di bawah 10 MB, game berjalan lewat npm run preview tanpa jaringan.
4. Pastikan README.md (cara menjalankan, kontrol, cara bermain), CREDITS.md (menyatakan tidak ada aset eksternal), dan DECISIONS.md lengkap.
5. Kirim laporan akhir: apa yang sudah jadi, apa yang belum, dan risiko yang tersisa untuk demo.
```

**Tips agar hasilnya mulus:** jalankan satu milestone per sesi jika agent mulai lupa konteks; selalu coba hasilnya sendiri di browser sebelum lanjut; simpan tiap milestone yang lulus sebagai commit git agar mudah kembali; dan jika kamu mengubah PRD, ekspor ulang ke `PRD.md` lalu minta agent membaca bagian yang berubah.
