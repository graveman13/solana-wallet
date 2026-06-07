import { useBalances, shortAddr } from '../wallet/useBalances'

export function Balances() {
  const { sol, tokens, loading, error, refresh } = useBalances()

  return (
    <section className="panel">
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}
      >
        <h3>Balances</h3>
        <button className="btn btn-ghost" onClick={refresh} disabled={loading}>
          {loading ? '…' : 'Refresh'}
        </button>
      </div>

      <div className="col">
        <div className="token">
          <div>
            <div>SOL</div>
            <div className="mint">Native</div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div>{sol === null ? '—' : sol.toFixed(6)}</div>
            <div className="mint">SOL</div>
          </div>
        </div>

        <div className="tokens">
          {tokens.length === 0 && !loading && (
            <div className="muted">No SPL tokens with balance.</div>
          )}
          {tokens.map((t) => (
            <div key={t.ata} className="token">
              <div>
                <div>{shortAddr(t.mint, 6)}</div>
                <div className="mint">ATA {shortAddr(t.ata, 6)}</div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div>{t.amount}</div>
                <div className="mint">dec {t.decimals}</div>
              </div>
            </div>
          ))}
        </div>

        {error && <div className="error">{error}</div>}
      </div>
    </section>
  )
}
