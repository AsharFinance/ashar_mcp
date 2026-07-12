/**
 * Integration tests: ashar_health and ashar_diagnostics tool handlers
 *
 * These are "integration" tests because they exercise the tool handler logic
 * (parsing inputs, formatting outputs) using mocked API responses.
 * They do NOT make real network calls.
 *
 * Strategy:
 *   - Mock global fetch to return controlled responses
 *   - Call the internal API functions (healthCheck, getSupportedPairs)
 *   - Verify output formats are correct
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { healthCheck, getSupportedPairs, getDiagnostics } from "../../src/services/asharApi.js";

describe("healthCheck (integration — mocked API)", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns ok:true when API responds 200", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ BTC: 58000, ETH: 3200 }),
    }));

    const result = await healthCheck();
    expect(result.ok).toBe(true);
    expect(result.latencyMs).toBeGreaterThanOrEqual(0);
    expect(result.error).toBeUndefined();
  });

  it("returns ok:false on network failure", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("fetch failed")));

    const result = await healthCheck();
    expect(result.ok).toBe(false);
    expect(result.error).toContain("fetch failed");
    expect(result.latencyMs).toBeGreaterThanOrEqual(0);
  });

  it("returns ok:false on HTTP 500", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      json: () => Promise.resolve({ error: "Internal server error" }),
    }));

    // healthCheck uses requestWithRetry → will retry 3 times on 500
    const result = await healthCheck();
    expect(result.ok).toBe(false);
    expect(result.error).toBeDefined();
  });

  it("returns ok:false on HTTP 401", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      json: () => Promise.resolve({ error: "Invalid API key" }),
    }));

    const result = await healthCheck();
    expect(result.ok).toBe(false);
    expect(result.error).toContain("Invalid API key");
  });

  it("measures latency correctly", async () => {
    vi.stubGlobal("fetch", vi.fn().mockImplementation(async () => {
      await new Promise((r) => setTimeout(r, 50));
      return {
        ok: true,
        status: 200,
        json: () => Promise.resolve({ BTC: 58000 }),
      };
    }));

    const result = await healthCheck();
    expect(result.latencyMs).toBeGreaterThanOrEqual(40); // allow slight timing jitter
  });
});

describe("getSupportedPairs (integration — mocked API)", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("parses pairs from response body", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({
        pairs: [
          { chain: "polygon", asset: "USDT" },
          { chain: "eth", asset: "USDC" },
        ],
      }),
    }));

    const pairs = await getSupportedPairs("test-key");
    expect(pairs).toHaveLength(2);
    expect(pairs[0]).toEqual({ chain: "polygon", asset: "USDT" });
    expect(pairs[1]).toEqual({ chain: "eth", asset: "USDC" });
  });

  it("handles direct array response (not wrapped in {pairs})", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve([
        { chain: "bsc", asset: "USDT" },
      ]),
    }));

    const pairs = await getSupportedPairs("test-key");
    expect(pairs).toHaveLength(1);
    expect(pairs[0].chain).toBe("bsc");
  });

  it("returns empty array when response has no pairs", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ message: "no pairs configured" }),
    }));

    const pairs = await getSupportedPairs("test-key");
    expect(pairs).toEqual([]);
  });

  it("throws on 401 (no retry for auth errors)", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      json: () => Promise.resolve({ error: "Invalid API key" }),
    }));

    await expect(getSupportedPairs("invalid-key")).rejects.toThrow();
  });

  it("retries on 500 errors", async () => {
    let callCount = 0;
    vi.stubGlobal("fetch", vi.fn().mockImplementation(() => {
      callCount++;
      if (callCount < 3) {
        return Promise.resolve({
          ok: false,
          status: 500,
          json: () => Promise.resolve({ error: "Server error" }),
        });
      }
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve({
          pairs: [{ chain: "eth", asset: "USDT" }],
        }),
      });
    }));

    const pairs = await getSupportedPairs("test-key");
    expect(callCount).toBe(3);
    expect(pairs).toHaveLength(1);
  });
});

describe("getDiagnostics (integration)", () => {
  it("returns config without exposing secrets", () => {
    const diag = getDiagnostics();
    // Should not expose raw API keys
    const json = JSON.stringify(diag);
    expect(json).not.toContain("pk_live_"); // production key prefix
    expect(json).not.toContain("asht_test_"); // test key prefix

    // Should have expected shape
    expect(diag.hasApiKey).toBeTypeOf("boolean");
    expect(diag.timeoutMs).toBeTypeOf("number");
    expect(diag.maxRetries).toBeTypeOf("number");
  });
});
