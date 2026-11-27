import { describe, expect, test } from 'bun:test';
import { formatMemory, parseCPU, parseMemory, parseQuantity } from './quantity';

const MI = 2 ** 20;

describe('parseQuantity', () => {
  test.each([
    ['375809638', 375809638],
    ['0', 0],
    ['1.5', 1.5],
    ['.5', 0.5],
    ['+2', 2],
    ['512Mi', 512 * MI],
    ['1Gi', 2 ** 30],
    ['1.5Gi', 1.5 * 2 ** 30],
    ['64Ki', 64 * 1024],
    ['2Ti', 2 * 2 ** 40],
    ['1Pi', 2 ** 50],
    ['1Ei', 2 ** 60],
    ['3k', 3e3],
    ['500M', 5e8],
    ['2G', 2e9],
    ['1T', 1e12],
    ['1P', 1e15],
    ['1E', 1e18],
    ['1e9', 1e9],
    ['1E3', 1e3],
    ['1.5e3', 1500],
    ['1e+3', 1e3],
    ['1e-3', 1e-3],
    ['250m', 0.25],
    ['1500m', 1.5],
    [' 512Mi ', 512 * MI],
  ])('%p -> %p', (input, expected) => {
    expect(parseQuantity(input)).toBeCloseTo(expected, 12);
  });

  test('handles n and u suffixes', () => {
    expect(parseQuantity('100n')).toBeCloseTo(1e-7, 15);
    expect(parseQuantity('5u')).toBeCloseTo(5e-6, 15);
  });

  test.each([undefined, null, '', ' ', '-', 'abc', 'Mi', '12Mib', '1K', '1KB', '1e', '1e1.5', '1.2.3', '--1', '1 Mi', '1e400'])(
    'returns undefined for %p',
    (input) => {
      expect(parseQuantity(input)).toBeUndefined();
    },
  );
});

describe('parseMemory', () => {
  test.each([
    ['512Mi', 512],
    ['1Gi', 1024],
    ['375809638', 375809638 / MI],
    ['1e9', 1e9 / MI],
    ['500M', 5e8 / MI],
    ['128Ki', 0.125],
    ['0', 0],
  ])('%p -> %p MiB', (input, expected) => {
    expect(parseMemory(input)).toBeCloseTo(expected, 9);
  });

  test('plain numbers are bytes, not MiB', () => {
    expect(parseMemory('1024')).toBeCloseTo(1 / 1024, 12);
  });

  test.each([undefined, null, '', '-', 'abc'])('returns 0 for %p', (input) => {
    const result = parseMemory(input);
    expect(result).toBe(0);
    expect(Number.isNaN(result)).toBe(false);
  });
});

describe('formatMemory', () => {
  test.each([
    ['512Mi', '512Mi'],
    ['1Gi', '1Gi'],
    ['375809638', '358Mi'],
    ['1e9', '954Mi'],
    ['500M', '477Mi'],
    ['1536Mi', '1.5Gi'],
    ['100Gi', '100Gi'],
    ['2Ti', '2Ti'],
    ['64Ki', '64Ki'],
    ['1024', '1Ki'],
    ['512', '512'],
    ['1500m', '1.5'],
    ['0', '0'],
    ['0Mi', '0'],
  ])('%p -> %p', (input, expected) => {
    expect(formatMemory(input)).toBe(expected);
  });

  test.each([undefined, null, '', '  ', '-'])('formats %p as "-"', (input) => {
    expect(formatMemory(input)).toBe('-');
  });

  test('returns values that are not quantities unchanged', () => {
    expect(formatMemory('unknown')).toBe('unknown');
  });
});

describe('parseCPU', () => {
  test.each([
    ['250m', 0.25],
    ['2000m', 2],
    ['1', 1],
    ['1.5', 1.5],
    ['0', 0],
  ])('%p -> %p cores', (input, expected) => {
    expect(parseCPU(input)).toBeCloseTo(expected, 12);
  });

  test.each([undefined, '', '-'])('returns 0 for %p', (input) => {
    expect(parseCPU(input)).toBe(0);
  });
});
