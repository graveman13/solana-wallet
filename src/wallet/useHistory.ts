import { useCallback, useEffect, useState } from 'react'
import { useConnection, useWallet } from '@solana/wallet-adapter-react'

export type HistoryItem = {
  signature: string
  slot: number
  blockTime: number | null
  err: unknown
}

export function useHistory(limit = 10) {
  const { connection } = useConnection()
  const { publicKey } = useWallet()
  const [items, setItems] = useState<HistoryItem[]>([])
  const [loading, setLoading] = useState(false)

  const refresh = useCallback(async () => {
    if (!publicKey) {
      setItems([])
      return
    }
    setLoading(true)
    try {
      const sigs = await connection.getSignaturesForAddress(publicKey, { limit })
      setItems(
        sigs.map((s) => ({
          signature: s.signature,
          slot: s.slot,
          blockTime: s.blockTime ?? null,
          err: s.err,
        })),
      )
    } finally {
      setLoading(false)
    }
  }, [connection, publicKey, limit])

  useEffect(() => {
    refresh()
  }, [refresh])

  return { items, loading, refresh }
}
