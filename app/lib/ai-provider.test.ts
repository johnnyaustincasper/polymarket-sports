import { describe, expect, it, vi } from 'vitest'
import { completeWithAi, getAiProviderStatus, selectAiProvider } from './ai-provider'

describe('AI provider selection', () => {
  it('selects xAI when both xAI and Anthropic are configured', () => {
    const selected = selectAiProvider({ XAI_API_KEY: 'xai-secret', ANTHROPIC_API_KEY: 'anthropic-secret', XAI_MODEL: 'grok-4.3' })

    expect(selected).toMatchObject({ available: true, provider: 'xai', model: 'grok-4.3' })
  })

  it('falls back to Anthropic when xAI is absent', () => {
    const selected = selectAiProvider({ ANTHROPIC_API_KEY: 'anthropic-secret' })

    expect(selected).toMatchObject({ available: true, provider: 'anthropic', model: 'claude-haiku-4-5' })
  })

  it('returns unavailable status when no AI keys exist', () => {
    const selected = selectAiProvider({})

    expect(selected.available).toBe(false)
    expect(selected.provider).toBeNull()
    const unavailable = selected as Extract<ReturnType<typeof selectAiProvider>, { available: false }>
    expect(unavailable.requires).toEqual(['XAI_API_KEY', 'ANTHROPIC_API_KEY'])
  })

  it('reports xAI as primary and Anthropic as fallback in status', () => {
    const status = getAiProviderStatus({ XAI_API_KEY: 'xai-secret', ANTHROPIC_API_KEY: 'anthropic-secret' })

    expect(status.primary).toBe('xai')
    expect(status.xai.configured).toBe(true)
    expect(status.anthropic).toMatchObject({ configured: true, role: 'fallback' })
  })

  it('falls back from xAI to Anthropic when the primary call throws', async () => {
    const xaiComplete = vi.fn().mockRejectedValue(new Error('xAI down'))
    const anthropicComplete = vi.fn().mockResolvedValue('fallback summary')

    const result = await completeWithAi({
      messages: [{ role: 'user', content: 'summarize' }],
      env: { XAI_API_KEY: 'xai-secret', ANTHROPIC_API_KEY: 'anthropic-secret' },
      clients: { xaiComplete, anthropicComplete },
    })

    expect(result).toMatchObject({ available: true, provider: 'anthropic', text: 'fallback summary' })
    expect(xaiComplete).toHaveBeenCalledOnce()
    expect(anthropicComplete).toHaveBeenCalledOnce()
  })

  it('returns clear unavailable result without network calls when no providers are configured', async () => {
    const xaiComplete = vi.fn()
    const anthropicComplete = vi.fn()

    const result = await completeWithAi({
      messages: [{ role: 'user', content: 'summarize' }],
      env: {},
      clients: { xaiComplete, anthropicComplete },
    })

    expect(result.available).toBe(false)
    expect(result.provider).toBeNull()
    const unavailable = result as Extract<Awaited<ReturnType<typeof completeWithAi>>, { available: false }>
    expect(unavailable.error).toContain('No AI provider')
    expect(xaiComplete).not.toHaveBeenCalled()
    expect(anthropicComplete).not.toHaveBeenCalled()
  })
})
