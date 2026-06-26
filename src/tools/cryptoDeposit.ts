/**
 * Crypto Deposit Tools (USDT / USDC)
 *
 * Ferramentas para deposito de USDT e USDC na Ashar Finance.
 * Gera enderecos de custodia para recebimento on-chain.
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { CryptoDepositAddressInputSchema, ResponseFormat } from "../types.js";
import { getCryptoDepositAddress, handleApiError } from "../services/asharApi.js";

const CHARACTER_LIMIT = 25_000;

export function registerCryptoDepositTools(server: McpServer) {
  // ── ashar_endereco_deposito_crypto ────────────────────────────────────────
  server.registerTool(
    "ashar_endereco_deposito_crypto",
    {
      title: "Gerar Endereco de Deposito USDT/USDC",
      description: `Gera um endereco de custodia para deposito de USDT ou USDC na Ashar Finance.

Use esta ferramenta para obter um endereco on-chain onde o usuario pode enviar USDT ou USDC.
O deposito sera creditado automaticamente apos as confirmacoes da blockchain.

Args:
  - asset (string): Ativo a receber: 'USDT' ou 'USDC'
  - chain (string): Blockchain de origem (ex: 'ETHEREUM', 'BSC', 'POLYGON', 'TRX')
  - response_format ('markdown' | 'json'): Formato de saida (default: 'json')

Returns:
  Para JSON:
  {
    "id": string,
    "asset": string,
    "chain": string,
    "address": string,
    "created_at": string
  }

Importante:
  - Envie APENAS o ativo correto (USDT ou USDC) na rede correta
  - Enviar o ativo errado ou na rede errada pode resultar em perda permanente dos fundos
  - O deposito e creditado apos o numero minimo de confirmacoes da blockchain

Exemplos de uso:
  - "Qual o endereco para depositar USDT na BSC?"
  - "Gera um endereco para receber USDC na Ethereum"
  - "Quero depositar USDT, me da o endereco"`,
      inputSchema: CryptoDepositAddressInputSchema,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true,
      },
    },
    async (params) => {
      try {
        const depositAddress = await getCryptoDepositAddress(params.asset, params.chain);

        const output = {
          id: depositAddress.id,
          asset: depositAddress.asset ?? params.asset,
          chain: depositAddress.chain ?? params.chain,
          address: depositAddress.address,
          label: depositAddress.label ?? null,
          created_at: depositAddress.createdAt ?? new Date().toISOString(),
        };

        let text: string;
        if (params.response_format === ResponseFormat.MARKDOWN) {
          const lines = [
            "# Endereco de Deposito Crypto",
            "",
            `- **Ativo**: ${output.asset}`,
            `- **Rede**: ${output.chain}`,
            `- **Endereco**: \`${output.address}\``,
            output.label ? `- **Label**: ${output.label}` : "",
            "",
            "> Aviso: Envie **apenas** " +
              output.asset +
              " na rede **" +
              output.chain +
              "**. " +
              "Enviar outro ativo ou usar outra rede pode resultar em **perda permanente** dos fundos.",
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
