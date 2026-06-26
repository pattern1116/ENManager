// GET /api/define?word=xxx
// Looks up an English word's meaning for the double-click dictionary popup.
// Tries the free dictionaryapi.dev first (fast, clean, standard definitions),
// then falls back to the local LLM (works offline, can gloss rarer words).

import { NextRequest, NextResponse } from 'next/server'
import { getLLMProvider } from '@/lib/providers/llm'

export interface DefineEntry {
  partOfSpeech?: string
  definition: string
  example?: string
}
export interface DefineResponse {
  word: string
  phonetic?: string
  entries: DefineEntry[]
  source: 'dictionary' | 'llm'
}

const LLM_SYSTEM = `You are a concise English dictionary for a language learner.
Define the given word in simple English. Return ONLY JSON, no prose:
{"phonetic":"","entries":[{"partOfSpeech":"noun|verb|adjective|...","definition":"a short, clear definition","example":"a short example sentence"}]}
Give at most 3 entries. Keep each definition under 20 words. Omit example if you don't have a natural one.`

// dictionaryapi.dev → our shape. Returns null when the word isn't found there.
async function fromDictionaryApi(word: string): Promise<DefineResponse | null> {
  try {
    const res = await fetch(
      `https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(word)}`,
      { signal: AbortSignal.timeout(4000) },
    )
    if (!res.ok) return null
    const data = (await res.json()) as any[]
    if (!Array.isArray(data) || data.length === 0) return null

    const phonetic: string | undefined =
      data[0]?.phonetic || data[0]?.phonetics?.find((p: any) => p?.text)?.text || undefined

    const entries: DefineEntry[] = []
    for (const e of data) {
      for (const m of e?.meanings ?? []) {
        for (const d of m?.definitions ?? []) {
          if (d?.definition) {
            entries.push({
              partOfSpeech: m.partOfSpeech,
              definition: d.definition,
              example: d.example,
            })
          }
          if (entries.length >= 3) break
        }
        if (entries.length >= 3) break
      }
      if (entries.length >= 3) break
    }
    if (entries.length === 0) return null
    return { word, phonetic, entries, source: 'dictionary' }
  } catch {
    return null
  }
}

function extractJson(raw: string): any | null {
  const match = raw.match(/\{[\s\S]*\}/)
  if (!match) return null
  try {
    return JSON.parse(match[0])
  } catch {
    return null
  }
}

async function fromLLM(word: string): Promise<DefineResponse | null> {
  const llm = getLLMProvider()
  if (llm.name === 'mock') return null
  try {
    const raw = await llm.complete(
      [{ role: 'user', content: `Word: "${word}"` }],
      LLM_SYSTEM,
      { temperature: 0.2 },
    )
    const parsed = extractJson(raw)
    const rawEntries = Array.isArray(parsed?.entries) ? parsed.entries : []
    const entries: DefineEntry[] = rawEntries
      .filter((e: any) => typeof e?.definition === 'string' && e.definition.trim())
      .slice(0, 3)
      .map((e: any) => ({
        partOfSpeech: typeof e.partOfSpeech === 'string' ? e.partOfSpeech : undefined,
        definition: e.definition.trim(),
        example: typeof e.example === 'string' && e.example.trim() ? e.example.trim() : undefined,
      }))
    if (entries.length === 0) return null
    const phonetic = typeof parsed?.phonetic === 'string' && parsed.phonetic.trim() ? parsed.phonetic.trim() : undefined
    return { word, phonetic, entries, source: 'llm' }
  } catch {
    return null
  }
}

export async function GET(req: NextRequest) {
  // Normalise: letters, apostrophes and hyphens only, lowercased.
  const raw = req.nextUrl.searchParams.get('word') ?? ''
  const word = raw.trim().toLowerCase().replace(/[^a-z'-]/g, '')
  if (word.length < 2) {
    return NextResponse.json({ error: 'word is required' }, { status: 400 })
  }

  const result = (await fromDictionaryApi(word)) ?? (await fromLLM(word))
  if (!result) {
    return NextResponse.json({ error: 'No definition found', word }, { status: 404 })
  }
  return NextResponse.json(result)
}
