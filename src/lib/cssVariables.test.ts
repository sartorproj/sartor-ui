import { describe, expect, test } from 'bun:test';
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';

const SRC = join(import.meta.dir, '..');
// Set at runtime by Radix components rather than by the theme.
const RUNTIME_PREFIXES = ['--radix-'];

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return /\.(ts|tsx)$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name) ? [path] : [];
  });
}

const defined = new Set([...readFileSync(join(SRC, 'index.css'), 'utf8').matchAll(/(--[\w-]+)\s*:/g)].map((m) => m[1]));

describe('CSS variables used in components', () => {
  const files = sourceFiles(SRC);

  test('every literal var(--name) is defined by the theme', () => {
    const missing: string[] = [];
    for (const file of files) {
      for (const [, name] of readFileSync(file, 'utf8').matchAll(/var\((--[\w-]+)\)/g)) {
        if (!defined.has(name) && !RUNTIME_PREFIXES.some((p) => name.startsWith(p))) {
          missing.push(`${relative(SRC, file)}: ${name}`);
        }
      }
    }
    expect(missing).toEqual([]);
  });

  test('theme colours are not wrapped in hsl(), which would make them invalid', () => {
    const wrapped = files.filter((file) => /hsl\(\s*var\(/.test(readFileSync(file, 'utf8'))).map((file) => relative(SRC, file));
    expect(wrapped).toEqual([]);
  });
});
