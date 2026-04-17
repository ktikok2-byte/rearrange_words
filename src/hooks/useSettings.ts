'use client'

import { useEffect, useState } from 'react'

export interface Settings {
  showTranslation: boolean
  useStartButton:  boolean
}

const DEFAULTS: Settings = {
  showTranslation: true,
  useStartButton:  true,
}

const KEY = 'wordorder_settings'

export function useSettings() {
  const [settings, setSettings] = useState<Settings>(DEFAULTS)

  useEffect(() => {
    try {
      const stored = localStorage.getItem(KEY)
      if (stored) setSettings({ ...DEFAULTS, ...JSON.parse(stored) })
    } catch { /* ignore */ }
  }, [])

  function updateSetting<K extends keyof Settings>(key: K, value: Settings[K]) {
    setSettings(prev => {
      const next = { ...prev, [key]: value }
      try { localStorage.setItem(KEY, JSON.stringify(next)) } catch { /* ignore */ }
      return next
    })
  }

  return { settings, updateSetting }
}
