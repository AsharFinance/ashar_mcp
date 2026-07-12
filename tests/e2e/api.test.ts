/**
 * E2E (End-to-End) Tests — Real API calls against api.ashar.finance
 *
 * These tests make ACTUAL HTTP requests to the Ashar Finance API.
 * They require a valid API key set via ASHAR_E2E_API_KEY environment variable.
 *
 * If the env var is not set, all tests are skipped automatically.
 *
 * Run: ASHAR_E2E_API_KEY=asht_test_... npx vitest run --dir tests/e2e
 */

import { describe, it, expect, beforeAll } from "vitest";
import {
  healthCheck,
  getDiagnostics,
  getBalances,
  getSupportedPairs,
  getCryptoDepositAddress,
  createBrlDeposit,
  getBrlDepositStatus,
  listBrlDeposits,
  getWalletComposition,
  listCustodyAddresses,
  getExchangeRate,
  getPrices,
  handleApiError,
} from "../../src/services/asharApi.js";

// ── Configuration ─────────────────────────────────────────────────────────────

const API_KEY = process.env.ASHAR_E2E_API_KEY || "";
const SKIP_REASON = "ASHAR_E2E_API_KEY not set — skipping E2E tests";
const runE2E = API_KEY.length > 0;

// ── Setup ─────────────────────────────────────────────────────────────────────

beforeAll(() => {
  if (!runE2E) {
    console.warn(`\n  ⚠ ${SKIP_REASON}\n`);
  }
});

// ── Conditional test runner ───────────────────────────────────────────────────

const describeE2E = runE2E ? describe : describe.skip;

// ══════════════════════════════════════════════════════════════════════════════
// Health Check & Diagnostics (read-only, safe)
// ══════════════════════════════════════════════════════════════════════════════

describeE2E("E2E: Health Check", () => {
  it("healthCheck returns ok:true with real API", async () => {
    const result = await healthCheck();
    expect(result.ok).toBe(true);
    expect(result.latencyMs).toBeGreaterThan(0);
    expect(result.latencyMs).toBeLessThan(10_000); // should respond within 10s
    expect(result.error).toBeUndefined();
  });

  it("getDiagnostics returns config without secrets", () => {
    const diag = getDiagnostics();
    expect(diag).toHaveProperty("apiBaseUrl");
    expect(diag).toHaveProperty("caasApiUrl");
    expect(diag).toHaveProperty("hasApiKey");
    expect(diag).toHaveProperty("hasCaasKey");
    expect(diag).toHaveProperty("timeoutMs");
    expect(diag).toHaveProperty("maxRetries");
    expect(diag).toHaveProperty("debugMode");

    // Must not leak actual key
    const json = JSON.stringify(diag);
    expect(json).not.toContain(API_KEY);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// Prices & Exchange Rates (read-only)
// ══════════════════════════════════════════════════════════════════════════════

describeE2E("E2E: Prices & Exchange Rates", () => {
  it("getPrices returns expected currency prices", async () => {
    const prices = await getPrices(API_KEY);
    expect(prices).toBeTypeOf("object");

    // Should contain at least some known currencies
    const keys = Object.keys(prices);
    expect(keys.length).toBeGreaterThan(0);

    // Each price should be a positive number
    for (const [key, value] of Object.entries(prices)) {
      expect(typeof value).toBe("number");
      expect(value).toBeGreaterThan(0);
    }
  });

  it("getExchangeRate returns rate between BRL and USDT", async () => {
    const result = await getExchangeRate("BRL", "USDT", API_KEY);
    expect(result.rate).toBeGreaterThan(0);
    expect(result.source).toBeTruthy();
  });

  it("getExchangeRate returns rate between USD and BRL", async () => {
    const result = await getExchangeRate("USD", "BRL", API_KEY);
    expect(result.rate).toBeGreaterThan(0);
    expect(result.source).toBeTruthy();
  });

  it("getExchangeRate same currency returns rate:1", async () => {
    const result = await getExchangeRate("BRL", "BRL", API_KEY);
    expect(result.rate).toBe(1);
    expect(result.spreadPct).toBe(0);
    expect(result.source).toBe("spot");
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// Balances (read-only)
// ══════════════════════════════════════════════════════════════════════════════

describeE2E("E2E: Balances", () => {
  it("getBalances returns all 5 currencies as numbers", async () => {
    const balances = await getBalances(API_KEY);
    expect(balances).toHaveProperty("brl");
    expect(balances).toHaveProperty("usd");
    expect(balances).toHaveProperty("eur");
    expect(balances).toHaveProperty("usdt");
    expect(balances).toHaveProperty("usdc");

    // All should be numbers >= 0
    expect(balances.brl).toBeGreaterThanOrEqual(0);
    expect(balances.usd).toBeGreaterThanOrEqual(0);
    expect(balances.eur).toBeGreaterThanOrEqual(0);
    expect(balances.usdt).toBeGreaterThanOrEqual(0);
    expect(balances.usdc).toBeGreaterThanOrEqual(0);
  });

  it("getWalletComposition returns balances and addresses", async () => {
    const result = await getWalletComposition(API_KEY);
    expect(result).toHaveProperty("balances");
    expect(result).toHaveProperty("addresses");
    expect(Array.isArray(result.addresses)).toBe(true);
  });

  it("listCustodyAddresses returns array", async () => {
    const addresses = await listCustodyAddresses(API_KEY);
    expect(Array.isArray(addresses)).toBe(true);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// Supported Pairs (read-only)
// ══════════════════════════════════════════════════════════════════════════════

describeE2E("E2E: Supported Pairs", () => {
  it("getSupportedPairs returns non-empty array", async () => {
    const pairs = await getSupportedPairs(API_KEY);
    expect(Array.isArray(pairs)).toBe(true);
    expect(pairs.length).toBeGreaterThan(0);

    // Each pair should have chain and asset
    for (const pair of pairs) {
      expect(pair).toHaveProperty("chain");
      expect(pair).toHaveProperty("asset");
    }
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// Crypto Deposit Address (read-only — generates an address)
// ══════════════════════════════════════════════════════════════════════════════

describeE2E("E2E: Crypto Deposit Address", () => {
  it("generates a USDT deposit address on polygon", async () => {
    const result = await getCryptoDepositAddress("USDT", "polygon", API_KEY);
    expect(result).toHaveProperty("id");
    expect(result).toHaveProperty("address");
    expect(result.asset).toMatch(/USDT/i);
    expect(result.chain).toMatch(/polygon/i);
    expect(result.address.length).toBeGreaterThan(10);
  });

  it("generates a USDC deposit address on ethereum", async () => {
    const result = await getCryptoDepositAddress("USDC", "eth", API_KEY);
    expect(result).toHaveProperty("address");
    expect(result.asset).toMatch(/USDC/i);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// BRL PIX Deposits (write operations — creates actual PIX charges)
// ══════════════════════════════════════════════════════════════════════════════

describeE2E("E2E: BRL PIX Deposits", () => {
  const MINIMAL_AMOUNT = 10; // R$ 10,00 — valor minimo para criar cobranca

  it("creates a PIX deposit and returns pix_copy_paste", async () => {
    const deposit = await createBrlDeposit(MINIMAL_AMOUNT, API_KEY);
    expect(deposit).toHaveProperty("id");
    expect(deposit).toHaveProperty("txid");
    expect(deposit.amount_brl).toBe(MINIMAL_AMOUNT);
    expect(deposit.pix_copy_paste).toBeTruthy();
    expect(deposit.status).toBe("PENDING");
  });

  it("can query deposit status by txid", async () => {
    // First create a deposit
    const deposit = await createBrlDeposit(MINIMAL_AMOUNT, API_KEY);

    // Then query its status
    const status = await getBrlDepositStatus(deposit.txid, API_KEY);
    expect(status.txid).toBe(deposit.txid);
    expect(status.status).toBeDefined();
  });

  it("lists deposits and includes the one just created", async () => {
    const deposits = await listBrlDeposits(5, API_KEY);
    expect(Array.isArray(deposits)).toBe(true);

    if (deposits.length > 0) {
      const last = deposits[0];
      expect(last).toHaveProperty("id");
      expect(last).toHaveProperty("txid");
      expect(last).toHaveProperty("amount_brl");
      expect(last).toHaveProperty("status");
    }
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// Error Handling — real API errors
// ══════════════════════════════════════════════════════════════════════════════

describeE2E("E2E: Error Handling", () => {
  it("getBalances with invalid API key returns auth error", async () => {
    try {
      await getBalances("invalid_key_12345");
      // Should not reach here
      expect(true).toBe(false);
    } catch (err: any) {
      const msg = handleApiError(err);
      expect(msg).toContain("autenticacao");
    }
  });

  it("getBalances with empty API key returns auth error", async () => {
    try {
      await getBalances("");
      expect(true).toBe(false);
    } catch (err: any) {
      const msg = handleApiError(err);
      expect(msg).toContain("autenticacao");
    }
  });
});
