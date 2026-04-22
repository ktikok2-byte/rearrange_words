import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic' // Next.js 캐싱 방지

export async function POST(_req: NextRequest) {
  try {
    const apiKey = process.env.GROQ_API_KEY
    if (!apiKey) {
      return NextResponse.json({ error: 'GROQ_API_KEY not set' }, { status: 503 })
    }

    // 랜덤 주제 배열 추가
    const topics = [
      "Astronomy and Space Exploration", "Marine Biology", "Ancient History",
      "Geology and Earth Science", "Human Psychology", "Economics and Trade",
      "Environmental Science", "Art History", "Chemistry", "Botany"
    ]
    const randomTopic = topics[Math.floor(Math.random() * topics.length)]

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
          content: `Create two contextually connected English sentences about this specific academic topic: "${randomTopic}". 

Rules:
1. Both sentences must be exactly 7 to 10 words long.
2. The English MUST be perfectly natural, idiomatic, and grammatically flawless. Do NOT use awkward phrasing just to meet the word count.
3. Provide perfect Korean translations for BOTH sentence 1 and sentence 2, combined together into a single string.
4. Provide ONE dummy English word that acts as a plausible distractor. It must be semantically related to the topic, but strictly grammatically incorrect to use anywhere in sentence 2.

Examples to follow strictly:
{"sentence1": "Photosynthesis requires sunlight to convert water into energy.", "sentence2": "This complex process sustains almost all earthly lifeforms.", "korean": "광합성은 물을 에너지로 변환하기 위해 햇빛을 필요로 합니다. 이 복잡한 과정은 거의 모든 지구 생명체를 유지합니다.", "dummy": "sustaining"}
{"sentence1": "Many ancient civilizations built massive stone pyramids.", "sentence2": "These incredible structures served as tombs for rulers.", "korean": "많은 고대 문명들은 거대한 돌 피라미드를 건설했습니다. 이 놀라운 구조물들은 통치자들을 위한 무덤 역할을 했습니다.", "dummy": "serving"}
{"sentence1": "Economic inflation decreases the purchasing power of currency.", "sentence2": "Consequently, everyday goods become much more expensive.", "korean": "경제적 인플레이션은 통화의 구매력을 감소시킵니다. 결과적으로 일상적인 상품들은 훨씬 더 비싸집니다.", "dummy": "becoming"}`,
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

    let parsed;
    try {
      parsed = JSON.parse(content) as {
        sentence1?: string
        sentence2?: string
        korean?: string
        dummy?: string
      }
    } catch (err) {
      console.error('JSON parse error:', err)
      return NextResponse.json({ error: 'Invalid AI response format' }, { status: 502 })
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
