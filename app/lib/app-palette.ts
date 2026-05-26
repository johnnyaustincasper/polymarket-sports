export const appPalette = {
  primary: '#00d4ff',
  primaryBright: '#00e8f8',
  primarySoft: 'rgba(0,212,255,0.16)',
  primaryBorder: 'rgba(0,212,255,0.42)',
  primaryBorderStrong: 'rgba(0,212,255,0.56)',
  primaryGlow: 'rgba(0,212,255,0.20)',
  power: '#a6ff3f',
  powerSoft: 'rgba(166,255,63,0.14)',
  powerBorder: 'rgba(166,255,63,0.40)',
  warning: '#f8d94a',
  danger: '#ff3f5f',
  background: '#03070a',
  card: 'rgba(4,10,12,0.88)',
  textPrimary: '#effcff',
  textSecondary: 'rgba(199,241,246,0.62)',
} as const

export const appColorContract = {
  defaultAccent: 'cyan-teal',
  primaryHex: appPalette.primary,
  keepsLimeAsPowerAccent: true,
  softOnDarkBackground: true,
} as const
