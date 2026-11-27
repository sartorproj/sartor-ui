import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const src = join(import.meta.dir, '..');
const read = (path: string) => readFileSync(join(src, path), 'utf8');

const definedVariables = new Set(
  Array.from(read('index.css').matchAll(/(--[\w-]+)\s*:/g), (match) => match[1]),
);

const usedVariables = (code: string) => Array.from(code.matchAll(/var\((--[\w-]+)\)/g), (match) => match[1]);

describe('chart colours', () => {
  test.each(['lib/chartTheme.ts', 'pages/Analytics.tsx', 'pages/Costs.tsx'])(
    '%s only uses CSS variables that index.css defines',
    (path) => {
      const code = read(path);
      expect(code).not.toContain('hsl(var(');
      for (const name of usedVariables(code)) {
        expect(definedVariables).toContain(name);
      }
    },
  );

  test('the theme defines the variables the charts rely on', () => {
    for (const name of ['--color-popover', '--color-popover-foreground', '--color-border', '--color-muted', '--color-muted-foreground']) {
      expect(definedVariables).toContain(name);
    }
  });
});
