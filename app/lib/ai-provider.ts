import Anthropic from '@anthropic-ai/sdk'
import OpenAI from 'openai'

type Env = Record<string, string | undefined>

export type AiProviderName = 'xai' | 'anthropic'
export type AiMessage = { role: 'system' | 'user' | 'assistant'; content: string }

type AiSelection =
  | { available: true; provider: AiProviderName; model: string; baseURL?: string }
  | { available: false; provider: null; model: null; requires: string[] }

type AiCompletionOptions = { maxTokens: number; temperature: number }
type XaiSearchParameters = {
  mode?: 'auto' | 'on' | 'off'
  from_date?: string
  to_date?: string
  sources?: Array<{ type: 'x' | 'web' | 'news'; [key: string]: unknown }>
}

type AiClients = {
  xaiComplete?: (messages: AiMessage[], model: string, options: AiCompletionOptions) => Promise<string>
  anthropicComplete?: (messages: AiMessage[], model: string, options: AiCompletionOptions) => Promise<string>
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

async function defaultXaiComplete(env: Env, messages: AiMessage[], model: string, options: AiCompletionOptions, searchParameters?: XaiSearchParameters): Promise<string> {
  if (!env.XAI_API_KEY) throw new Error('Missing XAI_API_KEY')
  const client = new OpenAI({ apiKey: env.XAI_API_KEY, baseURL: env.XAI_BASE_URL || 'https://api.x.ai/v1' })
  const body: any = {
    model,
    messages,
    temperature: options.temperature,
    max_tokens: options.maxTokens,
  }
  if (searchParameters && env.XAI_LIVE_SEARCH !== '0') body.search_parameters = searchParameters
  let response
  try {
    response = await client.chat.completions.create(body)
  } catch (error) {
    if (!searchParameters) throw error
    const fallbackBody = { ...body }
    delete fallbackBody.search_parameters
    response = await client.chat.completions.create(fallbackBody)
  }
  return response.choices[0]?.message?.content?.trim() || ''
}

async function defaultAnthropicComplete(env: Env, messages: AiMessage[], model: string, options: AiCompletionOptions): Promise<string> {
  if (!env.ANTHROPIC_API_KEY) throw new Error('Missing ANTHROPIC_API_KEY')
  const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY })
  const { system, nonSystem } = splitSystem(messages)
  const response = await client.messages.create({
    model,
    max_tokens: options.maxTokens,
    temperature: options.temperature,
    system,
    messages: nonSystem,
  })
  return response.content
    .map(part => part.type === 'text' ? part.text : '')
    .join('\n')
    .trim()
}

export type AiUnavailableReason = 'missing_config' | 'provider_error'

type AiUnavailableResult = {
  available: false
  provider: null
  model: null
  text: string
  error: string
  reason: AiUnavailableReason
  requires: string[]
  attemptedProviders: AiProviderName[]
}

export async function completeWithAi(options: {
  messages: AiMessage[]
  env?: Env
  clients?: AiClients
  maxTokens?: number
  temperature?: number
  xaiModel?: string
  anthropicModel?: string
  xaiSearchParameters?: XaiSearchParameters
}): Promise<{ available: true; provider: AiProviderName; model: string; text: string } | AiUnavailableResult> {
  const env = options.env || process.env
  const completionOptions = {
    maxTokens: options.maxTokens ?? 1200,
    temperature: options.temperature ?? 0.2,
  }
  const selected = selectAiProvider(env)
  if (!selected.available) {
    const unavailable = selected as Extract<AiSelection, { available: false }>
    return {
      available: false,
      provider: null,
      model: null,
      text: '',
      error: `No AI provider is configured. Add ${unavailable.requires.join(' or ')}.`,
      reason: 'missing_config',
      requires: unavailable.requires,
      attemptedProviders: [],
    }
  }

  const providers: Array<{ provider: AiProviderName; model: string; complete: () => Promise<string> }> = []
  if (configured(env.XAI_API_KEY)) {
    const model = options.xaiModel || env.XAI_MODEL || 'grok-3-mini'
    providers.push({
      provider: 'xai',
      model,
      complete: () => options.clients?.xaiComplete
        ? options.clients.xaiComplete(options.messages, model, completionOptions)
        : defaultXaiComplete(env, options.messages, model, completionOptions, options.xaiSearchParameters),
    })
  }
  if (configured(env.ANTHROPIC_API_KEY)) {
    const model = options.anthropicModel || env.ANTHROPIC_MODEL || 'claude-haiku-4-5'
    providers.push({
      provider: 'anthropic',
      model,
      complete: () => options.clients?.anthropicComplete
        ? options.clients.anthropicComplete(options.messages, model, completionOptions)
        : defaultAnthropicComplete(env, options.messages, model, completionOptions),
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
    reason: 'provider_error',
    requires: [],
    attemptedProviders: providers.map(candidate => candidate.provider),
  }
}
