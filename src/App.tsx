import { useWallet } from '@solana/wallet-adapter-react'
import { WalletMultiButton } from '@solana/wallet-adapter-react-ui'
import './App.css'
import { Header } from './components/Header'
import { Balances } from './components/Balances'
import { Transfer } from './components/Transfer'
import { History } from './components/History'
import { useAuth } from './wallet/useAuth'

function App() {
  const { connected } = useWallet()
  const { isAuthed } = useAuth()

  return (
    <div className="app">
      <Header />

      {!connected ? (
        <div className="hero">
          <h1>Connect your Solana wallet</h1>
          <p>
            Phantom, Solflare, Trust, Ledger or Torus. After connecting, sign a
            message to start a session and use the on-chain deposit / withdraw
            tools.
          </p>
          <div style={{ marginTop: 24, display: 'inline-block' }}>
            <WalletMultiButton />
          </div>
        </div>
      ) : (
        <>
          {!isAuthed && (
            <div className="panel" style={{ marginTop: 18 }}>
              <div className="muted">
                You are connected but not signed in. Click <b>Sign in</b> in the
                header to authenticate via wallet signature — required by many
                solpump-style apps before any deposit / withdraw action.
              </div>
            </div>
          )}
          <div className="grid">
            <div className="col">
              <Balances />
              <History />
            </div>
            <Transfer />
          </div>
        </>
      )}
    </div>
  )
}

export default App
