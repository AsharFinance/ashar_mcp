/**
 * Integration tests: balances and wallet composition
 *
 * Testa getBalances, getWalletComposition, listCustodyAddresses com mock de fetch.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  getBalances,
  getWalletComposition,
  listCustodyAddresses,
} from "../../src/services/asharApi.js";

describe("getBalances (integration — mocked API)", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns normalized balances with all currencies", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({
        brl: { balance: 1500.50 },
        usd: { balance: 300.00 },
        eur: { balance: 250.75 },
        usdt: { balance: 1000.00 },
        usdc: { balance: 500.25 },
      }),
    }));

    const result = await getBalances("test-key");
    expect(result.brl).toBe(1500.50);
    expect(result.usd).toBe(300.00);
    expect(result.eur).toBe(250.75);
    expect(result.usdt).toBe(1000.00);
    expect(result.usdc).toBe(500.25);
  });

  it("returns zeros for missing currencies", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({
        brl: { balance: 100 },
        usd: { balance: 50 },
      }),
    }));

    const result = await getBalances("test-key");
    expect(result.brl).toBe(100);
    expect(result.usd).toBe(50);
    expect(result.eur).toBe(0);
    expect(result.usdt).toBe(0);
    expect(result.usdc).toBe(0);
  });

  it("handles empty response gracefully", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({}),
    }));

    const result = await getBalances("test-key");
    expect(result.brl).toBe(0);
    expect(result.usd).toBe(0);
  });

  it("throws on 401", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      json: () => Promise.resolve({ error: "Invalid API key" }),
    }));

    await expect(getBalances("invalid-key")).rejects.toThrow();
  });

  it("throws on network error after retries", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("fetch failed")));

    await expect(getBalances("test-key")).rejects.toThrow();
  });
});

describe("listCustodyAddresses (integration — mocked API)", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns addresses array when response is a direct array", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve([
        { id: "addr1", chain: "polygon", asset: "USDT", address: "0xabc" },
        { id: "addr2", chain: "eth", asset: "USDC", address: "0xdef" },
      ]),
    }));

    const result = await listCustodyAddresses("test-key");
    expect(result).toHaveLength(2);
    expect(result[0].id).toBe("addr1");
    expect(result[1].id).toBe("addr2");
  });

  it("extracts addresses from { addresses: [...] } wrapper", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({
        addresses: [
          { id: "addr3", chain: "bsc", asset: "USDT", address: "0xghi" },
        ],
      }),
    }));

    const result = await listCustodyAddresses("test-key");
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("addr3");
  });

  it("returns empty array when response is not array-like", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ message: "no addresses" }),
    }));

    const result = await listCustodyAddresses("test-key");
    expect(result).toEqual([]);
  });

  it("throws on 403 (access denied)", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: false,
      status: 403,
      json: () => Promise.resolve({ error: "Forbidden" }),
    }));

    await expect(listCustodyAddresses("test-key")).rejects.toThrow();
  });
});

describe("getWalletComposition (integration — mocked API)", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("combines balances and addresses in parallel", async () => {
    let callCount = 0;
    vi.stubGlobal("fetch", vi.fn().mockImplementation((url: string) => {
      callCount++;
      if (url.includes("/balance")) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve({
            brl: { balance: 1000 },
            usd: { balance: 200 },
            eur: { balance: 0 },
            usdt: { balance: 500 },
            usdc: { balance: 300 },
          }),
        });
      }
      // /custody/addresses
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve([
          { id: "ca1", chain: "polygon", asset: "USDT", address: "0x111" },
          { id: "ca2", chain: "eth", asset: "USDC", address: "0x222" },
        ]),
      });
    }));

    const result = await getWalletComposition("test-key");

    expect(result.balances.brl).toBe(1000);
    expect(result.balances.usd).toBe(200);
    expect(result.balances.usdt).toBe(500);
    expect(result.balances.usdc).toBe(300);
    expect(result.addresses).toHaveLength(2);
    expect(result.addresses[0].id).toBe("ca1");
  });

  it("returns default values when balance fetch fails", async () => {
    let callCount = 0;
    vi.stubGlobal("fetch", vi.fn().mockImplementation((url: string) => {
      callCount++;
      if (url.includes("/balance")) {
        return Promise.reject(new Error("fetch failed"));
      }
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve([
          { id: "ca3", chain: "tron", asset: "USDT", address: "TXxxxyyyzzz" },
        ]),
      });
    }));

    const result = await getWalletComposition("test-key");

    // Balances should default to zeros
    expect(result.balances.brl).toBe(0);
    expect(result.balances.usd).toBe(0);
    // Addresses should still be fetched
    expect(result.addresses).toHaveLength(1);
    expect(result.addresses[0].id).toBe("ca3");
  });

  it("returns default values when addresses fetch fails", async () => {
    let callCount = 0;
    vi.stubGlobal("fetch", vi.fn().mockImplementation((url: string) => {
      callCount++;
      if (url.includes("/balance")) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve({
            brl: { balance: 5000 },
            usd: { balance: 1000 },
            eur: { balance: 0 },
            usdt: { balance: 0 },
            usdc: { balance: 0 },
          }),
        });
      }
      return Promise.reject(new Error("fetch failed"));
    }));

    const result = await getWalletComposition("test-key");

    expect(result.balances.brl).toBe(5000);
    expect(result.balances.usd).toBe(1000);
    expect(result.addresses).toEqual([]);
  });

  it("returns defaults when both fetches fail", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("fetch failed")));

    const result = await getWalletComposition("test-key");

    expect(result.balances.brl).toBe(0);
    expect(result.balances.usd).toBe(0);
    expect(result.addresses).toEqual([]);
  });
});
