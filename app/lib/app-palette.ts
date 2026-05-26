export const appPalette = {
  primary: '#7df6ff',
  primaryBright: '#b8fbff',
  primarySoft: 'rgba(125,246,255,0.16)',
  primaryBorder: 'rgba(125,246,255,0.42)',
  primaryBorderStrong: 'rgba(125,246,255,0.56)',
  primaryGlow: 'rgba(125,246,255,0.20)',
  power: '#7df6ff',
  powerSoft: 'rgba(125,246,255,0.14)',
  powerBorder: 'rgba(125,246,255,0.40)',
  warning: '#f8d94a',
  danger: '#ff3f5f',
  background: '#03070a',
  card: 'rgba(4,10,12,0.88)',
  textPrimary: '#effcff',
  textSecondary: 'rgba(199,241,246,0.62)',
} as const

export const appColorContract = {
  defaultAccent: 'light-cyan',
  primaryHex: appPalette.primary,
  wholeAppCyan: true,
  softOnDarkBackground: true,
} as const
