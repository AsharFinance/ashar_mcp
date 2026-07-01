/**
 * Conversion Tools (BRL, USD, EUR, USDT, USDC)
 *
 * Ferramentas para conversao entre BRL, USD, EUR, USDT e USDC na Ashar Finance.
 * Suporta todas as direcoes entre as 5 moedas.
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { ConversionCreateInputSchema, ResponseFormat } from "../types.js";
import { createConversion, handleApiError } from "../services/asharApi.js";

const CHARACTER_LIMIT = 25_000;

export function registerConversionTools(server: McpServer) {
  // ── ashar_converter_moeda ─────────────────────────────────────────────────
  server.registerTool(
    "ashar_converter_moeda",
    {
      title: "Converter Moeda (BRL, USD, EUR, USDT, USDC)",
      description: `Cria uma solicitacao de conversao de moeda na Ashar Finance.

Suporta conversao entre as 5 moedas:
  - BRL (Real)
  - USD (Dolar)
  - EUR (Euro)
  - USDT (Tether)
  - USDC (USD Coin)

Qualquer par e aceito (ex: BRL → USDT, USD → BRL, EUR → USDC, USDT → EUR, etc.).
A conversao fica com status PENDING ate ser aprovada por um administrador.

Args:
  - from_currency (string): Moeda de origem: 'BRL', 'USD', 'EUR', 'USDT' ou 'USDC'
  - to_currency (string): Moeda de destino: 'BRL', 'USD', 'EUR', 'USDT' ou 'USDC'
  - amount_from (number): Valor a converter na moeda de origem
  - amount_to_estimate (number, optional): Estimativa do valor de destino
  - response_format ('markdown' | 'json'): Formato de saida (default: 'json')

Returns:
  Para JSON:
  {
    "id": string,
    "direction": string,
    "from_currency": string,
    "to_currency": string,
    "amount_from": string,
    "amount_to_estimate": string | null,
    "status": string,
    "created_at": string
  }

Exemplos de uso:
  - "Converter 1000 BRL para USDT"
  - "Quero transformar 500 USDC em reais"
  - "Converte 100 USD para EUR"
  - "Troca 200 EUR por USDC"`,
      inputSchema: ConversionCreateInputSchema,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
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
                text: "Erro: from_currency e to_currency devem ser diferentes.",
              },
            ],
          };
        }

        const result = await createConversion({
          fromCurrency: params.from_currency,
          toCurrency: params.to_currency,
          amountFrom: params.amount_from,
          amountToEstimate: params.amount_to_estimate,
        }, params.api_key);

        const record = result.record ?? result;

        const output = {
          id: record.id,
          direction: record.direction,
          from_currency: record.fromCurrency,
          to_currency: record.toCurrency,
          amount_from: String(record.amountFrom),
          amount_to_estimate: record.amountToEstimate ? String(record.amountToEstimate) : null,
          status: record.status,
          created_at: record.createdAt,
          created: result.created ?? !result.record,
        };

        let text: string;
        if (params.response_format === ResponseFormat.MARKDOWN) {
          const lines = [
            "# Conversao Solicitada",
            "",
            `- **ID**: ${output.id}`,
            `- **De**: ${output.amount_from} ${output.from_currency}`,
            `- **Para**: ${output.amount_to_estimate ?? "—"} ${output.to_currency}`,
            `- **Direcao**: ${output.direction}`,
            `- **Status**: ${output.status}`,
            `- **Criado em**: ${output.created_at}`,
            "",
            output.status === "PENDING"
              ? "A conversao esta pendente de aprovacao por um administrador."
              : "",
          ];
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
