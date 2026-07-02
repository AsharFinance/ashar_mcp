/**
 * Balance Tool (BRL, USD, EUR, USDT, USDC)
 *
 * Consulta o saldo do Virtual Ledger do usuario na Ashar Finance.
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { BalanceInputSchema, ResponseFormat } from "../types.js";
import { getBalances, handleApiError } from "../services/asharApi.js";

const CHARACTER_LIMIT = 25_000;

export function registerBalanceTools(server: McpServer) {
  server.registerTool(
    "ashar_consultar_saldo",
    {
      title: "Consultar Saldo (BRL, USD, EUR, USDT, USDC)",
      description: `Consulta o saldo de todas as moedas do usuario na Ashar Finance.

Retorna os saldos de BRL, USD, EUR, USDT e USDC do Virtual Ledger.
O usuario e identificado pela API Key fornecida.

Args:
  - response_format ('markdown' | 'json'): Formato de saida (default: 'json')

Returns:
  Para JSON:
  {
    "brl": number,
    "usd": number,
    "eur": number,
    "usdt": number,
    "usdc": number
  }

Exemplos de uso:
  - "Qual meu saldo?"
  - "Quanto tenho em USDT?"
  - "Consulta saldo da minha conta"`,
      inputSchema: BalanceInputSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async (params) => {
      try {
        const balances = await getBalances(params.api_key);

        let text: string;
        if (params.response_format === ResponseFormat.MARKDOWN) {
          const lines = [
            "# Saldo Atual",
            "",
            `| Moeda | Saldo |`,
            `|-------|-------|`,
            `| BRL | R$ ${balances.brl.toFixed(2)} |`,
            `| USD | $ ${balances.usd.toFixed(2)} |`,
            `| EUR | € ${balances.eur.toFixed(2)} |`,
            `| USDT | ${balances.usdt.toFixed(2)} |`,
            `| USDC | ${balances.usdc.toFixed(2)} |`,
          ];
          text = lines.join("\n");
        } else {
          text = JSON.stringify(balances, null, 2);
        }

        return {
          content: [{ type: "text", text: text.slice(0, CHARACTER_LIMIT) }],
          structuredContent: balances,
        };
      } catch (error) {
        return { content: [{ type: "text", text: handleApiError(error) }] };
      }
    },
  );
}
