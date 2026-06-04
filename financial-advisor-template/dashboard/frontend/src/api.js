const BASE = '/api'

export async function getSummary() {
  const res = await fetch(`${BASE}/summary`)
  if (!res.ok) throw new Error('Failed to load summary')
  return res.json()
}

export async function recalcRetirement(params) {
  const res = await fetch(`${BASE}/retirement`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  if (!res.ok) throw new Error('Failed to recalculate retirement')
  return res.json()
}

export async function recalcCollege(params) {
  const res = await fetch(`${BASE}/college`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  if (!res.ok) throw new Error('Failed to recalculate college')
  return res.json()
}

export async function saveNetworthSnapshot() {
  const res = await fetch(`${BASE}/networth/snapshot`, { method: 'POST' })
  if (!res.ok) throw new Error('Failed to save snapshot')
  return res.json()
}
