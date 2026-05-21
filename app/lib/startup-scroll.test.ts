import { describe, expect, it, vi } from 'vitest'
import { resetInitialSlateScroll } from './startup-scroll'

describe('resetInitialSlateScroll', () => {
  it('takes over browser reload restoration and forces the initial slate to the top', () => {
    const scrollTo = vi.fn()
    const requestAnimationFrame = vi.fn((callback: FrameRequestCallback) => {
      callback(0)
      return 1
    })
    let timerId = 0
    const setTimeoutSpy = vi.fn((callback: () => void) => {
      callback()
      timerId += 1
      return timerId as unknown as ReturnType<typeof setTimeout>
    })
    const clearTimeoutSpy = vi.fn()
    const fakeWindow = {
      scrollTo,
      requestAnimationFrame,
      setTimeout: setTimeoutSpy,
      clearTimeout: clearTimeoutSpy,
      history: { scrollRestoration: 'auto' as ScrollRestoration },
    } as unknown as Window

    const cleanup = resetInitialSlateScroll(fakeWindow)

    expect(fakeWindow.history.scrollRestoration).toBe('manual')
    expect(scrollTo).toHaveBeenCalledWith({ top: 0, left: 0, behavior: 'auto' })
    expect(scrollTo).toHaveBeenCalledTimes(5)
    expect(setTimeoutSpy).toHaveBeenCalledTimes(3)

    cleanup()

    expect(fakeWindow.history.scrollRestoration).toBe('auto')
    expect(clearTimeoutSpy).toHaveBeenCalledTimes(3)
  })

  it('is safe during server rendering', () => {
    expect(() => resetInitialSlateScroll(undefined)).not.toThrow()
  })
})
