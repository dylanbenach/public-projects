import { useState, useEffect, useCallback } from 'react'
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts'
import { recalcCollege } from '../api'

const fmt = (n) => n >= 1e6 ? `$${(n / 1e6).toFixed(2)}M` : `$${Math.round(n).toLocaleString()}`
const fmtK = (n) => n >= 1e6 ? `$${(n / 1e6).toFixed(1)}M` : `$${(n / 1000).toFixed(0)}k`

const SCHOOL_COSTS = {
  public_in_state: { label: 'Public In-State', color: '#3b82f6' },
  public_out_of_state: { label: 'Public Out-of-State', color: '#f59e0b' },
  private: { label: 'Private', color: '#6366f1' },
}

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

export default function College({ data }) {
  const { college } = data

  const [annualContrib, setAnnualContrib] = useState(college.annual_contribution || 5500)
  const [schoolType, setSchoolType] = useState(college.school_type || 'private')
  const [result, setResult] = useState(null)
  const [loading, setLoading] = useState(false)

  const recalc = useCallback(async () => {
    setLoading(true)
    try {
      const r = await recalcCollege({
        annual_contribution: annualContrib,
        expected_return: 0.065,
        school_type: schoolType,
      })
      setResult(r)
    } finally {
      setLoading(false)
    }
  }, [annualContrib, schoolType])

  useEffect(() => {
    const t = setTimeout(recalc, 300)
    return () => clearTimeout(t)
  }, [recalc])

  const projBalance = result?.projected_balance ?? college.projected_balance
  const projCost = result?.projected_cost ?? college.projected_cost
  const gap = result?.funding_gap ?? college.funding_gap
  const fullyFunded = result?.fully_funded ?? college.fully_funded
  const addlNeeded = result?.additional_needed ?? 0
  const curve = result?.curve || college.curve || []
  const collegeYear = new Date().getFullYear() + (college.years_to_college || 18)

  return (
    <div className="space-y-6">
      {/* Hero */}
      <div className="grid grid-cols-2 gap-4">
        <div className={`rounded-xl p-5 border ${fullyFunded ? 'bg-gradient-to-br from-green-950 to-gray-900 border-green-800/30' : 'bg-gradient-to-br from-amber-950 to-gray-900 border-amber-800/30'}`}>
          <p className={`text-xs font-medium uppercase tracking-wider mb-2 ${fullyFunded ? 'text-green-400' : 'text-amber-400'}`}>
            529 Balance at College ({collegeYear})
          </p>
          <p className={`text-3xl font-bold text-white tabular-nums ${loading ? 'opacity-50' : ''}`}>
            {fmt(projBalance)}
          </p>
          <p className={`text-xs mt-1.5 ${fullyFunded ? 'text-green-400' : 'text-amber-400'}`}>
            {fullyFunded ? 'Fully funded' : `Gap: ${fmt(gap)}`}
          </p>
        </div>
        <div className="bg-gray-800/70 rounded-xl p-5 border border-gray-700/60">
          <p className="text-xs font-medium uppercase tracking-wider text-gray-500 mb-2">Projected {SCHOOL_COSTS[schoolType]?.label} Cost</p>
          <p className={`text-3xl font-bold text-white tabular-nums ${loading ? 'opacity-50' : ''}`}>
            {fmt(projCost)}
          </p>
          {!fullyFunded && (
            <p className="text-red-400 text-xs mt-1.5">Need ${Math.round(addlNeeded).toLocaleString()}/yr more</p>
          )}
        </div>
      </div>

      {/* Chart */}
      <div className="bg-gray-800/70 rounded-xl p-5 border border-gray-700/60">
        <h3 className="text-sm font-semibold text-white mb-1">{college.child_name}'s 529 Growth</h3>
        <p className="text-gray-500 text-xs mb-4">Balance grows until college starts ({collegeYear})</p>
        <ResponsiveContainer width="100%" height={220}>
          <AreaChart data={curve}>
            <XAxis dataKey="year" tick={{ fill: '#9ca3af', fontSize: 11 }} />
            <YAxis tickFormatter={fmtK} tick={{ fill: '#9ca3af', fontSize: 11 }} />
            <Tooltip
              formatter={(v) => [fmt(v), '529 Balance']}
              contentStyle={{ background: '#1f2937', border: 'none', borderRadius: 8 }}
            />
            <ReferenceLine x={collegeYear} stroke="#f59e0b" strokeDasharray="4 2"
              label={{ value: 'College', fill: '#fbbf24', fontSize: 11 }} />
            <Area type="monotone" dataKey="balance" stroke="#22c55e" fill="#14532d" strokeWidth={2} />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {/* Controls */}
      <div className="bg-gray-800/70 rounded-xl p-5 space-y-5 border border-gray-700/60">
        <h3 className="text-sm font-semibold text-white">What-If Scenarios</h3>

        <div>
          <p className="text-gray-400 text-sm mb-2">School Type</p>
          <div className="flex gap-2">
            {Object.entries(SCHOOL_COSTS).map(([key, { label }]) => (
              <button
                key={key}
                onClick={() => setSchoolType(key)}
                className={`flex-1 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                  schoolType === key
                    ? 'bg-indigo-600 text-white'
                    : 'bg-gray-700 text-gray-400 hover:bg-gray-600'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <Slider
          label="Annual 529 Contribution"
          value={annualContrib} min={0} max={20000} step={500}
          format={v => `$${v.toLocaleString()}/yr`}
          onChange={setAnnualContrib}
        />
      </div>

      {/* Context */}
      <div className="bg-gray-800/70 rounded-xl p-5 space-y-2 text-sm border border-gray-700/60">
        <div className="flex justify-between">
          <span className="text-gray-400">Current balance</span>
          <span className="text-white">{fmt(college.current_balance)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-gray-400">Current contributions</span>
          <span className="text-white">${college.annual_contribution.toLocaleString()}/yr</span>
        </div>
        <div className="flex justify-between">
          <span className="text-gray-400">Years to college</span>
          <span className="text-white">{college.years_to_college} years ({collegeYear})</span>
        </div>
        <div className="pt-2 border-t border-gray-700 text-gray-400 text-xs">
          529 funds can also cover up to $10k/yr for K-12 tuition if your state allows it.
        </div>
      </div>
    </div>
  )
}
