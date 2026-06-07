import { WalletMultiButton } from '@solana/wallet-adapter-react-ui'
import { useWallet } from '@solana/wallet-adapter-react'
import { useBalances, shortAddr } from '../wallet/useBalances'
import { useAuth } from '../wallet/useAuth'

export function Header() {
  const { connected } = useWallet()
  const { sol, address } = useBalances()
  const { isAuthed, signIn, signOut, signing, error } = useAuth()

  return (
    <header className="header">
      <div className="brand">
        <span className="brand-dot" />
        solpump<span style={{ color: 'var(--muted)' }}>.clone</span>
      </div>
      <div className="header-right">
        {connected && address && (
          <div className="balance-pill" title={address}>
            <span>{shortAddr(address)}</span>
            <span>·</span>
            <b>{sol === null ? '—' : sol.toFixed(4)} SOL</b>
          </div>
        )}
        {connected &&
          (isAuthed ? (
            <button className="btn btn-ghost" onClick={signOut}>
              Sign out
            </button>
          ) : (
            <button
              className="btn btn-primary"
              onClick={signIn}
              disabled={signing}
              title={error ?? ''}
            >
              {signing ? 'Signing…' : 'Sign in'}
            </button>
          ))}
        <WalletMultiButton />
      </div>
    </header>
  )
}
