import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'
import { resolve } from 'path'

const REFILL_PER_LEVEL = 200   // 한 번에 추가할 문장 수
const NOTIFY_EMAIL = 'ktikok@gmail.com'

interface PoolSentence {
  ko: string
  en: string
  word_count: number
  difficulty_level: number
}

function loadPool(): PoolSentence[] {
  try {
    const poolPath = resolve(process.cwd(), 'src/data/sentences-pool.json')
    return JSON.parse(readFileSync(poolPath, 'utf-8'))
  } catch {
    return []
  }
}

async function sendEmailAlert(
  level: number,
  username: string,
  added: number
) {
  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) return   // 이메일 설정 안 된 경우 무시

  const body = {
    from: 'WordOrder <onboarding@resend.dev>',
    to: [NOTIFY_EMAIL],
    subject: `[WordOrder] Level ${level} 문장 소진 알림`,
    html: `
      <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto;">
        <h2 style="color: #2563eb;">WordOrder 알림</h2>
        <p><strong>${username}</strong>님이 <strong>Level ${level}</strong>의 모든 문장을 풀었습니다.</p>
        <p>자동으로 <strong>${added}개</strong>의 새 문장이 추가되었습니다.</p>
        <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 16px 0;" />
        <p style="color: #94a3b8; font-size: 12px;">WordOrder 자동 알림</p>
      </div>
    `,
  }

  try {
    await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    })
  } catch {
    // 이메일 실패는 게임에 영향 없음
  }
}

export async function POST(request: NextRequest) {
  try {
    const { level, userId, username } = await request.json() as {
      level: number
      userId: string
      username: string
    }

    if (!level || !userId) {
      return NextResponse.json({ error: 'level, userId 필수' }, { status: 400 })
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    // 현재 DB의 해당 레벨 영어 문장 목록 조회
    const { data: existing } = await supabase
      .from('sentences')
      .select('target_text')
      .eq('difficulty_level', level)

    const existingSet = new Set((existing || []).map((r: { target_text: string }) => r.target_text))

    // 풀에서 해당 레벨 새 문장 추출
    const pool = loadPool()
    const candidates = pool
      .filter(p => p.difficulty_level === level && !existingSet.has(p.en))

    if (candidates.length === 0) {
      // 해당 레벨 없으면 인접 레벨에서도 시도 (레벨+1, 레벨-1 순)
      const nearby = pool
        .filter(p =>
          (p.difficulty_level === level + 1 || p.difficulty_level === level - 1) &&
          !existingSet.has(p.en)
        )
        .slice(0, REFILL_PER_LEVEL)

      if (nearby.length === 0) {
        await sendEmailAlert(level, username, 0)
        return NextResponse.json({ added: 0, message: 'pool 소진' })
      }

      const rows = nearby.map(p => ({
        source_language: 'ko',
        source_text: p.ko,
        target_language: 'en',
        target_text: p.en,
        word_count: p.word_count,
        difficulty_level: p.difficulty_level,
        language_pair: 'ko-en',
        source: 'tatoeba',
      }))

      await supabase.from('sentences').insert(rows)
      await sendEmailAlert(level, username, rows.length)
      return NextResponse.json({ added: rows.length })
    }

    const toInsert = candidates.slice(0, REFILL_PER_LEVEL)
    const rows = toInsert.map(p => ({
      source_language: 'ko',
      source_text: p.ko,
      target_language: 'en',
      target_text: p.en,
      word_count: p.word_count,
      difficulty_level: p.difficulty_level,
      language_pair: 'ko-en',
      source: 'tatoeba',
    }))

    const { error } = await supabase.from('sentences').insert(rows)
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    // 이메일 알림 (백그라운드)
    sendEmailAlert(level, username, rows.length)

    return NextResponse.json({ added: rows.length })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
