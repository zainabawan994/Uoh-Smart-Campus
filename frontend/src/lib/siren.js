// Emergency siren generated with the Web Audio API, so no audio file is needed.
// Browsers only allow audio after a user gesture, so call unlockAudio() from a click first.

let ctx = null

export function unlockAudio() {
  const AudioCtx = window.AudioContext || window.webkitAudioContext
  if (!AudioCtx) return false
  if (!ctx) ctx = new AudioCtx()
  if (ctx.state === 'suspended') ctx.resume()
  return true
}

export function audioReady() {
  return ctx !== null && ctx.state === 'running'
}

/** Rising and falling siren for `seconds`. Returns false when audio is still locked. */
export function playSiren(seconds = 4) {
  if (!audioReady()) return false
  const t = ctx.currentTime
  const osc = ctx.createOscillator()
  const gain = ctx.createGain()
  osc.type = 'sawtooth'
  for (let i = 0; i < seconds * 2; i++) {
    const start = t + i * 0.5
    osc.frequency.setValueAtTime(650, start)
    osc.frequency.linearRampToValueAtTime(1250, start + 0.25)
    osc.frequency.linearRampToValueAtTime(650, start + 0.5)
  }
  gain.gain.setValueAtTime(0.0001, t)
  gain.gain.exponentialRampToValueAtTime(0.2, t + 0.05)
  gain.gain.setValueAtTime(0.2, t + seconds - 0.15)
  gain.gain.exponentialRampToValueAtTime(0.0001, t + seconds)
  osc.connect(gain)
  gain.connect(ctx.destination)
  osc.start(t)
  osc.stop(t + seconds)
  return true
}
