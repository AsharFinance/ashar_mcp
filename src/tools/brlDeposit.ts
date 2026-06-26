/**
 * BRL Deposit Tools
 *
 * Ferramentas para deposito em BRL via PIX na Ashar Finance.
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
  BrlDepositCreateInputSchema,
  BrlDepositStatusInputSchema,
  BrlDepositListInputSchema,
  ResponseFormat,
} from "../types.js";
import {
  createBrlDeposit,
  getBrlDepositStatus,
  listBrlDeposits,
  handleApiError,
} from "../services/asharApi.js";

const CHARACTER_LIMIT = 25_000;

export function registerBrlDepositTools(server: McpServer) {
  // ── ashar_criar_deposito_brl ──────────────────────────────────────────────
  server.registerTool(
    "ashar_criar_deposito_brl",
    {
      title: "Criar Deposito BRL via PIX",
      description: `Cria uma cobranca PIX para deposito em BRL na Ashar Finance.

Gera um QR Code PIX (copia-e-cola) que o usuario pode pagar para creditar BRL na conta.

Args:
  - amount_brl (number): Valor do deposito em reais (ex: 100.00)
  - response_format ('markdown' | 'json'): Formato de saida (default: 'json')

Returns:
  Para JSON:
  {
    "id": string,
    "txid": string,
    "amount_brl": number,
    "pix_copy_paste": string,
    "status": string,
    "expires_at": string,
    "created_at": string
  }

Exemplos de uso:
  - "Cria um deposito de R$ 500"
  - "Gera um PIX de 150 reais para depositar"`,
      inputSchema: BrlDepositCreateInputSchema,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true,
      },
    },
    async (params) => {
      try {
        const deposit = await createBrlDeposit(params.amount_brl);

        const output = {
          id: deposit.id,
          txid: deposit.txid,
          amount_brl: Number(deposit.amount_brl),
          pix_copy_paste: deposit.pix_copy_paste,
          status: deposit.status,
          expires_at: deposit.expires_at,
          created_at: deposit.created_at,
        };

        let text: string;
        if (params.response_format === ResponseFormat.MARKDOWN) {
          const lines = [
            "# Deposito BRL Criado",
            "",
            `- **ID**: ${output.id}`,
            `- **Valor**: R$ ${output.amount_brl.toFixed(2)}`,
            `- **Status**: ${output.status}`,
            `- **Expira em**: ${output.expires_at}`,
            "",
            "## PIX Copia-e-Cola",
            "```",
            output.pix_copy_paste,
            "```",
            "",
            `Use \`ashar_consultar_deposito_brl\` com txid \`${output.txid}\` para consultar o status.`,
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

  // ── ashar_consultar_deposito_brl ──────────────────────────────────────────
  server.registerTool(
    "ashar_consultar_deposito_brl",
    {
      title: "Consultar Status de Deposito BRL",
      description: `Consulta o status de um deposito BRL via PIX na Ashar Finance.

Use esta ferramenta para verificar se um deposito PIX foi confirmado (PAID).

Args:
  - txid (string): Transaction ID do deposito
  - response_format ('markdown' | 'json'): Formato de saida (default: 'json')

Returns:
  Para JSON:
  {
    "id": string,
    "txid": string,
    "amount_brl": number,
    "status": "PENDING" | "PAID" | "FAILED",
    "paid_at": string | null,
    "upstream_status": string | null
  }

Exemplos de uso:
  - "O deposito do txid abc123 ja foi confirmado?"
  - "Verifica se o PIX do pedido X foi pago"`,
      inputSchema: BrlDepositStatusInputSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async (params) => {
      try {
        const data = await getBrlDepositStatus(params.txid);

        const output = {
          id: data.id ?? null,
          txid: data.txid,
          amount_brl: Number(data.amount_brl) || 0,
          pix_copy_paste: data.pix_copy_paste ?? null,
          status: data.status,
          expires_at: data.expires_at ?? null,
          created_at: data.created_at ?? null,
          paid_at: data.paid_at ?? null,
          upstream_status: data.upstream_status ?? null,
        };

        let text: string;
        if (params.response_format === ResponseFormat.MARKDOWN) {
          const statusEmoji =
            output.status === "PAID" ? "✅" : output.status === "FAILED" ? "❌" : "⏳";
          const lines = [
            `# Deposito BRL: ${statusEmoji} ${output.status}`,
            "",
            `- **TXID**: ${output.txid}`,
            `- **Valor**: R$ ${output.amount_brl.toFixed(2)}`,
            `- **Status**: ${output.status}`,
          ];
          if (output.paid_at) lines.push(`- **Pago em**: ${output.paid_at}`);
          if (output.expires_at) lines.push(`- **Expira em**: ${output.expires_at}`);
          if (output.upstream_status) {
            lines.push(`- **Status no provedor**: ${output.upstream_status}`);
          }
          text = lines.join("\n");
        } else {
          text = JSON.stringify(output, null, 2);
        }

        return {
          content: [{ type: "text", text }],
          structuredContent: output,
        };
      } catch (error) {
        return { content: [{ type: "text", text: handleApiError(error) }] };
      }
    },
  );

  // ── ashar_listar_depositos_brl ────────────────────────────────────────────
  server.registerTool(
    "ashar_listar_depositos_brl",
    {
      title: "Listar Depositos BRL",
      description: `Lista os depositos BRL via PIX do usuario na Ashar Finance.

Args:
  - limit (number): Maximo de resultados (default: 30, max: 100)
  - response_format ('markdown' | 'json'): Formato de saida (default: 'json')

Returns:
  Para JSON: Array de depositos com status, valores e datas.

Exemplos de uso:
  - "Lista meus depositos recentes"
  - "Mostra o historico de depositos PIX"`,
      inputSchema: BrlDepositListInputSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async (params) => {
      try {
        const deposits = await listBrlDeposits(params.limit);

        if (!deposits.length) {
          return {
            content: [{ type: "text", text: "Nenhum deposito BRL encontrado." }],
          };
        }

        const items = deposits.map((d: any) => ({
          id: d.id,
          txid: d.txid,
          amount_brl: Number(d.amount_brl) || 0,
          status: d.status,
          created_at: d.created_at,
          paid_at: d.paid_at ?? null,
        }));

        const output = {
          total: items.length,
          count: items.length,
          offset: 0,
          items,
          has_more: false,
        };

        let text: string;
        if (params.response_format === ResponseFormat.MARKDOWN) {
          const lines = ["# Depositos BRL", ""];
          for (const d of items) {
            const statusEmoji = d.status === "PAID" ? "✅" : d.status === "FAILED" ? "❌" : "⏳";
            lines.push(
              `- ${statusEmoji} R$ ${d.amount_brl.toFixed(2)} — ${d.status} — ${d.created_at}`,
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
}
