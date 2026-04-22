import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getWordRangeForLevel } from '@/lib/game'
import { callGroq, checkEnglishGrammar } from '@/lib/groq'
import { generateUniqueTopic } from '@/lib/topics'

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

export async function POST(req: NextRequest) {
  try {
    const { level } = await req.json() as { level?: number }
    if (!level || level < 1) {
      return NextResponse.json({ error: 'level required' }, { status: 400 })
    }

    const apiKey = process.env.GROQ_API_KEY
    if (!apiKey) {
      return NextResponse.json({ error: 'GROQ_API_KEY not set' }, { status: 503 })
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    )

    const [minWords, maxWords] = getWordRangeForLevel(level)
    const targetWords = Math.floor(Math.random() * (maxWords - minWords + 1)) + minWords
    const structure   = STRUCTURES[Math.floor(Math.random() * STRUCTURES.length)]

    // 1. Generate unique topic (fast model)
    const topic = await generateUniqueTopic(apiKey, supabase)

    // 2. Generate sentence
    let content: string
    try {
      content = await callGroq(apiKey, [
        {
          role: 'system',
          content: 'You are an expert bilingual language teacher. Create a flawless English sentence and its natural Korean translation. The English must be grammatically perfect and sound like a native speaker. Always return valid JSON.',
        },
        {
          role: 'user',
          content: `Topic: "${topic}"
Sentence structure: ${structure}
Word count: the English sentence must contain exactly ${targetWords} words.

Write the sentence strictly following the given structure about the given topic.
The "korean" field MUST contain actual Korean characters (한글).
Return ONLY: {"english": "...", "korean": "..."}`,
        },
      ], { temperature: 0.7, maxTokens: 200, jsonMode: true })
    } catch (e) {
      console.error('Groq generate error:', e)
      return NextResponse.json({ error: 'AI API error' }, { status: 502 })
    }

    const jsonMatch = content.match(/\{[\s\S]*\}/)
    if (!jsonMatch) return NextResponse.json({ error: 'Invalid AI response' }, { status: 502 })

    const parsed = JSON.parse(jsonMatch[0]) as Record<string, unknown>
    const korean  = (parsed.korean  || parsed.Korean  || parsed.korean_sentence  || parsed.korean_text)  as string | undefined
    const english = (parsed.english || parsed.English || parsed.english_sentence || parsed.english_text) as string | undefined

    if (!korean || !english) {
      console.error('Missing fields. Got:', JSON.stringify(parsed))
      return NextResponse.json({ error: '필드 누락', retryable: true }, { status: 422 })
    }

    // 3. Grammar check
    const grammarOk = await checkEnglishGrammar(apiKey, english)
    if (!grammarOk) {
      return NextResponse.json({ error: '문법 오류 감지됨', retryable: true }, { status: 422 })
    }

    // 4. Duplicate check
    const { data: dup } = await supabase
      .from('sentences')
      .select('id')
      .eq('target_text', english.trim())
      .maybeSingle()
    if (dup) {
      return NextResponse.json({ error: '이미 존재하는 문장', retryable: true }, { status: 422 })
    }

    // 5. Insert
    const { data: sentence, error } = await supabase
      .from('sentences')
      .insert({
        source_language:  'ko',
        source_text:      korean.trim(),
        target_language:  'en',
        target_text:      english.trim(),
        word_count:       english.trim().split(/\s+/).length,
        difficulty_level: level,
        language_pair:    'ko-en',
        source:           'ai',
      })
      .select()
      .single()

    if (error) {
      console.error('Supabase insert error:', error)
      return NextResponse.json({ error: 'DB insert failed' }, { status: 500 })
    }

    return NextResponse.json({ sentence })
  } catch (e) {
    console.error('ai-sentence error:', e)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
