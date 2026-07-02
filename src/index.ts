#!/usr/bin/env node
/**
 * Ashar Finance MCP Server
 *
 * MCP server que expoe as principais operacoes da Ashar Finance:
 *   - Deposito BRL (PIX)
 *   - Conversao entre BRL, USD, EUR, USDT, USDC
 *   - Saque USDT / USDC
 *   - Deposito USDT / USDC
 *   - Cadastro de contas bancarias (receivers)
 *   - Saque fiat USD / EUR / BRL
 *
 * Autenticacao: Bearer token via ASHAR_API_KEY.
 *
 * Transport: stdio (local) ou HTTP (remoto) controlado por ASHAR_TRANSPORT.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import express from "express";
import { registerBrlDepositTools } from "./tools/brlDeposit.js";
import { registerConversionTools } from "./tools/conversion.js";
import { registerCryptoWithdrawalTools } from "./tools/cryptoWithdrawal.js";
import { registerCryptoDepositTools } from "./tools/cryptoDeposit.js";
import { registerBankAccountTools } from "./tools/bankAccounts.js";
import { registerFiatWithdrawalTools } from "./tools/fiatWithdrawal.js";
import { registerWebhookTools } from "./tools/webhooks.js";
import { registerBalanceTools } from "./tools/balance.js";

// ── Validate required env vars ────────────────────────────────────────────────

function validateConfig(): void {
  const issues: string[] = [];

  if (!process.env.ASHAR_API_KEY) {
    issues.push("ASHAR_API_KEY is required (Bearer token para autenticacao na API Ashar)");
  }

  const url = process.env.ASHAR_API_URL;
  if (url && !url.startsWith("https://") && !url.startsWith("http://")) {
    issues.push("ASHAR_API_URL must start with https:// or http://");
  }

  if (issues.length > 0) {
    console.error("Configuration errors:");
    for (const issue of issues) {
      console.error(`  - ${issue}`);
    }
    process.exit(1);
  }
}

// ── Create MCP server ─────────────────────────────────────────────────────────

const server = new McpServer({
  name: "ashar-mcp-server",
  version: "1.0.0",
});

// Register all tool groups
registerBrlDepositTools(server);
registerConversionTools(server);
registerCryptoWithdrawalTools(server);
registerCryptoDepositTools(server);
registerBankAccountTools(server);
registerFiatWithdrawalTools(server);
registerWebhookTools(server);
registerBalanceTools(server);

// ── stdio transport (default for local use) ───────────────────────────────────

async function runStdio(): Promise<void> {
  validateConfig();

  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("[ashar-mcp] running via stdio");
}

// ── Streamable HTTP transport (for remote/cloud deployments) ──────────────────

async function runHttp(): Promise<void> {
  validateConfig();

  // Dynamic import for express
  const app = express();
  app.use(express.json());

  app.post("/mcp", async (req, res) => {
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      enableJsonResponse: true,
    });

    res.on("close", () => transport.close());

    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  });

  // Health check endpoint
  app.get("/health", (_req, res) => {
    res.json({ status: "ok", name: "ashar-mcp-server", version: "1.0.0" });
  });

  const port = parseInt(process.env.PORT || "3000", 10);
  app.listen(port, () => {
    console.error(`[ashar-mcp] running on http://localhost:${port}/mcp`);
  });
}

// ── Entry point ────────────────────────────────────────────────────────────────

const transport = process.env.ASHAR_TRANSPORT || "stdio";

if (transport === "http") {
  runHttp().catch((error) => {
    console.error("[ashar-mcp] Fatal error:", error);
    process.exit(1);
  });
} else {
  runStdio().catch((error) => {
    console.error("[ashar-mcp] Fatal error:", error);
    process.exit(1);
  });
}
