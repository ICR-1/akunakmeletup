# CREDITS — ASTRA: Space Mission Architect

## Pernyataan aset
**Tanpa aset gambar, model 3D, font, atau audio eksternal.** Proyek ini tidak memuat dan tidak mengunduh model 3D (`.gltf`, `.obj`, `.fbx`), tekstur gambar (`.png`, `.jpg`), font web, atau berkas audio (`.mp3`, `.wav`). Satu-satunya data pihak ketiga adalah garis pantai dunia (lihat *Data geografi* di bawah), tertanam sebagai kode.

- **Model 3D** (roket, lander, astronot, terrain, batu, penanda): dibuat prosedural dari geometri primitif Three.js (termasuk `RoundedBoxGeometry` bawaan paket npm `three`) dengan warna vertex di `src/gen/`; detail tinggi (bawaan) memakai shading mulus, detail rendah memakai `flatShading`. Lunar Cruiser (`src/gen/cruiser.ts`) juga murni kode, tanpa model atau tekstur berkas.
- **Terrain dan langit**: noise berseed buatan sendiri (`src/gen/noise.ts`, 2D dan 3D) dan PRNG berseed (`src/core/rng.ts`). Tekstur permukaan Bulan/Mars (butiran, kawah, riak) digambar kode saat runtime (`src/gen/terrainTexture.ts`), bukan berkas gambar.
- **Planet dan Matahari**: tekstur digambar saat runtime dari noise 3D ke kanvas (`src/gen/planetTextures.ts`) dan shader GLSL buatan sendiri (Matahari, atmosfer); tidak ada berkas gambar. Pendekatan tampilan tata surya terinspirasi dari repositori referensi tim [ICR-1/FE_SUPA](https://github.com/ICR-1/FE_SUPA) (`src/solarSystem.js`); kode ditulis ulang dan tidak ada kode maupun aset yang disalin.
- **Data geografi (Bumi)**: batas daratan, gletser, lapisan es Antarktika, dan danau besar di `src/gen/earthData.ts` berasal dari [Natural Earth](https://www.naturalearthdata.com) skala 1:50 juta (domain publik), disederhanakan (toleransi 0,06 derajat) dan dikuantisasi menjadi angka dalam kode; tekstur Bumi digambar saat runtime dari data itu (`src/gen/earthMap.ts`), bukan berkas gambar. Warna daratan, gurun, hutan, dan es laut adalah pewarnaan buatan sendiri.
- **Suara**: disintesis dengan Web Audio API (osilator, noise, filter, envelope) di `src/core/audio.ts`; tidak ada rekaman.
- **Potret dialog**: SVG poligon inline buatan sendiri.
- **Font**: tumpukan font monospace bawaan sistem; tidak ada font web.
- **Jaringan**: build produksi hanya memuat tiga berkas statis (HTML, JS, CSS) dari origin yang sama; tidak ada CDN atau permintaan pihak ketiga.
- **Referensi visual**: `astronot.jpeg` (di akar repositori, disediakan tim) hanya dipakai sebagai acuan bentuk saat memodelkan astronot secara prosedural. Berkas itu tidak dimuat oleh game dan tidak ikut dalam `dist/`.

## Identitas
Badan antariksa dalam game, *Badan Antariksa Khatulistiwa*, serta tokoh Arka, NOVA, dan Dr. Sekar Wulandari adalah fiksi. Proyek ini tidak memakai logo, merek, atau karakter berhak cipta milik pihak lain, dan tidak berafiliasi dengan badan antariksa mana pun.

## Pustaka perangkat lunak (paket npm, di-bundle)
| Paket | Peran | Lisensi |
| --- | --- | --- |
| [three](https://threejs.org) | Rendering 3D WebGL (satu-satunya dependensi runtime) | MIT |
| [vite](https://vite.dev) | Build dan server pengembangan | MIT |
| [typescript](https://www.typescriptlang.org) | Bahasa dan pengecekan tipe | Apache-2.0 |
| [vitest](https://vitest.dev) | Pengujian unit | MIT |
| [eslint](https://eslint.org), [typescript-eslint](https://typescript-eslint.io), globals, @eslint/js | Lint | MIT |
| @types/three | Tipe untuk Three.js | MIT |

Versi pasti terkunci di `package-lock.json`.

## Sumber data sains
Angka sains yang tampil di game berasal dari PRD proyek, dibulatkan dari data publik NASA:

| Sumber | Dipakai untuk |
| --- | --- |
| [NASA Planetary Fact Sheet](https://nssdc.gsfc.nasa.gov/planetary/factsheet/index.html) (NSSDC) | Gravitasi Bulan (1,62 m/s²) dan Mars (3,71 m/s²), tekanan atmosfer Mars |
| Perkiraan dibulatkan dari pengetahuan umum | Suhu permukaan, irradiansi Matahari, jeda sinyal satu arah (ditandai "perkiraan" di Jurnal Misi) |
| Nilai tuning game (bukan data NASA) | Delta-v yang dibutuhkan, massa, daya, dan biaya komponen, bobot skor |

Persamaan roket Tsiolkovsky dan rumus daya surya dipakai dalam bentuk yang disederhanakan seperti pada PRD bagian 10 dan 14.

## Tantangan
Dibuat untuk NASA International Space Apps Challenge, tantangan *Space Mission Design Game*.
