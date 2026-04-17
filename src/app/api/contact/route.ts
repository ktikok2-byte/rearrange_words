import { NextRequest, NextResponse } from 'next/server'
import { Resend } from 'resend'

export async function POST(req: NextRequest) {
  try {
    const { message, email } = await req.json() as { message?: string; email?: string }

    if (!message?.trim()) {
      return NextResponse.json({ error: '내용을 입력해주세요.' }, { status: 400 })
    }

    const apiKey = process.env.RESEND_API_KEY
    if (!apiKey) {
      console.error('RESEND_API_KEY not set')
      return NextResponse.json({ error: '이메일 서비스가 설정되지 않았습니다.' }, { status: 503 })
    }

    const resend = new Resend(apiKey)
    await resend.emails.send({
      from: 'WordOrder 문의 <onboarding@resend.dev>',
      to:   'ktikok2@gmail.com',
      subject: '[WordOrder] 문의가 도착했습니다',
      text: [
        email ? `보낸 사람: ${email}` : '보낸 사람: (미입력)',
        '',
        message.trim(),
      ].join('\n'),
    })

    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error('contact email error:', e)
    return NextResponse.json({ error: '전송 실패. 잠시 후 다시 시도해주세요.' }, { status: 500 })
  }
}
