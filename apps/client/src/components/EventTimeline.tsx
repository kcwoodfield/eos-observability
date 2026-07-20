import { EventRow } from '@/components/EventRow'
import { ScrollArea } from '@/components/ui/scroll-area'
import type { ObservabilityEvent } from '@/lib/types'

export function EventTimeline({ events }: { events: ObservabilityEvent[] }) {
  if (events.length === 0) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        No events yet — waiting for a harness adapter to send one.
      </div>
    )
  }

  return (
    <ScrollArea className="h-full">
      <div className="flex flex-col-reverse">
        {[...events].reverse().map((event) => (
          <EventRow key={event.id} event={event} />
        ))}
      </div>
    </ScrollArea>
  )
}
