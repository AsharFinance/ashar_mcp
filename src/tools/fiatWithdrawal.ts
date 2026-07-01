/**
 * Fiat Withdrawal Tools (USD, EUR, BRL)
 *
 * Ferramentas para saque fiat na Ashar Finance.
 * Suporta BRL, USD e EUR como moeda de origem e destino.
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
  FiatWithdrawalCreateInputSchema,
  FiatWithdrawalListInputSchema,
  ResponseFormat,
} from "../types.js";
import {
  listRemittances,
  createRemittance,
  handleApiError,
} from "../services/asharApi.js";

const CHARACTER_LIMIT = 25_000;

export function registerFiatWithdrawalTools(server: McpServer) {
  // ── ashar_sacar_fiat ──────────────────────────────────────────────────────
  server.registerTool(
    "ashar_sacar_fiat",
    {
      title: "Sacar Fiat (BRL, USD, EUR)",
      description: `Cria uma ordem de saque fiat (remittance) na Ashar Finance.

Debita o saldo virtual na moeda de origem (source_currency) e envia o valor
convertido para uma conta bancaria na moeda de destino (target_currency).

Suporta saida via:
  - BRL → PIX (conta bancaria brasileira)
  - USD → Wire/ACH (conta bancaria americana)
  - EUR → SEPA (IBAN europeu)

A conta de destino pode ser informada via beneficiary_id (conta pre-cadastrada)
ou diretamente pelos campos de conta bancaria (beneficiary_name, bank_name, iban, swift, etc.).

Args:
  - amount (number): Valor a sacar na moeda de origem
  - source_currency (string): Moeda de origem (debitada do saldo): 'BRL', 'USD' ou 'EUR'
  - target_currency (string): Moeda de destino (recebida na conta): 'BRL', 'USD' ou 'EUR'
  - rate (number, opcional): Taxa de cambio desejada
  - spread_pct (number, opcional): Spread percentual (default: 2.5%)
  - received_foreign (number, opcional): Estimativa do valor a receber
  - beneficiary_id (string, opcional): ID da conta bancaria pre-cadastrada
  - beneficiary_name (string, opcional): Nome do beneficiario
  - bank_name (string, opcional): Nome do banco destino
  - account_type (string, opcional): CHECKING ou SAVINGS
  - iban (string, opcional): IBAN para destino EUR
  - swift (string, opcional): SWIFT/BIC do banco destino
  - response_format ('markdown' | 'json')

Returns:
  Para JSON:
  {
    "id": string,
    "status": string,
    "amount": number,
    "source_currency": string,
    "target_currency": string,
    "rate": number | null,
    "beneficiary_id": string | null,
    "created_at": string
  }

Exemplos de uso:
  - "Saca 1000 USD para minha conta bancaria nos EUA"
  - "Faz um saque de 500 EUR via SEPA para o IBAN X"
  - "Transfere 2000 BRL para a conta PIX cadastrada"`,
      inputSchema: FiatWithdrawalCreateInputSchema,
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: false,
        openWorldHint: true,
      },
    },
    async (params) => {
      try {
        if (params.source_currency === params.target_currency) {
          return {
            content: [{
              type: "text",
              text: "Erro: source_currency e target_currency devem ser diferentes. Use uma conta bancaria na mesma moeda para transferencias internas.",
            }],
          };
        }

        const order = await createRemittance({
          amount: params.amount,
          sourceCurrency: params.source_currency,
          targetCurrency: params.target_currency,
          rate: params.rate,
          spreadPct: params.spread_pct,
          receivedForeign: params.received_foreign,
          beneficiaryId: params.beneficiary_id,
          beneficiaryName: params.beneficiary_name,
          bankName: params.bank_name,
          accountType: params.account_type,
          iban: params.iban,
          swift: params.swift,
        }, params.api_key);

        const output = {
          id: order.id,
          status: order.status,
          amount: Number(order.amountBrl) || params.amount,
          source_currency: order.sourceCurrency,
          target_currency: order.targetCurrency,
          rate: order.rate ? Number(order.rate) : null,
          spread_pct: order.spreadPct ? Number(order.spreadPct) : null,
          received_foreign: order.receivedForeign ? Number(order.receivedForeign) : null,
          beneficiary_id: order.beneficiaryId ?? null,
          beneficiary_name: order.beneficiaryName ?? null,
          bank_name: order.bankName ?? null,
          iban: order.iban ?? null,
          swift: order.swift ?? null,
          created_at: order.createdAt,
          deposit_method: order.depositMethod ?? null,
        };

        let text: string;
        if (params.response_format === ResponseFormat.MARKDOWN) {
          const methodLabel =
            output.target_currency === "BRL" ? "PIX" :
            output.target_currency === "EUR" ? "SEPA" : "Wire";
          const lines = [
            "# Saque Fiat Solicitado",
            "",
            `- **ID**: \`${output.id}\``,
            `- **Valor**: ${output.amount} ${output.source_currency}`,
            `- **Destino**: ${output.target_currency} via ${methodLabel}`,
          ];
          if (output.rate) lines.push(`- **Taxa de cambio**: ${output.rate}`);
          if (output.received_foreign) lines.push(`- **Estimativa de recebimento**: ${output.received_foreign} ${output.target_currency}`);
          if (output.beneficiary_name) lines.push(`- **Beneficiario**: ${output.beneficiary_name}`);
          if (output.bank_name) lines.push(`- **Banco**: ${output.bank_name}`);
          if (output.iban) lines.push(`- **IBAN**: ${output.iban}`);
          if (output.swift) lines.push(`- **SWIFT**: ${output.swift}`);
          lines.push(`- **Status**: ${output.status}`,
            "",
            "Use `ashar_listar_saques_fiat` para acompanhar o status.");
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

  // ── ashar_listar_saques_fiat ──────────────────────────────────────────────
  server.registerTool(
    "ashar_listar_saques_fiat",
    {
      title: "Listar Saques Fiat",
      description: `Lista o historico de saques fiat (remittance orders) do usuario na Ashar Finance.

Args:
  - response_format ('markdown' | 'json'): Formato de saida (default: 'json')

Returns:
  Para JSON: Array de ordens de saque com status, valores e destino.

Exemplos de uso:
  - "Mostra meus saques fiat recentes"
  - "Historico de remessas"
  - "Quais saques em USD eu ja fiz?"`,
      inputSchema: FiatWithdrawalListInputSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async (params) => {
      try {
        const orders = await listRemittances(params.api_key);

        if (!orders.length) {
          return {
            content: [{ type: "text", text: "Nenhum saque fiat encontrado." }],
          };
        }

        const items = orders.map((o: any) => ({
          id: o.id,
          amount: Number(o.amountBrl) || 0,
          source_currency: o.sourceCurrency,
          target_currency: o.targetCurrency,
          rate: o.rate ? Number(o.rate) : null,
          spread_pct: o.spreadPct ? Number(o.spreadPct) : null,
          received_foreign: o.receivedForeign ? Number(o.receivedForeign) : null,
          status: o.status,
          beneficiary_name: o.beneficiaryName ?? null,
          bank_name: o.bankName ?? null,
          created_at: o.createdAt,
        }));

        const output = { orders: items, total: items.length };

        let text: string;
        if (params.response_format === ResponseFormat.MARKDOWN) {
          const lines = ["# Saques Fiat", ""];
          for (const o of items) {
            const emoji = o.status === "COMPLETED" ? "✅" : o.status === "FAILED" ? "❌" : "⏳";
            lines.push(
              `- ${emoji} ${o.amount} ${o.source_currency} → ${o.target_currency} — ${o.status} — ${o.created_at}`,
            );
            if (o.beneficiary_name) lines.push(`  Beneficiario: ${o.beneficiary_name}`);
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
}
