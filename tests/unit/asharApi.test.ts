/**
 * Unit tests: core functions from asharApi.ts and constants.ts
 *
 * Testa funcoes puras (sem side-effects de rede):
 *   - resolveProvider() — mapeamento chain → provider
 *   - handleApiError() — traducao de erros para portugues
 *   - AsharApiError — classe de erro estruturada
 *   - getDiagnostics() — config sem expor secrets
 *   - constants — valores esperados
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  AsharApiError,
  resolveProvider,
  handleApiError,
  getDiagnostics,
  classifyNetworkError,
  httpStatusToErrorCode,
  getCaaSAuthHeader,
} from "../../src/services/asharApi.js";
import { ErrorCode } from "../../src/constants.js";
import type { ApiErrorDetail } from "../../src/services/asharApi.js";

// ──────────────────────────────────────────────────────────────────────────────
// resolveProvider — chain → provider mapping
// ──────────────────────────────────────────────────────────────────────────────

describe("resolveProvider", () => {
  it("maps Notus chains (lowercase)", () => {
    expect(resolveProvider("eth")).toBe("notus");
    expect(resolveProvider("polygon")).toBe("notus");
    expect(resolveProvider("bsc")).toBe("notus");
  });

  it("maps BlindPay chains (lowercase)", () => {
    expect(resolveProvider("solana")).toBe("blindpay");
    expect(resolveProvider("tron")).toBe("blindpay");
    expect(resolveProvider("stellar")).toBe("blindpay");
    expect(resolveProvider("base")).toBe("blindpay");
    expect(resolveProvider("arbitrum")).toBe("blindpay");
  });

  it("resolves aliases (case-insensitive)", () => {
    expect(resolveProvider("ETH")).toBe("notus");
    expect(resolveProvider("Ethereum")).toBe("notus");
    expect(resolveProvider("ethereum")).toBe("notus");
    expect(resolveProvider("TRX")).toBe("blindpay");
    expect(resolveProvider("POLYGON")).toBe("notus");
  });

  it('falls back to "blindpay" for unknown chains', () => {
    expect(resolveProvider("bitcoin")).toBe("blindpay");
    expect(resolveProvider("dogecoin")).toBe("blindpay");
    expect(resolveProvider("")).toBe("blindpay");
    // @ts-expect-error — testing runtime behavior with invalid input
    expect(resolveProvider(null)).toBe("blindpay");
    // @ts-expect-error
    expect(resolveProvider(undefined)).toBe("blindpay");
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// AsharApiError — structured error class
// ──────────────────────────────────────────────────────────────────────────────

describe("AsharApiError", () => {
  const baseDetail: ApiErrorDetail = {
    code: ErrorCode.AUTH_FAILED,
    message: "Invalid API key",
    status: 401,
    requestId: "req_test_123",
    retryable: false,
    suggestion: "Use a valid key",
  };

  it("constructs with ApiErrorDetail", () => {
    const err = new AsharApiError(baseDetail);
    expect(err).toBeInstanceOf(Error);
    expect(err.name).toBe("AsharApiError");
    expect(err.status).toBe(401);
    expect(err.code).toBe(ErrorCode.AUTH_FAILED);
    expect(err.message).toBe("Invalid API key");
    expect(err.requestId).toBe("req_test_123");
    expect(err.body).toEqual(baseDetail);
  });

  it("accepts minimal detail (status=0)", () => {
    const err = new AsharApiError({
      code: ErrorCode.UNKNOWN,
      message: "Something broke",
      retryable: true,
    });
    expect(err.status).toBe(0);
    expect(err.code).toBe(ErrorCode.UNKNOWN);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// handleApiError — user-friendly error messages
// ──────────────────────────────────────────────────────────────────────────────

describe("handleApiError", () => {
  it("translates AUTH_FAILED (401)", () => {
    const err = new AsharApiError({
      code: ErrorCode.AUTH_FAILED,
      message: "Invalid API key",
      status: 401,
      retryable: false,
    });
    const msg = handleApiError(err);
    expect(msg).toContain("Erro de autenticacao");
    expect(msg).toContain("API key invalida");
  });

  it("translates ACCESS_DENIED (403)", () => {
    const err = new AsharApiError({
      code: ErrorCode.ACCESS_DENIED,
      message: "Forbidden",
      status: 403,
      retryable: false,
    });
    const msg = handleApiError(err);
    expect(msg).toContain("Acesso negado");
  });

  it("translates VALIDATION_ERROR (400)", () => {
    const err = new AsharApiError({
      code: ErrorCode.VALIDATION_ERROR,
      message: "amount is required",
      status: 400,
      retryable: false,
    });
    const msg = handleApiError(err);
    expect(msg).toContain("Erro de validacao");
    expect(msg).toContain("amount is required");
  });

  it("translates NOT_FOUND (404)", () => {
    const err = new AsharApiError({
      code: ErrorCode.NOT_FOUND,
      message: "Recurso nao encontrado",
      status: 404,
      retryable: false,
    });
    const msg = handleApiError(err);
    expect(msg).toContain("Recurso nao encontrado");
  });

  it("translates RATE_LIMITED (429)", () => {
    const err = new AsharApiError({
      code: ErrorCode.RATE_LIMITED,
      message: "Too many requests",
      status: 429,
      retryable: true,
    });
    const msg = handleApiError(err);
    expect(msg).toContain("Limite de requisicoes excedido");
  });

  it("translates TIMEOUT", () => {
    const err = new AsharApiError({
      code: ErrorCode.TIMEOUT,
      message: "The operation was aborted",
      retryable: true,
    });
    const msg = handleApiError(err);
    expect(msg).toContain("Timeout");
  });

  it("translates NETWORK_ERROR", () => {
    const err = new AsharApiError({
      code: ErrorCode.NETWORK_ERROR,
      message: "fetch failed",
      retryable: true,
    });
    const msg = handleApiError(err);
    expect(msg).toContain("Erro de rede");
  });

  it("translates UPSTREAM_ERROR (500)", () => {
    const err = new AsharApiError({
      code: ErrorCode.UPSTREAM_ERROR,
      message: "Internal server error",
      status: 500,
      retryable: true,
    });
    const msg = handleApiError(err);
    expect(msg).toContain("Erro interno na API Ashar");
  });

  it("shows suggestion when provided", () => {
    const err = new AsharApiError({
      code: ErrorCode.AUTH_FAILED,
      message: "Invalid key",
      status: 401,
      retryable: false,
      suggestion: "Va em configuracoes > API Keys",
    });
    const msg = handleApiError(err);
    expect(msg).toContain("💡");
    expect(msg).toContain("Va em configuracoes");
  });

  it("handles generic Error", () => {
    const msg = handleApiError(new Error("Something unexpected"));
    expect(msg).toContain("Erro inesperado");
    expect(msg).toContain("Something unexpected");
  });

  it("handles string error", () => {
    const msg = handleApiError("plain string error");
    expect(msg).toContain("Erro inesperado");
    expect(msg).toContain("plain string error");
  });

  it("handles null/undefined gracefully", () => {
    const msg = handleApiError(null);
    expect(msg).toContain("Erro inesperado");
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// getDiagnostics — safe config dump
// ──────────────────────────────────────────────────────────────────────────────

describe("getDiagnostics", () => {
  it("returns expected keys", () => {
    const diag = getDiagnostics();
    expect(diag).toHaveProperty("apiBaseUrl");
    expect(diag).toHaveProperty("caasApiUrl");
    expect(diag).toHaveProperty("hasApiKey");
    expect(diag).toHaveProperty("hasCaasKey");
    expect(diag).toHaveProperty("timeoutMs");
    expect(diag).toHaveProperty("maxRetries");
    expect(diag).toHaveProperty("debugMode");
    expect(diag).toHaveProperty("defaultApiKeyHint");
  });

  it("masks API key (only shows first 8 chars)", () => {
    const diag = getDiagnostics();
    // Without ASHAR_API_KEY set, hint is "not set"
    expect(diag.defaultApiKeyHint).toBeDefined();
    expect(typeof diag.defaultApiKeyHint).toBe("string");
    // Should not expose the full key
    expect((diag.defaultApiKeyHint as string).length).toBeLessThanOrEqual(16);
  });

  it("reports correct timeout and maxRetries", () => {
    const diag = getDiagnostics();
    expect(diag.timeoutMs).toBeGreaterThanOrEqual(30000);
    expect(diag.maxRetries).toBe(3);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// classifyNetworkError — network error classification
// ──────────────────────────────────────────────────────────────────────────────

describe("classifyNetworkError", () => {
  it("classifies timeout errors", () => {
    const result = classifyNetworkError(new Error("The operation was aborted due to timeout"));
    expect(result.code).toBe(ErrorCode.TIMEOUT);
    expect(result.retryable).toBe(true);
    expect(result.suggestion).toContain("demorou a responder");
  });

  it("classifies abort errors", () => {
    const result = classifyNetworkError(new Error("AbortError: The operation was aborted"));
    expect(result.code).toBe(ErrorCode.TIMEOUT);
    expect(result.retryable).toBe(true);
  });

  it("classifies aborted errors", () => {
    const result = classifyNetworkError(new Error("Request aborted"));
    expect(result.code).toBe(ErrorCode.TIMEOUT);
  });

  it("classifies fetch failed as NETWORK_ERROR", () => {
    const result = classifyNetworkError(new Error("fetch failed"));
    expect(result.code).toBe(ErrorCode.NETWORK_ERROR);
    expect(result.retryable).toBe(true);
    expect(result.suggestion).toContain("Falha na rede");
  });

  it("classifies ECONNREFUSED as NETWORK_ERROR", () => {
    const result = classifyNetworkError(new Error("connect ECONNREFUSED 127.0.0.1:443"));
    expect(result.code).toBe(ErrorCode.NETWORK_ERROR);
  });

  it("classifies ENOTFOUND as NETWORK_ERROR", () => {
    const result = classifyNetworkError(new Error("getaddrinfo ENOTFOUND api.ashar.finance"));
    expect(result.code).toBe(ErrorCode.NETWORK_ERROR);
  });

  it("classifies DNS errors as NETWORK_ERROR", () => {
    const result = classifyNetworkError(new Error("DNS lookup failed"));
    expect(result.code).toBe(ErrorCode.NETWORK_ERROR);
  });

  it("classifies unknown errors as UNKNOWN", () => {
    const result = classifyNetworkError(new Error("some random error message"));
    expect(result.code).toBe(ErrorCode.UNKNOWN);
    expect(result.retryable).toBe(false);
  });

  it("is case-insensitive for timeout", () => {
    const result = classifyNetworkError(new Error("TIMEOUT occurred"));
    expect(result.code).toBe(ErrorCode.TIMEOUT);
  });

  it("is case-insensitive for fetch failed", () => {
    const result = classifyNetworkError(new Error("FETCH FAILED"));
    expect(result.code).toBe(ErrorCode.NETWORK_ERROR);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// httpStatusToErrorCode — HTTP status → ErrorCode mapping
// ──────────────────────────────────────────────────────────────────────────────

describe("httpStatusToErrorCode", () => {
  it("maps 400 to VALIDATION_ERROR", () => {
    expect(httpStatusToErrorCode(400)).toBe(ErrorCode.VALIDATION_ERROR);
  });

  it("maps 401 to AUTH_FAILED", () => {
    expect(httpStatusToErrorCode(401)).toBe(ErrorCode.AUTH_FAILED);
  });

  it("maps 403 to ACCESS_DENIED", () => {
    expect(httpStatusToErrorCode(403)).toBe(ErrorCode.ACCESS_DENIED);
  });

  it("maps 404 to NOT_FOUND", () => {
    expect(httpStatusToErrorCode(404)).toBe(ErrorCode.NOT_FOUND);
  });

  it("maps 429 to RATE_LIMITED", () => {
    expect(httpStatusToErrorCode(429)).toBe(ErrorCode.RATE_LIMITED);
  });

  it("maps 500 to UPSTREAM_ERROR", () => {
    expect(httpStatusToErrorCode(500)).toBe(ErrorCode.UPSTREAM_ERROR);
  });

  it("maps 502 to UPSTREAM_ERROR", () => {
    expect(httpStatusToErrorCode(502)).toBe(ErrorCode.UPSTREAM_ERROR);
  });

  it("maps 503 to UPSTREAM_ERROR", () => {
    expect(httpStatusToErrorCode(503)).toBe(ErrorCode.UPSTREAM_ERROR);
  });

  it("maps 504 to UPSTREAM_ERROR", () => {
    expect(httpStatusToErrorCode(504)).toBe(ErrorCode.UPSTREAM_ERROR);
  });

  it("maps unknown 4xx to UNKNOWN", () => {
    expect(httpStatusToErrorCode(418)).toBe(ErrorCode.UNKNOWN);
    expect(httpStatusToErrorCode(405)).toBe(ErrorCode.UNKNOWN);
    expect(httpStatusToErrorCode(409)).toBe(ErrorCode.UNKNOWN);
  });

  it("maps unknown 5xx to UPSTREAM_ERROR", () => {
    expect(httpStatusToErrorCode(501)).toBe(ErrorCode.UPSTREAM_ERROR);
    expect(httpStatusToErrorCode(520)).toBe(ErrorCode.UPSTREAM_ERROR);
    expect(httpStatusToErrorCode(599)).toBe(ErrorCode.UPSTREAM_ERROR);
  });

  it("maps 2xx to UNKNOWN (should not normally happen)", () => {
    expect(httpStatusToErrorCode(200)).toBe(ErrorCode.UNKNOWN);
    expect(httpStatusToErrorCode(201)).toBe(ErrorCode.UNKNOWN);
  });

  it("maps 3xx to UNKNOWN", () => {
    expect(httpStatusToErrorCode(301)).toBe(ErrorCode.UNKNOWN);
    expect(httpStatusToErrorCode(302)).toBe(ErrorCode.UNKNOWN);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// getCaaSAuthHeader — HMAC generation and caching
// ──────────────────────────────────────────────────────────────────────────────

describe("getCaaSAuthHeader", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it("returns empty string when CAAS_API_KEY is not set", async () => {
    delete process.env.CAAS_API_KEY;
    // Need to re-import because the module caches env vars at load time
    const mod = await import("../../src/services/asharApi.js");
    expect(mod.getCaaSAuthHeader()).toBe("");
  });

  it("returns the key directly when it is in JWT format (3 parts)", async () => {
    process.env.CAAS_API_KEY = "header.payload.signature";
    const mod = await import("../../src/services/asharApi.js");
    const result = mod.getCaaSAuthHeader();
    expect(result).toBe("header.payload.signature");
  });

  it("generates HMAC-signed JWT when CAAS_API_KEY is a raw secret", async () => {
    process.env.CAAS_API_KEY = "my-secret-key";
    const mod = await import("../../src/services/asharApi.js");
    const result = mod.getCaaSAuthHeader();

    // Should be in JWT format: header.payload.signature
    const parts = result.split(".");
    expect(parts).toHaveLength(3);

    // Header should decode to { alg: "HS256", typ: "JWT" }
    const header = JSON.parse(Buffer.from(parts[0], "base64url").toString());
    expect(header).toEqual({ alg: "HS256", typ: "JWT" });

    // Payload should have sub and role
    const payload = JSON.parse(Buffer.from(parts[1], "base64url").toString());
    expect(payload.sub).toBe("ashar-mcp");
    expect(payload.role).toBe("admin");
    expect(payload.exp).toBeGreaterThan(Date.now() / 1000);

    // Signature should be non-empty
    expect(parts[2].length).toBeGreaterThan(0);
  });

  it("caches the generated key and returns same value on subsequent calls", async () => {
    process.env.CAAS_API_KEY = "my-secret-key";
    const mod = await import("../../src/services/asharApi.js");
    const first = mod.getCaaSAuthHeader();
    const second = mod.getCaaSAuthHeader();
    expect(first).toBe(second);
  });

  it("generates a key with ~24h expiry", async () => {
    process.env.CAAS_API_KEY = "test-secret";
    const mod = await import("../../src/services/asharApi.js");
    const result = mod.getCaaSAuthHeader();
    const payload = JSON.parse(Buffer.from(result.split(".")[1], "base64url").toString());
    const nowSec = Math.floor(Date.now() / 1000);
    // Should expire in roughly 24h (86400 seconds)
    expect(payload.exp).toBeGreaterThan(nowSec + 86000);
    expect(payload.exp).toBeLessThan(nowSec + 86400 + 10); // allow small clock skew
  });
});
