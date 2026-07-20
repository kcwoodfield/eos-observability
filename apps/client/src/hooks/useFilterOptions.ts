import { useEffect, useState } from 'react'
import { SERVER_URL } from '@/lib/config'
import type { FilterOptions } from '@/lib/types'

const EMPTY: FilterOptions = { harnesses: [], source_apps: [], session_ids: [], event_types: [] }

export function useFilterOptions() {
  const [options, setOptions] = useState<FilterOptions>(EMPTY)

  useEffect(() => {
    fetch(`${SERVER_URL}/events/filter-options`)
      .then((res) => res.json())
      .then(setOptions)
      .catch((err) => console.error('Failed to load filter options:', err))
  }, [])

  return options
}
