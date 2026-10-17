/**
 * Perjalanan transfer (visual murni): seberapa jauh wahana sudah meninggalkan Bumi, dan skala tampilan Bumi
 * serta planet tujuan. Bumi mengecil dan menjauh bertahap; planet tujuan tumbuh dari titik kecil.
 */
export type JourneyPhase = 'launch' | 'orbit' | 'transfer' | 'capture' | 'landing' | 'ended';

export const EARTH_FAR_SCALE = 0.03;
export const DEST_SCALE_START = 0.08;
export const DEST_SCALE_END = 1.6;
export const DEST_SCALE_CAPTURE = 2.0;

const smooth01 = (x: number): number => {
  const t = Math.min(1, Math.max(0, x));
  return t * t * (3 - 2 * t);
};

/** 0 = masih di orbit Bumi, 1 = transfer selesai; `burned` = bagian bahan bakar tahap transfer yang sudah terpakai. */
export function departureProgress(phase: JourneyPhase, burned: number): number {
  if (phase === 'transfer') return smooth01(burned);
  return phase === 'capture' || phase === 'landing' || phase === 'ended' ? 1 : 0;
}

export const earthScale = (departure: number): number => 1 - departure * (1 - EARTH_FAR_SCALE);

/** Skala planet tujuan: tumbuh sepanjang transfer, lalu membesar lagi saat penangkapan orbit. */
export function destScale(phase: JourneyPhase, departure: number, burned: number): number {
  if (phase === 'capture') return DEST_SCALE_END + Math.min(1, Math.max(0, burned)) * (DEST_SCALE_CAPTURE - DEST_SCALE_END);
  return DEST_SCALE_START + (DEST_SCALE_END - DEST_SCALE_START) * departure;
}
