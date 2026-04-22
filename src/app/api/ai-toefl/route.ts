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
        model: 'llama-3.3-70b-versatile', // Upgraded to a much smarter free model on Groq
        response_format: { type: 'json_object' }, // Enforce Groq's native JSON mode
        messages: [{
          role: 'system',
          content: 'You are a TOEFL writing teacher. Each time you are called, choose a DIFFERENT topic — vary broadly across science, history, economics, psychology, environment, technology, art, philosophy, etc. Return ONLY valid JSON, no markdown.',
        }, {
          role: 'user',
          content: `Pick a random academic topic and write two consecutive sentences about it (like two sentences from the same paragraph). The sentences must be contextually connected — sentence2 follows naturally from sentence1.

Rules:
- Each sentence must be 7-10 words long
- sentence2 must be grammatically complete and standalone-solvable
- korean: natural Korean translation of sentence2 only
- dummy: one English word that clearly does NOT belong in sentence2

Return this JSON: {"sentence1": "...", "sentence2": "...", "korean": "...", "dummy": "..."}`,
        }],
        temperature: 0.95,
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
