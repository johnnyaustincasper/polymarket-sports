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
      maxTokens: 3000,
    })

    expect(result).toMatchObject({ available: true, provider: 'anthropic', text: 'fallback summary' })
    expect(xaiComplete).toHaveBeenCalledWith([{ role: 'user', content: 'summarize' }], 'grok-3-mini', { maxTokens: 3000, temperature: 0.2 })
    expect(anthropicComplete).toHaveBeenCalledWith([{ role: 'user', content: 'summarize' }], 'claude-haiku-4-5', { maxTokens: 3000, temperature: 0.2 })
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
    expect(unavailable.reason).toBe('missing_config')
    expect(unavailable.attemptedProviders).toEqual([])
    expect(xaiComplete).not.toHaveBeenCalled()
    expect(anthropicComplete).not.toHaveBeenCalled()
  })

  it('distinguishes provider runtime failures from missing configuration', async () => {
    const xaiComplete = vi.fn().mockRejectedValue(new Error('quota exceeded'))

    const result = await completeWithAi({
      messages: [{ role: 'user', content: 'summarize' }],
      env: { XAI_API_KEY: 'xai-secret' },
      clients: { xaiComplete },
    })

    expect(result.available).toBe(false)
    const unavailable = result as Extract<Awaited<ReturnType<typeof completeWithAi>>, { available: false }>
    expect(unavailable.reason).toBe('provider_error')
    expect(unavailable.requires).toEqual([])
    expect(unavailable.attemptedProviders).toEqual(['xai'])
    expect(unavailable.error).toContain('quota exceeded')
  })

  it('allows route-level model overrides for heavier prompts', async () => {
    const anthropicComplete = vi.fn().mockResolvedValue('deep scan')

    const result = await completeWithAi({
      messages: [{ role: 'user', content: 'scan slate' }],
      env: { ANTHROPIC_API_KEY: 'anthropic-secret' },
      clients: { anthropicComplete },
      anthropicModel: 'claude-sonnet-4-5',
    })

    expect(result).toMatchObject({ available: true, provider: 'anthropic', model: 'claude-sonnet-4-5', text: 'deep scan' })
  })
})
