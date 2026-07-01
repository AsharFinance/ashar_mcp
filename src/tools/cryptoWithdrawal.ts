/**
 * Crypto Withdrawal Tools (USDT / USDC)
 *
 * Ferramentas para saque de USDT e USDC na Ashar Finance.
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
  CryptoWithdrawalCreateInputSchema,
  CryptoWithdrawalStatusInputSchema,
  ResponseFormat,
} from "../types.js";
import {
  createCryptoWithdrawal,
  getCryptoWithdrawalStatus,
  handleApiError,
} from "../services/asharApi.js";

const CHARACTER_LIMIT = 25_000;

export function registerCryptoWithdrawalTools(server: McpServer) {
  // ── ashar_sacar_crypto ────────────────────────────────────────────────────
  server.registerTool(
    "ashar_sacar_crypto",
    {
      title: "Sacar USDT/USDC",
      description: `Cria uma solicitacao de saque de USDT ou USDC para uma carteira externa na Ashar Finance.

O saque debita o saldo virtual e envia os fundos para o endereco de destino na blockchain especificada.

Tiers de aprovacao:
  - Ate $1,000: AUTO (imediato)
  - $1,000 - $10,000: SINGLE_ADMIN (1 aprovacao)
  - Acima de $10,000: MULTI_SIG (2 de 3 admins)

Args:
  - asset (string): Ativo a sacar: 'USDT' ou 'USDC'
  - chain (string): Blockchain de destino (ex: 'ETHEREUM', 'BSC', 'POLYGON', 'TRX')
  - amount (number): Quantidade a sacar
  - destination_address (string): Endereco da carteira de destino
  - external_id (string, optional): ID externo para idempotencia
  - response_format ('markdown' | 'json'): Formato de saida (default: 'json')

Returns:
  Para JSON:
  {
    "id": string,
    "external_id": string,
    "status": string,
    "approval_tier": "AUTO" | "SINGLE_ADMIN" | "MULTI_SIG",
    "amount": string,
    "asset": string,
    "chain": string,
    "destination_address": string,
    "amount_usd": string,
    "required_signatures": number | null,
    "timelock_until": string | null,
    "created_at": string
  }

Exemplos de uso:
  - "Sacar 100 USDT para minha carteira na BSC"
  - "Envia 50 USDC para o endereco 0x123... na Ethereum"
  - "Fazer um saque de 500 USDT"`,
      inputSchema: CryptoWithdrawalCreateInputSchema,
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: false,
        openWorldHint: true,
      },
    },
    async (params) => {
      try {
        const withdrawal = await createCryptoWithdrawal({
          asset: params.asset,
          chain: params.chain,
          amount: params.amount,
          destinationAddress: params.destination_address,
          externalId: params.external_id,
        }, params.api_key);

        const output = {
          id: withdrawal.id,
          external_id: withdrawal.externalId,
          status: withdrawal.status,
          approval_tier: withdrawal.approvalTier,
          amount: withdrawal.amount,
          asset: withdrawal.asset,
          chain: withdrawal.chain,
          destination_address: withdrawal.destinationAddress,
          amount_usd: withdrawal.amountUsd,
          required_signatures: withdrawal.requiredSignatures ?? null,
          timelock_until: withdrawal.timelockUntil ?? null,
          created_at: withdrawal.createdAt,
        };

        let text: string;
        if (params.response_format === ResponseFormat.MARKDOWN) {
          const lines = [
            "# Saque Crypto Solicitado",
            "",
            `- **ID**: ${output.id}`,
            `- **External ID**: ${output.external_id}`,
            `- **Ativo**: ${output.asset}`,
            `- **Rede**: ${output.chain}`,
            `- **Valor**: ${output.amount} ${output.asset} (~$${output.amount_usd})`,
            `- **Destino**: \`${output.destination_address}\``,
            `- **Status**: ${output.status}`,
            `- **Tier de aprovacao**: ${output.approval_tier}`,
          ];
          if (output.required_signatures != null) {
            lines.push(`- **Assinaturas necessarias**: ${output.required_signatures}`);
          }
          if (output.timelock_until) {
            lines.push(`- **Timelock ate**: ${output.timelock_until}`);
          }

          let hint = "";
          switch (output.approval_tier) {
            case "AUTO":
              hint = "Saque sera processado automaticamente.";
              break;
            case "SINGLE_ADMIN":
              hint = "Saque requer aprovacao de 1 administrador.";
              break;
            case "MULTI_SIG":
              hint = "Saque requer aprovacao multi-assinatura (2 de 3 administradores).";
              break;
          }
          lines.push("", hint, "", `Use \`ashar_consultar_saque_crypto\` com external_id \`${output.external_id}\` para acompanhar.`);
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

  // ── ashar_consultar_saque_crypto ──────────────────────────────────────────
  server.registerTool(
    "ashar_consultar_saque_crypto",
    {
      title: "Consultar Status de Saque Crypto",
      description: `Consulta o status de um saque de USDT/USDC na Ashar Finance.

Args:
  - external_id (string): External ID do saque (retornado na criacao)
  - response_format ('markdown' | 'json'): Formato de saida (default: 'json')

Returns:
  Para JSON:
  {
    "id": string,
    "external_id": string,
    "status": string,
    "approval_tier": string,
    "amount": string,
    "asset": string,
    "chain": string,
    "destination_address": string,
    "created_at": string,
    "tx_hash": string | null
  }

Exemplos de uso:
  - "Qual o status do saque crypto-wd-123?"
  - "O saque de USDT ja foi processado?"`,
      inputSchema: CryptoWithdrawalStatusInputSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async (params) => {
      try {
        const data = await getCryptoWithdrawalStatus(params.external_id, params.api_key);

        const output = {
          id: data?.id ?? null,
          external_id: data?.externalId ?? params.external_id,
          status: data?.status ?? "UNKNOWN",
          approval_tier: data?.approvalTier ?? null,
          amount: data?.amount ?? null,
          asset: data?.asset ?? null,
          chain: data?.chain ?? null,
          destination_address: data?.destinationAddress ?? null,
          created_at: data?.createdAt ?? null,
          tx_hash: data?.txHash ?? null,
        };

        let text: string;
        if (params.response_format === ResponseFormat.MARKDOWN) {
          const statusEmoji =
            output.status === "COMPLETED"
              ? "✅"
              : output.status === "FAILED"
                ? "❌"
                : "⏳";
          const lines = [
            `# Saque Crypto: ${statusEmoji} ${output.status}`,
            "",
            `- **External ID**: ${output.external_id}`,
          ];
          if (output.amount) lines.push(`- **Valor**: ${output.amount} ${output.asset}`);
          if (output.chain) lines.push(`- **Rede**: ${output.chain}`);
          if (output.destination_address) lines.push(`- **Destino**: \`${output.destination_address}\``);
          if (output.tx_hash) lines.push(`- **TX Hash**: \`${output.tx_hash}\``);
          if (output.created_at) lines.push(`- **Criado em**: ${output.created_at}`);
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
}
