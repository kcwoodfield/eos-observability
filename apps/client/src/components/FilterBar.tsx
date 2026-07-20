import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import type { EventQuery, FilterOptions } from '@/lib/types'

const ALL = '__all__'

function FilterSelect({
  label,
  value,
  onChange,
  allLabel,
  options,
  monospace = false,
}: {
  label: string
  value: string | undefined
  onChange: (value: string | undefined) => void
  allLabel: string
  options: string[]
  monospace?: boolean
}) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-[10px] font-semibold tracking-wide text-muted-foreground uppercase">
        {label}
      </span>
      <Select
        value={value ?? ALL}
        onValueChange={(v) => onChange(!v || v === ALL ? undefined : v)}
      >
        <SelectTrigger size="sm" className="w-40">
          <SelectValue placeholder={allLabel}>
            {(v: string | null) => (
              <span className={monospace && v && v !== ALL ? 'font-mono' : ''}>
                {!v || v === ALL ? allLabel : v}
              </span>
            )}
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>{allLabel}</SelectItem>
          {options.map((opt) => (
            <SelectItem key={opt} value={opt} className={monospace ? 'font-mono' : ''}>
              {opt}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}

export function FilterBar({
  filters,
  onChange,
  options,
}: {
  filters: EventQuery
  onChange: (filters: EventQuery) => void
  options: FilterOptions
}) {
  return (
    <div className="flex items-end gap-3">
      <FilterSelect
        label="Harness"
        value={filters.harness}
        allLabel="All harnesses"
        options={options.harnesses}
        onChange={(v) => onChange({ ...filters, harness: v as EventQuery['harness'] })}
      />
      <FilterSelect
        label="Source App"
        value={filters.source_app}
        allLabel="All sources"
        options={options.source_apps}
        onChange={(v) => onChange({ ...filters, source_app: v })}
      />
      <FilterSelect
        label="Session ID"
        value={filters.session_id}
        allLabel="All sessions"
        options={options.session_ids}
        monospace
        onChange={(v) => onChange({ ...filters, session_id: v })}
      />
      <FilterSelect
        label="Event Type"
        value={filters.event_type}
        allLabel="All types"
        options={options.event_types}
        onChange={(v) => onChange({ ...filters, event_type: v })}
      />
    </div>
  )
}
