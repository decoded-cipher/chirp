export const SAMPLE_RATE = 11025;
export const WINDOW_SIZE = 1024;
export const HOP_SIZE = 512;

export const FFT_BINS = WINDOW_SIZE / 2 + 1;
export const BIN_WIDTH = SAMPLE_RATE / WINDOW_SIZE;
export const FRAME_DURATION = HOP_SIZE / SAMPLE_RATE;

export const BANDS: readonly (readonly [number, number])[] = [
  [20, 40],
  [40, 80],
  [80, 160],
  [160, 280],
  [280, 400],
  [400, 512],
];

export const THRESHOLD_COEFF = 1.0;
export const THRESHOLD_DECAY = 0.95;

export const FREQ_FUZZ = 1;

export const TARGET_ZONE_MIN = 1;
export const TARGET_ZONE_MAX = 63;
export const FAN_OUT = 5;

export const OFFSET_BUCKET = 2;
export const MIN_VOTES = 20;
export const MIN_MARGIN = 2;
