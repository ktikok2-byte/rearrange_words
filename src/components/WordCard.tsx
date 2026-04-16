'use client'

interface Props {
  word: string
  onClick: () => void
  variant: 'source' | 'answer'
  index: number
}

export default function WordCard({ word, onClick, variant, index }: Props) {
  const base = 'word-card inline-flex items-center px-3 py-2 rounded-lg font-medium text-sm border-2 shadow-sm select-none'
  const styles = {
    source: `${base} bg-white border-slate-200 text-slate-800 hover:border-blue-400 hover:bg-blue-50`,
    answer: `${base} bg-blue-600 border-blue-700 text-white hover:bg-blue-500`,
  }

  return (
    <button
      onClick={onClick}
      className={styles[variant]}
      aria-label={`${variant === 'answer' ? '제거' : '선택'}: ${word}`}
    >
      {word}
    </button>
  )
}
