/**
 * Unit tests: constants.ts
 *
 * Valida:
 *   - CHAIN_PROVIDER — todo chain mapeado tem provider valido
 *   - ALL_SUPPORTED_CHAINS — inclui Notus + BlindPay
 *   - SUPPORTED_ASSETS / SUPPORTED_FIAT / ALL_CURRENCIES
 *   - ErrorCode — todos os codigos definidos
 *   - RETRYABLE_STATUSES — status codes que sao retentados
 */

import { describe, it, expect } from "vitest";
import {
  CHAIN_PROVIDER,
  NOTUS_CHAINS,
  BLINDPAY_CHAINS,
  ALL_SUPPORTED_CHAINS,
  SUPPORTED_CHAINS,
  SUPPORTED_ASSETS,
  SUPPORTED_FIAT,
  ALL_CURRENCIES,
  ErrorCode,
  RETRYABLE_STATUSES,
  MAX_RETRIES,
  RETRY_BASE_DELAY_MS,
  CHARACTER_LIMIT,
} from "../../src/constants.js";

describe("Chain constants", () => {
  it("NOTUS_CHAINS has correct values", () => {
    expect(NOTUS_CHAINS).toContain("eth");
    expect(NOTUS_CHAINS).toContain("polygon");
    expect(NOTUS_CHAINS).toContain("bsc");
    expect(NOTUS_CHAINS).toHaveLength(3);
  });

  it("BLINDPAY_CHAINS has correct values", () => {
    expect(BLINDPAY_CHAINS).toContain("solana");
    expect(BLINDPAY_CHAINS).toContain("tron");
    expect(BLINDPAY_CHAINS).toContain("stellar");
    expect(BLINDPAY_CHAINS).toContain("base");
    expect(BLINDPAY_CHAINS).toContain("arbitrum");
    expect(BLINDPAY_CHAINS).toHaveLength(5);
  });

  it("ALL_SUPPORTED_CHAINS = Notus + BlindPay", () => {
    expect(ALL_SUPPORTED_CHAINS).toHaveLength(8);
    expect(ALL_SUPPORTED_CHAINS).toEqual(
      expect.arrayContaining([...NOTUS_CHAINS, ...BLINDPAY_CHAINS]),
    );
  });
});

describe("CHAIN_PROVIDER mapping", () => {
  it("every canonical chain has a valid provider", () => {
    const validProviders = ["notus", "blindpay", "alchemy"];
    for (const chain of ALL_SUPPORTED_CHAINS) {
      expect(validProviders).toContain(CHAIN_PROVIDER[chain]);
    }
  });

  it("aliases (ethereum, trx) are mapped", () => {
    expect(CHAIN_PROVIDER["ethereum"]).toBe("notus");
    expect(CHAIN_PROVIDER["trx"]).toBe("blindpay");
  });

  it("Notus chains map to 'notus'", () => {
    for (const chain of NOTUS_CHAINS) {
      expect(CHAIN_PROVIDER[chain]).toBe("notus");
    }
  });

  it("BlindPay chains map to 'blindpay'", () => {
    for (const chain of BLINDPAY_CHAINS) {
      expect(CHAIN_PROVIDER[chain]).toBe("blindpay");
    }
  });
});

describe("Asset and currency constants", () => {
  it("SUPPORTED_ASSETS = ['USDT', 'USDC']", () => {
    expect(SUPPORTED_ASSETS).toEqual(["USDT", "USDC"]);
  });

  it("SUPPORTED_FIAT = ['BRL', 'USD', 'EUR']", () => {
    expect(SUPPORTED_FIAT).toEqual(["BRL", "USD", "EUR"]);
  });

  it("ALL_CURRENCIES = fiat + crypto (5 moedas)", () => {
    expect(ALL_CURRENCIES).toHaveLength(5);
    expect(ALL_CURRENCIES).toEqual(
      expect.arrayContaining(["BRL", "USD", "EUR", "USDT", "USDC"]),
    );
  });

  it("legacy SUPPORTED_CHAINS are UPPERCASE", () => {
    expect(SUPPORTED_CHAINS).toContain("ETHEREUM");
    expect(SUPPORTED_CHAINS).toContain("POLYGON");
    expect(SUPPORTED_CHAINS).toContain("BSC");
  });
});

describe("ErrorCode enum", () => {
  it("defines all expected codes", () => {
    expect(ErrorCode.AUTH_FAILED).toBe("AUTH_FAILED");
    expect(ErrorCode.ACCESS_DENIED).toBe("ACCESS_DENIED");
    expect(ErrorCode.VALIDATION_ERROR).toBe("VALIDATION_ERROR");
    expect(ErrorCode.NOT_FOUND).toBe("NOT_FOUND");
    expect(ErrorCode.RATE_LIMITED).toBe("RATE_LIMITED");
    expect(ErrorCode.NETWORK_ERROR).toBe("NETWORK_ERROR");
    expect(ErrorCode.TIMEOUT).toBe("TIMEOUT");
    expect(ErrorCode.UPSTREAM_ERROR).toBe("UPSTREAM_ERROR");
    expect(ErrorCode.UNKNOWN).toBe("UNKNOWN");
    expect(ErrorCode.CONFIG_ERROR).toBe("CONFIG_ERROR");
  });

  it("has 10 error codes", () => {
    expect(Object.keys(ErrorCode)).toHaveLength(10);
  });
});

describe("Retry configuration", () => {
  it("RETRYABLE_STATUSES includes standard transient codes", () => {
    expect(RETRYABLE_STATUSES.has(408)).toBe(true); // Request Timeout
    expect(RETRYABLE_STATUSES.has(429)).toBe(true); // Too Many Requests
    expect(RETRYABLE_STATUSES.has(500)).toBe(true);
    expect(RETRYABLE_STATUSES.has(502)).toBe(true);
    expect(RETRYABLE_STATUSES.has(503)).toBe(true);
    expect(RETRYABLE_STATUSES.has(504)).toBe(true);
  });

  it("RETRYABLE_STATUSES excludes client errors (4xx except 408/429)", () => {
    expect(RETRYABLE_STATUSES.has(400)).toBe(false);
    expect(RETRYABLE_STATUSES.has(401)).toBe(false);
    expect(RETRYABLE_STATUSES.has(403)).toBe(false);
    expect(RETRYABLE_STATUSES.has(404)).toBe(false);
  });

  it("MAX_RETRIES is 3", () => {
    expect(MAX_RETRIES).toBe(3);
  });

  it("RETRY_BASE_DELAY_MS is 500", () => {
    expect(RETRY_BASE_DELAY_MS).toBe(500);
  });

  it("exponential backoff values are correct", () => {
    // Attempt 1: 500 * 2^0 = 500ms
    expect(RETRY_BASE_DELAY_MS * Math.pow(2, 0)).toBe(500);
    // Attempt 2: 500 * 2^1 = 1000ms
    expect(RETRY_BASE_DELAY_MS * Math.pow(2, 1)).toBe(1000);
    // Attempt 3: 500 * 2^2 = 2000ms
    expect(RETRY_BASE_DELAY_MS * Math.pow(2, 2)).toBe(2000);
  });
});

describe("CHARACTER_LIMIT", () => {
  it("is 25,000", () => {
    expect(CHARACTER_LIMIT).toBe(25_000);
  });
});
