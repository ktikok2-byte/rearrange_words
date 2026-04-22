import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getWordRangeForLevel } from '@/lib/game'

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

    const [minWords, maxWords] = getWordRangeForLevel(level)
    const targetWords = Math.floor(Math.random() * (maxWords - minWords + 1)) + minWords

    // Call Groq API (OpenAI-compatible, free tier)
    const groqRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile', // Upgraded to a smarter model
        response_format: { type: 'json_object' }, // Forces strictly valid JSON
        messages: [{
          role: 'system',
          content: 'You are an expert bilingual language teacher. Your goal is to create flawless Korean-English sentence pairs. The Korean must sound natural and conversational to a native speaker. The English must be grammatically perfect. Always return valid JSON.',
        }, {
          role: 'user',
          content: `Generate a natural Korean sentence and its grammatically perfect English translation. The English sentence must contain exactly ${targetWords} words. Return ONLY a JSON object with exactly these keys: {"korean": "...", "english": "..."}`,
        }],
        temperature: 0.5, // Lowered temperature to prevent grammar hallucinations
        max_tokens: 200,
      }),
    })

    if (!groqRes.ok) {
      const err = await groqRes.text()
      console.error('Groq error:', err)
      return NextResponse.json({ error: 'AI API error' }, { status: 502 })
    }

    const groqData = await groqRes.json()
    const content = groqData.choices?.[0]?.message?.content ?? ''

    // Extract JSON from response (LLM may include extra text)
    const jsonMatch = content.match(/\{[\s\S]*\}/)
    if (!jsonMatch) {
      return NextResponse.json({ error: 'Invalid AI response' }, { status: 502 })
    }
    const parsed = JSON.parse(jsonMatch[0]) as { korean?: string; english?: string }

    if (!parsed.korean || !parsed.english) {
      return NextResponse.json({ error: 'Missing fields in AI response' }, { status: 502 })
    }

    const actualWordCount = parsed.english.trim().split(/\s+/).length

    // Save to DB using service role (bypasses RLS for sentence insertion)
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    )

    const { data: sentence, error } = await supabase
      .from('sentences')
      .insert({
        source_language:  'ko',
        source_text:      parsed.korean.trim(),
        target_language:  'en',
        target_text:      parsed.english.trim(),
        word_count:       actualWordCount,
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
