<p align="center">
  <img src="https://coresg-normal.trae.ai/api/ide/v1/text_to_image?prompt=A%20minimalist%20logo%20for%20a%20financial%20technology%20API%20service%20called%20Ashar%20MCP%2C%20featuring%20interlocking%20geometric%20shapes%20in%20dark%20blue%20and%20teal%2C%20representing%20currency%20exchange%20and%20blockchain%20connections%2C%20on%20a%20transparent%20background&image_size=square_hd" alt="Ashar MCP" width="120" />
</p>

<h1 align="center">Ashar MCP Server</h1>

<p align="center">
  <strong>Model Context Protocol</strong> server for the Ashar Finance API<br/>
  Seamlessly integrate BRL deposits, currency conversions, and crypto operations into any MCP-compatible client.
</p>

<p align="center">
  <a href="#-features">Features</a> ·
  <a href="#-quick-start">Quick Start</a> ·
  <a href="#%EF%B8%8F-integration">Integration</a> ·
  <a href="#-tools-reference">Tools</a> ·
  <a href="#-api-reference">API Reference</a> ·
  <a href="#-security">Security</a>
</p>

---

## ✨ Features

| Feature | Description |
|---|---|
| **BRL Deposits** | Create PIX payment charges, check status by TXID, list deposit history |
| **Currency Conversion** | Convert between BRL, USD, EUR, USDT, and USDC — any pair, any direction |
| **Crypto Withdrawals** | Withdraw USDT/USDC to external wallets with multi-tier approval |
| **Crypto Deposits** | Generate custody addresses for receiving USDT/USDC on-chain |
| **Fiat Withdrawals** | Withdraw BRL, USD, and EUR to bank accounts via PIX, Wire, or SEPA |
| **Bank Accounts** | Manage receiver bank accounts — create, list, edit, and delete |
| **MCP Native** | Full MCP (Model Context Protocol) compliance via the official TypeScript SDK |
| **Dual Mode** | Two distribution formats: JSON descriptors (Trae/BlindPay style) + standalone SDK server |
| **Bearer Auth** | Authenticate with `ASHAR_API_KEY` — zero hardcoded credentials |

---

## 🚀 Quick Start

### Prerequisites

- **Node.js** ≥ 18
- **Ashar API Key** — request one from [Ashar Finance](https://ashar.finance)

### Install & Build

```bash
git clone git@github.com:AsharFinance/ashar_mcp.git
cd ashar_mcp

cp .env.example .env
# Edit .env → set ASHAR_API_KEY to your key

npm install
npm run build
```

### Verify

```bash
node dist/index.js
# Should output: [ashar-mcp] running via stdio
```

---

## 🖥️ Integration

### Claude Desktop

Add to your `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "ashar": {
      "command": "node",
      "args": ["/absolute/path/to/ashar_mcp/dist/index.js"],
      "env": {
        "ASHAR_API_KEY": "your-api-key",
        "ASHAR_API_URL": "https://api.ashar.finance"
      }
    }
  }
}
```

### Cursor / Windsurf / Any MCP Client

Use the **stdio transport**. Configure the same command and environment variables in your client's MCP settings panel.

### HTTP Server (for remote/cloud deployments)

```bash
ASHAR_TRANSPORT=http ASHAR_API_KEY=your-key PORT=3000 npm start
```

Endpoints:
- `POST /mcp` — MCP streamable HTTP
- `GET /health` — Health check

### JSON Descriptors (Trae / BlindPay format)

The `mcp_ashar/` folder contains standalone JSON tool descriptors following the same format used by the BlindPay MCP. Copy this folder to your MCP runtime and configure the API base URL.

---

## 🔧 Environment Variables

| Variable | Required | Default | Description |
|---|---|---|---|
| `ASHAR_API_KEY` | Yes | — | Your Ashar Finance API key (Bearer token) |
| `ASHAR_API_URL` | No | `https://api.ashar.finance` | Base URL for the Ashar API |
| `ASHAR_TRANSPORT` | No | `stdio` | Transport mode: `stdio` or `http` |
| `PORT` | No | `3000` | HTTP port (only when `ASHAR_TRANSPORT=http`) |

---

## 🔨 Tools Reference

### BRL Deposit

| Tool | Description | ↔ JSON Descriptor |
|---|---|---|
| `ashar_criar_deposito_brl` | Create a PIX payment charge and get the QR code string | `PostV1BrlDeposits` |
| `ashar_consultar_deposito_brl` | Check deposit status by TXID | `GetV1BrlDepositsByTxid` |
| `ashar_listar_depositos_brl` | List all BRL deposit orders | `GetV1BrlDeposits` |

### Currency Conversion

| Tool | Description | ↔ JSON Descriptor |
|---|---|---|
| `ashar_converter_moeda` | Convert between BRL, USD, EUR, USDT, USDC | `PostV1Conversions` |

**Supported pairs**: all combinations of `BRL`, `USD`, `EUR`, `USDT`, `USDC`.

### Crypto Withdrawal

| Tool | Description | ↔ JSON Descriptor |
|---|---|---|
| `ashar_sacar_crypto` | Withdraw USDT/USDC to an external wallet | `PostV1CryptoWithdrawals` |
| `ashar_consultar_saque_crypto` | Check withdrawal status by external ID | `GetV1CryptoWithdrawalsByExternalId` |

**Approval tiers**:
- ≤ $1,000 → **AUTO** (processed immediately)
- $1,000 – $10,000 → **SINGLE_ADMIN** (1 admin approval)
- > $10,000 → **MULTI_SIG** (2 of 3 admins)

### Crypto Deposit

| Tool | Description | ↔ JSON Descriptor |
|---|---|---|
| `ashar_endereco_deposito_crypto` | Generate a custody address for USDT/USDC | `PostV1CryptoDepositAddresses` |

> ⚠️ Send **only** the specified asset on the specified chain. Sending the wrong asset or using the wrong network may result in **permanent loss of funds**.

### Bank Accounts

| Tool | Description | ↔ JSON Descriptor |
|---|---|---|
| `ashar_listar_contas_bancarias` | List all registered bank accounts (receivers) | `GetV1BankAccounts` |
| `ashar_criar_conta_bancaria` | Register a new bank account for fiat payouts | `PostV1BankAccounts` |
| `ashar_editar_conta_bancaria` | Update an existing bank account | `PutV1BankAccountsById` |
| `ashar_deletar_conta_bancaria` | Delete a bank account | `DeleteV1BankAccountsById` |

**Supported currencies**: `BRL` (PIX), `USD` (Wire/ACH), `EUR` (SEPA/IBAN).

### Fiat Withdrawals

| Tool | Description | ↔ JSON Descriptor |
|---|---|---|
| `ashar_sacar_fiat` | Withdraw BRL/USD/EUR to a bank account | `PostV1FiatWithdrawals` |
| `ashar_listar_saques_fiat` | List fiat withdrawal (remittance) orders | `GetV1FiatWithdrawals` |

**Rails**: BRL → PIX / USD → Wire / EUR → SEPA. Can use a pre-registered bank account (`beneficiary_id`) or provide account details inline.

---

## 📚 API Reference

### Create BRL PIX Deposit

```
ashar_criar_deposito_brl { amount_brl: 500.00 }
```

**Input**: `amount_brl` (number, required) — Deposit amount in BRL.

**Output**:
```json
{
  "id": "dep_abc123",
  "txid": "tx_xyz789",
  "amount_brl": 500.00,
  "pix_copy_paste": "00020126580014...",
  "status": "PENDING",
  "expires_at": "2025-07-01T23:59:59Z"
}
```

---

### Convert Currencies

```
ashar_converter_moeda { from_currency: "BRL", to_currency: "USDT", amount_from: 1000.00 }
```

**Input**:
- `from_currency` (string, required) — `BRL`, `USD`, `EUR`, `USDT`, or `USDC`
- `to_currency` (string, required) — `BRL`, `USD`, `EUR`, `USDT`, or `USDC` (must differ from `from_currency`)
- `amount_from` (number, required) — Amount in source currency
- `amount_to_estimate` (number, optional) — Estimated destination amount

**Output**:
```json
{
  "id": "conv_456",
  "direction": "FIAT_TO_CRYPTO",
  "from_currency": "BRL",
  "to_currency": "USDT",
  "amount_from": "1000.00",
  "amount_to_estimate": "198.50",
  "status": "PENDING"
}
```

---

### Withdraw Crypto

```
ashar_sacar_crypto { asset: "USDT", chain: "BSC", amount: 100, destination_address: "0x..." }
```

**Input**:
- `asset` (string, required) — `USDT` or `USDC`
- `chain` (string, required) — `ETHEREUM`, `BSC`, `POLYGON`, or `TRX`
- `amount` (number, required) — Amount to withdraw
- `destination_address` (string, required) — Destination wallet address
- `external_id` (string, optional) — Idempotency key

**Output**:
```json
{
  "id": "wdr_789",
  "external_id": "my-ref-001",
  "status": "PENDING",
  "approval_tier": "SINGLE_ADMIN",
  "amount": "100",
  "asset": "USDT",
  "chain": "BSC",
  "destination_address": "0xAbC123...",
  "amount_usd": "100.00"
}
```

### Generate Crypto Deposit Address

```
ashar_endereco_deposito_crypto { asset: "USDC", chain: "ETHEREUM" }
```

**Input**:
- `asset` (string, required) — `USDT` or `USDC`
- `chain` (string, required) — `ETHEREUM`, `BSC`, `POLYGON`, or `TRX`

**Output**:
```json
{
  "id": "addr_012",
  "asset": "USDC",
  "chain": "ETHEREUM",
  "address": "0xDeF456..."
}
```

---

## 🔒 Security

- **No hardcoded secrets.** Authentication uses `ASHAR_API_KEY` from environment variables only.
- **No `.env` committed.** The `.env` file is in `.gitignore`; only `.env.example` (template) is tracked.
- **Environment isolation.** API URL configurable via `ASHAR_API_URL` — use separate keys for staging and production.
- **Approval tiers.** High-value crypto withdrawals require admin approval (multi-sig above $10,000).

---

## 🛠️ Development

```bash
npm run dev     # Watch mode with auto-reload (tsx)
npm run build   # Compile TypeScript → dist/
npm run clean   # Remove dist/
```

### Project Structure

```
ashar_mcp/
├── mcp_ashar/                    # JSON descriptors (Trae / BlindPay format)
│   ├── SERVER_METADATA.json
│   └── tools/                    # 13 JSON tool definitions
├── src/                          # TypeScript MCP SDK server
│   ├── index.ts                  # Entry point (stdio + HTTP)
│   ├── types.ts                  # Type definitions & Zod schemas
│   ├── constants.ts              # Shared constants
│   ├── services/asharApi.ts      # HTTP client for Ashar API
│   └── tools/
│       ├── brlDeposit.ts         # BRL PIX deposit tools (3)
│       ├── conversion.ts         # Currency conversion tool (1)
│       ├── cryptoWithdrawal.ts   # Crypto withdrawal tools (2)
│       ├── cryptoDeposit.ts      # Crypto deposit tool (1)
│       ├── bankAccounts.ts       # Bank account CRUD tools (4)
│       └── fiatWithdrawal.ts     # Fiat withdrawal tools (2)
├── .env.example
├── .gitignore
├── package.json
├── tsconfig.json
└── LICENSE
```

---

## 📄 License

This project is provided under the Ashar Finance license. See [LICENSE](./LICENSE) for details.

---

<p align="center">
  Built by <a href="https://ashar.finance">Ashar Finance</a>
</p>
