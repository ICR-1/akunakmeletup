/** Konstanta mekanik (PRD 16.2). Angka katalog ada di data/*.json. */
export const FIXED_DT = 1 / 60;
export const MAX_FRAME_DT = 0.1;
export const DEFAULT_SEED = 2061;
export const G0 = 9.80665;
export const KM_TO_M = 1000;
export const KN_TO_N = 1000;
export const CAMERA_FOV = 60;
export const CAMERA_NEAR = 0.1;
export const CAMERA_FAR = 4000;
export const MAX_PIXEL_RATIO = 2;

export const SCENE_IDS = ['briefing', 'design', 'flight', 'surface', 'review'] as const;
export type SceneId = (typeof SCENE_IDS)[number];

/** Ambang status indikator (PRD 10 dan 14). */
export const MARGIN_GREEN_MIN = 0.1;
export const MARGIN_YELLOW_MIN = 0;

/** Waktu permukaan (PRD 14): 1 jam-game = 20 detik nyata. */
export const GAME_HOUR_SEC = 20;
export const DAY_HOURS = 12;
export const NIGHT_HOURS = 6;
export const DAY_SEC = DAY_HOURS * GAME_HOUR_SEC;
export const NIGHT_SEC = NIGHT_HOURS * GAME_HOUR_SEC;
export const SURFACE_TIME_LIMIT_SEC = 480;
/** Bumi di langit Bulan berputar sekali per siang Matahari (dipercepat dari 24 jam agar putarannya terlihat), mengikuti waktu permukaan. */
export const EARTH_SPIN_HOURS = DAY_HOURS;

/** Komunikasi dan uplink (PRD 14). */
export const COMMS_WINDOW_SEC = 30;
export const SIGNAL_DISTANCE_PENALTY = 0.6;
export const SIGNAL_REF_DISTANCE_M = 400;
export const SIGNAL_MIN = 0.4;
export const SIGNAL_MAX = 1;
export const UPLINK_RADIUS_M = 10;

/** Aturan perakitan (PRD 14). */
export const ASSEMBLY_LIMITS = {
  landers: 1,
  engines: 1,
  tanksMin: 1,
  tanksMax: 2,
  solarMax: 3,
  batteryMax: 2,
  rtgMax: 1,
  mainAntennas: 1,
  relayMax: 1,
  roverMax: 1,
} as const;
export const RELAY_ANTENNA_ID = 'relay_link';
export const DEFAULT_FUEL_FRACTION = 1;

/** Penerbangan (PRD 14). */
export const TRANSFER_BURN_DV_FACTOR = 0.7;
export const TRANSFER_BURN_ERROR_WEIGHT = 0.5;
export const LAUNCH_FAIL_QUALITY = 0.3;

/** Staging (PRD 14). */
export const STAGING = {
  handlingBonusPerStage: 0.25,
  lateGraceSec: 3,
  autoJettisonSec: 8,
  deadWeightAccelFactor: 0.8,
  lateFlightQualityPenalty: 0.1,
  lateErrorFractionPenalty: 0.05,
  lateSafetyScorePenalty: 2,
  fairingSeparationAltitudeKm: 100,
} as const;

/** Skor (PRD 14). */
export const SCORE = {
  scienceMax: 40,
  scienceRequiredWeight: 0.7,
  scienceMinigameWeight: 0.3,
  efficiencyMax: 25,
  efficiencyBudgetWeight: 0.5,
  efficiencyMassWeight: 0.25,
  efficiencyPowerWeight: 0.25,
  efficiencyBudgetSat: 0.15,
  efficiencyMassSat: 0.1,
  efficiencyPowerSat: 0.1,
  safetyMax: 20,
  safetyFaintPenalty: 5,
  safetyLostInstrumentPenalty: 3,
  bonusMax: 15,
  bonusPerObjective: 5,
  bonusPerGoodEvent: 2,
  starThresholds: [40, 60, 80],
  sciencePointsDivisor: 2,
} as const;

/** Penerbangan arcade (PRD 7 dan 14). */
export const FLIGHT = {
  throttleRatePerSec: 0.6,
  /** Peluncuran dan burn transfer: throttle turun sendiri bila W tidak ditahan (harus ditahan untuk mendorong). */
  throttleDecayPerSec: 1.5,
  /**
   * Roket jatuh jika thrust di bawah ambang saat sudah lepas landas: kecepatan jatuh (porsi lintasan per detik)
   * bertambah `accel` per detik; thrust di atas ambang meredam jatuh (`recoverPerSec`) dan memulihkan ketinggian
   * (`climbPerSec`). Menyentuh tanah saat jatuh = peluncuran gagal.
   */
  fall: { holdThrottle: 0.5, accel: 0.015, recoverPerSec: 0.15, climbPerSec: 0.06 },
  precisionFactor: 0.4,
  rotationRateDegS: 60,
  launchStartPitchDeg: 90,
  /** Pengali lama menyala tahap 1 sampai n-1 (peluncuran) agar tahap tidak terasa habis terlalu cepat; tahap transfer tidak diubah. */
  launchBurnScale: 2,
  pitchUnlockProgress: 0.05,
  maxPitchDeg: 100,
  guideExponent: 1.4,
  orbitAltitudeKm: 200,
  altitudeExponent: 1.5,
  orbitParkSec: 15,
  orbitDriftAccel: 14,
  orbitDriftMaxSpeed: 9,
  markerAccel: 12,
  markerMaxSpeed: 8,
  markerMaxDeg: 22,
  markerRestoring: 0.9,
  angleErrorZeroDeg: 30,
  landing: {
    startAltitudeM: 2000,
    startVy: -60,
    rotationMassRefKg: 2000,
    rotationScaleMin: 0.5,
    rotationScaleMax: 1.5,
    maxTiltDeg: 90,
    boostAccel: 2,
    boostFuelKgPerSec: 1.5,
    throttleRatePerSec: 2.0,
    throttleDecayPerSec: 2.5,
    cushionTargetVy: 1.8,
  },
  touchdown: {
    perfectVy: 2,
    successVy: 5,
    crashVy: 12,
    maxTiltDeg: 15,
    perfectFactor: 1,
    successFactor: 0.7,
    damagedFactor: 0.3,
    instrumentLossChance: 0.4,
  },
} as const;

/** Kode LOW_COMMS muncul jika faktor uplink U di bawah nilai ini (PRD 14). */
export const LOW_COMMS_U = 0.5;

/** Permukaan (PRD 8 dan 14). */
export const SURFACE = {
  walkSpeed: 3,
  runSpeed: 5.5,
  jumpSpeed: 2,
  jumpWindupSec: 0.14,
  landRecoverSec: 0.22,
  meterMax: 100,
  oxygenDrain: { idle: 0.15, walk: 0.3, run: 0.6, drive: 0.1 },
  oxygenRecoverPerSec: 5,
  suitDrainPerSec: 0.1,
  suitRecoverPerSec: 4,
  scannerCost: 3,
  scannerCooldownSec: 3,
  minigameCost: 5,
  faintPenaltySec: 90,
  faintRespawnOxygen: 20,
  signalEffectSec: 60,
  /** Radius cakram area jelajah (m); medan berradius 400 m. Peringatan muncul saat tersisa kurang dari boundaryWarnM. */
  boundaryM: 380,
  boundaryWarnM: 18,
  boundaryToastSec: 6,
  interactRadiusM: 5,
  scanRevealSec: 15,
  lowTimeWarnSec: 60,
  objectiveNearMinM: 45,
  objectiveNearMaxM: 160,
  objectiveFarMinM: 262,
  objectiveFarMaxM: 330,
  objectiveSpacingM: 45,
} as const;

/** Minigame (PRD 9 dan 15). */
export const MINIGAME = {
  /** score01 minimum agar objektif dianggap selesai. */
  passScore: 0.2,
  minDurationSec: 20,
  maxDurationSec: 45,
  difficulty: { moon: 0.4, mars: 0.6 } as Record<string, number>,
  defaultDifficulty: 0.5,
} as const;

/** Penyetelan minigame (PRD 9). Durasi rancangan 20-45 detik. */
export const MG = {
  resultShowSec: 1.4,
  photo: {
    shots: 3, timeLimitSec: 30, exposureSec: 0.7, frameTolBase: 14, frameTolDiffGain: 6,
    blurSpeedBase: 30, blurSpeedDiffGain: 10, minTargetSepDeg: 70, panSpeedDegS: 40, mouseDegPerPx: 0.25,
    viewHalfFovDeg: 45, captureReachFactor: 2, speedSmoothing: 0.25,
  },
  drill: {
    timeLimitSec: 40, pressRate: 0.9, decayRate: 0.7, zoneLo: 0.42, zoneWidthBase: 0.3, zoneWidthDiffLoss: 0.1,
    depthTimeSec: 24, aboveZoneRate: 0.6, heatRisePerSec: 0.55, heatCoolPerSec: 0.15,
    overheatCooldownSec: 2, heatAfterOverheat: 0.4, depthWeight: 0.6, zoneWeight: 0.4, overheatPenalty: 0.1,
  },
  spectrum: {
    samples: 64, rmseZero: 0.3, timeLimitSec: 40, dipsBase: 2, dipsDiffGain: 2, dipWidthBase: 0.06, dipWidthDiffLoss: 0.02,
    dipDepthMin: 0.35, dipDepthMax: 0.8, hiddenShiftMax: 0.18, hiddenScaleMin: 0.78, hiddenScaleMax: 1.22,
    ctrlShiftMax: 0.3, ctrlScaleMin: 0.6, ctrlScaleMax: 1.4, shiftRatePerSec: 0.18, scaleRatePerSec: 0.4,
  },
  rhythm: {
    beats: 20, firstBeatSec: 2.5, intervalMin: 0.85, intervalMax: 1.3, windowBase: 0.3, windowDiffLoss: 0.1,
    extraPressPenalty: 0.03, tailSec: 1.5, pxPerSec: 220,
  },
  weather: {
    timeLimitSec: 30, cablesBase: 3, cablesDiffGain: 2, wrongPenalty: 0.12, speedWeight: 0.2,
  },
  panel: {
    timeLimitSec: 25, cols: 12, rows: 6, brushRadius: 1.6, scrubRatePerSec: 2.4, settleRatePerSec: 0.03,
    settleRateDiffGain: 0.05, dustMin: 0.55, dustMax: 1, cleanEnoughMean: 0.04, cursorSpeed: 9,
    mouseCellsPerPx: 0.03,
  },
} as const;

/** Tabrakan objek di permukaan (lingkaran bidang x-z; lihat rules/collision.ts). */
export const COLLISION = {
  playerRadiusM: 0.45,
  roverRadiusM: 1.7,
  /** Jarak dua lingkaran (depan dan belakang) dari pusat kendaraan; menyesuaikan badan memanjang. */
  roverCircleOffsetM: 1.3,
  landerMarginM: 0.3,
  probeRadiusM: 1.5,
  probeTopM: 5.6,
  /** Tiang lampu sorot wahana (radius badan tiang + alasnya) dan jumlah lingkaran sepanjang tangga lander. */
  floodPostRadiusM: 0.3,
  ladderCircles: 4,
  roverStepM: 0.55,
  /** Sisa kecepatan kendaraan setelah menabrak dan jeda antar guncangan tabrakan. */
  bumpSpeedFactor: 0.35,
  bumpCooldownSec: 0.5,
  bumpShake: 0.18,
} as const;

/** Lunar Cruiser di permukaan (kecepatan puncak dan beban daya ada di data modul). */
export const ROVER = {
  mountRadiusM: 6,
  dismountMaxSpeedMs: 2.5,
  accel: 6,
  brake: 12,
  drag: 5,
  reverseFactor: 0.5,
  /** Laju belok (rad/dtk) pada kecepatan penuh. */
  turnRate: 0.95,
  spawnX: 10,
  spawnZ: 1,
  spawnHeading: -0.6,
  camDistanceMul: 1.9,
  camHeightMul: 1.8,
  camAlignRate: 1.4,
  tiltFollow: 8,
  slopeSampleM: 1.6,
  dustMinSpeedMs: 3,
  /** Jarak turun dari kendaraan di sisi kanan (m). */
  exitOffsetM: 2.6,
} as const;

/** Event acak (PRD 14). */
export const EVENTS = {
  surfaceMinSec: 45,
  surfaceMaxSec: 180,
  secondEventChance: 0.5,
  surfaceSalt: 0x5eed1,
  flightSalt: 0xf11e7,
  diceSalt: 0xd1ce,
  /** Skor minigame event minimal agar pilihan dianggap berhasil. */
  minigamePassScore: 0.6,
  /** Lama efek visual per event (detik), hanya tampilan. */
  fxStormSec: 40,
  fxDevilSec: 14,
  fxFlashSec: 0.7,
} as const;

/** Pecahan saat roket atau lander hancur: jumlah serpihan, iterasi pengelompokan, kecepatan lontar, dan putaran. */
export const SHATTER = {
  rocketShards: 84,
  landerShards: 56,
  iterations: 3,
  speedMin: 5,
  speedMax: 22,
  upBias: 0.55,
  spin: 9,
} as const;

/** Adegan animasi sebelum dialog event muncul (hanya tampilan; waktu misi dibekukan selama adegan). */
export const EVENT_SCENE = {
  /** Lama adegan (detik) per id event. Event tanpa entri langsung menampilkan dialog. */
  introSec: {
    ev_micrometeorite_rain: 5.2,
    ev_solar_flare: 3.6,
    ev_dust_on_panels: 3.8,
    ev_dust_storm: 4.6,
    ev_dust_devil: 4.2,
    ev_solar_conjunction: 3.6,
    ev_micrometeor: 4.4,
    ev_engine_glitch: 3.2,
    ev_stage_clamp: 3.2,
  },
  /** Hujan meteorit: jumlah, jendela waktu, jarak jatuh dari astronot, tinggi awal, geseran mendatar, lama jatuh. */
  meteors: { count: 16, windowFrac: 0.8, minDistM: 5, maxDistM: 22, skyM: 60, tiltM: 55, fallSecMin: 0.8, fallSecMax: 1.2, streakLenM: 8, craterMax: 28, craterMinM: 0.45, craterMaxM: 1.1, flashSec: 0.45 },
  /** Meteoroid melintas wahana di luar angkasa: jumlah, lintasan, jarak dari roket. */
  flyby: { count: 10, windowFrac: 0.75, minDistM: 8, maxDistM: 40, spanM: 260, speedMs: 150, thickness: 2.6, lengthScale: 2.4 },
  /** Fraksi awal/akhir adegan untuk bilah sinematik masuk dan keluar (detik). */
  barFadeSec: 0.45,
  /** Getaran kamera per hantaman dan interval denyut getaran (mesin/penjepit). */
  impactShake: 0.3,
  pulseShakeEverySec: 0.45,
  pulseShake: 0.35,
  /** Percikan bunga api semburan surya pada wahana: partikel per detik. */
  flareSparksPerSec: 90,
  /** Debu tersapu angin di panel wahana: partikel per detik. */
  panelDustPerSec: 120,
} as const;

/** Progres dan penyimpanan (PRD 11). */
export const PROGRESS = {
  saveKey: 'astra.save.v1',
  saveVersion: 1,
  startUnlocked: ['moon'],
  defaultVolume: 0.7,
  /** Misi dianggap sukses (membuka destinasi berikutnya, memutar Beacon) jika bintang minimal ini. */
  successStars: 1,
} as const;

/** Audio prosedural. */
export const AUDIO = {
  noiseSeconds: 2,
  noiseSeed: 7,
  rampSec: 0.06,
  engineMaxGain: 0.5,
  engineMinHz: 260,
  engineMaxHz: 1500,
  ambientHum: { moon: 48, mars: 66 } as Record<string, number>,
  /** Musik prosedural: level bus relatif terhadap master, lama fade, dan jendela penjadwalan ke depan. */
  musicGain: 0.5,
  musicFadeInSec: 2.5,
  musicFadeOutSec: 1.2,
  musicLookaheadSec: 0.9,
  musicTickMs: 150,
  musicSeedSalt: 0x6d75,
  /** Suara Lunar Cruiser: dengung motor (Hz, gain) dan gemuruh roda menurut kecepatan 0-1. */
  rover: {
    motorMinHz: 52, motorMaxHz: 150, motorFilterMinHz: 240, motorFilterMaxHz: 900, motorIdleGain: 0.045, motorMaxGain: 0.11,
    rumbleMinHz: 160, rumbleMaxHz: 640, rumbleMaxGain: 0.2,
  },
} as const;

/** Skala visual model roket: radius = akar pangkat tiga (payload / referensi). Bukan data game. */
export const ROCKET_RADIUS_REF_PAYLOAD_KG = 4000;
/** Skala lander di dalam fairing (satuan model lander per satuan roket); lander berskala dunia `VISUAL.landerWorldScale`. */
export const LANDER_IN_FAIRING_SCALE = 0.6;

/** Skala teks UI (aksesibilitas, PRD 12). */
export const TEXT_SCALES = [1, 1.15, 1.3] as const;

/** Penskala kualitas adaptif (anggaran performa PRD 13: minimal 30 FPS di grafis terintegrasi). */
export const QUALITY = {
  downBelowFps: 30,
  upAboveFps: 52,
  minRatio: 0.5,
  downStep: 0.85,
  upStep: 1.08,
  windowSec: 2,
  /** Frame lebih lama dari ini (tab di latar, kompilasi shader) diabaikan. */
  ignoreFrameSec: 0.5,
  /** Jumlah jendela berturut-turut di rasio minimum dan FPS rendah sebelum detail model diturunkan otomatis. */
  fallbackWindows: 6,
} as const;

/** Penyempurnaan visual (VISUAL_POLISH). */
export const VISUAL = {
  exposure: 1.15,
  shadowMapSize: 1024,
  shadowRange: 26,
  shadowBias: -0.0006,
  shadowNormalBias: 0.05,
  sunDiscDistance: 1400,
  sunDiscRadius: { moon: 80, mars: 45 } as Record<string, number>,
  /** Lens flare: jarak sinar uji ke medan (m) dan langkahnya untuk menentukan Matahari tertutup horizon. */
  flareOcclusionRangeM: 600,
  flareOcclusionStepM: 20,
  flareFollow: 6,
  /** Senter helm astronot dan lampu depan Lunar Cruiser (malam): kerucut sorot, jarak, intensitas, dan penerangan sekitar tubuh. */
  flashlight: { angle: 0.52, penumbra: 0.55, intensity: 140, distance: 48, decay: 1.3, fill: 2.2, fillDistance: 5, beamLength: 11, beamOpacity: 0.07, follow: 5 },
  headlights: { angle: 0.6, penumbra: 0.5, intensity: 420, distance: 80, decay: 1.2, beamLength: 18 },
  /** Debu bulat (langkah, roda, pendaratan) dan jejak sepatu di regolit. */
  puffs: { count: 520, size: 0.95, landingCount: 16 },
  footprints: { count: 56, lifeSec: 45, spreadM: 0.16 },
  /** Skala dunia model lander terhadap astronot (tinggi 2 m): lander kecil ~5 m ke dek, kaki ~9 m. Model lander dibangun dalam satuan sendiri. */
  landerWorldScale: 2.6,
  /** Lampu sorot area wahana saat malam: jumlah tiang, jarak dari wahana (m), tinggi lampu, dan penyetelan cahaya. */
  hubLights: { posts: 4, postRadiusM: 8, postHeightM: 5.2, intensity: 300, distance: 50, decay: 1.6, follow: 3, ringBoost: 0.5 },
  beaconMinM: 130,
  beaconMaxM: 190,
  stepDustMinSpeed: 0.3,
  landingDustSpeed: 0.8,
} as const;

/** Guncangan kamera berbasis trauma (kuadrat), meluruh seiring waktu. */
export const SHAKE = { decayPerSec: 1.6, maxOffset: 0.45 } as const;

/** Lokasi peluncuran: pulau di tepi pantai (visual). */
export const LAUNCH_SITE = {
  /** Area datar di sekitar landasan (tanpa pohon), meter. */
  padClearM: 125,
  grassEndM: 170,
  waterlineM: 224,
  islandRadiusM: 262,
  oceanRadiusM: 4200,
  waterY: -1.2,
  seaFloorY: -7,
  hillAmplitudeM: 2.6,
  counts: { broadleaf: 95, pine: 70, palm: 46, bush: 90 },
  minTreeSpacingM: 3.2,
  /** Lengan umbilikal terlepas saat throttle mencapai nilai ini. */
  armReleaseThrottle: 0.3,
  armSwingSec: 1.4,
  armSwingMaxRad: 1.5,
  armDroopRad: 0.75,
  armStaggerSec: 0.12,
  armCount: 4,
} as const;

/**
 * Skala lingkungan peluncuran terhadap roket. Satu satuan roket = `1 / LAUNCH_WORLD_SCALE` meter nyata, dipilih agar lander
 * di dalam fairing (dibuat `LANDER_IN_FAIRING_SCALE`) sama besarnya dengan lander di permukaan (`VISUAL.landerWorldScale`):
 * roket Pandu-1 sekitar 82 m tinggi dan berdiameter sekitar 10 m, cukup untuk memuat lander dan Lunar Cruiser.
 * Pulau, pepohonan, dan bangunan (dalam meter) dikecilkan sebesar ini ketika dipasang di scene roket.
 */
export const LAUNCH_WORLD_SCALE = LANDER_IN_FAIRING_SCALE / VISUAL.landerWorldScale;

/** Konstanta antarmuka umum. */
export const UI = {
  /** Lama pudar keluar (dan masuk) saat berpindah scene, detik. */
  sceneFadeSec: 0.22,
} as const;
