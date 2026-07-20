import { useState } from 'react'
import { ActivityTimeline } from '@/components/ActivityTimeline'
import { EventTimeline } from '@/components/EventTimeline'
import { FilterBar } from '@/components/FilterBar'
import { ThemeToggle } from '@/components/ThemeToggle'
import { Separator } from '@/components/ui/separator'
import { useFilterOptions } from '@/hooks/useFilterOptions'
import { useObservabilityEvents } from '@/hooks/useObservabilityEvents'
import type { EventQuery } from '@/lib/types'

function App() {
  const [filters, setFilters] = useState<EventQuery>({ limit: 100 })
  const filterOptions = useFilterOptions()
  const { events, isConnected, loading } = useObservabilityEvents(filters)

  return (
    <div className="flex h-screen flex-col bg-background text-foreground">
      <header className="flex items-center justify-between border-b border-border px-4 py-3">
        <h1 className="text-sm font-semibold tracking-tight">EOS-Observability</h1>

        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span className="relative flex size-2">
            {isConnected && (
              <span className="absolute inline-flex size-full animate-ping rounded-full bg-[var(--status-good)] opacity-75" />
            )}
            <span
              className="relative inline-flex size-2 rounded-full"
              style={{ backgroundColor: isConnected ? 'var(--status-good)' : 'var(--status-critical)' }}
            />
          </span>
          {isConnected ? 'Connected' : 'Disconnected'}
          <Separator orientation="vertical" className="h-3" />
          <span className="tabular-nums">{events.length} events</span>
        </div>

        <ThemeToggle />
      </header>

      <div className="border-b border-border px-4 py-3">
        <FilterBar filters={filters} onChange={setFilters} options={filterOptions} />
      </div>

      <ActivityTimeline events={events} />

      <div className="px-4 pt-3 pb-1">
        <h2 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
          Agent Event Stream
        </h2>
      </div>

      <main className="min-h-0 flex-1">
        {loading && events.length === 0 ? (
          <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
            Loading…
          </div>
        ) : (
          <EventTimeline events={events} />
        )}
      </main>
    </div>
  )
}

export default App
