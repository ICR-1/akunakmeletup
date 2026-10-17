# ASTRA: Space Mission Architect

Game web 3D prosedural (detail tinggi bawaan, mode low-poly tersedia): rancang misi, terbangkan roket bertahap, jelajahi permukaan Bulan dan Mars. Dibuat untuk hackathon NASA Space Apps. Badan antariksa dalam game adalah fiksi (Badan Antariksa Khatulistiwa).

## Menjalankan
```bash
npm install
npm run dev      # http://localhost:5173
npm test         # Vitest
npm run lint
npm run build    # hasil di dist/
npm run preview  # uji build secara offline
```

## Tata surya dan planet
Briefing menampilkan tata surya interaktif: Matahari bercahaya, delapan planet bertekstur di orbit elips, dan Bulan mengitari Bumi. Arahkan kursor ke tujuan misi dan kamera meluncur ke Bumi–Bulan atau Mars. Planet di seluruh game (Bumi saat peluncuran dan orbit, Bulan atau Mars saat transfer, Bumi di langit Bulan) berupa bola halus bertekstur yang **digambar oleh kode saat runtime** dari noise 3D; tidak ada berkas gambar. Model lain (roket, lander, astronot, Lunar Cruiser, terrain) dibuat dari geometri primitif; lihat *Detail model* di bawah.

## Story Mode
Tahun 2061, badai Matahari *Kappa Event* memutus jaringan komunikasi antarplanet. Pulihkan Beacon di Bulan lalu Mars. Selesaikan misi Bulan (minimal 1 bintang) untuk membuka Mars. Progres, bintang, skor terbaik, Beacon, dan pencapaian tersimpan otomatis di `localStorage`; suara bisa di-mute lewat tombol di pojok kanan bawah.

## Lunar Cruiser dan Detail model
**Lunar Cruiser** (modul opsional di Desain untuk Bulan maupun Mars, maksimal 1; 260 kg, 45 MUSD) ikut dibawa roket: tampak menempel di sisi lander selama peluncuran dan pendaratan, lalu terparkir di dekat wahana setelah mendarat. Dekati dan tekan **R** untuk naik; W/S gas dan rem, A kemudi kiri dan D kemudi kanan (belok hanya saat bergerak), **R** lagi untuk turun (kendaraan harus hampir berhenti). Kendaraan bersuara: dengung motor yang naik nadanya dengan kecepatan, gemuruh roda, serta dentang dan desis saat pintu kabin dibuka/ditutup. Kecepatan puncak 14 m/s (jalan kaki 3, lari 5,5). Di dalam kabin oksigen terkuras lebih pelan (0,1/dtk) dan semua aksi (objektif, uplink) tetap bisa dilakukan dari posisi kendaraan, tetapi baterai wahana menanggung beban tambahan 150 W selama bergerak (terasa terutama malam). Massa dan biayanya membuat desain lebih sulit tetap berstatus GO, jadi perlu kompromi bahan bakar, roket, atau instrumen.

**Detail model** (tombol *Detail* di pojok kanan bawah, tersimpan): *tinggi* (bawaan) memakai segmen melingkar 2x, tepi kotak membulat, shading mulus, dan terrain/pulau mulus dengan grid lebih rapat; *rendah* mengembalikan tampilan low-poly flat shading asli. Pengaturan berlaku seketika di Briefing/Desain dan saat memasuki scene Penerbangan/Permukaan berikutnya. Jika perangkat tetap di bawah 30 FPS walau resolusi render sudah minimum selama sekitar 12 detik, game menurunkan detail ke *rendah* otomatis.

## Matahari di permukaan
Di Bulan dan Mars Matahari berupa bola bernoise beranimasi dengan lingkar cahaya (sama seperti di Briefing) disertai *aperture ghosting*: pantulan lensa segi enam yang berjajar dan bergeser mengikuti sudut pandang (tanpa garis sinar). Pantulan memudar saat Matahari keluar bingkai, tertutup horizon, atau malam. Saat malam area wahana diterangi empat lampu sorot selama daya wahana masih ada.

## Daratan, wahana, dan Probe Beacon
- **Daratan** Bulan dan Mars kini bertekstur: butiran regolit, kawah kecil, dan kerikil di Bulan; riak pasir di Mars. Teksturnya digambar kode (periodik, tanpa berkas gambar).
- **Skala wahana:** lander setinggi ~5 m dengan rentang kaki ~9 m (astronot 2 m), punya pintu bulat, jendela, serambi, dan tangga; Lunar Cruiser 5,2 m dibawa di sisi lander dan tetap seukuran itu di permukaan. Di Desain ada astronot acuan skala di samping lander.
- **Objek mirip wahana di Bulan** adalah **Probe Beacon**, kapsul waktu probe lama yang menandai cerita (bukan wahana pemain): badan emas, parabola, sayap surya, dan lampu merah berkedip. Cari dengan jelajah; ia padat (tidak bisa ditembus). Batu-batu di daratan memakai tekstur yang sama dengan tanah, dan lander punya ruang masuk (airlock) dengan tangga menuju permukaan. Di Desain, astronot acuan skala berdiri di panggung khusus dengan penggaris 2 m di depan panggung lander.

## Bumi dan Review
Bumi memakai geografi nyata: benua, pulau besar, danau besar, gletser, dan kutub berasal dari data garis pantai Natural Earth (domain publik, tertanam sebagai kode) yang digambar menjadi tekstur saat runtime. Layar Review kini punya panel *Bagaimana jika*: perubahan satu langkah pada rakitan (bahan bakar, panel surya, baterai, tangki, relay, mesin, lander, antena) beserta dampaknya ke lima indikator dan biaya.

## Tabrakan
Batu, wahana, probe Beacon, dan Lunar Cruiser terparkir bersifat padat: astronot dan kendaraan tidak menembusnya. Batu kecil (setinggi lutut) bisa dilangkahi dan batu lebih tinggi bisa dilompati; Lunar Cruiser yang menabrak melambat dengan guncangan.

## Musik per planet
Musik latar dibangkitkan prosedural oleh Web Audio saat runtime (tanpa berkas audio), berbeda tiap planet dan fase: **Bulan** pelan dan lapang (pentatonik minor, 54 BPM, pad sinus dan lonceng bergema), **Mars** berat dan berkarat (Frigia, 76 BPM, dengung gergaji, denyut bas, petikan persegi), plus lagu Briefing, Desain, dan Penerbangan ke Bulan/Mars yang lebih bertenaga. Layar Review hening agar jingle hasil terdengar. Not lead dipilih acak berseed (deterministik per lagu) di sekitar nada akor sehingga tidak pernah sumbang. Tombol **Musik** di pojok kanan bawah mematikan musik saja (tersimpan); tombol Suara/Mute tetap mematikan semuanya.

## Free Design
Di Briefing pilih tab **Free Design**: semua planet terbuka, tanpa dialog cerita, dan instrumen bebas dipilih (objektif wajib tanpa instrumen tidak mengunci tombol *Luncurkan*, tetapi skornya turun dan penyebab `OBJECTIVE_MISSED` muncul). Indikator merah dan aturan perakitan tetap berlaku. Hasil misi tidak mengubah progres cerita (poin sains, bintang, Beacon, dan destinasi terbuka). Cocok untuk eksperimen di kelas.

## Cara bermain
1. **Briefing** lalu **Desain Misi**: pilih tujuan, roket, lander, mesin, tangki, panel, baterai, antena, dan instrumen. Lima indikator (Budget, Massa, Delta-v, Daya, Komunikasi) berubah seketika; tombol *Luncurkan* aktif hanya saat status GO.
2. **Penerbangan**: roket berdiri di landasan pulau tepi pantai; tahan W untuk menyalakan mesin (jika W dilepas terlalu lama roket kehilangan daya angkat, jatuh, dan meledak saat menyentuh tanah: misi gagal) (lengan umbilikal terlepas dan berayun menjauh), ikuti panduan pitch (tiap tahap bawah menyala dua kali lebih lama daripada angka dasar PRD agar peluncuran terasa bertahap), tekan **F** tiap kali tahap habis, jaga penanda prograde saat burn, lalu mendarat dengan kecepatan vertikal di bawah 5 m/s dan kemiringan di bawah 15 derajat.
3. **Permukaan**: jelajahi, kerjakan objektif lewat minigame, awasi oksigen, baterai suit, daya wahana, dan sinyal, lalu kembali ke wahana untuk **uplink**.
4. **Review**: skor, bintang, dan kode penyebab.

## Kontrol
| Fase | Tombol |
| --- | --- |
| Desain | Klik katalog; seret mouse memutar kamera; roda mouse zoom |
| Penerbangan | W/S thrust · panah atau mouse (klik layar untuk mengunci) pitch dan yaw · A/D miring saat mendarat · **F** lepas tahap · Shift boost samping · Spasi mode presisi |
| Permukaan | WASD jalan (debu dan jejak sepatu tertinggal; senter helm menyala otomatis saat malam) · Shift lari · Spasi lompat · **E** interaksi (minigame, uplink) · **Q** pemindai · **Tab** jurnal misi (fakta destinasi, data terkumpul) · mouse (klik layar) atau panah memutar kamera |
| Lunar Cruiser | **R** naik/turun (dekat kendaraan) · W/S gas dan rem · A/D kemudi |
| Minigame | Foto: A/D atau panah geser, Spasi potret · Bor: tahan Spasi/mouse · Spektrum: A/D geser, W/S skala, Enter kunci · Getaran: Spasi atau klik tepat ketukan · Pasang dan Sambungkan: angka 1-5 pilih kabel lalu huruf A-E pilih port (atau klik) · Bersihkan Panel (event debu Bulan): mouse/panah gerakkan kuas, tahan Spasi atau klik untuk menggosok |

Di semua fase: tombol Musik (hidup/mati), Detail, Bayangan (hidup/mati), A−/A+ (ukuran teks), dan Suara/Mute di pojok kanan bawah, **F3** untuk overlay performa.

### Mode pengembang (`npm run dev` saja)
`?scene=design|flight|surface` membuka scene langsung, `&dest=mars` memilih destinasi, `&pilot=1` menerbangkan otomatis, `&time=250` memulai permukaan di waktu tertentu, dan tombol 1-5 berpindah scene.

## Performa dan benchmark
Anggaran PRD: di bawah 150 ribu segitiga dan 200 draw call per scene, `dist/` di bawah 10 MB, minimal 30 FPS di grafis terintegrasi. Tekan **F3** (atau buka dengan `?perf`) untuk melihat FPS, resolusi render, segitiga, dan draw call di perangkatmu. Game menurunkan resolusi render otomatis jika rata-rata FPS di bawah 30 dan menaikkannya lagi bila longgar.

| Scene | FPS rata-rata | FPS terendah | Skala render | Segitiga digambar | Draw call |
| --- | --- | --- | --- | --- | --- |
| Desain | 39,6 | - | 0,85 | 2.792 | 64 |
| Briefing (tata surya) | 42,9 | - | 0,85 | 41.234 | 28 |
| Penerbangan (di landasan, pulau) | 31,7 | - | 0,50 | 20.706 | 89 |
| Permukaan Bulan | 30,4 | - | 0,50 | 43.066 | 84 |
| Permukaan Mars | 33,5 | 33 | 0,52 | 43.008 | 80 |
| Mars + badai debu + dust devil | 33,1 | 32 | 0,52 | 43.008 | 80 |
| Mars, bayangan dinyalakan | 25,8 | - | 0,50 | 53.204 | 135 |

**Detail tinggi vs rendah (dengan Lunar Cruiser terpasang, setelah penskala stabil, rasterizer software yang sama):**

| Scene | Detail | FPS rata-rata | Skala render | Segitiga digambar | Draw call |
| --- | --- | --- | --- | --- | --- |
| Desain | tinggi | 30,5 | 0,50 | 40.772 | 80 |
| Desain | rendah | 36,6 | 0,72 | 8.896 | 80 |
| Penerbangan (di landasan) | tinggi | 21,0 | 0,50 | 73.428 | 97 |
| Penerbangan (di landasan) | rendah | 30,7 | 0,50 | 23.670 | 97 |
| Permukaan Bulan | tinggi | 18,5 | 0,50 | 108.248 | 98 |
| Permukaan Bulan | rendah | 27,8 | 0,50 | 45.970 | 98 |

Semua tetap di bawah 150 ribu segitiga dan 200 draw call. Pada rasterizer software detail tinggi lebih lambat (di bawah 30 FPS di Penerbangan dan Permukaan); hasil di GPU terintegrasi sungguhan belum diukur, dan tabel di atas (sebelum Lunar Cruiser) mewakili detail rendah.

Bayangan dinamis nonaktif secara default (PRD 13); nyalakan lewat tombol **Bayangan** di pojok kanan bawah. Biayanya besar karena menambah satu pass geometri, jadi pada perangkat lemah penskala akan menurunkan resolusi.

**Cara dan batas pengukuran (jujur):** Chromium headless dengan rasterizer software SwiftShader (CPU, tanpa GPU) pada 1280x720 di mesin virtual, diukur dengan hitungan `requestAnimationFrame` selama 6 detik setelah penskala stabil. Ini pengukuran konservatif, bukan hasil di GPU terintegrasi sungguhan: pada rasterizer software resolusi render diturunkan sampai 0,52x agar mencapai 30 FPS. **Hasil pada laptop/GPU terintegrasi asli belum diukur**; ukur sendiri dengan F3 (dan bandingkan tombol Detail). Temuan optimasi: `backdrop-filter` pada panel membuat Desain 4x lebih lambat (dihapus), dan terrain dipecah menjadi 16 chunk agar frustum culling membuang segitiga di luar pandangan. Rakitan terberat di Desain (semua modul dan 6 instrumen) memakai 113 draw call.

Ukuran build: `dist/` sekitar 735 KB (HTML 0,6 KB, CSS 16 KB, JS 719 KB atau 195 KB gzip). Build produksi hanya memuat tiga berkas dari origin yang sama dan berjalan offline lewat `npm run preview`.

## Dokumen proyek
- `PRD.md`: sumber kebenaran (tidak diubah).
- `AGENTS.md`: pembagian peran, milestone, dan pelacak progres.
- `DECISIONS.md`: keputusan dan interpretasi ambiguitas.
- `AUDIT.md`: audit kepatuhan terhadap PRD bagian 1–16.
- `CREDITS.md`: pernyataan tanpa aset eksternal, pustaka, dan sumber data.

## Keterbatasan yang diketahui
Peta navigasi (M) dan jendela burn, pohon upgrade, minigame Pindai Radar (menunggu destinasi es seperti Europa), kontrol yang bisa diatur ulang, belum ada (daftar Should/Could PRD). Benchmark GPU nyata belum dilakukan. Rincian di `AUDIT.md`.

## Data dan aturan (M1)
- Katalog di `data/*.json`, divalidasi saat dimuat lewat `src/core/data.ts` (`loadCatalog()`).
- Rumus murni di `src/rules/` (massa, delta-v, daya, komunikasi, budget, preflight, staging, skor), tanpa Three.js/DOM.
- Konstanta mekanik di `src/core/constants.ts`.

## Status
Lihat tabel progres di `AGENTS.md` dan keputusan di `DECISIONS.md`.
