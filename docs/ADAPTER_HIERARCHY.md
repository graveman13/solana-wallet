# Ієрархія класів Wallet Adapter — практичний розбір

Джерела (виправляє ієрархію з [WALLET_ADAPTER.md](./WALLET_ADAPTER.md) — реальна структура **лінійна**, не з двома гілками):

- [`adapter.ts`](https://github.com/anza-xyz/wallet-adapter/blob/master/packages/core/base/src/adapter.ts) — інтерфейси й базовий клас
- [`signer.ts`](https://github.com/anza-xyz/wallet-adapter/blob/master/packages/core/base/src/signer.ts) — три рівні signer-розширень
- [`transaction.ts`](https://github.com/anza-xyz/wallet-adapter/blob/master/packages/core/base/src/transaction.ts) — типи `TransactionOrVersionedTransaction`
- [`signIn.ts`](https://github.com/anza-xyz/wallet-adapter/blob/master/packages/core/base/src/signIn.ts) — SIWS

---

## 1. Реальна ієрархія

```
EventEmitter<WalletAdapterEvents>          // з 'eventemitter3'
  └── BaseWalletAdapter                    // sendTransaction абстрактний
        └── BaseSignerWalletAdapter        // + signTransaction (abstract)
              │                            //   sendTransaction — конкретний (через signTransaction)
              │                            //   signAllTransactions — конкретний (default loop)
              └── BaseMessageSignerWalletAdapter   // + signMessage (abstract)
                    └── BaseSignInMessageSignerWalletAdapter  // + signIn (abstract)
```

**Усі чотири класи абстрактні**. Кожен наступний рівень додає одну нову можливість поверх попереднього. Конкретний адаптер гаманця (`PhantomWalletAdapter`, `SolflareWalletAdapter`…) наслідує **самий повний потрібний рівень** — найчастіше це `BaseSignInMessageSignerWalletAdapter`.

Паралельно існують три інтерфейси (для типізації, без реалізації):
- `SignerWalletAdapterProps` — додає `signTransaction`, `signAllTransactions`.
- `MessageSignerWalletAdapterProps` — додає `signMessage`.
- `SignInMessageSignerWalletAdapterProps` — додає `signIn`.

Ці інтерфейси — те, чим типізує себе `useWallet()`: `signTransaction?`, `signMessage?`, `signIn?` — **усі опціональні**, бо різні адаптери реалізують різні рівні.

---

## 2. Що дає кожен рівень — практично

### 2.1 `BaseWalletAdapter`

Мінімум життя:
```ts
abstract name: WalletName<Name>
abstract url: string
abstract icon: string
abstract readyState: WalletReadyState
abstract publicKey: PublicKey | null
abstract connecting: boolean
abstract supportedTransactionVersions?: SupportedTransactionVersions
abstract connect(): Promise<void>
abstract disconnect(): Promise<void>
abstract sendTransaction(tx, connection, options?): Promise<TransactionSignature>
get connected: boolean                     // = !!publicKey
async autoConnect(): Promise<void>         // дефолтно просто викликає connect()
protected prepareTransaction(tx, connection, options?)  // helper: ставить feePayer + blockhash
```

**Коли інтегратор бачить тільки цей рівень.** Hardware (`LedgerWalletAdapter`) і деякі WC-обгортки — гаманець уміє лише `connect/disconnect/sendTransaction`, без off-chain підпису повідомлень. У React це виглядає так:

```ts
const { connected, sendTransaction, signMessage } = useWallet()
if (!signMessage) {
  // адаптер не успадковує MessageSigner → SIWS неможливий
  // показати fallback: «Sign in via transaction»
}
```

**Подія `connect` емітить `publicKey`** — це той самий emit з `EventEmitter<WalletAdapterEvents>`, на який ти підписуєшся через `adapter.on('connect', cb)`.

### 2.2 `BaseSignerWalletAdapter` — рівень «звичайний софт-гаманець»

```ts
abstract signTransaction<T extends Transaction | VersionedTransaction>(tx: T): Promise<T>
async signAllTransactions<T>(txs: T[]): Promise<T[]>     // default loop через signTransaction
async sendTransaction(tx, connection, options?)          // ВЖЕ конкретний:
                                                         //   prepareTransaction → signTransaction → sendRawTransaction
```

**Що це дає інтегратору практично:**

1. **`signTransaction` + ручний submit.** Можна отримати підписану транзакцію без відправки і зробити з нею що завгодно — multi-sig сценарій, передача на бекенд-relayer, що оплатить fee замість користувача:
   ```ts
   const signed = await wallet.signTransaction!(tx)
   await fetch('/api/relay', { method: 'POST', body: signed.serialize() })
   ```

2. **`signAllTransactions` — пакетний підпис.** Гаманець показує **один діалог** з усіма транзакціями. Це не косметика — без нього Jupiter swap (setup + swap + cleanup) змусив би користувача натискати «Approve» три рази:
   ```ts
   const [setup, swap] = await jupiter.exchange(route)
   const [s1, s2] = await wallet.signAllTransactions!([setup, swap])
   for (const tx of [s1, s2]) await connection.sendRawTransaction(tx.serialize())
   ```

3. **`sendTransaction` тепер реалізований за тебе.** Тобі не треба самому викликати `getLatestBlockhash` + `signTransaction` + `sendRawTransaction` — базовий клас це робить через `prepareTransaction`. Це чому в нашому [useTransfer.ts](../src/wallet/useTransfer.ts) код такий короткий.

### 2.3 `BaseMessageSignerWalletAdapter` — рівень «можна автентифікувати»

```ts
abstract signMessage(message: Uint8Array): Promise<Uint8Array>
```

**Це і є основа Sign-In With Solana** старого стилю (повідомлення формуєш ти, гаманець просто підписує). Бекенд верифікує підпис через `nacl.sign.detached.verify` — як у нашому [useAuth.ts](../src/wallet/useAuth.ts).

```ts
const msg = new TextEncoder().encode(`Login nonce: ${nonce}`)
const sig = await wallet.signMessage!(msg)
const ok = nacl.sign.detached.verify(msg, sig, wallet.publicKey!.toBytes())
```

**Хто **не** доходить до цього рівня:** Ledger Solana app не підтримує arbitrary message signing — `LedgerWalletAdapter` залишається на `BaseSignerWalletAdapter`. Тому в UI завжди роби `if (signMessage)` перед SIWS-кнопкою.

### 2.4 `BaseSignInMessageSignerWalletAdapter` — рівень «нативний SIWS»

```ts
abstract signIn(input?: SolanaSignInInput): Promise<SolanaSignInOutput>
```

Це новий стандарт від Phantom (аналог EIP-4361 у Ethereum). Замість того щоб ти сам ліпив текст повідомлення, **гаманець сам форматує читабельне повідомлення з домену, statement, nonce і expiration і показує його користувачу** — це безпечніше (phishing-resistant) і UX кращий.

```ts
const out = await wallet.signIn?.({
  domain: location.host,
  statement: 'Sign in to solpump-clone',
  uri: location.origin,
  version: '1',
  chainId: 'solana:mainnet',
  nonce: crypto.randomUUID(),
  issuedAt: new Date().toISOString(),
})
// out: { account, signedMessage, signature }
```

Сервер верифікує `signedMessage` + `signature` тим самим ed25519. Перевага над `signMessage`: домен і час експірації **вписані в підписане повідомлення**, тож re-play на іншому сайті/часі неможливий.

**Хто реалізує:** Phantom, Solflare (recent), Backpack. Інші — поки що ні. Тому в коді — `if (signIn) { ... } else if (signMessage) { ... legacy SIWS ... } else { fallback }`.

---

## 3. Як цією ієрархією користуватися щодня

### 3.1 Feature detection через optional chaining

`useWallet()` повертає **усі** методи з усіх рівнів як опціональні. Це і є практичний спосіб дізнатися, до якого класу належить адаптер:

```ts
const { signTransaction, signAllTransactions, signMessage, signIn } = useWallet()

// якщо є signIn — це BaseSignInMessageSignerWalletAdapter
// якщо є signMessage але не signIn — BaseMessageSignerWalletAdapter
// якщо є тільки signTransaction — BaseSignerWalletAdapter
// якщо нічого з цього — BaseWalletAdapter (Ledger у legacy-конфігурації)
```

Приклад UI, що ховає кнопки, які гаманець не вміє:

```tsx
function ActionBar() {
  const { signIn, signMessage, signAllTransactions } = useWallet()
  return (
    <>
      {(signIn || signMessage) && <SignInButton />}
      {signAllTransactions && <SwapButton />}
      {/* sendTransaction є завжди — Send доступний для всіх */}
      <SendButton />
    </>
  )
}
```

### 3.2 Перевірка через `instanceof` (без хуків)

Якщо працюєш напряму з адаптером — можна перевірити рівень:

```ts
import {
  BaseSignerWalletAdapter,
  BaseMessageSignerWalletAdapter,
  BaseSignInMessageSignerWalletAdapter,
} from '@solana/wallet-adapter-base'

if (adapter instanceof BaseSignInMessageSignerWalletAdapter) {
  // нативний SIWS
} else if (adapter instanceof BaseMessageSignerWalletAdapter) {
  // legacy SIWS через signMessage
} else if (adapter instanceof BaseSignerWalletAdapter) {
  // тільки транзакції
}
```

На практиці частіше використовують optional chaining з `useWallet()` — простіше і працює з адаптерами на базі Wallet Standard, які не наслідують ці класи напряму, а просто реалізують ті ж інтерфейси.

### 3.3 Підписка на події через ієрархію `EventEmitter`

`adapter.on(...)` працює на **усіх** рівнях, бо всі рівні наслідують `EventEmitter<WalletAdapterEvents>`. Це той метод, який ти бачиш у [useAuth.ts](../src/wallet/useAuth.ts):

```ts
phantomWallet.adapter.eventNames()
// ['connect', 'disconnect', 'error', 'readyStateChange'] — якщо хоч один слухач підписаний
```

Типи події:

```ts
type WalletAdapterEvents = {
  connect(publicKey: PublicKey): void
  disconnect(): void
  error(error: WalletError): void
  readyStateChange(readyState: WalletReadyState): void
}
```

Звідси — типобезпечне підписання:

```ts
const onConnect = (pk: PublicKey) => console.log('connected:', pk.toBase58())
adapter.on('connect', onConnect)
adapter.off('connect', onConnect)
```

### 3.4 Як це лягає на наш код

| Рівень ієрархії | Що в проєкті залежить від нього |
|---|---|
| `BaseWalletAdapter.sendTransaction` | [useTransfer.ts](../src/wallet/useTransfer.ts) — `sendSol`, `sendSplToken` |
| `BaseSignerWalletAdapter.signAllTransactions` | не використовується (поки немає swap), але потрібен якщо додавати Jupiter |
| `BaseMessageSignerWalletAdapter.signMessage` | [useAuth.ts:65](../src/wallet/useAuth.ts) — legacy SIWS |
| `BaseSignInMessageSignerWalletAdapter.signIn` | поки не використовуємо; апгрейд на нього — короткий if-блок у `signIn()` |
| `EventEmitter.on('connect'/'disconnect')` | [useAuth.ts:54-60](../src/wallet/useAuth.ts) — авто-логаут при зміні гаманця (через `useEffect` на `publicKey`, що оновлюється з `connect` подій) |

---

## 4. Чому розробники wallet-adapter зробили саме лінійну ієрархію

Можна було б навпаки — три незалежні mix-in інтерфейси. Так не зробили з трьох причин:

1. **Семантичне включення.** Гаманець, що вміє `signIn`, **зобов'язаний** уміти `signMessage` (бо `signIn` повертає `signedMessage`/`signature`). А той, хто вміє `signMessage`, точно вміє і `signTransaction`. Логіка «вищий рівень = всі попередні + ще один» — це природна форма capability set'у.
2. **Дефолтні реалізації.** `BaseSignerWalletAdapter.sendTransaction` і `signAllTransactions` — це **готовий код**, який ти не пишеш для свого адаптера. Якби це були mix-in інтерфейси без класів — кожен адаптер копіпастив би однакові 20 рядків.
3. **`instanceof` працює.** Якщо твій code path вимагає `signIn` — `if (adapter instanceof BaseSignInMessageSignerWalletAdapter)` дає тобі **типобезпечно** усі чотири методи (`connect`, `signTransaction`, `signMessage`, `signIn`) без жодного `?`.

Практичний наслідок для тебе як інтегратора: **код у React стає короткий і безпечний**. Optional chaining (`wallet.signMessage?.(msg)`) + один рядок `if (!wallet.signMessage) showFallback()` покривають усі варіанти підтримки.

---

## 5. Шпаргалка: який метод — на якому рівні

| Метод | З якого класу/інтерфейсу | Завжди є? | Типовий споживач |
|---|---|---|---|
| `connect` / `disconnect` | `BaseWalletAdapter` | так | connect button |
| `sendTransaction` | `BaseWalletAdapter` (abstract) → дефолт у `BaseSignerWalletAdapter` | так | будь-яка дія on-chain |
| `signTransaction` | `BaseSignerWalletAdapter` | майже завжди (немає на дуже старих WC) | relayer, multi-sig |
| `signAllTransactions` | `BaseSignerWalletAdapter` (default loop) | майже завжди | Jupiter swap, batch ops |
| `signMessage` | `BaseMessageSignerWalletAdapter` | **немає на Ledger** | legacy SIWS |
| `signIn` | `BaseSignInMessageSignerWalletAdapter` | тільки Phantom/Solflare/Backpack | сучасний SIWS |
| `on/off/emit` (`connect`/`disconnect`/`error`/`readyStateChange`) | `EventEmitter<WalletAdapterEvents>` на всіх рівнях | так | реакція на зміну стану |
| `readyState` | `BaseWalletAdapter` | так | «Install Phantom» CTA |

---

## 6. Швидкий тест: який рівень у поточного wallet

```ts
import { useWallet } from '@solana/wallet-adapter-react'

function debugLevel() {
  const { wallet, signTransaction, signMessage, signIn } = useWallet()
  if (!wallet) return 'none'
  if (signIn) return 'BaseSignInMessageSignerWalletAdapter'
  if (signMessage) return 'BaseMessageSignerWalletAdapter'
  if (signTransaction) return 'BaseSignerWalletAdapter'
  return 'BaseWalletAdapter'
}
```

Це той самий механізм, що дозволяє в [useAuth.ts](../src/wallet/useAuth.ts) робити `if (!signMessage) setError(...)`: ти **не** перевіряєш клас, ти просто питаєш «чи реалізує він цей рівень capability».
