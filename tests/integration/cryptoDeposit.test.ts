/**
 * Integration tests: crypto deposit address (getCryptoDepositAddress)
 *
 * Testa a geracao de endereco de deposito crypto via management API com mock.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { getCryptoDepositAddress } from "../../src/services/asharApi.js";

describe("getCryptoDepositAddress (integration — mocked API)", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns deposit address for USDT on polygon", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({
        id: "addr_abc123",
        asset: "USDT",
        chain: "polygon",
        address: "0x1234567890abcdef1234567890abcdef12345678",
        label: "USDT Polygon Deposit",
        createdAt: "2025-01-15T10:30:00Z",
      }),
    }));

    const result = await getCryptoDepositAddress("USDT", "polygon", "test-api-key");
    expect(result.id).toBe("addr_abc123");
    expect(result.asset).toBe("USDT");
    expect(result.chain).toBe("polygon");
    expect(result.address).toBe("0x1234567890abcdef1234567890abcdef12345678");
  });

  it("returns deposit address for USDC on ethereum", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({
        id: "addr_def456",
        asset: "USDC",
        chain: "eth",
        address: "0xabcdef1234567890abcdef1234567890abcdef12",
        createdAt: "2025-01-15T10:31:00Z",
      }),
    }));

    const result = await getCryptoDepositAddress("USDC", "eth", "test-api-key");
    expect(result.id).toBe("addr_def456");
    expect(result.asset).toBe("USDC");
    expect(result.chain).toBe("eth");
  });

  it("throws on 401 (invalid API key)", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      json: () => Promise.resolve({ error: "Invalid API key" }),
    }));

    await expect(
      getCryptoDepositAddress("USDT", "polygon", "invalid-key"),
    ).rejects.toThrow();
  });

  it("throws on 400 (validation error — invalid asset)", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
      json: () => Promise.resolve({
        error: "Validation error",
        message: "Unsupported asset: INVALID_COIN",
      }),
    }));

    await expect(
      getCryptoDepositAddress("INVALID_COIN" as any, "polygon", "test-key"),
    ).rejects.toThrow();
  });

  it("throws on 404 (chain not found)", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
      json: () => Promise.resolve({ error: "Chain not supported: unknown_chain" }),
    }));

    await expect(
      getCryptoDepositAddress("USDT", "unknown_chain", "test-key"),
    ).rejects.toThrow();
  });

  it("retries on 500 errors and succeeds on 2nd attempt", async () => {
    let callCount = 0;
    vi.stubGlobal("fetch", vi.fn().mockImplementation(() => {
      callCount++;
      if (callCount === 1) {
        return Promise.resolve({
          ok: false,
          status: 500,
          json: () => Promise.resolve({ error: "Internal server error" }),
        });
      }
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve({
          id: "addr_retry",
          asset: "USDT",
          chain: "polygon",
          address: "0xretry000000000000000000000000000000000000",
          createdAt: "2025-01-15T10:32:00Z",
        }),
      });
    }));

    const result = await getCryptoDepositAddress("USDT", "polygon", "test-key");
    expect(callCount).toBe(2);
    expect(result.id).toBe("addr_retry");
  });

  it("retries up to MAX_RETRIES (3) and throws on persistent 500", async () => {
    let callCount = 0;
    vi.stubGlobal("fetch", vi.fn().mockImplementation(() => {
      callCount++;
      return Promise.resolve({
        ok: false,
        status: 500,
        json: () => Promise.resolve({ error: "Internal server error" }),
      });
    }));

    await expect(
      getCryptoDepositAddress("USDT", "polygon", "test-key"),
    ).rejects.toThrow();
    expect(callCount).toBe(3); // MAX_RETRIES
  });

  it("handles network errors (fetch fails) — retries and throws", async () => {
    let callCount = 0;
    vi.stubGlobal("fetch", vi.fn().mockImplementation(() => {
      callCount++;
      return Promise.reject(new Error("fetch failed"));
    }));

    await expect(
      getCryptoDepositAddress("USDT", "polygon", "test-key"),
    ).rejects.toThrow();
    expect(callCount).toBe(3); // retry on network errors too
  });

  it("passes correct API key in headers", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({
        id: "addr_headers",
        asset: "USDT",
        chain: "polygon",
        address: "0xheaders000000000000000000000000000000000000",
        createdAt: "2025-01-15T10:33:00Z",
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    await getCryptoDepositAddress("USDT", "polygon", "custom-key-123");

    const [, options] = fetchMock.mock.calls[0];
    expect(options.headers["x-api-key"]).toBe("custom-key-123");
  });

  it("does not send x-api-key header when no apiKey and no env var", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({
        id: "addr_default",
        asset: "USDC",
        chain: "bsc",
        address: "0xdefault000000000000000000000000000000000000",
        createdAt: "2025-01-15T10:34:00Z",
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    await getCryptoDepositAddress("USDC", "bsc", undefined);

    const [, options] = fetchMock.mock.calls[0];
    // When no key is available, the header should not be sent
    expect(options.headers["x-api-key"]).toBeUndefined();
  });
});
