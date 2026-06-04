import { useState, useEffect } from 'react'
import { getSummary } from './api'
import Overview from './tabs/Overview'
import Retirement from './tabs/Retirement'
import College from './tabs/College'
import Debts from './tabs/Debts'
import Bonus from './tabs/Bonus'
import Portfolio from './tabs/Portfolio'

const TABS = [
  { key: 'overview',   label: 'Overview' },
  { key: 'retirement', label: 'Retirement' },
  { key: 'college',    label: 'College' },
  { key: 'debts',      label: 'Debts' },
  { key: 'bonus',      label: 'Bonus Allocator' },
  { key: 'portfolio',  label: 'Portfolio' },
]

const fmt = (n) => n >= 1e6
  ? `$${(n / 1e6).toFixed(2)}M`
  : `$${Math.round(n).toLocaleString()}`

const today = new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })

export default function App() {
  const [activeTab, setActiveTab] = useState('overview')
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    getSummary()
      .then(setData)
      .catch(err => setError(err.message))
  }, [])

  if (error) {
    return (
      <div className="min-h-screen bg-[#0d1117] flex items-center justify-center">
        <div className="text-center">
          <p className="text-red-400 font-medium mb-2">Failed to load financial data</p>
          <p className="text-gray-500 text-sm">{error}</p>
          <p className="text-gray-600 text-xs mt-3">
            Start the backend: <code className="bg-gray-800 px-1.5 py-0.5 rounded text-gray-300">uvicorn main:app --reload</code>
          </p>
        </div>
      </div>
    )
  }

  if (!data) {
    return (
      <div className="min-h-screen bg-[#0d1117] flex items-center justify-center">
        <p className="text-gray-500 text-sm">Loading…</p>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#0d1117] text-white">
      <header className="sticky top-0 z-10 border-b border-gray-800 bg-[#0d1117]/90 backdrop-blur-sm px-6 py-3.5">
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <div>
            <h1 className="text-sm font-semibold text-white tracking-tight">
              {data.profile.name} &amp; {data.profile.spouse}
            </h1>
            <p className="text-xs text-gray-500 mt-0.5">Personal Finance Dashboard</p>
          </div>
          <div className="text-right">
            <p className="text-sm font-semibold text-indigo-400 tabular-nums">{fmt(data.net_worth.total)}</p>
            <p className="text-xs text-gray-500 mt-0.5">{today}</p>
          </div>
        </div>
      </header>

      <nav className="border-b border-gray-800 px-6">
        <div className="max-w-5xl mx-auto flex">
          {TABS.map(tab => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`relative px-4 py-3 text-sm font-medium transition-colors ${
                activeTab === tab.key
                  ? 'text-white'
                  : 'text-gray-500 hover:text-gray-300'
              }`}
            >
              {tab.label}
              {activeTab === tab.key && (
                <span className="absolute bottom-0 left-2 right-2 h-0.5 bg-indigo-500 rounded-t-full" />
              )}
            </button>
          ))}
        </div>
      </nav>

      <main className="max-w-5xl mx-auto px-6 py-6">
        {activeTab === 'overview'   && <Overview   data={data} />}
        {activeTab === 'retirement' && <Retirement data={data} />}
        {activeTab === 'college'    && <College    data={data} />}
        {activeTab === 'debts'      && <Debts      data={data} />}
        {activeTab === 'bonus'      && <Bonus      data={data} />}
        {activeTab === 'portfolio'  && <Portfolio  data={data} />}
      </main>
    </div>
  )
}
