# Ashar Finance MCP Server

Servidor MCP (Model Context Protocol) que expoe operacoes da Ashar Finance para integracao em qualquer cliente MCP (Claude Desktop, Cursor, Windsurf, Trae, etc.).

---

## Estrutura

```
packages/ashar-mcp-server/
├── mcp_ashar/                  # Descritores JSON (formato BlindPay)
│   ├── SERVER_METADATA.json
│   └── tools/
│       ├── PostV1BrlDeposits.json
│       ├── GetV1BrlDeposits.json
│       ├── GetV1BrlDepositsByTxid.json
│       ├── PostV1Conversions.json
│       ├── PostV1CryptoWithdrawals.json
│       ├── GetV1CryptoWithdrawalsByExternalId.json
│       └── PostV1CryptoDepositAddresses.json
├── src/                        # TypeScript MCP SDK server
│   ├── index.ts
│   ├── types.ts
│   ├── constants.ts
│   └── tools/
│       ├── brlDeposit.ts
│       ├── conversion.ts
│       ├── cryptoWithdrawal.ts
│       └── cryptoDeposit.ts
└── README.md
```

---

## Operacoes Disponiveis

### Deposito BRL (PIX)

| Ferramenta (MCP SDK) | Descritor JSON | Descricao |
|---|---|---|
| `ashar_criar_deposito_brl` | `PostV1BrlDeposits` | Cria cobranca PIX para deposito em BRL |
| `ashar_consultar_deposito_brl` | `GetV1BrlDepositsByTxid` | Consulta status de um deposito pelo TXID |
| `ashar_listar_depositos_brl` | `GetV1BrlDeposits` | Lista historico de depositos BRL |

### Conversao de Moedas

| Ferramenta (MCP SDK) | Descritor JSON | Descricao |
|---|---|---|
| `ashar_converter_moeda` | `PostV1Conversions` | Converte entre BRL, USD, EUR, USDT e USDC |

### Saque Crypto (USDT/USDC)

| Ferramenta (MCP SDK) | Descritor JSON | Descricao |
|---|---|---|
| `ashar_sacar_crypto` | `PostV1CryptoWithdrawals` | Saca USDT/USDC para carteira externa |
| `ashar_consultar_saque_crypto` | `GetV1CryptoWithdrawalsByExternalId` | Consulta status de saque crypto |

### Deposito Crypto (USDT/USDC)

| Ferramenta (MCP SDK) | Descritor JSON | Descricao |
|---|---|---|
| `ashar_endereco_deposito_crypto` | `PostV1CryptoDepositAddresses` | Gera endereco para deposito de USDT/USDC |

---

## Modo 1: Descritores JSON (`mcp_ashar/`)

Mesmo padrao usado pelo MCP da BlindPay. Cada arquivo `.json` em `mcp_ashar/tools/` define uma ferramenta MCP com nome, descricao e schema de argumentos.

**Formato:**

```json
{
  "name": "PostV1Conversions",
  "description": "Create Currency Conversion",
  "arguments": {
    "type": "object",
    "properties": {
      "api_key": {
        "type": "string",
        "minLength": 1,
        "description": "Ashar API key (Bearer token)"
      },
      "requestBody": {
        "type": "object",
        "properties": {
          "from_currency": {
            "type": "string",
            "enum": ["BRL", "USD", "EUR", "USDT", "USDC"],
            "description": "Moeda de origem"
          },
          ...
        },
        "required": ["from_currency", "to_currency", "amount_from"],
        "description": "Cria uma solicitacao de conversao entre moedas..."
      }
    },
    "required": ["api_key"]
  }
}
```

**Para usar** — copie a pasta `mcp_ashar/` para o diretorio de MCPs da sua plataforma e configure o runtime MCP com a URL base `https://api.ashar.finance`.

---

## Modo 2: TypeScript MCP SDK (`src/`)

Servidor MCP completo usando `@modelcontextprotocol/sdk`. Pode rodar via stdio (local) ou HTTP (remoto).

### Configuracao

```bash
cp .env.example .env
# Preencha ASHAR_API_KEY com sua chave de API Ashar
npm install && npm run build
```

### Variaveis de Ambiente

| Variavel | Obrigatoria | Padrao | Descricao |
|---|---|---|---|
| `ASHAR_API_KEY` | Sim | — | Bearer token da API Ashar |
| `ASHAR_API_URL` | Nao | `https://api.ashar.finance` | URL base da API Ashar |
| `ASHAR_TRANSPORT` | Nao | `stdio` | `stdio` (local) ou `http` (remoto) |
| `PORT` | Nao | `3000` | Porta HTTP (apenas com `ASHAR_TRANSPORT=http`) |

### Claude Desktop

Adicione ao `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "ashar": {
      "command": "node",
      "args": ["dist/index.js"],
      "env": {
        "ASHAR_API_KEY": "sua-chave-api",
        "ASHAR_API_URL": "https://api.ashar.finance"
      }
    }
  }
}
```

### Servidor HTTP

```bash
ASHAR_TRANSPORT=http ASHAR_API_KEY=sua-chave npm start
# Disponivel em http://localhost:3000/mcp
# Health check: http://localhost:3000/health
```

### Desenvolvimento

```bash
npm run dev     # tsx watch com auto-reload
npm run build   # compila TypeScript
npm run clean   # remove dist/
```
