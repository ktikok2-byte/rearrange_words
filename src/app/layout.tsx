import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'WordOrder - 단어 순서 맞추기',
  description: '단어 순서를 맞춰 외국어 문장을 완성하는 언어 학습 게임',
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="ko" className="h-full">
      <body className="min-h-full flex flex-col bg-slate-50 text-slate-900">
        {children}
      </body>
    </html>
  )
}
