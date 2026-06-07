import { useState } from 'react'
import { useWallet } from '@solana/wallet-adapter-react'
import { useTransfer } from '../wallet/useTransfer'
import { parsePubkey } from '../wallet/useBalances'

type Tab = 'sol' | 'spl'

const EXPLORER = (sig: string) =>
  `https://solscan.io/tx/${sig}?cluster=${import.meta.env.VITE_SOLANA_NETWORK ?? 'devnet'}`

export function Transfer() {
  const { connected } = useWallet()
  const [tab, setTab] = useState<Tab>('sol')
  const [to, setTo] = useState('')
  const [amount, setAmount] = useState('')
  const [mint, setMint] = useState('')
  const { status, sendSol, sendSplToken, reset } = useTransfer()

  const busy =
    status.kind === 'building' ||
    status.kind === 'awaiting-signature' ||
    status.kind === 'submitting' ||
    status.kind === 'confirming'

  const validRecipient = !!parsePubkey(to)
  const validMint = tab === 'sol' ? true : !!parsePubkey(mint)
  const amountNum = Number(amount)
  const validAmount = !Number.isNaN(amountNum) && amountNum > 0
  const canSubmit = connected && validRecipient && validMint && validAmount && !busy

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!canSubmit) return
    if (tab === 'sol') await sendSol(to, amountNum)
    else await sendSplToken(mint, to, amountNum)
  }

  return (
    <section className="panel">
      <h3>Send</h3>

      <div className="tabs">
        <button
          className={`tab ${tab === 'sol' ? 'active' : ''}`}
          onClick={() => {
            setTab('sol')
            reset()
          }}
        >
          SOL
        </button>
        <button
          className={`tab ${tab === 'spl' ? 'active' : ''}`}
          onClick={() => {
            setTab('spl')
            reset()
          }}
        >
          SPL Token
        </button>
      </div>

      <form className="col" onSubmit={submit}>
        {tab === 'spl' && (
          <div>
            <label>Mint address</label>
            <input
              value={mint}
              onChange={(e) => setMint(e.target.value)}
              placeholder="So111…"
              spellCheck={false}
            />
          </div>
        )}

        <div>
          <label>Recipient</label>
          <input
            value={to}
            onChange={(e) => setTo(e.target.value)}
            placeholder="Recipient public key"
            spellCheck={false}
          />
        </div>

        <div>
          <label>Amount</label>
          <input
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="0.0"
            inputMode="decimal"
          />
        </div>

        <button className="btn btn-primary" type="submit" disabled={!canSubmit}>
          {busy ? labelFor(status.kind) : `Send ${tab === 'sol' ? 'SOL' : 'token'}`}
        </button>

        {status.kind === 'error' && <div className="error">{status.message}</div>}
        {status.kind === 'success' && (
          <div className="success">
            ✓ Confirmed.{' '}
            <a href={EXPLORER(status.signature)} target="_blank" rel="noreferrer">
              View on Solscan
            </a>
          </div>
        )}
        {status.kind === 'confirming' && (
          <div className="muted">
            Confirming…{' '}
            <a href={EXPLORER(status.signature)} target="_blank" rel="noreferrer">
              {status.signature.slice(0, 12)}…
            </a>
          </div>
        )}
      </form>
    </section>
  )
}

function labelFor(k: string) {
  switch (k) {
    case 'building':
      return 'Building…'
    case 'awaiting-signature':
      return 'Confirm in wallet…'
    case 'submitting':
      return 'Submitting…'
    case 'confirming':
      return 'Confirming…'
    default:
      return 'Sending…'
  }
}
