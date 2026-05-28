'use client'

import { createContext, useContext } from 'react'
import { useCoachSession } from '@/hooks/useCoachSession'

type CoachSessionReturn = ReturnType<typeof useCoachSession>

const CoachContext = createContext<CoachSessionReturn | null>(null)

export function CoachProvider({ children }: { children: React.ReactNode }) {
  const session = useCoachSession()
  return <CoachContext.Provider value={session}>{children}</CoachContext.Provider>
}

export function useCoach(): CoachSessionReturn {
  const ctx = useContext(CoachContext)
  if (!ctx) throw new Error('useCoach must be used inside CoachProvider')
  return ctx
}
