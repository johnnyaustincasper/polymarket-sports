export function resetInitialSlateScroll(win: Window | undefined = typeof window === 'undefined' ? undefined : window): () => void {
  if (!win) return () => {}

  const previousRestoration = win.history.scrollRestoration
  win.history.scrollRestoration = 'manual'

  const scrollTop = () => win.scrollTo({ top: 0, left: 0, behavior: 'auto' })
  scrollTop()

  if (typeof win.requestAnimationFrame === 'function') {
    win.requestAnimationFrame(scrollTop)
  }
  const timeoutIds = [250, 750, 1500].map(delay => win.setTimeout(scrollTop, delay))

  return () => {
    timeoutIds.forEach(timer => win.clearTimeout(timer))
    win.history.scrollRestoration = previousRestoration
  }
}
