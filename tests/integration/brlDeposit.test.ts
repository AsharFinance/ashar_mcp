/**
 * Integration tests: BRL deposit operations (create, status, list)
 *
 * Testa createBrlDeposit, getBrlDepositStatus, listBrlDeposits com mock de fetch.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  createBrlDeposit,
  getBrlDepositStatus,
  listBrlDeposits,
} from "../../src/services/asharApi.js";

describe("createBrlDeposit (integration — mocked API)", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("creates a PIX deposit and returns expected fields", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({
        id: "dep_abc123",
        txid: "tx_xyz789",
        amount_brl: 500,
        pix_copy_paste: "00020126580014br.gov.bcb.pix...",
        status: "PENDING",
        expires_at: "2025-01-15T14:30:00Z",
        created_at: "2025-01-15T10:30:00Z",
        provider_slug: "c6bank",
        retry_count: 0,
        max_retries: 3,
        upstream_status: null,
        paid_at: null,
      }),
    }));

    const result = await createBrlDeposit(500, "test-key");
    expect(result.id).toBe("dep_abc123");
    expect(result.txid).toBe("tx_xyz789");
    expect(result.amount_brl).toBe(500);
    expect(result.pix_copy_paste).toBeTruthy();
    expect(result.status).toBe("PENDING");
  });

  it("creates a deposit with different amounts", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({
        id: "dep_amount",
        txid: "tx_amount",
        amount_brl: 99.90,
        pix_copy_paste: "pixcopy99",
        status: "PENDING",
        expires_at: "2025-01-15T14:30:00Z",
        created_at: "2025-01-15T10:30:00Z",
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    await createBrlDeposit(99.90, "test-key");

    const [, options] = fetchMock.mock.calls[0];
    const body = JSON.parse(options.body);
    expect(body.amount).toBe(99.90);
  });

  it("throws on 400 (validation error)", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
      json: () => Promise.resolve({
        error: "Validation error",
        message: "amount must be positive",
      }),
    }));

    await expect(createBrlDeposit(-100, "test-key")).rejects.toThrow();
  });

  it("throws on 429 (rate limited) after retries", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: false,
      status: 429,
      json: () => Promise.resolve({ error: "Too many requests" }),
    }));

    await expect(createBrlDeposit(100, "test-key")).rejects.toThrow();
  });

  it("handles network timeout", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("The operation was aborted")));

    await expect(createBrlDeposit(100, "test-key")).rejects.toThrow();
  });
});

describe("getBrlDepositStatus (integration — mocked API)", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns status for a PAID deposit", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({
        id: "dep_1",
        txid: "tx_1",
        amount_brl: 500,
        pix_copy_paste: "pixcopy",
        status: "PAID",
        expires_at: "2025-01-15T14:30:00Z",
        created_at: "2025-01-15T10:30:00Z",
        paid_at: "2025-01-15T10:35:00Z",
        upstream_status: "CONFIRMED",
      }),
    }));

    const result = await getBrlDepositStatus("tx_1", "test-key");
    expect(result.status).toBe("PAID");
    expect(result.paid_at).toBe("2025-01-15T10:35:00Z");
    expect(result.upstream_status).toBe("CONFIRMED");
  });

  it("returns status for a PENDING deposit", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({
        id: "dep_2",
        txid: "tx_2",
        amount_brl: 300,
        pix_copy_paste: "pixcopy2",
        status: "PENDING",
        expires_at: "2025-01-15T14:30:00Z",
        created_at: "2025-01-15T10:30:00Z",
        paid_at: null,
        upstream_status: null,
      }),
    }));

    const result = await getBrlDepositStatus("tx_2", "test-key");
    expect(result.status).toBe("PENDING");
    expect(result.paid_at).toBeNull();
  });

  it("returns status for a FAILED deposit", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({
        id: "dep_3",
        txid: "tx_3",
        amount_brl: 150,
        pix_copy_paste: "pixcopy3",
        status: "FAILED",
        expires_at: "2025-01-15T14:30:00Z",
        created_at: "2025-01-15T10:30:00Z",
        paid_at: null,
        upstream_status: "REJECTED",
      }),
    }));

    const result = await getBrlDepositStatus("tx_3", "test-key");
    expect(result.status).toBe("FAILED");
  });

  it("throws on 404 (txid not found)", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
      json: () => Promise.resolve({ error: "Transaction not found" }),
    }));

    await expect(getBrlDepositStatus("nonexistent", "test-key")).rejects.toThrow();
  });
});

describe("listBrlDeposits (integration — mocked API)", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns list of deposits", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve([
        { id: "d1", txid: "tx1", amount_brl: 500, status: "PAID", created_at: "2025-01-15", paid_at: "2025-01-15" },
        { id: "d2", txid: "tx2", amount_brl: 300, status: "PENDING", created_at: "2025-01-14", paid_at: null },
        { id: "d3", txid: "tx3", amount_brl: 150, status: "FAILED", created_at: "2025-01-13", paid_at: null },
      ]),
    }));

    const result = await listBrlDeposits(30, "test-key");
    expect(result).toHaveLength(3);
    expect(result[0].status).toBe("PAID");
    expect(result[1].status).toBe("PENDING");
    expect(result[2].status).toBe("FAILED");
  });

  it("returns empty array when no deposits", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve([]),
    }));

    const result = await listBrlDeposits(10, "test-key");
    expect(result).toEqual([]);
  });

  it("passes limit in query string", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve([]),
    });
    vi.stubGlobal("fetch", fetchMock);

    await listBrlDeposits(5, "test-key");

    const [url] = fetchMock.mock.calls[0];
    expect(url).toContain("limit=5");
  });

  it("handles non-array response gracefully", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ message: "no data" }),
    }));

    const result = await listBrlDeposits(10, "test-key");
    expect(result).toEqual([]);
  });

  it("throws on 401", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      json: () => Promise.resolve({ error: "Invalid API key" }),
    }));

    await expect(listBrlDeposits(10, "invalid-key")).rejects.toThrow();
  });
});
