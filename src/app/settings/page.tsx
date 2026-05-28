import Sidebar from '@/components/layout/Sidebar'

export default function SettingsPage() {
  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar />
      <main className="flex-1 flex flex-col overflow-hidden">
        <header className="flex items-center gap-3 px-6 py-4 border-b border-line flex-shrink-0">
          <div className="w-2 h-2 rounded-full bg-purple-500" />
          <h1 className="text-sm font-medium text-muted tracking-wide uppercase">Settings</h1>
        </header>
        <div className="flex-1 overflow-y-auto p-8">
          <div className="max-w-xl mx-auto flex flex-col gap-6">

            {/* LLM config */}
            <section className="rounded-xl bg-bg-card border border-line p-6">
              <h2 className="text-sm font-medium mb-4">LLM Provider</h2>
              <div className="flex flex-col gap-3 text-sm">
                <Row label="Provider" value={process.env.LLM_PROVIDER ?? 'mock'} />
                <Row label="Model"    value={process.env.LLM_MODEL    ?? '—'} />
                <Row label="Base URL" value={process.env.LLM_BASE_URL ?? '—'} />
              </div>
            </section>

            {/* STT config */}
            <section className="rounded-xl bg-bg-card border border-line p-6">
              <h2 className="text-sm font-medium mb-4">Speech-to-Text</h2>
              <div className="flex flex-col gap-3 text-sm">
                <Row label="Provider" value={process.env.STT_PROVIDER ?? 'mock'} />
                <Row label="Model"    value={process.env.STT_MODEL    ?? '—'} />
                <Row label="Base URL" value={process.env.STT_BASE_URL ?? '—'} />
              </div>
            </section>

            {/* DB config */}
            <section className="rounded-xl bg-bg-card border border-line p-6">
              <h2 className="text-sm font-medium mb-4">Database</h2>
              <div className="flex flex-col gap-3 text-sm">
                <Row label="Path" value={process.env.DB_PATH ?? './data/speaking-coach.db'} />
              </div>
            </section>

            <p className="text-xs text-muted text-center">
              Edit <code className="font-mono">.env.local</code> to change providers.
            </p>

          </div>
        </div>
      </main>
    </div>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4">
      <span className="text-muted">{label}</span>
      <span className="font-mono text-xs bg-bg-surface px-2 py-0.5 rounded">
        {value}
      </span>
    </div>
  )
}
