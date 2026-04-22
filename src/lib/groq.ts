export const GROQ_MODEL   = 'llama-3.3-70b-versatile'
export const GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions'

export type GroqMessage = { role: 'system' | 'user' | 'assistant'; content: string }

export async function callGroq(
  apiKey: string,
  messages: GroqMessage[],
  opts: { temperature?: number; maxTokens?: number; jsonMode?: boolean } = {},
): Promise<string> {
  const res = await fetch(GROQ_API_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model:      GROQ_MODEL,
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
