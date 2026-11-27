import type { CSSProperties } from 'react';

// index.css defines the theme as complete colours in --color-* variables, so
// they are used as-is (wrapping them in hsl() would make them invalid).

export const chartTooltipContentStyle: CSSProperties = {
  backgroundColor: 'var(--color-card)',
  border: '1px solid var(--color-border)',
  borderRadius: '8px',
  color: 'var(--color-card-foreground)',
};

export const chartTooltipLabelStyle: CSSProperties = {
  color: 'var(--color-card-foreground)',
};

export const chartAxisTick = { fill: 'var(--color-muted-foreground)', fontSize: 11 };

export const chartAxisStroke = 'var(--color-border)';

export const chartGridStroke = 'var(--color-border)';

export const chartMutedFill = 'var(--color-muted)';

export const chartCursorFill = 'var(--color-muted)';
