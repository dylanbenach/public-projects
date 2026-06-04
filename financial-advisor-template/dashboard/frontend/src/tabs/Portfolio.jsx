const fmt = (n) => n >= 1e6 ? `$${(n / 1e6).toFixed(2)}M` : `$${Math.round(n).toLocaleString()}`

const SECTOR_COLORS = {
  Technology:    '#6366f1',
  Communication: '#3b82f6',
  Healthcare:    '#ec4899',
  Financial:     '#22c55e',
  Consumer:      '#f59e0b',
}

function WatchCard({ ticker, name, sector, price, notes }) {
  const color = SECTOR_COLORS[sector] || '#6b7280'
  return (
    <div className="bg-gray-800/70 rounded-xl p-5 space-y-3 border border-gray-700/60">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-white font-bold text-lg">{ticker}</p>
          <p className="text-gray-400 text-sm">{name}</p>
        </div>
        <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: color + '33', color }}>
          {sector}
        </span>
      </div>
      {price ? (
        <p className="text-2xl font-bold text-white">${price.toLocaleString()}</p>
      ) : (
        <p className="text-gray-600 text-sm italic">Price not set — update in portfolio.json</p>
      )}
      <p className="text-gray-400 text-xs">{notes}</p>
    </div>
  )
}

export default function Portfolio({ data }) {
  const { portfolio_accounts, watchlist } = data

  const accounts = portfolio_accounts ?? []
  const totalBrokerage = accounts.reduce((s, a) => s + (a.total_value || 0), 0)

  return (
    <div className="space-y-6">

      {/* Current holdings */}
      <div className="bg-gray-800/70 rounded-xl p-5 border border-gray-700/60">
        <h3 className="text-sm font-semibold text-white mb-4">Current Holdings</h3>
        <div className="space-y-4">
          {accounts.length === 0 ? (
            <p className="text-gray-500 text-sm">
              No accounts found — add entries to <code className="bg-gray-700 px-1 rounded">data/portfolio.json</code>
            </p>
          ) : (
            accounts.map((acct, i) => (
              <div key={i} className="flex justify-between items-center py-3 border-b border-gray-700 last:border-0">
                <div>
                  <p className="text-white font-medium">
                    {acct.institution || 'Brokerage'} — {acct.account_type?.replace(/_/g, ' ') || 'Account'}
                  </p>
                  {acct.holdings?.length > 0 && (
                    <p className="text-gray-400 text-xs mt-0.5">
                      {acct.holdings.map(h => h.ticker).join(' · ')}
                    </p>
                  )}
                  {acct.monthly_contribution > 0 && (
                    <p className="text-green-400 text-xs mt-0.5">+${acct.monthly_contribution}/mo auto-invest</p>
                  )}
                </div>
                <div className="text-right">
                  <p className="text-white font-bold">{fmt(acct.total_value || 0)}</p>
                </div>
              </div>
            ))
          )}
          <div className="flex justify-between pt-1 text-sm font-medium">
            <span className="text-gray-400">Total invested assets</span>
            <span className="text-white">{fmt(totalBrokerage)}</span>
          </div>
        </div>
      </div>

      {/* Watchlist */}
      {(watchlist?.length > 0) && (
        <>
          <h3 className="text-sm font-semibold text-white">Watchlist</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {watchlist.map(stock => (
              <WatchCard key={stock.ticker} {...stock} />
            ))}
          </div>
          <p className="text-gray-600 text-xs mt-3">
            Update prices in <code className="bg-gray-800 px-1 rounded">data/portfolio.json</code> under the watchlist entries
          </p>
        </>
      )}
    </div>
  )
}
