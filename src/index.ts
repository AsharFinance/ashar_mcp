#!/usr/bin/env node
/**
 * Ashar Finance MCP Server (v2)
 *
 * MCP server que expoe as principais operacoes da Ashar Finance:
 *   - Deposito BRL (PIX)
 *   - Conversao entre BRL, USD, EUR, USDT, USDC
 *   - Saque USDT / USDC
 *   - Deposito USDT / USDC
 *   - Cadastro de contas bancarias (receivers)
 *   - Saque fiat USD / EUR / BRL
 *   - Health check & diagnosticos
 *
 * Autenticacao: API Key via header x-api-key.
 *
 * Transport: stdio (local) ou HTTP (remoto) controlado por ASHAR_TRANSPORT.
 *
 * Env vars:
 *   ASHAR_API_KEY      (required)  API key for management backend
 *   ASHAR_API_URL      (optional)  Management API URL (default: api.ashar.finance)
 *   CAAS_API_KEY       (optional)  CaaS HMAC secret or legacy key
 *   CAAS_API_URL       (optional)  CaaS API URL (default: api-assets.up.railway.app)
 *   ASHAR_TRANSPORT    (optional)  "stdio" (default) | "http"
 *   ASHAR_DEBUG        (optional)  "true" to enable debug logs
 *   ASHAR_SKIP_HEALTH  (optional)  "true" to skip startup health check
 *   ASHAR_TIMEOUT_MS   (optional)  Request timeout in ms (default: 30000)
 *   PORT               (optional)  HTTP port (default: 3000)
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { registerBrlDepositTools } from "./tools/brlDeposit.js";
import { registerConversionTools } from "./tools/conversion.js";
import { registerCryptoWithdrawalTools } from "./tools/cryptoWithdrawal.js";
import { registerCryptoDepositTools } from "./tools/cryptoDeposit.js";
import { registerBankAccountTools } from "./tools/bankAccounts.js";
import { registerFiatWithdrawalTools } from "./tools/fiatWithdrawal.js";
import { registerWebhookTools } from "./tools/webhooks.js";
import { registerBalanceTools } from "./tools/balance.js";
import { registerWalletTools } from "./tools/wallets.js";
import { registerQuoteTools } from "./tools/quote.js";
import { registerHealthTools } from "./tools/health.js";
import { VERSION } from "./version.js";
import { healthCheck, getDiagnostics } from "./services/asharApi.js";

// ── Logger ────────────────────────────────────────────────────────────────────

const DEBUG = process.env.ASHAR_DEBUG === "true";

function startupLog(msg: string): void {
  const ts = new Date().toISOString();
  console.error(`[ashar-mcp] ${ts} ${msg}`);
}

// ── Validate required env vars ────────────────────────────────────────────────

function validateConfig(): { valid: boolean; issues: string[] } {
  const issues: string[] = [];

  if (!process.env.ASHAR_API_KEY) {
    issues.push("ASHAR_API_KEY is required (Bearer token para autenticacao na API Ashar)");
  }

  const url = process.env.ASHAR_API_URL;
  if (url && !url.startsWith("https://") && !url.startsWith("http://")) {
    issues.push("ASHAR_API_URL must start with https:// or http://");
  }

  if (issues.length > 0) {
    startupLog("ERROR: Configuration issues:");
    for (const issue of issues) {
      startupLog(`  - ${issue}`);
    }
  }

  return { valid: issues.length === 0, issues };
}

// ── Startup Health Check ──────────────────────────────────────────────────────

async function runStartupDiagnostics(): Promise<void> {
  const skipHealth = process.env.ASHAR_SKIP_HEALTH === "true";
  if (skipHealth) {
    startupLog("Skipping startup health check (ASHAR_SKIP_HEALTH=true)");
    return;
  }

  startupLog("Running startup diagnostics...");

  const cfg = validateConfig();
  if (!cfg.valid) {
    startupLog("WARNING: MCP started with configuration issues — some tools may not work.");
    return;
  }

  try {
    const result = await healthCheck();
    if (result.ok) {
      startupLog(`OK — API connectivity verified (${result.latencyMs}ms)`);
    } else {
      startupLog(`WARNING: Could not reach API — ${result.error}`);
      startupLog("  The MCP server is running but API calls may fail.");
      startupLog("  Check ASHAR_API_KEY and ASHAR_API_URL.");
    }
  } catch (err: any) {
    startupLog(`WARNING: Health check failed: ${err.message}`);
  }

  if (DEBUG) {
    const diag = getDiagnostics();
    startupLog(`Debug info: ${JSON.stringify(diag)}`);
  }
}

// ── Create MCP server ─────────────────────────────────────────────────────────

const server = new McpServer({
  name: "ashar-mcp-server",
  version: VERSION,
});

// Register all tool groups (total: 27 ferramentas em 11 grupos)
registerBalanceTools(server);
registerWalletTools(server);
registerBrlDepositTools(server);
registerConversionTools(server);
registerQuoteTools(server);
registerCryptoWithdrawalTools(server);
registerCryptoDepositTools(server);
registerBankAccountTools(server);
registerFiatWithdrawalTools(server);
registerWebhookTools(server);
registerHealthTools(server); // ashar_health + ashar_diagnostics

// ── stdio transport (default for local use) ───────────────────────────────────

async function runStdio(): Promise<void> {
  await runStartupDiagnostics();

  const transport = new StdioServerTransport();
  await server.connect(transport);
  startupLog(`v${VERSION} running via stdio`);
}

// ── Streamable HTTP transport (for remote/cloud deployments) ──────────────────

async function runHttp(): Promise<void> {
  await runStartupDiagnostics();

  // Dynamic import for express (optional dependency, used only in HTTP mode)
  let express: any;
  try {
    express = (await import("express")).default;
  } catch {
    startupLog("ERROR: express is required for HTTP transport. Install it with: npm install express");
    startupLog("       Or switch to stdio mode with ASHAR_TRANSPORT=stdio");
    process.exit(1);
  }

  const app = express();
  app.use(express.json());

  app.post("/mcp", async (req: any, res: any) => {
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      enableJsonResponse: true,
    });

    res.on("close", () => transport.close());

    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  });

  // Health check endpoint
  app.get("/health", (_req: any, res: any) => {
    res.json({
      status: "ok",
      name: "ashar-mcp-server",
      version: VERSION,
      timestamp: new Date().toISOString(),
    });
  });

  const port = parseInt(process.env.PORT || "3000", 10);
  app.listen(port, () => {
    startupLog(`v${VERSION} running on http://localhost:${port}/mcp`);
    startupLog(`Health check: http://localhost:${port}/health`);
  });
}

// ── Entry point ───────────────────────────────────────────────────────────────

const transport = process.env.ASHAR_TRANSPORT || "stdio";

if (transport === "http") {
  runHttp().catch((error) => {
    startupLog(`Fatal error: ${error.message}`);
    process.exit(1);
  });
} else {
  runStdio().catch((error) => {
    startupLog(`Fatal error: ${error.message}`);
    process.exit(1);
  });
}
