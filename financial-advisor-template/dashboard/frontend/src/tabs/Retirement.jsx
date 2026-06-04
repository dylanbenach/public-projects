import { useState, useEffect, useCallback } from 'react'
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts'
import { recalcRetirement } from '../api'

const fmt = (n) => n >= 1e6 ? `$${(n / 1e6).toFixed(2)}M` : `$${Math.round(n).toLocaleString()}`
const fmtM = (n) => `$${(n / 1e6).toFixed(1)}M`

function Slider({ label, value, min, max, step, format, onChange }) {
  return (
    <div>
      <div className="flex justify-between text-sm mb-1">
        <span className="text-gray-400">{label}</span>
        <span className="text-white font-medium">{format(value)}</span>
      </div>
      <input
        type="range" min={min} max={max} step={step} value={value}
        onChange={e => onChange(Number(e.target.value))}
        className="w-full accent-indigo-500"
      />
      <div className="flex justify-between text-xs text-gray-600 mt-0.5">
        <span>{format(min)}</span><span>{format(max)}</span>
      </div>
    </div>
  )
}

export default function Retirement({ data }) {
  const { retirement, profile } = data

  const [retireAge, setRetireAge] = useState(retirement.target_age || 70)
  const [primaryContrib, setPrimaryContrib] = useState(0)
  const [spouseContrib, setSpouseContrib] = useState(0)
  const [returnRate, setReturnRate] = useState(7)
  const [salaryGrowth, setSalaryGrowth] = useState(3)
  const [result, setResult] = useState(null)
  const [loading, setLoading] = useState(false)

  const recalc = useCallback(async () => {
    setLoading(true)
    try {
      const r = await recalcRetirement({
        retire_age: retireAge,
        primary_contribution_annual: primaryContrib,
        spouse_contribution_annual: spouseContrib,
        expected_return: returnRate / 100,
        salary_growth_rate: salaryGrowth / 100,
      })
      setResult(r)
    } finally {
      setLoading(false)
    }
  }, [retireAge, primaryContrib, spouseContrib, returnRate, salaryGrowth])

  useEffect(() => {
    const t = setTimeout(recalc, 300)
    return () => clearTimeout(t)
  }, [recalc])

  const curve = result?.curve || retirement.curve
  const total = result?.total || retirement.total
  const monthly = result?.monthly_income || retirement.monthly_income

  const currentRetireIdx = curve.findIndex(d => d.age === retireAge)
  const displayCurve = curve.slice(0, currentRetireIdx + 1)

  return (
    <div className="space-y-6">
      {/* Hero numbers */}
      <div className="grid grid-cols-2 gap-4">
        <div className="bg-gradient-to-br from-green-950 to-gray-900 rounded-xl p-5 border border-green-800/30">
          <p className="text-xs font-medium uppercase tracking-wider text-green-400 mb-2">Portfolio at Age {retireAge}</p>
          <p className={`text-3xl font-bold text-white tabular-nums ${loading ? 'opacity-50' : ''}`}>
            {fmtM(total)}
          </p>
          <p className="text-green-400 text-xs mt-1.5">{(() => {
            const totalRoth = retirement.accounts.reduce((s, a) => s + (a.roth_balance ?? a.balance), 0)
            const totalPretax = retirement.accounts.reduce((s, a) => s + (a.pretax_balance ?? 0), 0)
            const total = totalRoth + totalPretax
            const rothPct = Math.round(totalRoth / total * 100)
            return `~${rothPct}% Roth tax-free · ~${100 - rothPct}% pre-tax`
          })()}</p>
        </div>
        <div className="bg-gradient-to-br from-indigo-950 to-gray-900 rounded-xl p-5 border border-indigo-800/30">
          <p className="text-xs font-medium uppercase tracking-wider text-indigo-400 mb-2">Monthly Income (4% rule)</p>
          <p className={`text-3xl font-bold text-white tabular-nums ${loading ? 'opacity-50' : ''}`}>
            ${Math.round(monthly).toLocaleString()}
          </p>
          <p className="text-indigo-400 text-xs mt-1.5">Tax-free · {retireAge - profile.age} years away</p>
        </div>
      </div>

      {/* Chart */}
      <div className="bg-gray-800/70 rounded-xl p-5 border border-gray-700/60">
        <h3 className="text-sm font-semibold text-white mb-4">Portfolio Growth to Age {retireAge}</h3>
        <ResponsiveContainer width="100%" height={220}>
          <LineChart data={displayCurve}>
            <XAxis dataKey="age" tick={{ fill: '#9ca3af', fontSize: 11 }} label={{ value: 'Age', position: 'insideBottom', offset: -2, fill: '#6b7280', fontSize: 11 }} />
            <YAxis tickFormatter={fmtM} tick={{ fill: '#9ca3af', fontSize: 11 }} />
            <Tooltip
              formatter={(v) => [fmtM(v), 'Portfolio']}
              labelFormatter={(l) => `Age ${l}`}
              contentStyle={{ background: '#1f2937', border: 'none', borderRadius: 8 }}
            />
            <ReferenceLine x={retireAge} stroke="#6366f1" strokeDasharray="4 2" label={{ value: `Retire`, fill: '#818cf8', fontSize: 11 }} />
            <Line type="monotone" dataKey="value" stroke="#22c55e" strokeWidth={2} dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* Sliders */}
      <div className="bg-gray-800/70 rounded-xl p-5 space-y-5 border border-gray-700/60">
        <h3 className="text-sm font-semibold text-white">What-If Scenarios</h3>

        <Slider
          label="Retirement Age"
          value={retireAge} min={55} max={75} step={1}
          format={v => `Age ${v}`}
          onChange={setRetireAge}
        />
        <Slider
          label="Primary 401k Contribution"
          value={primaryContrib} min={0} max={23500} step={500}
          format={v => `$${v.toLocaleString()}`}
          onChange={setPrimaryContrib}
        />
        <Slider
          label="Spouse 401k Contribution"
          value={spouseContrib} min={0} max={23500} step={500}
          format={v => `$${v.toLocaleString()}`}
          onChange={setSpouseContrib}
        />
        <Slider
          label="Expected Annual Return"
          value={returnRate} min={4} max={10} step={0.5}
          format={v => `${v}%`}
          onChange={setReturnRate}
        />
        <Slider
          label="Annual Salary Growth"
          value={salaryGrowth} min={0} max={8} step={0.5}
          format={v => `${v}%`}
          onChange={setSalaryGrowth}
        />
      </div>

      {/* Account breakdown */}
      <div className="bg-gray-800/70 rounded-xl p-5 border border-gray-700/60">
        <h3 className="text-sm font-semibold text-white mb-3">Accounts</h3>
        <div className="space-y-3">
          {retirement.accounts.map((a, i) => (
            <div key={i} className="flex justify-between items-start">
              <div>
                <p className="text-white text-sm">{a.name}</p>
                <p className="text-gray-400 text-xs">{a.employer} · {a.type}</p>
                {a.roth_balance != null && a.pretax_balance != null && (
                  <p className="text-gray-500 text-xs mt-0.5">
                    {fmt(a.roth_balance)} Roth · {fmt(a.pretax_balance)} pre-tax
                  </p>
                )}
                {a.allocation_notes && (
                  <p className="text-gray-600 text-xs mt-0.5 max-w-xs">{a.allocation_notes.split('—')[0].trim()}</p>
                )}
              </div>
              <div className="text-right">
                <p className="text-white text-sm font-medium tabular-nums">{fmt(a.balance)}</p>
                {a.contribution > 0 && (
                  <p className="text-green-400 text-xs">${a.contribution.toLocaleString()}/yr in</p>
                )}
              </div>
            </div>
          ))}
        </div>
        <div className="mt-3 pt-3 border-t border-gray-700 flex justify-between">
          <span className="text-gray-400 text-sm">Total today</span>
          <span className="text-white font-bold">{fmt(retirement.accounts.reduce((s, a) => s + a.balance, 0))}</span>
        </div>
      </div>
    </div>
  )
}
