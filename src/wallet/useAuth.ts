import { useCallback, useEffect, useState } from 'react'
import { useWallet } from '@solana/wallet-adapter-react'
import bs58 from 'bs58'
import nacl from 'tweetnacl'

const STORAGE_KEY = 'solpump-clone:auth'

export type AuthSession = {
  address: string
  nonce: string
  signature: string
  signedAt: number
}

function loadSession(): AuthSession | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? (JSON.parse(raw) as AuthSession) : null
  } catch {
    return null
  }
}

function buildMessage(nonce: string, address: string) {
  return (
    `solpump-clone wants you to sign in with your Solana account:\n` +
    `${address}\n\n` +
    `Nonce: ${nonce}\n` +
    `Issued At: ${new Date().toISOString()}`
  )
}

function randomNonce() {
  const bytes = nacl.randomBytes(16)
  return bs58.encode(bytes)
}

export function useAuth() {
  const { publicKey, signMessage, connected, disconnect } = useWallet()
  const [session, setSession] = useState<AuthSession | null>(loadSession)
  const [error, setError] = useState<string | null>(null)
  const [signing, setSigning] = useState(false)

  useEffect(() => {
    if (!connected && session) {
      localStorage.removeItem(STORAGE_KEY)
      setSession(null)
    }
    if (connected && publicKey && session && session.address !== publicKey.toBase58()) {
      localStorage.removeItem(STORAGE_KEY)
      setSession(null)
    }
  }, [connected, publicKey, session])

  const signIn = useCallback(async () => {
    if (!publicKey || !signMessage) {
      setError('Wallet does not support message signing')
      return null
    }
    setError(null)
    setSigning(true)
    try {
      const address = publicKey.toBase58()
      const nonce = randomNonce()
      const message = buildMessage(nonce, address)
      const encoded = new TextEncoder().encode(message)
      const sig = await signMessage(encoded)

      const ok = nacl.sign.detached.verify(encoded, sig, publicKey.toBytes())
      if (!ok) throw new Error('Signature verification failed')

      const session: AuthSession = {
        address,
        nonce,
        signature: bs58.encode(sig),
        signedAt: Date.now(),
      }
      localStorage.setItem(STORAGE_KEY, JSON.stringify(session))
      setSession(session)
      return session
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Signing failed')
      return null
    } finally {
      setSigning(false)
    }
  }, [publicKey, signMessage])

  const signOut = useCallback(async () => {
    localStorage.removeItem(STORAGE_KEY)
    setSession(null)
    await disconnect().catch(() => undefined)
  }, [disconnect])

  return { session, signIn, signOut, signing, error, isAuthed: !!session }
}
