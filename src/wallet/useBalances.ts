import { useCallback, useEffect, useState } from 'react'
import { useConnection, useWallet } from '@solana/wallet-adapter-react'
import { LAMPORTS_PER_SOL, PublicKey } from '@solana/web3.js'
import { TOKEN_PROGRAM_ID } from '@solana/spl-token'

export type TokenBalance = {
  mint: string
  amount: number
  decimals: number
  ata: string
}

export function useBalances() {
  const { connection } = useConnection()
  const { publicKey } = useWallet()
  const [sol, setSol] = useState<number | null>(null)
  const [tokens, setTokens] = useState<TokenBalance[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    if (!publicKey) {
      setSol(null)
      setTokens([])
      return
    }
    setLoading(true)
    setError(null)
    try {
      const lamports = await connection.getBalance(publicKey, 'confirmed')
      setSol(lamports / LAMPORTS_PER_SOL)

      const parsed = await connection.getParsedTokenAccountsByOwner(publicKey, {
        programId: TOKEN_PROGRAM_ID,
      })
      const list: TokenBalance[] = parsed.value
        .map((a) => {
          const info = a.account.data.parsed.info
          return {
            mint: info.mint as string,
            amount: Number(info.tokenAmount.uiAmountString ?? 0),
            decimals: info.tokenAmount.decimals as number,
            ata: a.pubkey.toBase58(),
          }
        })
        .filter((t) => t.amount > 0)
      setTokens(list)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load balances')
    } finally {
      setLoading(false)
    }
  }, [connection, publicKey])

  useEffect(() => {
    refresh()
  }, [refresh])

  useEffect(() => {
    if (!publicKey) return
    const id = connection.onAccountChange(
      publicKey,
      () => {
        refresh()
      },
      { commitment: 'confirmed' },
    )
    return () => {
      connection.removeAccountChangeListener(id).catch(() => undefined)
    }
  }, [connection, publicKey, refresh])

  return { sol, tokens, loading, error, refresh, address: publicKey?.toBase58() ?? null }
}

export function shortAddr(a: string, n = 4) {
  return a.length <= n * 2 + 3 ? a : `${a.slice(0, n)}…${a.slice(-n)}`
}

export function parsePubkey(s: string): PublicKey | null {
  try {
    return new PublicKey(s.trim())
  } catch {
    return null
  }
}
