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
          content: 'You are an expert bilingual TOEFL writing teacher. Generate grammatically flawless English sentences and highly natural, accurate Korean translations. Return ONLY valid JSON.',
        }, {
          role: 'user',
          content: `Create two contextually connected English sentences about a specific academic topic. 

Rules:
1. Both sentences must be 7-10 words long.
2. The English MUST be perfectly natural, idiomatic, and grammatically flawless. Do NOT use awkward, robotic, or forced phrasing just to meet the word count or sound "advanced".
3. Provide perfect Korean translations for BOTH sentence 1 and sentence 2, combined together into a single string.
4. Provide ONE dummy English word that acts as a plausible distractor. It must be semantically related to the topic to confuse a human, but strictly grammatically incorrect or structurally impossible to use anywhere in sentence 2.

Example format to follow strictly:
{"sentence1": "Photosynthesis requires sunlight to convert water into energy.", "sentence2": "This complex process sustains almost all earthly lifeforms.", "korean": "광합성은 물을 에너지로 변환하기 위해 햇빛을 필요로 합니다. 이 복잡한 과정은 거의 모든 지구 생명체를 유지합니다.", "dummy": "sustaining"}`,
        }],
        temperature: 0.3, // Lowered significantly for strict grammatical accuracy and predictable output
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
