/**
 * Webhook Tools
 *
 * Ferramentas para gerenciamento de webhooks do usuario na Ashar Finance.
 * Permite cadastrar URLs que receberao notificacoes de eventos como
 * depositos PIX, conversoes, saques crypto, saques fiat, etc.
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
  WebhookListInputSchema,
  WebhookCreateInputSchema,
  WebhookDeleteInputSchema,
  WebhookTestInputSchema,
  ResponseFormat,
} from "../types.js";
import {
  listWebhooks,
  createWebhook,
  deleteWebhook,
  testWebhook,
  handleApiError,
} from "../services/asharApi.js";

const CHARACTER_LIMIT = 25_000;

export function registerWebhookTools(server: McpServer) {
  // ── ashar_listar_webhooks ────────────────────────────────────────────────
  server.registerTool(
    "ashar_listar_webhooks",
    {
      title: "Listar Webhooks",
      description: `Lista todos os webhooks cadastrados pelo usuario na Ashar Finance.

Cada webhook recebe eventos via HTTP POST quando ocorrem acoes como:
depositos PIX, conversoes de moeda, saques crypto e saques fiat.

Args:
  - response_format ('markdown' | 'json'): Formato de saida (default: 'json')

Returns:
  Para JSON: Array de webhooks com:
  {
    "webhooks": [{
      "id": string,
      "label": string,
      "url": string,
      "events": string,
      "active": boolean,
      "lastStatus": number | null,
      "successCount": number,
      "failCount": number,
      "createdAt": string
    }]
  }

Exemplos de uso:
  - "Quais webhooks eu tenho cadastrados?"
  - "Lista meus endpoints de notificacao"
  - "Mostra meus webhooks configurados"`,
      inputSchema: WebhookListInputSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async (params) => {
      try {
        const webhooks = await listWebhooks();

        if (!webhooks.length) {
          return {
            content: [{ type: "text", text: "Nenhum webhook cadastrado. Use `ashar_criar_webhook` para cadastrar uma URL de notificacao." }],
          };
        }

        const output = { webhooks };

        let text: string;
        if (params.response_format === ResponseFormat.MARKDOWN) {
          const lines = [
            "# Seus Webhooks",
            "",
            `Total: ${webhooks.length} webhook(s)`,
            "",
            ...webhooks.map((wh: any, i: number) => [
              `## ${i + 1}. ${wh.label}`,
              `- **ID**: \`${wh.id}\``,
              `- **URL**: ${wh.url}`,
              `- **Eventos**: ${wh.events}`,
              `- **Ativo**: ${wh.active ? 'Sim' : 'Nao'}`,
              `- **Ultimo status**: ${wh.lastStatus ?? 'N/A'}`,
              `- **Sucessos**: ${wh.successCount}`,
              `- **Falhas**: ${wh.failCount}`,
              `- **Criado em**: ${wh.createdAt}`,
              '',
            ].join('\n')),
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
        return {
          content: [{ type: "text", text: handleApiError(error).slice(0, CHARACTER_LIMIT) }],
          isError: true,
        };
      }
    },
  );

  // ── ashar_criar_webhook ──────────────────────────────────────────────────
  server.registerTool(
    "ashar_criar_webhook",
    {
      title: "Cadastrar Webhook",
      description: `Cadastra uma nova URL de webhook para receber notificacoes de eventos da Ashar Finance.

Quando ocorrerem eventos como depositos PIX, saques, conversoes, etc.,
a Ashar Finance enviara um HTTP POST para esta URL com o payload do evento.

O payload enviado tera o formato:
{
  "event": "deposit",
  "timestamp": "2026-06-28T12:00:00.000Z",
  "webhookId": "abc-123",
  "data": { ...dados do evento... }
}

Headers incluidos:
  - X-Ashar-Signature: HMAC-SHA256 do payload (verifique com o secret)
  - X-Ashar-Event: tipo do evento
  - Content-Type: application/json

Eventos disponiveis:
  - all: todos os eventos (default)
  - deposit: deposito BRL via PIX confirmado
  - withdrawal: saque fiat (BRL, USD, EUR) processado
  - conversion: conversao de moeda aprovada/rejeitada
  - crypto_deposit: deposito USDT/USDC recebido
  - crypto_withdrawal: saque USDT/USDC processado
  - swap: swap entre moedas concluido

Args:
  - label (string): Nome/apelido do webhook (ex: 'Meu Servidor')
  - url (string): URL HTTPS que recebera os eventos
  - events (string, opcional): Eventos a receber (default: 'all')
  - response_format ('markdown' | 'json')

Returns:
  Para JSON:
  {
    "id": string,
    "label": string,
    "url": string,
    "events": string,
    "active": true,
    "secret": string,
    "createdAt": string
  }

IMPORTANTE: Guarde o campo "secret". Ele e mostrado apenas na criacao
e serve para verificar a assinatura HMAC-SHA256 dos payloads recebidos.

Exemplos de uso:
  - "Cadastra um webhook para receber notificacoes de depositos"
  - "Quero ser notificado quando um PIX for pago, cria um webhook"
  - "Configura um endpoint para receber eventos de saque"`,
      inputSchema: WebhookCreateInputSchema,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true,
      },
    },
    async (params) => {
      try {
        const wh = await createWebhook({
          label: params.label,
          url: params.url,
          events: params.events || 'all',
        }, params.api_key);

        let text: string;
        if (params.response_format === ResponseFormat.MARKDOWN) {
          text = [
            "# Webhook Cadastrado",
            "",
            `- **ID**: \`${wh.id}\``,
            `- **Label**: ${wh.label}`,
            `- **URL**: ${wh.url}`,
            `- **Eventos**: ${wh.events}`,
            `- **Ativo**: Sim`,
            "",
            "## Segredo HMAC",
            "```",
            wh.secret,
            "```",
            "",
            "> Guarde este segredo. Ele e usado para verificar a assinatura `X-Ashar-Signature` dos payloads recebidos.",
            `> Use \`ashar_listar_webhooks\` para ver seus webhooks.`,
          ].join("\n");
        } else {
          text = JSON.stringify(wh, null, 2);
        }

        return {
          content: [{ type: "text", text: text.slice(0, CHARACTER_LIMIT) }],
          structuredContent: wh,
        };
      } catch (error) {
        return {
          content: [{ type: "text", text: handleApiError(error).slice(0, CHARACTER_LIMIT) }],
          isError: true,
        };
      }
    },
  );

  // ── ashar_deletar_webhook ────────────────────────────────────────────────
  server.registerTool(
    "ashar_deletar_webhook",
    {
      title: "Deletar Webhook",
      description: `Remove um webhook cadastrado na Ashar Finance.

Args:
  - webhook_id (string): ID do webhook a remover (obtido via ashar_listar_webhooks)
  - response_format ('markdown' | 'json')

Atencao: Esta acao e irreversivel. O webhook deixara de receber eventos.

Exemplos de uso:
  - "Remove o webhook X"
  - "Deleta o endpoint de notificacao Y"
  - "Cancela o webhook de depositos"`,
      inputSchema: WebhookDeleteInputSchema,
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async (params) => {
      try {
        await deleteWebhook(params.webhook_id);

        let text: string;
        if (params.response_format === ResponseFormat.MARKDOWN) {
          text = `# Webhook Removido\n\nWebhook \`${params.webhook_id}\` foi removido com sucesso.`;
        } else {
          text = JSON.stringify({ deleted: true, webhook_id: params.webhook_id });
        }

        return {
          content: [{ type: "text", text: text.slice(0, CHARACTER_LIMIT) }],
          structuredContent: { deleted: true, webhook_id: params.webhook_id },
        };
      } catch (error) {
        return {
          content: [{ type: "text", text: handleApiError(error).slice(0, CHARACTER_LIMIT) }],
          isError: true,
        };
      }
    },
  );

  // ── ashar_testar_webhook ─────────────────────────────────────────────────
  server.registerTool(
    "ashar_testar_webhook",
    {
      title: "Testar Webhook",
      description: `Envia um evento de teste (ping) para um webhook cadastrado.

Util para verificar se a URL de destino esta funcionando corretamente.

Args:
  - webhook_id (string): ID do webhook a testar
  - response_format ('markdown' | 'json')

Returns:
  Para JSON:
  {
    "statusCode": 200,
    "response": "pong",
    "durationMs": 234,
    "ok": true
  }

Exemplos de uso:
  - "Testa o webhook X"
  - "Verifica se meu endpoint de notificacao esta recebendo"
  - "Faz um ping no webhook de depositos"`,
      inputSchema: WebhookTestInputSchema,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async (params) => {
      try {
        const result = await testWebhook(params.webhook_id, params.api_key);

        let text: string;
        if (params.response_format === ResponseFormat.MARKDOWN) {
          text = [
            "# Resultado do Teste de Webhook",
            "",
            `- **Status HTTP**: ${result.statusCode ?? 'Erro de conexao'}`,
            `- **Sucesso**: ${result.ok ? 'Sim' : 'Nao'}`,
            `- **Duracao**: ${result.durationMs}ms`,
            result.response ? `- **Resposta**: ${result.response.slice(0, 200)}` : '',
            result.error ? `- **Erro**: ${result.error}` : '',
          ].join("\n");
        } else {
          text = JSON.stringify(result, null, 2);
        }

        return {
          content: [{ type: "text", text: text.slice(0, CHARACTER_LIMIT) }],
          structuredContent: result,
        };
      } catch (error) {
        return {
          content: [{ type: "text", text: handleApiError(error).slice(0, CHARACTER_LIMIT) }],
          isError: true,
        };
      }
    },
  );
}
