/**
 * Health & Diagnostics Tools
 *
 * Ferramentas de diagnostico e saude do servidor MCP Ashar:
 *   - ashar_health:   verificacao rapida de conectividade com a API
 *   - ashar_diagnostics: diagnostico completo (config, latencia, versao)
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { handleApiError, healthCheck, getDiagnostics } from "../services/asharApi.js";
import { getSupportedPairs } from "../services/asharApi.js";
import { CHARACTER_LIMIT, ALL_SUPPORTED_CHAINS, SUPPORTED_ASSETS } from "../constants.js";
import { VERSION } from "../version.js";

// ── Register Health & Diagnostics Tools ────────────────────────────────────────

export function registerHealthTools(server: McpServer): void {
  // ──────────────────────────────────────────────────────────────────────────────
  // ashar_health — quick connectivity test
  // ──────────────────────────────────────────────────────────────────────────────
  server.registerTool(
    "ashar_health",
    {
      title: "Verificar saude do servidor Ashar",
      description:
        "Verifica a conectividade com a API Ashar Finance.\n\n" +
        "Retorna status da conexao, latencia e versao do MCP server.\n" +
        "Util para diagnosticar problemas de acesso antes de fazer operacoes.\n\n" +
        "Exemplo de uso:\n" +
        '  ashar_health() → {"status":"ok","latencyMs":145,"version":"2.0.0"}',
      inputSchema: {
        response_format: z.enum(["json", "markdown"]).default("markdown").describe(
          "Formato da resposta: 'markdown' (legivel) ou 'json' (machine-readable)",
        ),
      },
      annotations: {
        readOnlyHint: true,
        openWorldHint: false,
      },
    },
    async (params) => {
      try {
        const result = await healthCheck();
        const isMarkdown = params.response_format !== "json";

        const output = {
          status: result.ok ? "ok" : "degraded",
          version: VERSION,
          latencyMs: result.latencyMs,
          error: result.error || null,
          timestamp: new Date().toISOString(),
        };

        let text: string;
        if (isMarkdown) {
          const icon = result.ok ? "✅" : "❌";
          const latencyColor = result.latencyMs < 500 ? "🟢" : result.latencyMs < 1500 ? "🟡" : "🔴";
          text = [
            `# ${icon} Ashar MCP Health Check`,
            ``,
            `| Campo | Valor |`,
            `|---|---|`,
            `| Status | **${result.ok ? "Conectado" : "Falha"}** |`,
            `| Versao MCP | \`${VERSION}\` |`,
            `| Latencia | ${latencyColor} ${result.latencyMs}ms |`,
            `| Horario | ${output.timestamp} |`,
            ``,
            result.ok
              ? "> Conexao com a API Ashar funcionando normalmente."
              : `> ⚠️ **Falha na conexao**: ${result.error}\n>\n> Verifique:\n> - Se ` + "`ASHAR_API_KEY`" + ` esta configurada corretamente\n> - Se a API ` + "`api.ashar.finance`" + ` esta online\n> - Se ha bloqueios de rede/firewall`,
          ].join("\n");
        } else {
          text = JSON.stringify(output, null, 2);
        }

        return {
          content: [{ type: "text", text: text.slice(0, CHARACTER_LIMIT) }],
          structuredContent: output,
        };
      } catch (error) {
        return { content: [{ type: "text", text: handleApiError(error).slice(0, CHARACTER_LIMIT) }] };
      }
    },
  );

  // ──────────────────────────────────────────────────────────────────────────────
  // ashar_diagnostics — full self-diagnosis
  // ──────────────────────────────────────────────────────────────────────────────
  server.registerTool(
    "ashar_diagnostics",
    {
      title: "Diagnostico completo do servidor Ashar",
      description:
        "Executa um diagnostico completo do ambiente MCP:\n" +
        "- Verifica conectividade com a API Management e CaaS\n" +
        "- Lista pares chain/asset disponiveis para deposito\n" +
        "- Mostra configuracao do servidor (sem expor secrets)\n" +
        "- Reporta cadeias e ativos suportados\n\n" +
        "Use `ashar_health` para verificacao rapida; use este para troubleshooting detalhado.",
      inputSchema: {
        api_key: z.string().describe(
          "Chave de API do cliente Ashar (formato: asht_live_... ou asht_test_...)",
        ),
        response_format: z.enum(["json", "markdown"]).default("markdown").describe(
          "Formato da resposta: 'markdown' (legivel) ou 'json' (machine-readable)",
        ),
      },
      annotations: {
        readOnlyHint: true,
        openWorldHint: false,
      },
    },
    async (params) => {
      try {
        const config = getDiagnostics();
        const startTime = Date.now();

        // Run diagnostics in parallel
        const [healthResult, pairsResult] = await Promise.allSettled([
          healthCheck(),
          getSupportedPairs(params.api_key),
        ]);

        const totalMs = Date.now() - startTime;

        const healthOk = healthResult.status === "fulfilled" && healthResult.value.ok;
        const pairsOk = pairsResult.status === "fulfilled";
        const pairs = pairsOk ? (pairsResult as PromiseFulfilledResult<any[]>).value : [];

        const allOk = healthOk && pairsOk;

        const output = {
          status: allOk ? "healthy" : healthOk ? "partial" : "degraded",
          version: VERSION,
          diagnostics: {
            apiConnectivity: {
              ok: healthOk,
              latencyMs: healthResult.status === "fulfilled" ? healthResult.value.latencyMs : null,
              error: healthResult.status === "rejected" ? String(healthResult.reason) : healthResult.status === "fulfilled" ? healthResult.value.error : null,
            },
            supportedPairs: {
              ok: pairsOk,
              count: pairs.length,
              pairs: pairs.slice(0, 50),
              error: pairsResult.status === "rejected" ? String(pairsResult.reason) : null,
            },
          },
          configuration: config,
          environment: {
            chains: ALL_SUPPORTED_CHAINS,
            assets: SUPPORTED_ASSETS,
            totalTimeMs: totalMs,
          },
          timestamp: new Date().toISOString(),
        };

        let text: string;
        if (params.response_format === "markdown") {
          const icon = allOk ? "✅" : healthOk ? "⚠️" : "❌";
          const statusLabel = allOk ? "Saudavel" : healthOk ? "Parcial" : "Degradado";

          const pairsSection = pairsOk
            ? pairs.length > 0
              ? `| Pares disponiveis | **${pairs.length}** |`
              : `| Pares disponiveis | **0** ⚠️ Nenhum par encontrado |`
            : `| Pares disponiveis | **ERRO** ❌ |`;

          text = [
            `# ${icon} Ashar MCP — Diagnostico`,
            ``,
            `**Status geral:** ${statusLabel}`,
            ``,
            `## Conectividade`,
            ``,
            `| Item | Resultado |`,
            `|---|---|`,
            `| API Management (${config.apiBaseUrl}) | ${healthOk ? "✅ Conectado" : "❌ Falha"} (${healthResult.status === "fulfilled" ? healthResult.value.latencyMs : "N/A"}ms) |`,
            `| API CaaS (${config.caasApiUrl}) | ${config.hasCaasKey ? "🔑 Key configurada" : "⚠️ Key nao configurada"} |`,
            pairsSection,
            ``,
            `## Configuracao`,
            ``,
            `| Item | Valor |`,
            `|---|---|`,
            `| Versao MCP | \`${VERSION}\` |`,
            `| Debug | ${config.debugMode ? "ON" : "OFF"} |`,
            `| Timeout | ${config.timeoutMs}ms |`,
            `| Max Retries | ${config.maxRetries} |`,
            `| API Key | ${config.hasApiKey ? "✅ Configurada" : "❌ Ausente"} (${config.defaultApiKeyHint}) |`,
            ``,
            `## Ambiente`,
            ``,
            `| Item | Valor |`,
            `|---|---|`,
            `| Chains | ${ALL_SUPPORTED_CHAINS.join(", ")} |`,
            `| Assets | ${SUPPORTED_ASSETS.join(", ")} |`,
            `| Tempo total | ${totalMs}ms |`,
            ``,
            allOk
              ? "> ✅ Todos os sistemas operacionais."
              : "> ⚠️ Verifique os itens com falha acima.",
          ].join("\n");

          if (pairsOk && pairs.length > 0) {
            text += "\n\n## Pares Suportados\n\n";
            text += "| Chain | Asset |\n|---|---|\n";
            for (const p of pairs) {
              text += `| ${p.chain ?? p.network ?? "?"} | ${p.asset ?? p.symbol ?? "?"} |\n`;
            }
          }
        } else {
          text = JSON.stringify(output, null, 2);
        }

        return {
          content: [{ type: "text", text: text.slice(0, CHARACTER_LIMIT) }],
          structuredContent: output,
        };
      } catch (error) {
        return { content: [{ type: "text", text: handleApiError(error).slice(0, CHARACTER_LIMIT) }] };
      }
    },
  );
}
