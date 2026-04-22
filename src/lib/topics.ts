import { SupabaseClient } from '@supabase/supabase-js'
import { callGroq, GROQ_MODEL_FAST } from './groq'

// Generates a unique topic using the fast model, stores it in ai_topics, and returns it.
// Retries until a non-duplicate topic is produced.
export async function generateUniqueTopic(apiKey: string, supabase: SupabaseClient): Promise<string> {
  while (true) {
    const raw = await callGroq(apiKey, [{
      role: 'user',
      content: 'Generate ONE specific and interesting topic for an English sentence exercise. Choose from diverse domains: science, technology, history, culture, economics, psychology, arts, philosophy, sports, environment, medicine, law, linguistics, food, architecture, etc. Be specific and concrete (e.g. "the role of mitochondria in energy production", "the economic impact of the Silk Road", "how jazz music influenced modern pop"). Reply with ONLY the topic phrase, nothing else.',
    }], { temperature: 0.9, maxTokens: 60, model: GROQ_MODEL_FAST })

    const topic = raw.trim().replace(/^["'`]|["'`]$/g, '').trim()
    if (!topic || topic.length < 5) continue

    const { data: existing } = await supabase
      .from('ai_topics')
      .select('id')
      .eq('topic', topic)
      .maybeSingle()

    if (existing) continue // duplicate — retry

    await supabase.from('ai_topics').insert({ topic })
    return topic
  }
}
