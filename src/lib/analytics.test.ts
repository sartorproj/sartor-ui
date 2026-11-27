import { describe, expect, test } from 'bun:test'
import {
  analysisHealth,
  describeNextAnalysis,
  formatCores,
  formatCost,
  formatCount,
  formatGiB,
  UNKNOWN_REASON,
} from './analytics'
import type { AnalysisStatus } from './api'

describe('formatCores', () => {
  test.each([
    [0, '0 cores'],
    [0.05, '0.05 cores'],
    [0.004, '0.004 cores'],
    [0.0004, '<0.001 cores'],
    [-0.0004, '>-0.001 cores'],
    [0.125, '0.13 cores'],
    [1, '1 core'],
    [1.5, '1.5 cores'],
    [12.34, '12.3 cores'],
    [1234.5, '1,235 cores'],
    [-0.5, '-0.5 cores'],
    [-2, '-2 cores'],
  ])('%p -> %p', (value, expected) => {
    expect(formatCores(value)).toBe(expected)
  })

  test('adds a plus sign when signed', () => {
    expect(formatCores(0.5, { signed: true })).toBe('+0.5 cores')
    expect(formatCores(-0.5, { signed: true })).toBe('-0.5 cores')
    expect(formatCores(0, { signed: true })).toBe('0 cores')
  })

  test.each([NaN, Infinity, -Infinity, null, undefined])('shows %p as missing', (value) => {
    expect(formatCores(value)).toBe('-')
  })
})

describe('formatGiB', () => {
  test.each([
    [0, '0 GiB'],
    [120 / 1024, '120 MiB'],
    [0.5, '512 MiB'],
    [1, '1 GiB'],
    [1.25, '1.25 GiB'],
    [42.42, '42.4 GiB'],
    [512, '512 GiB'],
    [2048, '2 TiB'],
    [1 / (1024 * 1024), '1 KiB'],
    [1e-9, '<1 KiB'],
    [-1e-9, '>-1 KiB'],
    [-0.25, '-256 MiB'],
    [3 * 1024 ** 3, '3,072 PiB'],
  ])('%p -> %p', (value, expected) => {
    expect(formatGiB(value)).toBe(expected)
  })

  test('adds a plus sign when signed', () => {
    expect(formatGiB(2, { signed: true })).toBe('+2 GiB')
  })

  test.each([NaN, Infinity, null, undefined])('shows %p as missing', (value) => {
    expect(formatGiB(value)).toBe('-')
  })
})

describe('formatCost', () => {
  test('uses the currency when it is a currency code', () => {
    expect(formatCost(1234.5, 'USD')).toBe('$1,234.50')
    expect(formatCost(0.0123, 'EUR')).toBe('€0.0123')
  })

  test('appends a currency that is not a code and formats plain numbers without one', () => {
    expect(formatCost(12, 'credits')).toBe('12 credits')
    expect(formatCost(-3.456)).toBe('-3.46')
  })

  test('shows missing values', () => {
    expect(formatCost(NaN, 'USD')).toBe('-')
    expect(formatCost(undefined)).toBe('-')
  })
})

describe('formatCount', () => {
  test('formats counts', () => {
    expect(formatCount(1234)).toBe('1,234')
    expect(formatCount(undefined)).toBe('-')
  })
})

const status = (state: AnalysisStatus['state'], reason?: string): AnalysisStatus => ({ state, reason, consecutiveFailures: 0 })

describe('analysisHealth', () => {
  test('counts states and groups failures by reason', () => {
    const health = analysisHealth([
      status('analyzed'),
      status('analyzed'),
      status('failing', 'TargetNotFound'),
      status('failing', 'NoMetrics'),
      status('failing', 'TargetNotFound'),
      status('failing'),
      status('pending'),
    ])
    expect(health).toEqual({
      analyzed: 2,
      failing: 4,
      pending: 1,
      failingByReason: [
        { reason: 'TargetNotFound', count: 2 },
        { reason: 'NoMetrics', count: 1 },
        { reason: UNKNOWN_REASON, count: 1 },
      ],
    })
  })

  test('is all zero for no Tailorings', () => {
    expect(analysisHealth([])).toEqual({ analyzed: 0, failing: 0, pending: 0, failingByReason: [] })
  })
})

describe('describeNextAnalysis', () => {
  const now = new Date('2026-01-01T12:00:00Z')

  test('describes a future time', () => {
    expect(describeNextAnalysis(new Date('2026-01-01T12:05:00Z'), now, true)).toBe('Retry in 5 minutes')
    expect(describeNextAnalysis(new Date('2026-01-01T13:00:00Z'), now, false)).toBe('Next analysis in about 1 hour')
  })

  test('describes a time in the past as overdue', () => {
    expect(describeNextAnalysis(new Date('2026-01-01T11:58:00Z'), now, true)).toBe('Retry overdue by 2 minutes')
  })

  test('returns nothing without a time', () => {
    expect(describeNextAnalysis(undefined, now, true)).toBeUndefined()
  })
})
