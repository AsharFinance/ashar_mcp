/**
 * Ashar Finance API Client (v2)
 *
 * Encapsulates all HTTP calls to the Ashar management backend and CaaS.
 *
 * Features:
 *   - Exponential backoff retry for transient failures (5xx, 429, network errors)
 *   - Request tracing with unique IDs for debugging
 *   - Structured error classification via ErrorCode enum
 *   - Configurable timeouts
 *   - CaaS HMAC authentication with caching
 */

import crypto from "crypto";
import { CHAIN_PROVIDER, ErrorCode, MAX_RETRIES, RETRY_BASE_DELAY_MS, RETRYABLE_STATUSES } from "../constants.js";

// ── Configuration ─────────────────────────────────────────────────────────────

const API_BASE_URL = process.env.ASHAR_API_URL || "https://api.ashar.finance";
const CAAS_API_URL = process.env.CAAS_API_URL || "https://api-assets.up.railway.app";
const DEFAULT_API_KEY = process.env.ASHAR_API_KEY || "";
const CAAS_API_KEY = process.env.CAAS_API_KEY || "";
const TIMEOUT_MS = parseInt(process.env.ASHAR_TIMEOUT_MS || "30000", 10);
const DEBUG_MODE = process.env.ASHAR_DEBUG === "true";

// ── Logger ────────────────────────────────────────────────────────────────────

function log(level: "debug" | "info" | "warn" | "error", msg: string, data?: any): void {
  if (level === "debug" && !DEBUG_MODE) return;
  const timestamp = new Date().toISOString();
  const prefix = `[ashar-api][${level.toUpperCase()}]`;
  if (data !== undefined) {
    console.error(`${timestamp} ${prefix} ${msg}`, data);
  } else {
    console.error(`${timestamp} ${prefix} ${msg}`);
  }
}

// ── Request Tracing ───────────────────────────────────────────────────────────

let _requestSeq = 0;
function nextRequestId(): string {
  _requestSeq += 1;
  return `req_${Date.now().toString(36)}_${_requestSeq.toString(36)}`;
}

// ── CaaS Legacy API Key Generator ─────────────────────────────────────────────

let _cachedCaaSKey: string | null = null;
let _cachedCaaSKeyExpiresAt: number = 0;

/**
 * The CaaS HeaderAuthGuard expects a "legacy API key" in the format:
 *   base64url(header).base64url(payload).base64url(HMAC-SHA256(header.payload, secret))
 *
 * If CAAS_API_KEY is already in `xxx.yyy.zzz` format (contains 2 dots), it's
 * treated as a pre-generated key and used directly. Otherwise it's treated as
 * the HMAC secret and a key is generated on the fly, cached for 23h.
 */
export function getCaaSAuthHeader(): string {
  if (CAAS_API_KEY.split(".").length === 3) {
    return CAAS_API_KEY;
  }

  const now = Date.now();
  if (_cachedCaaSKey && now < _cachedCaaSKeyExpiresAt) {
    return _cachedCaaSKey;
  }

  if (!CAAS_API_KEY) {
    return "";
  }

  const header = Buffer.from(
    JSON.stringify({ alg: "HS256", typ: "JWT" }),
  ).toString("base64url");

  const exp = Math.floor(now / 1000) + 86400; // 24h from now
  const payload = Buffer.from(
    JSON.stringify({ sub: "ashar-mcp", role: "admin", exp }),
  ).toString("base64url");

  const signature = crypto
    .createHmac("sha256", CAAS_API_KEY)
    .update(`${header}.${payload}`)
    .digest("base64")
    .replace(/=+/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");

  _cachedCaaSKey = `${header}.${payload}.${signature}`;
  _cachedCaaSKeyExpiresAt = exp * 1000 - 3600_000;

  return _cachedCaaSKey;
}

// ── Structured Error ──────────────────────────────────────────────────────────

export interface ApiErrorDetail {
  code: ErrorCode;
  message: string;
  status?: number;
  requestId?: string;
  retryable: boolean;
  suggestion?: string;
}

export class AsharApiError extends Error {
  status: number;
  body: any;
  code: ErrorCode;
  requestId?: string;

  constructor(detail: ApiErrorDetail) {
    super(detail.message);
    this.name = "AsharApiError";
    this.status = detail.status ?? 0;
    this.code = detail.code;
    this.requestId = detail.requestId;
    this.body = detail;
  }
}

export function classifyNetworkError(err: Error): ApiErrorDetail {
  const msg = err.message.toLowerCase();
  if (msg.includes("timeout") || msg.includes("abort") || msg.includes("aborted")) {
    return { code: ErrorCode.TIMEOUT, message: err.message, retryable: true, suggestion: "A API demorou a responder. Tente novamente." };
  }
  if (msg.includes("fetch failed") || msg.includes("econnrefused") || msg.includes("enotfound") || msg.includes("dns")) {
    return { code: ErrorCode.NETWORK_ERROR, message: err.message, retryable: true, suggestion: "Falha na rede ao conectar na API. Verifique sua conexao." };
  }
  return { code: ErrorCode.UNKNOWN, message: err.message, retryable: false };
}

// ── Core Request with Retry ───────────────────────────────────────────────────

async function requestWithRetry<T>(
  method: "GET" | "POST" | "PUT" | "DELETE",
  path: string,
  body?: Record<string, unknown>,
  apiKey?: string,
  baseUrl: string = API_BASE_URL,
  extraHeaders: Record<string, string> = {},
): Promise<T> {
  const requestId = nextRequestId();
  const url = `${baseUrl.replace(/\/+$/, "")}${path}`;
  const startTime = Date.now();

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Accept: "application/json",
    "X-Request-Id": requestId,
    ...extraHeaders,
  };

  // Auth
  const key = apiKey || DEFAULT_API_KEY;
  if (key && !headers["x-api-key"]) {
    headers["x-api-key"] = key;
  }

  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      log("debug", `[${requestId}] ${method} ${url} (attempt ${attempt}/${MAX_RETRIES})`);

      const res = await fetch(url, {
        method,
        headers,
        body: body ? JSON.stringify(body) : undefined,
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });

      const elapsed = Date.now() - startTime;
      const data: any = await res.json().catch(() => null);

      if (res.ok) {
        log("debug", `[${requestId}] ${res.status} OK (${elapsed}ms)`);
        return data as T;
      }

      // Non-OK response
      const errorDetail: ApiErrorDetail = {
        code: httpStatusToErrorCode(res.status),
        message: data?.error || data?.message || `HTTP ${res.status}`,
        status: res.status,
        requestId,
        retryable: RETRYABLE_STATUSES.has(res.status),
      };

      log("warn", `[${requestId}] ${res.status} FAILED (${elapsed}ms): ${errorDetail.message}`, {
        attempt,
        retryable: errorDetail.retryable,
      });

      // Don't retry non-retryable errors (4xx except 408/429)
      if (!errorDetail.retryable) {
        throw new AsharApiError(errorDetail);
      }

      lastError = new AsharApiError(errorDetail);

    } catch (err: any) {
      if (err instanceof AsharApiError) {
        lastError = err;
        if (!err.code || !RETRYABLE_STATUSES.has(err.status)) {
          throw err;
        }
      } else {
        // Network error — always retry
        const detail = classifyNetworkError(err);
        detail.requestId = requestId;
        lastError = new AsharApiError(detail);
        log("warn", `[${requestId}] network error (attempt ${attempt}/${MAX_RETRIES}): ${err.message}`);
      }
    }

    // Exponential backoff before retry
    if (attempt < MAX_RETRIES) {
      const delay = RETRY_BASE_DELAY_MS * Math.pow(2, attempt - 1);
      log("debug", `[${requestId}] retrying in ${delay}ms...`);
      await new Promise((r) => setTimeout(r, delay));
    }
  }

  // Exhausted retries
  const elapsed = Date.now() - startTime;
  log("error", `[${requestId}] exhausted ${MAX_RETRIES} retries after ${elapsed}ms`);
  throw lastError || new AsharApiError({
    code: ErrorCode.UNKNOWN,
    message: "Request failed after all retries",
    requestId,
    retryable: false,
  });
}

export function httpStatusToErrorCode(status: number): ErrorCode {
  switch (status) {
    case 400: return ErrorCode.VALIDATION_ERROR;
    case 401: return ErrorCode.AUTH_FAILED;
    case 403: return ErrorCode.ACCESS_DENIED;
    case 404: return ErrorCode.NOT_FOUND;
    case 429: return ErrorCode.RATE_LIMITED;
    default:
      if (status >= 500) return ErrorCode.UPSTREAM_ERROR;
      return ErrorCode.UNKNOWN;
  }
}

// ── Convenience wrappers ──────────────────────────────────────────────────────

async function request<T>(
  method: "GET" | "POST" | "PUT" | "DELETE",
  path: string,
  body?: Record<string, unknown>,
  apiKey?: string,
): Promise<T> {
  return requestWithRetry<T>(method, path, body, apiKey, API_BASE_URL);
}

async function caasRequest<T>(
  method: "GET" | "POST" | "PUT" | "DELETE",
  path: string,
  body?: Record<string, unknown>,
): Promise<T> {
  const authKey = getCaaSAuthHeader();
  const extraHeaders: Record<string, string> = {};
  if (authKey) {
    extraHeaders["x-api-key"] = authKey;
  }
  return requestWithRetry<T>(method, path, body, undefined, CAAS_API_URL, extraHeaders);
}

// ── Public API ─────────────────────────────────────────────────────────────────

/** Get user balances (BRL, USD, EUR, USDT, USDC). */
export async function getBalances(apiKey?: string): Promise<Record<string, number>> {
  const data = await request<any>("GET", "/api/banking/balance", undefined, apiKey);
  return {
    brl: Number(data.brl?.balance ?? 0),
    usd: Number(data.usd?.balance ?? 0),
    eur: Number(data.eur?.balance ?? 0),
    usdt: Number(data.usdt?.balance ?? 0),
    usdc: Number(data.usdc?.balance ?? 0),
  };
}

// ── Wallet Composition (Notus + Management + CaaS) ─────────────────────────────

/** Normaliza a chain para minusculo e resolve o provider correspondente. */
export function resolveProvider(chain: string): "notus" | "blindpay" | "alchemy" {
  return CHAIN_PROVIDER[String(chain || "").toLowerCase()] ?? "blindpay";
}

/** List custody deposit addresses / smart accounts of the user (Notus + BlindPay). */
export async function listCustodyAddresses(apiKey?: string): Promise<any[]> {
  const data = await request<any>("GET", "/api/custody/addresses", undefined, apiKey);
  if (Array.isArray(data)) return data;
  return Array.isArray(data?.addresses) ? data.addresses : [];
}

/** List supported chain/asset pairs (composicao de carteiras disponivel). */
export async function getSupportedPairs(apiKey?: string): Promise<any[]> {
  const data = await request<any>("GET", "/api/custody/supported-pairs", undefined, apiKey);
  if (Array.isArray(data)) return data;
  return Array.isArray(data?.pairs) ? data.pairs : [];
}

/**
 * Compose a full wallet view: virtual balances (Management VirtualLedger) +
 * custody addresses/smart accounts (CaaS via Notus/BlindPay).
 */
export async function getWalletComposition(apiKey?: string): Promise<{
  balances: Record<string, number>;
  addresses: any[];
}> {
  const [balances, addresses] = await Promise.all([
    getBalances(apiKey).catch(() => ({ brl: 0, usd: 0, eur: 0, usdt: 0, usdc: 0 })),
    listCustodyAddresses(apiKey).catch(() => []),
  ]);
  return { balances, addresses };
}

// ── Exchange Rate / Quote ──────────────────────────────────────────────────────

/** Get mid-market exchange rate for a currency pair (BRL, USD, EUR, USDT, USDC). */
export async function getExchangeRate(
  from: string,
  to: string,
  apiKey?: string,
): Promise<{ rate: number; spreadPct: number; source: string }> {
  const f = from.toUpperCase();
  const t = to.toUpperCase();

  if (f === t) return { rate: 1, spreadPct: 0, source: "spot" };

  if (f === "EUR" || t === "EUR") {
    const prices = await getPrices(apiKey);
    const usdPerFrom = f === "EUR" ? (prices.EUR ?? 1.07) : (prices[f] ?? 1);
    const usdPerTo = t === "EUR" ? (prices.EUR ?? 1.07) : (prices[t] ?? 1);
    if (usdPerTo === 0) throw new Error(`Preco USD de ${t} e zero`);
    return {
      rate: Math.round((usdPerFrom / usdPerTo) * 1e8) / 1e8,
      spreadPct: 0,
      source: "prices-cross-rate",
    };
  }

  const data = await request<any>(
    "GET",
    `/api/exchange-rate?from=${encodeURIComponent(f)}&to=${encodeURIComponent(t)}`,
    undefined,
    apiKey,
  );
  return {
    rate: Number(data?.rate ?? 0),
    spreadPct: Number(data?.spreadPct ?? 0),
    source: data?.source ?? "OKX",
  };
}

/** Get USD prices for all supported currencies. */
export async function getPrices(apiKey?: string): Promise<Record<string, number>> {
  return request<Record<string, number>>("GET", "/api/prices", undefined, apiKey);
}

/** Create a BRL PIX deposit charge. */
export async function createBrlDeposit(amountBrl: number, apiKey?: string): Promise<any> {
  return request<any>("POST", "/api/banking/pix/deposit", { amount: amountBrl }, apiKey);
}

/** Poll BRL PIX deposit status. */
export async function getBrlDepositStatus(txid: string, apiKey?: string): Promise<any> {
  return request<any>("GET", `/api/banking/pix/deposit/${encodeURIComponent(txid)}`, undefined, apiKey);
}

/** List BRL PIX deposits. */
export async function listBrlDeposits(limit: number = 30, apiKey?: string): Promise<any[]> {
  const data = await request<any>("GET", `/api/banking/pix/deposits?limit=${limit}`, undefined, apiKey);
  return Array.isArray(data) ? data : [];
}

/** Create a virtual swap (conversion) request. */
export async function createConversion(
  params: {
    fromCurrency: string;
    toCurrency: string;
    amountFrom: number;
    amountToEstimate?: number;
  },
  apiKey?: string,
): Promise<any> {
  return request<any>("POST", "/api/virtual-swap-requests", {
    fromCurrency: params.fromCurrency,
    toCurrency: params.toCurrency,
    amountFrom: params.amountFrom,
    amountToEstimate: params.amountToEstimate ?? null,
  }, apiKey);
}

/** Create a crypto withdrawal. */
export async function createCryptoWithdrawal(
  params: {
    asset: string;
    chain: string;
    amount: number;
    destinationAddress: string;
    externalId?: string;
  },
  apiKey?: string,
): Promise<any> {
  return request<any>("POST", "/api/crypto-withdrawals", {
    chain: params.chain,
    asset: params.asset,
    amount: params.amount,
    destinationAddress: params.destinationAddress,
    externalId: params.externalId,
  }, apiKey);
}

/** Check crypto withdrawal status by externalId. */
export async function getCryptoWithdrawalStatus(externalId: string, apiKey?: string): Promise<any> {
  return request<any>(
    "GET",
    `/api/crypto-withdrawals/${encodeURIComponent(externalId)}`,
    undefined,
    apiKey,
  );
}

/** List crypto withdrawal history. */
export async function listCryptoWithdrawals(
  options: { limit?: number; asset?: string } = {},
  apiKey?: string,
): Promise<any[]> {
  const limit = options.limit || 30;
  const params = new URLSearchParams();
  params.set("limit", String(Math.min(limit, 50)));
  params.set("category", "withdrawal");
  if (options.asset) params.set("currency", options.asset);
  const data = await request<any>(
    "GET",
    `/api/mobile/activity?${params.toString()}`,
    undefined,
    apiKey,
  );
  const entries = Array.isArray(data?.data) ? data.data : Array.isArray(data) ? data : [];
  return entries.filter((e: any) => e.type === "CRYPTO_WITHDRAWAL");
}

/** Generate a crypto deposit address via management (resolves user from api_key and proxies to CaaS). */
export async function getCryptoDepositAddress(
  asset: string,
  chain: string,
  apiKey?: string,
): Promise<any> {
  return request<any>("POST", "/api/ashar/deposits/crypto/address", { asset, chain }, apiKey);
}

// ── Bank Accounts CRUD ─────────────────────────────────────────────────────────

export async function listBankAccounts(apiKey?: string): Promise<any[]> {
  return request<any>("GET", "/api/banking/accounts", undefined, apiKey);
}

export async function createBankAccount(
  data: {
    label: string;
    country: string;
    currency: string;
    accountType: string;
    beneficiary: string;
    document?: string;
    bankName?: string;
    branchCode?: string;
    accountNumber?: string;
    routingCode?: string;
    swift?: string;
    iban?: string;
    pixKey?: string;
    pixKeyType?: string;
  },
  apiKey?: string,
): Promise<any> {
  return request<any>("POST", "/api/banking/accounts", data as Record<string, unknown>, apiKey);
}

export async function updateBankAccount(id: string, data: Record<string, unknown>, apiKey?: string): Promise<any> {
  return request<any>("PUT", `/api/banking/accounts/${encodeURIComponent(id)}`, data, apiKey);
}

export async function deleteBankAccount(id: string, apiKey?: string): Promise<any> {
  return request<any>("DELETE", `/api/banking/accounts/${encodeURIComponent(id)}`, undefined, apiKey);
}

// ── Fiat Remittance (Withdrawal) ───────────────────────────────────────────────

export async function listRemittances(apiKey?: string): Promise<any[]> {
  return request<any>("GET", "/api/banking/remittances", undefined, apiKey);
}

export async function createRemittance(
  data: {
    amount: number;
    sourceCurrency: string;
    targetCurrency: string;
    rate?: number;
    spreadPct?: number;
    receivedForeign?: number;
    beneficiaryId?: string;
    beneficiaryName?: string;
    bankName?: string;
    accountType?: string;
    iban?: string;
    swift?: string;
  },
  apiKey?: string,
): Promise<any> {
  return request<any>("POST", "/api/banking/remittances", {
    amountBrl: data.amount,
    sourceCurrency: data.sourceCurrency,
    targetCurrency: data.targetCurrency,
    rate: data.rate ?? null,
    spreadPct: data.spreadPct ?? null,
    spreadCostBrl: data.spreadPct ? (data.amount * data.spreadPct) / 100 : null,
    receivedForeign: data.receivedForeign ?? null,
    beneficiaryId: data.beneficiaryId ?? null,
    beneficiaryName: data.beneficiaryName ?? null,
    bankName: data.bankName ?? null,
    accountType: data.accountType ?? null,
    iban: data.iban ?? null,
    swift: data.swift ?? null,
  }, apiKey);
}

// ── Webhooks ───────────────────────────────────────────────────────────────────

export async function listWebhooks(apiKey?: string): Promise<any[]> {
  return request<any>("GET", "/api/webhooks", undefined, apiKey);
}

export async function createWebhook(
  data: { label: string; url: string; events?: string },
  apiKey?: string,
): Promise<any> {
  return request<any>("POST", "/api/webhooks", data as Record<string, unknown>, apiKey);
}

export async function deleteWebhook(id: string, apiKey?: string): Promise<any> {
  return request<any>("DELETE", `/api/webhooks/${encodeURIComponent(id)}`, undefined, apiKey);
}

export async function testWebhook(id: string, apiKey?: string): Promise<any> {
  return request<any>("POST", `/api/webhooks/${encodeURIComponent(id)}/test`, undefined, apiKey);
}

// ── Health Check ───────────────────────────────────────────────────────────────

/** Quick connectivity test to the management API. */
export async function healthCheck(): Promise<{ ok: boolean; latencyMs: number; error?: string }> {
  const start = Date.now();
  try {
    const data = await requestWithRetry<any>("GET", "/api/prices", undefined, DEFAULT_API_KEY, API_BASE_URL);
    return { ok: true, latencyMs: Date.now() - start };
  } catch (err: any) {
    return { ok: false, latencyMs: Date.now() - start, error: err.message };
  }
}

// ── Error Handler ─────────────────────────────────────────────────────────────

/**
 * Translate an API/network error into a user-friendly Portuguese message
 * with actionable suggestions.
 */
export function handleApiError(error: unknown): string {
  if (error instanceof AsharApiError) {
    const detail = error.body as ApiErrorDetail | undefined;
    const suggestion = detail?.suggestion ? `\n💡 ${detail.suggestion}` : "";

    switch (error.code) {
      case ErrorCode.AUTH_FAILED:
        return `Erro de autenticacao: API key invalida ou expirada. Verifique se ASHAR_API_KEY esta configurada corretamente.${suggestion}`;
      case ErrorCode.ACCESS_DENIED:
        return `Erro: Acesso negado. Sua conta nao tem permissao para esta operacao.${suggestion}`;
      case ErrorCode.VALIDATION_ERROR:
        return `Erro de validacao: ${error.message}. Verifique os parametros enviados.${suggestion}`;
      case ErrorCode.NOT_FOUND:
        return `Recurso nao encontrado: ${error.message}. Verifique o ID informado.${suggestion}`;
      case ErrorCode.RATE_LIMITED:
        return `Limite de requisicoes excedido. Aguarde alguns segundos e tente novamente.${suggestion}`;
      case ErrorCode.TIMEOUT:
        return `Timeout: a API Ashar demorou para responder (>${TIMEOUT_MS / 1000}s). Tente novamente.${suggestion}`;
      case ErrorCode.NETWORK_ERROR:
        return `Erro de rede ao conectar na API Ashar. Verifique sua conexao com a internet. Se o problema persistir, a API pode estar indisponivel.${suggestion}`;
      case ErrorCode.UPSTREAM_ERROR:
        return `Erro interno na API Ashar (${error.status}). Tente novamente em instantes.${suggestion}`;
      default:
        return `Erro da API Ashar (${error.status || "desconhecido"}): ${error.message}${suggestion}`;
    }
  }

  if (error instanceof Error) {
    return `Erro inesperado: ${error.message}`;
  }

  return `Erro inesperado: ${String(error)}`;
}

// ── Diagnostic Info ────────────────────────────────────────────────────────────

/** Gather diagnostic information about the MCP server configuration. */
export function getDiagnostics(): Record<string, unknown> {
  return {
    apiBaseUrl: API_BASE_URL,
    caasApiUrl: CAAS_API_URL,
    hasApiKey: Boolean(DEFAULT_API_KEY),
    hasCaasKey: Boolean(CAAS_API_KEY),
    timeoutMs: TIMEOUT_MS,
    maxRetries: MAX_RETRIES,
    debugMode: DEBUG_MODE,
    defaultApiKeyHint: DEFAULT_API_KEY ? `${DEFAULT_API_KEY.substring(0, 8)}...` : "not set",
  };
}
