const BINARY_SUFFIXES: Record<string, number> = {
  Ki: 2 ** 10,
  Mi: 2 ** 20,
  Gi: 2 ** 30,
  Ti: 2 ** 40,
  Pi: 2 ** 50,
  Ei: 2 ** 60,
};

const DECIMAL_SUFFIXES: Record<string, number> = {
  n: 1e-9,
  u: 1e-6,
  m: 1e-3,
  '': 1,
  k: 1e3,
  M: 1e6,
  G: 1e9,
  T: 1e12,
  P: 1e15,
  E: 1e18,
};

// The exponent alternative is tried before the decimal suffixes so that "1E3"
// is an exponent while "1E" is the exa suffix, as in Kubernetes.
const QUANTITY_RE = /^([+-]?(?:\d+(?:\.\d*)?|\.\d+))(Ki|Mi|Gi|Ti|Pi|Ei|[eE][+-]?\d+|[numkMGTPE])?$/;

/**
 * Parses a Kubernetes resource quantity (e.g. "512Mi", "1e9", "500M", "250m",
 * "375809638") into its value in base units: bytes for memory, cores for CPU.
 * Returns undefined for empty, placeholder ("-") or malformed values.
 */
export function parseQuantity(value?: string | null): number | undefined {
  if (value == null) return undefined;
  const match = QUANTITY_RE.exec(value.trim());
  if (!match) return undefined;
  const number = Number(match[1]);
  const suffix = match[2] ?? '';
  let multiplier: number;
  if (suffix in BINARY_SUFFIXES) {
    multiplier = BINARY_SUFFIXES[suffix];
  } else if (suffix in DECIMAL_SUFFIXES) {
    multiplier = DECIMAL_SUFFIXES[suffix];
  } else {
    multiplier = 10 ** Number(suffix.slice(1));
  }
  const result = number * multiplier;
  return Number.isFinite(result) ? result : undefined;
}

/** Converts a Kubernetes memory quantity to MiB, or 0 when it cannot be parsed. */
export function parseMemory(value?: string | null): number {
  const bytes = parseQuantity(value);
  return bytes === undefined ? 0 : bytes / BINARY_SUFFIXES.Mi;
}

/** Converts a Kubernetes CPU quantity to cores, or 0 when it cannot be parsed. */
export function parseCPU(value?: string): number {
  if (!value) return 0;
  if (value.includes('m')) return parseFloat(value.replace('m', '')) / 1000;
  if (value.includes('n')) return parseFloat(value.replace('n', '')) / 1000000;
  return parseFloat(value) || 0;
}

const BINARY_UNITS = ['', 'Ki', 'Mi', 'Gi', 'Ti', 'Pi', 'Ei'];

/**
 * Formats a Kubernetes memory quantity in the largest binary unit that keeps the
 * value at or above 1 (e.g. "375809638" -> "358Mi"). Empty values become "-" and
 * values that are not quantities are returned unchanged.
 */
export function formatMemory(value?: string | null): string {
  if (value == null || value.trim() === '' || value.trim() === '-') return '-';
  const bytes = parseQuantity(value);
  if (bytes === undefined) return value;
  if (bytes === 0) return '0';

  let unit = 0;
  let scaled = Math.abs(bytes);
  while (scaled >= 1024 && unit < BINARY_UNITS.length - 1) {
    scaled /= 1024;
    unit++;
  }
  const digits = scaled < 10 ? 2 : scaled < 100 ? 1 : 0;
  const rounded = Number(scaled.toFixed(digits));
  return `${bytes < 0 ? '-' : ''}${rounded}${BINARY_UNITS[unit]}`;
}
