export type GameCardAnimationSport = 'nba' | 'mlb' | 'nfl' | 'ufc'

export const animatedGameCardFrame = {
  className: 'animated-game-card-frame',
  compactLoadClassName: 'load-board-card animated-game-card-frame',
  sports: ['nba', 'mlb', 'nfl', 'ufc'] as const satisfies readonly GameCardAnimationSport[],
  appliesTo: ['collapsed-slate-card', 'expanded-slate-board', 'legacy-market-card'] as const,
  ringAnimationName: 'gameCardFrameOrbit',
  glowAnimationName: 'gameCardFrameGlow',
  shimmerAnimationName: 'gameCardFrameShimmer',
  preservesContentLayout: true,
  respectsReducedMotion: true,
} as const

export function hasAnimatedGameCardFrame(sport: string): sport is GameCardAnimationSport {
  return (animatedGameCardFrame.sports as readonly string[]).includes(sport)
}
