/**
 * Wallet Composition Tools (Notus + Ashar Management + CaaS)
 *
 * Ferramentas para visualizar a composicao de carteiras do usuario
 * em todas as camadas: VirtualLedger (Management), Smart Accounts Notus (CaaS),
 * e wallets BlindPay (CaaS).
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WalletsListInputSchema, SupportedPairsInputSchema, ResponseFormat } from "../types.js";
import {
  getWalletComposition,
  getSupportedPairs,
  resolveProvider,
  handleApiError,
} from "../services/asharApi.js";
import { CHAIN_PROVIDER } from "../constants.js";

const CHARACTER_LIMIT = 25_000;

export function registerWalletTools(server: McpServer) {
  // ── ashar_listar_carteiras ───────────────────────────────────────────────
  server.registerTool(
    "ashar_listar_carteiras",
    {
      title: "Listar Carteiras (Notus + Management + CaaS)",
      description: `Lista a composicao completa das carteiras do usuario, integrando as 3 camadas:

1. **VirtualLedger (Ashar Management):** saldos contabeis por moeda (BRL, USD, EUR, USDT, USDC)
2. **Smart Accounts Notus (CaaS):** carteiras ERC-4337 para eth/polygon/bsc
   - Signer EOA custodiada, Smart Account Kernel v3.3
   - Um endereco multi-asset por chain
3. **Wallets BlindPay (CaaS):** custodia terceirizada para solana/tron/stellar/base/arbitrum
   - BlindPay gerencia a chave privada

Mostra a arquitetura completa de wallets do usuario:
- Saldo virtual (todas as moedas)
- Enderecos de deposito on-chain (com chain, asset e provider)
- Provider de cada chain (Notus, BlindPay, Alchemy)
- Pares chain/asset suportados para deposito

Args:
  - chain (string, opcional): Filtrar por chain ('eth', 'polygon', 'bsc', 'tron', etc.)
  - response_format ('markdown' | 'json'): Formato de saida (default: 'json')

Returns:
  Para JSON:
  {
    "balances": { "brl": number, "usd": number, "eur": number, "usdt": number, "usdc": number },
    "addresses": [{
      "address": string,
      "chain": string,
      "asset": string,
      "provider": "notus" | "blindpay" | "alchemy",
      "label": string | null,
      "created_at": string
    }],
    "total": { "addresses": number, "currencies": number }
  }

Exemplos de uso:
  - "Quais carteiras eu tenho?"
  - "Lista minhas carteiras na Ethereum"
  - "Qual a composicao das minhas wallets?"
  - "Mostra minhas Smart Accounts Notus"`,
      inputSchema: WalletsListInputSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async (params) => {
      try {
        const { balances, addresses } = await getWalletComposition(params.api_key);

        // Enrich addresses with provider info
        const enriched = addresses.map((a: any) => ({
          address: a.address,
          chain: a.chain,
          asset: a.asset ?? null,
          provider: resolveProvider(a.chain || ""),
          label: a.label ?? null,
          created_at: a.createdAt ?? a.created_at ?? null,
        }));

        // Filter by chain if specified
        const filtered = params.chain
          ? enriched.filter((a) =>
              a.chain?.toLowerCase() === String(params.chain).toLowerCase(),
            )
          : enriched;

        const output = {
          balances,
          addresses: filtered,
          total: {
            addresses: filtered.length,
            currencies: Object.keys(balances).filter((k) => balances[k] > 0).length,
          },
        };

        let text: string;
        if (params.response_format === ResponseFormat.MARKDOWN) {
          const lines = [
            "# Composicao de Carteiras Ashar",
            "",
            "## Saldos (VirtualLedger)",
            "",
            `| Moeda | Saldo |`,
            `|-------|-------|`,
            `| BRL | R$ ${balances.brl.toFixed(2)} |`,
            `| USD | $ ${balances.usd.toFixed(2)} |`,
            `| EUR | € ${balances.eur.toFixed(2)} |`,
            `| USDT | ${balances.usdt.toFixed(2)} |`,
            `| USDC | ${balances.usdc.toFixed(2)} |`,
            "",
            "## Enderecos On-Chain",
            "",
          ];

          if (filtered.length === 0) {
            lines.push("Nenhum endereco de deposito encontrado. Use `ashar_endereco_deposito_crypto` para criar um.");
          } else {
            lines.push(`| Provider | Chain | Asset | Address |`);
            lines.push(`|----------|-------|-------|---------|`);
            for (const a of filtered) {
              const shortAddr = a.address
                ? `${a.address.slice(0, 6)}...${a.address.slice(-4)}`
                : "—";
              lines.push(
                `| ${a.provider.toUpperCase()} | ${a.chain} | ${a.asset ?? "multi"} | \`${shortAddr}\` |`,
              );
            }
          }

          lines.push(
            "",
            "## Provedores por Chain",
            "",
            ...Object.entries(CHAIN_PROVIDER).map(
              ([chain, provider]) => `- **${chain}**: ${provider}`,
            ),
            "",
            `> **Total**: ${filtered.length} endereco(s) | ${output.total.currencies} moeda(s) com saldo`,
          );

          text = lines.join("\n");
        } else {
          text = JSON.stringify(output, null, 2);
        }

        return {
          content: [{ type: "text", text: text.slice(0, CHARACTER_LIMIT) }],
          structuredContent: output,
        };
      } catch (error) {
        return { content: [{ type: "text", text: handleApiError(error) }] };
      }
    },
  );

  // ── ashar_suportados_deposito ────────────────────────────────────────────
  server.registerTool(
    "ashar_suportados_deposito",
    {
      title: "Pares Chain/Asset Suportados para Deposito",
      description: `Lista todos os pares chain/asset suportados para deposito crypto na Ashar Finance.

Mostra quais blockchains e ativos (USDT/USDC) estao disponiveis para recebimento,
com informacao do provedor de custodia para cada chain.

Chains EVM (eth, polygon, bsc) → Provider: Notus (Smart Accounts ERC-4337)
Chains nao-EVM (solana, tron, stellar, base, arbitrum) → Provider: BlindPay

Returns:
  Para JSON:
  {
    "pairs": [{ "chain": string, "asset": string, "provider": string }],
    "total": number
  }

Exemplos de uso:
  - "Em quais chains eu posso depositar USDT?"
  - "Quais pares chain/asset sao suportados?"
  - "Posso receber USDC na Polygon?"`,
      inputSchema: SupportedPairsInputSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async (params: any) => {
      try {
        const pairs = await getSupportedPairs(params.api_key);

        const enriched = pairs.map((p: any) => ({
          chain: p.chain,
          asset: p.asset,
          provider: resolveProvider(p.chain || ""),
        }));

        const output = {
          pairs: enriched,
          total: enriched.length,
        };

        let text: string;
        if (params.response_format === ResponseFormat.MARKDOWN) {
          const lines = [
            "# Pares Suportados para Deposito",
            "",
            "| Provider | Chain | Asset |",
            "|----------|-------|-------|",
          ];
          for (const p of enriched) {
            lines.push(`| ${p.provider.toUpperCase()} | ${p.chain} | ${p.asset} |`);
          }
          lines.push(
            "",
            "Use `ashar_endereco_deposito_crypto` para gerar um endereco de deposito.",
          );
          text = lines.join("\n");
        } else {
          text = JSON.stringify(output, null, 2);
        }

        return {
          content: [{ type: "text", text: text.slice(0, CHARACTER_LIMIT) }],
          structuredContent: output,
        };
      } catch (error) {
        return { content: [{ type: "text", text: handleApiError(error) }] };
      }
    },
  );
}
