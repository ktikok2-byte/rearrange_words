import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export async function POST(_req: NextRequest) {
  try {
    const apiKey = process.env.GROQ_API_KEY
    if (!apiKey) {
      return NextResponse.json({ error: 'GROQ_API_KEY not set' }, { status: 503 })
    }

    const groqRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'llama-3.1-8b-instant',
        messages: [{
          role: 'system',
          content: 'You are a TOEFL writing teacher. Create contextually connected English sentence pairs on the same specific topic. Always respond with valid JSON only, no markdown or extra text.',
        }, {
          role: 'user',
          content: `Create two English sentences about the SAME specific topic (they must be contextually connected, like consecutive sentences in a paragraph). Both sentences must be 7-10 words each. Also provide a Korean translation of sentence 2 only, and ONE dummy English word that does not fit in sentence 2.

Rules:
- sentence1 and sentence2 must share the same topic/subject
- sentence2 must be 7-10 words (count carefully)
- dummy must be a real English word that clearly does NOT belong in sentence2

Return ONLY this JSON: {"sentence1": "...", "sentence2": "...", "korean": "...", "dummy": "..."}`,
        }],
        temperature: 0.85,
        max_tokens: 300,
      }),
    })

    if (!groqRes.ok) {
      const err = await groqRes.text()
      console.error('Groq error:', err)
      return NextResponse.json({ error: 'AI API error' }, { status: 502 })
    }

    const groqData = await groqRes.json()
    const content = groqData.choices?.[0]?.message?.content ?? ''

    const jsonMatch = content.match(/\{[\s\S]*\}/)
    if (!jsonMatch) {
      return NextResponse.json({ error: 'Invalid AI response' }, { status: 502 })
    }
    const parsed = JSON.parse(jsonMatch[0]) as {
      sentence1?: string
      sentence2?: string
      korean?: string
      dummy?: string
    }

    if (!parsed.sentence1 || !parsed.sentence2 || !parsed.korean || !parsed.dummy) {
      return NextResponse.json({ error: 'Missing fields in AI response' }, { status: 502 })
    }

    const wordCount2 = parsed.sentence2.trim().split(/\s+/).length

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    )

    const { data: exercise, error } = await supabase
      .from('toefl_exercises')
      .insert({
        sentence1_en: parsed.sentence1.trim(),
        sentence2_en: parsed.sentence2.trim(),
        korean:       parsed.korean.trim(),
        dummy_word:   parsed.dummy.trim(),
        word_count2:  wordCount2,
      })
      .select()
      .single()

    if (error) {
      console.error('Supabase insert error:', error)
      return NextResponse.json({ error: 'DB insert failed' }, { status: 500 })
    }

    return NextResponse.json({ exercise })
  } catch (e) {
    console.error('ai-toefl error:', e)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
