'use client'

let _ctx: AudioContext | null = null

function ctx(): AudioContext {
  if (!_ctx) _ctx = new AudioContext()
  if (_ctx.state === 'suspended') _ctx.resume()
  return _ctx
}

function beep(freq: number, dur: number, vol = 0.12, type: OscillatorType = 'sine') {
  try {
    const ac = ctx()
    const osc = ac.createOscillator()
    const gain = ac.createGain()
    osc.type = type
    osc.frequency.value = freq
    gain.gain.setValueAtTime(vol, ac.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + dur)
    osc.connect(gain)
    gain.connect(ac.destination)
    osc.start()
    osc.stop(ac.currentTime + dur)
  } catch { /* ignore — audio may be blocked */ }
}

export const sounds = {
  // Short click for UI interactions
  click: () => beep(700, 0.05, 0.08, 'square'),

  // Word placed in answer area
  wordPlace: () => beep(900, 0.04, 0.06),

  // Word removed from answer area
  wordRemove: () => beep(500, 0.04, 0.06),

  // Correct answer — ascending chord
  correct: () => {
    beep(523, 0.12, 0.15)          // C5
    setTimeout(() => beep(659, 0.12, 0.15), 90)  // E5
    setTimeout(() => beep(784, 0.18, 0.15), 180) // G5
  },

  // Wrong answer — low descending tones
  wrong: () => {
    beep(320, 0.1, 0.15, 'sawtooth')
    setTimeout(() => beep(260, 0.14, 0.12, 'sawtooth'), 90)
  },

  // Timer running low (< 5 s)
  timerWarning: () => beep(880, 0.08, 0.1),

  // Mode / screen change
  modeChange: () => {
    beep(440, 0.07, 0.08)
    setTimeout(() => beep(550, 0.07, 0.07), 70)
  },
}
