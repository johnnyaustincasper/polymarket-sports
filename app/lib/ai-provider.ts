import Anthropic from '@anthropic-ai/sdk'
import OpenAI from 'openai'

type Env = Record<string, string | undefined>

export type AiProviderName = 'xai' | 'anthropic'
export type AiMessage = { role: 'system' | 'user' | 'assistant'; content: string }

type AiSelection =
  | { available: true; provider: AiProviderName; model: string; baseURL?: string }
  | { available: false; provider: null; model: null; requires: string[] }

type AiClients = {
  xaiComplete?: (messages: AiMessage[], model: string) => Promise<string>
  anthropicComplete?: (messages: AiMessage[], model: string) => Promise<string>
}

function configured(value: string | undefined): boolean {
  return Boolean(value && value.trim())
}

export function getAiProviderStatus(env: Env = process.env) {
  const xaiConfigured = configured(env.XAI_API_KEY)
  const anthropicConfigured = configured(env.ANTHROPIC_API_KEY)
  const primary = xaiConfigured ? 'xai' : anthropicConfigured ? 'anthropic' : null

  return {
    primary,
    xai: {
      configured: xaiConfigured,
      role: 'primary' as const,
      model: env.XAI_MODEL || 'grok-3-mini',
      baseURL: env.XAI_BASE_URL || 'https://api.x.ai/v1',
    },
    anthropic: {
      configured: anthropicConfigured,
      role: xaiConfigured ? 'fallback' as const : anthropicConfigured ? 'legacy-primary' as const : 'legacy' as const,
      model: env.ANTHROPIC_MODEL || 'claude-haiku-4-5',
    },
    unavailable: !xaiConfigured && !anthropicConfigured,
    requires: xaiConfigured || anthropicConfigured ? [] : ['XAI_API_KEY', 'ANTHROPIC_API_KEY'],
  }
}

export function selectAiProvider(env: Env = process.env): AiSelection {
  const status = getAiProviderStatus(env)
  if (status.xai.configured) {
    return { available: true, provider: 'xai', model: status.xai.model, baseURL: status.xai.baseURL }
  }
  if (status.anthropic.configured) {
    return { available: true, provider: 'anthropic', model: status.anthropic.model }
  }
  return { available: false, provider: null, model: null, requires: status.requires }
}

function splitSystem(messages: AiMessage[]) {
  const system = messages.find(message => message.role === 'system')?.content
  const nonSystem = messages.filter(message => message.role !== 'system') as Array<{ role: 'user' | 'assistant'; content: string }>
  return { system, nonSystem }
}

async function defaultXaiComplete(env: Env, messages: AiMessage[], model: string): Promise<string> {
  if (!env.XAI_API_KEY) throw new Error('Missing XAI_API_KEY')
  const client = new OpenAI({ apiKey: env.XAI_API_KEY, baseURL: env.XAI_BASE_URL || 'https://api.x.ai/v1' })
  const response = await client.chat.completions.create({
    model,
    messages,
    temperature: 0.2,
  })
  return response.choices[0]?.message?.content?.trim() || ''
}

async function defaultAnthropicComplete(env: Env, messages: AiMessage[], model: string): Promise<string> {
  if (!env.ANTHROPIC_API_KEY) throw new Error('Missing ANTHROPIC_API_KEY')
  const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY })
  const { system, nonSystem } = splitSystem(messages)
  const response = await client.messages.create({
    model,
    max_tokens: 1200,
    temperature: 0.2,
    system,
    messages: nonSystem,
  })
  return response.content
    .map(part => part.type === 'text' ? part.text : '')
    .join('\n')
    .trim()
}

export async function completeWithAi(options: {
  messages: AiMessage[]
  env?: Env
  clients?: AiClients
}): Promise<{ available: true; provider: AiProviderName; model: string; text: string } | { available: false; provider: null; model: null; text: string; error: string; requires: string[] }> {
  const env = options.env || process.env
  const selected = selectAiProvider(env)
  if (!selected.available) {
    const unavailable = selected as Extract<AiSelection, { available: false }>
    return {
      available: false,
      provider: null,
      model: null,
      text: '',
      error: `No AI provider is configured. Add ${unavailable.requires.join(' or ')}.`,
      requires: unavailable.requires,
    }
  }

  const providers: Array<{ provider: AiProviderName; model: string; complete: () => Promise<string> }> = []
  if (env.XAI_API_KEY) {
    const model = env.XAI_MODEL || 'grok-3-mini'
    providers.push({
      provider: 'xai',
      model,
      complete: () => options.clients?.xaiComplete
        ? options.clients.xaiComplete(options.messages, model)
        : defaultXaiComplete(env, options.messages, model),
    })
  }
  if (env.ANTHROPIC_API_KEY) {
    const model = env.ANTHROPIC_MODEL || 'claude-haiku-4-5'
    providers.push({
      provider: 'anthropic',
      model,
      complete: () => options.clients?.anthropicComplete
        ? options.clients.anthropicComplete(options.messages, model)
        : defaultAnthropicComplete(env, options.messages, model),
    })
  }

  const errors: string[] = []
  for (const candidate of providers) {
    try {
      const text = await candidate.complete()
      return { available: true, provider: candidate.provider, model: candidate.model, text }
    } catch (error) {
      errors.push(`${candidate.provider}: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  return {
    available: false,
    provider: null,
    model: null,
    text: '',
    error: errors.length ? errors.join('; ') : 'No AI provider completed successfully.',
    requires: ['XAI_API_KEY', 'ANTHROPIC_API_KEY'],
  }
}
