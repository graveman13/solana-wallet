import { useHistory } from '../wallet/useHistory'
import { shortAddr } from '../wallet/useBalances'

const EXPLORER = (sig: string) =>
  `https://solscan.io/tx/${sig}?cluster=${import.meta.env.VITE_SOLANA_NETWORK ?? 'devnet'}`

export function History() {
  const { items, loading, refresh } = useHistory(15)

  return (
    <section className="panel">
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}
      >
        <h3>Recent transactions</h3>
        <button className="btn btn-ghost" onClick={refresh} disabled={loading}>
          {loading ? '…' : 'Refresh'}
        </button>
      </div>

      <div className="history">
        {items.length === 0 && !loading && (
          <div className="muted">No transactions yet.</div>
        )}
        {items.map((t) => (
          <a
            key={t.signature}
            className="hist-row"
            href={EXPLORER(t.signature)}
            target="_blank"
            rel="noreferrer"
            style={{ textDecoration: 'none', color: 'inherit' }}
          >
            <span className="addr">{shortAddr(t.signature, 8)}</span>
            <span className={t.err ? 'err' : 'ok'}>
              {t.err ? 'failed' : 'success'} ·{' '}
              {t.blockTime
                ? new Date(t.blockTime * 1000).toLocaleTimeString()
                : `slot ${t.slot}`}
            </span>
          </a>
        ))}
      </div>
    </section>
  )
}
