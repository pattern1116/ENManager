import CoachLayout from '@/components/coach/CoachLayout'
import Sidebar from '@/components/layout/Sidebar'

export default function Home() {
  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar />

      <main className="flex-1 flex flex-col overflow-hidden">
        <header className="flex items-center gap-3 px-6 py-4 border-b border-line flex-shrink-0">
          <div className="w-2 h-2 rounded-full bg-green-500" />
          <h1 className="text-sm font-medium text-muted tracking-wide uppercase">
            Speaking Coach
          </h1>
        </header>

        <CoachLayout />
      </main>
    </div>
  )
}
