import { completeWithAi, type AiMessage } from '../ai-provider'
import type { UFCEvent, UFCFight } from './events'
import type { UFCFightDeepAnalysis } from './deep-analysis'

export type UFCResearchParseResult =
  | { available: true; data: Partial<UFCFightDeepAnalysis> }
  | { available: false; data: null; error: string }

export function buildUFCFightResearchPrompt(fight: UFCFight, event?: UFCEvent, marketContext?: unknown): string {
  const fighterA = fight.fighterA.name
  const fighterB = fight.fighterB.name
  return `Return strict JSON only for a UFC fight deep analysis.

Event: ${event?.name || 'unknown'}
Date: ${event?.date || 'unknown'}
Fight: ${fighterA} vs ${fighterB}
Weight class: ${fight.weightClass}
Market context: ${JSON.stringify(marketContext || {}, null, 2)}

Requirements:
- Include both fighters by name: ${fighterA} and ${fighterB}.
- Find each fighter's last fight summary and last 5 fight results with method, round, time, opponent, date, and notes.
- Include hype, narrative, beef, camp news, injury/layoff notes, and possible market distortion.
- Include expected winner from market/public consensus and expected method.
- Include your model pick, method, timing, confidence, why bullets, risks, watchouts, and bet/pass recommendation.
- Include source URLs or source names where possible.
- If a fact is not found, return "unknown" instead of guessing. Do not fabricate last 5 results.

Return JSON matching this shape (omit nothing; use "unknown"/[] when needed):
{
  "fighterA": { "name": "${fighterA}", "record": "", "age": null, "height": "", "reach": "", "country": "", "ranking": null, "lastFightSummary": "", "lastFive": [], "strengths": [], "concerns": [], "hype": { "level": "low", "why": [], "possibleMarketDistortion": "unknown" }, "narrative": { "beefOrStory": "unknown", "campNews": "unknown", "injuryOrLayoffNotes": "unknown" } },
  "fighterB": { "name": "${fighterB}", "record": "", "age": null, "height": "", "reach": "", "country": "", "ranking": null, "lastFightSummary": "", "lastFive": [], "strengths": [], "concerns": [], "hype": { "level": "low", "why": [], "possibleMarketDistortion": "unknown" }, "narrative": { "beefOrStory": "unknown", "campNews": "unknown", "injuryOrLayoffNotes": "unknown" } },
  "market": { "expectedWinner": "unknown", "expectedMethod": "unknown", "priceNotes": [] },
  "ai": { "pick": "pass", "method": "unknown", "roundOrTiming": "unknown", "confidence": "pass", "thesis": "", "why": [], "risks": [], "watchouts": [] },
  "bettingAngles": [],
  "sources": []
}`
}

function stripJsonFence(text: string): string {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/i)
  return (fenced?.[1] || text).trim()
}

export function parseUFCResearchJson(text: string): UFCResearchParseResult {
  const cleaned = stripJsonFence(text)
  try {
    const parsed = JSON.parse(cleaned)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return { available: false, data: null, error: 'AI output was not a JSON object.' }
    }
    return { available: true, data: parsed as Partial<UFCFightDeepAnalysis> }
  } catch (error) {
    return { available: false, data: null, error: error instanceof Error ? error.message : 'Malformed AI JSON.' }
  }
}

export async function researchUFCFightWithAi(fight: UFCFight, event?: UFCEvent, marketContext?: unknown, options?: {
  env?: Record<string, string | undefined>
  clients?: Parameters<typeof completeWithAi>[0]['clients']
}): Promise<UFCResearchParseResult & { provider?: string; model?: string }> {
  const prompt = buildUFCFightResearchPrompt(fight, event, marketContext)
  const messages: AiMessage[] = [
    { role: 'system', content: 'You are an MMA research analyst. Return strict JSON only. Use unknown when facts are not found.' },
    { role: 'user', content: prompt },
  ]
  const completion = await completeWithAi({
    messages,
    env: options?.env,
    clients: options?.clients,
    maxTokens: 3500,
    temperature: 0.1,
    xaiSearchParameters: {
      mode: 'on',
      sources: [{ type: 'web' }, { type: 'news' }, { type: 'x' }],
    },
  })
  if (!completion.available) return { available: false, data: null, error: completion.error }
  const parsed = parseUFCResearchJson(completion.text)
  return parsed.available
    ? { ...parsed, provider: completion.provider, model: completion.model }
    : parsed
}
