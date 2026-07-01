/**
 * Ashar Finance API Client
 *
 * Encapsulates all HTTP calls to the Ashar management backend.
 * Authentication is done via x-api-key header.
 */

const API_BASE_URL = process.env.ASHAR_API_URL || "https://api.ashar.finance";

/** Server-level fallback key. Prefer per-request apiKey for user isolation. */
const DEFAULT_API_KEY = process.env.ASHAR_API_KEY || "";

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
  return request<any>("POST", "/api/banking/virtual-swap-requests", {
    direction: "FIAT_TO_CRYPTO",
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

/** Get custody deposit address for crypto deposits. */
export async function getCryptoDepositAddress(asset: string, chain: string, apiKey?: string): Promise<any> {
  return request<any>("POST", "/api/custody/deposit-address", { asset, chain }, apiKey);
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
