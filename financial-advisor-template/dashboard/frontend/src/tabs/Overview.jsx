import { useState, useMemo } from 'react'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell,
  LineChart, Line, Legend, AreaChart, Area,
} from 'recharts'
import { saveNetworthSnapshot } from '../api'

const fmt = (n) => n >= 1e6
  ? `$${(n / 1e6).toFixed(2)}M`
  : `$${Math.round(n).toLocaleString()}`

const fmtK = (n) => n >= 1e6
  ? `$${(n / 1e6).toFixed(1)}M`
  : `$${(n / 1000).toFixed(0)}k`

// Keys here should match the keys you use in monthly_spending_categories in data/profile.json.
// Unknown keys will fall back to the key name itself with a default color.
const SPEND_COLORS = {
  mortgage:     '#6366f1',
  heloc:        '#f97316',
  food:         '#3b82f6',
  transport:    '#22c55e',
  childcare:    '#ec4899',
  debt_payment: '#8b5cf6',
  utilities:    '#f59e0b',
  other:        '#6b7280',
}

const SPEND_LABELS = {
  mortgage:     'Mortgage',
  heloc:        'HELOC',
  food:         'Food & Dining',
  transport:    'Transport',
  childcare:    'Childcare',
  debt_payment: 'Debt Payment',
  utilities:    'Utilities',
  other:        'Other',
}

function StatCard({ label, value, sub, accent }) {
  return (
    <div className="bg-gray-800/70 rounded-xl p-5 border border-gray-700/60">
      <p className="text-xs font-medium uppercase tracking-wider text-gray-500 mb-2">{label}</p>
      <p className={`text-2xl font-bold tabular-nums ${accent || 'text-white'}`}>{value}</p>
      {sub && <p className="text-gray-500 text-xs mt-1.5 leading-relaxed">{sub}</p>}
    </div>
  )
}

function helocCurve(balance, rate, payment, lumpSum = 0) {
  const r = rate / 12
  let bal = Math.max(balance - lumpSum, 0)
  const pts = []
  for (let mo = 0; mo <= 120; mo++) {
    pts.push({ month: mo, balance: Math.round(Math.max(bal, 0)) })
    if (bal <= 0) break
    bal -= Math.max(payment - bal * r, 0)
  }
  return pts
}

function monthsToPayoff(balance, rate, payment, lumpSum = 0) {
  const r = rate / 12
  let bal = Math.max(balance - lumpSum, 0)
  for (let mo = 1; mo <= 1200; mo++) {
    bal -= Math.max(payment - bal * r, 0)
    if (bal <= 0) return mo
  }
  return null
}

export default function Overview({ data }) {
  const { net_worth, cash_flow, retirement, debts, profile, spending_categories, networth_history, rsu, action_items } = data
  const [lumpSum, setLumpSum] = useState(40000)
  const [saving, setSaving] = useState(false)
  const [savedMsg, setSavedMsg] = useState('')

  const assetData = [
    { name: 'Home',       value: net_worth.assets.home,        color: '#6366f1' },
    { name: 'Retirement', value: net_worth.assets.retirement,   color: '#22c55e' },
    { name: 'Cash',       value: net_worth.assets.cash,         color: '#3b82f6' },
    { name: '529',        value: net_worth.assets.college_529,  color: '#f59e0b' },
  ].filter(d => d.value > 0)

  const liabData = [
    { name: 'Mortgage', value: debts.mortgage.balance, color: '#ef4444' },
    { name: 'HELOC',    value: debts.heloc.balance,    color: '#f97316' },
    { name: 'Car',      value: debts.car.balance,      color: '#eab308' },
  ].filter(d => d.value > 0)

  // Spending categories chart data
  const spendData = Object.entries(spending_categories || {})
    .map(([k, v]) => ({ name: SPEND_LABELS[k] || k, value: v, color: SPEND_COLORS[k] || '#6b7280' }))
    .sort((a, b) => b.value - a.value)

  // HELOC curves
  const { balance, rate, monthly_payment: payment } = debts.heloc
  const baseCurve = useMemo(() => helocCurve(balance, rate, payment, 0), [balance, rate, payment])
  const lumpCurve = useMemo(() => helocCurve(balance, rate, payment, lumpSum), [balance, rate, payment, lumpSum])
  const baseMonths = useMemo(() => monthsToPayoff(balance, rate, payment, 0), [balance, rate, payment])
  const lumpMonths = useMemo(() => monthsToPayoff(balance, rate, payment, lumpSum), [balance, rate, payment, lumpSum])
  const monthsSaved = baseMonths && lumpMonths ? baseMonths - lumpMonths : null

  const maxLen = Math.max(baseCurve.length, lumpCurve.length)
  const helocChartData = Array.from({ length: maxLen }, (_, i) => ({
    month: i,
    base: baseCurve[i]?.balance ?? 0,
    lump: lumpCurve[i]?.balance ?? 0,
  }))

  // Net worth history
  const nwHistory = (networth_history || []).map(e => ({
    ...e,
    label: e.date.slice(0, 7),
    value: e.net_worth,
  }))

  const handleSnapshot = async () => {
    setSaving(true)
    try {
      const r = await saveNetworthSnapshot()
      setSavedMsg(`Saved $${r.net_worth.toLocaleString()} on ${r.date}`)
    } catch (e) {
      setSavedMsg('Failed to save')
    } finally {
      setSaving(false)
    }
  }

  // Action items are loaded from the action_items array in data/profile.json.
  // Each item can be a string or { text, urgent } object.
  const actions = (action_items || []).map(item =>
    typeof item === 'string' ? { text: item, urgent: false } : item
  )

  return (
    <div className="space-y-6">
      {/* Net worth hero */}
      <div className="bg-gradient-to-br from-indigo-950 to-gray-900 rounded-xl p-6 border border-indigo-800/30">
        <p className="text-xs font-medium uppercase tracking-wider text-indigo-400 mb-2">Household Net Worth</p>
        <p className="text-5xl font-bold text-white tabular-nums">{fmt(net_worth.total)}</p>
        <div className="flex gap-6 mt-3 text-sm">
          <span className="text-green-400">Assets {fmt(net_worth.total + Object.values(net_worth.liabilities).reduce((a, b) => a + b, 0))}</span>
          <span className="text-red-400">Liabilities {fmt(Object.values(net_worth.liabilities).reduce((a, b) => a + b, 0))}</span>
        </div>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard
          label="Monthly Surplus"
          value={`$${cash_flow.monthly_surplus.toLocaleString()}`}
          sub={`$${cash_flow.monthly_income.toLocaleString()} in · $${(cash_flow.monthly_expenses + cash_flow.monthly_childcare).toLocaleString()} out (incl. childcare)`}
          accent="text-green-400"
        />
        <StatCard
          label="Retirement at 70"
          value={fmt(retirement.total)}
          sub={`$${Math.round(retirement.monthly_income).toLocaleString()}/mo tax-free`}
          accent="text-indigo-400"
        />
        <StatCard
          label="Home Equity"
          value={fmt(debts.home_equity)}
          sub={`${debts.home_equity_pct}% equity · ${debts.ltv}% LTV`}
        />
        <StatCard
          label="HELOC Balance"
          value={fmt(debts.heloc.balance)}
          sub={`8% variable · $${debts.heloc.annual_interest.toLocaleString()}/yr interest`}
          accent="text-orange-400"
        />
      </div>

      {/* Net worth history */}
      <div className="bg-gray-800/70 rounded-xl p-5 border border-gray-700/60">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-sm font-semibold text-white">Net Worth Over Time</h3>
            <p className="text-gray-500 text-xs mt-0.5">Historical entries are estimated — click to save today's snapshot</p>
          </div>
          <button
            onClick={handleSnapshot}
            disabled={saving}
            className="text-xs px-3 py-1.5 bg-indigo-700 hover:bg-indigo-600 text-white rounded-lg transition-colors disabled:opacity-50"
          >
            {saving ? 'Saving…' : 'Save snapshot'}
          </button>
        </div>
        {savedMsg && <p className="text-green-400 text-xs mb-3">{savedMsg}</p>}
        <ResponsiveContainer width="100%" height={180}>
          <AreaChart data={nwHistory}>
            <XAxis dataKey="label" tick={{ fill: '#9ca3af', fontSize: 11 }} />
            <YAxis tickFormatter={fmtK} tick={{ fill: '#9ca3af', fontSize: 11 }} />
            <Tooltip
              formatter={(v) => [fmt(v), 'Net Worth']}
              contentStyle={{ background: '#1f2937', border: 'none', borderRadius: 8 }}
              labelStyle={{ color: '#f9fafb' }}
              itemStyle={{ color: '#f9fafb' }}
            />
            <Area type="monotone" dataKey="value" stroke="#6366f1" fill="#312e81" strokeWidth={2} />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {/* Assets + Liabilities charts */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-gray-800/70 rounded-xl p-5 border border-gray-700/60">
          <h3 className="text-sm font-semibold text-white mb-4">Assets</h3>
          <ResponsiveContainer width="100%" height={180}>
            <BarChart data={assetData} layout="vertical">
              <XAxis type="number" tickFormatter={fmtK} tick={{ fill: '#9ca3af', fontSize: 11 }} />
              <YAxis type="category" dataKey="name" tick={{ fill: '#9ca3af', fontSize: 12 }} width={70} />
              <Tooltip formatter={(v) => fmt(v)} contentStyle={{ background: '#1f2937', border: 'none', borderRadius: 8 }} labelStyle={{ color: '#f9fafb' }} itemStyle={{ color: '#f9fafb' }} />
              <Bar dataKey="value" radius={4}>
                {assetData.map((d, i) => <Cell key={i} fill={d.color} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="bg-gray-800/70 rounded-xl p-5 border border-gray-700/60">
          <h3 className="text-sm font-semibold text-white mb-4">Liabilities</h3>
          <ResponsiveContainer width="100%" height={180}>
            <BarChart data={liabData} layout="vertical">
              <XAxis type="number" tickFormatter={fmtK} tick={{ fill: '#9ca3af', fontSize: 11 }} />
              <YAxis type="category" dataKey="name" tick={{ fill: '#9ca3af', fontSize: 12 }} width={70} />
              <Tooltip formatter={(v) => fmt(v)} contentStyle={{ background: '#1f2937', border: 'none', borderRadius: 8 }} labelStyle={{ color: '#f9fafb' }} itemStyle={{ color: '#f9fafb' }} />
              <Bar dataKey="value" radius={4}>
                {liabData.map((d, i) => <Cell key={i} fill={d.color} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Cash flow breakdown */}
      {spendData.length > 0 && (
        <div className="bg-gray-800/70 rounded-xl p-5 border border-gray-700/60">
          <h3 className="text-sm font-semibold text-white mb-1">Monthly Outflows</h3>
          <p className="text-gray-500 text-xs mb-4">Populated from monthly_spending_categories in data/profile.json</p>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={spendData} layout="vertical">
              <XAxis type="number" tickFormatter={v => `$${v.toLocaleString()}`} tick={{ fill: '#9ca3af', fontSize: 11 }} />
              <YAxis type="category" dataKey="name" tick={{ fill: '#9ca3af', fontSize: 11 }} width={90} />
              <Tooltip formatter={(v) => [`$${v.toLocaleString()}`, 'Monthly']} contentStyle={{ background: '#1f2937', border: 'none', borderRadius: 8 }} labelStyle={{ color: '#f9fafb' }} itemStyle={{ color: '#f9fafb' }} />
              <Bar dataKey="value" radius={4}>
                {spendData.map((d, i) => <Cell key={i} fill={d.color} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* RSU tracker */}
      {rsu && (
        <div className="bg-gray-800/70 rounded-xl p-5 border border-gray-700/60">
          <h3 className="text-sm font-semibold text-white mb-3">{rsu.ticker ? `${rsu.ticker} ` : ''}RSU Tracker</h3>
          <div className="grid grid-cols-3 gap-4 text-sm">
            <div>
              <p className="text-gray-400">Next vest</p>
              <p className="text-white font-medium">{rsu.next_vest_year} ({rsu.years_to_vest}y away)</p>
            </div>
            <div>
              <p className="text-gray-400">Unvested shares</p>
              <p className="text-white font-medium">{rsu.total_unvested_shares.toLocaleString()} shares</p>
            </div>
            <div>
              <p className="text-gray-400">Grant value/yr</p>
              <p className="text-white font-medium">${rsu.annual_grant_value.toLocaleString()}</p>
            </div>
          </div>
          {rsu.price ? (
            <p className="text-green-400 text-sm mt-3">
              Projected vest value: {fmt(rsu.projected_vest_value)} at ${rsu.price}/share
            </p>
          ) : (
            <p className="text-gray-500 text-xs mt-3">
              Set <code className="bg-gray-700 px-1 rounded">price_per_share</code> in data/portfolio.json to see projected vest value
            </p>
          )}
          <p className="text-gray-500 text-xs mt-1">Taxed as ordinary income at vest — consider selling promptly to avoid single-stock concentration risk</p>
        </div>
      )}

      {/* HELOC paydown */}
      <div className="bg-gray-800/70 rounded-xl p-5 border border-gray-700/60">
        <div className="flex items-start justify-between mb-1">
          <h3 className="text-sm font-semibold text-white">HELOC Paydown</h3>
          {monthsSaved !== null && (
            <span className="text-green-400 text-xs font-medium">
              Saves {Math.floor(monthsSaved / 12)}y {monthsSaved % 12}mo
            </span>
          )}
        </div>
        <p className="text-gray-500 text-xs mb-4">
          At ${payment.toLocaleString()}/mo: payoff in {baseMonths ? `${Math.floor(baseMonths/12)}y ${baseMonths%12}mo` : '—'} ·
          With lump sum: {lumpMonths ? `${Math.floor(lumpMonths/12)}y ${lumpMonths%12}mo` : '—'}
        </p>
        <ResponsiveContainer width="100%" height={200}>
          <LineChart data={helocChartData}>
            <XAxis dataKey="month" tickFormatter={m => `${Math.floor(m/12)}y`} tick={{ fill: '#9ca3af', fontSize: 11 }} />
            <YAxis tickFormatter={fmtK} tick={{ fill: '#9ca3af', fontSize: 11 }} />
            <Tooltip
              formatter={(v, name) => [fmt(v), name === 'base' ? 'Current pace' : `With $${lumpSum.toLocaleString()} lump sum`]}
              labelFormatter={m => `Month ${m}`}
              contentStyle={{ background: '#1f2937', border: 'none', borderRadius: 8 }}
              labelStyle={{ color: '#f9fafb' }}
              itemStyle={{ color: '#f9fafb' }}
            />
            <Legend formatter={n => n === 'base' ? 'Current pace' : `With $${lumpSum.toLocaleString()} lump sum`} wrapperStyle={{ fontSize: 11, color: '#9ca3af' }} />
            <Line type="monotone" dataKey="base" stroke="#f97316" strokeWidth={2} dot={false} />
            <Line type="monotone" dataKey="lump" stroke="#22c55e" strokeWidth={2} dot={false} strokeDasharray="5 3" />
          </LineChart>
        </ResponsiveContainer>
        <div className="mt-4">
          <div className="flex justify-between text-sm mb-1">
            <span className="text-gray-400">Bonus lump sum payment</span>
            <span className="text-white font-medium">${lumpSum.toLocaleString()}</span>
          </div>
          <input
            type="range" min={0} max={80000} step={1000} value={lumpSum}
            onChange={e => setLumpSum(Number(e.target.value))}
            className="w-full accent-green-500"
          />
          <div className="flex justify-between text-xs text-gray-600 mt-0.5">
            <span>$0</span><span>$80k</span>
          </div>
        </div>
      </div>

      {/* Action items */}
      <div className="bg-gray-800/70 rounded-xl p-5 border border-gray-700/60">
        <h3 className="text-sm font-semibold text-white mb-3">Action Items</h3>
        <ul className="space-y-3">
          {actions.map((a, i) => (
            <li key={i} className="flex items-start gap-3 text-sm">
              <span className={`mt-1.5 w-1.5 h-1.5 rounded-full flex-shrink-0 ${a.urgent ? 'bg-red-400' : 'bg-gray-600'}`} />
              <span className={a.urgent ? 'text-gray-200' : 'text-gray-400'}>{a.text}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}
