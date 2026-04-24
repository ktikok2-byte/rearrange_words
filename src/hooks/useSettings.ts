'use client'

import { useEffect, useState } from 'react'
import type { Language } from '@/types'

export interface Settings {
  showTranslation:  boolean
  useStartButton:   boolean
  secondsPerWord:   number
  sentenceMode:     'server' | 'ai'
  gameMode:         'normal' | 'toefl'
  nativeLanguage:   Language
  studyLanguage:    Language
}

const DEFAULTS: Settings = {
  showTranslation: true,
  useStartButton:  true,
  secondsPerWord:  2.0,
  sentenceMode:    'server',
  gameMode:        'normal',
  nativeLanguage:  'ko',
  studyLanguage:   'en',
}

const KEY   = 'wordorder_settings'
const EVENT = 'wordorder_settings_changed'

export function useSettings() {
  const [settings, setSettings] = useState<Settings>(DEFAULTS)

  useEffect(() => {
    try {
      const stored = localStorage.getItem(KEY)
      if (stored) setSettings({ ...DEFAULTS, ...JSON.parse(stored) })
    } catch { /* ignore */ }

    // Sync changes across all hook instances (BottomNav ↔ GameClient etc.)
    const handler = (e: Event) => setSettings((e as CustomEvent<Settings>).detail)
    window.addEventListener(EVENT, handler)
    return () => window.removeEventListener(EVENT, handler)
  }, [])

  function updateSetting<K extends keyof Settings>(key: K, value: Settings[K]) {
    setSettings(prev => {
      const next = { ...prev, [key]: value }
      try {
        localStorage.setItem(KEY, JSON.stringify(next))
        window.dispatchEvent(new CustomEvent<Settings>(EVENT, { detail: next }))
      } catch { /* ignore */ }
      return next
    })
  }

  return { settings, updateSetting }
}
