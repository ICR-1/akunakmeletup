# Rombak UI/UX ASTRA — Rencana Implementasi

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Merapikan seluruh UI ASTRA agar terasa buatan profesional (tidak ada yang meluber, bertabrakan, atau berbeda gaya antar-layar) sambil mempertahankan gaya *claymorphism*, lalu menambah tooltip istilah, transisi scene, animasi panel, chip tombol keyboard, dan toast seragam.

**Architecture:** Pertama dibuat skrip audit visual (browser headless) sebagai alat ukur. Lalu token desain (ukuran teks, sudut, jarak) di `:root` dan dipaksakan lewat tes yang membaca `styles.css`. Perbaikan per layar memakai token itu. Logika penempatan (label anti-tumpuk, tooltip di dalam viewport, transisi scene, chip tombol) ditulis sebagai fungsi murni yang diuji Vitest di lingkungan `node` (tanpa DOM).

**Tech Stack:** TypeScript strict, Vite, Three.js, CSS murni, Vitest (`environment: 'node'`), `puppeteer-core` (dev saja, untuk audit) dengan Firefox sistem.

**Spec:** Tidak ada dokumen spesifikasi terpisah (pemilik proyek minta langsung ke rencana). Sumbernya percakapan dan audit layar 2026-10-23, yang dirangkum di bagian **Latar** di bawah.

## Latar (hasil audit 1366×768 dan 1024×700)

- **Design:** tombol LUNCURKAN (`sticky`) menimpa daftar objektif. Scrollbar panel putih polos di Firefox. Label 3D "Wahana (lander)" tertutup panel kanan. Tombol "Terapkan Rekomendasi NOVA" tetap tampil saat GO (`[hidden]` kalah oleh `display` kelas). Ada tiga gaya judul berbeda.
- **Flight:** banner instruksi atas tertimpa panel tahap dan telemetri pada 1024px. `.nova-bubble` (top 140px, left 18px) menempel ke panel tahap.
- **Briefing:** label planet saling tumpuk. Tombol LANJUT dialog memakai kelas `launch-button` (selebar dialog). Layar memuat masih terlihat di belakang dialog pembuka.
- **Review:** tanpa hasil misi hanya ada kotak teks dan ikosahedron hijau.
- **Umum:** 16 ukuran font berbeda dan 9 nilai `border-radius` di `src/ui/styles.css`.
- **Sudah dikerjakan sebelum rencana ini:** kartu tujuan Briefing, penghapusan kotak kontrol keyboard Flight/Surface, dan kompas mata angin Surface.

## Global Constraints

- Gaya tetap *claymorphism*: tombol tebal dengan bayangan bawah padat, sudut membulat, aksen warna `--c-*` yang ada.
- Tanpa aset eksternal: tidak ada font, gambar, atau CDN baru. Ikon hanya dari variabel `--icon-*` atau SVG di dalam kode.
- `src/rules/` dan `src/events/` tidak boleh disentuh. Tidak ada `Math.random()`.
- Semua teks UI berbahasa Indonesia dan ditaruh di `src/core/strings.ts`, bukan ditulis langsung di komponen.
- Definition of Done tiap task: `npm test`, `npm run lint`, dan `npm run build` lulus, serta `npm run ui:audit` tidak melaporkan `OVERLAP`/`ESCAPES`/`OFFSCREEN` baru.
- Skala token yang berlaku (dipakai semua task):
  - Ukuran teks: `--fs-xs: 11px; --fs-sm: 12px; --fs-md: 13px; --fs-lg: 15px; --fs-xl: 18px; --fs-2xl: 24px; --fs-display: 36px`
  - Sudut: `--r-sm: 8px; --r-md: 12px; --r-lg: 16px; --r-xl: 22px` (plus `--radius-pill` yang sudah ada). `--radius-panel` menjadi alias `var(--r-xl)` dan `--radius-card` menjadi alias `var(--r-md)`.
  - Jarak: `--sp-1: 4px; --sp-2: 8px; --sp-3: 12px; --sp-4: 16px; --sp-5: 20px; --sp-6: 24px`
  - Jarak tepi HUD: `--hud-edge: 18px`. Celah antar-panel minimum: `--hud-gap: 12px`.

## Review Focus

1. **Ukuran teks A+ (`--ui-scale` 1.2) di layar 1024×700:** panel tidak boleh bertabrakan atau keluar layar. Ini diuji di Task 1 lewat audit dengan skala 1.2.
2. **Judul objektif atau nama modul yang panjang:** teks harus terbungkus atau terpotong "…" di dalam bingkainya, tidak meluber. Ini diuji di Task 1 (pemeriksaan `ESCAPES`/`HOVERFLOW`).
3. **Elemen ber-atribut `hidden` yang punya `display` dari kelasnya:** harus tetap tersembunyi. Ini diuji di Task 2 (tes aturan global `[hidden]`).
4. **`go()` dipanggil dua kali cepat, atau saat layar sedang memudar:** scene akhir harus yang terakhir diminta, dan tiap scene masuk sekali saja. Ini diuji di Task 9.
5. **Tooltip di dekat tepi layar:** tooltip tetap utuh di dalam viewport. Ini diuji di Task 8.

---

### Task 1: Skrip audit visual

**Files:**
- Create: `scripts/ui-audit.mjs`
- Modify: `package.json` (devDependency `puppeteer-core@^23`, script `"ui:audit": "node scripts/ui-audit.mjs"`)
- Modify: `eslint.config.*` bila `scripts/` belum diabaikan atau dikenali sebagai Node

**Interfaces:**
- Produces: `npm run ui:audit` menulis screenshot `ui-audit/<scene>-<w>[-x1.2].png` dan `ui-audit/report.json` (`Record<string, string[]>`), lalu keluar dengan kode 1 jika ada temuan `OVERLAP`/`ESCAPES`/`OFFSCREEN`. Folder `ui-audit/` dimasukkan ke `.gitignore`.

- [ ] **Step 1:** Tulis skrip dengan logika sama seperti audit 2026-10-23:
  - Firefox dari env `FIREFOX_BIN` (bawaan `/usr/bin/firefox`), URL dari env `AUDIT_URL` (bawaan `http://localhost:5173/`).
  - Viewport `[1366,768]` dan `[1024,700]`, ditambah satu putaran 1024×700 dengan `document.documentElement.style.setProperty('--ui-scale','1.2')`.
  - Scene dibuka lewat `window.__astra.scenes.switchTo(id)`, dengan jeda 3,5 detik per scene.
  - Pemeriksaan `OFFSCREEN` mengabaikan elemen yang terpotong oleh leluhur ber-`overflow` `auto|hidden|scroll`. Bandingkan dengan kotak leluhur itu, bukan dengan viewport.
  - `OVERLAP` dihitung antar-elemen `position:absolute|fixed` yang terlihat, lebar > 40px, dan bukan bagian `.label-layer`, termasuk elemen ber-`pointer-events:none`.
- [ ] **Step 2:** Jalankan `npm run dev` lalu `npm run ui:audit`. Simpan `report.json` sebagai baseline. Hasil yang diharapkan: temuan Design (tombol luncur), Flight 1024 (banner), dan Briefing (label planet) muncul.
- [ ] **Step 3:** Commit `chore: skrip audit visual UI`.

### Task 2: Token desain dan tes konsistensi CSS

**Files:**
- Modify: `src/ui/styles.css` (`:root` di baris 1–75, lalu seluruh berkas)
- Create: `tests/ui/designTokens.test.ts`

**Interfaces:**
- Produces: variabel token dari Global Constraints. Aturan global `[hidden] { display: none !important; }` di bagian atas (setelah `:root`), dan aturan `X[hidden] { display: none; }` per kelas dihapus.

- [ ] **Step 1: Tes gagal.** `tests/ui/designTokens.test.ts` membaca `src/ui/styles.css` dengan `fs`, membuang blok `:root { … }` pertama, lalu:
  - `it('tidak ada font-size px mentah')`: `expect(css.match(/font-size:\s*[\d.]+px/g)).toBeNull()`
  - `it('border-radius hanya token, 50%, 0, atau ≤2px')`: setiap `border-radius:` bernilai `var(--r-*)`, `var(--radius-*)`, `inherit`, `50%`, `0`, `1px`, atau `2px`
  - `it('aturan [hidden] global ada')`: `expect(css).toMatch(/^\[hidden\]\s*\{\s*display:\s*none\s*!important;?\s*\}/m)`
- [ ] **Step 2:** `npx vitest run tests/ui/designTokens.test.ts`. Hasil yang diharapkan: ketiga tes FAIL.
- [ ] **Step 3:** Tambahkan token ke `:root`, lalu ganti nilai mentah:
  - Ukuran teks: 10, 11, 11.5 → `xs`. 12, 12.5 → `sm`. 13, 13.5 → `md`. 14, 15, 16 → `lg`. 17, 20, 22 → `xl`. 24, 28 → `2xl`. 38 → `display`.
  - Sudut: 8, 10 → `--r-sm`. 12, 14 → `--r-md`. 16, 18 → `--r-lg`. 22 → `--r-xl`. 999px → `--radius-pill`.
  - Tambahkan aturan `[hidden]` global.
- [ ] **Step 4:** `npm test`, `npm run lint`, `npm run build`. Hasil yang diharapkan: lulus. Jalankan `npm run ui:audit`: tombol "Terapkan Rekomendasi NOVA" tidak terlihat saat GO di `design-1366.png`.
- [ ] **Step 5:** Commit `refactor(ui): token desain dan aturan hidden global`.

### Task 3: Kerangka panel seragam (permukaan, judul, scrollbar, animasi masuk)

**Files:**
- Modify: `src/ui/styles.css` (bagian "Lapisan Scene & Panel Kartu", `.hud-panel` sekitar baris 705, `.briefing-menu`, `.nova-bubble` sekitar baris 1340, `.dialog`, `.review-card`, `.toasts .toast`)
- Test: `tests/ui/designTokens.test.ts`

**Interfaces:**
- Produces:
  - Token permukaan `--surface-panel` (gradien panel yang sekarang dipakai `.panel`), `--border-panel: 2px solid rgba(129, 140, 248, 0.38)`, `--shadow-panel` (yang sudah ada).
  - Satu gaya judul panel (`h2`: `--fs-xl`, ikon sparkle) dan satu gaya judul seksi (`h3`, `.section-head .section-title`, `.objective-panel h3`, `.journal-panel h3`: `--fs-sm`, kapital, `letter-spacing: 0.08em`, warna `--c-purple`).
  - Keyframes `ui-enter` (opacity 0→1, translateY 8px→0, 220ms).

- [ ] **Step 1: Tes gagal.** Tambahkan ke `designTokens.test.ts`:
  - `it('scrollbar standar diset')`: `expect(css).toMatch(/scrollbar-color:/)` dan `expect(css).toMatch(/scrollbar-width:\s*thin/)`
  - `it('gerak dikurangi menghormati preferensi')`: `expect(css).toMatch(/@media \(prefers-reduced-motion: reduce\)[\s\S]*animation: none/)`
- [ ] **Step 2:** Jalankan tes. Hasil yang diharapkan: kedua tes baru FAIL.
- [ ] **Step 3:** Terapkan ke CSS:
  - Pakai `--surface-panel`, `--border-panel`, `--shadow-panel`, dan `--r-xl` di `.panel`, `.hud-panel`, `.briefing-menu`, `.dialog`, `.review-card`, `.minigame`, dan `.settings-panel`. `.nova-bubble` dan `.toast` memakai `--r-lg`.
  - Tambahkan `scrollbar-width: thin; scrollbar-color: #818cf8 transparent;` ke semua kontainer yang punya `overflow-y: auto`.
  - Pasang `animation: ui-enter 220ms ease-out both` pada kontainer panel tersebut.
  - Tambahkan blok `@media (prefers-reduced-motion: reduce) { *, *::before, *::after { animation: none !important; transition: none !important; } }`.
- [ ] **Step 4:** Jalankan `npm test`, `npm run lint`, `npm run build`, lalu `npm run ui:audit`. Periksa screenshot: tidak ada scrollbar putih, dan judul di ketiga panel Design satu gaya.
- [ ] **Step 5:** Commit `style(ui): kerangka panel claymorphism seragam`.

### Task 4: Panel kanan Design (kepala, isi yang bisa di-scroll, kaki)

**Files:**
- Modify: `src/ui/panels.ts:286-306` (`buildInspector`)
- Modify: `src/ui/styles.css` (`.panel`, `.panel-right button.launch-button` di baris 571–576)

**Interfaces:**
- Produces: `aside.panel.panel-right` menjadi `display:flex; flex-direction:column; overflow:hidden`, dengan anak `div.panel-head` (badge + autoFix), `div.panel-scroll` (`flex:1; min-height:0; overflow-y:auto`, berisi seksi indikator, objektif, tahapan, NOVA), dan `div.panel-foot` (tombol luncur + `p.hint`). Aturan `sticky` untuk launch-button dihapus.

- [ ] **Step 1:** Ubah `buildInspector()` sesuai struktur di atas. Tidak ada perubahan logika `update()`.
- [ ] **Step 2:** CSS: `.panel-foot` diberi `padding-top: var(--sp-3)`, garis atas `1px solid rgba(255,255,255,0.08)`, dan latar sama dengan panel. `.autofix-button` satu baris dengan `white-space: nowrap; overflow: hidden; text-overflow: ellipsis`, dengan teks lengkap di atribut `title`.
- [ ] **Step 3:** Jalankan `npm run ui:audit`. `design-1366.png` dan `design-1024.png` harus menampilkan objektif utuh di atas tombol LUNCURKAN, tanpa ada yang tertutup.
- [ ] **Step 4:** Jalankan `npm test`, `npm run lint`, `npm run build`, lalu commit `fix(design): tombol luncur di kaki panel, tidak menimpa objektif`.

### Task 5: Label melayang anti-tumpuk (Briefing, Design)

**Files:**
- Create: `src/ui/labelLayout.ts`
- Create: `tests/ui/labelLayout.test.ts`
- Modify: `src/scenes/briefing.ts` (`placeLabels`), `src/scenes/design.ts:307` (`placeLabels`)

**Interfaces:**
- Produces:
  - `export interface LabelBox { x: number; y: number; w: number; h: number }`, dengan x,y = titik tengah bawah dalam px.
  - `export function nudgeApart(boxes: LabelBox[], gap: number): number[]` mengembalikan geser-Y (≤ 0, ke atas) per label. Label diproses dari y terbesar ke terkecil, dan tiap label naik sampai tidak beririsan dengan label yang sudah ditempatkan.
  - `export function clampToZone(x: number, w: number, minX: number, maxX: number): number | null` (`x` = titik tengah label) mengembalikan x yang dijepit supaya label utuh di `[minX, maxX]`, atau `null` jika jangkar di luar zona lebih dari `w`.

- [ ] **Step 1: Tes gagal.**
  - `nudgeApart([{x:100,y:200,w:80,h:20},{x:110,y:205,w:80,h:20}], 4)` → hasil `[-19, 0]`. Label kedua (y lebih besar) tetap di tempat, menempati 185–205. Label pertama naik sampai alasnya di 185 − 4 = 181, jadi 181 − 200 = −19.
  - Dua label yang tidak beririsan → `[0, 0]`.
  - `clampToZone(10, 60, 0, 500)` → `30`. `clampToZone(-100, 60, 0, 500)` → `null`.
- [ ] **Step 2:** Jalankan `npx vitest run tests/ui/labelLayout.test.ts`. Hasil yang diharapkan: FAIL (modul belum ada).
- [ ] **Step 3:** Implementasikan kedua fungsi itu.
- [ ] **Step 4:** Integrasikan:
  - **Briefing:** kumpulkan semua label yang terlihat, ukur `offsetWidth`/`offsetHeight` sekali saat dibuat dan simpan di `Map`, lalu terapkan `nudgeApart(boxes, 4)`.
  - **Design:** zona bebas dihitung dari `getBoundingClientRect()` `.panel-left` dan `.panel-right` (dibagi `--ui-scale`) dengan celah `--hud-gap`. Label dengan hasil `clampToZone` `null` disembunyikan.
- [ ] **Step 5:** Jalankan tes. Hasil yang diharapkan: PASS. Lalu jalankan `npm run ui:audit`: di `briefing-*.png` label Venus, Merkurius, dan Bulan tidak tumpuk, dan "Wahana (lander)" tidak tertutup panel.
- [ ] **Step 6:** Commit `feat(ui): label melayang anti-tumpuk`.

### Task 6: Zona HUD Flight dan posisi gelembung NOVA

**Files:**
- Modify: `src/ui/styles.css` (`.hud-top` di baris 665, `.hud-panel`, `.nova-bubble`)

**Interfaces:**
- Produces:
  - `.hud-top { width: min(720px, calc(100vw - 2 * (290px + var(--hud-edge) + var(--hud-gap)))) }`. 290px adalah lebar `.hud-right`, dan pesan boleh dua baris.
  - `.scene-ui-flight .nova-bubble { top: auto; bottom: 84px; left: var(--hud-edge) }` (di atas tombol pengaturan).
  - Di Surface, gelembung tetap di kiri atas, tetapi `top` diambil dari token yang sama dengan `.hud-panel`.

- [ ] **Step 1:** Terapkan CSS di atas. Pada `@media (max-width: 1100px)`, `.hud-right` menyempit ke 240px dan rumus `.hud-top` memakai 240px.
- [ ] **Step 2:** Jalankan `npm run ui:audit`. `flight-1024.png` dan `flight-1024-x1.2.png` harus bebas `OVERLAP` antara `.hud-top`, `.hud-left`, `.hud-right`, dan `.nova-bubble`.
- [ ] **Step 3:** Jalankan `npm test`, `npm run lint`, `npm run build`, lalu commit `fix(flight): zona HUD tanpa tabrakan`.

### Task 7: Briefing, dialog, dan Review kosong

**Files:**
- Modify: `src/ui/dialog.ts:140` (tombol `next`)
- Modify: `src/scenes/review.ts:43-47`
- Modify: `src/core/strings.ts` (`REVIEW_UI.emptyTitle`, `REVIEW_UI.emptyBody`, `REVIEW_UI.toDesign`)
- Modify: `src/ui/styles.css` (`.dialog-next`, `.progress-line`, `.review-empty`)

**Interfaces:**
- Produces:
  - Kelas `dialog-next`: gaya tombol hijau *claymorphism* seperti `launch-button`, tetapi `width:auto; min-width:160px`, rata kanan di baris aksi bersama tombol Lewati.
  - Review tanpa hasil menampilkan `div.briefing-menu.centered.review-empty` berisi `h2` (`REVIEW_UI.emptyTitle` = "Belum ada misi"), `p` (`REVIEW_UI.emptyBody` = "Rakit wahana dan luncurkan misi pertamamu untuk melihat skor, bintang, dan medali di sini."), dan tombol `launch-button` (`REVIEW_UI.toDesign` = "Ke Desain Misi") yang memanggil `this.ctx.go('design')`. Ikosahedron `this.gem` disembunyikan (`visible = false`) saat tidak ada hasil, dan ditampilkan lagi saat ada hasil.

- [ ] **Step 1:** Ubah kelas tombol `next` di `showDialogSequence` menjadi `dialog-next`, lalu tambahkan CSS-nya.
- [ ] **Step 2:** Beri `.progress-line` garis pemisah atas (`border-top: 1px solid rgba(255,255,255,0.08); padding-top: var(--sp-3)`).
- [ ] **Step 3:** Implementasikan keadaan kosong Review sesuai Interfaces.
- [ ] **Step 4:** Jalankan `npm run ui:audit`. Pastikan `review-*.png` menampilkan kartu dengan tombol, dan dialog Briefing punya tombol LANJUT ringkas di kanan. Pastikan juga `#loading` sudah tidak ada di DOM pada saat screenshot Briefing. Jika masih ada, tambahkan pemeriksaan `LOADING_STUCK` ke audit dan perbaiki urutan di `src/core/game.ts:86-92` supaya dialog pembuka baru dibuat setelah `loading.hide()` selesai.
- [ ] **Step 5:** Jalankan `npm test`, `npm run lint`, `npm run build`, lalu commit `feat(ui): dialog ringkas, Review kosong yang mengarahkan`.

### Task 8: Tooltip istilah sains

**Files:**
- Create: `src/ui/tooltip.ts`
- Create: `tests/ui/tooltip.test.ts`
- Modify: `src/core/strings.ts` (`GLOSSARY`)
- Modify: `src/ui/hud.ts` (label indikator), `src/ui/panels.ts` (label metrik), `src/ui/flightHud.ts` (`line()` untuk `handling`, `tilt`), `src/ui/surfaceHud.ts` (meter `signal`), `src/scenes/briefing.ts` (chip gravitasi/budget, menggantikan atribut `title`)
- Modify: `src/ui/styles.css` (`.tooltip`)

**Interfaces:**
- Produces:
  - `export type GlossaryKey = 'budget' | 'mass' | 'deltaV' | 'power' | 'comms' | 'margin' | 'gravity' | 'handling' | 'signal' | 'dryMass' | 'm0'`
  - `GLOSSARY: Record<GlossaryKey, { term: string; text: string }>` di `strings.ts`. Teksnya 1–2 kalimat, bahasa siswa SMP. Contoh: `deltaV` = "Delta-v (Δv): total perubahan kecepatan yang bisa dihasilkan roket. Makin jauh tujuannya, makin besar Δv yang dibutuhkan."
  - `export function placeTooltip(anchor: {x:number;y:number;w:number;h:number}, size: {w:number;h:number}, viewport: {w:number;h:number}, margin = 8): {x:number;y:number}` mengembalikan posisi di atas anchor dan rata tengah. Jika ruang di atas tidak cukup, tooltip pindah ke bawah anchor. Posisi x dijepit ke `[margin, viewport.w − size.w − margin]`.
  - `export function attachTooltip(target: HTMLElement, key: GlossaryKey): void` memakai satu elemen `div.tooltip` bersama di `document.body`. Tooltip muncul saat `pointerenter`/`focus` dan hilang saat `pointerleave`/`blur`. Target diberi `tabindex="0"` dan garis bawah putus-putus.

- [ ] **Step 1: Tes gagal** untuk `placeTooltip`:
  - Anchor `{x:500,y:300,w:40,h:20}`, size `{w:200,h:60}`, viewport `{w:1000,h:800}` → `{x:420, y:232}`.
  - Anchor di `x:2` → `x` hasil `8`.
  - Anchor di `y:10` → tooltip di bawah: `y = 10 + 20 + 8 = 38`.
  - Setiap `GLOSSARY[k].text` tidak kosong dan panjangnya ≤ 160 karakter.
- [ ] **Step 2:** Jalankan tes. Hasil yang diharapkan: FAIL.
- [ ] **Step 3:** Implementasikan `placeTooltip`, `attachTooltip`, dan `GLOSSARY`, lalu pasang ke target yang terdaftar di Files.
- [ ] **Step 4:** Jalankan tes. Hasil yang diharapkan: PASS. Lalu jalankan `npm run lint` dan `npm run build`.
- [ ] **Step 5:** Commit `feat(ui): tooltip istilah sains`.

### Task 9: Transisi antar-scene

**Files:**
- Create: `src/core/transition.ts`
- Create: `tests/core/transition.test.ts`
- Modify: `src/core/game.ts:59` (`go`), `game.ts:188` (tombol dev 1–5 tetap langsung), dan loop update
- Modify: `index.html` (elemen `<div id="scene-fade"></div>`), `src/ui/styles.css` (`#scene-fade`)
- Modify: `src/core/constants.ts` (`UI.sceneFadeSec = 0.22`)

**Interfaces:**
- Produces:
  - `export class SceneTransition { constructor(fadeSec: number); request(id: SceneId): void; update(dt: number): { switchTo: SceneId | null; opacity: number }; get busy(): boolean }`
  - Alurnya: opacity naik 0→1 selama `fadeSec`. Tepat saat mencapai 1, `switchTo` berisi id terakhir yang diminta (sekali saja). Lalu opacity turun 1→0. `request()` saat sedang memudar hanya mengganti id tujuan.
  - `game.ts`: `go` memanggil `transition.request(id)`. Tiap frame, `update(dt)` dijalankan, `scenes.switchTo` dipanggil bila ada `switchTo`, lalu `#scene-fade` diberi `style.opacity`.

- [ ] **Step 1: Tes gagal** (`fadeSec` 0.2, langkah `dt` 0.05):
  - Satu `request('design')`: hasil `switchTo` adalah `'design'` tepat sekali, pada langkah ke-4. Opacity kembali 0 setelah langkah ke-8, dan `busy` menjadi `false`.
  - `request('design')`, lalu setelah 2 langkah `request('flight')`: satu-satunya `switchTo` yang muncul adalah `'flight'`.
  - Tanpa request: `update` mengembalikan `{switchTo:null, opacity:0}`.
- [ ] **Step 2:** Jalankan tes. Hasil yang diharapkan: FAIL.
- [ ] **Step 3:** Implementasikan `SceneTransition` dan integrasikan di `game.ts`. `#scene-fade` diberi `position:fixed; inset:0; background:#0c0f24; pointer-events:none; z-index:900; opacity:0`.
- [ ] **Step 4:** Jalankan `npm test`, `npm run lint`, `npm run build`. Uji manual: Briefing → Desain → Luncurkan menampilkan pudar singkat tanpa kedipan.
- [ ] **Step 5:** Commit `feat(core): transisi pudar antar-scene`.

### Task 10: Chip tombol keyboard dan kompas tanpa tumpukan

**Files:**
- Create: `src/ui/keyHints.ts`
- Create: `tests/ui/keyHints.test.ts`
- Modify: `src/ui/flightHud.ts` (`prompt`), `src/ui/surfaceHud.ts` (`setPrompt`, `scanner`, penanda kompas), `src/minigames/base.ts:73` (petunjuk panel minigame)
- Modify: `src/ui/styles.css` (`kbd.key`)

**Interfaces:**
- Produces:
  - `export type HintPart = { key: string } | { text: string }`
  - `export function parseKeyHints(s: string): HintPart[]` memecah token `[X]` menjadi `{key:'X'}`, dan teks di sekitarnya menjadi `{text}`.
  - `export function renderKeyHints(target: HTMLElement, s: string): void` mengosongkan target lalu mengisinya dengan teks dan `kbd.key`.
  - CSS `kbd.key` bergaya *clay*: `--r-sm`, `border-bottom: 3px solid`, `--fs-sm`, latar terang.
  - Penanda kompas: `export function assignRows(items: {x:number; w:number}[], gap: number): number[]` (ditambahkan ke `src/ui/labelLayout.ts`) memberi baris 0 atau 1 secara greedy dari kiri (`x` = tepi kiri dalam px, item diproses urut `x`; item masuk baris 0 bila tidak beririsan dengan item baris 0 sebelumnya ditambah `gap`). Penanda di baris 1 diberi `top: 24px`.

- [ ] **Step 1: Tes gagal.**
  - `parseKeyHints('[E] Uplink data ke Bumi')` → `[{key:'E'},{text:' Uplink data ke Bumi'}]`.
  - `parseKeyHints('Tahan [Spasi] lalu [F]')` → `[{text:'Tahan '},{key:'Spasi'},{text:' lalu '},{key:'F'}]`.
  - `parseKeyHints('tanpa tombol')` → `[{text:'tanpa tombol'}]`.
  - `assignRows([{x:0,w:50},{x:40,w:50},{x:200,w:50}], 4)` → `[0,1,0]`.
- [ ] **Step 2:** Jalankan tes. Hasil yang diharapkan: FAIL.
- [ ] **Step 3:** Implementasikan, lalu ubah string prompt dan petunjuk minigame di `strings.ts` supaya tombolnya ditulis sebagai `[X]` (contoh: "Tahan [W] untuk menyalakan mesin", "[Spasi] untuk memotret").
- [ ] **Step 4:** Jalankan `npm test`, `npm run lint`, `npm run build`, lalu `npm run ui:audit`. Periksa `surface-*.png`: prompt menampilkan chip `E`.
- [ ] **Step 5:** Commit `feat(ui): chip tombol keyboard dan kompas bertingkat`.

### Task 11: Audit akhir dan dokumentasi

**Files:**
- Modify: `DECISIONS.md` (entri 138: "Rombak UI/UX: token desain, kerangka panel seragam, tooltip istilah, transisi scene, chip tombol; kotak kontrol keyboard Flight/Surface dihapus atas permintaan pemilik proyek; utara kompas = −Z dunia")
- Modify: `AGENTS.md` (baris "Tambahan" di bagian 7: "rombak UI/UX (138)")

- [ ] **Step 1:** Jalankan `npm run ui:audit`. Hasil yang diharapkan: `report.json` tanpa `OVERLAP`/`ESCAPES`/`OFFSCREEN` di semua scene dan viewport, termasuk `x1.2`, serta exit code 0.
- [ ] **Step 2:** Jalankan `npm test`, `npm run lint`, `npm run build`, lalu catat jumlah tes dan ukuran `dist/`.
- [ ] **Step 3:** Tulis entri DECISIONS dan AGENTS, lalu commit `docs: catat rombak UI/UX`.
