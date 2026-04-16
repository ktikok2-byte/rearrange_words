'use client'

import { useEffect, useRef, useState } from 'react'

interface Props {
  seconds: number
  onExpire: () => void
  paused?: boolean
}

export default function GameTimer({ seconds, onExpire, paused = false }: Props) {
  const [remaining, setRemaining] = useState(seconds)
  const expiredRef = useRef(false)

  useEffect(() => {
    setRemaining(seconds)
    expiredRef.current = false
  }, [seconds])

  useEffect(() => {
    if (paused || expiredRef.current) return
    if (remaining <= 0) {
      if (!expiredRef.current) {
        expiredRef.current = true
        onExpire()
      }
      return
    }

    const id = setInterval(() => {
      setRemaining(r => {
        if (r <= 1) {
          clearInterval(id)
          if (!expiredRef.current) {
            expiredRef.current = true
            onExpire()
          }
          return 0
        }
        return r - 1
      })
    }, 1000)

    return () => clearInterval(id)
  }, [remaining, paused, onExpire])

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
          className={`h-full rounded-full transition-all duration-1000 ${color}`}
          style={{ width: `${(remaining / seconds) * 100}%` }}
        />
      </div>
    </div>
  )
}
