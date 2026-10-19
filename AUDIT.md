# AUDIT — Kepatuhan terhadap PRD (M8)

Status: **SESUAI** = terpenuhi dan terbukti; **SEBAGIAN** = inti terpenuhi, ada bagian PRD yang belum; **BELUM** = tidak ada. Hanya item di scope MVP (M0–M8, PRD bagian 15) yang wajib; sisanya masuk daftar Should/Could PRD.

| Bagian | Status | Bukti | Catatan / tindakan |
| --- | --- | --- | --- |
| 1 Ringkasan | SESUAI | Tiga sudut pandang: scene Desain, Penerbangan (kokpit + staging), Permukaan (orang ketiga) | - |
| 2 Pemetaan challenge | SEBAGIAN | Teks resmi challenge (Space Mission Design Game, Space Apps 2026) meminta game yang membuat peserta merancang, mengelola, dan mensimulasikan misi lengkap dengan keputusan rekayasa, sumber daya terbatas, dan evaluasi pengaruh tiap pilihan. Sembilan elemen: objektif misi (sebagian: dipilih lewat destinasi), desain wahana, instrumen, roket, budget, daya, massa, komunikasi (semua SESUAI), orbital constraints (sebagian). Evaluasi per pilihan: layar Review memuat skor transparan, kode penyebab, dan panel "Bagaimana jika" (`rules/whatIf.ts`) | "Jendela peluncuran" dan peta navigasi tidak ada; pemain belum merumuskan sendiri tujuan misi |
| 3 Target dan edukasi | SESUAI | Tutorial NOVA, indikator dengan simbol, review sebab-akibat, tombol Perbaiki desain | - |
| 4 Cerita | SESUAI | Intro Kappa Event, briefing, Beacon Bulan dan Mars, penutup "Bersambung" (`dialogs.json`, `tests/core/save.test.ts`) | Babak 3 (Titan) di luar MVP |
| 5 Loop gameplay | SEBAGIAN | Langkah 1–7 berjalan; poin sains terkumpul | Langkah 8 (pohon upgrade) belum: daftar Should setelah M8 |
| 6 Fase desain | SEBAGIAN | Katalog, 5 indikator, objektif wajib, NOVA, Go/No-Go (`preflightCheck.test.ts`, `missionMoon.test.ts`) | Modul dipilih lewat klik katalog, bukan diseret ke blueprint |
| 7 Penerbangan dan staging | SEBAGIAN | Staging lengkap + F, fairing, handling +0,25/tahap, penalti terlambat (`staging.test.ts`, `flightSim.test.ts`), HUD tahap, event penerbangan | Tombol M (peta dan jendela burn), waktu dipercepat saat transfer, minigame "staging clamp", dan blackout komunikasi belum |
| 8 Permukaan | SEBAGIAN | Gerak, lari, lompat, E, Q, 4 meter, hub, siang-malam, pingsan, uplink, jurnal (Tab) dengan kartu fakta | Peta dan inventaris sampel terpisah belum; pemindai menandai titik minat, belum hazard |
| 9 Katalog planet dan minigame | SEBAGIAN | Bulan dan Mars penuh; 6 minigame (Foto, Bor, Spektrum, Getaran, Pasang dan Sambungkan, Bersihkan Panel) | Pindai Radar (menunggu destinasi es) belum; Venus/Europa/Titan: Could |
| 10 Simulasi dan resource | SESUAI | Rumus Tsiolkovsky, daya siang/malam, komunikasi, jeda sinyal asli di jurnal (`missionMoon.test.ts`) | - |
| 11 Skor dan progres | SEBAGIAN | Skor 4 komponen, bintang, poin sains, medali, Story Mode, Free Design, progres tersimpan | Daily Challenge (Could) belum; poin sains belum dibelanjakan |
| 12 Seni, audio, UI | SEBAGIAN | Detail model tinggi (bawaan, shading mulus, tepi membulat) atas permintaan tim dengan mode low-poly flat shading sebagai pilihan (DECISIONS 83-85), kecuali benda langit ( bola halus bertekstur prosedural, DECISIONS 68), tone mapping ACES, bayangan opsional, guncangan kamera, palet per destinasi, audio prosedural lengkap (efek suara dan musik latar prosedural per planet, DECISIONS 87), HUD, dialog dengan potret, simbol selain warna, ukuran teks A−/A+ | Benda langit menyimpang dari "flat shading, tanpa tekstur gambar" atas permintaan tim (tekstur dihasilkan kode, bukan berkas gambar). Kontrol yang bisa diatur ulang belum; subtitle tidak relevan (tanpa suara ucapan). Toggle bayangan sudah ada (default mati) |
| 13 Spesifikasi teknis | SESUAI | TypeScript strict, Vite `base: './'`, Three.js dari npm, tanpa library fisika/UI, struktur repo, skrip npm | Tambahan di luar daftar: `src/rules/*` dan `src/gen/*` ekstra (lihat DECISIONS) |
| 14 Data dan rumus | SESUAI | Contoh Bulan dan semua skenario staging lulus dalam toleransi; konstanta di `constants.ts`; angka katalog di `data/*.json` | `rocket.ts` memakai konstanta skala visual (bukan data game) |
| 15 Milestone M0–M8 | SESUAI | Tabel di `AGENTS.md`; seluruh kriteria penerimaan terbukti di laporan tiap milestone | - |
| 16 Aturan kerja | SESUAI | Lint melarang `Math.random` dan impor Three.js/DOM di `rules` dan `events`; tes keseimbangan; `DECISIONS.md` | Dev-only/QoL di luar PRD dicatat di DECISIONS (autopilot dev, penskala kualitas, overlay F3, ukuran teks) |

## Verifikasi mekanis
| Pemeriksaan | Hasil |
| --- | --- |
| `npm test` | 510 tes lulus, 0 gagal (53 berkas) |
| `npm run lint` | Bersih, 0 peringatan |
| `npm run build` | Berhasil; `dist/` 956 KB (batas 10 MB) |
| Permintaan jaringan build produksi | 3 (HTML, JS, CSS), semua `localhost`; tanpa CDN, font, atau aset pihak ketiga |
| Berkas aset di repo (png/jpg/model/audio/font) | Tidak ada |
| `Math.random` di `src/` | 0 pemakaian |
| Konsol browser pada alur penuh (dev dan produksi) | Bersih (tanpa error/warning) |
| Uji ketahanan | 80 penerbangan berseed berbeda dan 480 detik permukaan tanpa NaN (`tests/rules/soak.test.ts`) |
| Anggaran render | Detail tinggi: maks 108 ribu segitiga digambar (Permukaan Bulan dengan Lunar Cruiser; batas 150 ribu), maks 113 draw call pada rakitan terberat (batas 200); tidak ada kebocoran geometri setelah pergantian scene |

## Performa
Lihat tabel benchmark di `README.md`. Pengukuran dilakukan pada rasterizer software (CPU) karena mesin uji tidak punya GPU; angka itu bukan ukuran GPU terintegrasi nyata. Verifikasi pada perangkat target tetap perlu dilakukan manusia (tekan **F3**).
