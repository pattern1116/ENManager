// Small Talk owns its own theme + chrome — no coach sidebar. The
// `theme-smalltalk` wrapper re-themes every CSS variable for this subtree
// (see globals.css), giving the section a distinct warm look.

import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Small Talk',
  description: 'Listen and speak — practise natural small talk out loud.',
}

export default function SmallTalkLayout({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="theme-smalltalk min-h-screen"
      style={{ background: 'var(--bg)', color: 'var(--text-primary)' }}
    >
      {children}
    </div>
  )
}
