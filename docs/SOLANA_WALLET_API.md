# Solana Wallet & Web3 API — довідник

Покриває пакети, що використані в проєкті:

| Пакет | Призначення | Офіційна документація |
|---|---|---|
| `@solana/web3.js` | Низькорівневий клієнт до Solana RPC: акаунти, транзакції, підписи, програми | https://solana-labs.github.io/solana-web3.js/ · https://solana.com/docs/clients/javascript |
| `@solana/wallet-adapter-base` | Базові інтерфейси адаптерів та події | https://github.com/anza-xyz/wallet-adapter/tree/master/packages/core/base |
| `@solana/wallet-adapter-react` | React-провайдери та хуки для гаманця і RPC | https://github.com/anza-xyz/wallet-adapter/tree/master/packages/core/react |
| `@solana/wallet-adapter-react-ui` | Готові React-компоненти UI (кнопки, модалка) | https://github.com/anza-xyz/wallet-adapter/tree/master/packages/ui/react-ui |
| `@solana/wallet-adapter-wallets` | Колекція адаптерів конкретних гаманців (Phantom, Solflare, …) | https://github.com/anza-xyz/wallet-adapter/tree/master/packages/wallets |

Стартова сторінка всього wallet-adapter ecosystem: https://anza-xyz.github.io/wallet-adapter/

---

## 1. `@solana/web3.js`

Док-сайт: https://solana-labs.github.io/solana-web3.js/
Гайд: https://solana.com/docs/clients/javascript

### 1.1 `Connection`
Клієнт до Solana JSON-RPC. Усі читання/запис до мережі йдуть через нього.

```ts
import { Connection, clusterApiUrl } from '@solana/web3.js'
const connection = new Connection(clusterApiUrl('devnet'), 'confirmed')
```

Найужитковіші методи:
- `getBalance(pubkey, commitment?)` — баланс SOL у лампортах (1 SOL = 10⁹). Док: https://solana-labs.github.io/solana-web3.js/classes/Connection.html#getBalance
- `getLatestBlockhash(commitment?)` — свіжий blockhash + `lastValidBlockHeight` для будь-якої транзакції. Док: https://solana.com/docs/rpc/http/getlatestblockhash
- `sendRawTransaction(tx, options?)` / `sendTransaction(tx, signers, options?)` — публікація транзакції в мережу.
- `confirmTransaction({ signature, blockhash, lastValidBlockHeight }, commitment?)` — очікування фіналізації. Док: https://solana-labs.github.io/solana-web3.js/classes/Connection.html#confirmTransaction
- `getAccountInfo(pubkey, commitment?)` — сирі дані акаунту (lamports, owner, data). Док: https://solana-labs.github.io/solana-web3.js/classes/Connection.html#getAccountInfo
- `getParsedTokenAccountsByOwner(owner, filter)` — список SPL-токен-акаунтів власника з парсингом. Док: https://solana.com/docs/rpc/http/gettokenaccountsbyowner
- `getSignaturesForAddress(pubkey, options?)` — історія підписів акаунту (для transaction history). Док: https://solana.com/docs/rpc/http/getsignaturesforaddress
- `getTransaction(signature, options?)` / `getParsedTransaction(...)` — повне тіло конкретної транзакції.
- `onAccountChange(pubkey, callback, options?)` / `removeAccountChangeListener(id)` — websocket-підписка на зміни акаунту (real-time баланс). Док: https://solana-labs.github.io/solana-web3.js/classes/Connection.html#onAccountChange
- `onLogs(filter, callback, commitment?)` — підписка на лог-події програми.
- `requestAirdrop(pubkey, lamports)` — airdrop на devnet/testnet. Док: https://solana.com/docs/rpc/http/requestairdrop

Commitment-рівні: `processed` < `confirmed` < `finalized`. Док: https://solana.com/docs/core/transactions#commitment

### 1.2 `PublicKey`
Іммутабельне представлення публічного ключа (адреси). Док: https://solana-labs.github.io/solana-web3.js/classes/PublicKey.html

```ts
const pk = new PublicKey('Sysvar1111111111111111111111111111111111111')
pk.toBase58(); pk.toBytes(); pk.equals(other)
PublicKey.findProgramAddressSync(seeds, programId) // PDA
```

Корисно для:
- Валідації введеної користувачем адреси (`new PublicKey(s)` кине помилку при некоректному base58).
- Обчислення PDA (Program Derived Address) для програмних акаунтів.

### 1.3 `Keypair`
Локально згенерована пара ключів. У фронтенді з гаманцем користувача — не використовується (гаманець ховає секретний ключ); потрібен лише для серверних утиліт або тестів. Док: https://solana-labs.github.io/solana-web3.js/classes/Keypair.html

```ts
const kp = Keypair.generate()
const fromSecret = Keypair.fromSecretKey(secretUint8)
```

### 1.4 `SystemProgram`
Системна програма Solana — переказ SOL, створення акаунту, перенос власника. Док: https://solana-labs.github.io/solana-web3.js/classes/SystemProgram.html

```ts
SystemProgram.transfer({ fromPubkey, toPubkey, lamports })
SystemProgram.createAccount({ fromPubkey, newAccountPubkey, lamports, space, programId })
```

### 1.5 `Transaction` (legacy) і `VersionedTransaction`
Збираєте інструкції → підписуєте → відправляєте.

- `Transaction` — класична легасі-форма, проста у використанні. Док: https://solana-labs.github.io/solana-web3.js/classes/Transaction.html
- `VersionedTransaction` + `TransactionMessage.compileToV0Message()` — нова форма з Address Lookup Tables (більше акаунтів у одній транзакції). Рекомендована для Jupiter swap і DeFi. Док: https://solana.com/docs/advanced/versions

```ts
const tx = new Transaction().add(SystemProgram.transfer({ ... }))
tx.feePayer = walletPubkey
tx.recentBlockhash = (await connection.getLatestBlockhash()).blockhash
```

Поля транзакції:
- `feePayer` — хто оплачує fee (зазвичай user wallet).
- `recentBlockhash` — необхідний; визначає TTL (~2 хв) і запобігає дублям.
- `instructions[]` — список `TransactionInstruction`.

### 1.6 Константи
- `LAMPORTS_PER_SOL` = `1_000_000_000`. Конвертація: `sol = lamports / LAMPORTS_PER_SOL`.
- `clusterApiUrl('mainnet-beta' | 'devnet' | 'testnet')` — публічні RPC-ендпоінти Solana Labs (рейт-ліміт; для продакшн краще власний RPC: Helius, QuickNode, Triton).

---

## 2. `@solana/wallet-adapter-base`

GitHub: https://github.com/anza-xyz/wallet-adapter/tree/master/packages/core/base

### 2.1 `WalletAdapter` / `BaseWalletAdapter`
Інтерфейс, який реалізує кожен конкретний гаманець (Phantom, Solflare, …). Властивості:
- `name`, `icon`, `url` — метадані для UI.
- `publicKey: PublicKey | null` — поточна адреса.
- `connected: boolean`, `connecting: boolean`.
- `readyState: WalletReadyState` — `Installed | NotDetected | Loadable | Unsupported`.
- Методи: `connect()`, `disconnect()`, `sendTransaction(tx, connection, options?)`.

### 2.2 `SignerWalletAdapter`
Розширення для гаманців, які можуть підписати без негайного відправлення:
- `signTransaction(tx)` — повертає підписану транзакцію.
- `signAllTransactions(txs[])` — пакетний підпис (напр., для Jupiter route + setup).

### 2.3 `MessageSignerWalletAdapter`
Підписання довільного повідомлення (off-chain) — використовується для аутентифікації SIWS:
- `signMessage(message: Uint8Array): Promise<Uint8Array>` — повертає 64-байтний ed25519-підпис.

### 2.4 `WalletAdapterNetwork`
Enum: `Mainnet | Devnet | Testnet`. Використовується разом із `clusterApiUrl(...)`.

### 2.5 Помилки
Усі типізовані: `WalletNotConnectedError`, `WalletConnectionError`, `WalletDisconnectedError`, `WalletSignTransactionError`, `WalletSendTransactionError`, `WalletTimeoutError` і т.п. Зручно ловити в `try/catch` і показувати user-friendly меседж.

### 2.6 Події
`adapter.on('connect' | 'disconnect' | 'error' | 'readyStateChange', handler)` — низькорівнева підписка (у React зазвичай не потрібна, бо `useWallet()` уже це робить).

---

## 3. `@solana/wallet-adapter-react`

GitHub: https://github.com/anza-xyz/wallet-adapter/tree/master/packages/core/react

### 3.1 `<ConnectionProvider endpoint={...} config={...}>`
Контекст для `Connection`. Зазвичай ставиться найвище:

```tsx
<ConnectionProvider endpoint="https://api.devnet.solana.com">
  ...
</ConnectionProvider>
```

`config` — це опції `ConnectionConfig` з `@solana/web3.js` (commitment, websocket endpoint, кастомний fetch).

### 3.2 `<WalletProvider wallets={...} autoConnect localStorageKey="..." onError={...}>`
- `wallets` — масив адаптерів. Сучасні гаманці (Phantom, Solflare, Backpack, OKX, …) тепер реєструються через **Wallet Standard** автоматично, тож масив часто можна тримати порожнім; адаптери залишаються потрібними для Trust/Ledger/Torus і для мобільної логіки.
- `autoConnect` — авто-підключення останнього використаного гаманця з `localStorage`.
- `onError(error, adapter)` — централізована обробка помилок (показ toast).

### 3.3 `useWallet()`
Головний хук. Повертає поточний стан гаманця і керуючі функції:

```ts
const {
  wallets,            // доступні адаптери
  wallet,             // поточний обраний
  publicKey,          // PublicKey | null
  connected,
  connecting,
  disconnecting,
  select(name),       // вибір конкретного гаманця за name
  connect(),
  disconnect(),
  sendTransaction(tx, connection, options?),   // підписати + відправити
  signTransaction?(tx),                        // якщо адаптер підтримує
  signAllTransactions?(txs[]),
  signMessage?(msg: Uint8Array),               // для SIWS
  signIn?(input?),                             // Sign In With Solana (EIP-4361 для Solana)
} = useWallet()
```

Док Sign In With Solana: https://github.com/phantom/sign-in-with-solana

### 3.4 `useConnection()`
Повертає `{ connection }` — той самий `Connection`, що передавали в `<ConnectionProvider>`.

### 3.5 `useAnchorWallet()`
Адаптує `useWallet()` під інтерфейс, який очікує `@coral-xyz/anchor` (`AnchorProvider`). Корисно при роботі з Anchor-програмами.

---

## 4. `@solana/wallet-adapter-react-ui`

GitHub: https://github.com/anza-xyz/wallet-adapter/tree/master/packages/ui/react-ui

Готова UI-обгортка. Стилі підключаються одним рядком:

```ts
import '@solana/wallet-adapter-react-ui/styles.css'
```

### 4.1 `<WalletModalProvider>`
Контекст модалки вибору гаманця. Має огорнути компоненти, які тригерять модалку:

```tsx
<WalletProvider wallets={wallets} autoConnect>
  <WalletModalProvider>{children}</WalletModalProvider>
</WalletProvider>
```

### 4.2 `<WalletMultiButton />`
Універсальна кнопка-перемикач: «Select Wallet» → коли підключено, показує адресу + меню (Copy address, Change wallet, Disconnect). Це «коробковий» варіант, який ми використовуємо в [Header](../src/components/Header.tsx).

### 4.3 `<WalletConnectButton />` і `<WalletDisconnectButton />`
Атомарні кнопки, якщо потрібен кастомний layout без меню.

### 4.4 `<WalletModalButton />` + `useWalletModal()`
- `<WalletModalButton>` — тільки кнопка відкриття модалки.
- `useWalletModal()` → `{ visible, setVisible }` — програмне керування модалкою з будь-якого хендлера:
  ```ts
  const { setVisible } = useWalletModal()
  <button onClick={() => setVisible(true)}>Connect</button>
  ```

### 4.5 `<WalletIcon wallet={wallet} />`
Маленький компонент іконки конкретного адаптера — стане в нагоді для кастомного списку.

### 4.6 Кастомізація стилів
Перевизначити CSS-змінні класу `.wallet-adapter-button` — як зроблено в [src/index.css](../src/index.css). Повний список класів: див. `styles.css` пакета.

---

## 5. `@solana/wallet-adapter-wallets`

GitHub: https://github.com/anza-xyz/wallet-adapter/tree/master/packages/wallets

Меta-пакет, що ре-експортує адаптери конкретних гаманців. У проєкті використовуємо:

| Адаптер | Тип гаманця | Документація |
|---|---|---|
| `PhantomWalletAdapter` | Браузерне розширення / iOS / Android | https://docs.phantom.app/ |
| `SolflareWalletAdapter` | Розширення + mobile + web | https://docs.solflare.com/ |
| `TrustWalletAdapter` | Розширення / mobile (multi-chain) | https://trustwallet.com/developer |
| `LedgerWalletAdapter` | Hardware Ledger Nano | https://developers.ledger.com/docs/transport/overview |
| `TorusWalletAdapter` | Soc-логін (Google/Apple/…) → embedded key | https://docs.tor.us/ |

Інші доступні з коробки (на момент написання): `BackpackWalletAdapter`, `CoinbaseWalletAdapter`, `MathWalletAdapter`, `CloverWalletAdapter`, `Coin98WalletAdapter`, `HuobiWalletAdapter`, `BitKeepWalletAdapter`, `BitpieWalletAdapter`, `SafePalWalletAdapter`, `TokenPocketWalletAdapter`, `WalletConnectWalletAdapter` (через `@solana/wallet-adapter-walletconnect`).

**Важливо.** Багато сучасних гаманців самостійно реєструються через [Wallet Standard](https://github.com/wallet-standard/wallet-standard) — їх не потрібно додавати в масив `wallets`, вони з'являться у модалці автоматично. Адаптери лишаються потрібними для:
- Hardware (Ledger).
- Гаманців без Wallet Standard.
- Mobile WalletConnect.

Опції конструктора (приклади):
```ts
new TorusWalletAdapter({ params: { network: { host: 'mainnet' } } })
new LedgerWalletAdapter({ derivationPath: ... })
new WalletConnectWalletAdapter({
  network: WalletAdapterNetwork.Mainnet,
  options: { projectId: '...', metadata: { ... } },
})
```

---

## 6. Типові юзкейси (з прикладами з цього проєкту)

### 6.1 Connect / Disconnect
- UI-кнопка: `<WalletMultiButton />` ([Header.tsx](../src/components/Header.tsx)).
- Програмно: `const { connect, disconnect, select } = useWallet(); select('Phantom'); await connect()`.

### 6.2 Читання балансу SOL і real-time оновлення
- `connection.getBalance(publicKey)` → лампорти.
- `connection.onAccountChange(publicKey, cb)` → авто-рефреш.
- Реалізовано в [useBalances.ts](../src/wallet/useBalances.ts).

### 6.3 Список SPL токенів власника
- `connection.getParsedTokenAccountsByOwner(owner, { programId: TOKEN_PROGRAM_ID })`.
- Кожен елемент містить `info.mint`, `info.tokenAmount.{amount, decimals, uiAmount}`.
- Реалізовано в [useBalances.ts](../src/wallet/useBalances.ts).

### 6.4 Переказ SOL
1. `new Transaction().add(SystemProgram.transfer({ fromPubkey, toPubkey, lamports }))`
2. `tx.feePayer = publicKey; tx.recentBlockhash = blockhash`
3. `sig = await sendTransaction(tx, connection)` — гаманець покаже діалог підпису.
4. `await connection.confirmTransaction({ signature, blockhash, lastValidBlockHeight }, 'confirmed')`.
- Реалізовано в [useTransfer.ts](../src/wallet/useTransfer.ts).

### 6.5 Переказ SPL токена
- `getAssociatedTokenAddress(mint, owner)` — ATA відправника й отримувача (`@solana/spl-token`).
- Якщо ATA отримувача немає (`getAccountInfo === null`) — додати `createAssociatedTokenAccountInstruction(payer, ata, owner, mint)`.
- `createTransferCheckedInstruction(srcAta, mint, dstAta, owner, amount, decimals)` — переказ.
- Док `@solana/spl-token`: https://solana-labs.github.io/solana-program-library/token/js/
- Реалізовано в [useTransfer.ts](../src/wallet/useTransfer.ts).

### 6.6 Sign In With Solana (SIWS) — аутентифікація без пароля
1. Згенерувати nonce (на бекенді або клієнті) і повідомлення-шаблон.
2. `signature = await signMessage(new TextEncoder().encode(message))`.
3. Верифікація — `nacl.sign.detached.verify(message, signature, publicKey.toBytes())`.
4. Зберегти сесію (JWT / cookie / localStorage).
- Реалізовано в [useAuth.ts](../src/wallet/useAuth.ts).
- Альтернатива — нативний `wallet.signIn(input)` (структура SIWS, аналог EIP-4361). Док: https://github.com/phantom/sign-in-with-solana

### 6.7 Історія транзакцій
- `connection.getSignaturesForAddress(pubkey, { limit: 20 })` → масив `{ signature, slot, blockTime, err }`.
- Деталі — `connection.getParsedTransaction(signature)`.
- Реалізовано в [useHistory.ts](../src/wallet/useHistory.ts).

### 6.8 Airdrop на devnet
```ts
const sig = await connection.requestAirdrop(publicKey, LAMPORTS_PER_SOL)
await connection.confirmTransaction(sig)
```
Не працює на mainnet.

### 6.9 Підписання без відправлення (offline / multi-sig)
```ts
const { signTransaction } = useWallet()
const signed = await signTransaction(tx) // повертає Transaction з підписом
const raw = signed.serialize()           // можна передати на сервер
```

### 6.10 Versioned transactions (для Jupiter / DeFi)
```ts
import { TransactionMessage, VersionedTransaction } from '@solana/web3.js'
const msg = new TransactionMessage({
  payerKey: publicKey,
  recentBlockhash,
  instructions,
}).compileToV0Message(addressLookupTableAccounts)
const vtx = new VersionedTransaction(msg)
const sig = await sendTransaction(vtx, connection)
```

---

## 7. Best practices

1. **Власний RPC.** Публічні `clusterApiUrl(...)` мають жорсткі ліміти. Для продакшну — Helius/QuickNode/Triton (`VITE_SOLANA_RPC` у [.env](../.env)).
2. **Завжди свіжий blockhash.** Брати безпосередньо перед `sendTransaction`. Старий → `BlockhashNotFound`.
3. **Confirmation strategy.** Використовуй об'єкт `{ signature, blockhash, lastValidBlockHeight }` замість legacy `confirmTransaction(signature)` — інакше може зависнути.
4. **Reuse `Connection`.** Один інстанс на додаток через `ConnectionProvider`; вебсокет-підписки дороги.
5. **Polyfill Buffer.** У браузері потрібен `Buffer` глобал — у нас зроблено через `vite-plugin-node-polyfills`.
6. **Перевіряй `wallet.signMessage` перед викликом.** Не кожен адаптер його підтримує (`signMessage?:` — опціонально).
7. **Лови `WalletError`.** `onError` у `<WalletProvider>` — централізована обробка; додатково — try/catch навколо send/sign.
8. **Не довіряй фронтенд-сесії як єдиному рівню авторизації.** Підпис у `useAuth` доводить володіння ключем, але серверна верифікація обов'язкова, якщо є бекенд.
9. **Versioned tx для агрегаторів.** Jupiter, Raydium API повертають саме v0 — legacy `Transaction` не зможе їх виконати.
10. **Compute budget і пріоритетна fee.** Для гарантії включення в блок під час перевантаження — `ComputeBudgetProgram.setComputeUnitPrice/setComputeUnitLimit`. Док: https://solana.com/docs/core/fees#prioritization-fees

---

## 8. Корисні зовнішні посилання

- Solana Cookbook (рецепти JS/Anchor): https://solanacookbook.com/
- Solana Core docs (транзакції, акаунти, програми): https://solana.com/docs/core
- SPL Token JS: https://solana-labs.github.io/solana-program-library/token/js/
- Anchor framework: https://www.anchor-lang.com/
- Wallet Standard: https://github.com/wallet-standard/wallet-standard
- Mobile Wallet Adapter: https://github.com/solana-mobile/mobile-wallet-adapter
- Anza wallet-adapter releases: https://github.com/anza-xyz/wallet-adapter/releases
