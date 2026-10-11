/**
 * Non-visual alert channel (opt-in). Severity is encoded in the *pattern* as well as the pitch, so it
 * stays distinguishable without relying on hearing a specific frequency:
 * caution = two soft beeps, critical = four alternating high/low square-wave pulses.
 */
export type AlertLevel = 'caution' | 'critical'

let ctx: AudioContext | null = null

function context(): AudioContext | null {
  if (typeof window === 'undefined') return null
  const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
  if (!Ctor) return null
  ctx ??= new Ctor()
  if (ctx.state === 'suspended') void ctx.resume()
  return ctx
}

const PATTERNS: Record<AlertLevel, { freq: number; at: number; len: number }[]> = {
  caution: [
    { freq: 784, at: 0, len: 0.14 },
    { freq: 784, at: 0.22, len: 0.14 },
  ],
  critical: [
    { freq: 1046, at: 0, len: 0.12 },
    { freq: 698, at: 0.16, len: 0.12 },
    { freq: 1046, at: 0.32, len: 0.12 },
    { freq: 698, at: 0.48, len: 0.12 },
  ],
}

export function playAlertTone(level: AlertLevel) {
  const c = context()
  if (!c) return
  const start = c.currentTime + 0.02
  const peak = level === 'critical' ? 0.1 : 0.12
  for (const { freq, at, len } of PATTERNS[level]) {
    const osc = c.createOscillator()
    const gain = c.createGain()
    osc.type = level === 'critical' ? 'square' : 'sine'
    osc.frequency.value = freq
    gain.gain.setValueAtTime(0, start + at)
    gain.gain.linearRampToValueAtTime(peak, start + at + 0.01)
    gain.gain.linearRampToValueAtTime(0, start + at + len)
    osc.connect(gain).connect(c.destination)
    osc.start(start + at)
    osc.stop(start + at + len + 0.02)
  }
}

export function speak(text: string, interrupt = false) {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return
  if (interrupt) window.speechSynthesis.cancel()
  const utterance = new SpeechSynthesisUtterance(text)
  utterance.rate = 1.05
  utterance.lang = 'en'
  window.speechSynthesis.speak(utterance)
}

export function stopSpeech() {
  if (typeof window !== 'undefined' && 'speechSynthesis' in window) window.speechSynthesis.cancel()
}
