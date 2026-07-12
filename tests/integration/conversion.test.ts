/**
 * Integration tests: conversion, crypto withdrawals, exchange rates
 *
 * Testa createConversion, createCryptoWithdrawal, getCryptoWithdrawalStatus,
 * listCryptoWithdrawals, getExchangeRate, getPrices com mock de fetch.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  createConversion,
  createCryptoWithdrawal,
  getCryptoWithdrawalStatus,
  listCryptoWithdrawals,
  getExchangeRate,
  getPrices,
} from "../../src/services/asharApi.js";

// ══════════════════════════════════════════════════════════════════════════════
// createConversion
// ══════════════════════════════════════════════════════════════════════════════

describe("createConversion (integration — mocked API)", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("creates a BRL → USDT conversion", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({
        id: "swap_001",
        direction: "FIAT_TO_CRYPTO",
        fromCurrency: "BRL",
        toCurrency: "USDT",
        amountFrom: "100",
        amountToEstimate: "18.50",
        status: "PENDING",
        createdAt: "2025-01-15T10:30:00Z",
      }),
    }));

    const result = await createConversion({
      fromCurrency: "BRL",
      toCurrency: "USDT",
      amountFrom: 100,
      amountToEstimate: 18.50,
    }, "test-key");

    expect(result.id).toBe("swap_001");
    expect(result.fromCurrency).toBe("BRL");
    expect(result.toCurrency).toBe("USDT");
    expect(result.status).toBe("PENDING");
  });

  it("creates conversion without amountToEstimate", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({
        id: "swap_002",
        fromCurrency: "USDT",
        toCurrency: "BRL",
        amountFrom: "500",
        status: "PENDING",
        createdAt: "2025-01-15T11:00:00Z",
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    await createConversion({
      fromCurrency: "USDT",
      toCurrency: "BRL",
      amountFrom: 500,
    }, "test-key");

    const [, options] = fetchMock.mock.calls[0];
    const body = JSON.parse(options.body);
    expect(body.amountToEstimate).toBeNull();
  });

  it("throws on 400 validation error", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
      json: () => Promise.resolve({ error: "Insufficient balance" }),
    }));

    await expect(createConversion({
      fromCurrency: "BRL",
      toCurrency: "USDT",
      amountFrom: 999999,
    }, "test-key")).rejects.toThrow();
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// createCryptoWithdrawal
// ══════════════════════════════════════════════════════════════════════════════

describe("createCryptoWithdrawal (integration — mocked API)", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("creates a USDT withdrawal on polygon", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({
        id: "wd_001",
        externalId: "ext_abc123",
        status: "PENDING",
        approvalTier: "standard",
        amount: "100",
        asset: "USDT",
        chain: "polygon",
        destinationAddress: "0xabc123def456",
        amountUsd: "100.00",
        requiredSignatures: 1,
        timelockUntil: null,
        createdAt: "2025-01-15T10:30:00Z",
      }),
    }));

    const result = await createCryptoWithdrawal({
      asset: "USDT",
      chain: "polygon",
      amount: 100,
      destinationAddress: "0xabc123def456",
      externalId: "ext_abc123",
    }, "test-key");

    expect(result.id).toBe("wd_001");
    expect(result.asset).toBe("USDT");
    expect(result.chain).toBe("polygon");
    expect(result.status).toBe("PENDING");
  });

  it("creates withdrawal without externalId", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({
        id: "wd_002",
        status: "PENDING",
        destinationAddress: "TXxxxyyyzzz",
        amount: "50",
        asset: "USDT",
        chain: "tron",
        createdAt: "2025-01-15T11:00:00Z",
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    await createCryptoWithdrawal({
      asset: "USDT",
      chain: "tron",
      amount: 50,
      destinationAddress: "TXxxxyyyzzz",
    }, "test-key");

    const [, options] = fetchMock.mock.calls[0];
    const body = JSON.parse(options.body);
    expect(body.externalId).toBeUndefined();
  });

  it("throws on 403 (access denied)", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: false,
      status: 403,
      json: () => Promise.resolve({ error: "Insufficient permissions" }),
    }));

    await expect(createCryptoWithdrawal({
      asset: "USDT",
      chain: "polygon",
      amount: 100,
      destinationAddress: "0xabc",
    }, "test-key")).rejects.toThrow();
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// getCryptoWithdrawalStatus
// ══════════════════════════════════════════════════════════════════════════════

describe("getCryptoWithdrawalStatus (integration — mocked API)", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns COMPLETED withdrawal status", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({
        id: "wd_003",
        externalId: "ext_done",
        status: "COMPLETED",
        txHash: "0xhash123",
        amount: "100",
        asset: "USDT",
        chain: "polygon",
      }),
    }));

    const result = await getCryptoWithdrawalStatus("ext_done", "test-key");
    expect(result.status).toBe("COMPLETED");
    expect(result.txHash).toBe("0xhash123");
  });

  it("returns PENDING withdrawal status", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({
        id: "wd_004",
        externalId: "ext_pending",
        status: "PENDING",
        amount: "200",
        asset: "USDC",
        chain: "eth",
      }),
    }));

    const result = await getCryptoWithdrawalStatus("ext_pending", "test-key");
    expect(result.status).toBe("PENDING");
  });

  it("throws on 404 (not found)", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
      json: () => Promise.resolve({ error: "Withdrawal not found" }),
    }));

    await expect(
      getCryptoWithdrawalStatus("nonexistent", "test-key"),
    ).rejects.toThrow();
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// listCryptoWithdrawals
// ══════════════════════════════════════════════════════════════════════════════

describe("listCryptoWithdrawals (integration — mocked API)", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("filters CRYPTO_WITHDRAWAL entries from activity feed", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({
        data: [
          { id: "1", type: "CRYPTO_WITHDRAWAL", amount: "100", asset: "USDT" },
          { id: "2", type: "DEPOSIT", amount: "200" },
          { id: "3", type: "CRYPTO_WITHDRAWAL", amount: "50", asset: "USDC" },
          { id: "4", type: "CONVERSION", amount: "300" },
        ],
      }),
    }));

    const result = await listCryptoWithdrawals({ limit: 10 }, "test-key");
    expect(result).toHaveLength(2);
    expect(result[0].type).toBe("CRYPTO_WITHDRAWAL");
    expect(result[1].type).toBe("CRYPTO_WITHDRAWAL");
  });

  it("filters by asset", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({
        data: [
          { id: "1", type: "CRYPTO_WITHDRAWAL", asset: "USDT" },
          { id: "2", type: "CRYPTO_WITHDRAWAL", asset: "USDC" },
        ],
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    await listCryptoWithdrawals({ asset: "USDT" }, "test-key");

    const [url] = fetchMock.mock.calls[0];
    expect(url).toContain("currency=USDT");
  });

  it("returns empty array when response is not array-like", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve("not an array"),
    }));

    const result = await listCryptoWithdrawals({}, "test-key");
    expect(result).toEqual([]);
  });

  it("handles direct array response", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve([
        { id: "1", type: "CRYPTO_WITHDRAWAL", asset: "USDT" },
      ]),
    }));

    const result = await listCryptoWithdrawals({}, "test-key");
    expect(result).toHaveLength(1);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// getExchangeRate (additional edge cases beyond health.test.ts)
// ══════════════════════════════════════════════════════════════════════════════

describe("getExchangeRate (integration — mocked API)", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns rate for USDT → USD", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({
        rate: 1.0002,
        spreadPct: 0.1,
        source: "OKX",
      }),
    }));

    const result = await getExchangeRate("USDT", "USD", "test-key");
    expect(result.rate).toBeCloseTo(1.0, 0);
    expect(result.source).toBe("OKX");
  });

  it("returns rate for USDC → BRL", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({
        rate: 5.50,
        spreadPct: 0.5,
        source: "OKX",
      }),
    }));

    const result = await getExchangeRate("USDC", "BRL", "test-key");
    expect(result.rate).toBeCloseTo(5.5, 0);
  });

  it("returns rate:1 for same currency", async () => {
    const result = await getExchangeRate("BRL", "BRL");
    expect(result.rate).toBe(1);
    expect(result.spreadPct).toBe(0);
    expect(result.source).toBe("spot");
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// getPrices
// ══════════════════════════════════════════════════════════════════════════════

describe("getPrices (integration — mocked API)", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns price object", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({
        BRL: 5.70,
        USDT: 1.00,
        USDC: 1.00,
        EUR: 1.07,
      }),
    }));

    const prices = await getPrices("test-key");
    expect(prices.BRL).toBe(5.70);
    expect(prices.USDT).toBe(1.00);
  });

  it("throws on network error", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("fetch failed")));

    await expect(getPrices("test-key")).rejects.toThrow();
  });
});
