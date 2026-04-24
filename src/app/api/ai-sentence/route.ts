import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getWordRangeForLevel } from '@/lib/game'
import { callGroq, checkEnglishGrammar, pickRandomStructure } from '@/lib/groq'
import { generateUniqueTopic } from '@/lib/topics'

export async function POST(req: NextRequest) {
  try {
    const { level, nativeLang = 'ko', studyLang = 'en' } = await req.json() as { level?: number; nativeLang?: string; studyLang?: string }
    if (!level || level < 1) {
      return NextResponse.json({ error: 'level required' }, { status: 400 })
    }
    // Map lang codes to English names for the prompt
    const LANG_NAMES: Record<string, string> = {
      en: 'English', ko: 'Korean', ja: 'Japanese', zh: 'Chinese', es: 'Spanish',
      fr: 'French', de: 'German', pt: 'Portuguese', it: 'Italian', ru: 'Russian',
      ar: 'Arabic', hi: 'Hindi', nl: 'Dutch', pl: 'Polish', tr: 'Turkish',
      vi: 'Vietnamese', th: 'Thai', id: 'Indonesian', ms: 'Malay', sv: 'Swedish',
      no: 'Norwegian', da: 'Danish', fi: 'Finnish', hu: 'Hungarian', cs: 'Czech',
      ro: 'Romanian', uk: 'Ukrainian', el: 'Greek', he: 'Hebrew', fa: 'Persian',
      sw: 'Swahili', ta: 'Tamil', bn: 'Bengali',
    }
    const studyLangName  = LANG_NAMES[studyLang]  ?? studyLang
    const nativeLangName = LANG_NAMES[nativeLang] ?? nativeLang

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
    const structure   = pickRandomStructure()

    // 1. Generate unique topic (fast model)
    const topic = await generateUniqueTopic(apiKey, supabase)

    // 2. Generate sentence
    let content: string
    try {
      content = await callGroq(apiKey, [
        {
          role: 'system',
          content: `You are an expert bilingual language teacher. Create a flawless ${studyLangName} sentence and its natural ${nativeLangName} translation. The ${studyLangName} must be grammatically perfect and sound like a native speaker. Always return valid JSON.`,
        },
        {
          role: 'user',
          content: `Topic: "${topic}"
Sentence structure: ${structure}
Word count: the ${studyLangName} sentence must contain exactly ${targetWords} words.

Write the sentence strictly following the given structure about the given topic.
The "native" field must contain the ${nativeLangName} translation.
The "study" field must contain the ${studyLangName} sentence.
Return ONLY: {"study": "...", "native": "..."}`,
        },
      ], { temperature: 0.7, maxTokens: 200, jsonMode: true })
    } catch (e) {
      console.error('Groq generate error:', e)
      return NextResponse.json({ error: 'AI API error' }, { status: 502 })
    }

    const jsonMatch = content.match(/\{[\s\S]*\}/)
    if (!jsonMatch) return NextResponse.json({ error: 'Invalid AI response' }, { status: 502 })

    const parsed = JSON.parse(jsonMatch[0]) as Record<string, unknown>
    // Accept both old (english/korean) and new (study/native) key names
    const studyText  = (parsed.study  || parsed.english || parsed.English) as string | undefined
    const nativeText = (parsed.native || parsed.korean  || parsed.Korean)  as string | undefined

    if (!studyText || !nativeText) {
      console.error('Missing fields. Got:', JSON.stringify(parsed))
      return NextResponse.json({ error: '필드 누락', retryable: true }, { status: 422 })
    }

    // 3. Grammar check (only for Latin-script languages to avoid false positives)
    const grammarOk = await checkEnglishGrammar(apiKey, studyText)
    if (!grammarOk) {
      return NextResponse.json({ error: '문법 오류 감지됨', retryable: true }, { status: 422 })
    }

    // 4. Duplicate check
    const { data: dup } = await supabase
      .from('sentences')
      .select('id')
      .eq('target_text', studyText.trim())
      .maybeSingle()
    if (dup) {
      return NextResponse.json({ error: '이미 존재하는 문장', retryable: true }, { status: 422 })
    }

    // 5. Insert
    const { data: sentence, error } = await supabase
      .from('sentences')
      .insert({
        source_language:  nativeLang,
        source_text:      nativeText.trim(),
        target_language:  studyLang,
        target_text:      studyText.trim(),
        word_count:       studyText.trim().split(/\s+/).length,
        difficulty_level: level,
        language_pair:    `${nativeLang}-${studyLang}`,
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
