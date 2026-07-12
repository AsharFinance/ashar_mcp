/**
 * Integration tests: bank accounts, fiat remittances, webhooks
 *
 * Testa listBankAccounts, createBankAccount, updateBankAccount, deleteBankAccount,
 * listRemittances, createRemittance, listWebhooks, createWebhook, deleteWebhook,
 * testWebhook com mock de fetch.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  listBankAccounts,
  createBankAccount,
  updateBankAccount,
  deleteBankAccount,
  listRemittances,
  createRemittance,
  listWebhooks,
  createWebhook,
  deleteWebhook,
  testWebhook,
} from "../../src/services/asharApi.js";

// ══════════════════════════════════════════════════════════════════════════════
// Bank Accounts
// ══════════════════════════════════════════════════════════════════════════════

describe("Bank Accounts (integration — mocked API)", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("listBankAccounts", () => {
    it("returns array of bank accounts", async () => {
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve([
          { id: "ba1", label: "Conta BR", country: "BR", currency: "BRL", accountType: "CHECKING" },
          { id: "ba2", label: "Conta US", country: "US", currency: "USD", accountType: "CHECKING" },
        ]),
      }));

      const result = await listBankAccounts("test-key");
      expect(result).toHaveLength(2);
      expect(result[0].label).toBe("Conta BR");
      expect(result[1].currency).toBe("USD");
    });
  });

  describe("createBankAccount", () => {
    it("creates a Brazilian checking account", async () => {
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        status: 201,
        json: () => Promise.resolve({
          id: "ba_new",
          label: "Minha Conta",
          country: "BR",
          currency: "BRL",
          accountType: "CHECKING",
          beneficiary: "Joao Silva",
        }),
      });
      vi.stubGlobal("fetch", fetchMock);

      const result = await createBankAccount({
        label: "Minha Conta",
        country: "BR",
        currency: "BRL",
        accountType: "CHECKING",
        beneficiary: "Joao Silva",
        pixKey: "joao@email.com",
        pixKeyType: "EMAIL",
      }, "test-key");

      expect(result.id).toBe("ba_new");
      expect(result.label).toBe("Minha Conta");
    });

    it("creates a European IBAN account", async () => {
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        status: 201,
        json: () => Promise.resolve({
          id: "ba_eur",
          label: "Conta EUR",
          country: "PT",
          currency: "EUR",
          accountType: "SAVINGS",
        }),
      });
      vi.stubGlobal("fetch", fetchMock);

      const result = await createBankAccount({
        label: "Conta EUR",
        country: "PT",
        currency: "EUR",
        accountType: "SAVINGS",
        beneficiary: "Maria",
        iban: "PT500001012345678901",
        swift: "BPIOPTPL",
      }, "test-key");

      expect(result.id).toBe("ba_eur");
    });

    it("throws on 400 validation error", async () => {
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
        ok: false,
        status: 400,
        json: () => Promise.resolve({ error: "label is required" }),
      }));

      await expect(createBankAccount({
        label: "",
        country: "BR",
        currency: "BRL",
        accountType: "CHECKING",
        beneficiary: "Joao",
      }, "test-key")).rejects.toThrow();
    });
  });

  describe("updateBankAccount", () => {
    it("updates label and beneficiary", async () => {
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve({
          id: "ba1",
          label: "Updated Label",
          beneficiary: "New Name",
        }),
      });
      vi.stubGlobal("fetch", fetchMock);

      const result = await updateBankAccount("ba1", {
        label: "Updated Label",
        beneficiary: "New Name",
      }, "test-key");

      expect(result.label).toBe("Updated Label");
    });

    it("throws on 404", async () => {
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
        ok: false,
        status: 404,
        json: () => Promise.resolve({ error: "Bank account not found" }),
      }));

      await expect(updateBankAccount("nonexistent", {}, "test-key")).rejects.toThrow();
    });
  });

  describe("deleteBankAccount", () => {
    it("deletes a bank account", async () => {
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ success: true }),
      }));

      const result = await deleteBankAccount("ba1", "test-key");
      expect(result.success).toBe(true);
    });

    it("throws on 404", async () => {
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
        ok: false,
        status: 404,
        json: () => Promise.resolve({ error: "Bank account not found" }),
      }));

      await expect(deleteBankAccount("nonexistent", "test-key")).rejects.toThrow();
    });
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// Fiat Remittances (Withdrawals)
// ══════════════════════════════════════════════════════════════════════════════

describe("Fiat Remittances (integration — mocked API)", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("listRemittances", () => {
    it("returns array of remittances", async () => {
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve([
          { id: "rem1", amountBrl: "500", targetCurrency: "USD", status: "COMPLETED" },
          { id: "rem2", amountBrl: "1000", targetCurrency: "EUR", status: "PENDING" },
        ]),
      }));

      const result = await listRemittances("test-key");
      expect(result).toHaveLength(2);
    });
  });

  describe("createRemittance", () => {
    it("creates a BRL → USD remittance", async () => {
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve({
          id: "rem_new",
          amountBrl: "500",
          targetCurrency: "USD",
          sourceCurrency: "BRL",
          status: "PENDING",
        }),
      });
      vi.stubGlobal("fetch", fetchMock);

      const result = await createRemittance({
        amount: 500,
        sourceCurrency: "BRL",
        targetCurrency: "USD",
        rate: 5.50,
        spreadPct: 2.5,
        iban: "US123456789",
        swift: "BOFAUS3N",
      }, "test-key");

      expect(result.id).toBe("rem_new");
      expect(result.status).toBe("PENDING");
    });

    it("calculates spreadCostBrl correctly", async () => {
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ id: "rem_spread" }),
      });
      vi.stubGlobal("fetch", fetchMock);

      await createRemittance({
        amount: 1000,
        sourceCurrency: "BRL",
        targetCurrency: "USD",
        spreadPct: 3.0,
      }, "test-key");

      const [, options] = fetchMock.mock.calls[0];
      const body = JSON.parse(options.body);
      expect(body.spreadCostBrl).toBe(30); // 1000 * 3 / 100
    });
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// Webhooks
// ══════════════════════════════════════════════════════════════════════════════

describe("Webhooks (integration — mocked API)", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("listWebhooks", () => {
    it("returns array of webhooks", async () => {
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve([
          { id: "wh1", label: "My Server", url: "https://example.com/hook", events: "all" },
        ]),
      }));

      const result = await listWebhooks("test-key");
      expect(result).toHaveLength(1);
      expect(result[0].label).toBe("My Server");
    });
  });

  describe("createWebhook", () => {
    it("creates a webhook", async () => {
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
        ok: true,
        status: 201,
        json: () => Promise.resolve({
          id: "wh_new",
          label: "New Hook",
          url: "https://example.com/webhook",
          events: "deposit,withdrawal",
        }),
      }));

      const result = await createWebhook({
        label: "New Hook",
        url: "https://example.com/webhook",
        events: "deposit,withdrawal",
      }, "test-key");

      expect(result.id).toBe("wh_new");
      expect(result.events).toBe("deposit,withdrawal");
    });
  });

  describe("deleteWebhook", () => {
    it("deletes a webhook", async () => {
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ success: true }),
      }));

      const result = await deleteWebhook("wh1", "test-key");
      expect(result.success).toBe(true);
    });
  });

  describe("testWebhook", () => {
    it("tests a webhook and returns result", async () => {
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve({
          success: true,
          statusCode: 200,
          responseTimeMs: 145,
        }),
      }));

      const result = await testWebhook("wh1", "test-key");
      expect(result.success).toBe(true);
      expect(result.statusCode).toBe(200);
    });

    it("reports failure when webhook target is unreachable", async () => {
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve({
          success: false,
          statusCode: 500,
          error: "Connection refused",
        }),
      }));

      const result = await testWebhook("wh_broken", "test-key");
      expect(result.success).toBe(false);
      expect(result.error).toBe("Connection refused");
    });
  });
});
