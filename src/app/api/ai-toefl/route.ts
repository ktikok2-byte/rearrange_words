import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { callGroq, checkEnglishGrammar, pickRandomStructure } from '@/lib/groq'
import { generateUniqueTopic } from '@/lib/topics'

export const dynamic = 'force-dynamic'

export async function POST(_req: NextRequest) {
  try {
    const apiKey = process.env.GROQ_API_KEY
    if (!apiKey) {
      return NextResponse.json({ error: 'GROQ_API_KEY not set' }, { status: 503 })
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    )

    // 1. Generate unique topic (fast model)
    const topic     = await generateUniqueTopic(apiKey, supabase)
    const structure = pickRandomStructure()

    // 2. Generate exercise
    let content: string
    try {
      content = await callGroq(apiKey, [
        {
          role: 'system',
          content: 'You are an expert bilingual TOEFL writing teacher. Generate grammatically flawless, highly natural and accurate English sentences and its Korean translations. Return ONLY valid JSON.',
        },
        {
          role: 'user',
          content: `Create two contextually connected English sentences about this specific topic: "${topic}".

Rules:
1. Both sentences must be exactly 7 to 10 words long.
2. Sentence 2 MUST use this grammatical structure: ${structure}
3. The English MUST be perfectly natural, idiomatic, and grammatically flawless. Do NOT use awkward phrasing just to meet the word count.
4. Provide natural and accurate Korean translations for BOTH sentence 1 and sentence 2, combined together into a single string.
5. Provide ONE dummy English word that acts as a plausible distractor. It must be semantically related to the topic, but strictly grammatically incorrect to use anywhere in sentence 2.

Examples to follow strictly:
{"sentence1": "Photosynthesis requires sunlight to convert water into energy.", "sentence2": "This complex process sustains almost all earthly lifeforms.", "korean": "광합성은 물을 에너지로 변환하기 위해 햇빛을 필요로 합니다. 이 복잡한 과정은 거의 모든 지구 생명체를 유지합니다.", "dummy": "sustaining"}
{"sentence1": "Many ancient civilizations built massive stone pyramids.", "sentence2": "These incredible structures served as tombs for rulers.", "korean": "많은 고대 문명들은 거대한 돌 피라미드를 건설했습니다. 이 놀라운 구조물들은 통치자들을 위한 무덤 역할을 했습니다.", "dummy": "serving"}
{"sentence1": "Economic inflation decreases the purchasing power of currency.", "sentence2": "Consequently, everyday goods become much more expensive.", "korean": "경제적 인플레이션은 통화의 구매력을 감소시킵니다. 결과적으로 일상적인 상품들은 훨씬 더 비싸집니다.", "dummy": "becoming"}`,
        },
      ], { temperature: 0.9, maxTokens: 300, jsonMode: true })
    } catch (e) {
      console.error('Groq TOEFL generate error:', e)
      return NextResponse.json({ error: 'AI API error' }, { status: 502 })
    }

    let parsed: { sentence1?: string; sentence2?: string; korean?: string; dummy?: string }
    try {
      parsed = JSON.parse(content)
    } catch {
      return NextResponse.json({ error: 'Invalid AI response format' }, { status: 502 })
    }

    if (!parsed.sentence1 || !parsed.sentence2 || !parsed.korean || !parsed.dummy) {
      return NextResponse.json({ error: 'Missing fields in AI response' }, { status: 502 })
    }

    // 3. Grammar check
    const grammarOk = await checkEnglishGrammar(apiKey, parsed.sentence1, parsed.sentence2)
    if (!grammarOk) {
      return NextResponse.json({ error: '문법 오류 감지됨', retryable: true }, { status: 422 })
    }

    // 4. Duplicate check
    const { data: dup } = await supabase
      .from('toefl_exercises')
      .select('id')
      .eq('sentence2_en', parsed.sentence2.trim())
      .maybeSingle()
    if (dup) {
      return NextResponse.json({ error: '이미 존재하는 문제', retryable: true }, { status: 422 })
    }

    // 5. Insert
    const { data: exercise, error } = await supabase
      .from('toefl_exercises')
      .insert({
        sentence1_en: parsed.sentence1.trim(),
        sentence2_en: parsed.sentence2.trim(),
        korean:       parsed.korean.trim(),
        dummy_word:   parsed.dummy.trim(),
        word_count2:  parsed.sentence2.trim().split(/\s+/).length,
      })
      .select()
      .single()

    if (error) {
      console.error('Supabase TOEFL insert error:', error)
      return NextResponse.json({ error: 'DB insert failed' }, { status: 500 })
    }

    return NextResponse.json({ exercise })
  } catch (e) {
    console.error('ai-toefl error:', e)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
