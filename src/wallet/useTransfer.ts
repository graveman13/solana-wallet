import { useCallback, useState } from 'react'
import { useConnection, useWallet } from '@solana/wallet-adapter-react'
import {
  LAMPORTS_PER_SOL,
  PublicKey,
  SystemProgram,
  Transaction,
} from '@solana/web3.js'
import {
  createAssociatedTokenAccountInstruction,
  createTransferCheckedInstruction,
  getAssociatedTokenAddress,
  getMint,
} from '@solana/spl-token'

export type TransferStatus =
  | { kind: 'idle' }
  | { kind: 'building' }
  | { kind: 'awaiting-signature' }
  | { kind: 'submitting' }
  | { kind: 'confirming'; signature: string }
  | { kind: 'success'; signature: string }
  | { kind: 'error'; message: string }

export function useTransfer() {
  const { connection } = useConnection()
  const { publicKey, sendTransaction } = useWallet()
  const [status, setStatus] = useState<TransferStatus>({ kind: 'idle' })

  const reset = useCallback(() => setStatus({ kind: 'idle' }), [])

  const sendSol = useCallback(
    async (toBase58: string, amountSol: number) => {
      if (!publicKey) return
      try {
        setStatus({ kind: 'building' })
        const to = new PublicKey(toBase58)
        const lamports = Math.round(amountSol * LAMPORTS_PER_SOL)
        const tx = new Transaction().add(
          SystemProgram.transfer({ fromPubkey: publicKey, toPubkey: to, lamports }),
        )
        const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash()
        tx.recentBlockhash = blockhash
        tx.feePayer = publicKey

        setStatus({ kind: 'awaiting-signature' })
        const sig = await sendTransaction(tx, connection)
        setStatus({ kind: 'confirming', signature: sig })
        await connection.confirmTransaction(
          { signature: sig, blockhash, lastValidBlockHeight },
          'confirmed',
        )
        setStatus({ kind: 'success', signature: sig })
      } catch (e) {
        setStatus({
          kind: 'error',
          message: e instanceof Error ? e.message : 'Transfer failed',
        })
      }
    },
    [connection, publicKey, sendTransaction],
  )

  const sendSplToken = useCallback(
    async (mintBase58: string, toBase58: string, uiAmount: number) => {
      if (!publicKey) return
      try {
        setStatus({ kind: 'building' })
        const mint = new PublicKey(mintBase58)
        const to = new PublicKey(toBase58)
        const mintInfo = await getMint(connection, mint)
        const raw = BigInt(Math.round(uiAmount * 10 ** mintInfo.decimals))

        const fromAta = await getAssociatedTokenAddress(mint, publicKey)
        const toAta = await getAssociatedTokenAddress(mint, to)

        const tx = new Transaction()

        const toAtaInfo = await connection.getAccountInfo(toAta)
        if (!toAtaInfo) {
          tx.add(
            createAssociatedTokenAccountInstruction(publicKey, toAta, to, mint),
          )
        }

        tx.add(
          createTransferCheckedInstruction(
            fromAta,
            mint,
            toAta,
            publicKey,
            raw,
            mintInfo.decimals,
          ),
        )

        const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash()
        tx.recentBlockhash = blockhash
        tx.feePayer = publicKey

        setStatus({ kind: 'awaiting-signature' })
        const sig = await sendTransaction(tx, connection)
        setStatus({ kind: 'confirming', signature: sig })
        await connection.confirmTransaction(
          { signature: sig, blockhash, lastValidBlockHeight },
          'confirmed',
        )
        setStatus({ kind: 'success', signature: sig })
      } catch (e) {
        setStatus({
          kind: 'error',
          message: e instanceof Error ? e.message : 'Transfer failed',
        })
      }
    },
    [connection, publicKey, sendTransaction],
  )

  return { status, sendSol, sendSplToken, reset }
}
