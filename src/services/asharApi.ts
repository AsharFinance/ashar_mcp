/**
 * Ashar Finance API Client
 *
 * Encapsulates all HTTP calls to the Ashar management backend.
 * Authentication is done via x-api-key header.
 */

import crypto from "crypto";
import { CHAIN_PROVIDER } from "../constants.js";

const API_BASE_URL = process.env.ASHAR_API_URL || "https://api.ashar.finance";

const CAAS_API_URL = process.env.CAAS_API_URL || "https://api-assets.up.railway.app";

/** Server-level fallback key. Prefer per-request apiKey for user isolation. */
const DEFAULT_API_KEY = process.env.ASHAR_API_KEY || "";

/** Server-level CaaS HMAC secret or pre-generated legacy API key (for custody operations). */
const CAAS_API_KEY = process.env.CAAS_API_KEY || "";

// ── CaaS Legacy API Key Generator ──────────────────────────────────────────

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
function getCaaSAuthHeader(): string {
  // Already a pre-generated legacy key (format: header.payload.signature)
  if (CAAS_API_KEY.split(".").length === 3) {
    return CAAS_API_KEY;
  }

  // Check cache (keys valid for 23 hours, regenerate with 1h buffer)
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
    JSON.stringify({
      sub: "ashar-mcp",
      role: "admin",
      exp,
    }),
  ).toString("base64url");

  const signature = crypto
    .createHmac("sha256", CAAS_API_KEY)
    .update(`${header}.${payload}`)
    .digest("base64")
    .replace(/=+/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");

  _cachedCaaSKey = `${header}.${payload}.${signature}`;
  _cachedCaaSKeyExpiresAt = exp * 1000 - 3600_000; // regenerate 1h before expiry

  return _cachedCaaSKey;
}

export class AsharApiError extends Error {
  status: number;
  body: any;

  constructor(message: string, status: number, body?: any) {
    super(message);
    this.name = "AsharApiError";
    this.status = status;
    this.body = body;
  }
}

async function request<T>(
  method: "GET" | "POST" | "PUT" | "DELETE",
  path: string,
  body?: Record<string, unknown>,
  apiKey?: string,
): Promise<T> {
  const url = `${API_BASE_URL.replace(/\/+$/, "")}${path}`;

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Accept: "application/json",
  };

  const key = apiKey || DEFAULT_API_KEY;
  if (key) {
    headers["x-api-key"] = key;
  }

  const res = await fetch(url, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(30_000),
  });

  const data: any = await res.json().catch(() => null);

  if (!res.ok) {
    throw new AsharApiError(
      data?.error || data?.message || `HTTP ${res.status}`,
      res.status,
      data,
    );
  }

  return data as T;
}

/** CaaS-specific request (for custody/deposit-address operations). */
async function caasRequest<T>(
  method: "GET" | "POST" | "PUT" | "DELETE",
  path: string,
  body?: Record<string, unknown>,
): Promise<T> {
  const url = `${CAAS_API_URL.replace(/\/+$/, "")}${path}`;

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Accept: "application/json",
  };

  const authKey = getCaaSAuthHeader();
  if (authKey) {
    headers["x-api-key"] = authKey;
  }

  const res = await fetch(url, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(30_000),
  });

  const data: any = await res.json().catch(() => null);

  if (!res.ok) {
    throw new AsharApiError(
      data?.error || data?.message || `CaaS HTTP ${res.status}`,
      res.status,
      data,
    );
  }

  return data as T;
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

  // Same currency
  if (f === t) return { rate: 1, spreadPct: 0, source: "spot" };

  // EUR pairs: backend /api/exchange-rate does not support EUR.
  // Fallback: compute cross-rate via /api/prices (all prices in USD).
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

  // Non-EUR pairs: use direct /api/exchange-rate endpoint
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
  // direction is now auto-inferred by the API — no need to send it.
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

/** List crypto withdrawal history (via unified activity feed, filtered to crypto withdrawals). */
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
  // Filter to only crypto withdrawals (type === CRYPTO_WITHDRAWAL)
  return entries.filter((e: any) => e.type === "CRYPTO_WITHDRAWAL");
}

/** Get custody deposit address for crypto deposits via CaaS. */
/** Generate a crypto deposit address via management (resolves user from api_key and proxies to CaaS). */
export async function getCryptoDepositAddress(
  asset: string,
  chain: string,
  apiKey?: string,
): Promise<any> {
  return request<any>("POST", "/api/ashar/deposits/crypto/address", {
    asset,
    chain,
  }, apiKey);
}

// ── Bank Accounts CRUD ─────────────────────────────────────────────────────────

/** List user bank accounts. */
export async function listBankAccounts(apiKey?: string): Promise<any[]> {
  return request<any>("GET", "/api/banking/accounts", undefined, apiKey);
}

/** Create a bank account (receiver). */
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

/** Update a bank account. */
export async function updateBankAccount(id: string, data: Record<string, unknown>, apiKey?: string): Promise<any> {
  return request<any>("PUT", `/api/banking/accounts/${encodeURIComponent(id)}`, data, apiKey);
}

/** Delete a bank account. */
export async function deleteBankAccount(id: string, apiKey?: string): Promise<any> {
  return request<any>("DELETE", `/api/banking/accounts/${encodeURIComponent(id)}`, undefined, apiKey);
}

// ── Fiat Remittance (Withdrawal) ───────────────────────────────────────────────

/** List user remittance (fiat withdrawal) orders. */
export async function listRemittances(apiKey?: string): Promise<any[]> {
  return request<any>("GET", "/api/banking/remittances", undefined, apiKey);
}

/** Create a fiat withdrawal (remittance order). */
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

/** List user webhooks. */
export async function listWebhooks(apiKey?: string): Promise<any[]> {
  return request<any>("GET", "/api/webhooks", undefined, apiKey);
}

/** Create a webhook. */
export async function createWebhook(
  data: { label: string; url: string; events?: string },
  apiKey?: string,
): Promise<any> {
  return request<any>("POST", "/api/webhooks", data as Record<string, unknown>, apiKey);
}

/** Delete a webhook. */
export async function deleteWebhook(id: string, apiKey?: string): Promise<any> {
  return request<any>("DELETE", `/api/webhooks/${encodeURIComponent(id)}`, undefined, apiKey);
}

/** Test a webhook by sending a ping event. */
export async function testWebhook(id: string, apiKey?: string): Promise<any> {
  return request<any>("POST", `/api/webhooks/${encodeURIComponent(id)}/test`, undefined, apiKey);
}

/** Handle API errors consistently. */
export function handleApiError(error: unknown): string {
  if (error instanceof AsharApiError) {
    switch (error.status) {
      case 400:
        return `Erro de validacao: ${error.message}. Verifique os parametros enviados.`;
      case 401:
        return "Erro: Nao autenticado. Verifique se ASHAR_API_KEY esta configurada corretamente.";
      case 403:
        return "Erro: Acesso negado. Voce nao tem permissao para esta operacao.";
      case 404:
        return `Erro: Recurso nao encontrado. Verifique o ID informado.`;
      case 429:
        return "Erro: Limite de requisicoes excedido. Aguarde antes de tentar novamente.";
      default:
        return `Erro da API Ashar (HTTP ${error.status}): ${error.message}`;
    }
  }

  if (error instanceof Error) {
    if (error.message.includes("timeout") || error.message.includes("abort")) {
      return "Erro: Timeout ao comunicar com a API Ashar. Tente novamente.";
    }
    return `Erro inesperado: ${error.message}`;
  }

  return `Erro inesperado: ${String(error)}`;
}
