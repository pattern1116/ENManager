// speak(text): play a line through the server TTS proxy, falling back to the
// browser's built-in speechSynthesis when TTS isn't configured/available.
// Resolves when playback finishes. Keeps a handle on whatever is currently
// playing so the room can stop it (e.g. on unmount / early exit).

let currentAudio: HTMLAudioElement | null = null

export function stopSpeaking(): void {
  if (currentAudio) {
    currentAudio.pause()
    currentAudio.src = ''
    currentAudio = null
  }
  if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
    window.speechSynthesis.cancel()
  }
}

function speakViaBrowser(text: string, speed = 1): Promise<void> {
  return new Promise(resolve => {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
      resolve()
      return
    }
    const utter = new SpeechSynthesisUtterance(text)
    utter.lang = 'en-US'
    // 0.95 is our baseline "natural" pace; scale it by the requested multiplier.
    utter.rate = Math.max(0.5, 0.95 * speed)
    const voices = window.speechSynthesis.getVoices()
    const enVoice = voices.find(v => v.lang.startsWith('en') && /natural|google|samantha|en-US/i.test(v.name))
      ?? voices.find(v => v.lang.startsWith('en'))
    if (enVoice) utter.voice = enVoice
    utter.onend = () => resolve()
    utter.onerror = () => resolve()
    window.speechSynthesis.cancel()
    window.speechSynthesis.speak(utter)
  })
}

// `speed` is a pace multiplier: 1 = normal, <1 = slower (the learner asked the
// coach to slow down). It flows to Kokoro server-side, and to the browser
// fallback's utterance rate.
export async function speak(text: string, speed = 1): Promise<void> {
  if (!text?.trim()) return
  stopSpeaking()

  try {
    const res = await fetch('/api/tts', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ text, speed }),
    })

    if (!res.ok) {
      // 503 → not configured / upstream down: use the browser fallback.
      return await speakViaBrowser(text, speed)
    }

    const blob = await res.blob()
    const url = URL.createObjectURL(blob)
    await new Promise<void>(resolve => {
      const audio = new Audio(url)
      currentAudio = audio
      const done = () => {
        URL.revokeObjectURL(url)
        if (currentAudio === audio) currentAudio = null
        resolve()
      }
      audio.onended = done
      audio.onerror = () => {
        // Real-audio path failed mid-play — fall back so the turn still happens.
        done()
        void speakViaBrowser(text, speed)
      }
      audio.play().catch(() => {
        done()
        void speakViaBrowser(text, speed)
      })
    })
  } catch {
    await speakViaBrowser(text, speed)
  }
}
