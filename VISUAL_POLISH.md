# Tugas Penyempurnaan Visual, 3D & Pencahayaan (Visual Polish)

Dokumen ini berisi spesifikasi tugas dan prompt untuk AI Agent guna meningkatkan kualitas visual **ASTRA: Space Mission Architect** tanpa melanggar aturan arsitektur dan batasan performa di `PRD.md`.

---

## Cara Pakai (Untuk Manusia)

1. Simpan dokumen ini sebagai `VISUAL_POLISH.md` di root folder proyek (sejajar dengan `PRD.md`), atau langsung salin kotak **Prompt Eksekusi** di bawah ke AI Agent coding Anda.
2. Pastikan milestone dasar (minimal sampai M4/M6) sudah berjalan sebelum menjalankan tugas penyempurnaan visual ini agar perubahan langsung terlihat di layar Desain, Penerbangan, dan Permukaan.

---

## Prompt Eksekusi untuk AI Agent

Salin dan tempel teks di bawah ini ke AI Agent Anda:

```text
Kamu adalah Senior 3D Graphics & Technical Artist Engineer. Tugasmu sekarang adalah melakukan penyempurnaan visual menyeluruh (Visual & Lighting Polish) pada game "ASTRA: Space Mission Architect".

Sebelum menulis kode, baca kembali aturan di `PRD.md` bagian 12 (Art Direction, Audio & UI/UX), bagian 13 (Spesifikasi Teknis), dan bagian 16 (Aturan Kerja).

BATASAN MUTLAK YANG TIDAK BOLEH DILANGGAR:
1. TANPA ASET EKSTERNAL: Dilarang mengunduh model (.gltf/.obj), tekstur (.png/.jpg), HDRI, atau font eksternal. Semua geometri, warna vertex, dan partikel WAJIB dibuat prosedural dengan kode Three.js.
2. MATERIAL: Tetap gunakan `MeshStandardMaterial` dengan `flatShading: true` dan `vertexColors: true` untuk estetika low-poly yang tajam.
3. ANGGARAN PERFORMA: Total segitiga < 150.000 per scene, draw calls < 200 (wajib pakai `InstancedMesh` untuk objek berulang seperti batu, debu, bintang), dan frame rate minimal 30 FPS di grafis terintegrasi (target 60 FPS).
4. JANGAN MERUSAK LOGIKA: Jangan mengubah rumus atau perilaku di folder `src/rules/` dan `src/events/`. Semua tes unit (`npm test`) harus tetap lulus 100%.

Kerjakan 6 paket penyempurnaan visual berikut secara berurutan:

### 1. Penyempurnaan Geometri Prosedural Low-Poly (`src/gen/`)
Tingkatkan detail siluet dan karakter low-poly pada generator model:
- **Jitter & Faceting (`rocket.ts`, `lander.ts`, `props.ts`):** Buat fungsi utilitas untuk menerapkan sedikit *vertex position jitter* (berbasis RNG berseed) pada geometri organik seperti batu, kawah, dan bukit agar facet flat-shading memantulkan cahaya secara bervariasi dan tidak terlihat seperti primitif standar yang kaku.
- **Detail Modular Wahana (`lander.ts`, `rocket.ts`):**
  - Tambahkan detail visual struktural dari primitif gabungan: kaki pendarat dengan penyangga diagonal (struts), cincin pemisah stage pada roket, nosel mesin berbentuk kerucut terpancung ganda dengan warna interior gelap.
  - Panel surya (`solar_s`, `solar_m`) harus menampilkan bingkai tipis dan grid sel surya menggunakan variasi warna vertex (biru tua metalik / hitam keunguan dengan garis tepi perak).
  - Antena (`ant_lga`, `ant_hga`) dan instrumen sains yang dipilih di fase Desain harus benar-benar menempel secara visual pada slot badan lander dan terlihat jelas perbedaannya.
- **Karakter Astronot (`astronaut.ts`):**
  - Perjelas bentuk helm kaca (visor dengan warna kontras sedikit mengilap/metalik), ransel life-support (PLSS) di punggung dengan indikator lampu kecil (hijau/kuning/merah sesuai status oksigen), serta sendi lengan dan kaki yang terpisah rapi.
  - Haluskan animasi prosedural: tambahkan sedikit *body bobbing* (naik-turun badan), kemiringan torso ke depan saat berlari (Shift), dan pose melayang saat melompat di gravitasi rendah.

### 2. Pencahayaan, Langit & Atmosfer Dinamis (`src/gen/sky.ts` & `src/scenes/`)
Buat suasana tiap destinasi terasa hidup dan kontras sesuai palet di PRD bagian 12:
- **Lighting Setup:**
  - Konfigurasi `renderer.toneMapping = THREE.ACESFilmicToneMapping` dan `toneMappingExposure` yang seimbang agar warna terang tidak pecah (blown out) dan bayangan tetap terbaca.
  - Optimalkan kombinasi `DirectionalLight` (Matahari) dan `HemisphereLight` (pantulan langit vs tanah) sesuai palet destinasi.
  - Sediakan toggle bayangan (`castShadow` / `receiveShadow`) di pengaturan UI (default: nonaktif sesuai PRD, tetapi jika diaktifkan menggunakan `PCFSoftShadowMap` resolusi efisien 1024x1024 di sekitar pemain).
- **Siklus Siang-Malam & Kubah Langit (`sky.ts`, `surface.ts`):**
  - Buat transisi rotasi `DirectionalLight` yang mulus mengikuti waktu permukaan (siang 240 dtk, malam 120 dtk).
  - Saat menuju malam, interpolasi warna `Scene.background`, `FogExp2`, dan intensitas cahaya secara bertahap.
  - Tambahkan kubah bintang prosedural (`THREE.Points` dengan ribuan titik berseed, ukuran dan kecerahan bervariasi) serta objek langit ikonik di kejauhan (mis. bola Bumi biru-putih low-poly di langit Bulan; Matahari yang tampak lebih kecil dan redup di langit Mars).
- **Pencahayaan Lokal Wahana & Astronot:**
  - Tambahkan `SpotLight` atau `PointLight` jarak pendek pada helm astronot (lampu senter otomatis menyala saat malam atau saat baterai suit memadai) dan lampu suar (beacon light) berkedip lembut di atas lander agar pemain selalu bisa melihat markas dari kejauhan saat malam hari.

### 3. Terrain & Lingkungan Permukaan (`src/gen/terrain.ts`, `props.ts`)
- **Pewarnaan Ketinggian & Kemiringan:** Pada generator terrain, tentukan warna vertex tidak hanya dari ketinggian (height), tetapi juga kemiringan (slope)—misalnya lereng kawah yang curam diberi warna batuan yang lebih gelap/kontras dibanding dataran debu.
- **Distribusi Prop InstancedMesh (`props.ts`):**
  - Gunakan `THREE.InstancedMesh` untuk menyebar batu-batu kecil, bongkahan regolit, dan formasi batuan dengan skala dan rotasi acak berseed tanpa membebani draw call.
  - Buat visual khusus untuk **Titik Minat (Objective Markers)** dan **Beacon**: tambahkan struktur probe tua / kapsul Beacon dengan pancaran cincin cahaya vertikal tipis atau tiang antena berkedip agar menarik perhatian pemain dari jauh.

### 4. Efek Partikel & Umpan Balik Visual (VFX Prosedural)
Buat sistem partikel ringan berbasis `THREE.Points` atau `InstancedMesh` untuk memperkuat fisika dan event:
- **Penerbangan & Pendaratan (`flight.ts`):**
  - Semburan api dan asap mesin roket/lander yang intensitas, skala, dan warnanya berubah mengikuti bukaan `throttle` ($0\text{--}100\%$).
  - Kepulan debu permukaan yang menyebar ke samping saat wahana berada di bawah ketinggian $50\text{ m}$ dengan thrust aktif.
- **Eksplorasi Permukaan (`surface.ts`):**
  - Kepulan debu kecil di kaki astronot saat berjalan/berlari dan saat mendarat dari lompatan.
  - Efek gelombang cincin hijau/biru yang memancar keluar dari astronot saat menekan tombol pemindai (`Q`).
  - Visualisasi event random: kabut menebal dan partikel debu berterbangan cepat menyapu layar saat terjadi `ev_dust_storm` di Mars, atau pusaran vertikal kecil untuk `ev_dust_devil`, serta kilatan cahaya langit saat `ev_solar_flare`.

### 5. Kamera & Hangar Desain (`src/scenes/design.ts`, `flight.ts`, `surface.ts`)
- **Hangar 3D (`design.ts`):**
  - Bangun interior atau platform hangar low-poly sederhana (lantai grid teknis, tiang penyangga/gantry di sekitar roket, dan pencahayaan sorot dramatis dari atas).
  - Tambahkan rotasi kamera orbit yang halus dan efek animasi singkat (*scale pop* atau *highlight glow*) saat pemain memasang atau mengganti modul wahana.
- **Camera Feel (`flight.ts`, `surface.ts`):**
  - Tambahkan *camera shake* halus proporsional terhadap thrust saat peluncuran, saat memasuki atmosfer/pendaratan kasar, atau saat terjadi event benturan micrometeoroid.
  - Gunakan interpolasi (`lerp`) yang mulus pada pergerakan kamera orang ketiga di permukaan agar tidak patah-patah saat astronot melompat atau berbelok cepat.

### 6. Penyempurnaan UI, HUD & Potret Karakter (`src/ui/`)
Rapikan tampilan DOM + CSS (`styles.css`, `hud.ts`, `panels.ts`, `dialog.ts`) agar bergaya *modern sci-fi telemetry*:
- Gunakan palet warna UI gelap semi-transparan dengan aksen garis tegas, tipografi `monospace` / `sans-serif` sistem yang bersih, dan transisi CSS halus.
- Pastikan kelima indikator di layar Desain dan empat meter di HUD Permukaan memiliki bar progres animasi, warna status (Hijau/Kuning/Merah), serta **ikon/simbol bentuk** pendamping warna untuk aksesibilitas.
- Buat potret low-poly bergaya vektor/canvas atau render 3D kecil untuk panel dialog **NOVA** (ikon AI geometris yang berdenyut saat berbicara) dan **Dr. Sekar Wulandari**.
- Tambahkan efek visual *scanline* atau gangguan statik tipis pada HUD saat kualitas sinyal (`signalQuality`) turun di bawah $0,5$.

### Verifikasi Wajib Sebelum Melapor:
1. Jalankan `npm test`, `npm run lint`, dan `npm run build` — pastikan 0 error dan 0 warning.
2. Pastikan ukuran folder `dist/` tetap jauh di bawah 10 MB.
3. Hitung atau pantau anggaran geometri (`renderer.info.render.triangles` dan `calls`) untuk memastikan tetap di bawah 150.000 segitiga dan 200 draw calls.
4. Catat keputusan teknis visual yang diambil ke dalam `DECISIONS.md`.
5. Kirimkan laporan ringkas berisi daftar file yang diperbarui, statistik performa (`triangles` dan `draw calls`), dan langkah singkat untuk menguji perubahan visualnya.
```

---

## Checklist Pemeriksaan Visual (Untuk Tim Manusia)

Setelah AI Agent menyelesaikan tugas di atas, Anda dapat memeriksa hasilnya di browser (`npm run dev`) menggunakan daftar periksa berikut:

- [ ] **Hangar Desain:** Apakah platform hangar terlihat jelas dan perubahan modul/instrumen langsung memperbarui bentuk 3D wahana?
- [ ] **Kontras Permukaan:** Apakah palet Bulan (abu perak/biru malam) dan Mars (oranye karat/merah muda) langsung terasa berbeda sejak detik pertama mendarat?
- [ ] **Siklus Siang-Malam:** Apakah bayangan/arah cahaya bergerak dan suasana menjadi gelap saat memasuki fase malam (setelah detik ke-240)?
- [ ] **Umpan Balik Partikel:** Apakah terlihat semburan mesin saat terbang, kepulan debu saat mendarat, dan gelombang pemindai saat menekan tombol `Q`?
- [ ] **Keterbacaan HUD:** Apakah semua indikator (budget, massa, daya, sinyal, oksigen) tetap mudah dibaca di atas latar belakang 3D yang terang maupun gelap?