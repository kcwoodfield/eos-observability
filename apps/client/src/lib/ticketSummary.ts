import type { Ticket } from '@/lib/types'

export interface EpicGroup {
  epic: string | null
  tickets: Ticket[]
}

export interface ApplicationGroup {
  application: string
  epics: EpicGroup[]
}

// Application → Epic → Ticket, per eos/standards/Application Mapping
// Standard.md's "Epic grouping (optional)" section — Application is the
// existing top-level container (what a Jira-style tool would call
// "Project"); tickets with no epic land in a null-epic bucket rather than
// being hidden.
export function groupTicketsByApplication(tickets: Ticket[]): ApplicationGroup[] {
  const byApp = new Map<string, Map<string | null, Ticket[]>>()

  for (const ticket of tickets) {
    let epics = byApp.get(ticket.application)
    if (!epics) {
      epics = new Map()
      byApp.set(ticket.application, epics)
    }
    const key = ticket.epic ?? null
    const list = epics.get(key) ?? []
    list.push(ticket)
    epics.set(key, list)
  }

  return [...byApp.entries()].map(([application, epics]) => ({
    application,
    epics: [...epics.entries()]
      .sort(([a], [b]) => (a === null ? 1 : b === null ? -1 : a.localeCompare(b)))
      .map(([epic, tickets]) => ({ epic, tickets })),
  }))
}
