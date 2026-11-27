import { formatDistance } from 'date-fns'
import type { AnalysisStatus, TopGain } from './api'

const MISSING = '-'

function digitsFor(abs: number): number {
  if (abs < 0.01) return 3
  if (abs < 10) return 2
  if (abs < 100) return 1
  return 0
}

function formatScaled(value: number, digits: number): string {
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: digits }).format(value)
}

function sign(value: number, signed: boolean): string {
  if (value < 0) return '-'
  return signed && value > 0 ? '+' : ''
}

export interface QuantityFormatOptions {
  /** Prefix positive values with "+". */
  signed?: boolean
}

/** Formats CPU cores, e.g. 0.05 -> "0.05 cores", 1 -> "1 core", 1234.5 -> "1,235 cores". */
export function formatCores(value: number | null | undefined, { signed = false }: QuantityFormatOptions = {}): string {
  if (typeof value !== 'number' || !Number.isFinite(value)) return MISSING
  if (value === 0) return '0 cores'
  const abs = Math.abs(value)
  if (abs < 0.001) return `${value < 0 ? '>-' : '<'}0.001 cores`
  const text = formatScaled(abs, digitsFor(abs))
  return `${sign(value, signed)}${text} ${text === '1' ? 'core' : 'cores'}`
}

const MEMORY_UNITS = [
  { unit: 'KiB', perGiB: 1024 * 1024 },
  { unit: 'MiB', perGiB: 1024 },
  { unit: 'GiB', perGiB: 1 },
  { unit: 'TiB', perGiB: 1 / 1024 },
  { unit: 'PiB', perGiB: 1 / (1024 * 1024) },
]

/** Formats memory given in GiB in the largest binary unit that keeps it at or above 1, e.g. 0.1171875 -> "120 MiB". */
export function formatGiB(value: number | null | undefined, { signed = false }: QuantityFormatOptions = {}): string {
  if (typeof value !== 'number' || !Number.isFinite(value)) return MISSING
  if (value === 0) return '0 GiB'
  const abs = Math.abs(value)
  if (abs * MEMORY_UNITS[0].perGiB < 1) return `${value < 0 ? '>-' : '<'}1 KiB`
  let index = 0
  while (index < MEMORY_UNITS.length - 1 && abs * MEMORY_UNITS[index + 1].perGiB >= 1) index++
  const { unit, perGiB } = MEMORY_UNITS[index]
  const scaled = abs * perGiB
  return `${sign(value, signed)}${formatScaled(scaled, scaled < 10 ? 2 : scaled < 100 ? 1 : 0)} ${unit}`
}

/** Formats a cost; with a currency code it uses that currency, otherwise a plain number. */
export function formatCost(value: number | null | undefined, currency?: string): string {
  if (typeof value !== 'number' || !Number.isFinite(value)) return MISSING
  const digits = Math.abs(value) > 0 && Math.abs(value) < 1 ? 4 : 2
  if (currency) {
    try {
      return new Intl.NumberFormat('en-US', { style: 'currency', currency, maximumFractionDigits: digits }).format(value)
    } catch {
      // Not an ISO 4217 code: fall through and append it.
    }
  }
  const number = formatScaled(value, digits)
  return currency ? `${number} ${currency}` : number
}

export function formatCount(value: number | null | undefined): string {
  if (typeof value !== 'number' || !Number.isFinite(value)) return MISSING
  return formatScaled(value, 0)
}

export const UNNAMED_CLUSTER = '(unnamed cluster)'
export const UNNAMED_NAMESPACE = '(no namespace)'
export const UNKNOWN_REASON = 'Unknown reason'

export interface AnalysisHealth {
  analyzed: number
  failing: number
  pending: number
  /** Failing Tailorings per reason, most frequent first. */
  failingByReason: Array<{ reason: string; count: number }>
}

export function analysisHealth(statuses: AnalysisStatus[]): AnalysisHealth {
  const health: AnalysisHealth = { analyzed: 0, failing: 0, pending: 0, failingByReason: [] }
  const reasons = new Map<string, number>()
  for (const status of statuses) {
    health[status.state]++
    if (status.state === 'failing') {
      const reason = status.reason || UNKNOWN_REASON
      reasons.set(reason, (reasons.get(reason) ?? 0) + 1)
    }
  }
  health.failingByReason = Array.from(reasons, ([reason, count]) => ({ reason, count })).sort(
    (a, b) => b.count - a.count || a.reason.localeCompare(b.reason),
  )
  return health
}

/** Describes when the next analysis runs, e.g. "Retry in 5 minutes", or "Retry overdue by 2 minutes" for a time in the past. */
export function describeNextAnalysis(next: Date | undefined, now: Date, retry: boolean): string | undefined {
  if (!next) return undefined
  const label = retry ? 'Retry' : 'Next analysis'
  const distance = formatDistance(next, now)
  return next.getTime() >= now.getTime() ? `${label} in ${distance}` : `${label} overdue by ${distance}`
}

/** Path of a Tailoring's detail page, or undefined when the namespace or name is unknown. */
export function tailoringPath(gain: Pick<TopGain, 'namespace' | 'tailoring'>): string | undefined {
  if (!gain.namespace || !gain.tailoring) return undefined
  return `/tailorings/${encodeURIComponent(gain.namespace)}/${encodeURIComponent(gain.tailoring)}`
}
