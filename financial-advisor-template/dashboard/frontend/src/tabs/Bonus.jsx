import { useState, useMemo } from 'react'

const fmt = (n) => n >= 1e6 ? `$${(n / 1e6).toFixed(2)}M` : `$${Math.round(n).toLocaleString()}`

// Federal supplemental withholding rate (fixed at 22%) + state (update for your state)
const FEDERAL_SUPP = 0.22
const STATE_RATE = 0.05
const TOTAL_TAX_RATE = FEDERAL_SUPP + STATE_RATE

function monthsToPayoff(balance, annualRate, payment) {
  const r = annualRate / 12
  let bal = balance
  for (let mo = 1; mo <= 1200; mo++) {
    bal -= Math.max(payment - bal * r, 0)
    if (bal <= 0) return mo
  }
  return null
}

function payoffDate(months) {
  if (!months) return 'Very long'
  const d = new Date()
  d.setMonth(d.getMonth() + months)
  return d.toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
}

function ImpactRow({ label, before, after, good }) {
  return (
    <div className="flex justify-between items-center py-2 border-b border-gray-700 last:border-0">
      <span className="text-gray-400 text-sm">{label}</span>
      <div className="flex items-center gap-2 text-sm">
        <span className="text-gray-500">{before}</span>
        <span className="text-gray-600">→</span>
        <span className={good ? 'text-green-400 font-medium' : 'text-white font-medium'}>{after}</span>
      </div>
    </div>
  )
}

export default function Bonus({ data }) {
  const { debts, college } = data

  const [grossBonus, setGrossBonus] = useState(40000)
  const [helocPct, setHelocPct] = useState(60)
  const [collegePct, setCollegePct] = useState(20)
  const [savingsPct, setSavingsPct] = useState(10)

  const flexPct = Math.max(0, 100 - helocPct - collegePct - savingsPct)

  const netBonus = Math.round(grossBonus * (1 - TOTAL_TAX_RATE))
  const taxWithheld = grossBonus - netBonus

  const helocAlloc   = Math.round(netBonus * helocPct / 100)
  const collegeAlloc = Math.round(netBonus * collegePct / 100)
  const savingsAlloc = Math.round(netBonus * savingsPct / 100)
  const flexAlloc    = Math.round(netBonus * flexPct / 100)

  // HELOC impact
  const helocBal = debts.heloc.balance
  const helocRate = debts.heloc.rate
  const helocPmt = debts.heloc.monthly_payment
  const baseHelocMonths = useMemo(() => monthsToPayoff(helocBal, helocRate, helocPmt), [helocBal, helocRate, helocPmt])
  const newHelocMonths  = useMemo(() => monthsToPayoff(Math.max(helocBal - helocAlloc, 0), helocRate, helocPmt), [helocBal, helocAlloc, helocRate, helocPmt])

  // 529 impact
  const currentGap = college?.funding_gap ?? 0
  const newGap = Math.max(currentGap - collegeAlloc, 0)

  const fmtMonths = (m) => m ? `${Math.floor(m/12)}y ${m%12}mo` : '—'

  const allocs = [
    { label: 'HELOC Paydown', pct: helocPct, set: setHelocPct, color: '#f97316', amount: helocAlloc },
    { label: `${college?.child_name || 'Child'}'s 529`,   pct: collegePct, set: setCollegePct, color: '#22c55e', amount: collegeAlloc },
    { label: 'Savings',       pct: savingsPct, set: setSavingsPct, color: '#3b82f6', amount: savingsAlloc },
  ]

  return (
    <div className="space-y-6">
      {/* Gross bonus input */}
      <div className="bg-gradient-to-br from-indigo-950 to-gray-900 rounded-xl p-6 border border-indigo-800/30">
        <p className="text-xs font-medium uppercase tracking-wider text-indigo-400 mb-2">Annual Bonus (Gross)</p>
        <p className="text-5xl font-bold text-white tabular-nums">${grossBonus.toLocaleString()}</p>
        <input
          type="range" min={0} max={100000} step={1000} value={grossBonus}
          onChange={e => setGrossBonus(Number(e.target.value))}
          className="w-full accent-indigo-400 mt-3"
        />
        <div className="flex justify-between text-xs text-indigo-400 mt-1">
          <span>$0</span><span>$100k</span>
        </div>
      </div>

      {/* Tax breakdown */}
      <div className="bg-gray-800/70 rounded-xl p-5 border border-gray-700/60">
        <h3 className="text-sm font-semibold text-white mb-3">After-Tax Take-Home</h3>
        <div className="space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-gray-400">Federal supplemental (22%)</span>
            <span className="text-red-400">−${Math.round(grossBonus * FEDERAL_SUPP).toLocaleString()}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-400">State tax ({(STATE_RATE * 100).toFixed(1)}%)</span>
            <span className="text-red-400">−${Math.round(grossBonus * STATE_RATE).toLocaleString()}</span>
          </div>
          <div className="flex justify-between border-t border-gray-700 pt-2 font-medium">
            <span className="text-white">Net bonus</span>
            <span className="text-green-400">${netBonus.toLocaleString()}</span>
          </div>
        </div>
      </div>

      {/* Allocation sliders */}
      <div className="bg-gray-800/70 rounded-xl p-5 space-y-5 border border-gray-700/60">
        <h3 className="text-sm font-semibold text-white">Allocate Net Bonus</h3>

        {allocs.map(({ label, pct, set, color, amount }) => (
          <div key={label}>
            <div className="flex justify-between text-sm mb-1">
              <span className="text-gray-400">{label}</span>
              <span className="font-medium" style={{ color }}>{pct}% — ${amount.toLocaleString()}</span>
            </div>
            <input
              type="range" min={0} max={100} step={5} value={pct}
              onChange={e => set(Number(e.target.value))}
              style={{ accentColor: color }}
              className="w-full"
            />
          </div>
        ))}

        <div className="flex justify-between text-sm pt-1 border-t border-gray-700">
          <span className="text-gray-400">Flex / spending</span>
          <span className="text-gray-300">{flexPct}% — ${flexAlloc.toLocaleString()}</span>
        </div>

        {helocPct + collegePct + savingsPct > 100 && (
          <p className="text-red-400 text-xs">Allocations exceed 100% — reduce one slider</p>
        )}
      </div>

      {/* Impact */}
      <div className="bg-gray-800/70 rounded-xl p-5 border border-gray-700/60">
        <h3 className="text-sm font-semibold text-white mb-3">Impact</h3>
        <ImpactRow
          label="HELOC payoff"
          before={fmtMonths(baseHelocMonths)}
          after={fmtMonths(newHelocMonths)}
          good={true}
        />
        <ImpactRow
          label="HELOC balance after"
          before={fmt(helocBal)}
          after={fmt(Math.max(helocBal - helocAlloc, 0))}
          good={true}
        />
        {college && (
          <>
            <ImpactRow
              label={`${college?.child_name || 'Child'}'s 529 gap`}
              before={fmt(currentGap)}
              after={fmt(newGap)}
              good={true}
            />
            <ImpactRow
              label="529 lump sum added"
              before="—"
              after={`+${fmt(collegeAlloc)}`}
              good={true}
            />
          </>
        )}
        <ImpactRow
          label="Savings added"
          before="—"
          after={`+${fmt(savingsAlloc)}`}
          good={false}
        />
      </div>

      {/* Suggested split note */}
      <div className="bg-gray-800/70 rounded-xl p-4 text-xs text-gray-400 border border-gray-700/60">
        <span className="text-gray-300 font-medium">Suggested split: </span>
        60% HELOC · 20% 529 · 10% savings · 10% flex — eliminates HELOC years faster while closing the 529 gap.
      </div>
    </div>
  )
}
