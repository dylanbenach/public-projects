import { useMemo } from 'react'
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend } from 'recharts'

const fmt = (n) => n >= 1e6 ? `$${(n / 1e6).toFixed(2)}M` : `$${Math.round(n).toLocaleString()}`
const fmtK = (n) => n >= 1e6 ? `$${(n / 1e6).toFixed(1)}M` : `$${(n / 1000).toFixed(0)}k`

function amortize(balance, annualRate, monthlyPayment, maxMonths = 600) {
  const r = annualRate / 12
  const points = []
  let bal = balance
  let totalInterest = 0
  for (let mo = 0; mo <= maxMonths; mo++) {
    points.push({ month: mo, balance: Math.round(Math.max(bal, 0)) })
    if (bal <= 0) break
    const interest = bal * r
    totalInterest += interest
    bal -= Math.max(monthlyPayment - interest, 0)
  }
  return { points, totalInterest: Math.round(totalInterest) }
}

function monthsToPayoff(balance, annualRate, monthlyPayment) {
  const r = annualRate / 12
  let bal = balance
  for (let mo = 1; mo <= 1200; mo++) {
    bal -= Math.max(monthlyPayment - bal * r, 0)
    if (bal <= 0) return mo
  }
  return null
}

function payoffDate(months) {
  if (!months) return 'Never at current pace'
  const d = new Date()
  d.setMonth(d.getMonth() + months)
  return d.toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
}

function DebtCard({ label, balance, rate, payment, months, totalInterest, color }) {
  return (
    <div className="bg-gray-800/70 rounded-xl p-5 space-y-3 border border-gray-700/60">
      <div className="flex justify-between items-start">
        <h3 className="text-white font-medium">{label}</h3>
        <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: color + '33', color }}>
          {(rate * 100).toFixed(1)}%
        </span>
      </div>
      <p className="text-2xl font-bold text-white">{fmt(balance)}</p>
      <div className="space-y-1 text-sm">
        <div className="flex justify-between">
          <span className="text-gray-400">Monthly payment</span>
          <span className="text-white">${Math.round(payment).toLocaleString()}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-gray-400">Payoff</span>
          <span className="text-white">{payoffDate(months)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-gray-400">Total interest remaining</span>
          <span className="text-orange-400">{fmt(totalInterest)}</span>
        </div>
      </div>
    </div>
  )
}

export default function Debts({ data }) {
  const { debts } = data

  const mortgage = useMemo(() => amortize(debts.mortgage.balance, debts.mortgage.rate, debts.mortgage.monthly_payment, 400), [debts])
  const heloc    = useMemo(() => amortize(debts.heloc.balance,    debts.heloc.rate,    debts.heloc.monthly_payment,    240), [debts])
  const car      = useMemo(() => amortize(debts.car.balance,      debts.car.rate,      debts.car.monthly_payment,       84), [debts])

  const mortgageMonths = useMemo(() => monthsToPayoff(debts.mortgage.balance, debts.mortgage.rate, debts.mortgage.monthly_payment), [debts])
  const helocMonths    = useMemo(() => monthsToPayoff(debts.heloc.balance,    debts.heloc.rate,    debts.heloc.monthly_payment),    [debts])
  const carMonths      = useMemo(() => monthsToPayoff(debts.car.balance,      debts.car.rate,      debts.car.monthly_payment),      [debts])

  const totalDebt = debts.mortgage.balance + debts.heloc.balance + debts.car.balance
  const totalMonthly = debts.mortgage.monthly_payment + debts.heloc.monthly_payment + debts.car.monthly_payment
  const totalInterest = mortgage.totalInterest + heloc.totalInterest + car.totalInterest

  // Normalise curves to years for the combined chart
  const maxYears = 15
  const combined = Array.from({ length: maxYears * 12 + 1 }, (_, mo) => ({
    month: mo,
    mortgage: mortgage.points[mo]?.balance ?? 0,
    heloc: heloc.points[mo]?.balance ?? 0,
    car: car.points[mo]?.balance ?? 0,
  })).filter((_, i) => i % 12 === 0) // annual points only
    .map(d => ({ ...d, year: Math.floor(d.month / 12) }))

  return (
    <div className="space-y-6">
      {/* Summary row */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-gray-800/70 rounded-xl p-5 border border-gray-700/60">
          <p className="text-xs font-medium uppercase tracking-wider text-gray-500 mb-2">Total Debt</p>
          <p className="text-2xl font-bold tabular-nums text-red-400">{fmt(totalDebt)}</p>
        </div>
        <div className="bg-gray-800/70 rounded-xl p-5 border border-gray-700/60">
          <p className="text-xs font-medium uppercase tracking-wider text-gray-500 mb-2">Monthly Payments</p>
          <p className="text-2xl font-bold tabular-nums text-white">${Math.round(totalMonthly).toLocaleString()}</p>
        </div>
        <div className="bg-gray-800/70 rounded-xl p-5 border border-gray-700/60">
          <p className="text-xs font-medium uppercase tracking-wider text-gray-500 mb-2">Total Interest Remaining</p>
          <p className="text-2xl font-bold tabular-nums text-orange-400">{fmt(totalInterest)}</p>
        </div>
      </div>

      {/* Debt cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <DebtCard
          label="First Mortgage"
          balance={debts.mortgage.balance}
          rate={debts.mortgage.rate}
          payment={debts.mortgage.monthly_payment}
          months={mortgageMonths}
          totalInterest={mortgage.totalInterest}
          color="#ef4444"
        />
        <DebtCard
          label="Tower FCU HELOC"
          balance={debts.heloc.balance}
          rate={debts.heloc.rate}
          payment={debts.heloc.monthly_payment}
          months={helocMonths}
          totalInterest={heloc.totalInterest}
          color="#f97316"
        />
        <DebtCard
          label="Car Loan"
          balance={debts.car.balance}
          rate={debts.car.rate}
          payment={debts.car.monthly_payment}
          months={carMonths}
          totalInterest={car.totalInterest}
          color="#eab308"
        />
      </div>

      {/* Combined paydown chart */}
      <div className="bg-gray-800/70 rounded-xl p-5 border border-gray-700/60">
        <h3 className="text-sm font-semibold text-white mb-1">All Debts — Paydown Over Time</h3>
        <p className="text-gray-500 text-xs mb-4">Car pays off ~{payoffDate(carMonths)} · HELOC ~{payoffDate(helocMonths)} · Mortgage ~{payoffDate(mortgageMonths)}</p>
        <ResponsiveContainer width="100%" height={240}>
          <LineChart data={combined}>
            <XAxis dataKey="year" tickFormatter={y => `yr ${y}`} tick={{ fill: '#9ca3af', fontSize: 11 }} />
            <YAxis tickFormatter={fmtK} tick={{ fill: '#9ca3af', fontSize: 11 }} />
            <Tooltip
              formatter={(v, name) => [fmt(v), { mortgage: 'Mortgage', heloc: 'HELOC', car: 'Car' }[name]]}
              labelFormatter={y => `Year ${y}`}
              contentStyle={{ background: '#1f2937', border: 'none', borderRadius: 8 }}
              labelStyle={{ color: '#f9fafb' }}
              itemStyle={{ color: '#f9fafb' }}
            />
            <Legend formatter={n => ({ mortgage: 'Mortgage', heloc: 'HELOC', car: 'Car' }[n])} wrapperStyle={{ fontSize: 11, color: '#9ca3af' }} />
            <Line type="monotone" dataKey="mortgage" stroke="#ef4444" strokeWidth={2} dot={false} />
            <Line type="monotone" dataKey="heloc"    stroke="#f97316" strokeWidth={2} dot={false} />
            <Line type="monotone" dataKey="car"      stroke="#eab308" strokeWidth={2} dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* Key insight */}
      <div className="bg-gray-800/70 rounded-xl p-5 text-sm space-y-2 border border-gray-700/60">
        <h3 className="text-sm font-semibold text-white">Key Insight</h3>
        <p className="text-gray-400">
          The car pays off in <span className="text-white">{carMonths ? `${Math.floor(carMonths/12)}y ${carMonths%12}mo` : '—'}</span>, freeing up <span className="text-green-400">${Math.round(debts.car.monthly_payment).toLocaleString()}/mo</span>.
          Redirect that to the HELOC and payoff moves to <span className="text-white">{(() => { const m = monthsToPayoff(debts.heloc.balance, debts.heloc.rate, debts.heloc.monthly_payment + debts.car.monthly_payment); return m ? `${Math.floor(m/12)}y ${m%12}mo` : '—' })()}</span> after the car is gone.
        </p>
        <p className="text-gray-400">
          Mortgage at <span className="text-green-400">3.5% fixed</span> — do not refinance or pay down early. That rate is irreplaceable.
        </p>
      </div>
    </div>
  )
}
