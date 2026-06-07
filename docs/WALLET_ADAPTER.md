# Wallet Adapter — повний довідник API з прикладами

Цей файл сфокусований саме на об'єкті `adapter` (екземпляр `BaseWalletAdapter`) — що він уміє, які має події, як ним керувати програмно з React і без нього.

**Офіційні джерела:**
- Repo: https://github.com/anza-xyz/wallet-adapter
- Демо: https://anza-xyz.github.io/wallet-adapter/example/
- `@solana/wallet-adapter-base` (інтерфейси): https://github.com/anza-xyz/wallet-adapter/tree/master/packages/core/base
- `@solana/wallet-adapter-react` (хуки): https://github.com/anza-xyz/wallet-adapter/tree/master/packages/core/react
- `@solana/wallet-adapter-react-ui` (UI): https://github.com/anza-xyz/wallet-adapter/tree/master/packages/ui/react-ui
- `@solana/wallet-adapter-wallets` (конкретні гаманці): https://github.com/anza-xyz/wallet-adapter/tree/master/packages/wallets

---

## 1. Ієрархія типів

```
EventEmitter
  └── WalletAdapter                       (read-only: name, icon, url, publicKey, connected…)
        └── BaseWalletAdapter             (абстрактний клас з connect/disconnect/sendTransaction)
              ├── BaseMessageSignerWalletAdapter   (+ signMessage)
              └── BaseSignerWalletAdapter          (+ signTransaction, signAllTransactions)
```

У реалі сучасні адаптери (Phantom, Solflare, Backpack) реалізують **усі три**: і `signTransaction`, і `signAllTransactions`, і `signMessage`. Ledger — лише `signTransaction`/`signAllTransactions` (підпис довільного повідомлення Ledger Solana app не підтримує).

---

## 2. Властивості адаптера

| Поле | Тип | Опис |
|---|---|---|
| `name` | `WalletName` (`string`) | Унікальне ім'я для `select(name)`. Напр., `'Phantom'`, `'Solflare'`. |
| `url` | `string` | Сайт гаманця (для лінку «Install»). |
| `icon` | `string` (data URI / URL) | Іконка для UI. |
| `readyState` | `WalletReadyState` | `Installed` · `NotDetected` · `Loadable` · `Unsupported`. |
| `publicKey` | `PublicKey \| null` | Поточна адреса (після `connect`). |
| `connecting` | `boolean` | True під час handshake. |
| `connected` | `boolean` | True якщо успішно підключений. |
| `supportedTransactionVersions` | `Set<TransactionVersion> \| null` | `null` = тільки legacy; `Set([0, 'legacy'])` = v0 теж. |

`WalletReadyState` детально (з [base/src/adapter.ts](https://github.com/anza-xyz/wallet-adapter/blob/master/packages/core/base/src/adapter.ts)):

- `Installed` — розширення/SDK знайдено в браузері, готовий до `connect()`.
- `NotDetected` — гаманець підтримується, але користувач його не встановив.
- `Loadable` — універсальний (Web3Auth / WalletConnect) — завжди готовий «завантажити» UI.
- `Unsupported` — взагалі не може працювати в цьому контексті (наприклад, mobile-only на десктопі).

### Приклад: фільтрувати тільки встановлені

```ts
import { WalletReadyState } from '@solana/wallet-adapter-base'

const installed = wallets.filter(
  (w) => w.adapter.readyState === WalletReadyState.Installed,
)
```

---

## 3. Методи адаптера

### 3.1 `connect(): Promise<void>`
Відкриває діалог гаманця, після успіху встановлює `publicKey` і `connected`.

```ts
const adapter = new PhantomWalletAdapter()
try {
  await adapter.connect()
  console.log('Connected as', adapter.publicKey?.toBase58())
} catch (e) {
  if (e instanceof WalletNotReadyError) {
    window.open(adapter.url, '_blank')
  }
}
```

### 3.2 `disconnect(): Promise<void>`
Завершує сесію. `publicKey` стане `null`.

```ts
await adapter.disconnect()
```

### 3.3 `sendTransaction(tx, connection, options?): Promise<TransactionSignature>`
Підписує і відправляє транзакцію за один виклик. `options`:
- `signers?: Signer[]` — додаткові ключі (наприклад, ефемерний keypair для нового акаунту).
- `skipPreflight?: boolean`
- `preflightCommitment?: Commitment`
- `maxRetries?: number`
- `minContextSlot?: number`

```ts
const tx = new Transaction().add(SystemProgram.transfer({ ... }))
tx.feePayer = adapter.publicKey!
tx.recentBlockhash = (await connection.getLatestBlockhash()).blockhash
const signature = await adapter.sendTransaction(tx, connection)
```

### 3.4 `signTransaction(tx)` / `signAllTransactions(txs[])`
Підписує без відправки — корисно для:
- передачі на сервер (multi-sig, gasless via relayer);
- збирання route у Jupiter перед сабмітом;
- partial signing (decentralized escrows).

```ts
const signed = await adapter.signTransaction(tx)
const raw = signed.serialize()
// далі: connection.sendRawTransaction(raw)
```

### 3.5 `signMessage(message: Uint8Array): Promise<Uint8Array>`
Підписує довільне повідомлення off-chain. Повертає 64-байтний ed25519 підпис. Використовується для:
- **Sign-In With Solana (SIWS)** — аутентифікація без пароля.
- Верифікації, що користувач реально володіє адресою.

```ts
const message = new TextEncoder().encode('Auth nonce: ' + nonce)
const sig = await adapter.signMessage(message)
const ok = nacl.sign.detached.verify(message, sig, adapter.publicKey!.toBytes())
```

### 3.6 `signIn?(input?: SolanaSignInInput): Promise<SolanaSignInOutput>` *(новий)*
Нативний SIWS згідно специфікації Phantom/Wallet Standard. Гаманець сам формує читабельне повідомлення (домен, statement, nonce, expiration), повертає `{ account, signedMessage, signature }`. Док: https://github.com/phantom/sign-in-with-solana

```ts
const out = await adapter.signIn?.({
  domain: window.location.host,
  statement: 'Sign in to solpump-clone',
  nonce: crypto.randomUUID(),
  issuedAt: new Date().toISOString(),
})
```

---

## 4. Події адаптера

Адаптер успадковує `EventEmitter` (з [`eventemitter3`](https://github.com/primus/eventemitter3)). Список подій:

| Подія | Payload | Коли |
|---|---|---|
| `'connect'` | `publicKey: PublicKey` | Після успішного `connect()` |
| `'disconnect'` | — | Користувач вийшов / гаманець скинув сесію |
| `'error'` | `WalletError` | Будь-яка помилка адаптера |
| `'readyStateChange'` | `state: WalletReadyState` | Гаманець був установлений/видалений у браузері |

```ts
adapter.on('connect', (pk) => console.log('connected', pk.toBase58()))
adapter.on('disconnect', () => console.log('disconnected'))
adapter.on('error', (err) => console.error(err.name, err.message))
adapter.on('readyStateChange', (s) => console.log('readyState →', s))

// прибрати конкретний слухач
adapter.off('connect', handler)
// прибрати всі
adapter.removeAllListeners()

// перерахувати імена підписаних подій
adapter.eventNames() // ['connect', 'disconnect', ...]
```

> Помічене в [src/wallet/useAuth.ts](../src/wallet/useAuth.ts) `phantomWallet.adapter.eventNames` — це й є метод з `EventEmitter`, повертає масив імен зареєстрованих подій.

---

## 5. Класи помилок

З [`@solana/wallet-adapter-base/src/errors.ts`](https://github.com/anza-xyz/wallet-adapter/blob/master/packages/core/base/src/errors.ts):

- `WalletError` — базовий клас (`name`, `message`, `error`).
- `WalletNotReadyError` — гаманець не встановлено.
- `WalletNotConnectedError` — викликали `sendTransaction`/`signMessage` без `connect()`.
- `WalletConnectionError` — handshake провалився.
- `WalletDisconnectedError` — гаманець розірвав сесію посеред операції.
- `WalletAccountError`, `WalletPublicKeyError` — проблеми з ключем.
- `WalletKeypairError`, `WalletLoadError`, `WalletConfigError` — конфіг.
- `WalletSignTransactionError`, `WalletSendTransactionError`, `WalletSignMessageError`, `WalletSignInError` — підпис/відправка.
- `WalletTimeoutError` — діалог не закрився вчасно.
- `WalletWindowBlockedError`, `WalletWindowClosedError` — попап (актуально для Torus, WalletConnect).

```ts
import { WalletError, WalletNotReadyError } from '@solana/wallet-adapter-base'

try {
  await wallet.connect()
} catch (e) {
  if (e instanceof WalletNotReadyError) toast('Установіть гаманець')
  else if (e instanceof WalletError) toast(e.message)
  else throw e
}
```

---

## 6. React хуки

### 6.1 `useWallet()`
Док: https://github.com/anza-xyz/wallet-adapter/tree/master/packages/core/react#usewallet

Повний інтерфейс:

```ts
const {
  // список і вибір
  wallets,            // { adapter, readyState }[]
  wallet,             // обраний { adapter, readyState } | null
  select(name: WalletName | null): void,

  // стан
  publicKey: PublicKey | null,
  connecting: boolean,
  connected: boolean,
  disconnecting: boolean,
  autoConnect: boolean,

  // дії
  connect(): Promise<void>,
  disconnect(): Promise<void>,
  sendTransaction(tx, connection, options?): Promise<TransactionSignature>,

  // опціональні — залежно від адаптера
  signTransaction?: <T>(tx: T) => Promise<T>,
  signAllTransactions?: <T>(txs: T[]) => Promise<T[]>,
  signMessage?: (msg: Uint8Array) => Promise<Uint8Array>,
  signIn?: (input?: SolanaSignInInput) => Promise<SolanaSignInOutput>,
} = useWallet()
```

### 6.2 Приклад: знайти Phantom і взяти з нього `eventNames`

```ts
const { wallets } = useWallet()
const phantom = wallets.find((w) => w.adapter.name === 'Phantom')
if (phantom) {
  console.log(phantom.adapter.eventNames())
  console.log(phantom.adapter.readyState)
  phantom.adapter.on('connect', (pk) => console.log('phantom connect', pk.toBase58()))
}
```

### 6.3 Приклад: програмне підключення конкретного гаманця

```ts
const { select, connect } = useWallet()
select('Solflare')          // встановить wallet, але НЕ підключить
await connect()             // тепер підключиться
```

### 6.4 Приклад: обробка нативного `signIn` з fallback на `signMessage`

```ts
const { signIn, signMessage, publicKey } = useWallet()

async function login() {
  if (signIn) {
    const out = await signIn({
      domain: location.host,
      nonce: crypto.randomUUID(),
      statement: 'Login to App',
    })
    return verifyOnServer(out)
  }
  if (signMessage && publicKey) {
    const msg = new TextEncoder().encode(`Login nonce: ${crypto.randomUUID()}`)
    const sig = await signMessage(msg)
    return verifyOnServerFallback(msg, sig, publicKey)
  }
  throw new Error('Wallet supports neither signIn nor signMessage')
}
```

### 6.5 `useConnection()`

```ts
const { connection } = useConnection()
const lamports = await connection.getBalance(publicKey)
```

### 6.6 `useAnchorWallet()` (для Anchor)

```ts
import { AnchorProvider } from '@coral-xyz/anchor'

const anchorWallet = useAnchorWallet()
const { connection } = useConnection()
const provider = anchorWallet
  ? new AnchorProvider(connection, anchorWallet, { commitment: 'confirmed' })
  : null
```

### 6.7 `useWalletModal()` (з `react-ui`)

```ts
import { useWalletModal } from '@solana/wallet-adapter-react-ui'

const { visible, setVisible } = useWalletModal()
<button onClick={() => setVisible(true)}>Підключити гаманець</button>
```

---

## 7. Конкретні адаптери з `@solana/wallet-adapter-wallets`

### 7.1 PhantomWalletAdapter
```ts
import { PhantomWalletAdapter } from '@solana/wallet-adapter-wallets'
new PhantomWalletAdapter()
```
- Браузерне розширення + iOS/Android (через deep-link).
- Підтримує: `connect`, `disconnect`, `signTransaction`, `signAllTransactions`, `signMessage`, `signIn`.
- Версіоновані транзакції: так.
- Док: https://docs.phantom.app/integrating/extension-and-mobile-browser

### 7.2 SolflareWalletAdapter
```ts
import { SolflareWalletAdapter } from '@solana/wallet-adapter-wallets'
import { WalletAdapterNetwork } from '@solana/wallet-adapter-base'
new SolflareWalletAdapter({ network: WalletAdapterNetwork.Mainnet })
```
- Web + розширення + mobile.
- Підтримує все, що Phantom; додатково web fallback (підключення без розширення).
- Док: https://docs.solflare.com/solflare/

### 7.3 LedgerWalletAdapter
```ts
import { LedgerWalletAdapter } from '@solana/wallet-adapter-wallets'
new LedgerWalletAdapter()
```
- Hardware. Працює через WebHID/WebUSB — лише HTTPS і браузери з підтримкою (Chrome, Edge).
- **Не підтримує `signMessage`.** Для SIWS — fallback на off-chain transaction-based auth.
- Док: https://developers.ledger.com/docs/transport/web-hid-usb

### 7.4 TorusWalletAdapter
```ts
import { TorusWalletAdapter } from '@solana/wallet-adapter-wallets'
new TorusWalletAdapter({
  params: { network: { host: 'mainnet', chainId: 1, blockExplorer: '' } },
})
```
- Соцлогін (Google, Apple, Twitter…) → MPC-ключ.
- Відкриває попап — обережно з блокувальниками.
- Док: https://docs.tor.us/

### 7.5 TrustWalletAdapter
```ts
import { TrustWalletAdapter } from '@solana/wallet-adapter-wallets'
new TrustWalletAdapter()
```
- Multi-chain (Solana — один із підтримуваних).
- Мобільний deep-link + розширення.
- Док: https://trustwallet.com/blog/announcing-trust-wallet-extension

### 7.6 WalletConnect (через окремий пакет)
```ts
import { WalletConnectWalletAdapter } from '@solana/wallet-adapter-walletconnect'
import { WalletAdapterNetwork } from '@solana/wallet-adapter-base'

new WalletConnectWalletAdapter({
  network: WalletAdapterNetwork.Mainnet,
  options: {
    projectId: 'YOUR_PROJECT_ID',
    metadata: {
      name: 'solpump-clone',
      description: '',
      url: location.origin,
      icons: [],
    },
  },
})
```
- Універсальний мобільний QR-флоу для будь-якого WC-сумісного гаманця.
- Project ID: https://cloud.walletconnect.com

### 7.7 Інші доступні
`BackpackWalletAdapter`, `CoinbaseWalletAdapter`, `MathWalletAdapter`, `CloverWalletAdapter`, `Coin98WalletAdapter`, `HuobiWalletAdapter`, `BitKeepWalletAdapter`, `BitpieWalletAdapter`, `SafePalWalletAdapter`, `TokenPocketWalletAdapter`, `NightlyWalletAdapter`, `KrystalWalletAdapter`.

Повний список — у `index.ts` пакета: https://github.com/anza-xyz/wallet-adapter/blob/master/packages/wallets/wallets/src/index.ts

### 7.8 Wallet Standard — більшість сучасних не треба додавати
Phantom, Solflare, Backpack, Brave, Glow, Coinbase, OKX і інші тепер автоматично реєструються через [Wallet Standard](https://github.com/wallet-standard/wallet-standard). `WalletProvider` сам їх підхопить — масив `wallets` можна тримати **порожнім** для них:

```ts
<WalletProvider wallets={[ new LedgerWalletAdapter(), new TorusWalletAdapter() ]} autoConnect>
```

---

## 8. UI-компоненти з `@solana/wallet-adapter-react-ui`

### 8.1 `<WalletModalProvider>`
Контекст для модалки. Має огорнути все, що може її відкрити.

```tsx
<WalletProvider wallets={wallets} autoConnect>
  <WalletModalProvider>
    <App />
  </WalletModalProvider>
</WalletProvider>
```

Стилі — `import '@solana/wallet-adapter-react-ui/styles.css'`.

### 8.2 `<WalletMultiButton />`
Універсальна кнопка. До підключення — «Select Wallet». Після — адреса + dropdown (Copy / Change / Disconnect). Це найшвидший шлях:

```tsx
import { WalletMultiButton } from '@solana/wallet-adapter-react-ui'
<WalletMultiButton />
```

### 8.3 `<WalletConnectButton />` + `<WalletDisconnectButton />`
Атомарні кнопки без меню — для кастомних layout'ів:

```tsx
<WalletConnectButton />
<WalletDisconnectButton />
```

### 8.4 `<WalletModalButton>` + `useWalletModal`
Якщо потрібно повний контроль над виглядом тригера:

```tsx
import { WalletModalButton, useWalletModal } from '@solana/wallet-adapter-react-ui'

function MyConnect() {
  const { setVisible } = useWalletModal()
  return <button onClick={() => setVisible(true)}>Підключити</button>
}
```

### 8.5 `<WalletIcon wallet={wallet} />`
Іконка конкретного адаптера — стане в нагоді для кастомного списку:

```tsx
{wallets.map(({ adapter }) => (
  <button key={adapter.name} onClick={() => select(adapter.name)}>
    <WalletIcon wallet={{ adapter, readyState: adapter.readyState }} />
    {adapter.name}
  </button>
))}
```

### 8.6 Кастомізація стилів
Перевизначити CSS-змінні `.wallet-adapter-button` / `.wallet-adapter-modal-*` — як зроблено в [src/index.css](../src/index.css):

```css
.wallet-adapter-button {
  background: linear-gradient(135deg, #7c5cff, #5d3ef0) !important;
  border-radius: 12px !important;
  height: 40px !important;
}
```

---

## 9. Готові паттерни з прикладами коду

### 9.1 Налаштування провайдерів з нуля

```tsx
import { clusterApiUrl } from '@solana/web3.js'
import { WalletAdapterNetwork } from '@solana/wallet-adapter-base'
import { ConnectionProvider, WalletProvider } from '@solana/wallet-adapter-react'
import { WalletModalProvider } from '@solana/wallet-adapter-react-ui'
import {
  PhantomWalletAdapter,
  SolflareWalletAdapter,
  LedgerWalletAdapter,
} from '@solana/wallet-adapter-wallets'
import '@solana/wallet-adapter-react-ui/styles.css'

export function AppProviders({ children }) {
  const network = WalletAdapterNetwork.Mainnet
  const endpoint = useMemo(() => clusterApiUrl(network), [network])
  const wallets = useMemo(
    () => [
      new PhantomWalletAdapter(),
      new SolflareWalletAdapter({ network }),
      new LedgerWalletAdapter(),
    ],
    [network],
  )
  return (
    <ConnectionProvider endpoint={endpoint}>
      <WalletProvider
        wallets={wallets}
        autoConnect
        onError={(e) => console.error(e)}
      >
        <WalletModalProvider>{children}</WalletModalProvider>
      </WalletProvider>
    </ConnectionProvider>
  )
}
```

### 9.2 Переказ SOL

```ts
const { publicKey, sendTransaction } = useWallet()
const { connection } = useConnection()

const tx = new Transaction().add(
  SystemProgram.transfer({
    fromPubkey: publicKey!,
    toPubkey: new PublicKey(to),
    lamports: amount * LAMPORTS_PER_SOL,
  }),
)
const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash()
tx.recentBlockhash = blockhash
tx.feePayer = publicKey!

const signature = await sendTransaction(tx, connection)
await connection.confirmTransaction(
  { signature, blockhash, lastValidBlockHeight },
  'confirmed',
)
```

### 9.3 Підпис + серверна верифікація

```ts
// Client
const msg = new TextEncoder().encode(`Login: ${nonce}`)
const signature = await wallet.signMessage(msg)
await fetch('/api/auth', {
  method: 'POST',
  body: JSON.stringify({
    address: wallet.publicKey.toBase58(),
    signature: bs58.encode(signature),
    nonce,
  }),
})

// Server
import nacl from 'tweetnacl'
import bs58 from 'bs58'
const ok = nacl.sign.detached.verify(
  new TextEncoder().encode(`Login: ${nonce}`),
  bs58.decode(signature),
  new PublicKey(address).toBytes(),
)
```

### 9.4 Реакція на події адаптера в React

```ts
useEffect(() => {
  if (!wallet?.adapter) return
  const onConnect = (pk: PublicKey) => console.log('connect', pk.toBase58())
  const onDisconnect = () => console.log('disconnect')
  const onError = (e: WalletError) => console.error(e)
  wallet.adapter.on('connect', onConnect)
  wallet.adapter.on('disconnect', onDisconnect)
  wallet.adapter.on('error', onError)
  return () => {
    wallet.adapter.off('connect', onConnect)
    wallet.adapter.off('disconnect', onDisconnect)
    wallet.adapter.off('error', onError)
  }
}, [wallet])
```

### 9.5 Авто-логаут при зміні гаманця в розширенні
Деякі гаманці (Phantom) дозволяють перемикати account з UI самого розширення. Адаптер при цьому емітить `disconnect` + `connect` із новим `publicKey`. Достатньо стежити за `useWallet().publicKey` у `useEffect`, як у [useAuth.ts](../src/wallet/useAuth.ts):

```ts
useEffect(() => {
  if (connected && publicKey && session && session.address !== publicKey.toBase58()) {
    localStorage.removeItem(STORAGE_KEY)
    setSession(null)
  }
}, [connected, publicKey, session])
```

### 9.6 Версіоновані транзакції
```ts
import {
  TransactionMessage,
  VersionedTransaction,
  AddressLookupTableAccount,
} from '@solana/web3.js'

const message = new TransactionMessage({
  payerKey: publicKey!,
  recentBlockhash: blockhash,
  instructions,
}).compileToV0Message(lookupTables)

const vtx = new VersionedTransaction(message)
const sig = await sendTransaction(vtx, connection)
```

Перевір, що адаптер підтримує v0:
```ts
const supportsV0 = wallet?.adapter.supportedTransactionVersions?.has(0) ?? false
```

### 9.7 Пакетний підпис (Jupiter swap)
```ts
const [setupTx, swapTx] = await fetchRoute()
const signed = await wallet.signAllTransactions!([setupTx, swapTx])
for (const tx of signed) {
  const sig = await connection.sendRawTransaction(tx.serialize())
  await connection.confirmTransaction(sig)
}
```

### 9.8 Програмно відкрити модалку з власного хедера

```tsx
function Header() {
  const { setVisible } = useWalletModal()
  const { connected, publicKey, disconnect } = useWallet()
  return connected ? (
    <button onClick={disconnect}>{publicKey?.toBase58().slice(0, 4)}…</button>
  ) : (
    <button onClick={() => setVisible(true)}>Connect</button>
  )
}
```

### 9.9 Перевірка наявності гаманця перед UI

```ts
const { wallets } = useWallet()
const phantom = wallets.find((w) => w.adapter.name === 'Phantom')
const phantomInstalled = phantom?.adapter.readyState === WalletReadyState.Installed
```

### 9.10 Прямий доступ до адаптера (без хуків)

```ts
const adapter = new PhantomWalletAdapter()
adapter.on('connect', (pk) => console.log(pk.toBase58()))
await adapter.connect()
const sig = await adapter.sendTransaction(tx, connection)
await adapter.disconnect()
```

---

## 10. Pitfalls (часті помилки)

1. **`useWallet()` поза `<WalletProvider>`** → throw. Усі компоненти, що його викликають, мають бути всередині дерева провайдерів.
2. **Виклик `connect()` без user gesture.** Браузери блокують попап Phantom/Solflare поза кліком. Викликай у `onClick`, не в `useEffect`.
3. **`signTransaction` opcional.** Перед викликом завжди перевіряй `if (signTransaction) { … }` — Ledger у деяких випадках не дає його.
4. **`autoConnect` під час SSR.** У Next.js — обертай провайдерів у клієнтський компонент, інакше `localStorage` упаде.
5. **Старий blockhash при повільному UX.** Якщо користувач тримає форму довго — отримуй blockhash безпосередньо перед `sendTransaction`, не наперед.
6. **Помилки не падають у консоль автоматично.** `WalletProvider` лише emit'ить їх у `onError` — підключи логгер/toast.
7. **`signMessage` на Ledger.** Не підтримується — або відключай SIWS для Ledger, або використовуй транзакційну форму auth.
8. **Versioned tx + старий адаптер.** Перевіряй `supportedTransactionVersions` — інакше `WalletSendTransactionError`.
9. **Зміна `endpoint` після маунту.** `ConnectionProvider` створює `Connection` один раз на зміну `endpoint` — щоб перемкнути мережу, перерендер з новим значенням.
10. **`select(null)`** скидає вибір. Це нормальний шлях зробити «forget wallet».

---

## 11. Дотичні бібліотеки

- `@solana/wallet-standard-features` — низькорівневий доступ до Wallet Standard поверх адаптера.
- `@solana/wallet-adapter-walletconnect` — окремий пакет для WC.
- `@solana-mobile/wallet-adapter-mobile` — Mobile Wallet Adapter (Android SMS protocol).
- `@solana/wallet-standard-wallet-adapter-react` — обгортка Wallet Standard у форматі цього ж API (екзотично, але існує).

---

## 12. Що далі почитати

- Solana Cookbook — wallet section: https://solanacookbook.com/references/wallets.html
- Solana Stack Exchange (теги `wallet-adapter`, `web3js`): https://solana.stackexchange.com/
- Phantom dev docs: https://docs.phantom.app/
- Solflare dev docs: https://docs.solflare.com/solflare/
- Anza wallet-adapter release notes: https://github.com/anza-xyz/wallet-adapter/releases
