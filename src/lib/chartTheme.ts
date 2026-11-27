import type { CSSProperties } from 'react'

// index.css defines the theme as complete colours in --color-* variables, so they
// are used as is: wrapping them in hsl() or using --card style names is invalid CSS.

export const chartTooltipStyle: CSSProperties = {
  backgroundColor: 'var(--color-popover)',
  border: '1px solid var(--color-border)',
  borderRadius: '8px',
  color: 'var(--color-popover-foreground)',
}

export const chartTooltipLabelStyle: CSSProperties = {
  color: 'var(--color-popover-foreground)',
}

export const chartAxisTick = { fill: 'var(--color-muted-foreground)', fontSize: 11 }

export const chartAxisStroke = 'var(--color-border)'

export const chartGridStroke = 'var(--color-border)'

export const chartTrackFill = 'var(--color-muted)'

export const chartBarCursor = { fill: 'var(--color-muted)', fillOpacity: 0.6, stroke: 'none' }
