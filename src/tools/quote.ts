/**
 * Exchange Rate / Quote Tools (BRL, USD, EUR, USDT, USDC)
 *
 * Ferramentas para cotacao de conversao entre as 5 moedas suportadas.
 * Usa OKX como fonte de cotacao (mid-market, sem spread).
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { QuoteInputSchema, PricesInputSchema, ResponseFormat } from "../types.js";
import { getExchangeRate, getPrices, handleApiError } from "../services/asharApi.js";

const CHARACTER_LIMIT = 25_000;

export function registerQuoteTools(server: McpServer) {
  // ── ashar_cotar_conversao ────────────────────────────────────────────────
  server.registerTool(
    "ashar_cotar_conversao",
    {
      title: "Cotar Conversao de Moeda (BRL, USD, EUR, USDT, USDC)",
      description: `Obtem a cotacao mid-market (sem spread) para conversao entre as 5 moedas suportadas.

Fonte: OKX (exchange). Pares estaveis (USD/USDT/USDC) tem rate = 1.

Se o parametro 'amount' for informado, retorna tambem o valor estimado na moeda de destino.

Moedas suportadas:
  - BRL (Real brasileiro)
  - USD (Dolar americano)
  - EUR (Euro)
  - USDT (Tether)
  - USDC (USD Coin)

Args:
  - from_currency (string): Moeda de origem
  - to_currency (string): Moeda de destino
  - amount (number, opcional): Valor a converter para estimativa
  - response_format ('markdown' | 'json'): Formato de saida (default: 'json')

Returns:
  Para JSON:
  {
    "rate": number,
    "spread_pct": number,
    "source": "OKX",
    "from_currency": string,
    "to_currency": string,
    "from_amount": number | null,
    "to_amount": number | null,
    "timestamp": string
  }

Exemplos de uso:
  - "Qual a cotacao de BRL para USDT?"
  - "Cotacao de 1000 reais em USDC"
  - "Quanto vale 500 USDT em reais?"
  - "Taxa de cambio USD para EUR"`,
      inputSchema: QuoteInputSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async (params) => {
      try {
        if (params.from_currency === params.to_currency) {
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify({
                  rate: 1,
                  spread_pct: 0,
                  source: "spot",
                  from_currency: params.from_currency,
                  to_currency: params.to_currency,
                  from_amount: params.amount ?? null,
                  to_amount: params.amount ?? null,
                  timestamp: new Date().toISOString(),
                  note: "Mesma moeda — rate 1:1",
                }, null, 2),
              },
            ],
          };
        }

        const quote = await getExchangeRate(
          params.from_currency,
          params.to_currency,
          params.api_key,
        );

        const toAmount = params.amount
          ? params.amount * quote.rate
          : null;

        const output = {
          rate: quote.rate,
          spread_pct: quote.spreadPct,
          source: quote.source,
          from_currency: params.from_currency,
          to_currency: params.to_currency,
          from_amount: params.amount ?? null,
          to_amount: toAmount != null ? Math.round(toAmount * 1e8) / 1e8 : null,
          timestamp: new Date().toISOString(),
        };

        let text: string;
        if (params.response_format === ResponseFormat.MARKDOWN) {
          const lines = [
            "# Cotacao de Conversao",
            "",
            `- **Par**: ${output.from_currency} → ${output.to_currency}`,
            `- **Taxa**: ${output.rate} ${output.to_currency}/${output.from_currency}`,
            `- **Spread**: ${output.spread_pct}%`,
            `- **Fonte**: ${output.source}`,
          ];
          if (output.from_amount != null && output.to_amount != null) {
            lines.push(
              `- **Conversao**: ${output.from_amount} ${output.from_currency} = ${output.to_amount} ${output.to_currency}`,
            );
          }
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

  // ── ashar_precos_moedas ──────────────────────────────────────────────────
  server.registerTool(
    "ashar_precos_moedas",
    {
      title: "Precos das Moedas em USD",
      description: `Retorna os precos atuais de todas as moedas suportadas em USD.

Fonte: OKX (exchange), cache de 30 segundos.

Precos:
  - BRL: cotacao OKX USDT/BRL convertida para USD
  - USD, USDT, USDC: $1.00 (pares estaveis)
  - EUR: 1.07 (peg fixo)
  - BTC: cotacao OKX BTC/USDT

Returns:
  Para JSON:
  {
    "BRL": number,
    "USD": number,
    "USDT": number,
    "USDC": number,
    "EUR": number,
    "BTC": number | null
  }

Exemplos de uso:
  - "Qual o preco das moedas em dolar?"
  - "Cotacao atual de todas as moedas"
  - "Preco do BTC em USD"`,
      inputSchema: PricesInputSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async (params) => {
      try {
        const prices = await getPrices();

        let text: string;
        if (params.response_format === ResponseFormat.MARKDOWN) {
          const lines = [
            "# Precos em USD",
            "",
            `| Moeda | Preco (USD) |`,
            `|-------|-------------|`,
            `| BRL | $${(prices.BRL ?? 0).toFixed(6)} |`,
            `| USD | $1.00 |`,
            `| USDT | $${(prices.USDT ?? 1).toFixed(2)} |`,
            `| USDC | $${(prices.USDC ?? 1).toFixed(2)} |`,
            `| EUR | $${(prices.EUR ?? 1.07).toFixed(2)} |`,
          ];
          if (prices.BTC != null) {
            lines.push(`| BTC | $${prices.BTC.toLocaleString()} |`);
          }
          text = lines.join("\n");
        } else {
          text = JSON.stringify(prices, null, 2);
        }

        return {
          content: [{ type: "text", text: text.slice(0, CHARACTER_LIMIT) }],
          structuredContent: prices,
        };
      } catch (error) {
        return { content: [{ type: "text", text: handleApiError(error) }] };
      }
    },
  );
}
