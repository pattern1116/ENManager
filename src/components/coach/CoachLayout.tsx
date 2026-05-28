'use client'

import { CoachProvider } from './CoachContext'
import RecordPanel from './RecordPanel'
import FeedbackPanel from './FeedbackPanel'

export default function CoachLayout() {
  return (
    <CoachProvider>
      <div className="flex-1 flex overflow-hidden">
        <div className="flex-1 flex flex-col items-center justify-center p-8 border-r border-line overflow-y-auto">
          <RecordPanel />
        </div>
        <div className="w-[420px] flex-shrink-0 overflow-y-auto p-6">
          <FeedbackPanel />
        </div>
      </div>
    </CoachProvider>
  )
}
