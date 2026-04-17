'use client'

import { useEffect, useRef, useState } from 'react'

interface Props {
  seconds: number
  onExpire: () => void
  paused?: boolean
}

export default function GameTimer({ seconds, onExpire, paused = false }: Props) {
  const [remaining, setRemaining] = useState(seconds)
  const startRef    = useRef<number | null>(null)  // Date.now() when timer began
  const expiredRef  = useRef(false)
  const onExpireRef = useRef(onExpire)
  useEffect(() => { onExpireRef.current = onExpire })

  // New sentence → reset everything
  useEffect(() => {
    setRemaining(seconds)
    expiredRef.current = false
    startRef.current   = null
  }, [seconds])

  // Single interval that reads wall-clock time, like time.time()
  useEffect(() => {
    if (paused || expiredRef.current) {
      startRef.current = null
      return
    }

    if (startRef.current === null) startRef.current = Date.now()

    const id = setInterval(() => {
      const elapsed = (Date.now() - startRef.current!) / 1000
      const rem     = Math.max(0, seconds - elapsed)
      setRemaining(Math.ceil(rem))
      if (rem <= 0 && !expiredRef.current) {
        expiredRef.current = true
        onExpireRef.current()
        clearInterval(id)
      }
    }, 200)

    return () => clearInterval(id)
  }, [paused, seconds])  // single interval, never recreated mid-countdown

  const ratio = remaining / seconds
  const color = ratio > 0.5 ? 'bg-green-500' : ratio > 0.25 ? 'bg-yellow-500' : 'bg-red-500'

  return (
    <div className="w-full">
      <div className="flex justify-between text-xs text-slate-500 mb-1">
        <span>남은 시간</span>
        <span className="font-bold text-slate-700">{remaining}초</span>
      </div>
      <div className="w-full h-3 bg-slate-200 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-200 ${color}`}
          style={{ width: `${(remaining / seconds) * 100}%` }}
        />
      </div>
    </div>
  )
}
