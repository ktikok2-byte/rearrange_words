export const GROQ_MODEL      = 'llama-3.3-70b-versatile' // sentence generation + grammar check
export const GROQ_MODEL_FAST = 'llama-3.1-8b-instant'   // topic generation (fast, light)
export const GROQ_API_URL    = 'https://api.groq.com/openai/v1/chat/completions'

const STRUCTURES = [
  'a direct wh-question (wh-word + auxiliary + subject + verb, e.g. "Where did she go?")',
  'a yes/no question (auxiliary + subject + verb, e.g. "Has he finished the report?")',
  'a sentence containing an indirect question (e.g. "Do you know where he went?" or "I wonder if she arrived.")',
  'a sentence with a noun that-clause or wh-clause (e.g. "She believes that climate change is urgent." or "What he said surprised everyone.")',
  'an opinion or evaluation sentence using "I think", "I found", or "In my opinion"',
  'a reported speech sentence (subject + said/asked/explained + that + subject + verb)',
  'a sentence with a subject relative clause (e.g. "The scientist who discovered penicillin changed medicine.")',
  'a sentence with an object relative clause (e.g. "The book that she recommended was fascinating.")',
  'a sentence using present perfect or past perfect tense to show time contrast',
  'a sentence in passive voice (e.g. "The report was submitted by the committee.")',
  'a comparison sentence using comparative + than, or too/enough/much more (e.g. "This method is far more efficient than the old one.")',
  'a sentence with a frequency, degree, manner, or time adverb in a notable position (e.g. "Rarely do scientists agree on everything.")',
]

export function pickRandomStructure(): string {
  return STRUCTURES[Math.floor(Math.random() * STRUCTURES.length)]
}

export type GroqMessage = { role: 'system' | 'user' | 'assistant'; content: string }

export async function callGroq(
  apiKey: string,
  messages: GroqMessage[],
  opts: { temperature?: number; maxTokens?: number; jsonMode?: boolean; model?: string } = {},
): Promise<string> {
  const res = await fetch(GROQ_API_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model:       opts.model ?? GROQ_MODEL,
      messages,
      temperature: opts.temperature ?? 0.5,
      max_tokens:  opts.maxTokens  ?? 300,
      ...(opts.jsonMode ? { response_format: { type: 'json_object' } } : {}),
    }),
  })
  if (!res.ok) throw new Error(`Groq ${res.status}: ${await res.text()}`)
  const data = await res.json()
  return data.choices?.[0]?.message?.content ?? ''
}

// Returns true if all sentences pass grammar check. Fails open (returns true) on API error.
export async function checkEnglishGrammar(apiKey: string, ...sentences: string[]): Promise<boolean> {
  const list = sentences.map((s, i) => `${i + 1}. "${s}"`).join('\n')
  try {
    const content = await callGroq(apiKey, [{
      role: 'user',
      content: `Are all of the following English sentences grammatically correct and natural-sounding? Reply ONLY with JSON {"valid": true} or {"valid": false}.\n${list}`,
    }], { temperature: 0.1, maxTokens: 20, jsonMode: true })
    return (JSON.parse(content) as { valid?: boolean }).valid !== false
  } catch {
    return true // fail open — don't block generation on validation errors
  }
}
