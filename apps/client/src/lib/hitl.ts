import { SERVER_URL } from '@/lib/config'
import type { HitlRequest } from '@/lib/types'

export async function respondToHitlRequest(
  id: number,
  status: 'approved' | 'denied',
  response?: string
): Promise<HitlRequest> {
  const res = await fetch(`${SERVER_URL}/hitl/${id}/respond`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status, response }),
  })
  if (!res.ok) throw new Error(`Failed to respond to HITL request ${id}: ${res.status}`)
  return res.json()
}
